/// <reference types="node" />
import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  AVERAGE_YEAR,
  CALF_EARLY_AGE,
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
 * Calves born on the farm, growth to 100 and 200 days (docs/CALIBRATION.md,
 * Benchmarks; the sources are in docs/DATA.md, "Calf growth to weaning").
 * Every calf born in the average-year runs, all herds together, weighed on
 * the day it reached 100 days and on the day it reached 200 days, weaned or
 * not. Gain a day to 200 days is from its own birth weight.
 *
 * NONE OF THESE IS THE DISTRICT'S OWN FIGURE. It is the nearest one found:
 *   Northern Tablelands, Central West NSW, Western Victoria: British calves,
 *     MLA More Beef from Pastures tool 5.05 (Grafton research), the
 *     source's own range: 0.7 to 1.1 kg a day, 101 to 146 kg at 100 days
 *     and 171 to 256 kg at 200 days. The tool projects a steady gain over
 *     the whole time, so 100 to 200 days is held at 0.7 to 1.1 kg a day too.
 *   Central Qld: Brahman-Shorthorn calves at Swan's Lagoon, north
 *     Queensland (Fordyce et al. 1993): about 0.77 kg a day to weaning and
 *     161 to 173 kg at 180 days. STAND-IN FLOORS: the source's years differ
 *     by up to 25%, so the floors are a quarter under it (0.6 kg a day,
 *     140 kg); the tops are 0.95 kg a day and 225 kg. No 100-day figure
 *     was found for the north: the floor is FutureBeef's usual lowest
 *     weaning weight, 100 kg at about three months, and the top is MLA's
 *     146 kg.
 *
 * A row the district misses is an open failure (it.fails), named with its
 * figure; it is on Claudia's list in docs/CALIBRATION.md, and it.fails
 * flags it the day it passes. Beside each district is a plain REGRESSION
 * FLOOR: today's figures less a small margin, so the growth cannot slide
 * back unseen. The floor is not a benchmark.
 */
interface CalfRow {
  lo: number;
  hi: number;
  /** Set while the district misses the row: its figure and why. */
  open?: string;
}

interface CalfBands {
  /** Kg a day, birth to 200 days. */
  adg: CalfRow;
  /** Kg at 200 days. */
  kg200: CalfRow;
  /** Kg at 100 days. */
  kg100: CalfRow;
  /** Kg a day, 100 to 200 days. */
  late: CalfRow;
}

const NORTH_QLD: CalfBands = {
  adg: { lo: 0.6, hi: 0.95 },
  kg200: { lo: 140, hi: 225 },
  kg100: { lo: 100, hi: 146 },
  late: { lo: 0.6, hi: 0.95 },
};
const MLA_TOOL_505: CalfBands = {
  adg: { lo: 0.7, hi: 1.1 },
  kg200: { lo: 171, hi: 256 },
  kg100: { lo: 101, hi: 146 },
  late: { lo: 0.7, hi: 1.1 },
};

/** A district's bands with some rows marked open, each with its figure. */
const withOpen = (bands: CalfBands, open: Partial<Record<keyof CalfBands, string>>): CalfBands => ({
  adg: { ...bands.adg, open: open.adg },
  kg200: { ...bands.kg200, open: open.kg200 },
  kg100: { ...bands.kg100, open: open.kg100 },
  late: { ...bands.late, open: open.late },
});

/*
 * Open rows, engine 0.14.0 (docs/CALIBRATION.md, the m2.5 entry). The
 * calves grow well to 100 days and slowly after, as milk tails off and the
 * herd's feed runs at ME 7 to 8 with protein under 7% for months.
 */
const LATE = 'milk tails off and the feed is poor';
const CALF_BANDS: Record<DistrictId, CalfBands> = {
  cq: withOpen(NORTH_QLD, { adg: `0.53 kg a day; ${LATE}`, late: `0.33 kg a day; ${LATE}` }),
  nsw: withOpen(MLA_TOOL_505, {
    adg: `0.54 kg a day; ${LATE}`,
    kg200: `143 kg; ${LATE}`,
    late: `0.39 kg a day; ${LATE}`,
  }),
  cw: withOpen(MLA_TOOL_505, {
    adg: `0.57 kg a day; ${LATE}`,
    kg200: `149 kg; ${LATE}`,
    late: `0.29 kg a day; ${LATE}`,
  }),
  wv: withOpen(MLA_TOOL_505, {
    adg: `0.63 kg a day; ${LATE}`,
    kg200: `163 kg; ${LATE}`,
    late: `0.36 kg a day; ${LATE}`,
  }),
};

/**
 * REGRESSION FLOORS, not benchmarks: engine 0.14.0's figures less 0.02 kg a
 * day and 5 kg, rounded down. Raise them when the calves grow better; never
 * lower them without a CALIBRATION.md entry saying why.
 */
const CALF_FLOORS: Record<DistrictId, Record<keyof CalfBands, number>> = {
  // Engine 0.14.0: 0.532 kg a day, 111.1 kg at 100 days, 142.4 at 200, 0.326 from 100 to 200.
  cq: { adg: 0.51, kg200: 137, kg100: 106, late: 0.3 },
  // 0.537, 107.2, 143.5, 0.387.
  nsw: { adg: 0.51, kg200: 138, kg100: 102, late: 0.36 },
  // 0.566, 120.3, 149.2, 0.292.
  cw: { adg: 0.54, kg200: 144, kg100: 115, late: 0.27 },
  // 0.635, 126.9, 163.0, 0.360.
  wv: { adg: 0.61, kg200: 157, kg100: 121, late: 0.34 },
};

type CalfFigures = Record<keyof CalfBands, number> & { n: number };

function calfFigures(runs: readonly HerdRun[]): CalfFigures {
  const calves = runs.flatMap((r) => r.calves);
  const at100 = runs.flatMap((r) => r.calves100);
  const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  return {
    n: calves.length,
    adg: mean(calves.map((c) => (c.kg - c.birthKg) / CALF_WEIGH_AGE)),
    kg200: mean(calves.map((c) => c.kg)),
    kg100: mean(at100),
    late: mean(calves.map((c) => (c.kg - c.kg100) / (CALF_WEIGH_AGE - CALF_EARLY_AGE))),
  };
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

    const bands = CALF_BANDS[district];
    const calves = (): CalfFigures => {
      const c = calfFigures(average);
      expect(c.n).toBeGreaterThan(40);
      return c;
    };
    if (process.env.GG_CALF_PRINT === '1') {
      const f = (x: CalfFigures): string =>
        `${x.adg.toFixed(3)} kg/day, ${x.kg100.toFixed(1)} kg at 100, ${x.kg200.toFixed(1)} kg at 200, ${x.late.toFixed(3)} kg/day 100-200`;
      const sep = calfFigures(average.slice(0, SEEDS.length));
      const may = calfFigures(average.slice(SEEDS.length));
      const all = calfFigures(average);
      console.log(`${district} calves: n ${all.n}, ${f(all)} | Sep ${f(sep)} | May ${f(may)}`);
    }
    const rows: { key: keyof CalfBands; what: string; unit: string }[] = [
      { key: 'adg', what: 'grow', unit: 'kg a day from birth to 200 days' },
      { key: 'kg200', what: 'weigh', unit: 'kg at 200 days' },
      { key: 'kg100', what: 'weigh', unit: 'kg at 100 days' },
      { key: 'late', what: 'grow', unit: 'kg a day from 100 to 200 days' },
    ];
    for (const row of rows) {
      const band = bands[row.key];
      const name = `calves born on the farm ${row.what} ${band.lo} to ${band.hi} ${row.unit} in the average year (nearest sourced figure, not the district's own)`;
      const test = (): void => {
        const v = calves()[row.key];
        expect(v).toBeGreaterThanOrEqual(band.lo);
        expect(v).toBeLessThanOrEqual(band.hi);
      };
      if (band.open) it.fails(`OPEN: ${name}: ${band.open}`, test);
      else it(name, test);
    }

    const floor = CALF_FLOORS[district];
    it(`REGRESSION FLOOR, not a benchmark: calves grow at least ${floor.adg} kg a day to 200 days and ${floor.late} from 100 to 200, and weigh at least ${floor.kg100} kg at 100 days and ${floor.kg200} kg at 200`, () => {
      const c = calves();
      expect(c.adg).toBeGreaterThanOrEqual(floor.adg);
      expect(c.late).toBeGreaterThanOrEqual(floor.late);
      expect(c.kg100).toBeGreaterThanOrEqual(floor.kg100);
      expect(c.kg200).toBeGreaterThanOrEqual(floor.kg200);
    });

    it('runs a day in well under 5 ms', () => {
      // A loose check beside the rest of the suite. The benchmark itself is `pnpm test:speed`.
      expect(Math.min(...average.map((r) => r.msPerDay))).toBeLessThan(5);
    });
  });
}
