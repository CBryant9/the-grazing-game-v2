/*
 * Daily Farm time (PRD 5.2). A farm's day is a date in its own time zone, and the day ends at
 * local midnight there. Nothing here reads a clock: every function is given the time, and the
 * server passes its own, so the device's date, time zone or a wound-forward clock can not
 * reach it.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(zone, f);
  }
  return f;
}

/**
 * The time zones Daily Farm supports, exactly as named: the zones of the four launch districts
 * (Central Queensland is Brisbane; Northern Tablelands and Central West NSW are Sydney; Western
 * Victoria is Melbourne), the other Australian zones a grazier's device can report, and Auckland,
 * because New Zealand graziers play too. The browser names its zone once, when the farm starts,
 * and it is checked against this list before anything is run. An offset ("+10:00"), a name in
 * the wrong case, an alias or a zone anywhere else is turned away with a plain message. One list
 * in one place: add a zone here.
 */
export const SUPPORTED_ZONES: readonly string[] = [
  'Australia/Brisbane',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Darwin',
  'Australia/Hobart',
  'Pacific/Auckland',
];

/** Is this one of the zones Daily Farm supports? */
export function isSupportedZone(zone: unknown): zone is string {
  return typeof zone === 'string' && SUPPORTED_ZONES.includes(zone);
}

const MONTHS = [
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
];

/** A date as the diary says it: "14 November". */
export function longDate(iso: string): string {
  const d = parts(iso);
  return `${d.date} ${MONTHS[d.month]}`;
}

/** The local date (YYYY-MM-DD) in a zone at a moment (ms since 1970). */
export function localDate(ms: number, zone: string): string {
  return formatterFor(zone).format(new Date(ms));
}

const DAY_MS = 86_400_000;

/** The date text a number of days on from another. Calendar arithmetic only. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** Whole days from one date text to another. */
export function daysBetween(from: string, to: string): number {
  const ms = (t: string): number => {
    const [y, m, d] = t.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((ms(to) - ms(from)) / DAY_MS);
}

/**
 * The moment (ms since 1970, to the second) local midnight next comes in a zone: the first
 * second of the next local date. Found by halving, so a day of 23 or 25 hours where the clocks
 * change is handled by the zone's own rules.
 */
export function nextMidnight(ms: number, zone: string): number {
  const today = localDate(ms, zone);
  let lo = Math.floor(ms / 1000);
  // A day is never longer than 25 hours, so 27 hours on is always the next date.
  let hi = lo + 27 * 3600;
  while (localDate(hi * 1000, zone) === today) hi += 24 * 3600;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDate(mid * 1000, zone) === today) lo = mid;
    else hi = mid;
  }
  return hi * 1000;
}

/** A local date as the game's date parts (month from 0). */
export function parts(iso: string): { year: number; month: number; date: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y!, month: m! - 1, date: d! };
}

/** The date text of game date parts. */
export function isoOf(d: { year: number; month: number; date: number }): string {
  return `${String(d.year).padStart(4, '0')}-${String(d.month + 1).padStart(2, '0')}-${String(d.date).padStart(2, '0')}`;
}
