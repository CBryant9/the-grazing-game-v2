/**
 * Where a mob grazes, what it eats there, and what that does to the pasture.
 *
 * These are the MVP's dietOf, intakeOf and grazeAlloc, matched number for
 * number (docs/MODEL.md, sections 2 and 3). The order of the arithmetic and
 * the 32-bit arrays are part of the result, so keep each line as written.
 */

import {
  CALF_RATION_SHARE,
  FEED_COST,
  HAY,
  LICK,
  LOT_RATION,
  PELLETS,
  type Supplement,
} from '../data/feed';
import { clamp } from '../num';
import { cellQuality, meFromDmd } from '../pasture/quality';
import type { Animal, CattleTotals, GrazingArea, GrazingLand } from './types';

/** The feed a mob picks across its grazing area. */
export interface Diet {
  /** Digestibility of the diet (DMD), 0 to 1. */
  dmd: number;
  /** Crude protein % of the diet. */
  cp: number;
  /** Feed where they graze, kg DM/ha. */
  mass: number;
  /** How easily they get a mouthful, 0 to 1. Short feed means small bites. */
  avail: number;
  /** Metres walked to water. */
  dist: number;
}

/** The diet in the feedlot: the ration, nothing to walk for. */
export const LOT_DIET: Diet = {
  dmd: LOT_RATION.dmd,
  cp: LOT_RATION.cp,
  avail: 1,
  mass: 0,
  dist: 0,
};

export interface DietResult {
  diet: Diet;
  /** How strongly the mob prefers each square of the area, in the order of `area.cells`. */
  weights: Float32Array;
}

/** Feed under this, kg DM/ha, is left behind: cattle can't graze lower. */
export const RESIDUAL = 250;

/**
 * The diet a mob selects on a grazing area. Cattle favour squares with more
 * green feed and better energy, and country near water, though they walk
 * 3 to 5 km out when they need to.
 */
export function dietOf(land: GrazingLand, area: GrazingArea): DietResult {
  const { pasture, district, plantings, distToWater: DIST, sideM } = land;
  const cells = area.cells;
  const n = cells.length;
  const w = new Float32Array(n);
  const hasW = area.hasWater;
  let sw = 0;
  let sd = 0;
  let sc = 0;
  let sm = 0;
  let sdist = 0;
  for (let k = 0; k < n; k++) {
    const i = cells[k]!;
    const g = pasture.G[i]!;
    const d = pasture.D[i]!;
    const B = g + d;
    const q = cellQuality(pasture, district, plantings, i);
    const wf = hasW ? Math.exp((-DIST[i]! * sideM) / 3000) : 1;
    let wt = (g + 0.25 * d + 20) * Math.exp((meFromDmd(q.dmd) - 8) * 0.45) * wf;
    // Nearly bare squares are mostly passed over.
    if (B < 350) wt *= 0.15;
    w[k] = wt;
    sw += wt;
    sd += wt * q.dmd;
    sc += wt * q.cp;
    sm += wt * B;
    sdist += wt * (hasW ? DIST[i]! : 0);
  }
  sw = sw || 1;
  const mass = sm / sw;
  return {
    diet: {
      dmd: sd / sw,
      cp: sc / sw,
      mass,
      avail: 1 - Math.exp(-mass / 650),
      dist: (sdist / sw) * sideM,
    },
    weights: w,
  };
}

/** What one animal eats in a day. */
export interface Intake {
  /** Pasture it wants, kg DM. */
  past: number;
  /** Hay, pellets or lot ration, kg DM. */
  sKg: number;
  /** Energy of that feed, ME in MJ/kg DM. */
  sME: number;
  /** Crude protein % of that feed. */
  sCP: number;
  /** Cost of the supplement or the lot today, dollars. */
  cost: number;
}

/**
 * An animal's intake on a diet. Appetite is a share of live weight, lower
 * for heavier and fatter cattle and higher for a cow with a calf on her.
 * Poorer digestibility means slower passage and lower intake.
 */
export function intakeOf(a: Animal, diet: Diet, supp: Supplement, lot: boolean): Intake {
  const W_ = a.wt;
  let k =
    a.kind === 'calf'
      ? 0.03 * clamp((a.age - 30) / 120, 0, 1)
      : W_ < 300
        ? 0.03
        : W_ < 450
          ? 0.027
          : 0.024;
  if (a.lact >= 0 && a.calf) k += 0.006;
  // Fat cattle eat less.
  if (a.cond > 3.5) k *= Math.max(0.55, 1 - (a.cond - 3.5) * 0.4);
  const pot = W_ * k;
  if (lot) {
    const sKg = a.kind === 'calf' ? pot * LOT_RATION.calfShare : pot;
    return {
      past: 0,
      sKg,
      sME: LOT_RATION.me,
      sCP: LOT_RATION.cp,
      cost: sKg * FEED_COST.lotKg + FEED_COST.lotYard,
    };
  }
  const qf = clamp(0.62 + (diet.dmd - 0.5) * 2, 0.5, 1.05);
  let past = pot * qf * diet.avail;
  let sKg = 0;
  let sME = 0;
  let sCP = 0;
  let cost = 0;
  const cf = a.kind === 'calf' ? CALF_RATION_SHARE : 1;
  if (supp === 'lick') {
    past *= diet.cp < 7 ? LICK.liftUnder7 : diet.cp < 9 ? LICK.liftUnder9 : 1;
    cost = FEED_COST.lick * cf * (diet.cp < 9 ? 1 : LICK.greenFeedShare);
  }
  if (supp === 'hay') {
    sKg = HAY.kg * cf;
    sME = HAY.me;
    sCP = HAY.cp;
    past = Math.max(0, past - HAY.replaces * sKg);
    cost = sKg * FEED_COST.hayKg;
  }
  if (supp === 'pellet') {
    sKg = PELLETS.kg * cf;
    sME = PELLETS.me;
    sCP = PELLETS.cp;
    past = Math.max(0, past - PELLETS.replaces * sKg);
    cost = sKg * FEED_COST.pelletKg;
  }
  // Too little protein and the rumen slows, so intake drops. The protein
  // counted is the pasture's plus the hay's or pellets'. Lick fixes it.
  const cpMix = (past * diet.cp + sKg * sCP) / Math.max(0.01, past + sKg);
  if (supp !== 'lick' && cpMix < 7) past *= 1 - (7 - cpMix) * 0.05;
  return { past, sKg, sME, sCP, cost };
}

/** A planted square that was grazed today, for the crop model to act on. */
export interface PlantingGraze {
  /** The planting's id. */
  id: number;
  /** The square. */
  square: number;
  /** Feed taken off the square, kg DM/ha. */
  eaten: number;
  /** Green feed taken, kg DM/ha. */
  greenEaten: number;
  /** Green feed there before the graze, kg DM/ha. */
  greenBefore: number;
}

export interface GrazeInputs {
  land: GrazingLand;
  area: GrazingArea;
  /** The mob's preference for each square, from dietOf on the same area. */
  weights: Float32Array;
  /** Pasture the mob wants, kg DM. */
  demand: number;
  /** Animals in the mob, calves included, for trampling. */
  head: number;
  /** Today's farm day, to mark squares as grazed. */
  day: number;
  /** Year totals. Feed eaten is added to `eaten`. */
  totals: CattleTotals;
  /** Planted squares that were grazed are added to this list, if given. */
  plantingGrazes?: PlantingGraze[];
}

/**
 * Take a mob's feed off the pasture. The demand is shared across squares by
 * preference, in up to 4 passes, leaving RESIDUAL on each square. In each
 * square green is taken first, by the share cattle select, then dead.
 * Trampling knocks down extra dead feed, more at high stock density.
 *
 * Changes the pasture in place. Returns the feed supplied, kg DM.
 */
export function grazeAlloc(inputs: GrazeInputs): number {
  const { land, area, weights: w, demand, day, plantingGrazes } = inputs;
  const { pasture, district, plantings, haPerSquare: HA } = land;
  const { G, D, A, X, graz, lastG } = pasture;
  const cells = area.cells;
  const n = cells.length;
  const avail = new Float32Array(n);
  const take = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = cells[k]!;
    avail[k] = Math.max(0, G[i]! + D[i]! - RESIDUAL) * HA;
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
  const density = inputs.head / Math.max(0.25, area.ha);
  const trample = 0.04 + 0.12 * Math.min(1, density / 4);
  for (let k = 0; k < n; k++) {
    if (take[k]! <= 0) continue;
    const i = cells[k]!;
    const r = take[k]! / HA;
    const g = G[i]!;
    const d = D[i]!;
    const q = cellQuality(pasture, district, plantings, i);
    let rg = Math.min(g, r * q.pg);
    let rd = r - rg;
    if (rd > d) {
      rd = d;
      rg = Math.min(g, r - rd);
    }
    G[i] = g - rg;
    D[i] = Math.max(0, d - rd - r * trample);
    // Grazing takes the old leaf, so the average leaf age drops.
    if (g > 1) A[i] = A[i]! * (1 - 0.8 * (rg / g));
    if (plantings && plantingGrazes && r > 3) {
      const id = plantings.fid[i]!;
      if (id >= 0 && plantings.byId.has(id)) {
        plantingGrazes.push({ id, square: i, eaten: r, greenEaten: rg, greenBefore: g });
      }
    }
    // Knocking it down lets the crowns reshoot. How much depends on the
    // share eaten or trampled today, so a big mob on a small area resets
    // rank grass fast and a light mob barely touches it.
    X[i] = Math.max(0, X[i]! * (1 - clamp((r * (1 + 3 * trample)) / (0.45 * (g + d) + 1), 0, 0.9)));
    if (r > 15) lastG[i] = day;
    graz[i] = Math.min(1, graz[i]! + r / 120);
  }
  inputs.totals.eaten += supplied;
  return supplied;
}
