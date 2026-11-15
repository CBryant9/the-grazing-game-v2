import { describe, expect, it } from 'vitest';
import {
  inQuiet,
  localDate,
  minutesOfDay,
  nextDate,
  parseClock,
  quietEndsAt,
  quietFrom,
  safeZone,
  zonedInstant,
} from './clock';

const SYD = 'Australia/Sydney';
const at = (iso: string): number => Date.parse(iso);

describe('time in a farm zone', () => {
  it('reads the wall clock and the date', () => {
    expect(minutesOfDay(at('2026-11-17T01:00:00Z'), SYD)).toBe(12 * 60); // AEDT +11
    expect(localDate(at('2026-11-16T13:30:00Z'), SYD)).toBe('2026-11-17');
    expect(minutesOfDay(at('2026-06-17T02:30:00Z'), SYD)).toBe(12 * 60 + 30); // AEST +10
    expect(minutesOfDay(at('2026-11-17T01:00:00Z'), 'Australia/Perth')).toBe(9 * 60);
  });

  it('knows a good zone from a bad one and parses clocks', () => {
    expect(safeZone('Australia/Brisbane')).toBe('Australia/Brisbane');
    expect(safeZone('Nowhere/Land')).toBe(SYD);
    expect(safeZone(null)).toBe(SYD);
    expect(parseClock('07:00')).toBe(420);
    expect(parseClock('21:30:00')).toBe(1290);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('7am')).toBeNull();
    expect(nextDate('2026-12-31')).toBe('2027-01-01');
  });
});

describe('quiet hours', () => {
  const night = quietFrom('22:00', '06:00')!;
  const day = quietFrom('13:00', '15:00')!;

  it('run across midnight', () => {
    expect(inQuiet(23 * 60, night)).toBe(true);
    expect(inQuiet(2 * 60, night)).toBe(true);
    expect(inQuiet(6 * 60, night)).toBe(false);
    expect(inQuiet(12 * 60, night)).toBe(false);
    expect(inQuiet(13 * 60, day)).toBe(true);
    expect(inQuiet(15 * 60, day)).toBe(false);
  });

  it('are none when not set or when start equals end', () => {
    expect(quietFrom(null, null)).toBeNull();
    expect(quietFrom('22:00', '22:00')).toBeNull();
    expect(inQuiet(0, null)).toBe(false);
  });

  it('end at the right instant: late evening waits until tomorrow morning, early morning until this one', () => {
    // 23:00 on 17 Nov in Sydney (AEDT) -> 06:00 on 18 Nov = 19:00Z on the 17th.
    expect(quietEndsAt(at('2026-11-17T12:00:00Z'), SYD, night)).toBe(at('2026-11-17T19:00:00Z'));
    // 02:00 on 18 Nov -> 06:00 the same day.
    expect(quietEndsAt(at('2026-11-17T15:00:00Z'), SYD, night)).toBe(at('2026-11-17T19:00:00Z'));
    expect(quietEndsAt(at('2026-11-17T01:00:00Z'), SYD, night)).toBeNull();
  });

  it('keep the clock time across the start of daylight saving (4 Oct 2026, 2 am becomes 3 am)', () => {
    // 23:00 AEST on 3 Oct (13:00Z) is 7 hours before 06:00 AEDT on 4 Oct (19:00Z on the 3rd).
    expect(quietEndsAt(at('2026-10-03T13:00:00Z'), SYD, night)).toBe(at('2026-10-03T19:00:00Z'));
    expect(zonedInstant('2026-10-04', 6 * 60, SYD)).toBe(at('2026-10-03T19:00:00Z'));
  });

  it('keep the clock time across the end of daylight saving (4 Apr 2027, 3 am becomes 2 am)', () => {
    // 23:00 AEDT on 3 Apr (12:00Z) until 06:00 AEST on 4 Apr (20:00Z on the 3rd): 8 hours.
    expect(quietEndsAt(at('2027-04-03T12:00:00Z'), SYD, night)).toBe(at('2027-04-03T20:00:00Z'));
  });

  it('use a time that does not exist (2:30 am on the spring day) without breaking', () => {
    const t = zonedInstant('2026-10-04', 2 * 60 + 30, SYD);
    expect(minutesOfDay(t, SYD)).toBe(3 * 60 + 30);
  });
});
