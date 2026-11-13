/**
 * The Consumer Price Index, and past prices in today's dollars.
 *
 * Real cattle prices from 1997 are in the dollars of their day. The game's
 * costs (fence, lick, overheads) are in today's dollars. So a past price is
 * lifted by the rise in consumer prices since: a 1997 price of 90 c/kg
 * reads as about 200 c/kg.
 *
 *   price in today's dollars = price of the day × CPI(base quarter) ÷ CPI(the day's quarter)
 *
 * The table is the Australian Bureau of Statistics' All groups CPI, by
 * quarter (docs/DATA.md, "Inflation"). The engine never reads the file:
 * the text is handed to `parseCpiTable`.
 */

import type { CalendarDate } from '../calendar';

export interface CpiTable {
  /** The first quarter in the table, as a quarter number (see `quarterNumber`). */
  firstQuarter: number;
  /** The index number for each quarter from the first. */
  index: readonly number[];
}

/** A quarter of a year. `quarter` is 1 (January to March) to 4. */
export interface Quarter {
  year: number;
  quarter: number;
}

/**
 * "Today's dollars" are the dollars of this quarter: the newest quarter in
 * the table when the game's costs were set. It is fixed, so a later table
 * with newer quarters does not move any past price. Changing it is a model
 * change.
 */
export const TODAYS_DOLLARS: Quarter = { year: 2026, quarter: 3 };

/** Quarters counted from year 0, so the next quarter is always one more. */
export const quarterNumber = (q: Quarter): number => q.year * 4 + (q.quarter - 1);

/** The quarter a date falls in. */
export const quarterOf = (date: CalendarDate): Quarter => ({
  year: date.year,
  quarter: Math.floor(date.month / 3) + 1,
});

const QUARTER = /^(\d{4})-Q([1-4])$/;

/**
 * Read the CPI table from the text of `abs/cpi-all-groups.csv`. The first
 * line must be `quarter,index`. Every quarter must follow the one before
 * it, and every index number must be above 0.
 */
export function parseCpiTable(text: string): CpiTable {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== 'quarter,index') {
    throw new Error(`The CPI table must start with "quarter,index", not "${lines[0] ?? ''}".`);
  }
  if (lines.length < 2) throw new Error('The CPI table has no quarters in it.');
  let firstQuarter = 0;
  const index: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = i + 1;
    const cells = lines[i]!.split(',');
    const m = cells.length === 2 ? QUARTER.exec(cells[0]!) : null;
    if (!m) throw new Error(`CPI table line ${line}: "${lines[i]}" is not a quarter and a figure.`);
    const q = quarterNumber({ year: Number(m[1]), quarter: Number(m[2]) });
    if (i === 1) firstQuarter = q;
    else if (q !== firstQuarter + index.length) {
      throw new Error(`CPI table line ${line}: ${cells[0]} does not follow the quarter before it.`);
    }
    const value = cells[1]!.trim() === '' ? NaN : Number(cells[1]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`CPI table line ${line}: "${cells[1]}" is not an index number.`);
    }
    index.push(value);
  }
  return { firstQuarter, index };
}

/** The index number for a quarter. A quarter the table does not hold is an error. */
export function cpiFor(table: CpiTable, q: Quarter): number {
  const i = quarterNumber(q) - table.firstQuarter;
  const value = Number.isInteger(i) ? table.index[i] : undefined;
  if (value === undefined) {
    throw new RangeError(`The CPI table has no ${q.year} quarter ${q.quarter}.`);
  }
  return value;
}

/**
 * What a price on a date is multiplied by to read in today's dollars.
 *
 * Every day of a quarter uses that quarter's index number. A date in the
 * base quarter, or after it, is already in today's dollars and gets 1.
 */
export function todaysDollarsFactor(
  table: CpiTable,
  date: CalendarDate,
  base: Quarter = TODAYS_DOLLARS,
): number {
  const q = quarterOf(date);
  if (quarterNumber(q) >= quarterNumber(base)) return 1;
  return cpiFor(table, base) / cpiFor(table, q);
}
