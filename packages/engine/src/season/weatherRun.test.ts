/// <reference types="node" />
import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { dateAt, type FarmStart } from '../calendar';
import { DISTRICTS } from '../data/districts';
import { GRID_N } from '../grid';
import { growGrass } from '../pasture/grow';
import { districtPotential } from '../pasture/potential';
import { clonePastureState, createPastureState, type PastureState } from '../pasture/state';
import { loadWeatherGrowth } from '../server/weatherFiles';
import { averageYear, type GrowthFactorSource } from './factors';
import { isLeapYear, planRealYears } from './realYears';
import { WEATHER_FACTOR_CEILING } from './weatherGrowth';
import { weatherSeasons, weatherYears } from './weatherSeasons';

/*
 * The calibration run for growth from real weather (docs/CALIBRATION.md).
 *
 * The real growGrass is run for each whole real year, 1997 to 2025, in each
 * district, from the same starting pasture every time, and again for the
 * average year. Nothing grazes it. A second run takes a steady amount off
 * each day, as a stand-in for stock, because an ungrazed pasture shades
 * itself and hides part of the difference between years.
 *
 * To print the tables for docs/CALIBRATION.md:
 *   GG_WEATHER_RUN=1 pnpm exec vitest run packages/engine/src/season/weatherRun.test.ts --disable-console-intercept
 */

const IDS: DistrictId[] = ['cq', 'nsw', 'cw', 'wv'];
// A district's run takes a few seconds. Give the checks room when the whole suite is running.
vi.setConfig({ testTimeout: 60_000 });
const PRINT = process.env.GG_WEATHER_RUN === '1';

/** The pasture on 1 January after 540 days of the average year with no stock. */
function startingPasture(id: DistrictId): PastureState {
  const pasture = createPastureState();
  pasture.G.fill(700);
  pasture.D.fill(1400);
  pasture.A.fill(70);
  const start: FarmStart = { year: 2001, month: 0 };
  for (let day = -540; day < 0; day++) {
    growGrass(pasture, {
      district: DISTRICTS[id],
      date: dateAt(start, day),
      seasonF: 1,
      monthF: 1,
      plantings: null,
      haPerSquare: 1,
    });
  }
  return pasture;
}

/** Feed grown over a run of days, kg DM/ha. `take` comes off the green feed each day, kg DM/ha. */
function grow(
  id: DistrictId,
  from: PastureState,
  start: FarmStart,
  days: number,
  seasons: GrowthFactorSource,
  take: number,
): number {
  const pasture = clonePastureState(from);
  let total = 0;
  for (let day = 0; day < days; day++) {
    const f = seasons.factorsOn(day);
    total += growGrass(pasture, {
      district: DISTRICTS[id],
      date: dateAt(start, day),
      seasonF: f.seasonF,
      monthF: f.monthF,
      plantings: null,
      haPerSquare: 1,
    });
    if (take > 0) {
      for (let i = 0; i < GRID_N; i++) pasture.G[i] = Math.max(0, pasture.G[i]! - take);
    }
  }
  return total / GRID_N;
}

interface YearRun {
  year: number;
  /** Rain for the year, mm, added up from the SILO table. */
  rain: number;
  /** The year's growth factor, weighted by the district curve. */
  factor: number;
  /** Feed grown with no stock, kg DM/ha. */
  ungrazed: number;
  /** Feed grown with the steady daily take, kg DM/ha. */
  taken: number;
  /** The season factor and label on 31 December. */
  seasonF: number;
  label: string;
  /** Days of the year with a season factor under 0.8. */
  lowSeasonDays: number;
  /** Days of the year with the growth factor at its ceiling. */
  ceilingDays: number;
  days: number;
}

function runDistrict(id: DistrictId, only?: readonly number[]) {
  const district = DISTRICTS[id];
  const growth = loadWeatherGrowth(id);
  const years = weatherYears(growth);
  const from = startingPasture(id);
  // The stand-in for stock: the district's safe share of a year's growth, spread evenly.
  const take = (district.util * district.annual) / 365;
  const average = {
    ungrazed: grow(id, from, { year: 2001, month: 0 }, 365, averageYear, 0),
    taken: grow(id, from, { year: 2001, month: 0 }, 365, averageYear, take),
  };
  const runs: YearRun[] = (only ?? years).map((year) => {
    const plan = planRealYears({ years, order: 'in-order', seed: 1, firstYear: year });
    // The real weather before the year, as it was, for the look back over the season.
    const seasons = weatherSeasons({ growth, plan, runUpFloor: 0 });
    const days = isLeapYear(year) ? 366 : 365;
    let rain = 0;
    let weighted = 0;
    let weight = 0;
    let lowSeasonDays = 0;
    let ceilingDays = 0;
    for (let day = 0; day < days; day++) {
      const f = seasons.factorsOn(day);
      const c = districtPotential(district, dateAt(plan.start, day));
      rain += seasons.rainOn(day);
      weighted += c * f.monthF;
      weight += c;
      if (f.seasonF < 0.8) lowSeasonDays++;
      if (f.monthF >= WEATHER_FACTOR_CEILING) ceilingDays++;
    }
    const end = seasons.factorsOn(days - 1);
    return {
      year,
      rain,
      factor: weighted / weight,
      ungrazed: grow(id, from, plan.start, days, seasons, 0),
      taken: grow(id, from, plan.start, days, seasons, take),
      seasonF: end.seasonF,
      label: end.label,
      lowSeasonDays,
      ceilingDays,
      days,
    };
  });
  return { district, average, runs, take };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Rank correlation (Spearman): 1 when two lists rise together, 0 when unrelated. */
function rankCorrelation(a: number[], b: number[]): number {
  const ranks = (xs: number[]): number[] => {
    const order = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    order.forEach(([, i], rank) => (r[i] = rank));
    return r;
  };
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let top = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    top += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return top / Math.sqrt(da * db);
}

describe.each(IDS)('whole years of grass on real weather, %s', (id) => {
  const { district, average, runs, take } = runDistrict(id);
  const byRain = [...runs].sort((a, b) => a.rain - b.rain);
  const driest = byRain.slice(0, 5);
  const wettest = byRain.slice(-5).reverse();

  if (PRINT) {
    const n0 = (x: number): string => x.toFixed(0);
    const row = (r: YearRun): string =>
      `| ${r.year} | ${n0(r.rain)} | ${r.factor.toFixed(2)} | ${n0(r.ungrazed)} | ${n0(r.taken)} | ${r.label} |`;
    const head =
      '| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |\n|---|---|---|---|---|---|';
    const days = runs.reduce((a, r) => a + r.days, 0);
    console.log(
      [
        `\n#### ${id} (curve ${n0(district.annual)} kg DM/ha a year, steady take ${take.toFixed(1)} kg DM/ha a day)\n`,
        head,
        ...runs.map(row),
        `| **Average of 29 years** | ${n0(mean(runs.map((r) => r.rain)))} | ${mean(runs.map((r) => r.factor)).toFixed(3)} | ${n0(mean(runs.map((r) => r.ungrazed)))} | ${n0(mean(runs.map((r) => r.taken)))} | |`,
        `| **The average year** | | 1.000 | ${n0(average.ungrazed)} | ${n0(average.taken)} | Average |`,
        `\nLong-run average against the average year: no stock ${((mean(runs.map((r) => r.ungrazed)) / average.ungrazed - 1) * 100).toFixed(1)}%, steady take ${((mean(runs.map((r) => r.taken)) / average.taken - 1) * 100).toFixed(1)}%.`,
        `Rank correlation of rain with growth: no stock ${rankCorrelation(
          runs.map((r) => r.rain),
          runs.map((r) => r.ungrazed),
        ).toFixed(2)}, steady take ${rankCorrelation(
          runs.map((r) => r.rain),
          runs.map((r) => r.taken),
        ).toFixed(2)}.`,
        `Days with a season factor under 0.8: ${((runs.reduce((a, r) => a + r.lowSeasonDays, 0) / days) * 100).toFixed(1)}%. Days at the ceiling: ${((runs.reduce((a, r) => a + r.ceilingDays, 0) / days) * 100).toFixed(1)}%.`,
        `Year factor: lowest ${Math.min(...runs.map((r) => r.factor)).toFixed(2)}, highest ${Math.max(...runs.map((r) => r.factor)).toFixed(2)}.`,
        '\nFive driest years by SILO rain:\n',
        head,
        ...driest.map(row),
        '\nFive wettest years by SILO rain:\n',
        head,
        ...wettest.map(row),
      ].join('\n'),
    );
  }

  it('covers 1997 to 2025', () => {
    expect(runs.map((r) => r.year)).toEqual(Array.from({ length: 29 }, (_, i) => 1997 + i));
  });

  it('grows, over the 29 years, close to what the average year grows', () => {
    const noStock = mean(runs.map((r) => r.ungrazed)) / average.ungrazed;
    const steadyTake = mean(runs.map((r) => r.taken)) / average.taken;
    // The factor itself averages 1. The grass does not answer in a straight
    // line (a full pasture shades itself, a season factor under 0.8 hays feed off faster), so
    // the feed grown comes out a little either side.
    expect(Math.abs(noStock - 1)).toBeLessThan(0.04);
    expect(Math.abs(steadyTake - 1)).toBeLessThan(0.06);
  });

  it('gives each year a growth factor that averages 1 over the 29 years', () => {
    expect(Math.abs(mean(runs.map((r) => r.factor)) - 1)).toBeLessThan(0.01);
  });

  it('grows more in the wetter years', () => {
    const rain = runs.map((r) => r.rain);
    expect(
      rankCorrelation(
        rain,
        runs.map((r) => r.ungrazed),
      ),
    ).toBeGreaterThan(0.6);
    expect(
      rankCorrelation(
        rain,
        runs.map((r) => r.taken),
      ),
    ).toBeGreaterThan(0.6);
    expect(
      rankCorrelation(
        rain,
        runs.map((r) => r.factor),
      ),
    ).toBeGreaterThan(0.6);
  });

  it('grows less in the five driest years than in the five wettest', () => {
    expect(mean(driest.map((r) => r.ungrazed))).toBeLessThan(
      0.85 * mean(wettest.map((r) => r.ungrazed)),
    );
    expect(mean(driest.map((r) => r.taken))).toBeLessThan(0.8 * mean(wettest.map((r) => r.taken)));
  });

  it('grows less than the average year in the driest year, and more in the wettest', () => {
    expect(driest[0]!.ungrazed).toBeLessThan(0.75 * average.ungrazed);
    expect(driest[0]!.factor).toBeLessThan(0.75);
    expect(wettest[0]!.ungrazed).toBeGreaterThan(average.ungrazed);
    expect(wettest[0]!.factor).toBeGreaterThan(1);
  });

  it('never gives a year of no growth or a runaway year', () => {
    for (const r of runs) {
      expect(r.ungrazed).toBeGreaterThan(0.2 * average.ungrazed);
      expect(r.ungrazed).toBeLessThan(1.9 * average.ungrazed);
      expect(Number.isFinite(r.taken)).toBe(true);
    }
  });

  it('gives the same year the same growth when it is run again', () => {
    const some = [1997, 2010, 2019];
    const again = runDistrict(id, some);
    expect(again.runs).toEqual(runs.filter((r) => some.includes(r.year)));
    expect(again.average).toEqual(average);
  });
});
