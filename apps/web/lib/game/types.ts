/**
 * What the game server sends the browser, and what the browser sends back.
 *
 * Browser-safe: no engine import. The server builds these shapes from the
 * engine's reads (`apps/web/server/game/snapshot.ts`), so a change to one
 * side that the other does not match fails the type check. Numbers to
 * show, never formulas or data tables (CLAUDE.md, rule 14).
 */

import type { DistrictId, FarmView, PaddockLabelId } from '@gg/shared';

export const SNAPSHOT_VERSION = 1;

export interface DateParts {
  year: number;
  /** 0 is January. */
  month: number;
  date: number;
}

export type SetupSize = 'small' | 'medium' | 'large';
export type SetupYears = 'real-in-order' | 'real-random' | 'random';
export type SetupStart = 'running' | 'scratch';
export type SetupDifficulty = 'easy' | 'medium' | 'hard';
export type SetupEnterprise = 'grazing' | 'mixed';

/** What the player chose at setup, in words the screens can show. No dollar figures. */
export interface SetupSummary {
  districtName: string;
  town: string;
  state: string;
  size: SetupSize;
  farmHa: number;
  enterprise: SetupEnterprise;
  arablePct: number;
  years: SetupYears;
  startType: SetupStart;
  difficulty: SetupDifficulty;
}

/** The farm clock for the daylight bar. Times are minutes after midnight on the district's clock. */
export interface ClockWire {
  firstLight: number;
  lastLight: number;
  now: number;
  dayMin: number;
  usedMin: number;
  leftMin: number;
  canStartJobs: boolean;
  /** No job can start: the screen dims the farm and lights up Next day. */
  evening: boolean;
}

export interface TotalsWire {
  head: number;
  calves: number;
  ae: number;
  dse: number;
  cash: number;
  netWorth: number;
  massKgHa: number;
  greenKgHa: number;
  coverPct: number;
}

/** One thing that needs doing, as a fact, with the button that does it (null when the player must pick something first). */
export interface TodoWire {
  key: string;
  text: string;
  button: string | null;
  /** True for things that can hurt stock soon, such as no water. Styled firmer, worded the same way: facts. */
  urgent: boolean;
}

export interface MobWire {
  id: number;
  name: string;
  where: 'paddock' | 'lot' | 'yards';
  area: string | null;
  hasWater: boolean;
  head: number;
  calves: number;
  ae: number;
  dse: number;
  dryDays: number;
  weightKg: number | null;
  cs: number | null;
  adgKg: number | null;
  me: number | null;
  cp: number | null;
}

export interface PaddockWire {
  id: number;
  name: string;
  ha: number;
  area: string;
  label: PaddockLabelId;
  water: 'own' | 'gate' | 'none';
  mobs: number[];
  massKgHa: number;
  greenKgHa: number;
  deadKgHa: number;
  greenPct: number;
  heightCm: number;
  coverPct: number;
  me: number;
  cp: number;
  head: number;
  ae: number;
  dsePerHa: number;
  /** Days of feed with stock on it, or null with no stock. */
  feedDays: number | null;
}

export interface SaleDayWire {
  date: DateParts;
  daysAway: number;
}

export interface MarketWire {
  isSaleDay: boolean;
  nextSale: SaleDayWire | null;
  booked: { date: DateParts; daysAway: number; head: number }[];
  onTheWay: { date: DateParts; daysAway: number; cls: string; head: number }[];
}

export interface InboxWire {
  seq: number;
  day: number;
  text: string;
}

export interface Snapshot {
  version: typeof SNAPSHOT_VERSION;
  farm: {
    name: string;
    district: DistrictId;
    setup: SetupSummary;
  };
  day: number;
  date: DateParts;
  season: string;
  totals: TotalsWire;
  clock: ClockWire;
  /** The numbers the map is drawn from. */
  view: FarmView;
  todo: TodoWire[];
  market: MarketWire;
  /** Grazing plans, for the Plans panel (a later piece), as the engine reports them. */
  plans: Record<string, unknown>[];
  mobs: MobWire[];
  paddocks: PaddockWire[];
  inbox: InboxWire[];
  over: { text: string } | null;
}

/** The job card: time, cost and light left, from the engine's own figures. */
export interface JobCardWire {
  action: string;
  outcome: 'done' | 'part' | 'free';
  workMin: number;
  /** Light left after the job, minutes. */
  leftAfterMin: number;
  usesRestOfDay: boolean;
  fitsToday: boolean;
  cost: number;
  costToday: number;
  /** Plain sentences about this job, for example that stock are booked onto a sale. */
  notes: string[];
}

export interface Refusal {
  ok: false;
  reason: string;
  message: string;
}

export type PreviewResponse = { ok: true; card: JobCardWire } | Refusal;

export type ActResponse =
  { ok: true; message: string; card: JobCardWire | null; snapshot: Snapshot } | Refusal;

export interface ChangeWire {
  before: number;
  after: number;
}

/** What happened over a day or a skip, as facts and figures. */
export interface SummaryWire {
  kind: 'day' | 'skip';
  from: DateParts;
  to: DateParts;
  daysAsked: number;
  daysRun: number;
  cash: ChangeWire;
  head: ChangeWire;
  calves: ChangeWire;
  liveWeightKg: ChangeWire;
  massKgHa: ChangeWire;
  greenKgHa: ChangeWire;
  coverPct: ChangeWire;
  births: number;
  deaths: number;
  deathsByCause: Record<string, number>;
  gainKg: number;
  money: { sales: number; buys: number; feed: number; running: number; interest: number };
  arrived: { head: number; calves: number };
  bookedSold: { head: number; net: number };
  /** Plain facts about why a skip stopped early, or something to know. */
  stops: string[];
  /** True when nothing ran because of water, and a "run anyway" is allowed. */
  canRunAnyway: boolean;
}

export interface DayResponse {
  snapshot: Snapshot;
  summary: SummaryWire;
}

export interface FarmResponse {
  snapshot: Snapshot | null;
}

// ---- Setup

export interface SetupOptions {
  districts: {
    id: DistrictId;
    name: string;
    town: string;
    state: string;
    sizes: { id: SetupSize; label: string; ha: number }[];
    mixed: { arablePcts: number[]; croppedPcts: number[] };
  }[];
  enterprises: { id: SetupEnterprise; label: string; text: string }[];
  years: { id: SetupYears; label: string; text: string }[];
  starts: { id: SetupStart; label: string; text: string }[];
  difficulties: { id: SetupDifficulty; label: string; text: string }[];
  nameMax: number;
}

export interface SetupChoices {
  district: DistrictId;
  size: SetupSize;
  enterprise: SetupEnterprise;
  arablePct?: number;
  croppedPct?: number;
  years: SetupYears;
  startType: SetupStart;
  difficulty: SetupDifficulty;
  name: string;
}

/** What the browser may ask the server to do to a farm. The server checks every request. */
export type ActionRequest = { todo: string } | { action: SimpleAction };

export type SimpleAction =
  | { type: 'markCalves'; mob: number }
  | { type: 'moveMob'; mob: number; cell: number }
  | { type: 'wean'; mob: number }
  | { type: 'harvest'; field: number }
  | { type: 'refillPortable'; port: number }
  | { type: 'pausePlan'; mob: number }
  | { type: 'clearPlan'; mob: number };

export type SkipRequestLength = 'week' | 'month' | 'year';
