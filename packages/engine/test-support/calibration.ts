/**
 * The calibration runs (docs/CALIBRATION.md).
 *
 * These are the MVP's `tests/calibrate.js` suites, run on the engine with
 * fixed seeds so the same run always gives the same figures.
 *
 * Test use only. Nothing in `src` but the calibration tests may import this
 * file: it times runs with the clock, which engine code never reads.
 */

import type { DistrictId } from '@gg/shared';
import { applyAction } from '../src/actions/apply';
import type { Action } from '../src/actions/types';
import type { Supplement } from '../src/data/feed';
import { carryingCapacityAE } from '../src/money/costs';
import { createFarm } from '../src/sim/create';
import { averageYear, type GrowthFactorSource } from '../src/season/factors';
import { seasonsOf } from '../src/sim/derived';
import type { FarmState } from '../src/sim/state';
import { stepDay } from '../src/sim/tick';

/** The seasons a run went through: the one it started in, and the one drawn on 1 July. */
export interface RunSeasons {
  start: { label: string; factor: number };
  end: { label: string; factor: number };
  /** The lower of the two season factors. 1 is an average season. */
  worst: number;
}

/** Do an action that must work. A refusal is a fault in the run. */
export function mustDo(farm: FarmState, action: Action): FarmState {
  const done = applyAction(farm, action);
  if (!done.ok) throw new Error(`The ${action.type} action was refused: ${done.message}`);
  return done.farm;
}

const headOf = (farm: FarmState): number =>
  farm.mobs.reduce((n, m) => n + m.animals.filter((a) => a.kind !== 'calf').length, 0);

const liveWeightOf = (farm: FarmState): number =>
  farm.mobs.reduce((t, m) => t + m.animals.reduce((s, a) => s + a.wt, 0), 0);

function seasonsOver(farm: FarmState, days: number): RunSeasons {
  const source = seasonsOf(farm);
  const a = source.factorsOn(0);
  const b = source.factorsOn(days - 1);
  return {
    start: { label: a.label, factor: a.seasonF },
    end: { label: b.label, factor: b.seasonF },
    worst: Math.min(a.seasonF, b.seasonF),
  };
}

/** The average year: every day grows at the district curve, with no good or poor months. */
export const AVERAGE_YEAR: GrowthFactorSource = averageYear;

/** Run a farm for a number of days and return the time each day took, ms. */
export function runDays(farm: FarmState, days: number, seasons?: GrowthFactorSource): number {
  const env = seasons ? { seasons } : {};
  const t0 = performance.now();
  for (let d = 0; d < days; d++) stepDay(farm, env);
  return (performance.now() - t0) / days;
}

export interface SteerCase {
  district: DistrictId;
  /** The month the run starts in, 0 for January. */
  month: number;
  supp: Supplement;
  /** The benchmark, kg a head a year. */
  lo: number;
  hi: number;
}

export interface SteerRun {
  seed: number;
  head: number;
  /** Live weight gained, kg a head over the year. */
  gain: number;
  /** Deaths over the year, % of the head bought. */
  deathsPct: number;
  seasons: RunSeasons;
}

/** The block the steer runs use: small, so the walk to water does not decide the result. */
export const STEER_BLOCK_HA = 260;

/**
 * The steers suite: weaner steers at about 60% of carrying capacity on a
 * 260 ha block with one water, set-stocked for a year from a scratch start.
 */
export function steerRun(c: SteerCase, seed: number, seasons?: GrowthFactorSource): SteerRun {
  let farm = createFarm({
    seed,
    district: c.district,
    size: STEER_BLOCK_HA,
    start: { year: 2021, month: c.month },
    startType: 'scratch',
    difficulty: 'medium',
    money: { cash: 5e6, overdraft: -5e6, broke: -1e7 },
  });
  const head = Math.max(
    10,
    Math.round((carryingCapacityAE(c.district, STEER_BLOCK_HA) * 0.6) / 0.56),
  );
  farm = mustDo(farm, {
    type: 'buyCattle',
    cls: 'weanerSteer',
    qty: head,
    to: { cell: farm.layout.water.bore },
  });
  for (const m of farm.mobs) {
    if (m.supp !== c.supp) farm = mustDo(farm, { type: 'setSupplement', mob: m.id, supp: c.supp });
  }
  const w0 = liveWeightOf(farm);
  const h0 = headOf(farm);
  runDays(farm, 365, seasons);
  const h1 = headOf(farm);
  return {
    seed,
    head: h0,
    gain: h1 ? liveWeightOf(farm) / h1 - w0 / h0 : 0,
    deathsPct: ((h0 - h1) / h0) * 100,
    seasons: seasonsOver(farm, 365),
  };
}

export interface PregTest {
  /** In calf, as a share of the females tested, 0 to 1. */
  rate: number;
  /** What the cattle model expects for their condition, 0 to 1. */
  expected: number;
  females: number;
}

export interface HerdRun {
  seed: number;
  /** Head on the farm at the start, not counting calves. */
  head: number;
  /** Deaths over the year, % of the starting head. */
  deathsPct: number;
  /** Live weight gained over the year, kg for each starting head. */
  gain: number;
  pregTests: PregTest[];
  seasons: RunSeasons;
  msPerDay: number;
}

/**
 * The herds suite: a running farm of the district's medium size on medium
 * difficulty, left alone for a year.
 */
export function herdRun(
  district: DistrictId,
  month: number,
  seed: number,
  seasons?: GrowthFactorSource,
): HerdRun {
  const farm = createFarm({
    seed,
    district,
    size: 'medium',
    start: { year: 2024, month },
    startType: 'running',
    difficulty: 'medium',
  });
  const h0 = headOf(farm);
  const pregTests: PregTest[] = [];
  const env = seasons ? { seasons } : {};
  const t0 = performance.now();
  for (let d = 0; d < 365; d++) {
    for (const e of stepDay(farm, env).events) {
      if (e.type === 'cattle' && e.note.type === 'pregTest') {
        pregTests.push({ rate: e.note.rate, expected: e.note.expected, females: e.note.females });
      }
    }
  }
  const msPerDay = (performance.now() - t0) / 365;
  const year = farm.years[0] ?? farm.year;
  return {
    seed,
    head: h0,
    deathsPct: (year.deaths / h0) * 100,
    gain: year.gain / h0,
    pregTests,
    seasons: seasonsOver(farm, 365),
    msPerDay,
  };
}
