/**
 * What the game server sends the browser, and what the browser sends back.
 *
 * Browser-safe: no engine import. The server builds these shapes from the
 * engine's reads (`apps/web/server/game/snapshot.ts`), so a change to one
 * side that the other does not match fails the type check. Numbers to
 * show, never formulas or data tables (CLAUDE.md, rule 14).
 */

import type { DistrictId, FarmView, PaddockLabelId } from '@gg/shared';

/** 3 added `workforce` and `contracts` (milestone 2.2). A saved offline farm of an older version is not shown. */
export const SNAPSHOT_VERSION = 5;

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
  /** 'move' when the button opens the move flow instead of doing a job at once (cattle in the yards). 'fix' when it opens the card for a fence that is down. 'workforce' when it opens the Workforce panel (wages owed). */
  opens: 'move' | 'fix' | 'workforce' | null;
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
  /** Females on the record as PTIC (the engine's PTIC_DAYS or more in calf). Never the live count. */
  ptic: number;
  /** "31 PTIC, 2 to 4 months in calf.", or null with none PTIC. For the herd list. */
  pticText: string | null;
  /** The joining's dates and the PTIC line. Empty with none. */
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

export type InboxKind = 'cattle' | 'sale' | 'crop' | 'plan' | 'water' | 'farm' | 'work';

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

/** A skill as a plain number out of 5, with the words for it. */
export interface SkillWire {
  label: string;
  rating: number;
  /** "Fencing 4 of 5". */
  text: string;
}

/** A person looking for work, or a hand on the farm: the facts about them, as words. */
export interface PersonWire {
  /** An opaque id for this farm: hire and let go name a person by it. */
  id: string;
  name: string;
  /** "Casual", "Short contract, 91 days", "Salaried". */
  kindText: string;
  /** "$320 a day worked", "$1,202 a week". Before super. */
  rateText: string;
  /** About what each pay day costs, with super. */
  payText: string;
  /** "Works Monday to Friday". */
  daysText: string;
  skills: SkillWire[];
  dogs: boolean;
  /** Yes or no, and what dogs do, in one line. */
  dogsText: string;
}

/** A hand on the farm. */
export interface HandWire extends PersonWire {
  /** "Starts tomorrow, Tuesday 17 November", "At work today", "Not one of their days today", "Off hurt until Monday 4 January". */
  statusText: string;
  /** For a contract: when it ends. Null otherwise. */
  endText: string | null;
  /** What the farm owes them since the last pay day. */
  owedText: string;
  /** What they did lately, in their own words, newest first. */
  recent: string[];
}

/** The standing with workers, as a level, what it means for the list, and the fact behind it. */
export interface StandingWire {
  level: string;
  effect: string;
  fact: string;
}

/** The Workforce panel: people looking for work, the farm's hands, pay and standing. */
export interface WorkforceWire {
  seekers: PersonWire[];
  /** What to say above the list: how many are looking, or that the farm has as many hands as it can take. */
  seekersText: string;
  canHire: boolean;
  hands: HandWire[];
  /** The next pay day and what is owed to the hands so far. Null with no hands. */
  payText: string | null;
  /** Wages the farm could not pay when due, and what happens to them. Null when none are owed. */
  owedText: string | null;
  standing: StandingWire;
}

/** Contract fencing under way: the fact line, and the segments the map draws in the contractor's colour. */
export interface ContractWire {
  id: number;
  teamText: string;
  /** "Contract fence: 1,200 m left, done on Tuesday 3 March". */
  text: string;
  /** "400 m built so far. $2,100 charged so far." */
  detail: string;
  built: EdgeWire[];
  left: EdgeWire[];
}

/** One of the teams a permanent fence can be built by, with what it costs and when it is done. */
export interface TeamOptionWire {
  team: 1 | 2;
  /** "1-man team". */
  label: string;
  /** "$2,340". The whole run, materials and labour. */
  price: string;
  /** What it costs, when it is done and that it uses none of the player's day. */
  lines: string[];
  /** Why it can not be ordered, or null. */
  reason: string | null;
}

/** One speech bubble of the worker report: who says it and what they did, in plain words. */
export interface BubbleWire {
  seq: number;
  /** A hand's name, or "Fencing team" or "Pay day" for what is not one hand's. */
  who: string;
  text: string;
  date: DateParts;
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
  /** The farm's hands, the people looking for work and the standing with workers. */
  workforce: WorkforceWire;
  /** Contract fencing under way. */
  contracts: ContractWire[];
  /** The newest messages, newest first. */
  inbox: InboxWire[];
  /** Messages the player has not opened, counting the ones past those shown. */
  inboxUnread: number;
  /** The live year so far: its number and its score if it closed today. */
  score: { year: number; total: number };
  over: OverWire | null;
  /** What only a Daily Farm has. Null for a Fast Farm. */
  daily: DailyWire | null;
}

/** One game day the player was away for, as the diary has it. */
export interface CatchUpDay {
  day: number;
  date: DateParts;
  lines: string[];
}

/** What happened on the days the player did not open the farm, shown once before today starts. */
export interface CatchUpWire {
  days: CatchUpDay[];
  /** What the hands did while the player was away, one bubble each. */
  report: BubbleWire[];
}

/** A grazing plan move that is due and that no hand is there to make (PRD 5.15). */
export interface PlanDueWire {
  mob: number;
  mobName: string;
  from: string | null;
  to: string;
  /** The step of the plan the move goes to, for `resumePlan`. */
  step: number;
  /** The plan card's words, as a fact: "Your grazing plan said today you would move from X to Y." */
  text: string;
}

/**
 * The part of a snapshot only a Daily Farm has. The clock is the server's: `endsAt` and
 * `serverNow` are both from the server, so the countdown can not be moved by the device's clock.
 */
export interface DailyWire {
  /** The farm's time zone, locked when it started. */
  timezone: string;
  /** Local midnight, which ends today, ms since 1970 on the server's clock. */
  endsAt: number;
  /** The server's clock when this was sent, ms since 1970. */
  serverNow: number;
  /** The day has ended and the farm is waiting for yesterday's weather and prices, so no job can start yet. */
  waiting: string | null;
  work: DailyWork;
  /** Days passed while the player was away, until they have seen them. */
  catchUp: CatchUpWire | null;
  /** Plan moves due today that no hand will make. */
  planDue: PlanDueWire[];
}

/** What the game over screen shows. */
export interface OverWire {
  /** Why the game ended, in words. */
  text: string;
  /** Days the farm ran. */
  days: number;
  /** Each year's score, the year under way last. */
  /** `partDays` is set for the year under way, which is counted as if it closed on the last day. */
  years: { n: number; total: number; partDays: number | null }[];
  /** The scores added up. */
  total: number;
  /** Net worth at the end, dollars. */
  worth: number;
}

/** One part of a year's score, in points. */
export interface ScorePartWire {
  key: 'profit' | 'gain' | 'util' | 'cover' | 'death';
  label: string;
  pts: number;
}

/** A farm year, finished or under way, as words and figures. */
export interface YearView {
  n: number;
  title: string;
  total: number;
  parts: ScorePartWire[];
  /** Plain sentences from the year's figures. */
  facts: string[];
  /** Money in (positive) and out (negative) for the year. Rows that are zero are left out. */
  money: { label: string; dollars: number }[];
}

/** One day in the diary. The days are kept by the server, newest 400 only. */
export interface DiaryDay {
  day: number;
  date: DateParts;
  lines: string[];
}

/** The Scores and Diary panels' data. `earlier` is the `before` to send for older diary days, or null. */
export interface RecordResponse {
  soFar: YearView;
  /** Finished years, newest first. */
  years: YearView[];
  diary: DiaryDay[];
  earlier: number | null;
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
  | { ok: true; card: JobCardWire; version: string; teams?: TeamOptionWire[] }
  | (Refusal & { version: string; teams?: TeamOptionWire[] });

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
  money: {
    sales: number;
    buys: number;
    /** Supplements and the feedlot only. */
    feed: number;
    /** Dollars from grain. */
    grain: number;
    running: number;
    interest: number;
    /** Contract fencing charged: infrastructure, in no other row. */
    contract: number;
    /** Wages and super paid. They are in `running` too. */
    wages: number;
  };
  arrived: { head: number; calves: number };
  bookedSold: { head: number; net: number };
  /** Where a grazing plan moved a mob, one line for each mob. */
  planMoves: string[];
  /** "X t DM of pasture grew. The cattle ate Y t DM." For a skip. Null for a day, or when nothing grew or was eaten. */
  growth: string | null;
  /** What the hands and the fencing team did while the player was away, one bubble each. */
  report: BubbleWire[];
  /** True when the report is stepped through before the summary (after a skip of days, or when something needs the player's eye). Otherwise it sits in the summary. */
  reportFirst: boolean;
  /** Plain facts about why a skip stopped early, or something to know. */
  stops: string[];
  /** True when nothing ran because of water, and a "run anyway" is allowed. */
  canRunAnyway: boolean;
}

export interface DayResponse {
  ok: true;
  snapshot: Snapshot;
  summary: SummaryWire;
  /** The last year that closed during this day or skip, or null. */
  yearEnd: YearView | null;
  /** How many years closed during it. */
  yearsClosed: number;
}

export interface FarmResponse {
  snapshot: Snapshot | null;
  /** Set when the farm is there but can not be opened: what to tell the player. */
  broken?: string;
  /** Set when the player is signed in and has more than one farm: the picker is shown first. */
  pick?: FarmListItem[];
  /** The farms of each mode the account may have, sent with the picker. */
  limits?: { fast: number; daily: number };
}

/** The two ways to play (PRD section 3). Daily Farm runs in real time, Fast Farm at the player's pace. */
export type FarmMode = 'daily' | 'fast';

/** Where a Daily Farm's work for today stands. A fact, never a nudge. */
export type DailyWork = 'not-started' | 'started' | 'done';

/** One farm in the picker (milestone 3.2). The id is the one the browser sends back to open or delete it. */
export interface FarmListItem {
  id: string;
  name: string;
  /** Daily Farm or Fast Farm. */
  mode: FarmMode;
  /** The farm's date as the game reports it. */
  date: DateParts | null;
  /** A Daily Farm's work for today. Null for a Fast Farm. */
  work: DailyWork | null;
  districtName: string;
  /** Farm day, from 0. The screens show day + 1. */
  day: number;
  /** When the farm was last played, ms since 1970. */
  lastPlayed: number;
  /** True for the farm that /play opens. */
  current: boolean;
}

export interface FarmsResponse {
  farms: FarmListItem[];
  /** Fast Farms the account may have at once, and how many are going. */
  limit: number;
  going: number;
  /** The same for Daily Farms. */
  dailyLimit: number;
  dailyGoing: number;
  signedIn: boolean;
}

/** The farm on a past day: the map and the paddock figures, read only (milestone 3.2, PRD 5.2). */
export interface PastDayWire {
  version: 1;
  day: number;
  date: DateParts;
  season: string;
  view: FarmView;
  paddocks: PaddockWire[];
}

export interface PastDaysResponse {
  /** Farm days that have a picture kept, newest first. */
  days: number[];
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
  /** Whether a Daily Farm can be started, and if not, why in plain words (milestone 3.3). */
  daily: DailyOffer;
}

/**
 * Daily Farm at setup. `open`: it can be started. `coming`: it is switched off or has no database
 * behind it, so setup shows the plain "coming" state. `guest`: it needs an account. `full`: the
 * account has all the Daily Farms it can have.
 */
export interface DailyOffer {
  state: 'open' | 'coming' | 'guest' | 'full';
  text: string;
  limit: number;
  going: number;
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
  /** Which mode the farm plays. Left out is a Fast Farm (milestone 3.3). */
  mode?: FarmMode;
  /** A Daily Farm's time zone, an IANA name from the device. It is locked when the farm starts (PRD 5.2). */
  timezone?: string;
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
  | { type: 'sow'; species: string; cells: number[] }
  | { type: 'hireHand'; person: string }
  | { type: 'letHandGo'; hand: string }
  | { type: 'orderContractFence'; edges: EdgeWire[]; team: 1 | 2 }
  | { type: 'cancelContractFence'; run: number };

export type SkipRequestLength = 'week' | 'month' | 'year';
