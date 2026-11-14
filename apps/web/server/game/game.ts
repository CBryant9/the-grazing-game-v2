import 'server-only';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  applyAction,
  CLASS_LABELS,
  EDGE,
  GRID_N,
  GROUPS,
  MARKET_CLASSES,
  MAX_BUY,
  SALE_CLASSES,
  SUPPLEMENTS,
  areaIdOf,
  createFarm,
  endDay,
  getEdge,
  loadFarm,
  marketView,
  previewAction,
  saveFarm,
  skipDays,
  surveyOf,
  thingsToDo,
  type Action,
  type CattleClassId,
  type CreateFarmOptions,
  type EdgeRef,
  type FarmEvent,
  type FarmState,
  type GroupId,
  type JobCard,
  type SourceEnv,
  type Supplement,
} from '@gg/engine';
import { loadRealData } from '@gg/engine/server';
import { FARM_GRID_H, FARM_GRID_W } from '@gg/shared';
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
  StaleResponse,
} from '../../lib/game/types';
import { parseBuildAction } from './build';
import { gateNotes, lineWords } from './buildwords';
import { cropLines, parseSow } from './crops';
import { buyLines, cancelLines, sellLines } from './marketwords';
import { buildMobs } from './mobs';
import { moveNotes } from './mobwords';
import { parsePlanAction, planLines } from './plans';
import { buildSnapshot, buildSummary } from './snapshot';
import {
  BrokenFarmError,
  DONE_KEPT,
  FileFarmStore,
  STORED_FORMAT,
  upgradeStored,
  type DoneRequest,
  type FarmStore,
  type StoredFarm,
} from './store';
import { dateText, doneWord, todoKey } from './words';
import { join } from 'node:path';

/** A refusal the route turns into a plain message with this status. Never carries a stack. */
export class GameError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 413 | 503,
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

/**
 * Farm files the server keeps at most. A new farm is refused once there are
 * this many, after farms not used for `FARM_STALE_DAYS` are removed, so the
 * disk can not fill (milestone 1.7f).
 */
export const MAX_FARMS = 10_000;
/** A farm not used for this many days is removed. The session cookie lasts 90 days. */
export const FARM_STALE_DAYS = 90;
/** How often, at most, stale farms are looked for when a farm is made. */
const PRUNE_EVERY_MS = 6 * 3600_000;

/** What the player reads when the farm they were looking at has changed. */
export const STALE_MESSAGE = 'The farm has changed since this was shown. Here is the latest.';
/** What the player reads when their farm can not be opened. */
export const BROKEN_MESSAGE =
  'Your farm could not be opened. Try again, or start a new farm. The old farm is kept aside.';

/** A new farm version: a short random string, so an old one never comes back. */
const newVersion = (): string => randomBytes(6).toString('hex');
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

/** What an act request carries beyond the job: the farm it was shown on, and its one-use id. */
export interface ActMeta {
  /** The farm version the card was made on. Left out only by code on the server (tests). */
  version?: string;
  /** Made by the browser for each Confirm. A repeat gets the same answer. */
  requestId?: string;
}

export interface GameServerOptions {
  store: FarmStore;
  /** Where each new farm's seed comes from. Random unless a test sets it. */
  seed?: () => number;
  /** The most farms kept. `MAX_FARMS` unless a test sets it. */
  maxFarms?: number;
  /** The clock, in ms. The real one unless a test sets it. */
  now?: () => number;
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

const SELL_GROUPS: readonly string[] = ['steer', 'heifer', 'heiferP', 'cowP', 'cowE', 'bull'];
const MOVE_PICKS_MAX = 20;
const HEAD_MAX = 100_000;

/**
 * Check an action the browser named. Only simple actions are allowed for
 * now; the engine checks the rest. A sale booked for a mob names the mob
 * only: the server finds the booked animals from the farm.
 */
export function parseAction(body: unknown, farm?: FarmState): Action | null {
  if (typeof body !== 'object' || body === null) return null;
  const a = body as Record<string, unknown>;
  const mob = int(a.mob, 1, 1e6);
  switch (a.type) {
    case 'sellGroup': {
      const qty = int(a.qty, 1, HEAD_MAX);
      if (mob === null || qty === null || !SELL_GROUPS.includes(a.group as string)) return null;
      return { type: 'sellGroup', mob, group: a.group as GroupId, qty };
    }
    case 'sellClass': {
      const qty = int(a.qty, 1, HEAD_MAX);
      if (qty === null || typeof a.cls !== 'string' || !Object.hasOwn(MARKET_CLASSES, a.cls)) {
        return null;
      }
      return { type: 'sellClass', cls: a.cls as keyof typeof MARKET_CLASSES, qty };
    }
    case 'buyCattle': {
      const qty = int(a.qty, 1, MAX_BUY);
      if (qty === null || typeof a.cls !== 'string' || !Object.hasOwn(SALE_CLASSES, a.cls)) {
        return null;
      }
      // In the game cattle come to the stock yards, so there is no place to name.
      return { type: 'buyCattle', cls: a.cls as keyof typeof SALE_CLASSES, qty };
    }
    case 'setPlan':
    case 'resumePlan':
      return parsePlanAction(a);
    case 'sow':
      return parseSow(a);
    case 'setSupplement':
      if (mob === null || !SUPPLEMENTS.includes(a.supp as Supplement)) return null;
      return { type: 'setSupplement', mob, supp: a.supp as Supplement };
    case 'cancelSale': {
      const m = farm?.mobs.find((x) => x.id === mob);
      if (!farm || !m) return null;
      const booked = new Set<number>();
      for (const b of farm.saleBookings) for (const id of b.animalIds) booked.add(id);
      const ids = m.animals.filter((x) => booked.has(x.id)).map((x) => x.id);
      return ids.length ? { type: 'cancelSale', ids } : null;
    }
    case 'moveCattle': {
      const cell = int(a.cell, 0, GRID_N - 1);
      if (cell === null || !Array.isArray(a.picks)) return null;
      if (a.picks.length < 1 || a.picks.length > MOVE_PICKS_MAX) return null;
      const picks: { mob: number; cls: CattleClassId; qty: number }[] = [];
      for (const raw of a.picks as unknown[]) {
        const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
        const pm = int(p.mob, 1, 1e6);
        const qty = int(p.qty, 1, HEAD_MAX);
        if (pm === null || qty === null) return null;
        if (typeof p.cls !== 'string' || !Object.hasOwn(CLASS_LABELS, p.cls)) return null;
        picks.push({ mob: pm, cls: p.cls as CattleClassId, qty });
      }
      return { type: 'moveCattle', picks, to: { cell } };
    }
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
      return parseBuildAction(a);
  }
}

/** The squares on the two sides of a fence segment. -1 where the side is off the farm. */
function sidesOf(e: EdgeRef): [number, number] {
  if (e.line === 'h') {
    const vy = Math.floor(e.index / FARM_GRID_W);
    return [vy > 0 ? e.index - FARM_GRID_W : -1, vy < FARM_GRID_H ? e.index : -1];
  }
  const y = Math.floor(e.index / (FARM_GRID_W + 1));
  const vx = e.index % (FARM_GRID_W + 1);
  const row = y * FARM_GRID_W;
  return [vx > 0 ? row + vx - 1 : -1, vx < FARM_GRID_W ? row + vx : -1];
}

/**
 * What a gate does: which paddocks it joins, and that the mobs in them join
 * if both hold stock. Read from the farm as it stands before the job.
 */
export function gateNotesFor(farm: FarmState, action: Action): string[] {
  if (action.type !== 'placeGate' && action.type !== 'setGate') return [];
  const [a, b] = sidesOf(action.edge);
  if (a < 0 || b < 0) return [];
  const survey = surveyOf(farm);
  const topo = survey.topology;
  const nameOf = (cell: number): string =>
    topo.paddocks.find((p) => p.id === topo.paddockOf[cell])?.name ?? 'the paddock';
  const holds = (cell: number): boolean =>
    farm.mobs.some((m) => m.where.kind === 'paddock' && areaIdOf(survey, m) === topo.areaOf[cell]);
  const was = getEdge(farm.layout.fences, action.edge);
  const kind =
    action.type === 'placeGate'
      ? 'place'
      : action.open
        ? was === EDGE.gateOpen
          ? 'none'
          : 'open'
        : 'shut';
  return gateNotes(kind, nameOf(a), nameOf(b), holds(a) && holds(b));
}

/**
 * What a move will do, as plain notes: a paddock with no water, and a mob
 * already in it (the two join, one mob to a paddock). Read from the farm as
 * it stands before the move.
 */
export function moveNotesFor(farm: FarmState, action: Action): string[] {
  if (action.type !== 'moveMob' && action.type !== 'moveCattle') return [];
  if (typeof action.to !== 'object') return [];
  const survey = surveyOf(farm);
  const areaId = survey.topology.areaOf[action.to.cell];
  const area = areaId === undefined ? undefined : survey.topology.areas[areaId];
  if (areaId === undefined || !area) return [];
  const moving = new Set(action.type === 'moveMob' ? [action.mob] : action.picks.map((p) => p.mob));
  const others = farm.mobs
    .filter(
      (m) => m.where.kind === 'paddock' && areaIdOf(survey, m) === areaId && !moving.has(m.id),
    )
    .map((m) => ({ name: m.name, head: m.animals.filter((a) => a.kind !== 'calf').length }));
  return moveNotes(area.name, survey.points.areaTroughs[areaId]!.length > 0, others);
}

/** What a job card carries beyond the engine's own: notes, a daily price, and the ready-made lines of a market, plan or crop job. */
interface Extras {
  notes: string[];
  perDay: number | null;
  summary: string[];
}

const noExtras: Extras = { notes: [], perDay: null, summary: [] };

function cardWire(card: JobCard, extra: Extras = noExtras): JobCardWire {
  const notes: string[] = [...extra.notes];
  const perDay = extra.perDay;
  // A market job says all this in its own lines.
  if (card.booking && extra.summary.length === 0) {
    const b = card.booking;
    notes.push(
      `${b.head} head are booked onto the sale on ${dateText(b.date)}. Nothing is paid today. The price is set on the sale day.`,
    );
  }
  if (card.arrival && extra.summary.length === 0) {
    notes.push(
      `${card.arrival.head} head arrive in the stock yards at first light on ${dateText(card.arrival.date)}.`,
    );
  }
  if (card.action === 'markCalves') {
    notes.push('Marking covers every bull calf and young bull in the mob that is not marked yet.');
  }
  if (card.notToday) notes.push(card.notToday.message);
  let line: JobCardWire['line'] = null;
  if (card.line) {
    const wire = (p: NonNullable<JobCard['line']>['fits']) => ({
      edges: p.pieces.flatMap((x) =>
        'edge' in x ? [{ line: x.edge.line, index: x.edge.index }] : [],
      ),
      cells: p.pieces.flatMap((x) => ('cell' in x ? [x.cell] : [])),
      metres: Math.round(p.metres),
    });
    const fits = wire(card.line.fits);
    const doesNotFit = wire(card.line.doesNotFit);
    line = { fits, doesNotFit, words: lineWords(fits.metres, doesNotFit.metres) };
  }
  return {
    action: card.action,
    outcome: card.outcome,
    workMin: Math.round(card.workMin),
    leftAfterMin: Math.round(card.leftAfterMin),
    usesRestOfDay: card.usesRestOfDay,
    fitsToday: card.fitsToday,
    cost: Math.round(card.cost),
    costToday: Math.round(card.costToday),
    perDay,
    notes,
    ...(extra.summary.length ? { summary: extra.summary } : {}),
    line,
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
  private readonly maxFarms: number;
  private readonly now: () => number;

  constructor(options: GameServerOptions) {
    this.store = options.store;
    this.seed = options.seed ?? (() => randomInt(1, 2 ** 31 - 1));
    this.maxFarms = options.maxFarms ?? MAX_FARMS;
    this.now = options.now ?? Date.now;
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
    const raw = await this.store.get(farmId);
    if (raw === null || raw === undefined) return null;
    let held: Held;
    try {
      const stored = upgradeStored(raw, newVersion);
      held = { stored, farm: loadFarm(stored.saved) };
    } catch (e) {
      throw e instanceof BrokenFarmError ? e : new BrokenFarmError('The save would not load.');
    }
    await this.store.touch(farmId);
    this.remember(farmId, held);
    return held;
  }

  /** The farm, or a plain refusal when there is none or it can't be opened. */
  private async need(farmId: string): Promise<Held> {
    let held: Held | null;
    try {
      held = await this.load(farmId);
    } catch (e) {
      if (e instanceof BrokenFarmError) throw new GameError(409, BROKEN_MESSAGE);
      throw e;
    }
    if (!held) throw new GameError(404, 'There is no farm yet. Set one up first.');
    return held;
  }

  /** Keep a changed farm: it gets a new version. `done` is the act request to remember, if any. */
  private async save(
    farmId: string,
    held: Held,
    farm: FarmState,
    done?: DoneRequest,
  ): Promise<Held> {
    const stored: StoredFarm = {
      ...held.stored,
      saved: saveFarm(farm),
      version: newVersion(),
      done: done ? [...held.stored.done, done].slice(-DONE_KEPT) : held.stored.done,
    };
    await this.store.put(farmId, stored);
    const next = { stored, farm };
    this.remember(farmId, next);
    return next;
  }

  /** Remember an act request that changed nothing (a refusal), so a repeat gets the same answer. */
  private async note(farmId: string, held: Held, done: DoneRequest): Promise<void> {
    const stored: StoredFarm = {
      ...held.stored,
      done: [...held.stored.done, done].slice(-DONE_KEPT),
    };
    await this.store.put(farmId, stored);
    this.remember(farmId, { stored, farm: held.farm });
  }

  private snapshotOf(held: Held): Snapshot {
    return buildSnapshot(held.farm, held.stored, envFor(held.stored.setup));
  }

  /** The answer when the browser was looking at an older farm: the plain message and the latest snapshot. */
  private stale(held: Held): StaleResponse {
    return { ok: false, reason: 'stale', message: STALE_MESSAGE, snapshot: this.snapshotOf(held) };
  }

  /**
   * The farm for this session: its snapshot, null if it has none, or
   * `broken` when it is there and can't be opened.
   */
  async snapshot(sessionId: string): Promise<Snapshot | null>;
  async snapshot(sessionId: string, report: true): Promise<Snapshot | null | 'broken'>;
  async snapshot(sessionId: string, report = false): Promise<Snapshot | null | 'broken'> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      try {
        const held = await this.load(id);
        return held ? this.snapshotOf(held) : null;
      } catch (e) {
        if (e instanceof BrokenFarmError && report) return 'broken';
        if (e instanceof BrokenFarmError) throw new GameError(409, BROKEN_MESSAGE);
        throw e;
      }
    });
  }

  private lastPrune = 0;

  /**
   * Room for one more farm: stale farms go every few hours, and when the
   * store is full. Still full, a new farm is refused with a plain message.
   */
  private async makeRoom(): Promise<void> {
    const now = this.now();
    const before = now - FARM_STALE_DAYS * 86_400_000;
    if (now - this.lastPrune >= PRUNE_EVERY_MS) {
      this.lastPrune = now;
      await this.store.prune(before);
    }
    if ((await this.store.count()) < this.maxFarms) return;
    await this.store.prune(before);
    if ((await this.store.count()) >= this.maxFarms) {
      throw new GameError(503, 'The game is full right now. Try again later.');
    }
  }

  /** Start the session's farm from the setup choices. A session has one farm. */
  async create(sessionId: string, choices: SetupChoices): Promise<Snapshot> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      let there: Held | null;
      try {
        there = await this.load(id);
      } catch (e) {
        if (e instanceof BrokenFarmError) throw new GameError(409, BROKEN_MESSAGE);
        throw e;
      }
      if (there) {
        throw new GameError(409, 'You already have a farm. Start a new one from the farm screen.');
      }
      await this.makeRoom();
      const farm = createFarm(createOptions(choices, this.seed()), envFor(choices));
      const stored: StoredFarm = {
        format: STORED_FORMAT,
        name: choices.name,
        setup: choices,
        saved: saveFarm(farm),
        version: newVersion(),
        done: [],
      };
      await this.store.put(id, stored);
      const held = { stored, farm };
      this.remember(id, held);
      return this.snapshotOf(held);
    });
  }

  /**
   * Throw the session's farm away, so it can start another. A farm that
   * can't be opened is kept aside under another name, not deleted.
   */
  async remove(sessionId: string): Promise<void> {
    const id = farmIdFor(sessionId);
    await this.locked(id, async () => {
      this.cache.delete(id);
      try {
        await this.load(id);
      } catch (e) {
        if (!(e instanceof BrokenFarmError)) throw e;
        this.cache.delete(id);
        await this.store.setAside(id);
        return;
      }
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
    const simple = 'action' in req ? (req.action as SimpleAction) : null;
    const action = simple ? parseAction(simple, farm) : null;
    if (!action) {
      if (simple?.type === 'cancelSale') {
        throw new GameError(409, 'Nothing from this mob is booked onto a sale.');
      }
      throw new GameError(400, 'That job is not one the game can do yet.');
    }
    return action;
  }

  /** The notes and daily price a job card carries beyond the engine's own. */
  private extras(farm: FarmState, stored: StoredFarm, action: Action): Extras {
    if (action.type === 'setSupplement') {
      const market = marketView(farm, envFor(stored.setup));
      const mob = buildMobs(farm, envFor(stored.setup), market).find((m) => m.id === action.mob);
      const option = mob?.suppOptions.find((o) => o.id === action.supp);
      return { notes: [], perDay: option ? option.perDay : null, summary: [] };
    }
    return {
      notes: [...moveNotesFor(farm, action), ...gateNotesFor(farm, action)],
      perDay: null,
      summary: [],
    };
  }

  /**
   * The ready-made lines on a market, plan or crop card: the money, where
   * the stock go and what is left in the bank. The figures are the engine's
   * (the job card, the events); this only puts them in words. `farm` is the
   * farm as it stands before the job. `events` are what the job did, from a
   * trial run (a preview) or the real one.
   */
  private summary(
    farm: FarmState,
    stored: StoredFarm,
    action: Action,
    card: JobCard,
    events: readonly FarmEvent[] | null,
  ): string[] {
    const env = envFor(stored.setup);
    switch (action.type) {
      case 'buyCattle': {
        const c = SALE_CLASSES[action.cls];
        return buyLines({
          qty: action.qty,
          one: c.one,
          label: c.label,
          total: Math.round(card.cost),
          cashBefore: Math.round(farm.cash),
          units: 'calf' in c,
        });
      }
      case 'sellClass':
      case 'sellGroup': {
        const sold = events?.find((e) => e.type === 'cattle-sold');
        const what =
          action.type === 'sellClass'
            ? MARKET_CLASSES[action.cls].toLowerCase()
            : `${GROUPS[action.group].name.toLowerCase()} from ${farm.mobs.find((m) => m.id === action.mob)?.name ?? 'the mob'}`;
        if (sold?.type === 'cattle-sold') {
          return sellLines({
            head: sold.head,
            calves: sold.calvesAtFoot,
            what,
            today: true,
            net: Math.round(sold.net),
            cashBefore: Math.round(farm.cash),
            sale: null,
          });
        }
        const b = card.booking;
        if (b) {
          return sellLines({
            head: b.head,
            calves: b.calvesAtFoot,
            what,
            today: false,
            net: 0,
            cashBefore: Math.round(farm.cash),
            sale: { date: b.date, daysAway: b.daysAway },
          });
        }
        return [];
      }
      case 'cancelSale': {
        const e = events?.find((x) => x.type === 'sale-cancelled');
        return e?.type === 'sale-cancelled' ? cancelLines(e.head, { date: e.saleDate }) : [];
      }
      case 'sow':
      case 'harvest':
        return cropLines(farm, env, action);
      case 'setPlan':
      case 'resumePlan':
        return planLines(farm, action, card);
      default:
        return [];
    }
  }

  /** Sell and cancel cards need the head the engine would sell: a trial run of the job gives them. */
  private trialEvents(farm: FarmState, stored: StoredFarm, action: Action): FarmEvent[] | null {
    if (
      action.type !== 'sellClass' &&
      action.type !== 'sellGroup' &&
      action.type !== 'cancelSale'
    ) {
      return null;
    }
    const trial = applyAction(farm, action, envFor(stored.setup));
    return trial.ok ? trial.events : null;
  }

  /** The job card for an action: time, cost and light left. Nothing changes. */
  async preview(sessionId: string, req: ActionRequest): Promise<PreviewResponse> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      const { farm, stored } = await this.need(id);
      const action = this.resolve(farm, req);
      const version = stored.version;
      const result = previewAction(farm, action, envFor(stored.setup));
      if (!result.ok) {
        return { ok: false, reason: result.reason, message: result.message, version };
      }
      const x = this.extras(farm, stored, action);
      x.summary = this.summary(
        farm,
        stored,
        action,
        result.card,
        this.trialEvents(farm, stored, action),
      );
      return { ok: true, card: cardWire(result.card, x), version };
    });
  }

  /**
   * Do an action. A refusal says why in plain words, and nothing changes.
   *
   * A request id seen before gets the answer it got then, and nothing runs
   * again (a double click, or a retry after a lost reply). A version that is
   * not the farm's (another tab, or a card shown before a change) is refused
   * with the latest snapshot.
   */
  async act(sessionId: string, req: ActionRequest, meta: ActMeta = {}): Promise<ActResponse> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      const held = await this.need(id);
      const seen = meta.requestId
        ? held.stored.done.find((d) => d.id === meta.requestId)
        : undefined;
      if (seen) {
        const snapshot = this.snapshotOf(held);
        return seen.ok
          ? { ok: true, message: seen.message, card: seen.card, snapshot, repeat: true }
          : {
              ok: false,
              reason: seen.reason ?? 'refused',
              message: seen.message,
              snapshot,
              repeat: true,
            };
      }
      if (meta.version !== undefined && meta.version !== held.stored.version) {
        return this.stale(held);
      }
      const action = this.resolve(held.farm, req);
      const x = this.extras(held.farm, held.stored, action);
      const result = applyAction(held.farm, action, envFor(held.stored.setup));
      if (!result.ok) {
        if (meta.requestId) {
          await this.note(id, held, {
            id: meta.requestId,
            ok: false,
            reason: result.reason,
            message: result.message,
            card: null,
          });
        }
        return {
          ok: false,
          reason: result.reason,
          message: result.message,
          snapshot: this.snapshotOf(held),
        };
      }
      if (result.job) {
        x.summary = this.summary(held.farm, held.stored, action, result.job, result.events);
      }
      const message = doneWord(result.events);
      const card = result.job ? cardWire(result.job, x) : null;
      const next = await this.save(
        id,
        held,
        result.farm,
        meta.requestId ? { id: meta.requestId, ok: true, message, card } : undefined,
      );
      return { ok: true, message, card, snapshot: this.snapshotOf(next) };
    });
  }

  /** The player has opened the inbox: every message up to this number is read. */
  async markRead(sessionId: string, upTo: number): Promise<Snapshot> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      const held = await this.need(id);
      const newest = held.farm.inbox.reduce((m, x) => Math.max(m, x.seq), 0);
      // Never past the newest message there is, and never backwards.
      const to = Math.max(held.stored.inboxRead ?? 0, Math.min(upTo, newest));
      if (to === (held.stored.inboxRead ?? 0)) return this.snapshotOf(held);
      const stored: StoredFarm = { ...held.stored, inboxRead: to };
      await this.store.put(id, stored);
      const next = { stored, farm: held.farm };
      this.remember(id, next);
      return this.snapshotOf(next);
    });
  }

  /** Next day: the daily tick runs and the new day starts at first light. */
  async endDay(sessionId: string): Promise<DayResponse>;
  async endDay(sessionId: string, version: string): Promise<DayResponse | StaleResponse>;
  async endDay(sessionId: string, version?: string): Promise<DayResponse | StaleResponse> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      const held = await this.need(id);
      if (version !== undefined && version !== held.stored.version) return this.stale(held);
      const end = endDay(held.farm, envFor(held.stored.setup));
      const next = await this.save(id, held, end.farm);
      return {
        ok: true,
        snapshot: this.snapshotOf(next),
        summary: buildSummary('day', end.summary, end.stops, 1, end.day.events),
      };
    });
  }

  /** Skip a week, a month or a year. It stops early for the reasons the engine gives. */
  async skip(sessionId: string, length: SkipRequestLength, anyway?: boolean): Promise<DayResponse>;
  async skip(
    sessionId: string,
    length: SkipRequestLength,
    anyway: boolean,
    version: string,
  ): Promise<DayResponse | StaleResponse>;
  async skip(
    sessionId: string,
    length: SkipRequestLength,
    anyway = false,
    version?: string,
  ): Promise<DayResponse | StaleResponse> {
    const id = farmIdFor(sessionId);
    return this.locked(id, async () => {
      const held = await this.need(id);
      if (version !== undefined && version !== held.stored.version) return this.stale(held);
      const result = skipDays(held.farm, length, envFor(held.stored.setup), { anyway });
      const next = result.daysRun > 0 ? await this.save(id, held, result.farm) : held;
      return {
        ok: true,
        snapshot: this.snapshotOf(next),
        summary: buildSummary(
          'skip',
          result.summary,
          result.stops,
          result.asked,
          result.days.flatMap((d) => d.events),
        ),
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
