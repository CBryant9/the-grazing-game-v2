import { describe, expect, it } from 'vitest';
import { farmWithPlan } from './planfarm';
import { AWAY_KEPT, cleanDaily, type DailyStored } from './state';
import { PAUSED_TEXT, UNAVAILABLE_TEXT, dailyWire } from './wire';

const stored = (over: Partial<DailyStored> = {}): DailyStored => ({
  timezone: 'Australia/Sydney',
  startedOn: '2026-09-01',
  openedOn: null,
  workedOn: null,
  doneOn: null,
  away: [],
  awayTotal: 0,
  seenSeq: 0,
  rolledFrom: [],
  ...over,
});
const now = Date.parse('2026-11-15T01:00:00Z');

describe('what a Daily Farm sends the browser', () => {
  it('says the true number of days away when it was longer than the summary keeps', () => {
    const { farm } = farmWithPlan();
    const away = Array.from({ length: AWAY_KEPT }, (_, i) => ({
      day: i,
      date: { year: 2026, month: 8, date: 1 },
      lines: [],
    }));
    const wire = dailyWire(farm, stored({ away, awayTotal: 75 }), now, null);
    expect(wire.catchUp!.days).toHaveLength(AWAY_KEPT);
    expect(wire.catchUp!.daysAway).toBe(75);
  });

  it('a farm kept before the count existed says as many days as it holds', () => {
    const old = cleanDaily({
      timezone: 'Australia/Sydney',
      startedOn: '2026-09-01',
      away: [{ day: 1, date: { year: 2026, month: 8, date: 2 }, lines: [] }],
      seenSeq: 0,
    });
    expect(old!.awayTotal).toBe(1);
  });

  it('carries only its own reason when it is not running: the switch, or nothing to run on', () => {
    const { farm } = farmWithPlan();
    expect(dailyWire(farm, stored(), now, PAUSED_TEXT).waiting).toBe(PAUSED_TEXT);
    expect(dailyWire(farm, stored(), now, UNAVAILABLE_TEXT).waiting).toBe(UNAVAILABLE_TEXT);
    expect(PAUSED_TEXT).not.toMatch(/weather|price/i);
    expect(UNAVAILABLE_TEXT).not.toMatch(/weather|price/i);
    expect(dailyWire(farm, stored(), now, null).waiting).toBeNull();
  });
});
