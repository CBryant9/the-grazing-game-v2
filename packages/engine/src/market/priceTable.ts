/**
 * One MLA price indicator, as plain data.
 *
 * The engine never reads a file. Whoever runs it (the server, a test) reads
 * a table from `packages/engine/data/raw/mla/` and hands the text to
 * `parsePriceTable`. A table has a row for a day only when the service gave
 * one, so days are looked up by date and a day with no row has no price.
 *
 * These tables are server-side data. Browser code must never import them
 * (CLAUDE.md, rule 14).
 */

import type { CalendarDate } from '../calendar';
import { dateOfSerial, daySerial, isoDate } from '../season/weatherTable';

export interface PriceTable {
  /** The day serial of the first row (see `daySerial`). */
  firstSerial: number;
  /**
   * The price on each day from the first, c/kg. A day with no row holds
   * NaN. So does a day whose row was dropped (see `dropped`).
   */
  value: Float64Array;
  /** The head counted in each day's figure. 0 on a day with no price. */
  head: Int32Array;
  /** Rows kept. */
  rows: number;
  /**
   * Rows left out because the figure is blank, zero or negative. A price
   * is never taken from one of these (docs/DATA.md records the 16 odd
   * Hamilton sheep rows, one of them negative).
   */
  dropped: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Read a price table from the text of an MLA indicator file. The first
 * line must be `date,value,head`. Rows must be real dates, oldest first,
 * each date once. Anything else stops with an error that names the line.
 */
export function parsePriceTable(text: string): PriceTable {
  const lines = text.split('\n');
  // A file ends with one line feed, so the last piece is empty.
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== 'date,value,head') {
    throw new Error(`A price table must start with "date,value,head", not "${lines[0] ?? ''}".`);
  }
  if (lines.length < 2) throw new Error('The price table has no rows in it.');

  const serials: number[] = [];
  const values: number[] = [];
  const heads: number[] = [];
  let dropped = 0;
  let prev = -Infinity;
  for (let i = 1; i < lines.length; i++) {
    const line = i + 1;
    const cells = lines[i]!.split(',');
    if (cells.length !== 3) {
      throw new Error(`Price table line ${line}: ${cells.length} values where 3 were expected.`);
    }
    const m = ISO_DATE.exec(cells[0]!);
    if (!m) throw new Error(`Price table line ${line}: "${cells[0]}" is not a date.`);
    const date: CalendarDate = { year: Number(m[1]), month: Number(m[2]) - 1, date: Number(m[3]) };
    const serial = daySerial(date);
    if (isoDate(dateOfSerial(serial)) !== cells[0]) {
      throw new Error(`Price table line ${line}: "${cells[0]}" is not a real date.`);
    }
    if (serial <= prev) {
      throw new Error(
        `Price table line ${line}: ${cells[0]} does not come after the row before it.`,
      );
    }
    prev = serial;
    const value = cells[1]!.trim() === '' ? NaN : Number(cells[1]);
    const head = cells[2]!.trim() === '' ? NaN : Number(cells[2]);
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(head) || head < 0) {
      dropped++;
      continue;
    }
    serials.push(serial);
    values.push(value);
    heads.push(head);
  }
  if (!serials.length) throw new Error('The price table has no usable rows in it.');

  const firstSerial = serials[0]!;
  const days = serials.at(-1)! - firstSerial + 1;
  const value = new Float64Array(days).fill(NaN);
  const head = new Int32Array(days);
  for (let k = 0; k < serials.length; k++) {
    value[serials[k]! - firstSerial] = values[k]!;
    head[serials[k]! - firstSerial] = heads[k]!;
  }
  return { firstSerial, value, head, rows: serials.length, dropped };
}

/** The first and last days a table has a price for. */
export const priceTableFirst = (t: PriceTable): CalendarDate => dateOfSerial(t.firstSerial);
export const priceTableLast = (t: PriceTable): CalendarDate =>
  dateOfSerial(t.firstSerial + t.value.length - 1);

/** A day's row: the price and the head behind it. */
export interface PriceRow {
  /** The day the row is for. */
  serial: number;
  /** c/kg. Always a real number above 0. */
  value: number;
  head: number;
}

/** The row for a day, or null when the table has none. */
export function priceRowOn(table: PriceTable, serial: number): PriceRow | null {
  const i = serial - table.firstSerial;
  if (i < 0 || i >= table.value.length) return null;
  const value = table.value[i]!;
  if (!(value > 0)) return null;
  return { serial, value, head: table.head[i]! };
}

/**
 * The newest row on or before a day, looking back at most `maxAgeDays`
 * days, with at least `minHead` head behind it. Null when there is none.
 */
export function latestPriceRow(
  table: PriceTable,
  serial: number,
  maxAgeDays: number,
  minHead = 0,
): PriceRow | null {
  for (let s = serial; s >= serial - maxAgeDays; s--) {
    const row = priceRowOn(table, s);
    if (row && row.head >= minHead) return row;
  }
  return null;
}
