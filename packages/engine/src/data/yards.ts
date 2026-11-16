/**
 * The saleyard behind each district (PRD 5.14).
 *
 * A district's cattle prices and cattle sale days come from its cattle
 * yard. Sheep have their own yard where the district has one. The sheep
 * tables are pulled but not read yet: they wait for the sheep milestone.
 */

import type { DistrictId } from '@gg/shared';

/** The yards the game has tables for, by the code MLA's service uses. */
export const YARDS = {
  GME: { name: 'CQLX Gracemere', state: 'QLD' },
  ARM: { name: 'Armidale', state: 'NSW' },
  DUB: { name: 'Dubbo', state: 'NSW' },
  MTL: { name: 'Mortlake', state: 'VIC' },
  HAM: { name: 'Hamilton', state: 'VIC' },
} as const;
export type YardId = keyof typeof YARDS;

/** What is sold. Sale days and prices are kept by species. */
export type SaleSpecies = 'cattle' | 'sheep';

/**
 * Each district's yards. `sheep` is null where the district has no sheep
 * (Central Queensland, PRD section 21 row 24) or where no sheep yard has
 * been chosen and pulled yet (Northern Tablelands).
 */
export const DISTRICT_YARDS: Readonly<
  Record<DistrictId, { cattle: YardId; sheep: YardId | null }>
> = {
  cq: { cattle: 'GME', sheep: null },
  nsw: { cattle: 'ARM', sheep: null },
  cw: { cattle: 'DUB', sheep: 'DUB' },
  wv: { cattle: 'MTL', sheep: 'HAM' },
};
