/**
 * Farm sizes for the four launch districts, and the scale that follows
 * from a farm's size.
 *
 * Copied from the MVP's FARMS table (docs/DATA.md, Farm sizes). The Top End
 * is left out for now (PRD v1.1, section 1A); its sizes stay in docs/DATA.md.
 */

import type { DistrictId } from '@gg/shared';
import { haPerSquare } from '../grid';

/** Typical farm sizes for each district, ha: small, medium, large. */
export const FARM_SIZES: Readonly<Record<DistrictId, readonly [number, number, number]>> = {
  cq: [1000, 4000, 12000],
  nsw: [300, 1000, 3000],
  cw: [500, 2000, 6000],
  wv: [200, 600, 1500],
};

/**
 * How big a farm's squares are. The grid is always 40 by 26, so a bigger
 * farm has bigger squares.
 */
export interface FarmScale {
  /** The whole farm, ha. */
  farmHa: number;
  /** Hectares in one square. */
  haPerSquare: number;
  /** Metres along one side of a square. One fence or pipe segment is this long. */
  sideM: number;
}

/** The scale of a farm of the given size. */
export function farmScale(farmHa: number): FarmScale {
  const ha = haPerSquare(farmHa);
  return { farmHa, haPerSquare: ha, sideM: Math.sqrt(ha * 1e4) };
}
