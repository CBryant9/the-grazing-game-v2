/**
 * A district's daily weather, as plain data.
 *
 * The engine never reads a file. Whoever runs it (the server, a test) reads
 * the SILO table and hands the text to `parseWeatherTable`. The table holds
 * one row for every day with no gaps, so a day is found by counting from the
 * first one.
 *
 * These tables are server-side data. Browser code must never import them
 * (CLAUDE.md, rule 14).
 */

import type { CalendarDate } from '../calendar';

export interface WeatherTable {
  /** The first day in the table. */
  first: CalendarDate;
  /** Rain on each day from the first, mm. */
  rain: Float64Array;
  /**
   * Evapotranspiration on each day from the first, mm: the water a short,
   * well-watered grass would use that day (SILO's FAO-56 short crop figure).
   */
  et0: Float64Array;
}

const DAY_MS = 86400000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole days from 1 January 1970 to a date. Calendar arithmetic only. */
export function daySerial(date: CalendarDate): number {
  return Date.UTC(date.year, date.month, date.date) / DAY_MS;
}

/** The date a day serial stands for. */
export function dateOfSerial(serial: number): CalendarDate {
  const d = new Date(serial * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate() };
}

/** A date as text, for messages. */
export function isoDate(date: CalendarDate): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${date.year}-${two(date.month + 1)}-${two(date.date)}`;
}

/** Days in the table. */
export const tableDays = (table: WeatherTable): number => table.rain.length;

/** The last day in the table. */
export function tableLast(table: WeatherTable): CalendarDate {
  return dateOfSerial(daySerial(table.first) + tableDays(table) - 1);
}

/**
 * Where a date sits in the table, counting from 0. A date the table does
 * not hold is an error, never a guess.
 */
export function tableIndex(table: WeatherTable, date: CalendarDate): number {
  const i = daySerial(date) - daySerial(table.first);
  if (!Number.isInteger(i) || i < 0 || i >= tableDays(table)) {
    throw new RangeError(
      `The weather table has no day ${isoDate(date)}. It runs from ${isoDate(table.first)} to ${isoDate(tableLast(table))}.`,
    );
  }
  return i;
}

/**
 * Read a weather table from the text of a SILO file in
 * `packages/engine/data/raw/silo/`. The first line names the columns. It
 * must have `date`, `rain` and `et0`. Every row must be the day after the
 * row before it, and every figure a real number that is not negative.
 * Anything else stops with an error that names the line.
 */
export function parseWeatherTable(text: string): WeatherTable {
  const lines = text.split('\n');
  // A file ends with one line feed, so the last piece is empty.
  if (lines.at(-1) === '') lines.pop();
  const header = (lines[0] ?? '').split(',');
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`The weather table has no "${name}" column.`);
    return i;
  };
  const cDate = col('date');
  const cRain = col('rain');
  const cEt0 = col('et0');

  const days = lines.length - 1;
  if (days < 1) throw new Error('The weather table has no days in it.');
  const rain = new Float64Array(days);
  const et0 = new Float64Array(days);
  let first: CalendarDate | null = null;
  let firstSerial = 0;

  for (let i = 0; i < days; i++) {
    const line = i + 2;
    const cells = lines[i + 1]!.split(',');
    if (cells.length !== header.length) {
      throw new Error(
        `Weather table line ${line}: ${cells.length} values where ${header.length} were expected.`,
      );
    }
    const m = ISO_DATE.exec(cells[cDate]!);
    if (!m) throw new Error(`Weather table line ${line}: "${cells[cDate]}" is not a date.`);
    const date: CalendarDate = { year: Number(m[1]), month: Number(m[2]) - 1, date: Number(m[3]) };
    const serial = daySerial(date);
    if (isoDate(dateOfSerial(serial)) !== cells[cDate]) {
      throw new Error(`Weather table line ${line}: "${cells[cDate]}" is not a real date.`);
    }
    if (first === null) {
      first = date;
      firstSerial = serial;
    } else if (serial !== firstSerial + i) {
      throw new Error(
        `Weather table line ${line}: ${cells[cDate]} does not follow the day before it. The table must hold every day once, in order.`,
      );
    }
    rain[i] = figure(cells[cRain]!, 'rain', line);
    et0[i] = figure(cells[cEt0]!, 'et0', line);
  }
  return { first: first!, rain, et0 };
}

function figure(cell: string, name: string, line: number): number {
  const n = cell.trim() === '' ? NaN : Number(cell);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Weather table line ${line}: ${name} is "${cell}", which is not a figure.`);
  }
  return n;
}
