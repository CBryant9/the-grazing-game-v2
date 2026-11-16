/// <reference types="node" />
/**
 * Established breeding herds through each real year, by district
 * (docs/CALIBRATION.md, the milestone 1.4 entry).
 *
 * The herds suite of herds.test.ts, on real-year farms: a running farm of
 * the district's medium size on medium difficulty, left alone for 365 days
 * from 1 September. No sales, no moves, no weaning by hand, no destocking.
 * Central Qld herds are on the lick, as that district starts. Each district
 * is run from every real year that can be played, 1997 to 2025, on the same
 * two seeds, through `createFarm` with `years: { kind: 'real' }`.
 *
 * What is held:
 *
 *   - The deaths benchmark, 1.5 to 3.6% a year, over the years whose own
 *     12 months grew average feed or better, on six herds together. Two
 *     herds are too few for it: each seed is the same herd with the same
 *     luck in every year, so 29 years do not average the luck out (the two
 *     Tablelands herds lose 3.7% over those years, and 3.9% in the average
 *     year). So four more herds are run through those years.
 *   - Over the same years, the first two herds lose within half a point of
 *     what the same two herds lose in the average year.
 *   - A named dry year puts on less weight than a named wet year.
 *   - The same run gives the same figures again.
 *
 * As in herds.test.ts, deaths are counted over the herds together, not
 * herd by herd. That reading is PROPOSED, WAITING ON CLAUDIA
 * (docs/CALIBRATION.md, the 1.3 entry, CHECK 4).
 *
 * A drought year with nothing done is recorded in docs/CALIBRATION.md, not
 * failed. No model figure was tuned for these runs.
 *
 * Each district has its own test file in `src/calibration`. To print the
 * year-by-year tables for docs/CALIBRATION.md:
 *   GG_REAL_YEARS_RUN=1 pnpm exec vitest run packages/engine/src/calibration/realYearHerds --disable-console-intercept --no-file-parallelism
 *
 * Test use only. Nothing in `src` but the calibration tests may import this file.
 */

import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { loadRealData } from '../src/server';
import { AVERAGE_YEAR, herdRun, type HerdRun } from './calibration';

const PRINT = process.env.GG_REAL_YEARS_RUN === '1';
const SEEDS = [1, 2];
/** More herds, run only through the years that grew average feed or better, for the deaths benchmark. */
const MORE_SEEDS = [3, 4, 5, 6];
const SEPTEMBER = 8;

export interface RealYearHerdCase {
  district: DistrictId;
  name: string;
  /** A year the weather was dry in, and one it was wet in, by the year the run starts. */
  dry: number;
  wet: number;
}

export const REAL_YEAR_HERD_CASES = {
  cq: { district: 'cq', name: 'Central Qld', dry: 2002, wet: 2010 },
  nsw: { district: 'nsw', name: 'Northern Tablelands', dry: 2018, wet: 2020 },
  cw: { district: 'cw', name: 'Central West NSW', dry: 2018, wet: 2010 },
  wv: { district: 'wv', name: 'Western Victoria', dry: 2006, wet: 2010 },
} as const satisfies Record<string, RealYearHerdCase>;

const pooledDeaths = (runs: readonly HerdRun[]): number =>
  (runs.reduce((n, r) => n + (r.deathsPct * r.head) / 100, 0) /
    runs.reduce((n, r) => n + r.head, 0)) *
  100;
const pooledGain = (runs: readonly HerdRun[]): number =>
  runs.reduce((n, r) => n + r.gain * r.head, 0) / runs.reduce((n, r) => n + r.head, 0);

/** The tests for one district. Call it once from a test file. */
export function realYearHerdSuite(c: RealYearHerdCase): void {
  vi.setConfig({ testTimeout: 900_000 });
  const data = loadRealData();

  describe(`established herds through real years: ${c.name}`, () => {
    const years = data.district(c.district).years(SEPTEMBER);
    const rows = years.map((year) => ({
      year,
      runs: SEEDS.map((seed) => herdRun(c.district, SEPTEMBER, seed, undefined, { data }, year)),
    }));
    // The same two herds in the average year, as herds.test.ts runs them.
    const average = SEEDS.map((seed) => herdRun(c.district, SEPTEMBER, seed, AVERAGE_YEAR));
    const row = (year: number): (typeof rows)[number] => rows.find((r) => r.year === year)!;
    const seasonOf = (r: (typeof rows)[number]): number => r.runs[0]!.seasons.end.factor;

    if (PRINT) {
      const f = (n: number, d = 0): string => n.toFixed(d);
      const out: string[] = [];
      out.push(`\n#### ${c.name}\n`);
      out.push(
        `| Start | Deaths % (seeds ${SEEDS.join(', ')}) | Deaths %, both | Gain a head, kg | Season before the run | Season of the run |`,
      );
      out.push('|---|---|---|---|---|---|');
      for (const r of rows) {
        const s = r.runs[0]!.seasons;
        out.push(
          `| ${r.year} | ${r.runs.map((x) => f(x.deathsPct, 1)).join(', ')} | ${f(pooledDeaths(r.runs), 1)} | ${f(pooledGain(r.runs))} | ${s.start.label} (${f(s.start.factor, 2)}) | ${s.end.label} (${f(s.end.factor, 2)}) |`,
        );
      }
      const all = rows.flatMap((r) => r.runs);
      const fair = rows.filter((r) => seasonOf(r) >= 0.925).flatMap((r) => r.runs);
      out.push(
        `| **${years.length} years** | | **${f(pooledDeaths(all), 1)}** | **${f(pooledGain(all))}** | | |`,
      );
      out.push(
        `| **Years that grew average feed or better** (${fair.length / SEEDS.length}) | | **${f(pooledDeaths(fair), 1)}** | **${f(pooledGain(fair))}** | | |`,
      );
      out.push(
        `| **The average year** | ${average.map((x) => f(x.deathsPct, 1)).join(', ')} | **${f(pooledDeaths(average), 1)}** | **${f(pooledGain(average))}** | | |`,
      );
      out.push(`\nHead at the start: ${rows[0]!.runs.map((x) => x.head).join(' and ')}.`);
      console.log(out.join('\n'));
    }

    it('runs every year from 1997 to 2025', () => {
      expect(years[0]).toBe(1997);
      expect(years.at(-1)).toBe(2025);
      expect(years.length).toBe(29);
    });

    it('loses 1.5 to 3.6% a year over the years whose own 12 months grew average feed or better, six herds together', () => {
      const fair = rows.filter((r) => seasonOf(r) >= 0.925);
      expect(fair.length).toBeGreaterThanOrEqual(10);
      const more = fair.flatMap((r) =>
        MORE_SEEDS.map((seed) => herdRun(c.district, SEPTEMBER, seed, undefined, { data }, r.year)),
      );
      const pct = pooledDeaths([...fair.flatMap((r) => r.runs), ...more]);
      if (PRINT)
        console.log(
          `${c.name}: six herds over the ${fair.length} fair years lose ${pct.toFixed(2)}%`,
        );
      expect(pct).toBeGreaterThanOrEqual(1.5);
      expect(pct).toBeLessThanOrEqual(3.6);
    });

    it('loses within half a point of the average year, over the years whose own 12 months grew average feed or better', () => {
      const fair = rows.filter((r) => seasonOf(r) >= 0.925);
      expect(fair.length).toBeGreaterThanOrEqual(10);
      const pct = pooledDeaths(fair.flatMap((r) => r.runs));
      const usual = pooledDeaths(average);
      expect(Math.abs(pct - usual)).toBeLessThanOrEqual(0.5);
      // The herds are the same ones in every run.
      for (const r of rows) {
        expect(r.runs.map((x) => x.head)).toEqual(average.map((x) => x.head));
      }
    });

    it(`puts on less weight from ${c.dry}, a dry year, than from ${c.wet}, a wet one`, () => {
      // The weather says which is which: the feed the 12 months of each run allowed.
      expect(seasonOf(row(c.dry))).toBeLessThan(0.8);
      expect(seasonOf(row(c.wet))).toBeGreaterThan(1.075);
      expect(pooledGain(row(c.dry).runs)).toBeLessThan(pooledGain(row(c.wet).runs));
    });

    it('gives the same figures when run again', () => {
      const again = herdRun(c.district, SEPTEMBER, SEEDS[0]!, undefined, { data }, c.dry);
      const first = row(c.dry).runs[0]!;
      // The time a day took is the only figure that changes from run to run.
      expect({ ...again, msPerDay: 0 }).toEqual({ ...first, msPerDay: 0 });
    });
  });
}
