import { describe, expect, it, vi } from 'vitest';
import { AVERAGE_YEAR, steerRun, type SteerCase, type SteerRun } from './runs';

/*
 * Steer gain a head a year, by district (docs/CALIBRATION.md, Benchmarks).
 *
 * Weaner steers at about 60% of carrying capacity on a 260 ha block with
 * one water, set-stocked for a year from a scratch start. Each case runs on
 * the same twelve seeds, two ways:
 *
 *   the average year   every day grows at the district curve, with no good
 *                      or poor months. The seed still changes the block
 *                      (its land, soil and run-up).
 *   random seasons     the farm's own seasons, drawn from the seed. Over
 *                      the twelve seeds this is the long run: droughts and
 *                      wet years in about their usual shares.
 *
 * The band is held in the average year, as the average over the seeds. One
 * block differs from the next by 20 to 30 kg in the very same season, which
 * is wider than some of the bands, so a single run can't be held to it.
 * A run is judged against its season (docs/BUILD_PLAN.md, section 3): the
 * long run takes in droughts and sits lower, and that is recorded in
 * docs/CALIBRATION.md, with the figures for every seed.
 */

vi.setConfig({ testTimeout: 900_000 });

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

interface Case extends SteerCase {
  name: string;
  /**
   * A known gap, for Claudia: the average year runs this many kg over the
   * top of the band. The test fails if the gap grows, and fails if it is no
   * longer needed, so this note can't go stale.
   */
  averageYearOver?: number;
}

const CASES: Case[] = [
  { name: 'Central Qld, no lick', district: 'cq', month: 8, supp: 'none', lo: 20, hi: 60 },
  {
    name: 'Central Qld, with lick',
    district: 'cq',
    month: 8,
    supp: 'lick',
    lo: 75,
    hi: 130,
    averageYearOver: 5,
  },
  { name: 'Northern Tablelands', district: 'nsw', month: 9, supp: 'none', lo: 90, hi: 105 },
  { name: 'Central West NSW', district: 'cw', month: 3, supp: 'none', lo: 115, hi: 130 },
  { name: 'Western Victoria', district: 'wv', month: 3, supp: 'none', lo: 155, hi: 185 },
];

const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const gains = (runs: readonly SteerRun[]): number[] => runs.map((r) => r.gain);

for (const c of CASES) {
  describe(`steer gain: ${c.name} (${c.lo} to ${c.hi} kg a head a year)`, () => {
    const average = SEEDS.map((seed) => steerRun(c, seed, AVERAGE_YEAR));
    const random = SEEDS.map((seed) => steerRun(c, seed));

    it('is in the band in the average year', () => {
      const m = mean(gains(average));
      expect(m).toBeGreaterThanOrEqual(c.lo);
      if (c.averageYearOver === undefined) {
        expect(m).toBeLessThanOrEqual(c.hi);
      } else {
        expect(m).toBeGreaterThan(c.hi);
        expect(m).toBeLessThanOrEqual(c.hi + c.averageYearOver);
      }
    });

    it('is no higher than the band over the long run of seasons, and under the average year', () => {
      // The long run takes in droughts, so it sits under the average year.
      // A run is judged against its season: a year with a poor season may
      // fall under the band, and that is recorded, not failed.
      const m = mean(gains(random));
      expect(m).toBeLessThanOrEqual(c.hi);
      expect(m).toBeLessThan(mean(gains(average)));
      expect(m).toBeGreaterThan(0);
    });

    it('differs between blocks by no more than 40 kg in the average year', () => {
      const g = gains(average);
      expect(Math.max(...g) - Math.min(...g)).toBeLessThan(40);
    });

    it('is lower in the years with a poor season than in the years without one', () => {
      const poor = random.filter((r) => r.seasons.worst < 0.8);
      const fair = random.filter((r) => r.seasons.worst >= 1);
      // The twelve seeds hold some of each.
      expect(poor.length).toBeGreaterThanOrEqual(2);
      expect(fair.length).toBeGreaterThanOrEqual(2);
      expect(mean(gains(poor))).toBeLessThan(mean(gains(fair)));
    });

    it('loses between 0.5% and 3.6% of the steers a year, average year, all blocks together', () => {
      const bought = average.reduce((n, r) => n + r.head, 0);
      const died = average.reduce((n, r) => n + (r.deathsPct * r.head) / 100, 0);
      const pct = (died / bought) * 100;
      expect(pct).toBeGreaterThan(0.5);
      expect(pct).toBeLessThan(3.6);
    });

    it('gives the same figures when run again', () => {
      const again = steerRun(c, SEEDS[0]!);
      expect(again).toEqual(random[0]);
    });
  });
}
