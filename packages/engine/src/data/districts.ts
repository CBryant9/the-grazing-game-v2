/**
 * Native pasture figures for the four launch districts.
 *
 * Copied from the MVP's REGIONS table, which was calibrated. A change to any
 * figure here is a model change: record it in docs/DATA.md and re-run
 * calibration. The Top End is left out for now (PRD v1.1, section 1A); its
 * figures stay in docs/DATA.md.
 *
 * Months are 0 for January through 11 for December.
 */

import type { DistrictId } from '@gg/shared';

export interface District {
  id: DistrictId;
  /** Typical native pasture growth, kg DM/ha/day, January to December. */
  g: readonly number[];
  /** Multiplier on the growth curve for the district. */
  scale: number;
  /** The most standing feed the pasture can carry, kg DM/ha, on average soil. */
  bmax: number;
  /** Digestibility (DMD, 0 to 1) of the youngest green leaf. */
  dmdMax: number;
  /** Digestibility of old green leaf. Green feed never falls more than 0.02 below this. */
  dmdMin: number;
  /** Digestibility of dead feed. */
  dmdDead: number;
  /** Crude protein % of the youngest green leaf. */
  cpMax: number;
  /** Months with frost. */
  frost: readonly number[];
  /** Extra green lost to frost each day in a frost month, as a share of green. */
  frostSen: number;
  /** Months the grasses run up to seed. */
  head: readonly number[];
  /** Safe long-term utilisation: the share of yearly growth that can be eaten. */
  util: number;
  /** Peak growth, kg DM/ha/day: the highest month times scale. */
  peak: number;
  /** Typical yearly growth, kg DM/ha: the sum of the months times 30.4 times scale. */
  annual: number;
}

type DistrictFigures = Omit<District, 'id' | 'peak' | 'annual'>;

const FIGURES: Record<DistrictId, DistrictFigures> = {
  cq: {
    g: [42, 46, 34, 15, 6, 2, 1, 1, 2, 6, 18, 32],
    scale: 1,
    bmax: 5500,
    dmdMax: 0.66,
    dmdMin: 0.48,
    dmdDead: 0.5,
    cpMax: 11,
    frost: [5, 6, 7],
    frostSen: 0.012,
    head: [1, 2, 3],
    util: 0.25,
  },
  nsw: {
    g: [34, 31, 25, 16, 7, 2, 1, 3, 10, 24, 33, 37],
    scale: 0.9,
    bmax: 5000,
    dmdMax: 0.7,
    dmdMin: 0.51,
    dmdDead: 0.5,
    cpMax: 14,
    frost: [4, 5, 6, 7],
    frostSen: 0.01,
    head: [10, 11, 0, 1],
    util: 0.35,
  },
  cw: {
    g: [16, 16, 20, 22, 15, 8, 7, 12, 28, 38, 26, 18],
    scale: 0.8,
    bmax: 4500,
    // Tuned down from the MVP's 0.7 in milestone 1.3, so steers gain 115 to
    // 130 kg a year in an average year (docs/CALIBRATION.md, docs/DATA.md).
    dmdMax: 0.68,
    dmdMin: 0.51,
    dmdDead: 0.5,
    cpMax: 14,
    frost: [5, 6, 7],
    frostSen: 0.006,
    head: [9, 10, 11],
    util: 0.3,
  },
  wv: {
    g: [5, 4, 8, 16, 18, 12, 10, 18, 40, 55, 40, 15],
    scale: 1,
    bmax: 5000,
    dmdMax: 0.72,
    dmdMin: 0.52,
    dmdDead: 0.51,
    cpMax: 16,
    frost: [],
    frostSen: 0,
    head: [9, 10, 11, 0],
    util: 0.4,
  },
};

// Peak and yearly growth are worked out the same way the MVP did, in the
// same order, so they come out as the same numbers.
function build(id: DistrictId): District {
  const f = FIGURES[id];
  return {
    id,
    ...f,
    peak: Math.max(...f.g) * f.scale,
    annual: f.g.reduce((a, b) => a + b, 0) * 30.4 * f.scale,
  };
}

export const DISTRICTS: Readonly<Record<DistrictId, District>> = {
  cq: build('cq'),
  nsw: build('nsw'),
  cw: build('cw'),
  wv: build('wv'),
};
