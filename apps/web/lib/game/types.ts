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
  /** The mob this is about, so the banner can open its card. Null when it is about something else. */
  mob: number | null;
  /** 'move' when the button opens the move flow instead of doing a job at once (cattle in the yards). 'fix' when it opens the card for a fence that is down. */
  opens: 'move' | 'fix' | null;
  /** The fence segment this is about (a fence that is down), so the map can show it. */
  edge: EdgeWire | null;
}

export type SuppId = 'none' | 'lick' | 'hay' | 'pellet';
export type SellGroupId = 'steer' | 'heifer' | 'heiferP' | 'cowP' | 'cowE' | 'bull';

/** One class of cattle in a mob: head, average weight and CS. */
export interface MobClassWire {
  /** The class id, which the move picker sends back. */
  id: string;
  label: string;
  head: number;
  weightKg: number;
  cs: number;
  /** Calves go with their mothers, so they are not picked on their own. */
  calf: boolean;
}

/** A supplement a mob can be on, with what it costs a day for this mob. Dollars, whole. */
export interface SuppOptionWire {
  id: SuppId;
  label: string;
  perDay: number;
}

/** A group in the mob that can be sold, and how many head are free to sell. */
export interface SellGroupWire {
  id: SellGroupId;
  name: string;
  head: number;
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
  /** Intake in kg DM a head a day, and as % of live weight. Null before the mob's first day. */
  intakeKg: number | null;
  intakePct: number | null;
  classes: MobClassWire[];
  /** Plain sentences on why the mob is losing weight or short of feed or water. Empty when there is nothing to say. */
  why: string[];
  /** Females known to be in calf (PTIC): a preg test or the saleyard said so. Never the live count. */
  ptic: number;
  /** The joining, the latest joining report and the latest preg test, each with its date. Empty with none. */
  breeding: string[];
  supp: SuppId;
  /** The supplements to pick from. Empty when the mob is not on pasture. */
  suppOptions: SuppOptionWire[];
  /** Why the supplement switch is off, or null. */
  suppReason: string | null;
  /** Head booked onto the next sale, and the sale's date. */
  booked: number;
  bookedDate: DateParts | null;
  /** Bull calves and young bulls that marking would cover. */
  markCount: number;
  markReason: string | null;
  /** Calves old enough to wean. */
  weanCount: number;
  weanReason: string | null;
  sellGroups: SellGroupWire[];
  sellReason: string | null;
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
  dse: number;
  aePerHa: number;
  dsePerHa: number;
  /** Days of feed with stock on it, or null with no stock. */
  feedDays: number | null;
  /** Feed grown on the last day, kg DM/ha a day. */
  growKgHaDay: number;
  /** Why no water matters, as a fact, for a paddock with none. Null with water. */
  noWaterWhy: string | null;
  /** What the soil carries over the long term, DSE/ha. */
  carryingDsePerHa: number;
  /** A square in the paddock, which the move action names. */
  cell: number;
  /** Arable land in the paddock, ha. 0 when it has none. */
  arableHa: number;
}

export interface SaleDayWire {
  date: DateParts;
  daysAway: number;
}

/** One class's price today: c/kg live weight, and $ a head for a typical beast of the class. */
export interface PriceRowWire {
  id: string;
  label: string;
  /** c/kg live weight, whole. */
  cKg: number;
  /** The weight of the typical beast, kg, or null where the game has no typical beast. */
  typicalKg: number | null;
  /** Dollars a head for that beast, before selling costs. Null with no typical beast. */
  perHead: number | null;
  /** Change in c/kg since the first day of the chart, or null with less than two days of prices. */
  changeCKg: number | null;
  changeDays: number;
}

/** The last month of prices the farm has lived, c/kg for each class, one point a day. Never a future price. */
export interface PriceChartWire {
  from: DateParts | null;
  to: DateParts | null;
  classes: { id: string; label: string; points: number[] }[];
}

/** A class the saleyard sells, for the Buy card. */
export interface BuyClassWire {
  id: string;
  label: string;
  /** "190 to 235 kg". */
  weightText: string;
  /** c/kg of its market class, or null for bulls, which are priced by the head. */
  cKg: number | null;
  /** About what one head costs with fees and freight, dollars. */
  perHead: number;
  /** "a head", or "a unit" for a cow with her calf. */
  perText: string;
}

/** A market class on the farm, with the head that are free to sell. */
export interface SellClassWire {
  id: string;
  label: string;
  head: number;
  cKg: number;
}

export interface MarketWire {
  isSaleDay: boolean;
  nextSale: SaleDayWire | null;
  booked: { date: DateParts; daysAway: number; head: number }[];
  onTheWay: { date: DateParts; daysAway: number; cls: string; head: number }[];
  /** "Cattle sale today." or "Next cattle sale: Thursday 14 March, in 3 days." */
  saleLine: string;
  /** The credit line for real prices, or null for a farm with random seasons. */
  credit: string | null;
  prices: PriceRowWire[];
  chart: PriceChartWire;
  buy: {
    classes: BuyClassWire[];
    maxQty: number;
    /** Why Buy is off, or null on a sale day. */
    reason: string | null;
  };
  sell: {
    classes: SellClassWire[];
    /** What selling does today: paid now, or booked onto the next sale. */
    note: string;
  };
}

export type InboxKind = 'cattle' | 'sale' | 'crop' | 'plan' | 'water' | 'farm';

export interface InboxWire {
  seq: number;
  day: number;
  date: DateParts;
  /** "6:10 am" for a message made by a job, null for what the day's tick reports. */
  time: string | null;
  kind: InboxKind;
  text: string;
  /** True until the player has opened the inbox. */
  unread: boolean;
}

/** One side of a square, as the map and the engine number it. */
export interface EdgeWire {
  line: 'h' | 'v';
  index: number;
}

export type FenceKindId = 'permanent' | 'electric' | 'tape';
export type BuildToolId = 'fence' | 'gate' | 'pipe' | 'trough' | 'portable' | 'hub' | 'remove';

/** A fence the player can draw: what a metre costs and what it does. From the server. */
export interface FenceOptionWire {
  id: FenceKindId;
  name: string;
  /** Dollars a metre. */
  perM: number;
  /** "$7 a metre". */
  price: string;
  text: string;
}

export interface BuildToolWire {
  id: BuildToolId;
  name: string;
  /** One short line of help, shown when the tool is picked. */
  help: string;
  /** What it costs, in words. */
  price: string;
}

/** The tool bar: the tools and the fences, with their prices and help lines. */
export interface BuildWire {
  tools: BuildToolWire[];
  fences: FenceOptionWire[];
  /** Fence materials on hand, in words ("On hand: 240 m of permanent fence."), or null with none. */
  onHand: string | null;
  /** What the card says when none of a line fits today. */
  noneFits: string;
}

/** The rule a plan moves by, as the plan form takes it. */
export type PlanTriggerWire =
  { mode: 'days'; every: number } | { mode: 'kg'; kg: number; maxDays: number };

export interface PlanStopWire {
  /** A square in the paddock, which the plan names. */
  cell: number;
  /** The paddock, or null when the grazing area is more than one paddock. */
  paddock: number | null;
  name: string;
  hasWater: boolean;
}

/** One mob on a plan: where it is on it, and what the plan will do next. */
export interface PlanMobWire {
  mob: number;
  mobName: string;
  head: number;
  area: string | null;
  step: number;
  /** "Step 2 of 3: Paddock 2". */
  stepText: string;
  /** "Round 1 of 2", "Round 3", "Round 1, keeps going". */
  roundText: string;
  paused: boolean;
  /** Why it is paused, in a sentence, or null. */
  pausedText: string | null;
  /** Why the plan can not move the mob now, or null. */
  waitingText: string | null;
  /** What it will do next, in a sentence. */
  nextText: string;
  /** The plan's report as the engine gives it, in sentences, with figures rounded. */
  report: string[];
}

export interface PlanLegWire {
  stops: PlanStopWire[];
  trigger: PlanTriggerWire;
  /** "Move every 3 days." */
  ruleText: string;
  rounds: number;
  /** "2 rounds", "Keeps going". */
  roundsText: string;
}

export interface PlanWire {
  id: number;
  name: string;
  legs: PlanLegWire[];
  after: 'repeat' | 'stay';
  afterText: string;
  /** True for a plan with one leg, which the form can change. */
  editable: boolean;
  mobs: PlanMobWire[];
}

/** The figures the plan form works within, from the server. */
export interface PlanFormWire {
  defaultEvery: number;
  defaultKg: number;
  defaultRounds: number;
  everyMax: number;
  kgMin: number;
  kgMax: number;
  maxDaysMax: number;
  roundsMax: number;
  maxStops: number;
  /** The most times a day a plan can move a mob. */
  timesADayMax: number;
}

/** What a sowing option is, what it costs a hectare and when it can be sown. From the server. */
export interface SowOptionWire {
  id: string;
  name: string;
  /** "Grain crop", "Forage crop" or "Pasture". */
  kindText: string;
  /** Dollars a hectare, whole. */
  costPerHa: number;
  /** "Apr to Jun". */
  window: string;
  open: boolean;
  /** Why it is off, or null. */
  reason: string | null;
  /** A plain line on what it is for. */
  about: string;
}

/** A planting on the farm, for the paddock sheet. */
export interface FieldWire {
  id: number;
  name: string;
  ha: number;
  /** Where it is up to, in plain words. */
  stage: string;
  /** True when it can be harvested now. */
  ready: boolean;
  /** The paddocks it covers. */
  paddocks: number[];
}

/** The cropping side of a mixed farm. Null for a farm that is not mixed. */
export interface CropsWire {
  options: SowOptionWire[];
  fields: FieldWire[];
}

export interface Snapshot {
  version: typeof SNAPSHOT_VERSION;
  /**
   * The farm's version: it changes with every change to the farm. Jobs, Next
   * day and skips send back the one the player was looking at.
   */
  farmVersion: string;
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
  /** Grazing plans, with each mob on them. */
  plans: PlanWire[];
  planForm: PlanFormWire;
  /** The cropping side of a mixed farm, or null. */
  cropping: CropsWire | null;
  mobs: MobWire[];
  paddocks: PaddockWire[];
  /** The build tools, with prices and help lines. */
  build: BuildWire;
  /** The newest messages, newest first. */
  inbox: InboxWire[];
  /** Messages the player has not opened, counting the ones past those shown. */
  inboxUnread: number;
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
  /** For a supplement: what it costs a day for the mob while it is on, dollars. Null for any other job. */
  perDay: number | null;
  /** Plain sentences about this job, for example that stock are booked onto a sale. */
  notes: string[];
  /** Ready-made lines for a market, plan or crop job: money, where, and what is left. They replace the time and cost lines when present. */
  summary?: string[];
  /** For a line of fence, tape or pipe: the pieces that fit today and the pieces that do not. */
  line: LineWire | null;
}

/** The pieces of a line job, in the order drawn. Fence and tape give segments, pipe gives squares. */
export interface LinePiecesWire {
  edges: EdgeWire[];
  cells: number[];
  metres: number;
}

export interface LineWire {
  fits: LinePiecesWire;
  doesNotFit: LinePiecesWire;
  /** What the card says when part of it does not fit. Empty when all of it fits. */
  words: string[];
}

export interface Refusal {
  ok: false;
  reason: string;
  message: string;
}

/** A job card, with the farm version it was made on. Confirm sends that version back. */
export type PreviewResponse =
  { ok: true; card: JobCardWire; version: string } | (Refusal & { version: string });

/**
 * What a job did, or why it was refused, with the farm as it is now.
 * `repeat` is true when the same request had been answered before.
 */
export type ActResponse =
  | { ok: true; message: string; card: JobCardWire | null; snapshot: Snapshot; repeat?: true }
  | (Refusal & { snapshot: Snapshot; repeat?: true });

/** The farm changed since the player last saw it: nothing was done. Here is the latest. */
export interface StaleResponse {
  ok: false;
  reason: 'stale';
  message: string;
  snapshot: Snapshot;
}

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
  /** Where a grazing plan moved a mob, one line for each mob. */
  planMoves: string[];
  /** Plain facts about why a skip stopped early, or something to know. */
  stops: string[];
  /** True when nothing ran because of water, and a "run anyway" is allowed. */
  canRunAnyway: boolean;
}

export interface DayResponse {
  ok: true;
  snapshot: Snapshot;
  summary: SummaryWire;
}

export interface FarmResponse {
  snapshot: Snapshot | null;
  /** Set when the farm is there but can not be opened: what to tell the player. */
  broken?: string;
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

/**
 * What a job card on screen was made for: the request, the farm version it
 * was made on, and the one-use id Confirm sends. The server refuses a
 * version that is not the farm's, and answers a repeated id with the answer
 * it gave before, so a card can never do something other than it showed.
 */
export interface Shown {
  req: ActionRequest;
  version: string;
  requestId: string;
}

/** An act request: the job, the farm version its card was made on, and a one-use id. */
export type ActRequest = ActionRequest & { version: string; requestId: string };

export type SimpleAction =
  | { type: 'markCalves'; mob: number }
  | { type: 'sellGroup'; mob: number; group: SellGroupId; qty: number }
  | { type: 'cancelSale'; mob: number }
  | { type: 'setSupplement'; mob: number; supp: SuppId }
  | { type: 'moveCattle'; picks: { mob: number; cls: string; qty: number }[]; cell: number }
  | { type: 'moveMob'; mob: number; cell: number }
  | { type: 'wean'; mob: number }
  | { type: 'harvest'; field: number }
  | { type: 'refillPortable'; port: number }
  | { type: 'buildFence'; edges: EdgeWire[]; fence: FenceKindId }
  | { type: 'removeFence'; edges: EdgeWire[] }
  | { type: 'rollUpTape'; edge: EdgeWire }
  | { type: 'fixFence'; edge: EdgeWire }
  | { type: 'placeGate'; edge: EdgeWire }
  | { type: 'removeGate'; edge: EdgeWire }
  | { type: 'setGate'; edge: EdgeWire; open: boolean }
  | { type: 'layPipe'; cells: number[] }
  | { type: 'placeTrough'; cell: number }
  | { type: 'moveTrough'; from: number; to: number }
  | { type: 'removeTrough'; cell: number }
  | { type: 'placeFenceHub'; vertex: number }
  | { type: 'placeSquareHub'; cell: number }
  | { type: 'removeHub'; vertex: number }
  | { type: 'moveHub'; from: number; to: number }
  | { type: 'removeSquareHub'; cell: number }
  | { type: 'moveSquareHub'; from: number; to: number }
  | { type: 'placePortable'; cell: number }
  | { type: 'movePortable'; port: number; cell: number }
  | { type: 'removePortable'; port: number }
  | { type: 'pausePlan'; mob: number }
  | { type: 'clearPlan'; mob: number }
  | { type: 'resumePlan'; mob: number; step?: number }
  | { type: 'buyCattle'; cls: string; qty: number }
  | { type: 'sellClass'; cls: string; qty: number }
  | {
      type: 'setPlan';
      mob: number;
      /** The paddocks in order, each named by a square in it. */
      stops: number[];
      trigger: PlanTriggerWire;
      /** 0 keeps going. */
      rounds: number;
      after: 'repeat' | 'stay';
      /** The step to start from, counting from the first stop. */
      step: number;
      /** Set to change a plan that exists. */
      planId?: number;
    }
  | { type: 'sow'; species: string; cells: number[] };

export type SkipRequestLength = 'week' | 'month' | 'year';
