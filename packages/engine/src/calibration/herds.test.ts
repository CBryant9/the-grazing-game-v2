import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { AVERAGE_YEAR, herdRun, type HerdRun } from '../../test-support/calibration';

/*
 * Established breeding herds (docs/CALIBRATION.md, Benchmarks).
 *
 * A running farm of the district's medium size on medium difficulty, left
 * alone for a year: no sales, no moves, no weaning by hand. Central Qld
 * herds are on the lick, as that district starts.
 *
 *   Annual deaths, lick and normal stocking: 1.5 to 3.6%.
 *   Preg tests run a few points above the expected rate, because the
 *   expected rate is for three cycles and some cows get a fourth.
 *
 * Deaths are counted over all the herds together. A medium farm outside
 * Central Qld has 200 to 500 head, so one herd's year swings by a point or
 * two on a handful of deaths.
 */

vi.setConfig({ testTimeout: 900_000 });

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const SEPTEMBER = 8;
const MAY = 4;

const NAMES: Record<DistrictId, string> = {
  cq: 'Central Qld',
  nsw: 'Northern Tablelands',
  cw: 'Central West NSW',
  wv: 'Western Victoria',
};

const pooledDeaths = (runs: readonly HerdRun[]): number =>
  (runs.reduce((n, r) => n + (r.deathsPct * r.head) / 100, 0) /
    runs.reduce((n, r) => n + r.head, 0)) *
  100;

for (const district of ['cq', 'nsw', 'cw', 'wv'] as const) {
  describe(`established herds: ${NAMES[district]}`, () => {
    const average = [SEPTEMBER, MAY].flatMap((month) =>
      SEEDS.map((seed) => herdRun(district, month, seed, AVERAGE_YEAR)),
    );
    const random = SEEDS.map((seed) => herdRun(district, SEPTEMBER, seed));

    it('loses 1.5 to 3.6% a year in the average year, all herds together', () => {
      const pct = pooledDeaths(average);
      expect(pct).toBeGreaterThanOrEqual(1.5);
      expect(pct).toBeLessThanOrEqual(3.6);
    });

    it('loses no more than 6% in any one herd in the average year', () => {
      for (const r of average) expect(r.deathsPct, `seed ${r.seed}`).toBeLessThan(6);
    });

    it('loses 1.5 to 3.6% a year over the long run of seasons from a September start', () => {
      const pct = pooledDeaths(random);
      expect(pct).toBeGreaterThanOrEqual(1.5);
      expect(pct).toBeLessThanOrEqual(3.6);
    });

    it('puts weight on in the average year', () => {
      for (const r of average) expect(r.gain, `seed ${r.seed}`).toBeGreaterThan(50);
    });

    it('preg tests 0 to 9 points above the expected rate on average, and over 80% in calf', () => {
      const tests = average.flatMap((r) => r.pregTests).filter((p) => p.females >= 20);
      expect(tests.length).toBeGreaterThan(40);
      const over = tests.reduce((s, p) => s + (p.rate - p.expected), 0) / tests.length;
      expect(over * 100).toBeGreaterThan(0);
      expect(over * 100).toBeLessThan(9);
      const inCalf = tests.reduce((s, p) => s + p.rate * p.females, 0);
      const tested = tests.reduce((s, p) => s + p.females, 0);
      expect(inCalf / tested).toBeGreaterThan(0.8);
    });

    it('runs a day in well under 5 ms', () => {
      // A loose check beside the rest of the suite. The benchmark itself is `pnpm test:speed`.
      expect(Math.min(...average.map((r) => r.msPerDay))).toBeLessThan(5);
    });
  });
}
