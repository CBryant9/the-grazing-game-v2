/**
 * The Grazing Game engine.
 *
 * Pure TypeScript, seeded, no DOM. It runs on the server and in tests. It
 * must never be shipped to the browser in anything public (CLAUDE.md, rule 14).
 */

export { ENGINE_VERSION, SAVE_FORMAT_VERSION } from './version';
export { hash32, rngFromState, rngStream } from './rng';
export type { Rng, RngState } from './rng';

export { GRID_H, GRID_N, GRID_W, haPerSquare } from './grid';
export { dateAt, monthIndex } from './calendar';
export type { CalendarDate, FarmStart } from './calendar';

export { DISTRICTS } from './data/districts';
export type { District } from './data/districts';

export { LAND, NEVER_GRAZED, clonePastureState, createPastureState } from './pasture/state';
export type { LandUse, PastureState } from './pasture/state';
export { plantingAt } from './pasture/plantings';
export type {
  Planting,
  PlantingKind,
  PlantingNow,
  PlantingStage,
  Plantings,
} from './pasture/plantings';
export { districtPotential, interpMonth } from './pasture/potential';
export { growGrass } from './pasture/grow';
export type { GrowInputs } from './pasture/grow';
export { cellQuality, meFromDmd } from './pasture/quality';
export type { SquareQuality } from './pasture/quality';
export { PHASE_LABELS, phaseOf } from './pasture/phase';
export type { PhaseId } from './pasture/phase';
export { areaSummary, coverPct, paddockSummary } from './pasture/summary';
export type {
  AreaSummary,
  PaddockStock,
  PaddockSummary,
  PaddockSummaryInputs,
} from './pasture/summary';

export type { GrowthFactorSource, GrowthFactors } from './season/factors';
export {
  PLAY_WOBBLE,
  RUN_UP_DAYS,
  RUN_UP_SEASON_FLOOR,
  RUN_UP_WOBBLE,
  SEASON_OUTLOOKS,
  drawSeason,
  monthFactor,
  randomSeasons,
} from './season/randomSeasons';
export type { MonthWobble, RandomSeasonsOptions, SeasonOutlook } from './season/randomSeasons';
