/**
 * Cropping figures for the four launch districts: what each can plant, its
 * rotation, how much of a farm is arable, and how well crops do there.
 *
 * Copied from the MVP's LAND_OPTS, ROTATION, ARABLE, CROPF and CONVERT
 * (docs/DATA.md). The Top End is left out for now.
 */

import type { DistrictId } from '@gg/shared';
import type { SpeciesId } from './species';

/** What is realistic to plant in each district. */
export const LAND_OPTIONS: Readonly<Record<DistrictId, readonly SpeciesId[]>> = {
  cq: ['buffel', 'leucaena', 'stylo', 'forsorg', 'grsorg', 'wheat', 'oats'],
  nsw: ['phal', 'rye', 'multi', 'lucerne', 'oats', 'annrye', 'millet'],
  cw: ['lucerne', 'phal', 'multi', 'wheat', 'barley', 'oats', 'forsorg'],
  wv: ['rye', 'phal', 'multi', 'annrye', 'oats', 'wheat', 'barley', 'brass'],
};

/** The crops in each district's rotation. One more block is always in fallow. */
export const ROTATIONS: Readonly<Record<DistrictId, readonly SpeciesId[]>> = {
  cq: ['wheat', 'grsorg', 'forsorg'],
  nsw: ['oats', 'annrye', 'millet'],
  cw: ['wheat', 'barley', 'oats'],
  wv: ['wheat', 'barley', 'annrye'],
};

export interface ArableShare {
  /** A grazing farm gets a share in this range, %, at random. */
  graze: readonly [number, number];
  /** A mixed farm chooses one of these, %. */
  mixed: readonly number[];
}

/** Arable share of the farm, %. */
export const ARABLE_SHARES: Readonly<Record<DistrictId, ArableShare>> = {
  cq: { graze: [0, 12], mixed: [10, 25, 40, 60] },
  nsw: { graze: [0, 8], mixed: [5, 10, 20, 30] },
  cw: { graze: [5, 20], mixed: [20, 40, 60, 80] },
  wv: { graze: [0, 10], mixed: [10, 20, 35, 50] },
};

/** How well crops do in each district, as a multiple of the species figures. */
export const CROP_DISTRICT_FACTORS: Readonly<Record<DistrictId, number>> = {
  cq: 0.8,
  nsw: 0.95,
  cw: 0.9,
  wv: 1.1,
};

/** $/ha to turn pasture into cropping country (spray, cultivate). */
export const CONVERT_COST_PER_HA = 150;
