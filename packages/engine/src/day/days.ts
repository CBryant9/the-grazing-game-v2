/**
 * Next day and skips (PRD 5.3; docs/MODEL.md, section 9).
 *
 * `endDay` is "Next day": the daily tick runs and a new day starts at
 * first light.
 *
 * `skipDays` runs a week, a month or a year. Each day still has its own
 * light, though nothing uses it: no job carries over from one day to the
 * next. The skip stops early for everything the MVP stopped its clock for,
 * and says why.
 *
 * Neither changes the farm it is given. Both return what happened as
 * facts and figures: no praise, no blame.
 */

import { workingCopy } from '../actions/apply';
import type { CalendarDate } from '../calendar';
import type { DeathCause } from '../cattle/simMob';
import type { FieldYield } from '../crops/fields';
import { SKIP_DAYS, type SkipLength } from '../data/jobTimes';
import type { SpeciesId } from '../data/species';
import { GRID_N } from '../grid';
import { netWorth } from '../money/worth';
import { coverPct } from '../pasture/summary';
import { lightLeft } from '../sim/clock';
import { areaIdOf, dateOn, realSourcesOf, surveyOf } from '../sim/derived';
import type { FarmEvent } from '../sim/events';
import type { FarmState, GameOverReason, YearTotals } from '../sim/state';
import { mobSummaries, type MobSummary } from '../sim/summary';
import { stepDay, type DayResult, type TickEnv } from '../sim/tick';
import { dawn } from './dawn';

/** What the working day can be given: the tick's sources. */
export type DayEnv = TickEnv;

/** A figure before and after a stretch of days. */
export interface Change {
  before: number;
  after: number;
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
  /** Every mob as it stands now, with its figures from its last day. */
  mobs: MobSummary[];
  /** How many of each kind of event happened. */
  events: Record<string, number>;
  /** Cattle that landed in the yards, bought on a sale day. Head, not counting calves at foot. */
  arrived: { head: number; calves: number };
  /** Booked stock sold at first light on a sale day: head, calves at foot and dollars banked. */
  bookedSold: { head: number; calvesAtFoot: number; net: number };
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
  | { type: 'game-over'; reason: GameOverReason }
  /**
   * A grazing plan could not move a mob because the next area has no water.
   * The old game stopped its clock for this, once for each stop the plan was
   * waiting for. `step` counts the stops from the first stop of the first leg.
   */
  | {
      type: 'plan-waiting';
      mob: number;
      mobName: string;
      area: string;
      step: number;
    };

/** What "Next day" returns. */
export interface DayEnd {
  /** The farm at first light on the new day. */
  farm: FarmState;
  /** What the daily tick reported. */
  day: DayResult;
  /** What happened at first light on the new day: cattle landing in the yards, booked stock sold. */
  dawn: FarmEvent[];
  /** Minutes of light left unused when the day ended, after any moves a grazing plan made. */
  lightLeftMin: number;
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
  /** What happened at first light on each new day, in order. */
  dawn: FarmEvent[];
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
  };
}

function summarise(
  a: Snapshot,
  farm: FarmState,
  days: readonly DayResult[],
  dawnEvents: readonly FarmEvent[],
): PeriodSummary {
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
  ): Change => ({ before: a[k], after: b[k] });
  const total = (k: TotalKey): number => b.totals[k] - a.totals[k];
  const deathsByCause: Partial<Record<DeathCause, number>> = {};
  const counts: Record<string, number> = {};
  for (const day of days) {
    for (const d of day.deaths) deathsByCause[d.cause] = (deathsByCause[d.cause] ?? 0) + 1;
    for (const e of day.events as readonly FarmEvent[]) counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  const arrived = { head: 0, calves: 0 };
  const bookedSold = { head: 0, calvesAtFoot: 0, net: 0 };
  for (const e of dawnEvents) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type === 'cattle-arrived') {
      arrived.head += e.head;
      arrived.calves += e.calves;
    } else if (e.type === 'cattle-sold' && e.booked) {
      bookedSold.head += e.head;
      bookedSold.calvesAtFoot += e.calvesAtFoot;
      bookedSold.net += e.net;
    }
  }
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
    mobs: mobSummaries(farm),
    events: counts,
    arrived,
    bookedSold,
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
 * harvest, the end of a year, and game over; and a plan that can not move
 * a mob because the next area has no water.
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
    } else if (e.type === 'plan-waiting' && e.why === 'no-water') {
      stops.push({
        type: 'plan-waiting',
        mob: e.mob,
        mobName: e.mobName,
        area: e.area,
        step: e.step,
      });
    } else if (e.type === 'year-end') stops.push({ type: 'year-end', year: e.year.n });
    else if (e.type === 'game-over') stops.push({ type: 'game-over', reason: e.reason });
  }
  return stops;
}

// ---------------------------------------------------------------------------
// Next day and skips
// ---------------------------------------------------------------------------

/**
 * "Next day". The daily tick runs and the new day starts at first light.
 * It is exactly the daily tick on a copy. The farm passed in is never
 * changed.
 */
export function endDay(farm: FarmState, env: DayEnv = {}): DayEnd {
  realSourcesOf(farm, env);
  const before = snapshot(farm);
  const next = workingCopy(farm);
  const day = stepDay(next, env);
  // Plan moves take none of the day's light, as in the old game.
  const lightLeftMin = lightLeft(farm);
  // First light on the new day: cattle land, booked stock sells. Before the player can act.
  const atDawn = dawn(next, env);
  return {
    farm: next,
    day,
    dawn: atDawn,
    lightLeftMin,
    stops: farm.over ? [{ type: 'game-over', reason: farm.over.reason }] : stopsIn(day),
    summary: summarise(before, next, [day], atDawn),
  };
}

/**
 * Skip a week, a month, a year or a number of days.
 *
 * Before the first day, unless `anyway` is set, the water is checked as
 * the MVP did: with a mob on dry ground or a portable trough nearly empty
 * nothing runs, and the stops say why. Then the daily tick runs day after
 * day, and the skip stops after any day that held a reason to (`stopsIn`).
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
  const nothing = (stops: SkipStop[]): SkipResult => ({
    farm,
    asked,
    daysRun: 0,
    stops,
    days: [],
    dawn: [],
    summary: summarise(before, farm, [], []),
  });
  if (farm.over) return nothing([{ type: 'game-over', reason: farm.over.reason }]);
  if (!options.anyway) {
    const dry = waterCheck(farm);
    if (dry.length) return nothing(dry);
  }

  const cur = workingCopy(farm);
  const days: DayResult[] = [];
  const atDawn: FarmEvent[] = [];
  let stops: SkipStop[] = [];
  for (let i = 0; i < asked; i++) {
    const day = stepDay(cur, env);
    days.push(day);
    atDawn.push(...dawn(cur, env));
    stops = stopsIn(day);
    if (stops.length) break;
  }
  return {
    farm: cur,
    asked,
    daysRun: days.length,
    stops,
    days,
    dawn: atDawn,
    summary: summarise(before, cur, days, atDawn),
  };
}
