/// <reference types="node" />
/**
 * Steer gain through each real year, by district (docs/CALIBRATION.md, the
 * milestone 1.4 entry).
 *
 * The steers suite of steers.test.ts, on real-year farms: weaner steers at
 * about 60% of carrying capacity on a 260 ha block with one water,
 * set-stocked for 365 days from a scratch start, with no destocking. Each
 * case is run from its start month in every real year that can be played,
 * 1997 to 2025, on the same three seeds. The farm is made by `createFarm`
 * with `years: { kind: 'real' }`, so the run-up, the daily growth, the
 * prices and the date all come through the engine's own wiring.
 *
 * What is held is only what the runs show and can be defended:
 *
 *   - Over the real years the average gain is no higher than the band, and
 *     no higher than the same blocks gain in the average year.
 *   - The middle year of the 29 is inside the band.
 *   - A named dry year gains less than a named wet year.
 *   - A year whose own 12 months grew average feed or better loses 1.5 to
 *     3.6% of the steers.
 *   - The same run gives the same figures again.
 *
 * A single real year is judged against its season: a drought year under
 * the band is recorded in docs/CALIBRATION.md, not failed. No model figure
 * was tuned for these runs.
 *
 * Each case has its own test file in `src/calibration`, so the five run
 * side by side. To print the year-by-year tables for docs/CALIBRATION.md:
 *   GG_REAL_YEARS_RUN=1 pnpm exec vitest run packages/engine/src/calibration/realYearSteers --disable-console-intercept --no-file-parallelism
 *
 * Test use only. Nothing in `src` but the calibration tests may import this file.
 */

import { describe, expect, it, vi } from 'vitest';
import { loadRealData } from '../src/server';
import { AVERAGE_YEAR, steerRun, type SteerCase, type SteerRun } from './calibration';

const PRINT = process.env.GG_REAL_YEARS_RUN === '1';
const SEEDS = [1, 2, 3];

export interface RealYearSteerCase extends SteerCase {
  name: string;
  /**
   * The real years' average gain is at most this far under the same
   * blocks' average year, kg. Not a benchmark: a guard set a little past
   * what the runs gave (the figure in the comment), so a change shows up.
   */
  underAverageYear: number;
  /** A year the weather was dry in, and one it was wet in, by the year the run starts. */
  dry: number;
  wet: number;
}

export const REAL_YEAR_STEER_CASES = {
  cqNoLick: {
    name: 'Central Qld, no lick',
    district: 'cq',
    month: 8,
    supp: 'none',
    lo: 20,
    hi: 60,
    // The runs gave 10 kg under.
    underAverageYear: 13,
    dry: 2002,
    wet: 2010,
  },
  cqLick: {
    name: 'Central Qld, with lick',
    district: 'cq',
    month: 8,
    supp: 'lick',
    lo: 75,
    hi: 130,
    // The runs gave 7 kg under.
    underAverageYear: 10,
    dry: 2002,
    wet: 2010,
  },
  nsw: {
    name: 'Northern Tablelands',
    district: 'nsw',
    month: 9,
    supp: 'none',
    lo: 90,
    hi: 105,
    // The runs gave 6 kg under.
    underAverageYear: 9,
    dry: 2018,
    wet: 2020,
  },
  cw: {
    name: 'Central West NSW',
    district: 'cw',
    month: 3,
    supp: 'none',
    lo: 115,
    hi: 130,
    // The runs gave 28 kg under: four drought years with heavy losses pull the average down.
    underAverageYear: 31,
    dry: 2019,
    wet: 2016,
  },
  wv: {
    name: 'Western Victoria',
    district: 'wv',
    month: 3,
    supp: 'none',
    lo: 155,
    hi: 185,
    // The runs gave 3 kg under.
    underAverageYear: 6,
    dry: 2006,
    wet: 2016,
  },
} as const satisfies Record<string, RealYearSteerCase>;

const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const median = (v: readonly number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** The tests for one case. Call it once from a test file. */
export function realYearSteerSuite(c: RealYearSteerCase): void {
  vi.setConfig({ testTimeout: 900_000 });
  const data = loadRealData();

  describe(`steer gain through real years: ${c.name} (${c.lo} to ${c.hi} kg a head a year)`, () => {
    const years = data.district(c.district).years(c.month);
    // One row for each real year: the same three blocks, started in that year.
    const rows = years.map((year) => ({
      year,
      runs: SEEDS.map((seed): SteerRun => steerRun({ ...c, year }, seed, undefined, { data })),
    }));
    // The same three blocks in the average year, as steers.test.ts runs them.
    const average = SEEDS.map((seed) => steerRun(c, seed, AVERAGE_YEAR));
    const gainOf = (r: (typeof rows)[number]): number => mean(r.runs.map((x) => x.gain));
    const row = (year: number): (typeof rows)[number] => rows.find((r) => r.year === year)!;
    const all = rows.flatMap((r) => r.runs.map((x) => x.gain));

    if (PRINT) {
      const f = (n: number, d = 0): string => n.toFixed(d);
      const out: string[] = [];
      out.push(`\n#### ${c.name}\n`);
      out.push(
        `| Start | Gain, kg a head (seeds ${SEEDS.join(', ')}) | Average | Deaths % | Season before the run | Season of the run |`,
      );
      out.push('|---|---|---|---|---|---|');
      for (const r of rows) {
        const s = r.runs[0]!.seasons;
        out.push(
          `| ${r.year} | ${r.runs.map((x) => f(x.gain)).join(', ')} | ${f(gainOf(r))} | ${f(mean(r.runs.map((x) => x.deathsPct)), 1)} | ${s.start.label} (${f(s.start.factor, 2)}) | ${s.end.label} (${f(s.end.factor, 2)}) |`,
        );
      }
      out.push(
        `| **${years.length} years** | ${SEEDS.map((_, i) => f(mean(rows.map((r) => r.runs[i]!.gain)))).join(', ')} | **${f(mean(all))}** (middle year ${f(median(rows.map(gainOf)))}) | ${f(mean(rows.flatMap((r) => r.runs.map((x) => x.deathsPct))), 1)} | | |`,
      );
      out.push(
        `| **The average year** | ${average.map((x) => f(x.gain)).join(', ')} | **${f(mean(average.map((x) => x.gain)))}** | ${f(mean(average.map((x) => x.deathsPct)), 1)} | | |`,
      );
      const under = rows.filter((r) => gainOf(r) < c.lo).map((r) => r.year);
      const over = rows.filter((r) => gainOf(r) > c.hi).map((r) => r.year);
      out.push(`\nUnder the band (${c.lo}): ${under.join(', ') || 'none'}.`);
      out.push(`Over the band (${c.hi}): ${over.join(', ') || 'none'}.`);
      console.log(out.join('\n'));
    }

    it('runs every year from 1997 to 2025', () => {
      expect(years[0]).toBe(1997);
      expect(years.at(-1)).toBe(2025);
      expect(years.length).toBe(29);
    });

    it('averages no higher than the band over the real years', () => {
      expect(mean(all)).toBeLessThanOrEqual(c.hi);
      expect(mean(all)).toBeGreaterThan(0);
    });

    it('averages no higher than the same blocks in the average year, and not far under', () => {
      const real = mean(all);
      const avg = mean(average.map((r) => r.gain));
      expect(real).toBeLessThanOrEqual(avg);
      expect(real).toBeGreaterThanOrEqual(avg - c.underAverageYear);
    });

    it('is inside the band in the middle year of the 29', () => {
      const middle = median(rows.map(gainOf));
      expect(middle).toBeGreaterThanOrEqual(c.lo);
      expect(middle).toBeLessThanOrEqual(c.hi);
    });

    it(`gains less from ${c.dry}, a dry year, than from ${c.wet}, a wet one`, () => {
      // The weather says which is which: the feed the 12 months of each run allowed.
      expect(row(c.dry).runs[0]!.seasons.end.factor).toBeLessThan(0.8);
      expect(row(c.wet).runs[0]!.seasons.end.factor).toBeGreaterThan(1.075);
      expect(gainOf(row(c.dry))).toBeLessThan(gainOf(row(c.wet)));
      // On every block, not only on average.
      for (let i = 0; i < SEEDS.length; i++) {
        expect(row(c.dry).runs[i]!.gain, `seed ${SEEDS[i]}`).toBeLessThan(row(c.wet).runs[i]!.gain);
      }
    });

    it('loses 1.5 to 3.6% of the steers in a year whose own 12 months grew average feed or better', () => {
      const fair = rows.filter((r) => r.runs[0]!.seasons.end.factor >= 0.925);
      expect(fair.length).toBeGreaterThanOrEqual(10);
      for (const r of fair) {
        const bought = r.runs.reduce((n, x) => n + x.head, 0);
        const died = r.runs.reduce((n, x) => n + (x.deathsPct * x.head) / 100, 0);
        const pct = (died / bought) * 100;
        expect(pct, `${r.year}`).toBeGreaterThanOrEqual(1.5);
        expect(pct, `${r.year}`).toBeLessThanOrEqual(3.6);
      }
    });

    it('gives the same figures when run again', () => {
      const again = steerRun({ ...c, year: c.dry }, SEEDS[0]!, undefined, { data });
      expect(again).toEqual(row(c.dry).runs[0]);
    });
  });
}
