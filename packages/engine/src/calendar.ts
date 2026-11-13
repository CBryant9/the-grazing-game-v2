/**
 * The farm calendar.
 *
 * A farm starts on the 1st of a month in a given year. Every later day is a
 * whole number counted from that start (day 0). Days before the start are
 * negative; the pasture run-up uses them.
 *
 * This is calendar arithmetic only. It never reads the clock.
 */

/** When a farm starts. `month` is 0 for January through 11 for December. */
export interface FarmStart {
  year: number;
  month: number;
}

/** A calendar day. `month` is 0 to 11 and `date` is the day of the month, 1 to 31. */
export interface CalendarDate {
  year: number;
  month: number;
  date: number;
}

const DAY_MS = 86400000;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** A day and its month in words, for a message: "27 June". */
export const dayMonthText = (date: CalendarDate): string =>
  `${date.date} ${MONTH_NAMES[date.month]}`;

/** The calendar date of a farm day. Leap years are handled. */
export function dateAt(start: FarmStart, day: number): CalendarDate {
  const d = new Date(Date.UTC(start.year, start.month, 1) + day * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate() };
}

/**
 * Whole months from the farm's start month to the month a date falls in.
 * The start month is 0. Run-up months are negative.
 */
export function monthIndex(start: FarmStart, date: CalendarDate): number {
  return (date.year - start.year) * 12 + (date.month - start.month);
}
