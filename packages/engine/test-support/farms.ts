/**
 * Test farms, and the plumbing to give the same farm to the MVP and to the
 * engine so their results can be compared.
 *
 * Test use only. Nothing in `src` may import this file.
 */

import type { DistrictId } from '@gg/shared';
import { expect } from 'vitest';
import { dateAt, type FarmStart } from '../src/calendar';
import { DISTRICTS } from '../src/data/districts';
import { GRID_N } from '../src/grid';
import type { GrowInputs } from '../src/pasture/grow';
import type { Planting, PlantingKind, PlantingNow, Plantings } from '../src/pasture/plantings';
import { clonePastureState, createPastureState, type PastureState } from '../src/pasture/state';
import { rngStream } from '../src/rng';
import type { Mvp, MvpField } from './mvp';

/** One square's pasture: green, dead, leaf age, rankness. */
export interface SquareSample {
  name: string;
  G: number;
  D: number;
  A: number;
  X: number;
}

/**
 * A spread of square states, from bare ground to heavy rank thatch. Each
 * one sits in a different part of the formulas.
 */
export const SQUARE_SAMPLES: readonly SquareSample[] = [
  { name: 'nothing there', G: 0, D: 0, A: 0, X: 0 },
  { name: 'bare', G: 120, D: 310, A: 20, X: 0.05 },
  { name: 'very short and dry', G: 150, D: 630, A: 50, X: 0.2 },
  { name: 'very short and green', G: 500, D: 300, A: 12, X: 0 },
  { name: 'short green regrowth', G: 700, D: 600, A: 15, X: 0.1 },
  { name: 'leafy', G: 1800, D: 500, A: 25, X: 0.1 },
  { name: 'maturing', G: 3000, D: 1200, A: 70, X: 0.3 },
  { name: 'rank and gone to head', G: 2200, D: 3200, A: 120, X: 0.8 },
  { name: 'hayed off', G: 120, D: 2400, A: 150, X: 0.4 },
  { name: 'heavy dead thatch', G: 600, D: 4200, A: 90, X: 0.5 },
  { name: 'more than the country can carry', G: 5000, D: 3000, A: 170, X: 1 },
  { name: 'just over the rankness triggers', G: 1001, D: 2501, A: 41, X: 0.549 },
  { name: 'part green, part dry', G: 900, D: 1200, A: 40, X: 0.1 },
  { name: 'short but gone to head', G: 300, D: 500, A: 80, X: 0.7 },
  { name: 'young leaf, heavy', G: 2800, D: 400, A: 30, X: 0.1 },
  { name: 'tall and mostly dry, not rank', G: 1000, D: 3000, A: 100, X: 0.3 },
  { name: 'rank but not tall', G: 800, D: 1100, A: 50, X: 0.55 },
];

/** Soil fertility from the poorest to the best the game uses. */
export const FERTILITY_SAMPLES: readonly number[] = [0.6, 0.72, 0.9, 1, 1.1, 1.25, 1.35];

/** Squares needed to show every sample at every fertility. */
export const SAMPLE_SQUARES = SQUARE_SAMPLES.length * FERTILITY_SAMPLES.length;

/**
 * A native pasture farm covering every sample at every fertility. The first
 * SAMPLE_SQUARES squares are the exact samples. The rest are the samples
 * nudged by up to 15% either way, so the farm is not a repeating pattern.
 */
export function samplePasture(seed: number): PastureState {
  const s = createPastureState();
  const rng = rngStream(seed, 'test-farm');
  for (let i = 0; i < GRID_N; i++) {
    const sq = SQUARE_SAMPLES[i % SQUARE_SAMPLES.length]!;
    const nudge = (): number => (i < SAMPLE_SQUARES ? 1 : rng.range(0.85, 1.15));
    s.G[i] = sq.G * nudge();
    s.D[i] = sq.D * nudge();
    s.A[i] = sq.A * nudge();
    s.X[i] = Math.min(1, sq.X * nudge());
    s.F[i] = FERTILITY_SAMPLES[i % FERTILITY_SAMPLES.length]!;
    s.graz[i] = rng.next();
    s.lastG[i] = rng.chance(0.2) ? -99999 : -rng.int(0, 600);
    s.grown[i] = rng.range(0, 40);
  }
  return s;
}

/** A planting to put on a test farm. */
export interface FieldSpec {
  /** MVP species key. */
  sp: string;
  /** Days since sowing on the scenario's first day. Negative means not sown yet. */
  age: number;
  /** Stand strength of a self-sown stand. */
  str?: number;
  /** Land use to give its squares, if not the usual one for its type. */
  land?: number;
}

/**
 * Plantings that cover sown pasture (establishing, established, past its
 * life, oversown), every crop stage, an annual forage and a thin self-sown
 * stand. The last one sits on fallow land, a case the MVP's code allows for.
 */
export const FIELD_SPECS: readonly FieldSpec[] = [
  { sp: 'phal', age: 40 },
  { sp: 'phal', age: 365 * 8 },
  { sp: 'stylo', age: 200 },
  { sp: 'rye', age: 400 },
  { sp: 'oats', age: -10 },
  { sp: 'oats', age: 20 },
  { sp: 'oats', age: 80 },
  { sp: 'oats', age: 130 },
  { sp: 'oats', age: 170 },
  { sp: 'oats', age: 230 },
  { sp: 'barley', age: 150 },
  { sp: 'forsorg', age: 100 },
  { sp: 'annrye', age: 30, str: 0.12 },
  { sp: 'phal', age: 500, land: 4 },
];

const NATIVE_END = 480;
const FALLOW_END = 520;
const STUBBLE_END = 560;
const FIELD_SIZE = Math.floor((GRID_N - STUBBLE_END) / FIELD_SPECS.length);

export interface Scenario {
  district: DistrictId;
  start: FarmStart;
  day: number;
  seasonF: number;
  monthF: number;
  farmHa: number;
  /** The engine's copy of the pasture. */
  state: PastureState;
  fid: Int16Array;
  density: Float32Array;
  fields: MvpField[];
}

export interface ScenarioOptions {
  district: DistrictId;
  start: FarmStart;
  day?: number;
  seasonF?: number;
  monthF?: number;
  farmHa?: number;
  seed?: number;
  /** Add fallow, stubble and the plantings in FIELD_SPECS. */
  landUses?: boolean;
}

/** Build a test farm. With `landUses` it has every kind of square. */
export function makeScenario(mvp: Mvp, o: ScenarioOptions): Scenario {
  const day = o.day ?? 0;
  const state = samplePasture(o.seed ?? 1);
  const fid = new Int16Array(GRID_N).fill(-1);
  const density = new Float32Array(GRID_N).fill(1);
  const fields: MvpField[] = [];

  if (o.landUses) {
    for (let i = NATIVE_END; i < FALLOW_END; i++) {
      state.land[i] = 4;
      state.D[i] = (i - NATIVE_END) * 75;
    }
    for (let i = FALLOW_END; i < STUBBLE_END; i++) {
      state.land[i] = 5;
      // From just under the 400 kg DM/ha point where stubble becomes fallow.
      state.D[i] = [399, 400, 401, 402, 410][i - FALLOW_END] ?? 380 + (i - FALLOW_END) * 80;
    }
    FIELD_SPECS.forEach((spec, k) => {
      const first = STUBBLE_END + k * FIELD_SIZE;
      const cells = Array.from({ length: FIELD_SIZE }, (_, j) => first + j);
      const type = mvp.SPECIES[spec.sp]!.type;
      for (const i of cells) {
        fid[i] = k;
        density[i] = [1, 1, 0.8, 0.4][i % 4]!;
        state.land[i] = spec.land ?? (type === 'pasture' ? 1 : type === 'crop' ? 3 : 2);
      }
      fields.push({ id: k, sp: spec.sp, sown: day - spec.age, cells, str: spec.str });
    });
  }

  return {
    district: o.district,
    start: o.start,
    day,
    seasonF: o.seasonF ?? 1,
    monthF: o.monthF ?? 1,
    farmHa: o.farmHa ?? 2000,
    state,
    fid,
    density,
    fields,
  };
}

/**
 * Give the MVP its own copy of the scenario's farm. The whole farm is one
 * grazing area, which is all the paddock summary needs.
 */
export function putFarm(mvp: Mvp, scn: Scenario): void {
  const s = clonePastureState(scn.state);
  mvp.HA = scn.farmHa / GRID_N;
  mvp.GRW.set(s.grown);
  mvp.S = {
    region: scn.district,
    startY: scn.start.year,
    startM: scn.start.month,
    day: scn.day,
    rainF: scn.seasonF,
    monthF: scn.monthF,
    G: s.G,
    D: s.D,
    A: s.A,
    X: s.X,
    F: s.F,
    land: s.land,
    fid: scn.fid.slice(),
    CD: scn.density.slice(),
    graz: s.graz,
    lastG: s.lastG,
    fields: scn.fields,
    mobs: [],
    yr: { grown: 0 },
  };
  mvp.FMAP = new Map(scn.fields.map((f) => [f.id, f]));
  mvp.REGS = [{ id: 0, cells: Array.from({ length: GRID_N }, (_, i) => i), ha: scn.farmHa }];
  mvp.ROF = new Int16Array(GRID_N);
}

/**
 * Work out what every planting is doing on the MVP's current day, with the
 * MVP's own fieldState, and hand the same records to the engine. The crop
 * model that will produce these in the engine is milestone 1.2.
 */
export function refreshPlantings(mvp: Mvp, scn: Scenario): Plantings | null {
  if (!scn.fields.length) return null;
  const byId = new Map<number, Planting>();
  for (const f of mvp.S.fields) {
    f.now = mvp.fieldState(f, mvp.S.day, mvp.S.monthF);
    byId.set(f.id, {
      kind: mvp.SPECIES[f.sp]!.type as PlantingKind,
      now: { ...f.now } as PlantingNow,
    });
  }
  return { fid: scn.fid, density: scn.density, byId };
}

/** The engine's inputs for the scenario's current day. */
export function growInputs(scn: Scenario, plantings: Plantings | null): GrowInputs {
  return {
    district: DISTRICTS[scn.district],
    date: dateAt(scn.start, scn.day),
    seasonF: scn.seasonF,
    monthF: scn.monthF,
    plantings,
    haPerSquare: scn.farmHa / GRID_N,
  };
}

/**
 * Where two lists of numbers first differ, or null if they are the same.
 * Uses Object.is, so the match is exact: bit for bit on 32-bit arrays, and
 * +0 is not -0.
 */
export function firstDifference(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
): string | null {
  if (actual.length !== expected.length) return `length ${actual.length}, MVP ${expected.length}`;
  for (let i = 0; i < expected.length; i++) {
    if (!Object.is(actual[i], expected[i])) {
      return `square ${i}: engine ${actual[i]}, MVP ${expected[i]}`;
    }
  }
  return null;
}

/** Assert every pasture array in the engine equals the MVP's, exactly. */
export function expectSamePasture(state: PastureState, mvp: Mvp, where = ''): void {
  const S = mvp.S;
  const pairs: [string, ArrayLike<number>, ArrayLike<number>][] = [
    ['G', state.G, S.G],
    ['D', state.D, S.D],
    ['A', state.A, S.A],
    ['X', state.X, S.X],
    ['F', state.F, S.F],
    ['land', state.land, S.land],
    ['graz', state.graz, S.graz],
    ['grown', state.grown, mvp.GRW],
  ];
  for (const [name, mine, theirs] of pairs) {
    expect(firstDifference(mine, theirs), `${name} ${where}`).toBeNull();
  }
}
