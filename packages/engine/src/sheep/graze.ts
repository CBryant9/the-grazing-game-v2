/**
 * Where a sheep mob grazes and what it takes off the pasture: the cattle
 * rules (docs/MODEL.md, section 2) with sheep figures. Sheep pick greener
 * feed, get their fill from shorter feed and graze closer to the ground.
 * The pasture arrays are the same ones the cattle graze, so one grass model
 * feeds both.
 */

import type { PlantingGraze } from '../cattle/graze';
import type { GrazingArea, GrazingLand } from '../cattle/types';
import {
  DEAD_IN_REACH,
  SHEEP_AVAIL_KG,
  SHEEP_GREEN_PICK,
  SHEEP_RESIDUAL,
  SHEEP_SHORT,
} from '../data/sheep';
import { clamp } from '../num';
import { cellQuality, meFromDmd } from '../pasture/quality';

/** The feed a sheep mob picks across its grazing area. */
export interface SheepDiet {
  /** Digestibility (DMD), 0 to 1. */
  dmd: number;
  /** Crude protein %. */
  cp: number;
  /** Feed where they graze, kg DM/ha. */
  mass: number;
  /** Green feed where they graze, kg DM/ha. */
  green: number;
  /** Share of what they could eat that short feed lets them get, 0 to 1. */
  avail: number;
  /** Metres walked to water. */
  dist: number;
}

/** How much of its fill a sheep gets on feed with this much green and dead, kg DM/ha. */
export const sheepAvail = (green: number, dead: number): number =>
  1 - Math.exp(-(green + DEAD_IN_REACH * dead) / SHEEP_AVAIL_KG);

/** A sheep's pick on one square: green share, digestibility and protein of what it takes. */
export interface SheepPick {
  pg: number;
  dmd: number;
  cp: number;
}

/** What sheep take on square `i`: greener than cattle (call C19). */
export function sheepPickOn(land: GrazingLand, i: number): SheepPick {
  const { pasture, district, plantings } = land;
  const g = pasture.G[i]!;
  const d = pasture.D[i]!;
  const q = cellQuality(pasture, district, plantings, i);
  // The dead feed's figures, read back from the cattle diet on the square.
  const dmdD = q.pg < 0.999 ? (q.dmd - q.pg * q.dmdG) / (1 - q.pg) : q.dmdG;
  const cpD = q.pg < 0.999 ? (q.cp - q.pg * q.cpG) / (1 - q.pg) : q.cpG;
  if (q.pg <= 0 && g <= 0) return { pg: 0, dmd: dmdD, cp: cpD };
  let pg = g / (g + SHEEP_GREEN_PICK * d + 1);
  if (g < SHEEP_SHORT.greenKg) pg *= g / SHEEP_SHORT.greenKg;
  if (q.pg <= 0) pg = 0; // stubble and fallow: nothing green to pick
  return { pg, dmd: pg * q.dmdG + (1 - pg) * dmdD, cp: pg * q.cpG + (1 - pg) * cpD };
}

export interface SheepDietResult {
  diet: SheepDiet;
  /** Preference for each square of the area, in the order of `area.cells`. */
  weights: Float64Array;
  /** The pick on each square, for the graze. */
  picks: SheepPick[];
}

/**
 * The diet a sheep mob selects on a grazing area. The cattle preference
 * weights, with dead feed counting less and bare ground passed over only
 * when it is barer.
 */
export function sheepDietOf(land: GrazingLand, area: GrazingArea): SheepDietResult {
  const { pasture, distToWater: DIST, sideM } = land;
  const cells = area.cells;
  const n = cells.length;
  const w = new Float64Array(n);
  const picks: SheepPick[] = new Array(n);
  const hasW = area.hasWater;
  let sw = 0;
  let sd = 0;
  let sc = 0;
  let sm = 0;
  let sg = 0;
  let sr = 0;
  let sdist = 0;
  for (let k = 0; k < n; k++) {
    const i = cells[k]!;
    const g = pasture.G[i]!;
    const d = pasture.D[i]!;
    const p = sheepPickOn(land, i);
    picks[k] = p;
    const wf = hasW ? Math.exp((-DIST[i]! * sideM) / 3000) : 1;
    let wt = (g + SHEEP_GREEN_PICK * d + 20) * Math.exp((meFromDmd(p.dmd) - 8) * 0.45) * wf;
    if (g + d < SHEEP_SHORT.bareKg) wt *= 0.15;
    w[k] = wt;
    sw += wt;
    sd += wt * p.dmd;
    sc += wt * p.cp;
    sm += wt * (g + d);
    sg += wt * g;
    sr += wt * d;
    sdist += wt * (hasW ? DIST[i]! : 0);
  }
  sw = sw || 1;
  const green = sg / sw;
  const dead = sr / sw;
  return {
    diet: {
      dmd: sd / sw,
      cp: sc / sw,
      mass: sm / sw,
      green,
      avail: sheepAvail(green, dead),
      dist: (sdist / sw) * sideM,
    },
    weights: w,
    picks,
  };
}

/** The walk to water in the reference DSE (walk factor 0.10), metres. */
export const REF_WALK_M = 1250;

/**
 * A diet held at a set green mass, dead mass and digestibility, with the
 * reference DSE's walk to water (tests and calibration: a held paddock).
 */
export function heldDiet(green: number, dmd: number, dead = 0, cp = 16): SheepDiet {
  return { dmd, cp, mass: green + dead, green, avail: sheepAvail(green, dead), dist: REF_WALK_M };
}

/**
 * Take a sheep mob's feed off the pasture: the cattle graze (`grazeAlloc`)
 * with the sheep's lower residual and greener pick. `dse` is the mob's DSE,
 * for trampling (stock per ha counted in AE). Changes the pasture in place.
 * Returns the feed supplied, kg DM.
 */
export function sheepGrazeAlloc(
  land: GrazingLand,
  area: GrazingArea,
  res: SheepDietResult,
  demand: number,
  aeOnArea: number,
  day: number,
  plantingGrazes?: PlantingGraze[],
): number {
  const { pasture, haPerSquare: HA, plantings } = land;
  const { G, D, A, X, graz, lastG } = pasture;
  const cells = area.cells;
  const n = cells.length;
  const w = res.weights;
  const avail = new Float64Array(n);
  const take = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const i = cells[k]!;
    avail[k] = Math.max(0, G[i]! + D[i]! - SHEEP_RESIDUAL) * HA;
  }
  let remaining = demand;
  let supplied = 0;
  for (let pass = 0; pass < 4 && remaining > 0.01; pass++) {
    let sw = 0;
    for (let k = 0; k < n; k++) if (avail[k]! > 0.01) sw += w[k]! + 1e-6;
    if (sw <= 0) break;
    let took = 0;
    for (let k = 0; k < n; k++) {
      if (avail[k]! <= 0.01) continue;
      let t = (remaining * (w[k]! + 1e-6)) / sw;
      if (t > avail[k]!) t = avail[k]!;
      avail[k] = avail[k]! - t;
      take[k] = take[k]! + t;
      took += t;
    }
    remaining -= took;
    supplied += took;
  }
  const density = aeOnArea / Math.max(0.25, area.ha);
  const trample = 0.04 + 0.12 * Math.min(1, density / 4);
  for (let k = 0; k < n; k++) {
    if (take[k]! <= 0) continue;
    const i = cells[k]!;
    const r = take[k]! / HA;
    const g = G[i]!;
    const d = D[i]!;
    let rg = Math.min(g, r * res.picks[k]!.pg);
    let rd = r - rg;
    if (rd > d) {
      rd = d;
      rg = Math.min(g, r - rd);
    }
    G[i] = g - rg;
    D[i] = Math.max(0, d - rd - r * trample);
    if (g > 1) A[i] = A[i]! * (1 - 0.8 * (rg / g));
    if (plantings && plantingGrazes && r > 3) {
      const id = plantings.fid[i]!;
      if (id >= 0 && plantings.byId.has(id)) {
        plantingGrazes.push({ id, square: i, eaten: r, greenEaten: rg, greenBefore: g });
      }
    }
    X[i] = Math.max(0, X[i]! * (1 - clamp((r * (1 + 3 * trample)) / (0.45 * (g + d) + 1), 0, 0.9)));
    if (r > 15) lastG[i] = day;
    graz[i] = Math.min(1, graz[i]! + r / 120);
  }
  return supplied;
}
