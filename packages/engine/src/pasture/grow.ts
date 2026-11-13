/**
 * One day of pasture: growth, haying off, breakdown of dead feed, leaf age
 * and rankness, for every square.
 *
 * This is the MVP's growGrass, matched number for number. The order of the
 * arithmetic matters, so keep each expression as it is written. The formulas
 * are set out in docs/MODEL.md, section 1.
 */

import type { CalendarDate } from '../calendar';
import type { District } from '../data/districts';
import { GRID_N } from '../grid';
import { clamp } from '../num';
import { plantingAt, type Plantings } from './plantings';
import { districtPotential } from './potential';
import { LAND, type PastureState } from './state';

export interface GrowInputs {
  district: District;
  date: CalendarDate;
  /** The season factor: 1 is an average season, 0.5 a drought. */
  seasonF: number;
  /** The month factor: today's growth as a multiple of the district curve. */
  monthF: number;
  /** Sown pastures and crops, or null if the farm has none. */
  plantings: Plantings | null;
  /** Hectares in one square, for the farm total. */
  haPerSquare: number;
}

/**
 * Step the pasture forward one day. Changes `state` in place and fills
 * `state.grown`. Returns the feed grown across the farm today, in kg DM.
 */
export function growGrass(state: PastureState, inputs: GrowInputs): number {
  const { district: R, date, plantings } = inputs;
  const { G, D, A, F, X, land, graz, grown: GRW } = state;

  const potToday = districtPotential(R, date);
  const base = potToday * inputs.monthF;
  // How good the growing conditions are for the time of year, 0 to 1.2.
  const wet = clamp(potToday / R.peak, 0, 1.2);
  // Green feed hays off faster in the dry, and faster again in a poor season.
  const dry = clamp(1 - wet, 0, 1) * (inputs.seasonF < 0.8 ? 1.25 : 1);
  const m = date.month;
  const frost = R.frost.includes(m) ? R.frostSen : 0;
  // Standing dead feed weathers and breaks down faster when it is wet.
  const decay = 0.003 + 0.009 * wet;
  const heading = R.head.includes(m);

  let total = 0;
  for (let i = 0; i < GRID_N; i++) {
    const g = G[i]!;
    const d = D[i]!;
    const a = A[i]!;
    const B = g + d;

    // What is growing here: native pasture, a sown pasture, a crop, or nothing.
    const fl = plantingAt(plantings, i);
    const lu = land[i]!;
    let pot = base;
    let bmax = R.bmax;
    let xsen = 0;
    let crop = false;
    if (fl) {
      pot = fl.now.pot * plantings!.density[i]!;
      bmax = fl.now.bmax;
      xsen = fl.now.sen;
      crop = fl.kind !== 'pasture';
    } else if (lu === LAND.fallow || lu === LAND.stubble) {
      // Fallow is bare. Stubble is dry straw. Neither grows. What is lying
      // there breaks down: 3% a day on worked fallow, 0.4% a day as stubble.
      G[i] = 0;
      A[i] = 0;
      X[i] = 0;
      D[i] = Math.max(0, d - d * (lu === LAND.fallow ? 0.03 : 0.004));
      // Stubble under 400 kg DM/ha has gone, and the square is fallow.
      if (lu === LAND.stubble && D[i]! < 400) land[i] = LAND.fallow;
      GRW[i] = 0;
      graz[i] = graz[i]! * 0.9;
      continue;
    }

    // Rankness. Leafy plants left through the heading months run up to seed,
    // and thick dead thatch keeps them stale. It only eases when the square
    // is short enough for light to reach the crowns. Crops have none.
    let x = X[i]!;
    if (crop || lu === LAND.fallow) x = 0;
    else {
      if (heading && a > 40 && g > 1000) x += 0.009;
      if (d > 2500) x += (0.0015 * d) / 2500;
      if (B < 1400) x -= 0.004;
    }
    x = clamp(x, 0, 1);
    X[i] = x;

    // Phase 1: little leaf, slow growth.
    const leaf = Math.min(1, ((g + 150) / (g + 500)) * 1.35);
    // Phase 3: shaded by its own bulk and dead feed.
    const ceil = Math.max(0, 1 - (g + 0.6 * d) / (bmax * F[i]!));
    // Old stemmy plants slow down. Crops follow their own stages instead.
    const ageF = crop ? 1 : a > 60 ? Math.max(0.45, 1 - (a - 60) / 200) : 1;
    // Rank tussocks are slow to reshoot.
    const gr = pot * F[i]! * leaf * ceil * ageF * (1 - 0.4 * x);
    GRW[i] = gr;

    // Green turning to dead. Young leaf hays off slower than old leaf.
    const sen = crop
      ? g * (0.002 + 0.006 * dry + xsen)
      : g * (0.003 + 0.018 * dry + frost + xsen) * (0.45 + Math.min(a, 160) / 110) * (1 + 0.5 * x);
    const left = Math.max(0, g - sen);
    const ng = left + gr;
    // New leaf lowers the average leaf age.
    A[i] = ng > 1 ? (left * (a + 1)) / ng : 0;
    G[i] = ng;
    D[i] = Math.max(0, d + Math.min(g, sen) - d * (decay + (lu === LAND.fallow ? 0.006 : 0)));
    graz[i] = graz[i]! * 0.9;
    total += gr * inputs.haPerSquare;
  }
  return total;
}
