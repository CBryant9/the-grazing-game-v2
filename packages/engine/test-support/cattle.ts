/// <reference types="node" />
/**
 * Cattle test support: the MVP's cattle functions, the same herd given to
 * the MVP and to the engine, and a day-by-day run that compares everything.
 *
 * Test use only. Nothing in `src` may import this file.
 */

import { expect } from 'vitest';
import { aeOf, classOf } from '../src/cattle/animal';
import { weanMob, weaningDue } from '../src/cattle/breeding';
import type { PlantingGraze } from '../src/cattle/graze';
import type { CattleNote, GainReason } from '../src/cattle/notes';
import { settleDeaths, simMob, type Death, type MobDayResult } from '../src/cattle/simMob';
import {
  animalLookup,
  createCattleMob,
  emptyCattleTotals,
  type Animal,
  type AnimalIds,
  type AnimalKind,
  type CattleMob,
  type CattleRngs,
  type CattleTotals,
  type GrazingArea,
  type GrazingLand,
  type Sex,
} from '../src/cattle/types';
import { CLASS_LABELS, HEALTH_COST_PER_HEAD_YEAR } from '../src/data/cattle';
import { DISTRICTS } from '../src/data/districts';
import type { Supplement } from '../src/data/feed';
import { GRID_H, GRID_N, GRID_W } from '../src/grid';
import { growGrass } from '../src/pasture/grow';
import type { Plantings } from '../src/pasture/plantings';
import type { Rng } from '../src/rng';
import {
  expectSamePasture,
  firstDifference,
  growInputs,
  putFarm,
  refreshPlantings,
  type Scenario,
} from './farms';
import { loadMvp, seededRandom, type Mvp, type MvpField, type MvpState } from './mvp';

// ---------------------------------------------------------------------------
// The MVP's cattle, as its own code shapes them
// ---------------------------------------------------------------------------

export interface MvpBeast {
  id: number;
  kind: AnimalKind;
  sex: Sex;
  wt: number;
  age: number;
  cond: number;
  barren: boolean;
  paid: number;
  cost: number;
  preg: number;
  lact: number;
  parity: number;
  dam: number;
  calf: number;
  milk: number;
  adg: number;
  young?: boolean;
  dead?: boolean;
  di?: number;
  /** Where the MVP draws it. Not part of the model. */
  x: number;
  y: number;
}

export interface MvpDiet {
  dmd: number;
  cp: number;
  mass: number;
  avail: number;
  dist: number;
}

export interface MvpIntake {
  past: number;
  sKg: number;
  sME: number;
  sCP: number;
  cost: number;
}

export interface MvpSt {
  n: number;
  wt: number;
  cs: number;
  adg: number;
  me: number;
  cp: number;
  intake: number;
  pct: number;
  f: number;
  mass: number;
  demand: number;
  dist: number;
}

export interface MvpPlan {
  legs: {
    stops: number[];
    mode: 'days';
    every: number;
    kg: number;
    maxDays: number;
    rounds: number;
  }[];
  leg: number;
  idx: number;
  rep: { eaten: number; headDays: number; gain: number };
}

export interface MvpHerdMob {
  id: number;
  name: string;
  animals: MvpBeast[];
  loc: 'pad' | 'lot';
  anchor: number;
  supp: string;
  plan: MvpPlan | null;
  dry: number;
  st: MvpSt | null;
  wReg: number;
  w?: Float32Array;
  lossDays?: number;
  join?: { start: number; conc: number; last: number; elig: number } | null;
  lastShort?: number;
  lastThin?: number;
  markNote?: number;
  youngNote?: number;
  calvNote?: number;
  openNote?: number;
}

export interface MvpReg {
  id: number;
  cells: number[];
  troughs: number[];
  name: string;
  ha: number;
}

export interface MvpYear {
  grown: number;
  eaten: number;
  gain: number;
  births: number;
  deaths: number;
  feed: number;
  running: number;
}

export interface MvpHerdState extends Omit<MvpState, 'mobs' | 'yr'> {
  mobs: MvpHerdMob[];
  yr: MvpYear;
  farmHa: number;
  side: number;
  cash: number;
  nid: number;
  mobSeq: number;
  log: { unshift(entry: { msg: string }): void; length: number };
  hE: Uint8Array;
  vE: Uint8Array;
  troughs: number[];
  hubs: number[];
  ports: { cell: number; lvl: number; lastUse?: number; warned?: boolean }[];
  Y: Float32Array;
}

/** The MVP's cattle variables and functions, reached through the in-memory hook. */
export interface MvpCattle extends Omit<Mvp, 'S' | 'REGS'> {
  S: MvpHerdState;
  REGS: MvpReg[];
  PADS: { name: string; cells: number[]; ha: number }[];
  POF: Int16Array;
  readonly DIST: Float32Array;
  readonly FEED: Record<string, number>;
  readonly BUYS: Record<string, Record<string, unknown>>;
  readonly GROUPS: Record<string, string>;
  readonly GNAME: Record<string, [string, string]>;
  readonly MCLS: Record<string, [string, number]>;
  recompute(split?: boolean): void;
  health(): number;
  makeAnimal(kind: string, sex: string, wt: number, age: number, cond: number): MvpBeast;
  makeBatch(key: string, qty: number): MvpBeast[];
  label(a: MvpBeast): string;
  groupKey(a: MvpBeast): string;
  mclass(a: MvpBeast): string;
  condConc(c: number): number;
  dietOf(m: object, reg: MvpReg): MvpDiet;
  intakeOf(a: MvpBeast, diet: MvpDiet, supp: string, lot: boolean): MvpIntake;
  simMob(m: MvpHerdMob, byId: Map<number, MvpBeast>, dead: [MvpHerdMob, MvpBeast, string][]): void;
  grazeAlloc(m: object, reg: MvpReg, demand: number): number;
  cycling(a: MvpBeast): boolean;
  anoDays(a: MvpBeast): number;
  expectedRate(cs: number, lact: boolean): number;
  breedingNotes(
    m: MvpHerdMob,
    adultBulls: number,
    youngBulls: number,
    bullF: number,
    lot: boolean,
  ): void;
  joinReport(m: MvpHerdMob, fem0: MvpBeast[], preg: number): void;
  markCalves(m: MvpHerdMob): void;
  calve(a: MvpBeast, m: MvpHerdMob): void;
  weanOne(c: MvpBeast, byId: Map<number, MvpBeast>): void;
  weanMob(m: MvpHerdMob, dest: number | 'lot' | undefined, fromSim: boolean): void;
  gainOn(a: MvpBeast, diet: MvpDiet, supp: string): number;
  gainWhy(a: MvpBeast, diet: MvpDiet, supp: string): string;
  predictGains(
    m: { animals: MvpBeast[]; supp: string },
    reg: MvpReg,
  ): { label: string; n: number; gain: number; why: string }[];
  planSubs(m: MvpHerdMob): MvpReg[];
  waterUse(): void;
  cropGrazed(f: MvpField, i: number, r: number, rg: number, g: number): void;
}

export interface LoadedCattleMvp {
  mvp: MvpCattle;
  setRandom(next: () => number): void;
}

/** Load a fresh copy of the MVP with its cattle functions. */
export function loadCattleMvp(): LoadedCattleMvp {
  const loaded = loadMvp();
  return { mvp: loaded.mvp as unknown as MvpCattle, setRandom: loaded.setRandom };
}

// ---------------------------------------------------------------------------
// Random numbers: the same values to the MVP and to the engine
// ---------------------------------------------------------------------------

/**
 * An engine Rng that takes its numbers from a function. `range` and `int`
 * use the same arithmetic as the engine's real streams (rng.test covers
 * that), which is also the MVP's `rand` and `ri`.
 */
export function rngFrom(next: () => number): Rng {
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    gauss: () => {
      throw new Error('gauss is not used by the cattle model');
    },
    state: () => [0, 0, 0, 0],
  };
}

/** One Rng for both cattle streams, so the draws come in the MVP's order. */
export const bothStreams = (rng: Rng): CattleRngs => ({ breeding: rng, deaths: rng });

/**
 * True when the MVP is asking for a random number only to place a beast on
 * the map: the spot drawn in makeAnimal, and anything under pickTarget,
 * spotIn or herdInto. The engine never makes these draws.
 *
 * It reads the call stack, which runs from here up through the MVP's
 * Math.random to whichever MVP function asked. The stack is taken as a list
 * of frames, not as text, because it is read on every draw.
 */
export function isSpriteDraw(): boolean {
  return whoIsDrawing() === 'map';
}

/**
 * Who in the MVP is asking for a random number: 'map' for a draw that only
 * places a beast on the map, 'making' for a model draw inside makeAnimal
 * (barren, calves so far), 'model' for any other.
 */
function whoIsDrawing(): 'map' | 'making' | 'model' {
  const prepare = Error.prepareStackTrace;
  const limit = Error.stackTraceLimit;
  Error.prepareStackTrace = (_error, frames) => frames;
  Error.stackTraceLimit = 10;
  const frames = new Error().stack as unknown as NodeJS.CallSite[];
  Error.prepareStackTrace = prepare;
  Error.stackTraceLimit = limit;
  const names = frames.map((f) => f.getFunctionName() ?? '');
  if (names.some((n) => n === 'pickTarget' || n === 'spotIn' || n === 'herdInto')) return 'map';
  const at = names.indexOf('Math.random');
  if (at < 0) throw new Error(`whoIsDrawing: no Math.random on the stack: ${names.join(' < ')}`);
  // makeAnimal draws "barren" with Math.random itself and "parity" through
  // ri. Its only direct call to rand is the spot on the map.
  if (names[at + 1] === 'rand' && names[at + 2] === 'makeAnimal') return 'map';
  return names.includes('makeAnimal') ? 'making' : 'model';
}

export interface PairedRandom {
  /** For the MVP's Math.random. */
  forMvp: () => number;
  /** For the engine. */
  rng: Rng;
  /** Numbers each side has drawn for the model, and map draws the MVP made. */
  counts(): { mvp: number; engine: number; sprite: number };
  /**
   * Speed up a long run. Reading the call stack on every draw is slow, and
   * map draws only ever follow a new tag number (makeAnimal) or a new mob
   * (herdInto). After this call the stack is read only from when the
   * returned function is called until the MVP is back to plain model draws.
   * The caller must call it whenever the MVP takes a tag or mob number.
   */
  watchOnlyWhenTold(): () => void;
}

/**
 * Two copies of one seeded sequence, one for the MVP and one for the
 * engine. The MVP's map draws get a fixed value and do not use up the
 * sequence. If both sides make the same model draws in the same order, they
 * see the same numbers and finish level.
 */
export function pairedRandom(seed: number): PairedRandom {
  return pairedFrom(() => seededRandom(seed));
}

/**
 * A fixed list of numbers for both sides, in order. Asking for more than
 * the list holds is an error, so a test knows exactly how many were drawn.
 */
export function scriptedRandom(values: readonly number[]): PairedRandom {
  return pairedFrom(() => {
    let i = 0;
    return () => {
      if (i >= values.length) throw new Error(`scriptedRandom: only ${values.length} numbers`);
      return values[i++]!;
    };
  });
}

function pairedFrom(source: () => () => number): PairedRandom {
  const a = source();
  const b = source();
  let mvp = 0;
  let engine = 0;
  let sprite = 0;
  // 'always': read the stack on every draw. 'told': read it until the MVP
  // is back to plain model draws. 'idle': every draw is a model draw.
  let watch: 'always' | 'told' | 'idle' = 'always';
  return {
    forMvp: () => {
      if (watch !== 'idle') {
        const who = whoIsDrawing();
        if (who === 'map') {
          sprite++;
          return 0.5;
        }
        if (watch === 'told' && who === 'model') watch = 'idle';
      }
      mvp++;
      return a();
    },
    rng: rngFrom(() => {
      engine++;
      return b();
    }),
    counts: () => ({ mvp, engine, sprite }),
    watchOnlyWhenTold: () => {
      watch = 'idle';
      return () => {
        watch = 'told';
      };
    },
  };
}

/** The same fixed number for every draw on both sides. */
export function constantRandom(value: number): PairedRandom {
  let mvp = 0;
  let engine = 0;
  return {
    forMvp: () => {
      mvp++;
      return value;
    },
    rng: rngFrom(() => {
      engine++;
      return value;
    }),
    // With a fixed value the order cannot matter, so map draws are not told apart.
    counts: () => ({ mvp: engine, engine, sprite: mvp - engine }),
    watchOnlyWhenTold: () => () => {},
  };
}

// ---------------------------------------------------------------------------
// Animals
// ---------------------------------------------------------------------------

export interface BeastSpec {
  kind: AnimalKind;
  sex: Sex;
  wt: number;
  age: number;
  cond: number;
  barren?: boolean;
  preg?: number;
  lact?: number;
  parity?: number;
  dam?: number;
  calf?: number;
  young?: boolean;
  adg?: number;
  paid?: number;
  cost?: number;
  milk?: number;
}

/** An animal as the MVP's makeAnimal shapes it, with no random draws. */
export function beast(id: number, s: BeastSpec): MvpBeast {
  const a: MvpBeast = {
    id,
    kind: s.kind,
    sex: s.sex,
    wt: s.wt,
    age: s.age,
    cond: s.cond,
    barren: s.barren ?? false,
    paid: s.paid ?? 0,
    cost: s.cost ?? 0,
    preg: s.preg ?? -1,
    lact: s.lact ?? -1,
    parity: s.parity ?? (s.kind === 'cow' ? 2 : 0),
    dam: s.dam ?? 0,
    calf: s.calf ?? 0,
    milk: s.milk ?? 0,
    adg: s.adg ?? 0,
    x: 0,
    y: 0,
  };
  if (s.young) a.young = true;
  return a;
}

/** The engine's copy of an MVP animal. */
export function toEngine(a: MvpBeast): Animal {
  return {
    id: a.id,
    kind: a.kind,
    sex: a.sex,
    wt: a.wt,
    age: a.age,
    cond: a.cond,
    barren: a.barren,
    paid: a.paid,
    cost: a.cost,
    preg: a.preg,
    lact: a.lact,
    parity: a.parity,
    dam: a.dam,
    calf: a.calf,
    milk: a.milk,
    adg: a.adg,
    young: !!a.young,
    dead: !!a.dead,
    di: a.di,
  };
}

const NUMBER_FIELDS = [
  'id',
  'wt',
  'age',
  'cond',
  'paid',
  'cost',
  'preg',
  'lact',
  'parity',
  'dam',
  'calf',
  'milk',
  'adg',
  'di',
] as const;

/** Where an engine animal differs from the MVP's, or null. Numbers must be the same exactly. */
export function animalDifference(e: Animal, m: MvpBeast): string | null {
  for (const f of NUMBER_FIELDS) {
    if (!Object.is(e[f], m[f])) return `#${m.id} ${f}: engine ${e[f]}, MVP ${m[f]}`;
  }
  if (e.kind !== m.kind) return `#${m.id} kind: engine ${e.kind}, MVP ${m.kind}`;
  if (e.sex !== m.sex) return `#${m.id} sex: engine ${e.sex}, MVP ${m.sex}`;
  if (e.barren !== !!m.barren) return `#${m.id} barren: engine ${e.barren}, MVP ${m.barren}`;
  if (e.young !== !!m.young) return `#${m.id} young: engine ${e.young}, MVP ${m.young}`;
  if (e.dead !== !!m.dead) return `#${m.id} dead: engine ${e.dead}, MVP ${m.dead}`;
  return null;
}

export function expectSameAnimal(e: Animal, m: MvpBeast, where = ''): void {
  expect(animalDifference(e, m), where).toBeNull();
}

/** A spread of animals: every class, light to heavy, CS 1 to 5, dry, pregnant and milking. */
export function sampleBeasts(): BeastSpec[] {
  const out: BeastSpec[] = [];
  const conds = [1, 1.3, 1.5, 1.7, 2, 2.5, 3, 3.5, 3.6, 4, 4.5, 5];
  for (const cond of conds) {
    for (const wt of [150, 250, 279, 280, 299, 300, 380, 449, 450, 600]) {
      out.push({ kind: 'steer', sex: 'S', wt, age: 200 + wt, cond });
    }
    for (const wt of [180, 269, 270, 279, 280, 350, 460]) {
      for (const age of [250, 399, 400, 600, 899, 900]) {
        out.push({ kind: 'heifer', sex: 'F', wt, age, cond });
      }
      out.push({ kind: 'heifer', sex: 'F', wt, age: 700, cond, preg: 60 });
      out.push({ kind: 'heifer', sex: 'F', wt, age: 800, cond, preg: 250 });
    }
    for (const wt of [380, 449, 450, 520]) {
      out.push({ kind: 'cow', sex: 'F', wt, age: 1800, cond });
      out.push({ kind: 'cow', sex: 'F', wt, age: 1800, cond, barren: true });
      for (const preg of [0, 100, 190, 191, 240, 282]) {
        out.push({ kind: 'cow', sex: 'F', wt, age: 2000, cond, preg });
      }
      for (const lact of [0, 20, 45, 59, 60, 85, 86, 150, 279, 280, 300]) {
        out.push({ kind: 'cow', sex: 'F', wt, age: 2200, cond, lact, calf: 9000 });
      }
      // In calf again with a calf still on her.
      out.push({ kind: 'cow', sex: 'F', wt, age: 2200, cond, lact: 200, calf: 9000, preg: 120 });
      out.push({ kind: 'cow', sex: 'F', wt, age: 2200, cond, lact: 270, calf: 9000, preg: 200 });
      // Milking marker left on with no calf: counts as dry.
      out.push({ kind: 'cow', sex: 'F', wt, age: 2200, cond, lact: 30, calf: 0 });
    }
    for (const wt of [500, 750, 900]) {
      out.push({ kind: 'bull', sex: 'M', wt, age: 1200, cond });
    }
    for (const age of [280, 299, 300, 500]) {
      out.push({ kind: 'bull', sex: 'M', wt: 240 + age / 4, age, cond, young: true });
    }
    for (const age of [0, 10, 30, 31, 60, 89, 90, 100, 150, 151, 280, 310]) {
      for (const sex of ['F', 'M', 'S'] as const) {
        out.push({ kind: 'calf', sex, wt: 36 + age * 0.8, age, cond, dam: 9001 });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The farm: paddocks, water and distance to water, made by the MVP itself
// ---------------------------------------------------------------------------

/**
 * Fences on the test farm. They make five grazing areas, from 4 squares to
 * half the farm. A square in each is given below.
 */
export const AREAS = {
  /** 4 squares: columns 0 to 3 of the top row. */
  tiny: 0,
  /** 16 squares: columns 0 to 3, rows 1 to 4. */
  small: GRID_W,
  /** 84 squares: columns 0 to 3, rows 5 to 25. */
  strip: 5 * GRID_W,
  /** 416 squares: columns 4 to 19. */
  mid: 4,
  /** 520 squares: columns 20 to 39. */
  big: 20,
} as const;
export type AreaName = keyof typeof AREAS;

/** Squares with a trough: the usual set gives every area water. */
export const TROUGHS: Record<AreaName, number> = {
  tiny: 1,
  small: GRID_W + 2,
  strip: 12 * GRID_W + 1,
  mid: 10 * GRID_W + 9,
  // Top right corner, so the far side of the area is a long walk.
  big: GRID_W - 1,
};

/** The squares of a test area, worked out from the fences above. */
export function areaCells(name: AreaName): number[] {
  const out: number[] = [];
  for (let i = 0; i < GRID_N; i++) {
    const x = i % GRID_W;
    const y = Math.floor(i / GRID_W);
    const here: AreaName =
      x >= 20 ? 'big' : x >= 4 ? 'mid' : y === 0 ? 'tiny' : y <= 4 ? 'small' : 'strip';
    if (here === name) out.push(i);
  }
  return out;
}

/** Pasture states to paint a whole area with: green, dry, rank, short, bare. */
export const PASTURE_STATES = {
  green: { name: 'green and leafy', G: 2200, D: 300, A: 20, X: 0.05 },
  dry: { name: 'dry', G: 150, D: 2600, A: 140, X: 0.35 },
  rank: { name: 'rank', G: 1800, D: 3400, A: 120, X: 0.85 },
  short: { name: 'short', G: 420, D: 330, A: 15, X: 0.05 },
  bare: { name: 'bare', G: 60, D: 240, A: 30, X: 0 },
} as const;
export type PastureStateName = keyof typeof PASTURE_STATES;

/**
 * Paint a test area with one pasture state, each square up to 10% either
 * side so they are not all the same. Do it before the farm is given to the
 * MVP. For farms of native pasture: land use and plantings are left alone.
 */
export function paintArea(scn: Scenario, area: AreaName, state: PastureStateName): void {
  const s = PASTURE_STATES[state];
  const jitter = seededRandom(area.length * 31 + state.length);
  const j = (): number => 0.9 + 0.2 * jitter();
  for (const i of areaCells(area)) {
    scn.state.G[i] = s.G * j();
    scn.state.D[i] = s.D * j();
    scn.state.A[i] = s.A * j();
    scn.state.X[i] = Math.min(1, s.X * j());
  }
}

const emptyYear = (): MvpYear => ({
  grown: 0,
  eaten: 0,
  gain: 0,
  births: 0,
  deaths: 0,
  feed: 0,
  running: 0,
});

/**
 * Give the MVP the scenario's farm with the test fences and the given
 * troughs, and have the MVP's own recompute work out the grazing areas and
 * the distance to water. Returns the lines the MVP writes to its diary.
 */
export function putCattleFarm(
  mvp: MvpCattle,
  scn: Scenario,
  troughs: readonly number[] = Object.values(TROUGHS),
): string[] {
  putFarm(mvp as unknown as Mvp, scn);
  const lines: string[] = [];
  const hE = new Uint8Array((GRID_H + 1) * GRID_W);
  const vE = new Uint8Array(GRID_H * (GRID_W + 1));
  // The boundary.
  for (let x = 0; x < GRID_W; x++) {
    hE[x] = 9;
    hE[GRID_H * GRID_W + x] = 9;
  }
  for (let y = 0; y < GRID_H; y++) {
    vE[y * (GRID_W + 1)] = 9;
    vE[y * (GRID_W + 1) + GRID_W] = 9;
  }
  // Permanent fences down the farm at columns 4 and 20, and across the
  // left-hand strip under rows 0 and 4.
  for (let y = 0; y < GRID_H; y++) {
    vE[y * (GRID_W + 1) + 4] = 1;
    vE[y * (GRID_W + 1) + 20] = 1;
  }
  for (let x = 0; x < 4; x++) {
    hE[1 * GRID_W + x] = 1;
    hE[5 * GRID_W + x] = 1;
  }
  Object.assign(mvp.S, {
    farmHa: scn.farmHa,
    side: Math.sqrt(mvp.HA * 1e4),
    cash: 0,
    nid: 1,
    mobSeq: 1,
    log: {
      length: 0,
      unshift(entry: { msg: string }) {
        lines.push(entry.msg);
      },
    },
    hE,
    vE,
    troughs: [...troughs],
    hubs: [],
    ports: [],
    Y: new Float32Array(GRID_N).fill(1),
    mobs: [],
    yr: emptyYear(),
  });
  mvp.recompute();
  return lines;
}

/** The MVP grazing area that holds a square. */
export const regAt = (mvp: MvpCattle, cell: number): MvpReg => mvp.REGS[mvp.ROF[cell]!]!;

/** The engine's view of an MVP grazing area. */
export const areaOf = (reg: MvpReg): GrazingArea => ({
  cells: reg.cells,
  ha: reg.ha,
  hasWater: reg.troughs.length > 0,
});

/** The engine's view of the farm's country, with the MVP's own distance to water. */
export function landOf(mvp: MvpCattle, scn: Scenario, plantings: Plantings | null): GrazingLand {
  const haPerSquare = scn.farmHa / GRID_N;
  return {
    pasture: scn.state,
    district: DISTRICTS[scn.district],
    plantings,
    haPerSquare,
    sideM: Math.sqrt(haPerSquare * 1e4),
    distToWater: mvp.DIST,
  };
}

/** Assert the engine's pasture equals the MVP's, including the day each square was last grazed. */
export function expectSameGround(scn: Scenario, mvp: MvpCattle, where = ''): void {
  expectSamePasture(scn.state, mvp as unknown as Mvp, where);
  expect(firstDifference(scn.state.lastG, mvp.S.lastG), `lastG ${where}`).toBeNull();
}

// ---------------------------------------------------------------------------
// The MVP's diary wording, to compare the engine's notes against
// ---------------------------------------------------------------------------

const num0 = (v: number): string =>
  (+v).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** One reason, in the MVP's words. */
function reasonText(r: GainReason): string {
  switch (r.reason) {
    case 'notEnoughFeed':
      return `not much feed where they graze (~${num0(r.mass)} kg DM/ha), so they can't eat their fill`;
    case 'lowMe':
      return `the feed is low quality (ME ${r.me.toFixed(1)}): it's mostly dry or stemmy`;
    case 'lowProtein':
      return `protein is under 7%, so they eat less (a lick helps)`;
    case 'milking':
      return `she's milking for a calf: about ${Math.round(r.milkMJ)} MJ a day on top of her own needs (${Math.round(r.ownMJ)} MJ)`;
    case 'latePregnancy':
      return "she's late in pregnancy";
    case 'justShort':
      return `they're eating ${r.intake.toFixed(1)} kg DM a day of ME ${r.me.toFixed(1)} feed, just short of what they need`;
  }
}

/** The engine's reasons as the MVP's gainWhy sentence. */
export const whyText = (why: readonly GainReason[]): string => why.map(reasonText).join('; ');

/** An engine note as the line the MVP would have written to its diary. */
export function noteText(note: CattleNote, mob: string, area: string): string {
  switch (note.type) {
    case 'noWater':
      return note.days === 1
        ? `${mob} has no water in ${area}! Without water they all die in 4 days. Move them or put in a trough.`
        : `${mob} will all die tomorrow without water! Move them to a paddock with a trough now.`;
    case 'shortOfFeed':
      return `${mob} is short of feed in ${area}: they're only getting ${Math.round(note.f * 100)}% of what they want.`;
    case 'losingWeight':
      return `${mob} have been losing weight for 10 days (diet ME ${note.me.toFixed(1)}, CP ${note.cp.toFixed(0)}%). ${note.classes
        .map((g) => `${CLASS_LABELS[g.cls]} ${g.gain.toFixed(2)} kg/d`)
        .join(', ')}. Try greener feed, a lick or the feedlot.`;
    case 'slipped':
      return `A ${note.kind} in ${mob} slipped her calf (poor condition).`;
    case 'calfLostAtBirth':
      return `A ${note.first ? 'heifer' : 'cow'} in ${mob} lost her calf at birth.`;
    case 'calvingStarted':
      return `Calving has started in ${mob}. Bull calves will need marking at 2–4 months.`;
    case 'toMark':
      return `${note.count} bull calves in ${mob} are old enough to mark (castrate, ear tag, vaccinate). Mark them before about 8 months or they'll start getting cows in calf.`;
    case 'youngBullsFertile':
      return `Unmarked young bulls in ${mob} are now fertile. Cows and heifers will get back in calf whether you planned it or not. Mark them or move them away.`;
    case 'joiningStarted': {
      const bt = note.adultBulls
        ? `${note.adultBulls} bull${note.adultBulls > 1 ? 's' : ''}`
        : 'unmarked young bulls';
      return `Joining has started in ${mob}: ${bt} with ${note.ready} cows/heifers ready to get in calf (about 1 bull per ${note.femalesPerBull}).`;
    }
    case 'joiningProgress':
      return `${mob}: ${note.weeks} weeks of joining, ${note.conceived} got in calf in the last 3 weeks (${note.inCalf} of ${note.females} now in calf).`;
    case 'pregTest': {
      let msg = `Preg test for ${mob}: ${note.inCalf} of ${note.females} in calf (${Math.round(note.rate * 100)}%), ${note.dry} dry. At their average condition (CS ${note.cs.toFixed(1)}) you'd expect about ${Math.round(note.expected * 100)}%.`;
      if (note.rate < note.expected - 0.12) msg += ' Fewer got in calf than you would expect.';
      if (note.cs < 2.5) {
        msg += ' Condition is holding them back: CS 2.5–3 at joining lifts conception a lot.';
      }
      if (note.dry > 0) msg += ' Dry cows can be culled, or left with the bull for another round.';
      if (note.tooSoon > 0) {
        msg += ` ${note.tooSoon} recently calved ${note.tooSoon > 1 ? 'are' : 'is'} too soon to tell.`;
      }
      return msg;
    }
    case 'noBull':
      return `${note.ready} cows/heifers in ${mob} are ready to get back in calf, but there's no bull with them. Buy a bull at the saleyard or bring one in (about 1 per 40).`;
    case 'lowCondition':
      return `${mob} are getting poor (avg condition ${note.cs.toFixed(1)}). Feed, supplement or sell before you lose them.`;
  }
}

/** The crop model's diary lines. They are not the cattle model's to match. */
const isCropLine = (line: string): boolean => /^Stock are (grazing|eating) the /.test(line);

const CAUSES: Record<string, Death['cause']> = {
  orphaned: 'orphaned',
  'no water': 'noWater',
  'poor condition': 'poorCondition',
  'natural causes': 'natural',
};

// ---------------------------------------------------------------------------
// A herd run in the MVP and in the engine, day by day
// ---------------------------------------------------------------------------

export interface MobPair {
  m: MvpHerdMob;
  e: CattleMob;
  /** The engine side of the plan report. */
  rep: { eaten: number; headDays: number; gain: number };
}

export interface HerdDay {
  /** The engine's result for each mob that had a day, in order. */
  results: MobDayResult[];
  deaths: Death[];
  /** The diary lines, as the MVP wrote them. */
  lines: string[];
  /** Cows the MVP left milking after their calf died or was weaned from another mob. */
  driedOff: number;
}

export interface HerdRunOptions {
  random: PairedRandom;
  /** Sown pastures and crops are on the farm. */
  landUses?: boolean;
}

/**
 * The same herd on the same farm in the MVP and in the engine. Each call to
 * `day` runs one day of cattle in both and checks that everything is equal:
 * every animal, every mob figure, the pasture, the totals, the deaths, the
 * notes and the number of random draws.
 */
export class HerdRun {
  readonly mvp: MvpCattle;
  readonly scn: Scenario;
  readonly lines: string[];
  readonly pairs: MobPair[] = [];
  readonly totals: CattleTotals = emptyCattleTotals();
  readonly ids: AnimalIds = { next: 1 };
  rng!: CattleRngs;
  random!: PairedRandom;
  cash = 0;
  /** Total cows dried off where the MVP left them milking. */
  driedOff = 0;
  private plantings: Plantings | null = null;
  private readonly landUses: boolean;
  private readonly loaded: LoadedCattleMvp;
  private told: () => void = () => {};

  constructor(
    loaded: LoadedCattleMvp,
    scn: Scenario,
    opts: HerdRunOptions,
    troughs?: readonly number[],
  ) {
    this.loaded = loaded;
    this.mvp = loaded.mvp;
    this.scn = scn;
    this.landUses = !!opts.landUses;
    this.lines = putCattleFarm(this.mvp, scn, troughs);
    // Tell the random source whenever the MVP takes a tag number or a mob
    // number: those are the only times a map draw can follow.
    const S = this.mvp.S;
    for (const key of ['nid', 'mobSeq'] as const) {
      let value = S[key];
      Object.defineProperty(S, key, {
        get: () => value,
        set: (v: number) => {
          value = v;
          this.told();
        },
        enumerable: true,
        configurable: true,
      });
    }
    this.useRandom(opts.random);
    this.plantings = refreshPlantings(this.mvp as unknown as Mvp, scn);
  }

  /** Give both sides a new source of random numbers from here on. */
  useRandom(random: PairedRandom): void {
    this.random = random;
    this.told = random.watchOnlyWhenTold();
    this.loaded.setRandom(random.forMvp);
    this.rng = bothStreams(random.rng);
  }

  get land(): GrazingLand {
    return landOf(this.mvp, this.scn, this.plantings);
  }

  /** Put a mob on the farm, in a paddock (by one of its squares) or in the lot. */
  addMob(
    name: string,
    where: number | 'lot',
    specs: readonly BeastSpec[],
    supp: Supplement = 'none',
  ): MobPair {
    const S = this.mvp.S;
    return this.addBeasts(
      name,
      where,
      specs.map((s) => beast(S.nid++, s)),
      supp,
    );
  }

  /**
   * Put a mob of engine-made animals on the farm (say from makeSaleBatch
   * with this run's `ids`). The MVP gets its own copy of each.
   */
  addHerd(
    name: string,
    where: number | 'lot',
    animals: readonly Animal[],
    supp: Supplement = 'none',
  ): MobPair {
    return this.addBeasts(
      name,
      where,
      animals.map((a) => beast(a.id, a)),
      supp,
    );
  }

  private addBeasts(
    name: string,
    where: number | 'lot',
    animals: MvpBeast[],
    supp: Supplement,
  ): MobPair {
    const S = this.mvp.S;
    S.nid = Math.max(S.nid, this.ids.next, ...animals.map((a) => a.id + 1));
    this.ids.next = S.nid;
    const m: MvpHerdMob = {
      id: S.mobSeq++,
      name,
      animals,
      loc: where === 'lot' ? 'lot' : 'pad',
      anchor: where === 'lot' ? 0 : where,
      supp,
      plan: null,
      dry: 0,
      st: null,
      wReg: -1,
    };
    S.mobs.push(m);
    const e = createCattleMob(supp);
    e.animals = animals.map(toEngine);
    const pair = { m, e, rep: { eaten: 0, headDays: 0, gain: 0 } };
    this.pairs.push(pair);
    return pair;
  }

  /** Give a mob a plan that moves it `perDay` times a day around the given squares. */
  setShifts(pair: MobPair, stops: readonly number[], perDay: number): void {
    pair.m.plan = {
      legs: [
        { stops: [...stops], mode: 'days', every: 1 / perDay, kg: 1500, maxDays: 0, rounds: 0 },
      ],
      leg: 0,
      idx: 0,
      rep: { eaten: 0, headDays: 0, gain: 0 },
    };
    pair.rep = { eaten: 0, headDays: 0, gain: 0 };
  }

  /** Move a mob to a paddock (by one of its squares) or to the lot. */
  move(pair: MobPair, where: number | 'lot'): void {
    pair.m.loc = where === 'lot' ? 'lot' : 'pad';
    if (where !== 'lot') pair.m.anchor = where;
    pair.m.wReg = -1;
  }

  /** Grow the grass for the day in both, and check the pasture is still equal. */
  grow(): void {
    const { mvp, scn } = this;
    mvp.S.day = scn.day;
    mvp.S.rainF = scn.seasonF;
    mvp.S.monthF = scn.monthF;
    this.plantings = refreshPlantings(mvp as unknown as Mvp, scn);
    mvp.growGrass(true);
    growGrass(scn.state, growInputs(scn, this.plantings));
    expectSameGround(scn, mvp, `after growth, day ${scn.day}`);
  }

  /** Today's stops for a mob on a plan with several moves a day, as engine areas. */
  private shiftsFor(m: MvpHerdMob): GrazingArea[] | undefined {
    const L = m.plan?.legs[m.plan.leg];
    if (!m.plan || !L) return undefined;
    const k = L.every < 1 ? Math.round(1 / L.every) : 1;
    if (k <= 1) return undefined;
    const out: GrazingArea[] = [];
    for (let j = 0; j < k; j++) {
      out.push(areaOf(regAt(this.mvp, L.stops[(m.plan.idx + j) % L.stops.length]!)));
    }
    return out;
  }

  /** The MVP's name for the area a mob's notes refer to. */
  private areaName(m: MvpHerdMob): string {
    const subs = this.mvp.planSubs(m);
    return (subs.length > 1 ? subs[0]! : regAt(this.mvp, m.anchor)).name;
  }

  /** Run one day of cattle in both and compare everything. */
  day(): HerdDay {
    const { mvp, scn, pairs } = this;
    const S = mvp.S;
    const where = `${scn.district} day ${scn.day}`;
    S.day = scn.day;
    if (!this.landUses) this.plantings = null;
    else if (!this.plantings) this.plantings = refreshPlantings(mvp as unknown as Mvp, scn);
    const cdBefore = S.CD.slice();
    const yBefore = S.Y.slice();

    // ---- The MVP's day: simMob for every mob, then stepDay's deaths block.
    this.lines.length = 0;
    const byIdM = new Map<number, MvpBeast>();
    for (const m of S.mobs) for (const a of m.animals) byIdM.set(a.id, a);
    const deadM: [MvpHerdMob, MvpBeast, string][] = [];
    for (let i = 0; i < S.mobs.length; i++) mvp.simMob(S.mobs[i]!, byIdM, deadM);
    // Who is in which mob before the dead are taken out.
    const membersM = S.mobs.map((m) => m.animals.map((a) => a.id));
    const namesM = S.mobs.map((m) => m.name);
    if (deadM.length) {
      for (const [, a] of deadM) {
        S.yr.deaths++;
        if (a.calf) {
          const c = byIdM.get(a.calf);
          if (c) c.dam = 0;
        }
      }
      for (const m of S.mobs) m.animals = m.animals.filter((a) => !a.dead);
    }
    const linesM = this.lines.filter((l) => !isCropLine(l));

    // ---- The engine's day.
    const land = this.land;
    const byIdE = animalLookup(pairs.map((p) => p.e));
    const deaths: Death[] = [];
    const deathMobs: number[] = [];
    const results: MobDayResult[] = [];
    const linesE: string[] = [];
    const grazes: PlantingGraze[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i]!;
      const name = namesM[i]!;
      if (weaningDue(p.e, byIdE)) {
        const weaners = weanMob(p.e, byIdE);
        const avg = Math.round(weaners.reduce((s, c) => s + c.wt, 0) / weaners.length);
        // The farm decides where weaners go. Here it follows the MVP: if it
        // made a new mob for them, so do we.
        const t = S.mobs[pairs.length];
        const ids = weaners.map((c) => c.id);
        if (t && membersM[pairs.length]!.join() === ids.join()) {
          const gone = new Set(ids);
          p.e.animals = p.e.animals.filter((a) => !gone.has(a.id));
          const e = createCattleMob(t.supp as Supplement);
          e.animals = weaners;
          pairs.push({ m: t, e, rep: { eaten: 0, headDays: 0, gain: 0 } });
          const dest = t.loc === 'lot' ? 'the feedlot' : regAt(mvp, t.anchor).name;
          linesE.push(`Weaned ${ids.length} calves (avg ${avg} kg) into ${dest}.`);
        } else {
          linesE.push(
            `Weaned ${ids.length} calves (avg ${avg} kg) in ${name}. There's no other paddock with water, so they're running with the cows.`,
          );
        }
      }
      const lot = p.m.loc === 'lot';
      const res = simMob(p.e, {
        place: lot
          ? { kind: 'lot' }
          : { kind: 'paddock', area: areaOf(regAt(mvp, p.m.anchor)), shifts: this.shiftsFor(p.m) },
        land,
        day: scn.day,
        byId: byIdE,
        ids: this.ids,
        rng: this.rng,
        healthPerHeadYear: HEALTH_COST_PER_HEAD_YEAR[scn.district],
        totals: this.totals,
      });
      results.push(res);
      if (res.feedCost > 0) this.cash -= res.feedCost;
      if (!lot) {
        p.rep.eaten += res.planDay.eaten;
        p.rep.headDays += res.planDay.headDays;
        p.rep.gain += res.planDay.gain;
      }
      const area = lot ? '' : this.areaName(p.m);
      for (const note of res.notes) linesE.push(noteText(note, name, area));
      for (const d of res.deaths) {
        deaths.push(d);
        deathMobs.push(i);
      }
      grazes.push(...res.plantingGrazes);
    }
    settleDeaths(
      pairs.map((p) => p.e),
      deaths,
      byIdE,
      this.totals,
    );

    // ---- Compare.
    expect(linesE, `notes ${where}`).toEqual(linesM);
    expect(
      deaths.map((d, k) => `${deathMobs[k]}:${d.animal.id}:${d.cause}`),
      `deaths ${where}`,
    ).toEqual(deadM.map(([m, a, why]) => `${S.mobs.indexOf(m)}:${a.id}:${CAUSES[why]}`));
    expect(pairs.length, `mobs ${where}`).toBe(S.mobs.length);

    // Where the MVP left a cow milking for a calf that died or was weaned,
    // the engine has dried her off. Check that, then dry her off in the MVP
    // too so the run can carry on side by side.
    const nowM = new Map<number, MvpBeast>();
    for (const m of S.mobs) for (const a of m.animals) nowM.set(a.id, a);
    const nowE = animalLookup(pairs.map((p) => p.e));
    let driedOff = 0;
    for (const cow of nowM.values()) {
      if (!cow.calf) continue;
      const calf = nowM.get(cow.calf);
      if (calf && calf.kind === 'calf' && calf.dam === cow.id) continue;
      const mine = nowE.get(cow.id)!;
      expect([mine.calf, mine.lact], `#${cow.id} dried off in the engine, ${where}`).toEqual([
        0, -1,
      ]);
      expect(cow.lact, `#${cow.id} still milking in the MVP, ${where}`).toBeGreaterThanOrEqual(0);
      cow.calf = 0;
      cow.lact = -1;
      driedOff++;
    }
    this.driedOff += driedOff;

    const diffs: string[] = [];
    const same = (what: string, mine: unknown, theirs: unknown): void => {
      if (!Object.is(mine, theirs))
        diffs.push(`${what}: engine ${String(mine)}, MVP ${String(theirs)}`);
    };
    pairs.forEach((p, i) => {
      const who = `mob ${i} (${p.m.name})`;
      same(`${who} head`, p.e.animals.length, p.m.animals.length);
      for (let k = 0; k < Math.min(p.e.animals.length, p.m.animals.length); k++) {
        const d = animalDifference(p.e.animals[k]!, p.m.animals[k]!);
        if (d) diffs.push(`${who} ${d}`);
      }
      same(`${who} dry`, p.e.dry, p.m.dry);
      same(`${who} has st`, !!p.e.st, !!p.m.st);
      if (p.e.st && p.m.st) {
        for (const key of Object.keys(p.m.st) as (keyof MvpSt)[]) {
          same(`${who} st.${key}`, p.e.st[key], p.m.st[key]);
        }
      }
      same(`${who} lossDays`, p.e.lossDays, p.m.lossDays ?? 0);
      same(`${who} joining`, !!p.e.join, !!p.m.join);
      if (p.e.join && p.m.join) {
        for (const key of ['start', 'conc', 'last', 'elig'] as const) {
          same(`${who} join.${key}`, p.e.join[key], p.m.join[key]);
        }
      }
      same(`${who} lastShort`, p.e.lastShort, p.m.lastShort ?? 0);
      same(`${who} lastThin`, p.e.lastThin, p.m.lastThin ?? 0);
      same(`${who} markNote`, p.e.markNote, p.m.markNote ?? null);
      same(`${who} youngNote`, p.e.youngNote, p.m.youngNote ?? 0);
      same(`${who} calvNote`, p.e.calvNote, p.m.calvNote ?? null);
      same(`${who} openNote`, p.e.openNote, p.m.openNote ?? null);
      if (p.m.plan) {
        same(`${who} plan eaten`, p.rep.eaten, p.m.plan.rep.eaten);
        same(`${who} plan headDays`, p.rep.headDays, p.m.plan.rep.headDays);
        same(`${who} plan gain`, p.rep.gain, p.m.plan.rep.gain);
      }
    });
    same('year gain', this.totals.gain, S.yr.gain);
    same('year eaten', this.totals.eaten, S.yr.eaten);
    same('year births', this.totals.births, S.yr.births);
    same('year deaths', this.totals.deaths, S.yr.deaths);
    same('year feed', this.totals.feed, S.yr.feed);
    same('cash', this.cash, S.cash);
    same('next tag', this.ids.next, S.nid);
    const c = this.random.counts();
    same('random draws', c.engine, c.mvp);
    expect(diffs, where).toEqual([]);
    expectSameGround(scn, mvp, where);

    // Planted squares: replay the engine's list through the MVP's own
    // cropGrazed from the same start. It must leave the stand and the yield
    // exactly where the MVP's day left them.
    if (this.landUses) {
      const cdAfter = S.CD.slice();
      const yAfter = S.Y.slice();
      S.CD.set(cdBefore);
      S.Y.set(yBefore);
      for (const g of grazes) {
        mvp.cropGrazed(mvp.FMAP.get(g.id)!, g.square, g.eaten, g.greenEaten, g.greenBefore);
      }
      expect(firstDifference(S.CD, cdAfter), `stand density ${where}`).toBeNull();
      expect(firstDifference(S.Y, yAfter), `yield ${where}`).toBeNull();
      scn.density.set(S.CD);
      this.lines.length = 0;
    }

    // Empty mobs go, as at the end of the MVP's day.
    for (let i = pairs.length - 1; i >= 0; i--) {
      if (!pairs[i]!.m.animals.length) pairs.splice(i, 1);
    }
    S.mobs = S.mobs.filter((m) => m.animals.length);
    scn.day++;
    S.day = scn.day;
    return { results, deaths, lines: linesM, driedOff };
  }
}

/** Head and adult equivalents in an engine mob, for test messages. */
export const mobAe = (m: CattleMob): number => m.animals.reduce((s, a) => s + aeOf(a), 0);

/** How many of each class are in an engine mob. */
export function classCounts(m: CattleMob): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of m.animals) out[classOf(a)] = (out[classOf(a)] ?? 0) + 1;
  return out;
}
