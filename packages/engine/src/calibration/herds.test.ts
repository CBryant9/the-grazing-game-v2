/// <reference types="node" />
import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  AVERAGE_YEAR,
  CALF_WEIGH_AGE,
  herdRun,
  type HerdRun,
} from '../../test-support/calibration';

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
 * PROPOSED, WAITING ON CLAUDIA (docs/CALIBRATION.md, the 1.3 entry): single
 * herds run from 0.9 to 4.1% in the average year.
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

/*
 * Calves born on the farm, growth to 200 days (docs/CALIBRATION.md,
 * Benchmarks; the sources are in docs/DATA.md, "Calf growth to weaning").
 * Every calf born in the average-year runs that reaches 200 days in the
 * year, weaned or not, all herds together. Gain a day is from its own
 * birth weight.
 *
 * NONE OF THESE IS THE DISTRICT'S OWN FIGURE. It is the nearest one found:
 *   Central Qld: Brahman-Shorthorn calves at Swan's Lagoon, north
 *     Queensland (Fordyce et al. 1993): about 0.77 kg a day to weaning and
 *     161 to 173 kg at 180 days, with years 25% apart. Band 0.6 to 0.95
 *     kg a day, 140 to 225 kg at 200 days.
 *   Northern Tablelands, Central West NSW, Western Victoria: British
 *     calves, MLA More Beef from Pastures tool 5.05 (Grafton research):
 *     0.7 to 1.1 kg a day, 171 to 256 kg at 200 days. Band 0.6 to 1.1 kg a
 *     day, 150 to 260 kg at 200 days.
 *
 * The herds calve from late November to early March in every district
 * (the start herd's PTIC cows), which is the usual time for Central Qld
 * only. A district that misses its band is an open failure (test.fails),
 * named with its figure; it is on Claudia's list in docs/CALIBRATION.md.
 */
interface CalfBand {
  /** Kg a day, birth to 200 days. */
  adg: [number, number];
  /** Kg at 200 days. */
  kg: [number, number];
  /** Set while the district misses its band: the reason and the figure. */
  open?: string;
}

const NORTH_QLD: Pick<CalfBand, 'adg' | 'kg'> = { adg: [0.6, 0.95], kg: [140, 225] };
const MLA_TOOL_505: Pick<CalfBand, 'adg' | 'kg'> = { adg: [0.6, 1.1], kg: [150, 260] };

/*
 * Open rows, engine 0.14.0 (docs/CALIBRATION.md, the m2.5 entry). Each is
 * under its band on gain a day. What probably closes the gap is on
 * Claudia's list: calving at the district's usual time (half these herds
 * calve August to November from the May start, the rest late November to
 * March), and herd paddocks whose feed runs at ME 7 to 8, under the
 * source's lowest pasture (ME 9.0).
 */
const CALF_BANDS: Record<DistrictId, CalfBand> = {
  cq: { ...NORTH_QLD, open: '0.53 kg a day and 142 kg; under 0.6 kg a day' },
  nsw: { ...MLA_TOOL_505, open: '0.54 kg a day and 144 kg; under 0.6 kg a day and 150 kg' },
  cw: { ...MLA_TOOL_505, open: '0.57 kg a day and 149 kg; under 0.6 kg a day and 150 kg' },
  wv: { ...MLA_TOOL_505 },
};

function calfFigures(runs: readonly HerdRun[]): { n: number; adg: number; kg: number } {
  const calves = runs.flatMap((r) => r.calves);
  const n = calves.length;
  const kg = calves.reduce((s, c) => s + c.kg, 0) / n;
  const adg = calves.reduce((s, c) => s + (c.kg - c.birthKg) / CALF_WEIGH_AGE, 0) / n;
  return { n, adg, kg };
}

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

    it('loses 1.5 to 3.6% a year with random seasons from a September start, all herds together', () => {
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

    const band = CALF_BANDS[district];
    const calfName = `calves born on the farm grow ${band.adg[0]} to ${band.adg[1]} kg a day and weigh ${band.kg[0]} to ${band.kg[1]} kg at 200 days in the average year (nearest sourced figure, not the district's own)`;
    const calfTest = (): void => {
      const c = calfFigures(average);
      if (process.env.GG_CALF_PRINT === '1') {
        const sep = calfFigures(average.slice(0, SEEDS.length));
        const may = calfFigures(average.slice(SEEDS.length));
        console.log(
          `${district} calves: n ${c.n}, ${c.adg.toFixed(3)} kg/day, ${c.kg.toFixed(1)} kg at 200 days (Sep start ${sep.adg.toFixed(3)}, ${sep.kg.toFixed(1)}; May start ${may.adg.toFixed(3)}, ${may.kg.toFixed(1)})`,
        );
      }
      expect(c.n).toBeGreaterThan(40);
      expect(c.adg).toBeGreaterThanOrEqual(band.adg[0]);
      expect(c.adg).toBeLessThanOrEqual(band.adg[1]);
      expect(c.kg).toBeGreaterThanOrEqual(band.kg[0]);
      expect(c.kg).toBeLessThanOrEqual(band.kg[1]);
    };
    if (band.open) it.fails(`OPEN: ${calfName}: ${band.open}`, calfTest);
    else it(calfName, calfTest);

    it('runs a day in well under 5 ms', () => {
      // A loose check beside the rest of the suite. The benchmark itself is `pnpm test:speed`.
      expect(Math.min(...average.map((r) => r.msPerDay))).toBeLessThan(5);
    });
  });
}
