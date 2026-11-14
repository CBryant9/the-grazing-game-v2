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

/** Is this an IANA time zone name the server knows? */
export function isZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  try {
    formatterFor(zone);
    return true;
  } catch {
    return false;
  }
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
