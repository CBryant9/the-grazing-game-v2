/**
 * Summaries of the pasture over a paddock, a grazing area or the whole farm.
 *
 * These are the MVP's padStats, regionStats and coverPct, matched number for
 * number (docs/MODEL.md, section 1, Paddock summary). The sums run over the
 * squares in the order given, because the order changes the last decimal
 * places.
 */

import type { PaddockLabelId } from '@gg/shared';
import type { District } from '../data/districts';
import { GRID_N } from '../grid';
import { clamp } from '../num';
import type { Plantings } from './plantings';
import { cellQuality } from './quality';
import { LAND, type PastureState } from './state';

/**
 * The cattle figures a paddock summary needs. The cattle model is milestone
 * 1.2. It works these out for the grazing area and hands in the paddock's
 * share (paddock ha divided by the area's ha).
 */
export interface PaddockStock {
  /** Adult equivalents on the paddock. */
  ae: number;
  /** Head on the paddock, not counting calves. */
  head: number;
  /** Feed eaten today on the paddock, kg DM. */
  eat: number;
}

export interface PaddockSummaryInputs {
  district: District;
  /** Sown pastures and crops, or null if the farm has none. */
  plantings: Plantings | null;
  /** The squares to summarise: the paddock, or one part of it. */
  cells: readonly number[];
  /** The whole paddock's area, ha, even when `cells` is only a part of it. */
  ha: number;
  /** Hectares in one square. */
  haPerSquare: number;
  /** Today's farm day, for days since last grazed. */
  day: number;
  /** Cattle on the paddock. Leave out for an empty paddock. */
  stock?: PaddockStock;
}

export interface PaddockSummary {
  /** Green feed, kg DM/ha. */
  g: number;
  /** Dead feed, kg DM/ha. */
  d: number;
  /** Total standing feed, kg DM/ha. */
  mass: number;
  /** Green share of the feed, 0 to 1. */
  green: number;
  /** Average leaf age, days, weighted by green feed. */
  age: number;
  /** Average rankness, 0 to 1. */
  x: number;
  /** Average diet energy, ME in MJ/kg DM. */
  me: number;
  /** Average diet crude protein %. */
  cp: number;
  /** Average days since each square was last grazed, counting at most 400 for any square. */
  rest: number;
  /** Ground cover, 0 to 1. About 1,000 kg DM/ha covers the ground. */
  cover: number;
  /** Standing height, cm. */
  height: number;
  /** How high the green leaf reaches, cm. */
  leafH: number;
  /** Adult equivalents on the paddock. */
  ae: number;
  /** Head on the paddock, not counting calves. */
  head: number;
  /** Feed grown today, kg DM. */
  grow: number;
  /** Feed eaten today, kg DM. */
  eat: number;
  /** Stocking rate, AE/ha. */
  rate: number;
  /** Long-term carrying capacity for this soil, AE/ha, at the district's safe utilisation. */
  cc: number;
  /** Days of feed above 800 kg DM/ha at 9 kg per AE a day. Infinity with no stock. */
  feedDays: number;
  /** The neutral paddock label: Short, Green, Dry & rank or Mixed. */
  label: PaddockLabelId;
  /** The paddock's area, ha. */
  ha: number;
}

/** Summarise a paddock, or part of one. */
export function paddockSummary(state: PastureState, inputs: PaddockSummaryInputs): PaddockSummary {
  const { district: R, plantings, cells, ha, day } = inputs;
  const { G, D, A, X, F, lastG, grown } = state;

  let g = 0;
  let d = 0;
  let ga = 0;
  let x = 0;
  let me = 0;
  let cp = 0;
  let rest = 0;
  let cov = 0;
  let f = 0;
  const n = cells.length;
  for (const i of cells) {
    const q = cellQuality(state, R, plantings, i);
    g += G[i]!;
    d += D[i]!;
    ga += A[i]! * G[i]!;
    x += X[i]!;
    me += q.me;
    cp += q.cp;
    rest += Math.min(400, day - lastG[i]!);
    cov += Math.min(1, (G[i]! + D[i]!) / 1000);
    f += F[i]!;
  }
  const age = g > 1 ? ga / g : 0;
  g /= n;
  d /= n;
  x /= n;
  me /= n;
  cp /= n;
  rest /= n;
  cov /= n;
  f /= n;

  const mass = g + d;
  const green = g / Math.max(1, mass);
  // How mature and stemmy the sward is, 0 to 1.
  const mat = clamp(Math.max(x, (age - 25) / 80, (1 - green) * 0.7), 0, 1);
  // Leafy swards are short for their weight. Rank swards are tall.
  const height = Math.min(90, (mass / 70) * (0.65 + 0.9 * mat));
  const leafH = Math.min(height, Math.max(2, (g / 55) * (1 - 0.45 * x)));

  const ae = inputs.stock?.ae ?? 0;
  const head = inputs.stock?.head ?? 0;
  const eat = inputs.stock?.eat ?? 0;

  const cc = (R.annual * f * 0.65 * R.util) / 3285;
  const feedKg = Math.max(0, mass - 800) * ha;
  let grow = 0;
  for (const i of cells) grow += grown[i]! * inputs.haPerSquare;

  const label: PaddockLabelId =
    mass < 800
      ? 'short'
      : green > 0.5
        ? 'green'
        : x > 0.5 || (height > 40 && green < 0.3)
          ? 'rank'
          : 'mixed';

  return {
    g,
    d,
    mass,
    green,
    age,
    x,
    me,
    cp,
    rest,
    cover: cov,
    height,
    leafH,
    ae,
    head,
    grow,
    eat,
    rate: ae / ha,
    cc,
    feedDays: ae > 0 ? feedKg / (ae * 9) : Infinity,
    label,
    ha,
  };
}

export interface AreaSummary {
  /** Green feed, kg DM/ha. */
  g: number;
  /** Dead feed, kg DM/ha. */
  d: number;
  /** Total standing feed, kg DM/ha. */
  mass: number;
  /** Average diet energy, ME in MJ/kg DM. */
  me: number;
  /** Average days since each square was last grazed, counting at most 400 for any square. */
  rest: number;
  /** Feed above the 250 kg DM/ha that cattle leave behind, kg DM. */
  feed: number;
  /** Green share of the feed, 0 to 1. */
  green: number;
}

/** Summarise a grazing area: the squares a mob can reach. */
export function areaSummary(
  state: PastureState,
  inputs: Pick<PaddockSummaryInputs, 'district' | 'plantings' | 'cells' | 'haPerSquare' | 'day'>,
): AreaSummary {
  const { G, D, lastG } = state;
  let g = 0;
  let d = 0;
  let me = 0;
  let rest = 0;
  let fe = 0;
  for (const i of inputs.cells) {
    g += G[i]!;
    d += D[i]!;
    me += cellQuality(state, inputs.district, inputs.plantings, i).me;
    rest += Math.min(400, inputs.day - lastG[i]!);
    fe += Math.max(0, G[i]! + D[i]! - 250) * inputs.haPerSquare;
  }
  const n = inputs.cells.length;
  return {
    g: g / n,
    d: d / n,
    mass: (g + d) / n,
    me: me / n,
    rest: rest / n,
    feed: fe,
    green: g / Math.max(1, g + d),
  };
}

/**
 * Ground cover across the farm's pasture, as a percentage. Cropping country
 * (annuals, crops, fallow and stubble) is left out. A farm with no pasture
 * squares counts as 100.
 */
export function coverPct(state: PastureState): number {
  let c = 0;
  let n = 0;
  for (let i = 0; i < GRID_N; i++) {
    if (state.land[i]! >= LAND.annual) continue;
    n++;
    c += Math.min(1, (state.G[i]! + state.D[i]!) / 1000);
  }
  return n ? (c / n) * 100 : 100;
}
