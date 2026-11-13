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

export {
  CALF_RATION_SHARE,
  FEED_COST,
  HAY,
  LICK,
  LOT_RATION,
  PELLETS,
  SUPPLEMENTS,
} from './data/feed';
export type { Supplement } from './data/feed';
export {
  BARREN_CHANCE,
  BOUGHT_CALF,
  CLASS_LABELS,
  GROUPS,
  HEALTH_COST_PER_HEAD_YEAR,
  MARKET_CLASSES,
  MARKING,
  SALE_CLASSES,
} from './data/cattle';
export type {
  CattleClassId,
  GroupId,
  MarketClassId,
  Range,
  SaleClass,
  SaleClassId,
} from './data/cattle';
export { animalLookup, createCattleMob, emptyCattleTotals } from './cattle/types';
export type {
  Animal,
  AnimalIds,
  AnimalKind,
  AnimalLookup,
  CattleMob,
  CattleRngs,
  CattleTotals,
  GrazingArea,
  GrazingLand,
  Joining,
  MobDay,
  Sex,
} from './cattle/types';
export {
  DSE_PER_AE,
  aeOf,
  classOf,
  groupKey,
  label,
  makeAnimal,
  makeSaleBatch,
  marketClass,
  stockOn,
  waterNeed,
} from './cattle/animal';
export { LOT_DIET, RESIDUAL, dietOf, grazeAlloc, intakeOf } from './cattle/graze';
export type { Diet, DietResult, GrazeInputs, Intake, PlantingGraze } from './cattle/graze';
export {
  CYCLE_DAYS,
  FEMALES_PER_BULL,
  GESTATION_DAYS,
  LACTATING_CONCEPTION,
  PUBERTY,
  WEAN_MIN_AGE,
  WEAN_TRIGGER_AGE,
  YOUNG_BULL_SHARE,
  anoDays,
  breedingNotes,
  bullCover,
  calve,
  condConc,
  cycling,
  expectedRate,
  joinReport,
  markCalves,
  weanMob,
  weanOne,
  weaningDue,
} from './cattle/breeding';
export type { CalveInputs, MarkResult } from './cattle/breeding';
export { gainOn, gainWhy, milkMJ, predictGains } from './cattle/gains';
export type { CattleNote, GainForecast, GainReason } from './cattle/notes';
export { settleDeaths, simMob } from './cattle/simMob';
export type { Death, DeathCause, MobDayResult, MobPlace, SimMobInputs } from './cattle/simMob';
