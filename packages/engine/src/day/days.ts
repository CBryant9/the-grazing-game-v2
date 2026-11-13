/**
 * Next day and skips (PRD 5.3; docs/MODEL.md, section 9).
 *
 * `endDay` is "Next day": the player drives home, the daily tick runs, and
 * a new day starts at first light with the player at the homestead. Work
 * booked with a contractor for the new day is done at first light.
 *
 * `skipDays` runs a week, a month or a year. Each day still has its own
 * light. Jobs in progress carry on, oldest first, each using what is left
 * of the day in turn. The skip stops early for everything the MVP stopped
 * its clock for, and says why.
 *
 * Neither changes the farm it is given. Both return what happened as
 * facts and figures: no praise, no blame.
 */

import { tryAction, workingCopy, type ActionEnv } from '../actions/apply';
import type { ActionRefusalReason, ActionType } from '../actions/types';
import type { CalendarDate } from '../calendar';
import type { DeathCause } from '../cattle/simMob';
import type { FieldYield } from '../crops/fields';
import { SKIP_DAYS, type SkipLength } from '../data/jobTimes';
import type { SpeciesId } from '../data/species';
import { GRID_N } from '../grid';
import { netWorth } from '../money/worth';
import { coverPct } from '../pasture/summary';
import { homesteadPoint, lightLeft } from '../sim/clock';
import { areaIdOf, dateOn, realSourcesOf, surveyOf } from '../sim/derived';
import type { FarmEvent } from '../sim/events';
import { toInbox, type FarmState, type GameOverReason, type YearTotals } from '../sim/state';
import { mobSummaries, type MobSummary } from '../sim/summary';
import { stepDay, type DayResult, type TickEnv } from '../sim/tick';
import { NO_TIME, applyAction, jobShare } from './act';
import { driveMinutes } from './travel';

/** What the working day can be given: the tick's sources. The clock is always on. */
export type DayEnv = TickEnv;

/** A figure before and after a stretch of days. */
export interface Change {
  before: number;
  after: number;
}

/** A job in progress over a stretch of days. */
export interface JobProgress {
  jobId: number;
  action: ActionType;
  /** The share of the job done, 0 to 1. */
  doneShare: Change;
  finished: boolean;
  /** Minutes worked on it and minutes driven to it over the stretch. */
  workedMin: number;
  travelMin: number;
}

/** A job in progress that could not carry on, on the last day it was tried. */
export interface JobWaiting {
  jobId: number;
  action: ActionType;
  reason: ActionRefusalReason;
  /** Why, in plain words. */
  message: string;
}

/** What happened over a day or a skip, as facts and figures (CLAUDE.md rule 10). */
export interface PeriodSummary {
  fromDay: number;
  toDay: number;
  /** The date the game reports on the first day, and on the day the farm is at now. */
  fromDate: CalendarDate;
  toDate: CalendarDate;
  daysRun: number;
  cash: Change;
  netWorth: Change;
  /** Head on the farm, not counting calves. */
  head: Change;
  calves: Change;
  /** Live weight of every animal on the farm, kg. */
  liveWeightKg: Change;
  /** Feed across the farm, kg DM/ha: all of it, and the green part. */
  massKgHa: Change;
  greenKgHa: Change;
  /** Ground cover across the pasture, %. */
  coverPct: Change;
  births: number;
  deaths: number;
  deathsByCause: Partial<Record<DeathCause, number>>;
  /** Feed grown and eaten, kg DM, and live weight gained, kg. */
  grownKg: number;
  eatenKg: number;
  gainKg: number;
  /** Dollars in and out, by kind. */
  money: {
    sales: number;
    buys: number;
    feed: number;
    grain: number;
    crops: number;
    infra: number;
    running: number;
    interest: number;
  };
  /** Each job in progress that was worked on. */
  jobs: JobProgress[];
  /** Each job in progress that could not carry on, and why. */
  jobsWaiting: JobWaiting[];
  /** Contractors' work done, and work that could not be done. */
  bookingsDone: number;
  bookingsFailed: number;
  /** Every mob as it stands now, with its figures from its last day. */
  mobs: MobSummary[];
  /** How many of each kind of event happened. */
  events: Record<string, number>;
}

/** Why a skip stopped early. */
export type SkipStop =
  /**
   * A mob has no water. `before`: found before the skip ran a day, so
   * nothing has happened. `during`: a mob had its first day without water.
   * Everything dies on day 4 without water.
   */
  | {
      type: 'no-water';
      when: 'before' | 'during';
      mob: number;
      mobName: string;
      area: string | null;
    }
  /** Found before the skip ran a day: a portable trough has under 3 days of water at its last day's use. */
  | { type: 'trough-low'; when: 'before'; portId: number; cell: number; daysLeft: number }
  /** A portable trough ran dry. */
  | { type: 'trough-empty'; portId: number; cell: number; paddock: string }
  /** A crop is ready to harvest. */
  | { type: 'harvest-ready'; fieldId: number; sp: SpeciesId; estimate: FieldYield }
  /** A year closed. `year` counts from 1. */
  | { type: 'year-end'; year: number }
  | { type: 'game-over'; reason: GameOverReason };

/** What "Next day" returns. */
export interface DayEnd {
  /** The farm at first light on the new day. */
  farm: FarmState;
  /** What the daily tick reported. */
  day: DayResult;
  /** Minutes of light left unused when the day ended, and the drive home from where the player was. */
  lightLeftMin: number;
  homeMin: number;
  /** What happened at first light on the new day: contractors' work. */
  dawn: FarmEvent[];
  /** Everything that would stop a skip, had this day been part of one. */
  stops: SkipStop[];
  summary: PeriodSummary;
}

/** What a skip returns. */
export interface SkipResult {
  /** The farm after the skip. The farm passed in, untouched, when nothing ran. */
  farm: FarmState;
  /** Days asked for, and days run. */
  asked: number;
  daysRun: number;
  /** Why it stopped early. Empty when every day asked for was run. */
  stops: SkipStop[];
  /** What the daily tick reported, day by day. */
  days: DayResult[];
  /** What happened at each first light: contractors' work. */
  dawn: { day: number; events: FarmEvent[] }[];
  summary: PeriodSummary;
}

export interface SkipOptions {
  /**
   * True runs the skip even though a mob has no water or a portable
   * trough is nearly dry. The MVP asked "Run time anyway".
   */
  anyway?: boolean;
}

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

const TOTAL_KEYS = [
  'grown',
  'eaten',
  'gain',
  'births',
  'deaths',
  'sales',
  'buys',
  'feed',
  'grain',
  'crops',
  'infra',
  'running',
  'interest',
] as const satisfies readonly (keyof YearTotals)[];
type TotalKey = (typeof TOTAL_KEYS)[number];

/** A farm's figures at one moment. */
interface Snapshot {
  day: number;
  date: CalendarDate;
  cash: number;
  netWorth: number;
  head: number;
  calves: number;
  liveWeightKg: number;
  massKgHa: number;
  greenKgHa: number;
  coverPct: number;
  /** Running totals over the farm's whole life: finished years and the year under way. */
  totals: Record<TotalKey, number>;
  jobs: Map<number, { action: ActionType; share: number; workedMin: number; travelMin: number }>;
}

function snapshot(farm: FarmState): Snapshot {
  let head = 0;
  let calves = 0;
  let kg = 0;
  for (const m of farm.mobs) {
    for (const a of m.animals) {
      if (a.kind === 'calf') calves++;
      else head++;
      kg += a.wt;
    }
  }
  let g = 0;
  let d = 0;
  for (let i = 0; i < GRID_N; i++) {
    g += farm.pasture.G[i]!;
    d += farm.pasture.D[i]!;
  }
  const totals = {} as Record<TotalKey, number>;
  for (const k of TOTAL_KEYS) {
    let t = farm.year[k];
    for (const y of farm.years) t += y[k];
    totals[k] = t;
  }
  const jobs: Snapshot['jobs'] = new Map();
  for (const j of farm.jobs) {
    jobs.set(j.id, {
      action: j.action.type,
      share: jobShare(j),
      workedMin: j.workedMin,
      travelMin: j.travelMin,
    });
  }
  return {
    day: farm.day,
    date: dateOn(farm),
    cash: farm.cash,
    netWorth: netWorth(farm),
    head,
    calves,
    liveWeightKg: kg,
    massKgHa: (g + d) / GRID_N,
    greenKgHa: g / GRID_N,
    coverPct: coverPct(farm.pasture),
    totals,
    jobs,
  };
}

/** What was seen along the way that the two snapshots can't show. */
interface Seen {
  events: FarmEvent[];
  deaths: DayResult['deaths'];
  waiting: Map<number, JobWaiting>;
  /** Minutes worked and driven on each job, from the job events. */
  worked: Map<
    number,
    { action: ActionType; workedMin: number; travelMin: number; finished: boolean }
  >;
}

const newSeen = (): Seen => ({ events: [], deaths: [], waiting: new Map(), worked: new Map() });

function see(seen: Seen, events: readonly FarmEvent[]): void {
  for (const e of events) {
    seen.events.push(e);
    if (e.type !== 'job-worked' || e.jobId === null) continue;
    const w = seen.worked.get(e.jobId) ?? {
      action: e.action,
      workedMin: 0,
      travelMin: 0,
      finished: false,
    };
    w.workedMin += e.workMin;
    w.travelMin += e.travelMin;
    w.finished = w.finished || e.finished;
    seen.worked.set(e.jobId, w);
  }
}

function summarise(a: Snapshot, farm: FarmState, seen: Seen): PeriodSummary {
  const b = snapshot(farm);
  const change = (
    k:
      | 'cash'
      | 'netWorth'
      | 'head'
      | 'calves'
      | 'liveWeightKg'
      | 'massKgHa'
      | 'greenKgHa'
      | 'coverPct',
  ): Change => ({
    before: a[k],
    after: b[k],
  });
  const total = (k: TotalKey): number => b.totals[k] - a.totals[k];
  const deathsByCause: Partial<Record<DeathCause, number>> = {};
  for (const d of seen.deaths) deathsByCause[d.cause] = (deathsByCause[d.cause] ?? 0) + 1;
  const counts: Record<string, number> = {};
  let bookingsDone = 0;
  let bookingsFailed = 0;
  for (const e of seen.events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type === 'booking-done') bookingsDone++;
    if (e.type === 'booking-failed') bookingsFailed++;
  }
  const jobs: JobProgress[] = [];
  for (const [jobId, w] of seen.worked) {
    const was = a.jobs.get(jobId);
    const now = b.jobs.get(jobId);
    jobs.push({
      jobId,
      action: w.action,
      doneShare: { before: was ? was.share : 0, after: now ? now.share : w.finished ? 1 : 0 },
      finished: w.finished,
      workedMin: w.workedMin,
      travelMin: w.travelMin,
    });
  }
  // A job that is finished or gone is no longer waiting.
  const jobsWaiting = [...seen.waiting.values()].filter((w) => b.jobs.has(w.jobId));
  return {
    fromDay: a.day,
    toDay: b.day,
    fromDate: a.date,
    toDate: b.date,
    daysRun: b.day - a.day,
    cash: change('cash'),
    netWorth: change('netWorth'),
    head: change('head'),
    calves: change('calves'),
    liveWeightKg: change('liveWeightKg'),
    massKgHa: change('massKgHa'),
    greenKgHa: change('greenKgHa'),
    coverPct: change('coverPct'),
    births: total('births'),
    deaths: total('deaths'),
    deathsByCause,
    grownKg: total('grown'),
    eatenKg: total('eaten'),
    gainKg: total('gain'),
    money: {
      sales: total('sales'),
      buys: total('buys'),
      feed: total('feed'),
      grain: total('grain'),
      crops: total('crops'),
      infra: total('infra'),
      running: total('running'),
      interest: total('interest'),
    },
    jobs,
    jobsWaiting,
    bookingsDone,
    bookingsFailed,
    mobs: mobSummaries(farm),
    events: counts,
  };
}

// ---------------------------------------------------------------------------
// What stops a skip
// ---------------------------------------------------------------------------

/** A portable trough with under this many days of water, at its last day's use, stops a skip before it starts. */
export const TROUGH_LOW_DAYS = 3;

/**
 * The MVP's "Check the water first", asked before +1 week and +1 month:
 * every mob on ground with no water, and every portable trough with under
 * 3 days left at the rate it was last used.
 */
export function waterCheck(farm: FarmState): SkipStop[] {
  const stops: SkipStop[] = [];
  const survey = surveyOf(farm);
  for (const m of farm.mobs) {
    if (m.where.kind !== 'paddock' || !m.animals.length) continue;
    const id = areaIdOf(survey, m);
    if (survey.points.areaTroughs[id]!.length) continue;
    stops.push({
      type: 'no-water',
      when: 'before',
      mob: m.id,
      mobName: m.name,
      area: survey.topology.areas[id]!.name,
    });
  }
  for (const pt of farm.layout.water.ports) {
    if (pt.lastUse > 0 && pt.level / pt.lastUse < TROUGH_LOW_DAYS) {
      stops.push({
        type: 'trough-low',
        when: 'before',
        portId: pt.id,
        cell: pt.cell,
        daysLeft: Math.max(0, Math.floor(pt.level / pt.lastUse)),
      });
    }
  }
  return stops;
}

/**
 * What in a day's events stops a skip. These are the MVP's stops: a mob's
 * first day without water, a portable trough run dry, a crop ready to
 * harvest, the end of a year, and game over.
 */
export function stopsIn(day: DayResult): SkipStop[] {
  const stops: SkipStop[] = [];
  for (const e of day.events) {
    if (e.type === 'cattle' && e.note.type === 'noWater' && e.note.days === 1) {
      stops.push({
        type: 'no-water',
        when: 'during',
        mob: e.mob,
        mobName: e.mobName,
        area: e.area,
      });
    } else if (e.type === 'water' && e.event.type === 'portable-empty') {
      stops.push({
        type: 'trough-empty',
        portId: e.event.portId,
        cell: e.event.cell,
        paddock: e.paddock,
      });
    } else if (e.type === 'crop' && e.event.type === 'harvest-ready') {
      stops.push({
        type: 'harvest-ready',
        fieldId: e.event.fieldId,
        sp: e.event.sp,
        estimate: e.event.estimate,
      });
    } else if (e.type === 'year-end') stops.push({ type: 'year-end', year: e.year.n });
    else if (e.type === 'game-over') stops.push({ type: 'game-over', reason: e.reason });
  }
  return stops;
}

// ---------------------------------------------------------------------------
// The day's end, and first light
// ---------------------------------------------------------------------------

/**
 * At first light: contractors do the work booked for today, in the order
 * it was booked. The work is charged now. Work that can't be done (the
 * bank won't lend, the crop is gone) is dropped, with the reason.
 */
function firstLight(farm: FarmState, env: ActionEnv): { farm: FarmState; events: FarmEvent[] } {
  const due = farm.bookings.filter((b) => b.dueDay <= farm.day);
  if (!due.length || farm.over) return { farm, events: [] };
  let cur = farm;
  const events: FarmEvent[] = [];
  for (const b of due) {
    const done = tryAction(cur, b.action, env);
    if (done.ok) {
      cur = done.farm;
      events.push({ type: 'booking-done', bookingId: b.id, action: b.action.type }, ...done.events);
    } else {
      events.push({
        type: 'booking-failed',
        bookingId: b.id,
        action: b.action.type,
        reason: done.reason,
        message: done.message,
      });
    }
  }
  if (cur === farm) cur = workingCopy(farm);
  const gone = new Set(due.map((b) => b.id));
  cur.bookings = cur.bookings.filter((b) => !gone.has(b.id));
  toInbox(cur, cur.day, events, cur.clock.firstLight);
  return { farm: cur, events };
}

/** End the day on a farm that may be changed freely: drive home, run the tick, start the new day. */
function closeDay(
  farm: FarmState,
  env: DayEnv,
): { farm: FarmState; day: DayResult; dawn: FarmEvent[]; lightLeftMin: number; homeMin: number } {
  const lightLeftMin = lightLeft(farm);
  const homeMin = driveMinutes(farm, farm.clock.at, homesteadPoint(farm));
  const day = stepDay(farm, env);
  const dawn = firstLight(farm, clockEnv(env));
  return { farm: dawn.farm, day, dawn: dawn.events, lightLeftMin, homeMin };
}

/** The sources an action needs, taken from the day's. The clock is never switched off here. */
const clockEnv = (env: DayEnv): ActionEnv => ({
  ...(env.seasons ? { seasons: env.seasons } : {}),
  ...(env.data ? { data: env.data } : {}),
});

/**
 * "Next day". The player drives home, the daily tick runs, and the new
 * day starts at first light with the player at the homestead. Jobs in
 * progress are not worked: they carry on when the player spends daylight
 * on them, or during a skip. The farm passed in is never changed.
 */
export function endDay(farm: FarmState, env: DayEnv = {}): DayEnd {
  realSourcesOf(farm, env);
  const before = snapshot(farm);
  const seen = newSeen();
  const closed = closeDay(workingCopy(farm), env);
  see(seen, closed.day.events);
  see(seen, closed.dawn);
  seen.deaths.push(...closed.day.deaths);
  return {
    farm: closed.farm,
    day: closed.day,
    lightLeftMin: closed.lightLeftMin,
    homeMin: closed.homeMin,
    dawn: closed.dawn,
    stops: farm.over ? [{ type: 'game-over', reason: farm.over.reason }] : stopsIn(closed.day),
    summary: summarise(before, closed.farm, seen),
  };
}

/**
 * Skip a week, a month, a year or a number of days.
 *
 * Before the first day, unless `anyway` is set, the water is checked as
 * the MVP did: with a mob on dry ground or a portable trough nearly empty
 * nothing runs, and the stops say why. Then, each day:
 *
 *   1. jobs in progress carry on, oldest first, each using what is left
 *      of the day's light in turn;
 *   2. the player drives home and the daily tick runs;
 *   3. at first light, contractors do the work booked for the new day;
 *   4. the skip stops if the day held a reason to (`stopsIn`).
 *
 * The farm passed in is never changed.
 */
export function skipDays(
  farm: FarmState,
  length: SkipLength | number,
  env: DayEnv = {},
  options: SkipOptions = {},
): SkipResult {
  const asked = typeof length === 'number' ? length : SKIP_DAYS[length];
  if (!Number.isInteger(asked) || asked < 1) {
    throw new RangeError('A skip runs a whole number of days, 1 or more.');
  }
  realSourcesOf(farm, env);
  const before = snapshot(farm);
  const seen = newSeen();
  const nothing = (stops: SkipStop[]): SkipResult => ({
    farm,
    asked,
    daysRun: 0,
    stops,
    days: [],
    dawn: [],
    summary: summarise(before, farm, seen),
  });
  if (farm.over) return nothing([{ type: 'game-over', reason: farm.over.reason }]);
  if (!options.anyway) {
    const dry = waterCheck(farm);
    if (dry.length) return nothing(dry);
  }

  const acting = clockEnv(env);
  let cur = workingCopy(farm);
  const days: DayResult[] = [];
  const dawn: SkipResult['dawn'] = [];
  let stops: SkipStop[] = [];
  for (let i = 0; i < asked; i++) {
    // 1. Jobs in progress, oldest first.
    for (const id of cur.jobs.map((j) => j.id)) {
      if (lightLeft(cur) <= NO_TIME) break;
      const job = cur.jobs.find((j) => j.id === id);
      if (!job) continue;
      const done = applyAction(cur, { type: 'continueJob', job: id }, acting);
      if (done.ok) {
        cur = done.farm;
        see(seen, done.events);
        seen.waiting.delete(id);
      } else {
        seen.waiting.set(id, {
          jobId: id,
          action: job.action.type,
          reason: done.reason,
          message: done.message,
        });
      }
    }
    // 2 and 3. The day ends and the next begins.
    const closed = closeDay(cur, env);
    cur = closed.farm;
    days.push(closed.day);
    see(seen, closed.day.events);
    seen.deaths.push(...closed.day.deaths);
    if (closed.dawn.length) {
      dawn.push({ day: cur.day, events: closed.dawn });
      see(seen, closed.dawn);
    }
    // 4. Anything that stops the skip.
    stops = stopsIn(closed.day);
    if (stops.length) break;
  }
  return {
    farm: cur,
    asked,
    daysRun: days.length,
    stops,
    days,
    dawn,
    summary: summarise(before, cur, seen),
  };
}
