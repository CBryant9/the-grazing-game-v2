/**
 * Time in a farm's own time zone, for quiet hours and the reminders. Plain functions of an
 * instant and an IANA zone name (Intl does the daylight saving), so tests can give any clock.
 */

export const DEFAULT_ZONE = 'Australia/Sydney';

/** A zone name Intl knows, or the default. */
export function safeZone(zone: string | null | undefined): string {
  if (!zone) return DEFAULT_ZONE;
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_ZONE;
  }
}

export interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The wall clock in `zone` at this instant. */
export function zoneParts(at: Date | number, zone: string): Parts {
  const out: Record<string, number> = {};
  for (const p of formatter(zone).formatToParts(at)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { y: out.year!, m: out.month!, d: out.day!, h: out.hour! % 24, min: out.minute! };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The calendar date (YYYY-MM-DD) in `zone` at this instant. */
export function localDate(at: Date | number, zone: string): string {
  const p = zoneParts(at, zone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function minutesOfDay(at: Date | number, zone: string): number {
  const p = zoneParts(at, zone);
  return p.h * 60 + p.min;
}

/** "07:00" or "07:00:00" as minutes after midnight. Null when it is not a time. */
export function parseClock(v: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(v ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** The date after this one (YYYY-MM-DD). */
export function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The offset of `zone` from UTC at this instant, in minutes. */
function offsetMinutes(at: number, zone: string): number {
  const p = zoneParts(at, zone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000);
}

/**
 * The instant when the wall clock in `zone` reads `minutes` on `date`. A time that does not
 * exist (the hour skipped when daylight saving starts) gives the instant just after the gap.
 */
export function zonedInstant(date: string, minutes: number, zone: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = naive - offsetMinutes(naive, zone) * 60_000;
  guess = naive - offsetMinutes(guess, zone) * 60_000;
  return guess;
}

/** Quiet hours as minutes, or null for none. A start equal to the end means none. */
export interface Quiet {
  start: number;
  end: number;
}

export function quietFrom(
  start: string | null | undefined,
  end: string | null | undefined,
): Quiet | null {
  const s = parseClock(start);
  const e = parseClock(end);
  if (s === null || e === null || s === e) return null;
  return { start: s, end: e };
}

/** Is this minute of the day inside quiet hours? Handles hours that run across midnight. */
export function inQuiet(minute: number, q: Quiet | null): boolean {
  if (!q) return false;
  return q.start < q.end ? minute >= q.start && minute < q.end : minute >= q.start || minute < q.end;
}

/** The instant quiet hours end, when `at` is inside them. Null when it is not. */
export function quietEndsAt(at: number, zone: string, q: Quiet | null): number | null {
  if (!q) return null;
  const minute = minutesOfDay(at, zone);
  if (!inQuiet(minute, q)) return null;
  const today = localDate(at, zone);
  const crossesMidnight = q.start > q.end;
  const date = crossesMidnight && minute >= q.start ? nextDate(today) : today;
  return zonedInstant(date, q.end, zone);
}
