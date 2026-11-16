/**
 * Feed quality on a square: what the cattle would eat there.
 *
 * This is the MVP's cellQuality, matched number for number
 * (docs/MODEL.md, section 1, Quality).
 */

import type { District } from '../data/districts';
import { clamp } from '../num';
import { plantingAt, type Plantings } from './plantings';
import { LAND, type PastureState } from './state';

export interface SquareQuality {
  /** Share of green in the diet, 0 to 1. Cattle pick green leaf first. */
  pg: number;
  /** Digestibility of the diet (DMD), 0 to 1. */
  dmd: number;
  /** Crude protein % of the diet. */
  cp: number;
  /** Energy of the diet, ME in MJ/kg DM. */
  me: number;
  /** Digestibility of the green feed alone. */
  dmdG: number;
  /** Crude protein % of the green feed alone. */
  cpG: number;
}

/** ME (MJ/kg DM) from digestibility. CSIRO feeding standards. */
export const meFromDmd = (dmd: number): number => 0.172 * dmd * 100 - 1.707;

/** Diet quality on square `i`. */
export function cellQuality(
  state: PastureState,
  district: District,
  plantings: Plantings | null,
  i: number,
): SquareQuality {
  const R = district;
  const g = state.G[i]!;
  const d = state.D[i]!;
  const a = state.A[i]!;
  const x = state.X[i]!;
  const fl = plantingAt(plantings, i);
  const lu = state.land[i]!;

  // Stubble and bare fallow have fixed figures. There is no green to pick.
  if (!fl && lu >= LAND.fallow) {
    const dmd = lu === LAND.stubble ? 0.45 : 0.42;
    return { pg: 0, dmd, cp: lu === LAND.stubble ? 4 : 3, me: meFromDmd(dmd), dmdG: 0.45, cpG: 4 };
  }

  let dmdG: number;
  let cpG: number;
  // Dead feed on native pasture. Rank dead feed is a little poorer.
  let dmdD = R.dmdDead - 0.01 * x;
  let cpD = 5 - 0.5 * x;
  if (fl && fl.kind !== 'pasture') {
    // Annuals and crops: quality follows the crop's stage, not leaf age.
    dmdG = fl.now.dmd;
    cpG = fl.now.cp;
    dmdD = 0.5;
    cpD = fl.now.cpD;
  } else {
    // Native and sown pasture: green leaf loses quality as it ages and goes rank.
    const dMax = fl ? fl.now.dmd : R.dmdMax;
    const cMax = fl ? fl.now.cp : R.cpMax;
    dmdG = clamp(dMax - 0.0012 * a - 0.05 * x, R.dmdMin - 0.02, dMax);
    cpG = clamp(cMax - 0.055 * a - 2 * x, 4.5, cMax);
    // Sown pasture has its own protein figure for dead feed.
    if (fl) cpD = fl.now.cpD;
  }

  // Cattle select green leaf, but can't find much when it is very short.
  let pg = g / (g + 0.25 * d + 1);
  if (g < 150) pg *= g / 150;
  const dmd = pg * dmdG + (1 - pg) * dmdD;
  return { pg, dmd, cp: pg * cpG + (1 - pg) * cpD, me: meFromDmd(dmd), dmdG, cpG };
}
