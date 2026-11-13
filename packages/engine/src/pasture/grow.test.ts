import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import {
  expectSamePasture,
  growInputs,
  makeScenario,
  putFarm,
  refreshPlantings,
  type Scenario,
} from '../../test-support/farms';
import { loadMvp } from '../../test-support/mvp';
import { dateAt } from '../calendar';
import { DISTRICTS } from '../data/districts';
import { GRID_N } from '../grid';
import { randomSeasons } from '../season/randomSeasons';
import { growGrass } from './grow';
import { LAND, createPastureState } from './state';

/*
 * The daily pasture step against the MVP's own growGrass.
 *
 * Both get the same farm and the same day. Every array must then be equal
 * bit for bit, and the farm total must be the same number exactly. Nothing
 * here uses a tolerance.
 */

const { mvp } = loadMvp();

/** Season and month factors from the hardest drought month to the wettest. */
const FACTORS = [
  { name: 'drought, driest month', seasonF: 0.5, monthF: 0.15 },
  { name: 'drought', seasonF: 0.5, monthF: 0.5 },
  { name: 'well below average', seasonF: 0.7, monthF: 0.6 },
  { name: 'below average', seasonF: 0.85, monthF: 0.85 },
  { name: 'average', seasonF: 1, monthF: 1 },
  { name: 'above average', seasonF: 1.15, monthF: 1.3 },
  { name: 'wet, wettest month', seasonF: 1.35, monthF: 1.9 },
];

/** Run one day in the MVP and in the engine, and compare everything. */
function stepBoth(scn: Scenario, where: string): number {
  mvp.S.day = scn.day;
  mvp.S.rainF = scn.seasonF;
  mvp.S.monthF = scn.monthF;
  const plantings = refreshPlantings(mvp, scn);
  mvp.S.yr.grown = 0;
  mvp.growGrass(true);
  const grown = growGrass(scn.state, growInputs(scn, plantings));
  expect(grown, `farm total ${where}`).toBe(mvp.S.yr.grown);
  expectSamePasture(scn.state, mvp, where);
  return grown;
}

describe('one day of pasture, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s native pasture: every month, early, mid and late', (id) => {
    for (let month = 0; month < 12; month++) {
      for (const day of [0, 14, 27]) {
        for (const f of FACTORS) {
          const scn = makeScenario(mvp, { district: id, start: { year: 2022, month }, day, ...f });
          putFarm(mvp, scn);
          stepBoth(scn, `${id} month ${month} day ${day} ${f.name}`);
        }
      }
    }
  });

  it.each(DISTRICT_IDS)('%s sown pasture, crops, fallow and stubble: every month', (id) => {
    for (let month = 0; month < 12; month++) {
      for (const f of [FACTORS[0]!, FACTORS[4]!, FACTORS[6]!]) {
        const scn = makeScenario(mvp, {
          district: id,
          start: { year: 2022, month },
          day: 9,
          landUses: true,
          ...f,
        });
        putFarm(mvp, scn);
        stepBoth(scn, `${id} month ${month} ${f.name}`);
      }
    }
  });

  it('covers every crop and pasture stage', () => {
    const scn = makeScenario(mvp, {
      district: 'cw',
      start: { year: 2022, month: 5 },
      landUses: true,
    });
    putFarm(mvp, scn);
    const plantings = refreshPlantings(mvp, scn)!;
    const stages = new Set([...plantings.byId.values()].map((p) => `${p.kind}:${p.now.stage}`));
    expect([...stages].sort()).toEqual([
      'annual:est',
      'annual:veg',
      'crop:done',
      'crop:est',
      'crop:head',
      'crop:lock',
      'crop:none',
      'crop:veg',
      'pasture:est',
      'pasture:ok',
    ]);
    // One sown pasture is past its life and has thinned.
    expect([...plantings.byId.values()].some((p) => p.now.pf !== undefined && p.now.pf < 1)).toBe(
      true,
    );
  });
});

describe('many days in a row, against the MVP', () => {
  // A start month for each district that takes the run through its dry or
  // frosty months and its heading months.
  const STARTS: Record<DistrictId, number> = { cq: 0, nsw: 8, cw: 3, wv: 6 };

  it.each(DISTRICT_IDS)('%s stays equal every day for 400 days, with random seasons', (id) => {
    const start = { year: 2023, month: STARTS[id] };
    const seasons = randomSeasons({ seed: 20261113, start });
    const scn = makeScenario(mvp, { district: id, start, landUses: true, seed: 7 });
    putFarm(mvp, scn);
    let grown = 0;
    for (let day = 0; day < 400; day++) {
      const f = seasons.factorsOn(day);
      scn.day = day;
      scn.seasonF = f.seasonF;
      scn.monthF = f.monthF;
      grown += stepBoth(scn, `${id} day ${day}`);
      // Every 25 days take feed off a third of the squares in both farms,
      // the way a graze would, so the run keeps visiting short, leafy and
      // rank states instead of settling.
      if (day % 25 === 24) {
        for (const s of [scn.state, mvp.S]) {
          for (let i = 0; i < GRID_N; i += 3) {
            s.G[i] = s.G[i]! * 0.3;
            s.D[i] = s.D[i]! * 0.7;
            s.A[i] = s.A[i]! * 0.5;
            s.X[i] = s.X[i]! * 0.4;
            s.graz[i] = 1;
          }
        }
      }
    }
    expect(grown).toBeGreaterThan(0);
  });

  it.each(DISTRICT_IDS)('%s stays equal through a 200-day drought and a 200-day wet', (id) => {
    for (const f of [FACTORS[0]!, FACTORS[6]!]) {
      const scn = makeScenario(mvp, {
        district: id,
        start: { year: 2024, month: (STARTS[id] + 6) % 12 },
        seed: 11,
        ...f,
      });
      putFarm(mvp, scn);
      for (let day = 0; day < 200; day++) {
        scn.day = day;
        stepBoth(scn, `${id} ${f.name} day ${day}`);
      }
    }
  });
});

describe('what the daily step does', () => {
  const inputs = {
    district: DISTRICTS.cq,
    date: dateAt({ year: 2023, month: 0 }, 14),
    seasonF: 1,
    monthF: 1,
    plantings: null,
    haPerSquare: 2,
  };

  it('grows nothing on fallow or stubble, and the feed there breaks down', () => {
    const s = createPastureState();
    s.land[0] = LAND.fallow;
    s.land[1] = LAND.stubble;
    for (const i of [0, 1]) {
      s.G[i] = 500;
      s.D[i] = 2000;
      s.A[i] = 30;
      s.X[i] = 0.4;
    }
    growGrass(s, inputs);
    expect([s.G[0], s.A[0], s.X[0], s.grown[0]]).toEqual([0, 0, 0, 0]);
    expect([s.G[1], s.A[1], s.X[1], s.grown[1]]).toEqual([0, 0, 0, 0]);
    expect(s.D[0]).toBe(Math.fround(2000 - 2000 * 0.03));
    expect(s.D[1]).toBe(Math.fround(2000 - 2000 * 0.004));
  });

  it('turns stubble into fallow once it is under 400 kg DM/ha', () => {
    const s = createPastureState();
    s.land[0] = LAND.stubble;
    s.D[0] = 401;
    s.land[1] = LAND.stubble;
    s.D[1] = 420;
    growGrass(s, inputs);
    expect(s.land[0]).toBe(LAND.fallow);
    expect(s.land[1]).toBe(LAND.stubble);
  });

  it('returns the farm total in kg DM and fills the grown-today array', () => {
    const s = createPastureState();
    s.G.fill(1200);
    s.D.fill(600);
    s.A.fill(20);
    const total = growGrass(s, inputs);
    expect(s.grown[0]).toBeGreaterThan(0);
    expect(total).toBeCloseTo(s.grown[0]! * 2 * GRID_N, 3);
  });

  it('fades the recent-grazing mark by a tenth a day', () => {
    const s = createPastureState();
    s.graz[0] = 1;
    growGrass(s, inputs);
    expect(s.graz[0]).toBe(Math.fround(0.9));
  });
});
