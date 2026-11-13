/**
 * Seasons from real weather, for a game played in real years.
 *
 * This sits behind the same interface as the MVP's random seasons
 * (factors.ts). For each farm day it gives:
 *
 *   monthF   the day's growth as a multiple of the district curve, from the
 *            soil water on the real date behind that farm day
 *   seasonF  how the season as a whole has gone: the feed the weather
 *            allowed over the last 12 months of the game, as a share of
 *            what the district curve gives for the same days
 *   label    the season in the same words the random seasons use
 *
 * The formulas are in docs/MODEL.md, section 1A.
 */

import { dateAt, type CalendarDate } from '../calendar';
import { districtPotential } from '../pasture/potential';
import type { GrowthFactorSource, GrowthFactors } from './factors';
import { RUN_UP_DAYS, RUN_UP_SEASON_FLOOR, SEASON_OUTLOOKS } from './randomSeasons';
import { playableYears, type RealYearPlan } from './realYears';
import type { WeatherGrowth } from './weatherGrowth';

/**
 * How far back the season factor looks, in days. A whole year, so every
 * part of the growing season is counted once whatever the date. A tuning
 * value.
 */
export const SEASON_WINDOW_DAYS = 365;

/**
 * Where one season label ends and the next begins, as season factors. The
 * labels are the random seasons' own, in the same order. Each edge is
 * halfway between two of the MVP's season factors, except 0.8. Under 0.8
 * the grass model hays green feed off faster, so the words and the grass
 * change together. Tuning values.
 */
export const SEASON_LABEL_EDGES: readonly number[] = [0.6, 0.8, 0.925, 1.075, 1.25];

/** The season in words, for a season factor. */
export function seasonLabel(seasonF: number): string {
  let i = 0;
  while (i < SEASON_LABEL_EDGES.length && seasonF >= SEASON_LABEL_EDGES[i]!) i++;
  return SEASON_OUTLOOKS[i]!.label;
}

/**
 * The real years a farm in this district can start in, oldest first, for a
 * start month (0 for January). Each has its whole 12 months in the weather
 * table, and enough days before it for the pasture run-up and the look
 * back over the season.
 */
export function weatherYears(growth: WeatherGrowth, startMonth = 0): number[] {
  return playableYears(growth.first, growth.last, startMonth, RUN_UP_DAYS + SEASON_WINDOW_DAYS);
}

export interface WeatherSeasonsOptions {
  /** The district's growth factors (see `buildWeatherGrowth`). */
  growth: WeatherGrowth;
  /** The game's real years (see `planRealYears`). */
  plan: RealYearPlan;
  /** Length of the pasture run-up before day 0. */
  runUpDays?: number;
  /**
   * The run-up never grows less than this share of an average year,
   * so a farm doesn't start straight after a very dry spell
   * (docs/LESSONS.md, lesson 7). 0 leaves the run-up as it really was.
   */
  runUpFloor?: number;
}

export interface WeatherSeasons extends GrowthFactorSource {
  /** Real rain on a farm day, mm, straight from the weather table. */
  rainOn(day: number): number;
  /** Water in the soil at the end of a farm day, mm. */
  soilWaterOn(day: number): number;
  /** The real date behind a farm day. */
  realDateOn(day: number): CalendarDate;
}

/** Growth factors from real weather for one farm. */
export function weatherSeasons(options: WeatherSeasonsOptions): WeatherSeasons {
  const { growth, plan } = options;
  const { district } = growth;
  const runUpDays = options.runUpDays ?? RUN_UP_DAYS;
  const runUpFloor = options.runUpFloor ?? RUN_UP_SEASON_FLOOR;
  if (!(runUpFloor >= 0 && runUpFloor <= 1)) {
    throw new RangeError(`The run-up floor is a share from 0 to 1, not ${runUpFloor}.`);
  }
  if (!Number.isInteger(runUpDays) || runUpDays < 0) {
    throw new RangeError(`The run-up is a whole number of days, not ${runUpDays}.`);
  }

  // What the district curve gives on a farm day, kg DM/ha. The weight each
  // day carries in an average over a stretch of days.
  const curves = new Map<number, number>();
  const curve = (day: number): number => {
    let c = curves.get(day);
    if (c === undefined) {
      c = districtPotential(district, dateAt(plan.start, day));
      curves.set(day, c);
    }
    return c;
  };
  // The factor the real weather gives on a farm day.
  const real = (day: number): number => growth.factorOn(plan.realDateOn(day));

  // The run-up. If the real weather before the start grew less than the
  // floor, each run-up day is moved part of the way to an average day, by
  // the one share that brings the run-up as a whole up to the floor.
  let towardsAverage: number | undefined;
  const runUpShare = (): number => {
    if (towardsAverage === undefined) {
      let grown = 0;
      let average = 0;
      for (let day = -runUpDays; day < 0; day++) {
        const c = curve(day);
        grown += c * real(day);
        average += c;
      }
      const went = average > 0 ? grown / average : 1;
      towardsAverage = went < runUpFloor ? (runUpFloor - went) / (1 - went) : 0;
    }
    return towardsAverage;
  };

  // The factor the farm is given each day, and that day's weight, kept
  // once worked out.
  const given = new Map<number, number>();
  const monthFOn = (day: number): number => {
    let f = given.get(day);
    if (f === undefined) {
      f = real(day);
      if (day < 0) f += runUpShare() * (1 - f);
      given.set(day, f);
    }
    return f;
  };

  const seasons = new Map<number, number>();
  const seasonFOn = (day: number): number => {
    let s = seasons.get(day);
    if (s === undefined) {
      let grown = 0;
      let average = 0;
      for (let k = day - SEASON_WINDOW_DAYS + 1; k <= day; k++) {
        const c = curve(k);
        grown += c * monthFOn(k);
        average += c;
      }
      s = average > 0 ? grown / average : 1;
      seasons.set(day, s);
    }
    return s;
  };

  return {
    factorsOn(day: number): GrowthFactors {
      if (!Number.isInteger(day)) throw new RangeError(`${day} is not a farm day.`);
      const seasonF = seasonFOn(day);
      return { seasonF, monthF: monthFOn(day), label: seasonLabel(seasonF) };
    },
    rainOn: (day) => growth.rainOn(plan.realDateOn(day)),
    soilWaterOn: (day) => growth.soilWaterOn(plan.realDateOn(day)),
    realDateOn: (day) => plan.realDateOn(day),
  };
}
