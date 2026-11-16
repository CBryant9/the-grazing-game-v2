import { DISTRICT_IDS, PADDOCK_LABELS, type PaddockLabelId } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import {
  SAMPLE_SQUARES,
  SQUARE_SAMPLES,
  makeScenario,
  putFarm,
  refreshPlantings,
  type Scenario,
} from '../../test-support/farms';
import { loadMvp, type MvpAnimal, type MvpPadStats } from '../../test-support/mvp';
import { DISTRICTS } from '../data/districts';
import { GRID_N, GRID_W } from '../grid';
import type { Plantings } from './plantings';
import { LAND, createPastureState } from './state';
import {
  areaSummary,
  coverPct,
  paddockSummary,
  type PaddockStock,
  type PaddockSummary,
} from './summary';

/*
 * Paddock summaries against the MVP's padStats, regionStats and coverPct.
 * Every number must be exactly equal. Nothing here uses a tolerance.
 */

const { mvp } = loadMvp();

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from }, (_, k) => from + k);

/** Every field of the engine's summary against the MVP's. */
function expectSameSummary(mine: PaddockSummary, theirs: MvpPadStats, where: string): void {
  for (const key of [
    'g',
    'd',
    'mass',
    'green',
    'age',
    'x',
    'me',
    'cp',
    'rest',
    'cover',
    'height',
    'leafH',
    'ae',
    'head',
    'grow',
    'eat',
    'rate',
    'cc',
    'feedDays',
    'ha',
  ] as const) {
    expect(mine[key], `${key} ${where}`).toBe(theirs[key]);
  }
  expect(PADDOCK_LABELS[mine.label].name, `label ${where}`).toBe(mvp.ZONES[theirs.zone]![0]);
}

function summarise(
  scn: Scenario,
  plantings: Plantings | null,
  cells: number[],
  ha: number,
  stock?: PaddockStock,
): PaddockSummary {
  return paddockSummary(scn.state, {
    district: DISTRICTS[scn.district],
    plantings,
    cells,
    ha,
    haPerSquare: scn.farmHa / GRID_N,
    day: scn.day,
    stock,
  });
}

describe('paddock summary, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: paddocks of every shape and land use', (id) => {
    const scn = makeScenario(mvp, {
      district: id,
      start: { year: 2022, month: 9 },
      day: 120,
      landUses: true,
      farmHa: id === 'cq' ? 4000 : 600,
    });
    putFarm(mvp, scn);
    const plantings = refreshPlantings(mvp, scn);
    const ha1 = scn.farmHa / GRID_N;

    const paddocks: number[][] = [range(0, GRID_N), range(0, SAMPLE_SQUARES), [17]];
    // Each row of the map as a paddock, then blocks of 65 squares.
    for (let row = 0; row < GRID_N / GRID_W; row++) {
      paddocks.push(range(row * GRID_W, (row + 1) * GRID_W));
    }
    for (let k = 0; k < GRID_N; k += 65) paddocks.push(range(k, k + 65));

    for (const cells of paddocks) {
      const ha = cells.length * ha1;
      const where = `${id} squares ${cells[0]} to ${cells[cells.length - 1]}`;
      expectSameSummary(summarise(scn, plantings, cells, ha), mvp.padStats({ cells, ha }), where);
    }
  });

  it('summarises part of a paddock, keeping the whole paddock area', () => {
    const scn = makeScenario(mvp, { district: 'nsw', start: { year: 2022, month: 1 }, day: 30 });
    putFarm(mvp, scn);
    const cells = range(0, 400);
    const part = range(120, 200);
    const ha = (cells.length * scn.farmHa) / GRID_N;
    expectSameSummary(summarise(scn, null, part, ha), mvp.padStats({ cells, ha }, part), 'part');
  });

  it('one sample square at a time reaches all four neutral labels', () => {
    const scn = makeScenario(mvp, { district: 'wv', start: { year: 2022, month: 1 } });
    putFarm(mvp, scn);
    const ha = scn.farmHa / GRID_N;
    const seen = new Set<PaddockLabelId>();
    for (let i = 0; i < SAMPLE_SQUARES; i++) {
      const mine = summarise(scn, null, [i], ha);
      expectSameSummary(mine, mvp.padStats({ cells: [i], ha }), `square ${i}`);
      seen.add(mine.label);
    }
    expect([...seen].sort()).toEqual(['green', 'mixed', 'rank', 'short']);
  });

  it('works out stocking rate and days of feed from the stock figures', () => {
    const scn = makeScenario(mvp, { district: 'cq', start: { year: 2022, month: 4 }, day: 10 });
    putFarm(mvp, scn);
    const animals: MvpAnimal[] = [
      { kind: 'cow', wt: 480, age: 2000, lact: 60, preg: -1, calf: 9 },
      { kind: 'calf', wt: 84, age: 60, lact: -1, preg: -1, calf: 0 },
      { kind: 'calf', wt: 160, age: 150, lact: -1, preg: -1, calf: 0 },
      { kind: 'cow', wt: 510, age: 2200, lact: -1, preg: 220, calf: 0 },
      { kind: 'steer', wt: 320, age: 450, lact: -1, preg: -1, calf: 0 },
      { kind: 'bull', wt: 760, age: 1200, lact: -1, preg: -1, calf: 0 },
    ];
    const st = { demand: 812.5, f: 0.93 };
    mvp.S.mobs = [
      { loc: 'pad', anchor: 5, animals, st },
      // A mob in the feedlot is not on the paddock and must not count.
      { loc: 'lot', anchor: 5, animals, st },
    ];

    // The leafy and maturing sample squares, so there is feed above 800 kg DM/ha.
    const cells = range(0, 520).filter((i) => [5, 6].includes(i % SQUARE_SAMPLES.length));
    const ha = (cells.length * scn.farmHa) / GRID_N;
    // The cattle model (milestone 1.2) will hand these in. Here they come
    // from the MVP's own AE figures, shared out by area as the MVP does.
    const share = ha / scn.farmHa;
    let ae = 0;
    let head = 0;
    for (const a of animals) {
      ae += mvp.aeOf(a);
      if (a.kind !== 'calf') head++;
    }
    const stock = { ae: ae * share, head: head * share, eat: st.demand * st.f * share };

    const mine = summarise(scn, null, cells, ha, stock);
    const theirs = mvp.padStats({ cells, ha });
    expectSameSummary(mine, theirs, 'stocked');
    expect(mine.ae).toBeGreaterThan(0);
    expect(mine.rate).toBeGreaterThan(0);
    expect(Number.isFinite(mine.feedDays)).toBe(true);
    expect(mine.feedDays).toBeGreaterThan(0);
  });

  it('gives an empty paddock no stocking rate and feed that never runs out', () => {
    const scn = makeScenario(mvp, { district: 'cw', start: { year: 2022, month: 4 } });
    const mine = summarise(scn, null, range(0, SAMPLE_SQUARES), 50);
    expect(mine.ae).toBe(0);
    expect(mine.rate).toBe(0);
    expect(mine.feedDays).toBe(Infinity);
  });
});

describe('what the paddock summary says', () => {
  const summaryOf = (G: number, D: number, A: number, X: number): PaddockSummary => {
    const s = createPastureState();
    s.G.fill(G);
    s.D.fill(D);
    s.A.fill(A);
    s.X.fill(X);
    return paddockSummary(s, {
      district: DISTRICTS.cq,
      plantings: null,
      cells: range(0, 40),
      ha: 100,
      haPerSquare: 2.5,
      day: 0,
    });
  };

  it('labels by what is there: Short, Green, Dry & rank, Mixed', () => {
    expect(summaryOf(300, 300, 20, 0).label).toBe('short');
    expect(summaryOf(1500, 600, 20, 0).label).toBe('green');
    expect(summaryOf(600, 3000, 120, 0.8).label).toBe('rank');
    expect(summaryOf(900, 1200, 40, 0.1).label).toBe('mixed');
  });

  it('makes rank feed taller than leafy feed of the same weight', () => {
    const leafy = summaryOf(2000, 0, 20, 0);
    const rank = summaryOf(500, 1500, 120, 0.9);
    expect(leafy.mass).toBe(rank.mass);
    expect(rank.height).toBeGreaterThan(leafy.height);
  });

  it('counts the ground as covered at about 1,000 kg DM/ha', () => {
    expect(summaryOf(250, 250, 20, 0).cover).toBe(0.5);
    expect(summaryOf(800, 700, 20, 0).cover).toBe(1);
  });
});

describe('grazing area summary and farm ground cover, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: area summary', (id) => {
    const scn = makeScenario(mvp, {
      district: id,
      start: { year: 2022, month: 6 },
      day: 200,
      landUses: true,
    });
    putFarm(mvp, scn);
    const plantings = refreshPlantings(mvp, scn);
    for (const cells of [range(0, GRID_N), range(0, SAMPLE_SQUARES), range(400, 700), [3]]) {
      const mine = areaSummary(scn.state, {
        district: DISTRICTS[id],
        plantings,
        cells,
        haPerSquare: scn.farmHa / GRID_N,
        day: scn.day,
      });
      const theirs = mvp.regionStats({ cells });
      for (const key of ['g', 'd', 'mass', 'me', 'rest', 'feed', 'green'] as const) {
        expect(mine[key], `${key} ${id} from square ${cells[0]}`).toBe(theirs[key]);
      }
    }
  });

  it('ground cover leaves cropping country out', () => {
    for (const landUses of [false, true]) {
      const scn = makeScenario(mvp, { district: 'cw', start: { year: 2022, month: 6 }, landUses });
      putFarm(mvp, scn);
      expect(coverPct(scn.state)).toBe(mvp.coverPct());
    }
  });

  it('ground cover is 100 on a farm that is all cropping country', () => {
    const scn = makeScenario(mvp, { district: 'cw', start: { year: 2022, month: 6 } });
    scn.state.land.fill(LAND.crop);
    putFarm(mvp, scn);
    expect(coverPct(scn.state)).toBe(100);
    expect(mvp.coverPct()).toBe(100);
  });
});
