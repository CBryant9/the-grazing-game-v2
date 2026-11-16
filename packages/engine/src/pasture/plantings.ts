/**
 * Sown pastures, forages and crops, as the grass formulas see them.
 *
 * The crop model itself (sowing, stages, grazing damage, harvest) is
 * milestone 1.2. The grass formulas only need to know what each planting is
 * doing today. That is the "now" record below, which the crop model will
 * work out each day and hand in.
 */

/**
 * Where a planting is up to.
 * Perennial pasture: `est` (establishing) then `ok`.
 * Annuals and crops: `none` (not sown yet), `est`, `veg` (leafy), `lock`
 * (locked up for grain), `head` (heading and ripening), `done` (finished).
 */
export type PlantingStage = 'est' | 'ok' | 'none' | 'veg' | 'lock' | 'head' | 'done';

/** What a planting is doing today. */
export interface PlantingNow {
  stage: PlantingStage;
  /** Growth potential today, kg DM/ha/day, with the month factor already in it. */
  pot: number;
  /** Digestibility of its green feed, 0 to 1. For pasture this is the youngest leaf. */
  dmd: number;
  /** Crude protein % of its green feed. */
  cp: number;
  /** Crude protein % of its dead feed. */
  cpD: number;
  /** The most standing feed it can carry, kg DM/ha, on average soil. */
  bmax: number;
  /** Extra green lost each day as it ripens or finishes, as a share of green. */
  sen: number;
  /** Stand strength of a perennial pasture, 1 until it passes its life. */
  pf?: number;
}

/**
 * The kind of planting. Perennial pasture follows the same rules as native
 * pasture, with its own figures. Annuals and grain crops follow their stages.
 */
export type PlantingKind = 'pasture' | 'annual' | 'crop';

export interface Planting {
  kind: PlantingKind;
  now: PlantingNow;
}

/** Which planting is on each square, and what each planting is doing today. */
export interface Plantings {
  /** The planting on each square, by id. -1 means none. */
  fid: Int16Array;
  /** Stand density on each square. 1 is a full stand. Grazing too early lowers it. */
  density: Float32Array;
  /** Each planting by id. */
  byId: ReadonlyMap<number, Planting>;
}

/** The planting on a square, or null. A farm with no plantings passes null. */
export function plantingAt(plantings: Plantings | null, i: number): Planting | null {
  if (!plantings) return null;
  const id = plantings.fid[i]!;
  return id >= 0 ? (plantings.byId.get(id) ?? null) : null;
}
