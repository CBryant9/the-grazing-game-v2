import { describe, expect, it } from 'vitest';
import { dateAt } from '../calendar';
import { loadFarm, saveFarm } from '../save/save';
import { loadRealData } from '../server';
import { endDay } from '../day/days';
import { createFarm, type CreateFarmOptions } from './create';
import { dateOn } from './derived';

/*
 * A farm that starts on a day of the month (milestone 3.3). A Daily Farm starts on today's real
 * date as day 0, with the pasture run up to it and the start herd placed on it, so the player
 * arrives on Day 1 with nothing spent. Left out, the start is the 1st, exactly as before.
 */

const env = { data: loadRealData() };
const base: CreateFarmOptions = {
  seed: 5,
  district: 'cq',
  size: 'small',
  start: { year: 2025, month: 10 },
  years: { kind: 'real', order: 'in-order' },
  startType: 'running',
  difficulty: 'medium',
};

describe('a farm that starts on a day of the month', () => {
  it('day 0 is that date, and the day before it is the run-up', () => {
    const farm = createFarm({ ...base, start: { year: 2025, month: 10, date: 15 } }, env);
    expect(dateOn(farm)).toEqual({ year: 2025, month: 10, date: 15 });
    expect(dateOn(farm, -1)).toEqual({ year: 2025, month: 10, date: 14 });
    expect(dateOn(farm, 20)).toEqual({ year: 2025, month: 11, date: 5 });
    expect(farm.day).toBe(0);
    // Nothing has been spent and the herd is there on the first day.
    expect(farm.cash).toBe(farm.startCash);
    expect(farm.mobs.length).toBeGreaterThan(0);
    expect(farm.mobs.some((m) => m.join != null && m.join.start < 0)).toBe(false);
  });

  it('left out, the start is the 1st as it always was, and the same farm', () => {
    const a = createFarm(base, env);
    const b = createFarm({ ...base, start: { year: 2025, month: 10, date: 1 } }, env);
    expect(dateOn(a)).toEqual({ year: 2025, month: 10, date: 1 });
    expect(a.start).toEqual({ year: 2025, month: 10 });
    expect(b.cash).toBe(a.cash);
    expect(loadFarm(saveFarm(a)).start).toEqual({ year: 2025, month: 10 });
  });

  it('runs on from that date, and a save keeps the start date', () => {
    const farm = createFarm({ ...base, start: { year: 2025, month: 10, date: 15 } }, env);
    const next = endDay(farm, env).farm;
    expect(dateOn(next)).toEqual({ year: 2025, month: 10, date: 16 });
    const back = loadFarm(saveFarm(next));
    expect(back.start).toEqual({ year: 2025, month: 10, date: 15 });
    expect(dateOn(back)).toEqual({ year: 2025, month: 10, date: 16 });
  });

  it('calendar arithmetic counts from the date', () => {
    expect(dateAt({ year: 2026, month: 10, date: 15 }, 16)).toEqual({
      year: 2026,
      month: 11,
      date: 1,
    });
    expect(dateAt({ year: 2026, month: 10 }, 0)).toEqual({ year: 2026, month: 10, date: 1 });
  });
});
