/**
 * Supplements and the feedlot ration.
 *
 * Copied from the MVP's FEED table and the figures in its intakeOf, which
 * were calibrated. A change to any figure here is a model change: record it
 * in docs/DATA.md and re-run calibration.
 */

/** What a mob in a paddock is being fed on top of the pasture. */
export type Supplement = 'none' | 'lick' | 'hay' | 'pellet';

export const SUPPLEMENTS: readonly Supplement[] = ['none', 'lick', 'hay', 'pellet'];

/** Feed prices, in dollars. */
export const FEED_COST = {
  /** Urea and protein lick, a head a day while diet CP is under 9%. */
  lick: 0.15,
  /** Hay, a kg. */
  hayKg: 0.28,
  /** Pellets, a kg. */
  pelletKg: 0.5,
  /** Feedlot ration, a kg. */
  lotKg: 0.4,
  /** Feedlot yard fee, a head a day. */
  lotYard: 0.35,
} as const;

/** Lick: lifts intake of dry, low-protein feed. Cattle hardly touch it on green feed. */
export const LICK = {
  /** Pasture intake multiplier when diet CP is under 7%. */
  liftUnder7: 1.25,
  /** Pasture intake multiplier when diet CP is 7 to 9%. */
  liftUnder9: 1.08,
  /** Share of the daily cost charged when diet CP is 9% or more. */
  greenFeedShare: 0.2,
} as const;

/** Hay fed out each day. */
export const HAY = {
  /** kg a head a day. Calves get CALF_RATION_SHARE of this. */
  kg: 3,
  /** Energy, ME in MJ/kg DM. */
  me: 8.4,
  /** Crude protein %. */
  cp: 9,
  /** kg of pasture left uneaten for each kg of hay. */
  replaces: 0.5,
} as const;

/** Pellets fed out each day. */
export const PELLETS = {
  /** kg a head a day. Calves get CALF_RATION_SHARE of this. */
  kg: 2,
  /** Energy, ME in MJ/kg DM. */
  me: 12.5,
  /** Crude protein %. */
  cp: 16,
  /** kg of pasture left uneaten for each kg of pellets. */
  replaces: 0.3,
} as const;

/** A calf's share of the lick cost and of the hay or pellet ration. */
export const CALF_RATION_SHARE = 0.4;

/** The feedlot ration. Cattle in the lot eat their fill of it and no pasture. */
export const LOT_RATION = {
  /** Digestibility (DMD) of the ration, used for milk in the lot. */
  dmd: 0.77,
  /** Energy, ME in MJ/kg DM. */
  me: 11.6,
  /** Crude protein %. */
  cp: 14,
  /** A calf's share of a full ration for its weight. */
  calfShare: 0.6,
} as const;
