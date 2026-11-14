import 'server-only';
import { createHash, randomInt } from 'node:crypto';
import {
  applyAction,
  GRID_N,
  createFarm,
  endDay,
  loadFarm,
  previewAction,
  saveFarm,
  skipDays,
  thingsToDo,
  type Action,
  type CreateFarmOptions,
  type FarmState,
  type JobCard,
  type SourceEnv,
} from '@gg/engine';
import { loadRealData } from '@gg/engine/server';
import type {
  ActionRequest,
  ActResponse,
  DayResponse,
  JobCardWire,
  PreviewResponse,
  SetupChoices,
  SimpleAction,
  SkipRequestLength,
  Snapshot,
} from '../../lib/game/types';
import { buildSnapshot, buildSummary } from './snapshot';
import { FileFarmStore, type FarmStore, type StoredFarm } from './store';
import { dateText, doneWord, todoKey } from './words';
import { join } from 'node:path';

/** A refusal the route turns into a plain message with this status. Never carries a stack. */
export class GameError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** Farms start on the 1st of this month (0 is January): September, as the first game did. */
export const START_MONTH = 8;
/** The year a random-seasons farm starts in. */
export const RANDOM_START_YEAR = 2026;
const CACHE_LIMIT = 64;
const SESSION = /^[0-9a-f]{32}$/;

export const isSessionId = (id: unknown): id is string =>
  typeof id === 'string' && SESSION.test(id);

/**
 * A farm's id comes from the session id by a one-way hash, so the id on
 * disk never reveals the cookie, and one session can only reach its own.
 */
export function farmIdFor(sessionId: string): string {
  if (!isSessionId(sessionId)) throw new GameError(400, 'That session is not valid.');
  return createHash('sha256').update(`gg-farm:${sessionId}`).digest('hex').slice(0, 32);
}

interface Held {
  stored: StoredFarm;
  farm: FarmState;
}

export interface GameServerOptions {
  store: FarmStore;
  /** Where each new farm's seed comes from. Random unless a test sets it. */
  seed?: () => number;
}

const realYears = (c: SetupChoices): boolean => c.years !== 'random';

function createOptions(c: SetupChoices, seed: number): CreateFarmOptions {
  const years: CreateFarmOptions['years'] =
    c.years === 'random'
      ? { kind: 'random' }
      : { kind: 'real', order: c.years === 'real-in-order' ? 'in-order' : 'random' };
  return {
    seed,
    district: c.district,
    size: c.size,
    start: realYears(c) ? { month: START_MONTH } : { year: RANDOM_START_YEAR, month: START_MONTH },
    years,
    startType: c.startType,
    mixed:
      c.enterprise === 'mixed'
        ? { arablePct: c.arablePct ?? 0, croppedPct: c.croppedPct ?? 0 }
        : undefined,
    difficulty: c.difficulty,
  };
}

/** Real years need the real tables. A random-seasons farm never reads them. */
const envFor = (c: SetupChoices): SourceEnv => (realYears(c) ? { data: loadRealData() } : {});

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;

/** Check an action the browser named. Only simple actions are allowed for now; the engine checks the rest. */
export function parseAction(body: unknown): Action | null {
  if (typeof body !== 'object' || body === null) return null;
  const a = body as Record<string, unknown>;
  const mob = int(a.mob, 1, 1e6);
  switch (a.type) {
    case 'markCalves':
    case 'wean':
    case 'pausePlan':
    case 'clearPlan':
      return mob === null ? null : ({ type: a.type, mob } as Action);
    case 'moveMob': {
      const cell = int(a.cell, 0, GRID_N - 1);
      return mob === null || cell === null ? null : { type: 'moveMob', mob, to: { cell } };
    }
    case 'harvest': {
      const field = int(a.field, 0, 1e6);
      return field === null ? null : { type: 'harvest', field };
    }
    case 'refillPortable': {
      const port = int(a.port, 0, 1e6);
      return port === null ? null : { type: 'refillPortable', port };
    }
    default:
      return null;
  }
}

function cardWire(card: JobCard): JobCardWire {
  const notes: string[] = [];
  if (card.booking) {
    const b = card.booking;
    notes.push(
      `${b.head} head are booked onto the sale on ${dateText(b.date)}. Nothing is paid today. The price is set on the sale day.`,
    );
  }
  if (card.arrival) {
    notes.push(
      `${card.arrival.head} head arrive in the stock yards at first light on ${dateText(card.arrival.date)}.`,
    );
  }
  if (card.plan) {
    for (const area of card.plan.dryAreas) notes.push(`${area} has no water.`);
    for (const j of card.plan.joins) {
      notes.push(`${j.mobName} (${j.head} head) is in ${j.area}. The two mobs will join.`);
    }
  }
  if (card.notToday) notes.push(card.notToday.message);
  return {
    action: card.action,
    outcome: card.outcome,
    workMin: Math.round(card.workMin),
    leftAfterMin: Math.round(card.leftAfterMin),
    usesRestOfDay: card.usesRestOfDay,
    fitsToday: card.fitsToday,
    cost: Math.round(card.cost),
    costToday: Math.round(card.costToday),
    notes,
  };
}

/**
 * The game server: owns farms, keeps them, and answers with snapshots.
 *
 * Every call takes a session id and nothing the browser could use to name
 * another player's farm. The browser names an action only. The server
 * loads the farm, asks the engine, and saves.
 */
export class GameServer {
  private readonly store: FarmStore;
  private readonly seed: () => number;
  private readonly cache = new Map<string, Held>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(options: GameServerOptions) {
    this.store = options.store;
    this.seed = options.seed ?? (() => randomInt(1, 2 ** 31 - 1));
  }

  /** Run one thing at a time for a farm, so two quick taps never save over each other. */
  private async locked<T>(farmId: string, run: () => Promise<T>): Promise<T> {
    const before = this.queues.get(farmId) ?? Promise.resolve();
    const next = before.catch(() => undefined).then(run);
    this.queues.set(farmId, next);
    try {
      return await next;
    } finally {
      if (this.queues.get(farmId) === next) this.queues.delete(farmId);
    }
  }

  private remember(farmId: string, held: Held): void {
    this.cache.delete(farmId);
    this.cache.set(farmId, held);
    if (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  private async load(farmId: string): Promise<Held | null> {
    const hit = this.cache.get(farmId);
    if (hit) return hit;
    const stored = await this.store.get(farmId);
    if (!stored) return null;
    const held = { stored, farm: loadFarm(stored.saved) };
    this.remember(farmId, held);
    return held;
  }

  private async need(farmId: string): Promise<Held> {
    const held = await this.load(farmId);
    if (!held) throw new GameError(404, 'There is no farm yet. Set one up first.');
    return held;
  }

  private async save(farmId: string, held: Held, farm: FarmState): Promise<Held> {
    const stored: StoredFarm = { ...held.stored, saved: saveFarm(farm) };
    await this.store.put(farmId, stored);
    const next = { stored, farm };
    this.remember(farmId, next);
    return next;
  }

  private snapshotOf(held: Held): Snapshot {
    return buildSnapshot(held.farm, held.stored, envFor(held.stored.setup));
  }

  /** The farm for this session, or null if it has none. */
  async snapshot(sessionId: string): Promise<Snapshot | null> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      const held = await this.load(id);
      return held ? this.snapshotOf(held) : null;
    });
  }

  /** Start the session's farm from the setup choices. A session has one farm. */
  async create(sessionId: string, choices: SetupChoices): Promise<Snapshot> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      if (await this.load(id)) {
        throw new GameError(409, 'You already have a farm. Start a new one from the farm screen.');
      }
      const farm = createFarm(createOptions(choices, this.seed()), envFor(choices));
      const stored: StoredFarm = { name: choices.name, setup: choices, saved: saveFarm(farm) };
      await this.store.put(id, stored);
      const held = { stored, farm };
      this.remember(id, held);
      return this.snapshotOf(held);
    });
  }

  /** Throw the session's farm away, so it can start another. */
  async remove(sessionId: string): Promise<void> {
    const id = farmIdFor(sessionId);
    await this.locked(id, async () => {
      this.cache.delete(id);
      await this.store.delete(id);
    });
  }

  private resolve(farm: FarmState, req: ActionRequest): Action {
    if ('todo' in req) {
      if (typeof req.todo !== 'string' || req.todo.length > 40) {
        throw new GameError(400, 'That job was not sent properly.');
      }
      const item = thingsToDo(farm).find((t) => todoKey(t) === req.todo);
      if (!item) throw new GameError(409, 'That is not on the list any more.');
      if (!item.action) {
        throw new GameError(
          400,
          'This one needs a paddock chosen first. Open the paddock to do it.',
        );
      }
      return item.action;
    }
    const action = 'action' in req ? parseAction(req.action as SimpleAction) : null;
    if (!action) throw new GameError(400, 'That job is not one the game can do yet.');
    return action;
  }

  /** The job card for an action: time, cost and light left. Nothing changes. */
  async preview(sessionId: string, req: ActionRequest): Promise<PreviewResponse> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      const { farm, stored } = await this.need(id);
      const result = previewAction(farm, this.resolve(farm, req), envFor(stored.setup));
      if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
      return { ok: true, card: cardWire(result.card) };
    });
  }

  /** Do an action. A refusal says why in plain words, and nothing changes. */
  async act(sessionId: string, req: ActionRequest): Promise<ActResponse> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      const held = await this.need(id);
      const result = applyAction(
        held.farm,
        this.resolve(held.farm, req),
        envFor(held.stored.setup),
      );
      if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
      const next = await this.save(id, held, result.farm);
      return {
        ok: true,
        message: doneWord(result.events),
        card: result.job ? cardWire(result.job) : null,
        snapshot: this.snapshotOf(next),
      };
    });
  }

  /** Next day: the daily tick runs and the new day starts at first light. */
  async endDay(sessionId: string): Promise<DayResponse> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      const held = await this.need(id);
      const end = endDay(held.farm, envFor(held.stored.setup));
      const next = await this.save(id, held, end.farm);
      return {
        snapshot: this.snapshotOf(next),
        summary: buildSummary('day', end.summary, end.stops, 1),
      };
    });
  }

  /** Skip a week, a month or a year. It stops early for the reasons the engine gives. */
  async skip(sessionId: string, length: SkipRequestLength, anyway = false): Promise<DayResponse> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      const held = await this.need(id);
      const result = skipDays(held.farm, length, envFor(held.stored.setup), { anyway });
      const next = result.daysRun > 0 ? await this.save(id, held, result.farm) : held;
      return {
        snapshot: this.snapshotOf(next),
        summary: buildSummary('skip', result.summary, result.stops, result.asked),
      };
    });
  }
}

let shared: GameServer | undefined;

declare global {
  var __ggGameServer: GameServer | undefined;
}

/**
 * The one game server for this process. Farms are files under `.farms` in
 * the app's folder (git ignores it), or under GG_FARMS_DIR.
 */
export function gameServer(): GameServer {
  // Kept on globalThis so a dev reload does not lose the cache.
  shared ??= globalThis.__ggGameServer ??= new GameServer({
    store: new FileFarmStore(process.env.GG_FARMS_DIR ?? join(process.cwd(), '.farms')),
  });
  return shared;
}
