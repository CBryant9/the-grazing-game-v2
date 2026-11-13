/**
 * The farm at the start: soil, the bore, fences, gates, water, arable land,
 * the starting rotation, the homestead and yards, and the pasture as the
 * last owner left it.
 *
 * Each piece draws from its own named random stream, so a change to one
 * never shifts another (BUILD_PLAN 2.3). The pieces follow the MVP's newGame,
 * startScratch and startLayout, drawing their random numbers in the same
 * order, so each can be checked against the MVP given the same numbers.
 * The homestead and yards are new in the rebuild (PRD 5.13).
 */

import type { DistrictId } from '@gg/shared';
import { dateAt, type FarmStart } from '../calendar';
import { genArable, startCropping } from '../crops/arable';
import { createCropState, type CropContext, type CropState, type Field } from '../crops/fields';
import { ARABLE_SHARES } from '../data/crops';
import { DISTRICTS, type District } from '../data/districts';
import { farmScale, type FarmScale } from '../data/farms';
import { GRID_H, GRID_N, GRID_W } from '../grid';
import { clamp, lerp } from '../num';
import { growGrass } from '../pasture/grow';
import { createPastureState, type PastureState } from '../pasture/state';
import { rngStream, type Rng } from '../rng';
import type { GrowthFactorSource } from '../season/factors';
import { RUN_UP_DAYS, randomSeasons } from '../season/randomSeasons';
import type { FarmLayout } from './layout';
import {
  EDGE,
  buildTopology,
  createFences,
  getEdge,
  hEdge,
  hIdx,
  setEdge,
  vEdge,
  vIdx,
  type EdgeRef,
  type Fences,
} from './topology';
import { NO_WATER_DISTANCE, createWater, waterPoints, type Water } from './water';

/** A smooth random surface over the grid, from a coarse lattice of values. */
function smooth(coarse: readonly number[], gx: number, gy: number, x: number, y: number): number {
  const fx = (x / (GRID_W - 1)) * gx;
  const fy = (y / (GRID_H - 1)) * gy;
  const ix = Math.min(gx - 1, Math.floor(fx));
  const iy = Math.min(gy - 1, Math.floor(fy));
  const tx = fx - ix;
  const ty = fy - iy;
  const c = (i: number, j: number): number => coarse[j * (gx + 1) + i]!;
  return lerp(lerp(c(ix, iy), c(ix + 1, iy), tx), lerp(c(ix, iy + 1), c(ix + 1, iy + 1), tx), ty);
}

/**
 * Soil fertility for every square: smooth country from 0.72 to 1.25 with a
 * little square-to-square variation, held between 0.6 and 1.35.
 */
export function genFertility(rng: Rng): Float32Array {
  const gx = 7;
  const gy = 5;
  const coarse: number[] = [];
  for (let i = 0; i < (gx + 1) * (gy + 1); i++) coarse.push(rng.range(0.72, 1.25));
  const F = new Float32Array(GRID_N);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const v = smooth(coarse, gx, gy, x, y);
      F[y * GRID_W + x] = clamp(v + rng.range(-0.06, 0.06), 0.6, 1.35);
    }
  }
  return F;
}

/** The bore's square: at random, at least 4 squares in from every boundary. */
export function genBore(rng: Rng): number {
  const row = rng.int(4, GRID_H - 5);
  return row * GRID_W + rng.int(4, GRID_W - 5);
}

/** What a farm comes with, so the caller can value it. Lengths are in segments (square sides). */
export interface StartImprovements {
  /** Permanent fence, in segments, not counting gates. */
  permanent: number;
  /** Electric fence, in segments, not counting gates. */
  electric: number;
  gates: number;
  /** Fixed troughs, the one on the bore included. */
  troughs: number;
  /** Squares of pipe, not counting the bore's square. */
  pipe: number;
}

export interface StartLayout {
  fences: Fences;
  water: Water;
  improvements: StartImprovements;
}

function improvements(fences: Fences, water: Water): StartImprovements {
  const tally = (code: number): number => {
    let n = 0;
    for (const v of fences.hE) if (v === code) n++;
    for (const v of fences.vE) if (v === code) n++;
    return n;
  };
  let pipe = 0;
  for (let i = 0; i < GRID_N; i++) if (water.pipe[i] && i !== water.bore) pipe++;
  return {
    permanent: tally(EDGE.permanent),
    electric: tally(EDGE.electric),
    gates: tally(EDGE.gateShut),
    troughs: water.troughs.length,
    pipe,
  };
}

/**
 * Starting from scratch: the boundary, a trough on the bore, and half the
 * time one old permanent fence line with a shut gate.
 */
export function layScratch(rng: Rng, bore: number): StartLayout {
  const fences = createFences();
  const water = createWater(bore);
  water.troughs.push(bore);
  if (rng.next() < 0.5) {
    const bx = bore % GRID_W;
    let v: number;
    do {
      v = rng.int(8, GRID_W - 8);
    } while (Math.abs(v - bx) < 3);
    for (let y = 0; y < GRID_H; y++) fences.vE[vIdx(y, v)] = EDGE.permanent;
    fences.vE[vIdx(rng.int(2, GRID_H - 3), v)] = EDGE.gateShut;
  }
  return { fences, water, improvements: improvements(fences, water) };
}

/** Lay pipe along a row from one column to another, then down that column to a row. */
function pipeElbow(water: Water, fromX: number, fromY: number, toX: number, toY: number): void {
  for (let x = Math.min(fromX, toX); x <= Math.max(fromX, toX); x++) {
    water.pipe[fromY * GRID_W + x] = 1;
  }
  for (let y = Math.min(fromY, toY); y <= Math.max(fromY, toY); y++) {
    water.pipe[y * GRID_W + toX] = 1;
  }
}

/**
 * Taking over a running farm: a trough on the bore, one or two fence lines
 * down the farm and sometimes one across (30% of lines are electric), each
 * with a shut gate. Every paddock gets at least one gate. Water is piped to
 * a trough in every paddock over 2% of the farm, then more are added until
 * no point is more than about 2 km from water, at about one water for each
 * 2,500 ha and at most 8 in a paddock.
 */
export function layRunning(rng: Rng, bore: number, scale: FarmScale): StartLayout {
  const fences = createFences();
  const water = createWater(bore);
  const bx = bore % GRID_W;
  const by = (bore / GRID_W) | 0;
  water.troughs.push(bore);
  const vx: number[] = [];
  const hy: number[] = [];
  const nV = rng.int(1, 2);
  const nH = rng.int(0, 1);
  // Lines keep clear of the bore and of each other.
  while (vx.length < nV) {
    const v = rng.int(7, GRID_W - 7);
    if (Math.abs(v - bx) > 2 && vx.every((o) => Math.abs(o - v) > 5)) vx.push(v);
  }
  while (hy.length < nH) {
    const v = rng.int(6, GRID_H - 6);
    if (Math.abs(v - by) > 2) hy.push(v);
  }
  for (const v of vx) {
    const t = rng.next() < 0.3 ? EDGE.electric : EDGE.permanent;
    for (let y = 0; y < GRID_H; y++) fences.vE[vIdx(y, v)] = t;
    fences.vE[vIdx(rng.int(2, GRID_H - 3), v)] = EDGE.gateShut;
  }
  for (const v of hy) {
    const t = rng.next() < 0.3 ? EDGE.electric : EDGE.permanent;
    for (let x = 0; x < GRID_W; x++) fences.hE[hIdx(v, x)] = t;
    fences.hE[hIdx(v, rng.int(2, GRID_W - 3))] = EDGE.gateShut;
  }

  // Every paddock gets at least one gate in one of its fence lines.
  let topo = buildTopology(fences, scale.haPerSquare);
  for (const pd of topo.paddocks) {
    const fenceEdges: EdgeRef[] = [];
    let hasGate = false;
    const of = topo.paddockOf;
    for (const i of pd.cells) {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const sides: EdgeRef[] = [];
      if (x < GRID_W - 1 && of[i + 1] !== pd.id) sides.push(vEdge(y, x + 1));
      if (x > 0 && of[i - 1] !== pd.id) sides.push(vEdge(y, x));
      if (y < GRID_H - 1 && of[i + GRID_W] !== pd.id) sides.push(hEdge(y + 1, x));
      if (y > 0 && of[i - GRID_W] !== pd.id) sides.push(hEdge(y, x));
      for (const e of sides) {
        const v = getEdge(fences, e);
        if (v === EDGE.gateShut) hasGate = true;
        else if (v === EDGE.permanent || v === EDGE.electric) fenceEdges.push(e);
      }
    }
    if (!hasGate && fenceEdges.length) setEdge(fences, rng.pick(fenceEdges), EDGE.gateShut);
  }

  // Water in every paddock: pipe from the bore to a trough at its middle.
  topo = buildTopology(fences, scale.haPerSquare);
  let points = waterPoints(topo, water);
  for (const pd of topo.paddocks) {
    if (points.paddockTroughs[pd.id]!.length || pd.ha < scale.farmHa * 0.02) continue;
    const t = pd.label;
    pipeElbow(water, bx, by, t % GRID_W, (t / GRID_W) | 0);
    water.troughs.push(t);
  }
  // Enough waters that stock can reach most of each paddock. Each pass adds
  // one trough to a paddock, at its square furthest from water.
  for (let pass = 0; pass < 8; pass++) {
    topo = buildTopology(fences, scale.haPerSquare);
    points = waterPoints(topo, water);
    let added = false;
    for (const pd of topo.paddocks) {
      const troughs = points.paddockTroughs[pd.id]!;
      const want = Math.min(8, Math.ceil(pd.ha / 2500));
      if (!troughs.length || troughs.length >= want) continue;
      let far = pd.cells[0]!;
      let fd = -1;
      for (const c of pd.cells) {
        const d = points.dist[c]!;
        if (d < NO_WATER_DISTANCE && d > fd) {
          fd = d;
          far = c;
        }
      }
      if (fd * scale.sideM < 2000) continue;
      added = true;
      const src = troughs[0]!;
      pipeElbow(water, src % GRID_W, (src / GRID_W) | 0, far % GRID_W, (far / GRID_W) | 0);
      water.troughs.push(far);
    }
    if (!added) break;
  }
  return { fences, water, improvements: improvements(fences, water) };
}

/**
 * The farm's buildings: the stock yards, as the square they stand on.
 * Bought cattle arrive there. There is no homestead (Claudia, 14 Nov
 * 2026).
 */
export interface FarmBuildings {
  yards: number;
}

/** Squares between the bore and the yards, at the least. */
export const BUILDING_CLEAR_OF_BORE = 3;

/**
 * Place the stock yards: within two squares of the boundary, at least
 * three squares clear of the bore and off any square with a trough.
 *
 * The yards were first placed two to five squares from a homestead on the
 * boundary. The homestead was taken out, but its square is still drawn
 * and used to place the yards, so the yards of every farm stand exactly
 * where they did. The draws come from their own stream after everything
 * else is laid out, so they never change the rest of the farm for a seed.
 */
export function placeBuildings(rng: Rng, water: Water): FarmBuildings {
  const bx = water.bore % GRID_W;
  const by = (water.bore / GRID_W) | 0;
  const depth = (i: number): number => {
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    return Math.min(x, y, GRID_W - 1 - x, GRID_H - 1 - y);
  };
  const apart = (a: number, b: number): number =>
    Math.max(
      Math.abs((a % GRID_W) - (b % GRID_W)),
      Math.abs(((a / GRID_W) | 0) - ((b / GRID_W) | 0)),
    );
  const free = (i: number): boolean =>
    Math.max(Math.abs((i % GRID_W) - bx), Math.abs(((i / GRID_W) | 0) - by)) >=
      BUILDING_CLEAR_OF_BORE && !water.troughs.includes(i);
  const squares = Array.from({ length: GRID_N }, (_, i) => i);
  // Where the homestead used to go. Kept only so the yards do not move.
  const oldHomestead = rng.pick(squares.filter((i) => depth(i) === 0 && free(i)));
  const yards = rng.pick(
    squares.filter((i) => {
      const d = apart(i, oldHomestead);
      return depth(i) <= 1 && free(i) && d >= 2 && d <= 5;
    }),
  );
  return { yards };
}

/** The pasture's state before the run-up: the same everywhere but for a little rankness. */
const RUN_UP_START = { G: 700, D: 1400, A: 70 } as const;

/**
 * Run the pasture for 18 months with no stock, then lay the last owner's
 * uneven grazing over it: some patches short and fresh, others left to go
 * rank. `pasture.F` must already hold the soil fertility. `rng` gives the
 * starting rankness and the patches. `seasons` gives the growth factors for
 * the run-up days, which are negative.
 */
export function runUpPasture(
  pasture: PastureState,
  district: District,
  start: FarmStart,
  haPerSquare: number,
  seasons: GrowthFactorSource,
  rng: Rng,
  runUpDays: number = RUN_UP_DAYS,
): void {
  for (let i = 0; i < GRID_N; i++) {
    pasture.G[i] = RUN_UP_START.G;
    pasture.D[i] = RUN_UP_START.D;
    pasture.A[i] = RUN_UP_START.A;
    pasture.X[i] = rng.range(0, 0.3);
  }
  for (let day = -runUpDays; day < 0; day++) {
    const f = seasons.factorsOn(day);
    growGrass(pasture, {
      district,
      date: dateAt(start, day),
      seasonF: f.seasonF,
      monthF: f.monthF,
      plantings: null,
      haPerSquare,
    });
  }
  const hc: number[] = [];
  for (let i = 0; i < 48; i++) hc.push(rng.next());
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const h = smooth(hc, 7, 5, x, y);
      const i = y * GRID_W + x;
      pasture.X[i] = pasture.X[i]! * (0.1 + 0.9 * h);
      pasture.D[i] = pasture.D[i]! * lerp(0.35, 1, h);
      pasture.G[i] = pasture.G[i]! * lerp(0.75, 1, h);
      pasture.A[i] = pasture.A[i]! * lerp(0.5, 1, h);
    }
  }
}

export type StartType = 'scratch' | 'running';

export interface FarmOptions {
  /** The farm's seed. The same seed and options always give the same farm. */
  seed: number;
  district: DistrictId;
  farmHa: number;
  start: FarmStart;
  /** Start from scratch, or take over a running farm. */
  startType: StartType;
  /** A mixed farm: the arable share of the farm and the share of that in the rotation, both %. */
  mixed?: { arablePct: number; croppedPct: number };
  /** Where the growth factors come from. The seeded random seasons if left out. */
  seasons?: GrowthFactorSource;
}

export interface GeneratedFarm {
  layout: FarmLayout;
  pasture: PastureState;
  crops: CropState;
  /** The facts the crop rules need from here on. */
  cropContext: CropContext;
  buildings: FarmBuildings;
  /** What the farm comes with, for the caller to value. */
  improvements: StartImprovements;
  /** Arable share of the farm that was asked for or drawn, %. */
  arablePct: number;
  /** The plantings in the ground on a mixed farm at the start. */
  startFields: Field[];
}

/** The named random streams farm generation draws from. */
export const GENERATION_STREAMS = {
  fertility: 'gen:fertility',
  bore: 'gen:bore',
  pasture: 'gen:pasture',
  layout: 'gen:layout',
  arable: 'gen:arable',
  buildings: 'gen:buildings',
} as const;

/** Build a farm from its seed. */
export function generateFarm(o: FarmOptions): GeneratedFarm {
  const scale = farmScale(o.farmHa);
  const district = DISTRICTS[o.district];
  const stream = (name: keyof typeof GENERATION_STREAMS): Rng =>
    rngStream(o.seed, GENERATION_STREAMS[name]);

  const pasture = createPastureState();
  pasture.F.set(genFertility(stream('fertility')));
  const bore = genBore(stream('bore'));
  runUpPasture(
    pasture,
    district,
    o.start,
    scale.haPerSquare,
    o.seasons ?? randomSeasons({ seed: o.seed, start: o.start }),
    stream('pasture'),
  );

  const laid =
    o.startType === 'running'
      ? layRunning(stream('layout'), bore, scale)
      : layScratch(stream('layout'), bore);

  const arableRng = stream('arable');
  const arablePct = o.mixed
    ? o.mixed.arablePct
    : arableRng.range(...ARABLE_SHARES[o.district].graze);
  const land = genArable(o.district, arablePct, o.mixed ? o.mixed.croppedPct : 0, arableRng);
  const crops = createCropState();
  crops.arable = land.arable;
  crops.rotBlocks = land.rotBlocks;
  const cropContext: CropContext = {
    district: o.district,
    start: o.start,
    haPerSquare: scale.haPerSquare,
    mixed: !!o.mixed,
  };
  const startFields = o.mixed ? startCropping(crops, pasture, cropContext, 0) : [];

  const buildings = placeBuildings(stream('buildings'), laid.water);

  return {
    layout: { scale, fences: laid.fences, water: laid.water, tapeOnRoll: 0 },
    pasture,
    crops,
    cropContext,
    buildings,
    improvements: laid.improvements,
    arablePct,
    startFields,
  };
}
