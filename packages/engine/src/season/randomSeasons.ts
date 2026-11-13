/**
 * The MVP's random seasons, drawn from the farm's seed.
 *
 * A season is drawn at the start and again every 1 July. Each month then
 * wobbles around the season. The pasture run-up before the farm starts has
 * its own near-normal season and a smaller wobble.
 *
 * The MVP drew these from an unseeded source, so its exact numbers can't be
 * repeated. The chances, ranges and limits here are the MVP's. Milestone 1.4
 * replaces this with real weather behind the same interface.
 */

import { dateAt, monthIndex, type FarmStart } from '../calendar';
import { clamp } from '../num';
import { rngStream, type Rng } from '../rng';
import type { GrowthFactorSource, GrowthFactors } from './factors';

export interface SeasonOutlook {
  /** Growth as a multiple of a normal season. */
  factor: number;
  label: string;
  /** How likely the season is, 0 to 1. The chances add to 1. */
  chance: number;
}

/** The six seasons and their chances (docs/DATA.md, Seasons). */
export const SEASON_OUTLOOKS: readonly SeasonOutlook[] = [
  { factor: 0.5, label: 'Drought', chance: 0.1 },
  { factor: 0.7, label: 'Well below average', chance: 0.14 },
  { factor: 0.85, label: 'Below average', chance: 0.2 },
  { factor: 1, label: 'Average', chance: 0.24 },
  { factor: 1.15, label: 'Above average', chance: 0.18 },
  { factor: 1.35, label: 'Wet', chance: 0.14 },
];

/** The month wobble: a random multiple of the season, then held within limits. */
export interface MonthWobble {
  lo: number;
  hi: number;
  min: number;
  max: number;
}

/** In play: 0.65 to 1.35 times the season, held between 0.15 and 1.9. */
export const PLAY_WOBBLE: MonthWobble = { lo: 0.65, hi: 1.35, min: 0.15, max: 1.9 };
/** In the run-up: 0.7 to 1.3 times the season, held between 0.2 and 1.8. */
export const RUN_UP_WOBBLE: MonthWobble = { lo: 0.7, hi: 1.3, min: 0.2, max: 1.8 };

/** The pasture runs for 540 days with no stock before the farm starts. */
export const RUN_UP_DAYS = 540;
/**
 * The run-up season is never worse than this, so a farm doesn't start
 * straight after a failed season (docs/LESSONS.md, lesson 7).
 */
export const RUN_UP_SEASON_FLOOR = 0.85;

/** Draw a season. Takes one number from the stream. */
export function drawSeason(rng: Pick<Rng, 'next'>): SeasonOutlook {
  let r = rng.next();
  for (const o of SEASON_OUTLOOKS) {
    if ((r -= o.chance) <= 0) return o;
  }
  // Only reached if rounding leaves a sliver after the last season.
  return SEASON_OUTLOOKS[3]!;
}

/** A month factor from a season factor and one number from the stream. */
export function monthFactor(seasonF: number, rng: Pick<Rng, 'range'>, w: MonthWobble): number {
  return clamp(seasonF * rng.range(w.lo, w.hi), w.min, w.max);
}

export interface RandomSeasonsOptions {
  /** The farm's seed. */
  seed: number;
  start: FarmStart;
  /** Length of the pasture run-up before day 0. */
  runUpDays?: number;
}

/**
 * Random seasons for a farm. Every season and every month has its own
 * named stream, so a day can be asked for in any order and always gets the
 * same answer, and nothing needs saving but the seed.
 */
export function randomSeasons(options: RandomSeasonsOptions): GrowthFactorSource {
  const { seed, start } = options;
  const runUpDays = options.runUpDays ?? RUN_UP_DAYS;
  const seasons = new Map<string, SeasonOutlook>();
  const months = new Map<number, number>();

  const season = (name: string): SeasonOutlook => {
    let s = seasons.get(name);
    if (!s) {
      s = drawSeason(rngStream(seed, `season:${name}`));
      seasons.set(name, s);
    }
    return s;
  };
  const month = (mi: number, seasonF: number, w: MonthWobble): number => {
    let f = months.get(mi);
    if (f === undefined) {
      f = monthFactor(seasonF, rngStream(seed, `month:${mi}`), w);
      months.set(mi, f);
    }
    return f;
  };

  return {
    factorsOn(day: number): GrowthFactors {
      const date = dateAt(start, day);
      const mi = monthIndex(start, date);

      if (day < 0) {
        // The run-up has one season. The label is the one drawn, as in the
        // MVP, even when the floor lifts the factor. It is never shown.
        const drawn = season('run-up');
        const seasonF = Math.max(RUN_UP_SEASON_FLOOR, drawn.factor);
        // The wobble starts on the first 1st of a month in the run-up.
        // Until then the month factor is the season factor.
        const firstOfThisMonth = day - (date.date - 1);
        const monthF = firstOfThisMonth >= -runUpDays ? month(mi, seasonF, RUN_UP_WOBBLE) : seasonF;
        return { seasonF, monthF, label: drawn.label };
      }

      // A new season each 1 July after day 0. Count the Julys so far.
      const julys = Math.floor((start.month + mi - 6) / 12) - Math.floor((start.month - 6) / 12);
      const s = season(String(julys));
      return { seasonF: s.factor, monthF: month(mi, s.factor, PLAY_WOBBLE), label: s.label };
    },
  };
}
