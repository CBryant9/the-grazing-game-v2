/**
 * Real years: which real year each year of a game is, and the real date
 * behind each farm day (PRD 5.14).
 *
 * A game year is the 12 months from the farm's start month. Game year 1 is
 * the year the player starts in. Each later game year is the next real year
 * in the chosen order: the years as they happened, or shuffled from the
 * farm's seed. Within a game year the real days run on without a break, so
 * a growing season that crosses New Year stays in one piece.
 *
 * The weather and the prices both read the real date from here, so they
 * always agree on what day it is.
 */

import { dateAt, monthIndex, type CalendarDate, type FarmStart } from '../calendar';
import { rngStream } from '../rng';
import { daySerial } from './weatherTable';

/** The earliest real year a game can be played in (PRD section 21, row 32). */
export const FIRST_REAL_YEAR = 1997;

/** Play the years as they happened, or shuffled. */
export type YearOrder = 'in-order' | 'random';

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The real years a game year can start in, oldest first.
 *
 * `first` and `last` are the first and last days there is data for. A year
 * is on the list when the whole 12 months from the 1st of `startMonth` are
 * inside the data, with `leadDays` of data before them (for the pasture
 * run-up and the look back over the season). With a January start these
 * are the full calendar years from 1997.
 */
export function playableYears(
  first: CalendarDate,
  last: CalendarDate,
  startMonth = 0,
  leadDays = 0,
): number[] {
  if (!Number.isInteger(startMonth) || startMonth < 0 || startMonth > 11) {
    throw new RangeError(`A start month is 0 (January) to 11 (December), not ${startMonth}.`);
  }
  const lo = daySerial(first);
  const hi = daySerial(last);
  const years: number[] = [];
  for (let year = FIRST_REAL_YEAR; year <= last.year; year++) {
    const from = daySerial({ year, month: startMonth, date: 1 });
    const to = daySerial({ year: year + 1, month: startMonth, date: 1 }) - 1;
    if (from - leadDays >= lo && to <= hi) years.push(year);
  }
  return years;
}

export interface RealYearPlanOptions {
  /** The years that can be played, oldest first (see `playableYears`). */
  years: readonly number[];
  order: YearOrder;
  /** The farm's seed. Only the random order draws from it. */
  seed: number;
  /** The month the farm starts in, 0 for January. January if left out. */
  startMonth?: number;
  /**
   * The year the player starts in. In order, the oldest year if left out.
   * At random, drawn from the seed if left out.
   */
  firstYear?: number;
}

export interface RealYearPlan {
  /** When the farm starts: the first real year and the start month. */
  start: FarmStart;
  order: YearOrder;
  years: readonly number[];
  /**
   * The game year a farm day falls in, counting from 0. The score calls
   * game year 0 "year 1". Run-up days, before day 0, are negative.
   */
  gameYearOn(day: number): number;
  /**
   * The real year a game year starts in. Game years before 0 are the real
   * years straight before the start.
   */
  yearAt(gameYear: number): number;
  /** The real date behind a farm day. This is the date the screen shows. */
  realDateOn(day: number): CalendarDate;
}

/**
 * Lay out a game's real years.
 *
 * In order: the first year, then each year after it. After the newest year
 * it goes back to the oldest.
 *
 * At random: every year once, shuffled, then all of them again in a new
 * shuffle. The same year never comes up twice in a row. The same seed
 * always gives the same years.
 */
export function planRealYears(options: RealYearPlanOptions): RealYearPlan {
  const { years, order, seed } = options;
  const startMonth = options.startMonth ?? 0;
  if (!Number.isInteger(startMonth) || startMonth < 0 || startMonth > 11) {
    throw new RangeError(`A start month is 0 (January) to 11 (December), not ${startMonth}.`);
  }
  if (years.length === 0) throw new Error('There are no real years to play.');
  for (let i = 0; i < years.length; i++) {
    if (!Number.isInteger(years[i]) || (i > 0 && years[i]! <= years[i - 1]!)) {
      throw new Error('The real years must be whole numbers, oldest first, each one once.');
    }
  }
  if (options.firstYear !== undefined && !years.includes(options.firstYear)) {
    throw new RangeError(`${options.firstYear} is not a year that can be played.`);
  }

  const count = years.length;
  // One shuffle of all the years for each time round. Worked out as needed and kept.
  const rounds: number[][] = [];
  const shuffled = (round: number): number[] => {
    while (rounds.length <= round) {
      const r = rounds.length;
      const list = [...years];
      const rng = rngStream(seed, `real-years:${r}`);
      for (let i = count - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [list[i], list[j]] = [list[j]!, list[i]!];
      }
      if (r === 0 && options.firstYear !== undefined) {
        const at = list.indexOf(options.firstYear);
        [list[0], list[at]] = [list[at]!, list[0]!];
      }
      // Never the same year twice running where one round meets the next.
      if (r > 0 && count > 1 && list[0] === rounds[r - 1]![count - 1]) {
        [list[0], list[1]] = [list[1]!, list[0]!];
      }
      rounds.push(list);
    }
    return rounds[round]!;
  };

  const firstYear = order === 'random' ? shuffled(0)[0]! : (options.firstYear ?? years[0]!);
  const firstAt = years.indexOf(firstYear);
  const start: FarmStart = { year: firstYear, month: startMonth };

  const yearAt = (gameYear: number): number => {
    if (!Number.isInteger(gameYear)) throw new RangeError(`${gameYear} is not a game year.`);
    if (gameYear < 0) return firstYear + gameYear;
    if (order === 'in-order') return years[(firstAt + gameYear) % count]!;
    return shuffled(Math.floor(gameYear / count))[gameYear % count]!;
  };

  const gameYearOn = (day: number): number =>
    Math.floor(monthIndex(start, dateAt(start, day)) / 12);

  const realDateOn = (day: number): CalendarDate => {
    // The farm's own calendar runs straight on from its start. Each game
    // year is moved, whole, onto its real year.
    const farm = dateAt(start, day);
    const gameYear = Math.floor(monthIndex(start, farm) / 12);
    const year = farm.year + (yearAt(gameYear) - (firstYear + gameYear));
    // 29 February on the farm's calendar in a real year without one reads
    // 28 February again. A real 29 February the farm's calendar does not
    // have is passed over.
    const date = farm.month === 1 && farm.date === 29 && !isLeapYear(year) ? 28 : farm.date;
    return { year, month: farm.month, date };
  };

  return { start, order, years, gameYearOn, yearAt, realDateOn };
}
