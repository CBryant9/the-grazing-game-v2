/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest';
import { AVERAGE_YEAR } from '../../test-support/calibration';
import { createFarm } from '../sim/create';
import { stepDay } from '../sim/tick';

/*
 * REGRESSION PINS, not benchmarks (docs/CALIBRATION.md, the m2.5 entry,
 * "What the change does to the herd"). No benchmark covers how many cows
 * calve in later years, or how thin they get, so these pin engine 0.14.0's
 * figures within a stated margin. A later change that moves them shows up
 * here, and the CALIBRATION.md entry says what the figures were.
 *
 * A running medium farm, the average year, from 1 September, no player
 * action, three years, seeds 1 to 4. Each year: calves born for each cow
 * or heifer 400 days or older at the start of the year, and the share of
 * cows under CS 2.25 on the days of August to October (averaged).
 */

vi.setConfig({ testTimeout: 1_800_000 });

const SEEDS = [1, 2, 3, 4];
const START = Date.UTC(2024, 8, 1);
const monthOf = (day: number): number => new Date(START + day * 86_400_000).getUTCMonth();

interface YearFigures {
  /** Calves born per 100 females of 400 days or older at the start of the year. */
  calving: number;
  /** % of cows under CS 2.25, averaged over the days of August to October. */
  thin: number;
}

function threeYears(district: 'cq' | 'nsw'): YearFigures[] {
  const years = [0, 1, 2].map(() => ({ born: 0, females: 0, thinSum: 0, thinDays: 0 }));
  for (const seed of SEEDS) {
    const farm = createFarm(
      {
        seed,
        district,
        size: 'medium',
        start: { year: 2024, month: 8 },
        startType: 'running',
        difficulty: 'medium',
      },
      { seasons: AVERAGE_YEAR },
    );
    const seen = new Set<number>();
    for (let d = 0; d < 3 * 365; d++) {
      const y = years[Math.floor(d / 365)]!;
      if (d % 365 === 0) {
        for (const m of farm.mobs) {
          for (const a of m.animals) {
            if ((a.kind === 'cow' || a.kind === 'heifer') && a.age >= 400 && !a.dead) y.females++;
          }
        }
      }
      stepDay(farm, { seasons: AVERAGE_YEAR });
      let cows = 0;
      let thin = 0;
      for (const m of farm.mobs) {
        for (const a of m.animals) {
          if (a.dead) continue;
          if (a.kind === 'calf' && a.age === 0 && !seen.has(a.id)) {
            seen.add(a.id);
            y.born++;
          }
          if (a.kind === 'cow') {
            cows++;
            if (a.cond < 2.25) thin++;
          }
        }
      }
      const month = monthOf(d);
      if (month >= 7 && month <= 9 && cows > 0) {
        y.thinSum += (thin / cows) * 100;
        y.thinDays++;
      }
    }
  }
  return years.map((y) => ({ calving: (y.born / y.females) * 100, thin: y.thinSum / y.thinDays }));
}

/** Engine 0.14.0's figures, years 1 to 3. Margins: 5 calves per 100 females, 8 points of cows. */
const PINS = {
  cq: { calving: [85.1, 66.2, 55.3], thin: [0.5, 0, 4.5] },
  nsw: { calving: [84.0, 57.9, 55.4], thin: [3.1, 17.0, 16.6] },
};
const CALVING_MARGIN = 5;
const THIN_MARGIN = 8;

for (const district of ['cq', 'nsw'] as const) {
  describe(`three years with no player action: ${district === 'cq' ? 'Central Qld' : 'Northern Tablelands'}`, () => {
    const years = threeYears(district);
    if (process.env.GG_CALF_PRINT === '1') {
      console.log(
        `${district} three years: calving ${years.map((y) => y.calving.toFixed(1)).join(' / ')}; cows under CS 2.25 in Aug-Oct ${years.map((y) => y.thin.toFixed(1)).join(' / ')}%`,
      );
    }
    const pin = PINS[district];
    it(`REGRESSION PIN: calves born per 100 females each year stay within ${CALVING_MARGIN} of ${pin.calving.join(' / ')}`, () => {
      years.forEach((y, i) => {
        expect(Math.abs(y.calving - pin.calving[i]!), `year ${i + 1}`).toBeLessThanOrEqual(
          CALVING_MARGIN,
        );
      });
    });
    it(`REGRESSION PIN: the share of cows under CS 2.25 in August to October stays within ${THIN_MARGIN} points of ${pin.thin.join(' / ')}%`, () => {
      years.forEach((y, i) => {
        expect(Math.abs(y.thin - pin.thin[i]!), `year ${i + 1}`).toBeLessThanOrEqual(THIN_MARGIN);
      });
    });
  });
}
