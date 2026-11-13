/**
 * The pasture on every square of the farm.
 *
 * The arrays use the same number types as the MVP (32-bit floats for the
 * feed figures). Storing a number in a 32-bit array rounds it, and the
 * formulas read the rounded value back the next day, so the types are part
 * of the model. Changing one changes the results.
 */

import { GRID_N } from '../grid';

/** What a square is used for. */
export const LAND = {
  /** Native pasture. */
  native: 0,
  /** Sown perennial pasture. */
  sown: 1,
  /** Annual pasture or forage crop. */
  annual: 2,
  /** Grain crop. */
  crop: 3,
  /** Fallow: bare worked soil after a crop. */
  fallow: 4,
  /** Stubble: dry straw left after harvest. */
  stubble: 5,
} as const;
export type LandUse = (typeof LAND)[keyof typeof LAND];

export interface PastureState {
  /** Green feed, kg DM/ha. */
  G: Float32Array;
  /** Dead feed, kg DM/ha. */
  D: Float32Array;
  /** Average leaf age, days. */
  A: Float32Array;
  /** Rankness, 0 to 1: how far the plants have run up to seed and gone stale. */
  X: Float32Array;
  /** Soil fertility, about 0.6 to 1.35. 1 is average soil. */
  F: Float32Array;
  /** Land use for each square (see LAND). */
  land: Uint8Array;
  /** Recent grazing, 0 to 1. Grazing raises it and it fades by a tenth each day. */
  graz: Float32Array;
  /** The farm day each square was last grazed. -99999 means never. */
  lastG: Int32Array;
  /**
   * Grass grown on the last day run, kg DM/ha. Rewritten by each daily step.
   * It is saved with the farm, so a paddock sheet reads the same after a reload.
   */
  grown: Float32Array;
}

/** A square's "never grazed" marker, as the MVP used. */
export const NEVER_GRAZED = -99999;

/**
 * An empty pasture: no feed, average soil, all native, never grazed.
 * Farm generation fills in the real values.
 */
export function createPastureState(): PastureState {
  return {
    G: new Float32Array(GRID_N),
    D: new Float32Array(GRID_N),
    A: new Float32Array(GRID_N),
    X: new Float32Array(GRID_N),
    F: new Float32Array(GRID_N).fill(1),
    land: new Uint8Array(GRID_N),
    graz: new Float32Array(GRID_N),
    lastG: new Int32Array(GRID_N).fill(NEVER_GRAZED),
    grown: new Float32Array(GRID_N),
  };
}

/** A separate copy of a pasture, so one can change without the other. */
export function clonePastureState(s: PastureState): PastureState {
  return {
    G: s.G.slice(),
    D: s.D.slice(),
    A: s.A.slice(),
    X: s.X.slice(),
    F: s.F.slice(),
    land: s.land.slice(),
    graz: s.graz.slice(),
    lastG: s.lastG.slice(),
    grown: s.grown.slice(),
  };
}
