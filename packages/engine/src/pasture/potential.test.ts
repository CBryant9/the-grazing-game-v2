import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { makeScenario, putFarm } from '../../test-support/farms';
import { loadMvp } from '../../test-support/mvp';
import { dateAt } from '../calendar';
import { DISTRICTS } from '../data/districts';
import { districtPotential, interpMonth } from './potential';

const { mvp } = loadMvp();

describe('the farm calendar', () => {
  it('counts days from the 1st of the start month, through a leap year', () => {
    const start = { year: 2024, month: 1 };
    expect(dateAt(start, 0)).toEqual({ year: 2024, month: 1, date: 1 });
    expect(dateAt(start, 28)).toEqual({ year: 2024, month: 1, date: 29 });
    expect(dateAt(start, 29)).toEqual({ year: 2024, month: 2, date: 1 });
    expect(dateAt(start, 366)).toEqual({ year: 2025, month: 1, date: 1 });
  });

  it('goes back before the start for the pasture run-up', () => {
    expect(dateAt({ year: 2021, month: 8 }, -1)).toEqual({ year: 2021, month: 7, date: 31 });
    expect(dateAt({ year: 2021, month: 8 }, -540)).toEqual({ year: 2020, month: 2, date: 10 });
  });
});

describe('growth potential for a day', () => {
  // Two years from January 2023, so every date including 29 February is covered.
  const start = { year: 2023, month: 0 };

  it.each(DISTRICT_IDS)('%s matches the MVP on every day of two years', (id) => {
    putFarm(mvp, makeScenario(mvp, { district: id, start }));
    for (let day = -31; day < 731; day++) {
      mvp.S.day = day;
      expect(districtPotential(DISTRICTS[id], dateAt(start, day)), `day ${day}`).toBe(mvp.potNow());
    }
  });

  it('reads the monthly figure on the 15th and a straight line in between', () => {
    const cq = DISTRICTS.cq;
    expect(districtPotential(cq, { year: 2023, month: 0, date: 15 })).toBe(42);
    expect(districtPotential(cq, { year: 2023, month: 1, date: 15 })).toBe(46);
    expect(districtPotential(cq, { year: 2023, month: 0, date: 30 })).toBe(44);
    // Early January is on the line from December (32) to January (42).
    expect(districtPotential(cq, { year: 2023, month: 0, date: 1 })).toBeCloseTo(37.33, 2);
  });

  it('applies the district scale', () => {
    const nsw = DISTRICTS.nsw;
    expect(districtPotential(nsw, { year: 2023, month: 0, date: 15 })).toBe(34 * 0.9);
  });

  it('reads any monthly curve the same way the MVP does', () => {
    putFarm(mvp, makeScenario(mvp, { district: 'cw', start }));
    // The winter crop curve, which the crop model will use in milestone 1.2.
    const winter = mvp.SPECIES.oats!.g as number[];
    for (let day = 0; day < 366; day++) {
      expect(interpMonth([...winter], dateAt(start, day)), `day ${day}`).toBe(
        mvp.interpMonth(winter, day),
      );
    }
  });
});
