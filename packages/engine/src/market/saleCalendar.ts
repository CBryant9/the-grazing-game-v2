/**
 * Real sale days: when a yard held a sale, and of what type.
 *
 * Past years use the days the yard really sold (PRD 5.14), from MLA's
 * yardings report. Where the service has nothing for a yard, a stand-in
 * gives it a weekly prime sale on a set weekday, with a break over
 * Christmas. The stand-ins are listed below and in docs/DATA.md ("Sale
 * calendars"). They are tuning, for Claudia.
 *
 * Booking stock onto a sale, and delivery, are in sim/derived.ts and
 * actions/apply.ts. This module only answers "is there a sale on this date" and "when is the next one".
 * Nothing here reads a file or the clock.
 */

import type { DistrictId } from '@gg/shared';
import type { CalendarDate } from '../calendar';
import type { SaleSpecies, YardId } from '../data/yards';
import { FIRST_REAL_YEAR } from '../season/realYears';
import { dateOfSerial, daySerial, isoDate } from '../season/weatherTable';

/** A prime sale is finished stock for processors. A store sale is stock going back to a paddock or a feedlot. */
export type SaleType = 'prime' | 'store';

export interface SaleDay {
  date: CalendarDate;
  /** The sale types held that day, prime first. */
  types: SaleType[];
  /** Head yarded, every type together. Null for a stand-in day: the real figure is not known. */
  head: number | null;
  /** True when the day comes from the stand-in rule, not from the yard's record. */
  standIn: boolean;
}

/** A stretch the service has nothing for, and the weekday the stand-in sells on (0 is Sunday). */
export interface StandInStretch {
  /** First and last dates of the stretch, as YYYY-MM-DD. Both are in it. */
  from: string;
  to: string;
  weekday: number;
}

const MONDAY = 1;

/**
 * The stretches each cattle yard has no record for, from 1997.
 *
 * Each gets a prime sale every week on the weekday the yard sold on in the
 * year of records nearest the stretch: before it where there is one, and
 * after it where there is not. Gracemere sold on Mondays up to August
 * 2004. Mortlake sold on Mondays from January 2018. The real day
 * Gracemere used between 2004 and 2014 is not known (it was Fridays when
 * the records start again). Tuning, for Claudia.
 */
export const CATTLE_SALE_STAND_INS: Readonly<Partial<Record<YardId, readonly StandInStretch[]>>> = {
  GME: [
    { from: '1997-01-01', to: '1999-11-07', weekday: MONDAY },
    { from: '2004-08-17', to: '2014-10-09', weekday: MONDAY },
  ],
  MTL: [{ from: '1997-01-01', to: '2018-01-28', weekday: MONDAY }],
};

/**
 * The stand-in holds no sale from 16 December to 7 January. The four
 * yards' own last prime sale of a year falls between 4 and 21 December and
 * their first of the next between 3 and 21 January. Public holidays are
 * not allowed for. Tuning.
 */
export const STAND_IN_BREAK = {
  from: { month: 11, date: 16 },
  to: { month: 0, date: 7 },
} as const;

/**
 * The weekday (0 is Sunday) of the weekly prime sale a farm with random
 * seasons has, for each district. These are the weekdays each district's
 * yard sold on in its most recent records (docs/DATA.md, "Sale days
 * pulled"). The builder's choice, for Claudia: see docs/DATA.md.
 */
export const RANDOM_SEASON_SALE_WEEKDAY: Readonly<Record<DistrictId, number>> = {
  cq: 3,
  nsw: 4,
  cw: 4,
  wv: 1,
};

/** The weekday of a date, 0 for Sunday. 1 January 1970 was a Thursday. */
export function weekdayOf(date: CalendarDate): number {
  return (((daySerial(date) + 4) % 7) + 7) % 7;
}

/**
 * The sale a farm with random seasons has on a date: a weekly prime sale on
 * its district's weekday, with none from 16 December to 7 January (the
 * stand-in rule). Null on any other day.
 */
export function weeklySaleOn(district: DistrictId, date: CalendarDate): SaleDay | null {
  if (inBreak(date) || weekdayOf(date) !== RANDOM_SEASON_SALE_WEEKDAY[district]) return null;
  return { date, types: ['prime'], head: null, standIn: true };
}

export interface SaleCalendar {
  yard: YardId;
  species: SaleSpecies;
  /** The first and last dates the calendar answers for. */
  first: CalendarDate;
  last: CalendarDate;
  /** The sale on a real date, or null when the yard held none. A date outside the calendar is an error. */
  saleOn(date: CalendarDate): SaleDay | null;
  /**
   * The first sale on or after a real date, of a given type if one is
   * asked for. Null when there is none before the calendar ends.
   */
  nextSale(from: CalendarDate, type?: SaleType): SaleDay | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function serialOf(text: string, what: string): number {
  const m = ISO_DATE.exec(text);
  if (!m) throw new Error(`${what}: "${text}" is not a date.`);
  const serial = daySerial({ year: Number(m[1]), month: Number(m[2]) - 1, date: Number(m[3]) });
  if (isoDate(dateOfSerial(serial)) !== text) {
    throw new Error(`${what}: "${text}" is not a real date.`);
  }
  return serial;
}

const TYPES: Record<string, SaleType> = { Prime: 'prime', Store: 'store' };
const TYPE_ORDER: readonly SaleType[] = ['prime', 'store'];

/** True on a date inside the stand-in's Christmas break. */
function inBreak(date: CalendarDate): boolean {
  const B = STAND_IN_BREAK;
  return (
    (date.month === B.from.month && date.date >= B.from.date) ||
    (date.month === B.to.month && date.date <= B.to.date)
  );
}

/**
 * Build a yard's sale calendar from the text of its yardings table
 * (`mla/yardings/<yard>-<species>.csv`: `date,type,head`, one row for each
 * sale type on a day), and the stretches to stand in for.
 *
 * A record inside a stand-in stretch is an error: the stretch is out of
 * date and must be shortened, so a real sale day is never covered up.
 */
export function buildSaleCalendar(
  yard: YardId,
  species: SaleSpecies,
  yardingsText: string,
  standIns: readonly StandInStretch[] = species === 'cattle'
    ? (CATTLE_SALE_STAND_INS[yard] ?? [])
    : [],
): SaleCalendar {
  const lines = yardingsText.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== 'date,type,head') {
    throw new Error(`A yardings table must start with "date,type,head", not "${lines[0] ?? ''}".`);
  }
  if (lines.length < 2) throw new Error(`The ${yard} yardings table has no rows in it.`);

  const stretches = standIns.map((s) => {
    if (!Number.isInteger(s.weekday) || s.weekday < 0 || s.weekday > 6) {
      throw new Error(`A stand-in weekday is 0 (Sunday) to 6, not ${s.weekday}.`);
    }
    return {
      from: serialOf(s.from, `${yard} stand-in`),
      to: serialOf(s.to, `${yard} stand-in`),
      weekday: s.weekday,
    };
  });
  const standInFor = (serial: number) => stretches.find((s) => serial >= s.from && serial <= s.to);

  const days = new Map<number, { types: Set<SaleType>; head: number }>();
  let prev = '';
  let lastSerial = 0;
  let firstSerial = Infinity;
  for (let i = 1; i < lines.length; i++) {
    const what = `${yard} yardings line ${i + 1}`;
    const cells = lines[i]!.split(',');
    if (cells.length !== 3)
      throw new Error(`${what}: ${cells.length} values where 3 were expected.`);
    const serial = serialOf(cells[0]!, what);
    const type = TYPES[cells[1]!];
    if (!type) throw new Error(`${what}: "${cells[1]}" is not a sale type.`);
    const head = cells[2]!.trim() === '' ? NaN : Number(cells[2]);
    if (!Number.isInteger(head) || head < 0)
      throw new Error(`${what}: "${cells[2]}" is not a head count.`);
    const key = `${cells[0]}|${cells[1]}`;
    if (key <= prev) throw new Error(`${what}: the row does not come after the one before it.`);
    prev = key;
    if (standInFor(serial)) {
      throw new Error(
        `${what}: the yard has a record on ${cells[0]}, inside a stretch that is stood in for. Shorten the stretch.`,
      );
    }
    let day = days.get(serial);
    if (!day) {
      day = { types: new Set(), head: 0 };
      days.set(serial, day);
    }
    day.types.add(type);
    day.head += head;
    firstSerial = Math.min(firstSerial, serial);
    lastSerial = Math.max(lastSerial, serial);
  }

  const calendarFirst = daySerial({ year: FIRST_REAL_YEAR, month: 0, date: 1 });
  // Every day from 1997 to the yard's first record must be a record or a stand-in.
  if (firstSerial > calendarFirst) {
    for (let s = calendarFirst; s < firstSerial; s++) {
      if (!standInFor(s)) {
        throw new Error(
          `The ${yard} ${species} yardings start on ${isoDate(dateOfSerial(firstSerial))} and nothing stands in from ${isoDate(dateOfSerial(s))}.`,
        );
      }
    }
  }

  const first = dateOfSerial(calendarFirst);
  const last = dateOfSerial(lastSerial);

  const at = (serial: number): SaleDay | null => {
    const date = dateOfSerial(serial);
    const real = days.get(serial);
    if (real) {
      return {
        date,
        types: TYPE_ORDER.filter((t) => real.types.has(t)),
        head: real.head,
        standIn: false,
      };
    }
    const stretch = standInFor(serial);
    if (!stretch || inBreak(date)) return null;
    // 1 January 1970 was a Thursday.
    if (weekdayOf(date) !== stretch.weekday) return null;
    return { date, types: ['prime'], head: null, standIn: true };
  };

  const check = (date: CalendarDate): number => {
    const serial = daySerial(date);
    if (!Number.isInteger(serial) || serial < calendarFirst || serial > lastSerial) {
      throw new RangeError(
        `The ${yard} ${species} sale calendar has no day ${isoDate(date)}. It runs from ${isoDate(first)} to ${isoDate(last)}.`,
      );
    }
    return serial;
  };

  return {
    yard,
    species,
    first,
    last,
    saleOn: (date) => at(check(date)),
    nextSale(from, type) {
      for (let s = check(from); s <= lastSerial; s++) {
        const sale = at(s);
        if (sale && (type === undefined || sale.types.includes(type))) return sale;
      }
      return null;
    },
  };
}
