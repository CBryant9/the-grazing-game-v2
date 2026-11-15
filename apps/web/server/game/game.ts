import { logFailure } from './../logging';
import 'server-only';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  applyAction,
  CLASS_LABELS,
  EDGE,
  GRID_N,
  MARKET_CLASSES,
  MAX_BUY,
  SALE_CLASSES,
  SUPPLEMENTS,
  areaIdOf,
  areaWatered,
  createFarm,
  endDay,
  getEdge,
  loadFarm,
  portableRefund,
  previewAction,
  saveFarm,
  sheepDistrict,
  sheepMobsOf,
  skipDays,
  surveyOf,
  thingsToDo,
  type Action,
  type CattleClassId,
  type CreateFarmOptions,
  type EdgeRef,
  type FarmEvent,
  dateOn,
  type FarmState,
  type GroupId,
  LABOUR,
  type JobCard,
  type SourceEnv,
  type Supplement,
  type TickEvent,
} from '@gg/engine';
import { loadRealData } from '@gg/engine/server';
import { FARM_GRID_H, FARM_GRID_W } from '@gg/shared';
import type {
  ActionRequest,
  ActResponse,
  DayResponse,
  FarmListItem,
  JobCardWire,
  PastDayWire,
  PreviewResponse,
  RecordResponse,
  SetupChoices,
  SimpleAction,
  SkipRequestLength,
  Snapshot,
  StaleResponse,
} from '../../lib/game/types';
import { parseBuildAction } from './build';
import { parseLabourAction } from './labour';
import {
  fenceMaterialsNotes,
  gateNotes,
  lineWords,
  materialsKeptNotes,
  refundNote,
} from './buildwords';
import { cropLines, parseSow } from './crops';
import {
  cancelLines as cancelContractLines,
  contractLines,
  handsNotes,
  payFrom,
  hireLines,
  letGoLines,
  reportWire,
  teamOptions,
  type DateOf,
} from './labourwords';
import { buyLines, cancelLines, saleClassLabel, sellLines } from './marketwords';
import { suppPerDay } from './mobs';
import { GROUP_NAME, lostWaterNote, moveNotes } from './mobwords';
import { parsePlanAction, planLines } from './plans';
import { diaryPage, fileLines, periodFilings, type Filing } from './diary';
import { buildSnapshot, buildSummary, dateParts } from './snapshot';
import {
  BrokenFarmError,
  DONE_KEPT,
  FarmLimitError,
  SaveConflictError,
  STORED_FORMAT,
  StoreUnavailableError,
  upgradeStored,
  type ActionLogEntry,
  type DoneRequest,
  type FarmFacts,
  type FarmStore,
  type Owner,
  type StoredFarm,
} from './store';
import { setupOptions } from './setup';
import {
  fenceRuleNotes,
  isSheepAction,
  parseSheepAction,
  refusalWords,
  sheepFeedPerDay,
  sheepMarketLines,
  sheepMoveNotes,
} from './sheepacts';
import { sheepShown } from './snapshot';
import { sheepSwitchOn } from './switches';
import { configuredStore } from '../db/farmstore';
import { nightOf } from '../daily/advance';
import { addDays, daysBetween, isoOf, isSupportedZone, localDate, longDate } from '../daily/clock';
import type { DailyData } from '../daily/data';
import { AWAY_KEPT, ROLLED_KEPT, type DailyStored } from '../daily/state';
import { dailyRuntime } from '../daily/runtime';
import { MIDNIGHT_TEXT, PAUSED_TEXT, UNAVAILABLE_TEXT, dailyWire } from '../daily/wire';
import { dateText, doneWord, todoKey } from './words';
import { pastYears, soFarView, yearView } from './years';

/**
 * The farm days a pay day was missed in a day or skip, one for each hand left
 * unpaid, dated from the run's own first-light events. Pay days fall every
 * pay cycle from the one the farm was waiting for (`firstPayDay`). In the
 * stream of first-light events each pay day that paid anyone ends in
 * `wages-paid`, and a miss comes before it, so the number of those already
 * seen says which pay day a miss was. The inbox is not read: it is capped,
 * and a long skip rolls it over.
 */
export function missedDays(
  farm: FarmState,
  firstPayDay: number | null,
  dawn: readonly FarmEvent[],
): number[] {
  const days: number[] = [];
  let paidDays = 0;
  for (const e of dawn) {
    if (e.type === 'wages-paid') paidDays++;
    else if (e.type === 'wages-missed') {
      const day =
        firstPayDay === null ? farm.day : firstPayDay + paidDays * LABOUR.payCycleDays.value;
      days.push(Math.min(day, farm.day));
    }
  }
  return days;
}

/** A refusal the route turns into a plain message with this status. Never carries a stack. */
export class GameError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503,
    message: string,
    /** A short word the browser can act on (for example `save_failed`), beside the plain message. */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** What the player reads when a save did not go through, after the retries. */
export const SAVE_FAILED_MESSAGE =
  'That was not saved, so nothing on your farm has changed. Try again in a moment.';
/** What the player reads when the farm can not be reached right now. Nothing is lost. */
export const UNREACHABLE_MESSAGE =
  'Your farm could not be reached just now. Nothing has been lost. Try again in a moment.';
/** What the player reads when the account has no room for another farm. */
export const NO_ROOM_MESSAGE =
  'You already have the most farms this account can have. Delete one first, or open one you have.';

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
/** What the player reads when they ask for a day or a skip on a farm that is over. */
export const OVER_MESSAGE = 'The game is over on this farm. Start a new farm to play again.';
/** What the player reads when their farm can not be opened. */
export const BROKEN_MESSAGE =
  'Your farm could not be opened. Try again, or start a new farm. The old farm is kept aside.';

/** A new farm version: a short random string, so an old one never comes back. */
const newVersion = (): string => randomBytes(6).toString('hex');
const SESSION = /^[0-9a-f]{32}$/;
const FARM_KEY = /^farm:[0-9a-f]{32}$/;

/** The key the routes give the game server for an account's farm. */
export const farmKey = (farmId: string): string => `farm:${farmId}`;

export const isSessionId = (id: unknown): id is string =>
  typeof id === 'string' && SESSION.test(id);

/**
 * A farm's id comes from the session id by a one-way hash, so the id on
 * disk never reveals the cookie, and one session can only reach its own.
 */
export function farmIdFor(sessionId: string): string {
  // An account's farm is named directly: `farm:` and its 32-hex id (the server checked it is theirs).
  if (FARM_KEY.test(sessionId)) return sessionId.slice(5);
  if (!isSessionId(sessionId)) throw new GameError(400, 'That session is not valid.');
  return createHash('sha256').update(`gg-farm:${sessionId}`).digest('hex').slice(0, 32);
}

/** The part of a day's snapshot that is kept for "see the farm on a past day". */
function pastOf(snap: Snapshot): PastDayWire {
  return {
    version: 1,
    day: snap.day,
    date: snap.date,
    season: snap.season,
    view: snap.view,
    paddocks: snap.paddocks,
  };
}

interface Held {
  stored: StoredFarm;
  farm: FarmState;
  /** The snapshot of this farm as it stands, built once. */
  snap?: Snapshot;
  /** The sheep switch the snapshot was built with: it is built again when the switch changes. */
  snapSheep?: boolean;
  /** A Daily Farm that could not catch up to today yet, and why (milestone 3.3). Null or left out when it is on today. */
  waiting?: string | null;
}

/**
 * What a Daily Farm needs from outside the game server (milestone 3.3): the real weather and
 * prices, and the feature switch. Left out, no Daily Farm can start or be rolled.
 */
export interface DailyRuntime {
  data: DailyData;
  /** Is Daily Farm switched on? */
  enabled(): Promise<boolean>;
}

/** What the player reads when Daily Farm is not open yet. */
export const COMING_MESSAGE = 'Daily Farm is coming. Fast Farm is ready to play now.';
/** What the player reads when a guest asks for a Daily Farm. */
export const DAILY_NEEDS_ACCOUNT =
  'Daily Farm needs an account, so the farm is kept for you from day to day. Sign in to start one.';
/** What the player reads when their time zone is not one Daily Farm supports. */
export const dailyZoneMessage = (zone: unknown): string =>
  `Daily Farm runs on Australian and New Zealand time zones, and ${typeof zone === 'string' && zone.length <= 40 ? `"${zone}"` : 'your device’s time zone'} is not one of them yet. Fast Farm has no time zone.`;
/** What the player reads when they ask Next day or a skip on a Daily Farm. */
export const DAILY_NO_SKIP = 'Daily Farm has no Next day or skip. The day ends at midnight.';

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
  /** Waits (ms) between the tries of a save that fails. One more try for each. Tests set zeros. */
  saveRetryMs?: readonly number[];
  /** The sheep switch (milestone 2.8). The admin's switch unless a test sets it. */
  sheepOn?: () => Promise<boolean>;
  /** The weather, prices and switch Daily Farm runs on (milestone 3.3). */
  daily?: DailyRuntime;
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
    stock: c.stock ?? 'cattle',
    mixed:
      c.enterprise === 'mixed'
        ? { arablePct: c.arablePct ?? 0, croppedPct: c.croppedPct ?? 0 }
        : undefined,
    difficulty: c.difficulty,
  };
}

/** Real years need the real tables. A random-seasons farm never reads them. */
/**
 * The data a Daily Farm runs on is the baked tables with the days kept since (server/daily/data.ts).
 * It is set for the farm's setup object each time the farm is loaded, and read back here.
 */
const dailyEnvs = new WeakMap<object, SourceEnv>();

const envFor = (c: SetupChoices): SourceEnv => {
  if (c.mode === 'daily') {
    const env = dailyEnvs.get(c);
    if (!env)
      throw new GameError(503, 'Daily Farm is not available right now. Try again in a moment.');
    return env;
  }
  return realYears(c) ? { data: loadRealData() } : {};
};

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
  // Sheep jobs, and moves named by a sheep mob (milestone 2.8).
  const sheep = parseSheepAction(a, farm);
  if (sheep === false) return null;
  if (sheep) return sheep;
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
    case 'planMove':
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
    case 'hireHand':
    case 'letHandGo':
    case 'orderContractFence':
    case 'cancelContractFence':
      return parseLabourAction(a, farm);
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
  return moveNotes(area.name, areaWatered(survey.points, areaId), others);
}

/** Jobs that take water away from where it was: a hub or a trough taken out or moved. */
const WATER_JOBS = new Set<Action['type']>([
  'removeHub',
  'moveHub',
  'removeSquareHub',
  'moveSquareHub',
  'removeTrough',
  'moveTrough',
  'removePortable',
  'movePortable',
]);

/**
 * Mobs that have water now and would have none after a water job, found by
 * a trial run of the job on a copy. A fact on the card; the job is not
 * blocked.
 */
export function waterLossNotesFor(farm: FarmState, action: Action, env: SourceEnv): string[] {
  if (!WATER_JOBS.has(action.type)) return [];
  const trial = applyAction(farm, action, env);
  if (!trial.ok) return [];
  const before = surveyOf(farm);
  const after = surveyOf(trial.farm);
  const notes: string[] = [];
  for (const m of farm.mobs) {
    if (m.where.kind !== 'paddock') continue;
    const was = areaIdOf(before, m);
    if (was < 0 || !areaWatered(before.points, was)) continue;
    const t = trial.farm.mobs.find((x) => x.id === m.id);
    if (!t || t.where.kind !== 'paddock') continue;
    const now = areaIdOf(after, t);
    if (now < 0 || areaWatered(after.points, now)) continue;
    notes.push(lostWaterNote(m.name, after.topology.areas[now]?.name ?? null));
  }
  return notes;
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
  if (card.fenceMaterials) notes.push(...fenceMaterialsNotes(card.fenceMaterials));
  if (card.materialsKept) notes.push(...materialsKeptNotes(card.materialsKept));
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
  private readonly retryMs: readonly number[];
  private readonly touched = new Map<string, number>();
  private readonly sheepSwitch: () => Promise<boolean>;
  /** The sheep switch as last read, at the start of each call. */
  private sheepOn = false;
  private readonly daily: DailyRuntime | undefined;

  constructor(options: GameServerOptions) {
    this.sheepSwitch = options.sheepOn ?? sheepSwitchOn;
    this.daily = options.daily;
    this.retryMs = options.saveRetryMs ?? [150, 600];
    this.store = options.store;
    this.seed = options.seed ?? (() => randomInt(1, 2 ** 31 - 1));
    this.maxFarms = options.maxFarms ?? MAX_FARMS;
    this.now = options.now ?? Date.now;
  }

  /**
   * The farm id for a key, after the store has agreed the key may reach it. A guest key (a
   * session) reaches only a farm still owned by that guest session: once the farm moves into an
   * account, or the session is converted, the old cookie gets "no farm" for every read, write and
   * delete. This is the store's own owner check, not the cookie being cleared.
   */
  private async idFor(sessionId: string): Promise<string> {
    // Every call that reaches a farm starts here: read the sheep switch once for it.
    try {
      this.sheepOn = await this.sheepSwitch();
    } catch {
      this.sheepOn = false;
    }
    const id = farmIdFor(sessionId);
    if (isSessionId(sessionId) && this.store.guestAccess) {
      if ((await this.store.guestAccess(id, sessionId)) === 'denied') {
        throw new GameError(404, 'There is no farm yet. Set one up first.');
      }
    }
    return id;
  }

  /** False for a guest session whose farm moved into an account (or that was converted): it is finished. */
  async sessionUsable(sessionId: string): Promise<boolean> {
    if (!isSessionId(sessionId) || !this.store.guestAccess) return true;
    return (await this.store.guestAccess(farmIdFor(sessionId), sessionId)) !== 'denied';
  }

  /** Run one thing at a time for a farm, so two quick taps never save over each other. */
  private async locked<T>(
    farmId: string,
    run: () => Promise<T>,
    /** What to answer when the save was refused because the farm had changed under it. */
    onConflict?: () => Promise<T>,
  ): Promise<T> {
    const before = this.queues.get(farmId) ?? Promise.resolve();
    const guarded = async (): Promise<T> => {
      try {
        return await run();
      } catch (e) {
        if (onConflict && e instanceof SaveConflictError) return onConflict();
        throw e;
      }
    };
    const next = before.catch(() => undefined).then(guarded);
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

  /** The farm, brought up to today first if it is a Daily Farm that has days owed (PRD 14.3). */
  private async load(farmId: string): Promise<Held | null> {
    const held = await this.loadRaw(farmId);
    return held && held.stored.daily ? this.bringUp(farmId, held) : held;
  }

  private async loadRaw(farmId: string): Promise<Held | null> {
    const hit = this.cache.get(farmId);
    if (hit) {
      // A store shared by several servers can be changed from another one (or another tab
      // that reached another server). Check the version before trusting what is held.
      // The version and the revision: a write that left the version alone (an inbox read, "opened
      // today") still moved the revision, so a copy that missed it is never trusted.
      if (
        !this.store.version ||
        (await this.store.version(farmId)) === `${hit.stored.version}:${hit.stored.rev ?? 0}`
      ) {
        const last = this.touched.get(farmId) ?? 0;
        if (this.now() - last > 3600_000) {
          this.touched.set(farmId, this.now());
          await this.store.touch(farmId).catch(() => undefined);
        }
        return hit;
      }
      this.cache.delete(farmId);
    }
    let raw: unknown;
    try {
      raw = await this.store.get(farmId);
    } catch (e) {
      if (e instanceof StoreUnavailableError) {
        throw new GameError(503, UNREACHABLE_MESSAGE, 'unavailable');
      }
      throw e;
    }
    if (raw === null || raw === undefined) return null;
    let held: Held;
    try {
      const stored = upgradeStored(raw, newVersion);
      held = { stored, farm: loadFarm(stored.saved) };
    } catch (e) {
      throw e instanceof BrokenFarmError ? e : new BrokenFarmError('The save would not load.');
    }
    // Marking the farm as used is a courtesy. If it fails the player still plays.
    await this.store.touch(farmId).catch(() => undefined);
    this.touched.set(farmId, this.now());
    this.remember(farmId, held);
    return held;
  }

  /**
   * Run a write to the store. A write that fails is tried again after a short
   * wait, twice. A write refused because the farm changed under it is not
   * tried again (the caller reloads). Failing for good, the held copy is
   * dropped and the player is told plainly it was not saved: a job is never
   * reported done before it is stored.
   */
  private async persist(farmId: string, write: () => Promise<void>): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await write();
        return;
      } catch (e) {
        if (e instanceof SaveConflictError || e instanceof FarmLimitError) {
          this.cache.delete(farmId);
          throw e;
        }
        const wait = this.retryMs[attempt];
        if (wait === undefined) {
          this.cache.delete(farmId);
          logFailure({ route: 'game-save', reason: 'save_failed' }, e);
          throw new GameError(503, SAVE_FAILED_MESSAGE, 'save_failed');
        }
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  /** The farm as another tab left it, after a save was refused because it had changed. */
  private async reload(farmId: string): Promise<Held> {
    this.cache.delete(farmId);
    return this.need(farmId);
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
    filings: readonly Filing[] = [],
    missed: readonly number[] = [],
    extra: {
      past?: boolean;
      action?: ActionLogEntry;
      daily?: DailyStored;
      dailyThrough?: string;
    } = {},
  ): Promise<Held> {
    // Pay days missed: only the last year's are kept, for the standing's fact line.
    const before = held.stored.missedWages ?? [];
    const kept = [...before, ...missed].filter((d) => d > farm.day - 365);
    const stored: StoredFarm = {
      ...held.stored,
      saved: saveFarm(farm),
      version: newVersion(),
      rev: (held.stored.rev ?? 0) + 1,
      done: done ? [...held.stored.done, done].slice(-DONE_KEPT) : held.stored.done,
      diary: filings.length ? fileLines(held.stored.diary, filings) : held.stored.diary,
    };
    if (extra.daily) stored.daily = extra.daily;
    if (kept.length) stored.missedWages = kept;
    else delete stored.missedWages;
    const next: Held = { stored, farm };
    const snap = this.snapshotOf(next);
    await this.persist(farmId, () =>
      this.store.put(farmId, stored, {
        expect: held.stored.version,
        expectRev: held.stored.rev ?? 0,
        facts: this.factsOf(stored, snap),
        diaryDays: filings.map((f) => f.day),
        action: extra.action,
        past: extra.past ? pastOf(snap) : undefined,
        dailyThrough: extra.dailyThrough ? { date: extra.dailyThrough, at: this.now() } : undefined,
      }),
    );
    this.remember(farmId, next);
    return next;
  }

  /** What the store keeps beside the save: the facts the database and the farm list show. */
  private factsOf(stored: StoredFarm, snap: Snapshot): FarmFacts {
    return {
      name: stored.name,
      district: stored.setup.district,
      districtName: snap.farm.setup.districtName,
      size: stored.setup.size,
      sizeHa: snap.farm.setup.farmHa,
      enterprise: stored.setup.enterprise,
      startType: stored.setup.startType,
      difficulty: stored.setup.difficulty,
      years: stored.setup.years,
      engineVersion: stored.saved.engineVersion,
      day: snap.day,
      date: snap.date,
      over: snap.over ? snap.over.text : null,
      ...(stored.daily
        ? {
            daily: {
              timezone: stored.daily.timezone,
              simThrough: addDays(isoOf(snap.date), -1),
            },
          }
        : {}),
    };
  }

  /** Remember an act request that changed nothing (a refusal), so a repeat gets the same answer. */
  private async note(
    farmId: string,
    held: Held,
    done: DoneRequest,
    extra?: ActionLogEntry,
  ): Promise<Held> {
    // The version stays: a refused job changed nothing the player was looking at, so a card
    // shown before it is still good. A server holding an older copy only misses that this id
    // was answered, and would answer it the same way (refused) again.
    const stored: StoredFarm = {
      ...held.stored,
      rev: (held.stored.rev ?? 0) + 1,
      done: [...held.stored.done, done].slice(-DONE_KEPT),
    };
    await this.persist(farmId, () =>
      this.store.put(farmId, stored, {
        expect: held.stored.version,
        expectRev: held.stored.rev ?? 0,
        action: extra,
      }),
    );
    const next: Held = { stored, farm: held.farm, snap: held.snap, snapSheep: held.snapSheep };
    this.remember(farmId, next);
    return next;
  }

  private snapshotOf(held: Held): Snapshot {
    if (!held.snap || held.snapSheep !== this.sheepOn) {
      held.snap = buildSnapshot(held.farm, held.stored, envFor(held.stored.setup), this.sheepOn);
      held.snapSheep = this.sheepOn;
    }
    // A Daily Farm's part is made fresh each time: it carries the server's clock.
    return held.stored.daily
      ? {
          ...held.snap,
          daily: dailyWire(held.farm, held.stored.daily, this.now(), held.waiting ?? null),
        }
      : held.snap;
  }

  /**
   * The answer when the browser was looking at an older farm: the plain message and the latest
   * snapshot. On a Daily Farm, a card shown before midnight is told the day ended.
   */
  private stale(held: Held, shownOn?: string): StaleResponse {
    const midnight = shownOn !== undefined && held.stored.daily?.rolledFrom.includes(shownOn);
    return {
      ok: false,
      reason: 'stale',
      message: midnight ? MIDNIGHT_TEXT : STALE_MESSAGE,
      snapshot: this.snapshotOf(held),
    };
  }

  /** A job needs a farm that is on today. A Daily Farm still waiting for yesterday's data can only be looked at. */
  private assertToday(held: Held): void {
    if (held.stored.daily && held.waiting) throw new GameError(409, held.waiting, 'day_not_ready');
  }

  /**
   * The farm for this session: its snapshot, null if it has none, or
   * `broken` when it is there and can't be opened.
   */
  async snapshot(sessionId: string): Promise<Snapshot | null>;
  async snapshot(sessionId: string, report: true): Promise<Snapshot | null | 'broken'>;
  async snapshot(sessionId: string, report = false): Promise<Snapshot | null | 'broken'> {
    const id = await this.idFor(sessionId);
    return this.locked(id, async () => {
      try {
        const held = await this.load(id);
        return held ? this.snapshotOf(await this.markOpened(id, held)) : null;
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
  async create(sessionId: string, choices: SetupChoices, owner?: Owner): Promise<Snapshot> {
    const id = await this.idFor(sessionId);
    const who: Owner | null =
      owner ?? (isSessionId(sessionId) ? { kind: 'guest', session: sessionId } : null);
    if (!who) throw new GameError(400, 'That session is not valid.');
    if (choices.mode === 'daily') return this.createDaily(id, choices, who);
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
      // Sheep only with the switch on, in a sheep district (the route checks this too).
      if (
        (choices.stock ?? 'cattle') !== 'cattle' &&
        !(this.sheepOn && sheepDistrict(choices.district))
      ) {
        throw new GameError(400, 'Sheep are not offered on this farm. Choose cattle.');
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
        diary: [],
      };
      const held: Held = { stored, farm };
      const snap = this.snapshotOf(held);
      try {
        await this.persist(id, () =>
          this.store.create(id, who, stored, this.factsOf(stored, snap)),
        );
      } catch (e) {
        throw e instanceof FarmLimitError ? new GameError(409, NO_ROOM_MESSAGE) : e;
      }
      this.remember(id, held);
      return snap;
    });
  }

  // ---- Daily Farm (milestone 3.3). The day rolls at local midnight in the farm's locked time zone.

  /**
   * Start a Daily Farm. Accounts only, behind the switch, on a zone the game supports, with room
   * for another (all checked before anything is run). The farm starts on today's real date in its
   * own time zone as day 0: the pasture is run up to today the way a Fast Farm's start does it, and
   * the start herd is placed today, so the player's first day is Day 1 with nothing spent and
   * nothing decided for them.
   */
  private async createDaily(id: string, choices: SetupChoices, who: Owner): Promise<Snapshot> {
    if (who.kind !== 'user') throw new GameError(403, DAILY_NEEDS_ACCOUNT, 'daily_needs_account');
    const runtime = this.daily;
    if (!runtime || this.store.kind !== 'db' || !(await runtime.enabled())) {
      throw new GameError(403, COMING_MESSAGE, 'daily_off');
    }
    if (!isSupportedZone(choices.timezone)) {
      throw new GameError(400, dailyZoneMessage(choices.timezone), 'daily_zone');
    }
    if (this.store.hasRoom && !(await this.store.hasRoom(who, 'daily'))) {
      throw new GameError(409, NO_ROOM_MESSAGE);
    }
    const zone = choices.timezone;
    const today = localDate(this.now(), zone);
    return this.locked(id, async () => {
      let there: Held | null;
      try {
        there = await this.loadRaw(id);
      } catch (e) {
        if (e instanceof BrokenFarmError) throw new GameError(409, BROKEN_MESSAGE);
        throw e;
      }
      if (there)
        throw new GameError(409, 'You already have a farm. Start a new one from the farm screen.');
      await this.makeRoom();
      const setup: SetupChoices = {
        ...choices,
        years: 'real-in-order',
        mode: 'daily',
        timezone: zone,
      };
      const [y, m, d] = today.split('-').map(Number);
      const env: SourceEnv = { data: await runtime.data.bundleThrough(today) };
      dailyEnvs.set(setup, env);
      const options = {
        ...createOptions(setup, this.seed()),
        start: { year: y!, month: m! - 1, date: d! },
      };
      const farm = createFarm(options, env);
      const daily: DailyStored = {
        timezone: zone,
        startedOn: today,
        openedOn: today,
        workedOn: null,
        doneOn: null,
        away: [],
        awayTotal: 0,
        seenSeq: farm.inboxSeq - 1,
        rolledFrom: [],
      };
      const stored: StoredFarm = {
        format: STORED_FORMAT,
        name: setup.name,
        setup,
        saved: saveFarm(farm),
        version: newVersion(),
        done: [],
        diary: [],
        daily,
      };
      const held: Held = { stored, farm };
      const snap = this.snapshotOf(held);
      try {
        await this.persist(id, () =>
          this.store.create(id, who, stored, this.factsOf(stored, snap)),
        );
      } catch (e) {
        throw e instanceof FarmLimitError ? new GameError(409, NO_ROOM_MESSAGE) : e;
      }
      this.remember(id, held);
      return snap;
    });
  }

  /**
   * Bring a Daily Farm up to today: simulate each night that has passed, in order, one saved
   * night at a time. The same rules run whether the rollover job or the player's opening the
   * farm gets here first, so the timing never changes the outcome. A night never waits for
   * weather or prices (the data lags the real date, and what is still missing is filled in and
   * said, see server/daily/data.ts). The only reasons a farm is not brought up are that Daily Farm
   * is switched off or has nothing to run on, and the farm then says which.
   */
  private async bringUp(farmId: string, held: Held, o: { deadline?: number } = {}): Promise<Held> {
    let cur = held;
    for (;;) {
      const daily = cur.stored.daily!;
      const farmDate = isoOf(dateOn(cur.farm));
      const today = localDate(this.now(), daily.timezone);
      // What the farm is looked at and worked on with: the data up to today, as it stands.
      if (this.daily) {
        dailyEnvs.set(cur.stored.setup, { data: await this.daily.data.bundleThrough(farmDate) });
      }
      if (cur.farm.over || daysBetween(farmDate, today) <= 0) {
        cur.waiting = null;
        return cur;
      }
      if (!this.daily) {
        cur.waiting = UNAVAILABLE_TEXT;
        return cur;
      }
      if (!(await this.daily.enabled())) {
        cur.waiting = PAUSED_TEXT;
        return cur;
      }
      cur.waiting = null;
      if (o.deadline !== undefined && this.now() > o.deadline) return cur;
      try {
        cur = await this.rollOne(farmId, cur, farmDate);
      } catch (e) {
        // Another tab or server ran this night first. Take its farm and carry on from there.
        if (!(e instanceof SaveConflictError)) throw e;
        const fresh = await this.loadRaw(farmId);
        if (!fresh || !fresh.stored.daily) return cur;
        cur = fresh;
      }
    }
  }

  /** One night: the day that ends at midnight on `farmDate`. Saved with the farm's clock in one write. */
  private async rollOne(farmId: string, held: Held, farmDate: string): Promise<Held> {
    const daily = held.stored.daily!;
    const data = this.daily!.data;
    const district = held.stored.setup.district;
    const env: SourceEnv = { data: await data.bundleThrough(farmDate) };
    // What this night is missing from the data, said as a fact in the diary and counted for the admin.
    const missing = await data.fallbacksOn(district, farmDate);
    const notes: string[] = [];
    if (missing.weather) {
      notes.push(
        `Weather data was not available for ${longDate(farmDate)}. The long-term average for the day was used.`,
      );
    }
    if (missing.prices) {
      notes.push(
        `Cattle prices were not available for ${longDate(farmDate)}. The last published prices were used.`,
      );
    }
    const seq0 = held.farm.inboxSeq;
    const dayRan = held.farm.day;
    const { end } = nightOf(held.farm, env);
    const dateOf: DateOf = (d) => dateParts(dateOn(end.farm, d));
    const report = reportWire(end.farm, seq0 - 1, dateOf);
    const summary = buildSummary('day', end.summary, end.stops, 1, end.day.events, {
      ...report,
      pay: payFrom(end.dawn),
      stepThrough: false,
    });
    const filings = periodFilings(end.farm, seq0, summary, [end.day]);
    if (notes.length) {
      const own = filings.find((f) => f.day === dayRan);
      if (own) own.lines.unshift(...notes);
      else {
        filings.unshift({ day: dayRan, date: dateParts(dateOn(held.farm, dayRan)), lines: notes });
      }
    }
    // A night that follows a date the player never opened the farm on is a missed day.
    const missed = daily.openedOn !== farmDate;
    const away = missed
      ? [
          ...daily.away,
          {
            day: dayRan,
            date: dateParts(dateOn(held.farm, dayRan)),
            lines: filings.find((f) => f.day === dayRan)?.lines ?? [],
          },
        ].slice(-AWAY_KEPT)
      : daily.away;
    const next: DailyStored = {
      ...daily,
      away,
      awayTotal: (daily.awayTotal ?? 0) + (missed ? 1 : 0),
      rolledFrom: [...daily.rolledFrom, held.stored.version].slice(-ROLLED_KEPT),
    };
    // The farm is now on the next day: it is looked at with the data up to that day.
    dailyEnvs.set(held.stored.setup, { data: await data.bundleThrough(addDays(farmDate, 1)) });
    const saved = await this.save(
      farmId,
      held,
      end.farm,
      undefined,
      filings,
      missedDays(end.farm, held.farm.labour?.nextPayDay ?? null, end.dawn),
      {
        past: true,
        daily: next,
        dailyThrough: farmDate,
        action: {
          day: dayRan,
          action: { type: 'rollover', date: farmDate, at: new Date(this.now()).toISOString() },
          ok: true,
        },
      },
    );
    // Counted once the night is saved, so a night that is run again after a conflict is counted once.
    if (missing.weather) {
      await data
        .noteFallback(farmDate, 'night_weather_fallback', `district=${district}`)
        .catch(() => undefined);
    }
    if (missing.prices) {
      await data
        .noteFallback(farmDate, 'night_price_fallback', `district=${district}`)
        .catch(() => undefined);
    }
    return saved;
  }

  /**
   * The rollover job's door: bring one Daily Farm up to today, stopping between nights once the
   * deadline (ms) has passed. Safe to repeat: a farm that is on today does nothing.
   */
  async catchUpFarm(
    farmId: string,
    deadline?: number,
  ): Promise<{ days: number; waiting: boolean; over: boolean }> {
    return this.locked(farmId, async () => {
      const held = await this.loadRaw(farmId);
      if (!held || !held.stored.daily) return { days: 0, waiting: false, over: false };
      const before = held.farm.day;
      const cur = await this.bringUp(farmId, held, { deadline });
      return {
        days: cur.farm.day - before,
        waiting: Boolean(cur.waiting),
        over: cur.farm.over !== null,
      };
    });
  }

  /** The player has opened a Daily Farm today. Recorded once a day, so a night after a date with no open is a missed day. */
  private async markOpened(id: string, held: Held): Promise<Held> {
    const d = held.stored.daily;
    if (!d) return held;
    const today = localDate(this.now(), d.timezone);
    if (d.openedOn === today) return held;
    return this.setDaily(id, held, { ...d, openedOn: today });
  }

  /** Keep a change to what a Daily Farm records about the player. The farm itself and its version are not changed. */
  private async setDaily(id: string, held: Held, daily: DailyStored): Promise<Held> {
    const stored: StoredFarm = { ...held.stored, daily, rev: (held.stored.rev ?? 0) + 1 };
    try {
      await this.persist(id, () =>
        this.store.put(id, stored, {
          expect: held.stored.version,
          expectRev: held.stored.rev ?? 0,
        }),
      );
    } catch (e) {
      if (e instanceof SaveConflictError) return this.reload(id);
      throw e;
    }
    const next: Held = { stored, farm: held.farm, snap: held.snap, waiting: held.waiting };
    this.remember(id, next);
    return next;
  }

  private async dailyEdit(
    sessionId: string,
    change: (d: DailyStored, today: string, held: Held) => DailyStored,
  ): Promise<Snapshot> {
    const id = await this.idFor(sessionId);
    return this.locked(
      id,
      async () => {
        const held = await this.need(id);
        const d = held.stored.daily;
        if (!d) throw new GameError(409, 'That is not a Daily Farm.');
        const today = localDate(this.now(), d.timezone);
        return this.snapshotOf(await this.setDaily(id, held, change(d, today, held)));
      },
      async () => this.snapshotOf(await this.reload(id)),
    );
  }

  /** "Done for today": a fact on the farm card. Nothing is skipped and nothing is closed. */
  async dailyDone(sessionId: string): Promise<Snapshot> {
    return this.dailyEdit(sessionId, (d, today) => ({ ...d, openedOn: today, doneOn: today }));
  }

  /** The player has seen the catch-up: the days and the worker report are cleared. */
  async dailyAck(sessionId: string): Promise<Snapshot> {
    return this.dailyEdit(sessionId, (d, today, held) => ({
      ...d,
      openedOn: today,
      away: [],
      awayTotal: 0,
      seenSeq: held.farm.inboxSeq - 1,
    }));
  }

  /**
   * Throw the session's farm away, so it can start another. A farm that
   * can't be opened is kept aside under another name, not deleted.
   */
  async remove(sessionId: string): Promise<void> {
    const id = await this.idFor(sessionId);
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
    if (isSheepAction(action) && !sheepShown(farm, this.sheepOn)) {
      throw new GameError(400, 'Sheep are not part of this farm.');
    }
    return action;
  }

  /** The notes and daily price a job card carries beyond the engine's own. */
  private extras(farm: FarmState, stored: StoredFarm, action: Action): Extras {
    if (action.type === 'setSheepFeed') {
      return {
        notes: [],
        perDay: sheepFeedPerDay(farm, envFor(stored.setup), action.mob, action.feed),
        summary: [],
      };
    }
    if (action.type === 'setSupplement') {
      return {
        notes: [],
        perDay: suppPerDay(farm, envFor(stored.setup), action.mob, action.supp),
        summary: [],
      };
    }
    const water = waterLossNotesFor(farm, action, envFor(stored.setup));
    if (action.type === 'removePortable') {
      const back = portableRefund(farm, action.port);
      return {
        notes: [...(back === null ? [] : [refundNote(back)]), ...water],
        perDay: null,
        summary: [],
      };
    }
    return {
      notes: [
        ...moveNotesFor(farm, action),
        ...sheepMoveNotes(farm, action),
        ...fenceRuleNotes(farm, action),
        ...gateNotesFor(farm, action),
        ...water,
      ],
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
          label: saleClassLabel(action.cls) ?? c.label,
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
            : `${(GROUP_NAME[action.group as keyof typeof GROUP_NAME] ?? 'cattle').toLowerCase()} from ${farm.mobs.find((m) => m.id === action.mob)?.name ?? 'the mob'}`;
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
      case 'hireHand':
        return hireLines(farm, action.person);
      case 'letHandGo':
        return letGoLines(farm, events);
      case 'orderContractFence':
        return contractLines(farm, card);
      case 'cancelContractFence':
        return cancelContractLines(events);
      case 'buySheep':
      case 'sellSheep':
        return sheepMarketLines(farm, action, events);
      default:
        return [];
    }
  }

  /** Sell and cancel cards need the head the engine would sell: a trial run of the job gives them. */
  private trialEvents(farm: FarmState, stored: StoredFarm, action: Action): FarmEvent[] | null {
    if (
      action.type !== 'sellClass' &&
      action.type !== 'sellGroup' &&
      action.type !== 'cancelSale' &&
      action.type !== 'letHandGo' &&
      action.type !== 'cancelContractFence' &&
      action.type !== 'buySheep' &&
      action.type !== 'sellSheep'
    ) {
      return null;
    }
    const trial = applyAction(farm, action, envFor(stored.setup));
    return trial.ok ? trial.events : null;
  }

  /** The job card for an action: time, cost and light left. Nothing changes. */
  async preview(sessionId: string, req: ActionRequest): Promise<PreviewResponse> {
    const id = await this.idFor(sessionId);
    return this.locked(id, async () => {
      const held = await this.need(id);
      this.assertToday(held);
      const { farm, stored } = held;
      const action = this.resolve(farm, req);
      const version = stored.version;
      const env = envFor(stored.setup);
      const result = previewAction(farm, action, env);
      // A permanent fence can be built by a team instead: the card shows what each would cost and when it is done.
      // A line that can not be built by the player today (no light left) can still be ordered.
      const teams =
        action.type === 'buildFence' && action.fence === 'permanent'
          ? teamOptions(farm, env, action.edges)
          : [];
      if (!result.ok) {
        return {
          ok: false,
          reason: result.reason,
          message: refusalWords(farm, action, result.reason, result.message),
          version,
          ...(teams.length ? { teams } : {}),
        };
      }
      const x = this.extras(farm, stored, action);
      x.notes.push(...handsNotes(farm, result.card));
      x.summary = this.summary(
        farm,
        stored,
        action,
        result.card,
        this.trialEvents(farm, stored, action),
      );
      return {
        ok: true,
        card: cardWire(result.card, x),
        version,
        ...(teams.length ? { teams } : {}),
      };
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
    const id = await this.idFor(sessionId);
    return this.locked(
      id,
      async () => {
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
          return this.stale(held, meta.version);
        }
        this.assertToday(held);
        const action = this.resolve(held.farm, req);
        const x = this.extras(held.farm, held.stored, action);
        const applied = applyAction(held.farm, action, envFor(held.stored.setup));
        const result = applied.ok
          ? applied
          : {
              ...applied,
              message: refusalWords(held.farm, action, applied.reason, applied.message),
            };
        if (!result.ok) {
          let shown = held;
          if (meta.requestId) {
            shown = await this.note(
              id,
              held,
              {
                id: meta.requestId,
                ok: false,
                reason: result.reason,
                message: result.message,
                card: null,
              },
              {
                day: held.farm.day,
                requestId: meta.requestId,
                action: req,
                ok: false,
                reason: result.reason,
              },
            );
          }
          return {
            ok: false,
            reason: result.reason,
            message: result.message,
            snapshot: this.snapshotOf(shown),
          };
        }
        if (result.job) {
          x.summary = this.summary(held.farm, held.stored, action, result.job, result.events);
          x.notes.push(...handsNotes(held.farm, result.job));
        }
        const dateOf: DateOf = (day) => dateParts(dateOn(result.farm, day));
        const message = doneWord(result.events, dateOf);
        const card = result.job ? cardWire(result.job, x) : null;
        // A job on a Daily Farm is the day's work started, with the server's time in the action log (PRD 14.5).
        const day = held.stored.daily;
        const today = day ? localDate(this.now(), day.timezone) : '';
        const logged = day
          ? ({ ...(req as object), at: new Date(this.now()).toISOString(), on: today } as unknown)
          : req;
        const next = await this.save(
          id,
          held,
          result.farm,
          meta.requestId ? { id: meta.requestId, ok: true, message, card } : undefined,
          message
            ? [
                {
                  day: result.farm.day,
                  date: dateParts(dateOn(result.farm, result.farm.day)),
                  lines: [message],
                },
              ]
            : [],
          [],
          {
            action: { day: held.farm.day, requestId: meta.requestId, action: logged, ok: true },
            ...(day ? { daily: { ...day, openedOn: today, workedOn: today, doneOn: null } } : {}),
          },
        );
        return { ok: true, message, card, snapshot: this.snapshotOf(next) };
      },
      async () => {
        // Another tab saved first. If it was this very request (a retry after a lost
        // reply), give the answer it got. Otherwise the farm has changed: say so.
        const held = await this.reload(id);
        const seen = meta.requestId
          ? held.stored.done.find((d) => d.id === meta.requestId)
          : undefined;
        if (seen) {
          const snapshot = this.snapshotOf(held);
          return seen.ok
            ? { ok: true as const, message: seen.message, card: seen.card, snapshot, repeat: true }
            : {
                ok: false as const,
                reason: seen.reason ?? 'refused',
                message: seen.message,
                snapshot,
                repeat: true,
              };
        }
        return this.stale(held, meta.version);
      },
    );
  }

  /** The player has opened the inbox: every message up to this number is read. */
  async markRead(sessionId: string, upTo: number): Promise<Snapshot> {
    const id = await this.idFor(sessionId);
    return this.locked(
      id,
      async () => {
        const held = await this.need(id);
        const newest = held.farm.inbox.reduce((m, x) => Math.max(m, x.seq), 0);
        // Never past the newest message there is, and never backwards.
        const to = Math.max(held.stored.inboxRead ?? 0, Math.min(upTo, newest));
        if (to === (held.stored.inboxRead ?? 0)) return this.snapshotOf(held);
        const stored: StoredFarm = {
          ...held.stored,
          inboxRead: to,
          rev: (held.stored.rev ?? 0) + 1,
        };
        await this.persist(id, () =>
          this.store.put(id, stored, {
            expect: held.stored.version,
            expectRev: held.stored.rev ?? 0,
          }),
        );
        const next = { stored, farm: held.farm };
        this.remember(id, next);
        return this.snapshotOf(next);
      },
      async () => this.snapshotOf(await this.reload(id)),
    );
  }

  /** The last year that closed among these events, and how many closed. */
  private yearsClosed(
    held: Held,
    ticks: readonly { type: string }[],
  ): { yearEnd: DayResponse['yearEnd']; yearsClosed: number } {
    const closed = ticks.filter(
      (e): e is Extract<TickEvent, { type: 'year-end' }> => e.type === 'year-end',
    );
    const last = closed[closed.length - 1];
    return {
      yearEnd: last ? yearView(held.farm, held.stored.setup, last.year) : null,
      yearsClosed: closed.length,
    };
  }

  /**
   * The Scores and Diary panels: the year so far, the finished years, and a
   * page of the diary. `before` asks for diary days older than that day.
   */
  async record(sessionId: string, before?: number): Promise<RecordResponse> {
    const id = await this.idFor(sessionId);
    return this.locked(id, async () => {
      const held = await this.need(id);
      const { stored, farm } = held;
      return {
        soFar: soFarView(farm, stored.setup),
        years: pastYears(farm, stored.setup),
        ...diaryPage(stored.diary, before),
      };
    });
  }

  /** The picture of the farm on a past day, read only (milestone 3.2, PRD 5.2). */
  async pastDay(sessionId: string, day: number): Promise<PastDayWire> {
    const id = await this.idFor(sessionId);
    const found = await this.store.past(id, day);
    if (!found) throw new GameError(404, 'There is no picture of the farm kept for that day.');
    return found;
  }

  /** The farm days that have a picture kept, newest first. */
  async pastDays(sessionId: string): Promise<number[]> {
    return this.store.pastDays(await this.idFor(sessionId));
  }

  /** The farms an owner has, most recently played first, with `currentId` marked. */
  async farms(owner: Owner, currentId: string | null): Promise<FarmListItem[]> {
    const names = new Map(setupOptions().districts.map((d) => [d.id as string, d.name]));
    return (await this.store.list(owner)).map((f) => ({
      ...f,
      districtName: names.get(f.districtName) ?? f.districtName,
      current: f.id === currentId,
    }));
  }

  /** Who owns this farm, or null. A guest's secret is not kept, so a guest owner carries its hash. */
  async ownerOf(farmId: string): Promise<Owner | null> {
    return this.store.ownerOf(farmId);
  }

  /** Is this a database store (accounts and shared saves), or files? */
  get storeKind(): 'file' | 'db' {
    return this.store.kind;
  }

  /** Next day: the daily tick runs and the new day starts at first light. */
  async endDay(sessionId: string): Promise<DayResponse>;
  async endDay(sessionId: string, version: string): Promise<DayResponse | StaleResponse>;
  async endDay(sessionId: string, version?: string): Promise<DayResponse | StaleResponse> {
    const id = await this.idFor(sessionId);
    return this.locked(
      id,
      async () => {
        const held = await this.need(id);
        if (held.stored.daily) throw new GameError(409, DAILY_NO_SKIP, 'daily_no_skip');
        if (held.farm.over) throw new GameError(409, OVER_MESSAGE);
        if (version !== undefined && version !== held.stored.version) return this.stale(held);
        const seq0 = held.farm.inboxSeq;
        const end = endDay(held.farm, envFor(held.stored.setup));
        const report = reportWire(end.farm, seq0 - 1, (d) => dateParts(dateOn(end.farm, d)));
        const summary = buildSummary(
          'day',
          end.summary,
          end.stops,
          1,
          end.day.events,
          {
            ...report,
            pay: payFrom(end.dawn),
            // One day: the bubbles sit in the summary, unless something needs the player's eye.
            stepThrough: report.attention,
          },
          sheepMobsOf(end.farm).length > 0,
        );
        const next = await this.save(
          id,
          held,
          end.farm,
          undefined,
          periodFilings(end.farm, seq0, summary, [end.day]),
          missedDays(end.farm, held.farm.labour?.nextPayDay ?? null, end.dawn),
          { past: true, action: { day: held.farm.day, action: { type: 'day' }, ok: true } },
        );
        return {
          ok: true,
          snapshot: this.snapshotOf(next),
          summary,
          ...this.yearsClosed(next, end.day.events),
        };
      },
      async () => this.stale(await this.reload(id)),
    );
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
    const id = await this.idFor(sessionId);
    return this.locked(
      id,
      async () => {
        const held = await this.need(id);
        if (held.stored.daily) throw new GameError(409, DAILY_NO_SKIP, 'daily_no_skip');
        if (held.farm.over) throw new GameError(409, OVER_MESSAGE);
        if (version !== undefined && version !== held.stored.version) return this.stale(held);
        const seq0 = held.farm.inboxSeq;
        const result = skipDays(held.farm, length, envFor(held.stored.setup), { anyway });
        const ticks = result.days.flatMap((d) => d.events);
        const report = reportWire(result.farm, seq0 - 1, (d) => dateParts(dateOn(result.farm, d)));
        const summary = buildSummary(
          'skip',
          result.summary,
          result.stops,
          result.asked,
          ticks,
          {
            ...report,
            pay: payFrom(result.dawn),
            // After more than a day the bubbles are stepped through; after one day only if something needs the eye.
            stepThrough: result.daysRun > 1 || report.attention,
          },
          sheepMobsOf(result.farm).length > 0 || sheepMobsOf(held.farm).length > 0,
        );
        const next =
          result.daysRun > 0
            ? await this.save(
                id,
                held,
                result.farm,
                undefined,
                periodFilings(result.farm, seq0, summary, result.days),
                missedDays(result.farm, held.farm.labour?.nextPayDay ?? null, result.dawn),
                {
                  past: true,
                  action: {
                    day: held.farm.day,
                    action: { type: 'skip', length, anyway },
                    ok: true,
                  },
                },
              )
            : held;
        return {
          ok: true,
          snapshot: this.snapshotOf(next),
          summary,
          ...this.yearsClosed(next, ticks),
        };
      },
      async () => this.stale(await this.reload(id)),
    );
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
    store: configuredStore(),
    daily: dailyRuntime(),
  });
  return shared;
}

/** For tests: use this game server (or `undefined` to go back to the configured one). */
export function setGameServer(game: GameServer | undefined): void {
  shared = game;
  globalThis.__ggGameServer = game;
}
