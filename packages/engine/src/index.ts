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

// Milestone 1.2b: the farm (paddocks, fences, water, crops and farm layout).
export { FARM_SIZES, farmScale } from './data/farms';
export type { FarmScale } from './data/farms';
export {
  BRASSICA_CURVE,
  SPECIES,
  SPECIES_IDS,
  SUMMER_CURVE,
  WINTER_CURVE,
  speciesCurve,
} from './data/species';
export type { Species, SpeciesId, SpeciesType } from './data/species';
export {
  ARABLE_SHARES,
  CONVERT_COST_PER_HA,
  CROP_DISTRICT_FACTORS,
  LAND_OPTIONS,
  ROTATIONS,
} from './data/crops';
export type { ArableShare } from './data/crops';

export {
  EDGE,
  PADDOCK_BLOCK,
  STOCK_BLOCK,
  areaChanges,
  areaEdges,
  buildTopology,
  cloneFences,
  createFences,
  edgeOnFarm,
  flood,
  getEdge,
  hEdge,
  hIdx,
  labelSquare,
  vEdge,
  vIdx,
} from './farm/topology';
export type {
  AreaChanges,
  EdgeCode,
  EdgeRef,
  FenceType,
  Fences,
  GrazingArea,
  Paddock,
  Topology,
} from './farm/topology';
export {
  NO_WATER_DISTANCE,
  PORTABLE_CAPACITY_L,
  PORTABLE_LOW_SHARE,
  areaWatered,
  cloneWater,
  createWater,
  drainPortables,
  hubCells,
  pipeReach,
  vertexId,
  waterNeedPerHead,
  waterPoints,
  waterSeasonFactor,
} from './farm/water';
export type { PortableDrain, PortableTrough, Water, WaterEvent, WaterPoints } from './farm/water';
export {
  buildFence,
  canTrough,
  fenceLine,
  fixFence,
  knockDownTape,
  layPipe,
  movePortable,
  moveTrough,
  pipeLine,
  placeFenceHub,
  placeGate,
  placePortable,
  placeSquareHub,
  placeTrough,
  refillPortable,
  removeFence,
  removeGate,
  removeHub,
  removePortable,
  removeTrough,
  setGate,
  surveyLayout,
  tapeRun,
  toggleGate,
  touchesFence,
  vertexOnFence,
} from './farm/layout';
export type {
  Done,
  EdgeTally,
  FarmLayout,
  FenceBuilt,
  FenceEffect,
  FenceFixed,
  FenceHubPlaced,
  FenceLine,
  FenceRemoved,
  GatePlaced,
  GateRemoved,
  GateSet,
  HubRemoved,
  Outcome,
  PipeLaid,
  PortableMoved,
  PortablePlaced,
  PortableRefilled,
  PortableRemoved,
  Refusal,
  RefusalReason,
  SquareHubPlaced,
  Survey,
  TroughMoved,
  TroughPlaced,
  TroughRemoved,
  Vertex,
} from './farm/layout';
export {
  BUILDING_CLEAR_OF_BORE,
  GENERATION_STREAMS,
  genBore,
  genFertility,
  generateFarm,
  layRunning,
  layScratch,
  placeBuildings,
  runUpPasture,
} from './farm/generate';
export type {
  FarmBuildings,
  FarmOptions,
  GeneratedFarm,
  StartImprovements,
  StartLayout,
  StartType,
} from './farm/generate';

export {
  addField,
  cloneCropState,
  createCropState,
  cropGrazed,
  cropRisks,
  endField,
  fieldAt,
  fieldById,
  fieldProgress,
  fieldState,
  fieldYield,
  harvestField,
  plantingsOn,
  sow,
  sowInfo,
  squareGrazed,
} from './crops/fields';
export type {
  AddFieldOptions,
  CropContext,
  CropRefusal,
  CropRefusalReason,
  CropRisk,
  CropState,
  Field,
  FieldProgress,
  FieldYield,
  GrazeDamageEvent,
  Harvested,
  Regen,
  SowInfo,
  Sown,
} from './crops/fields';
export {
  CROP_LOST_AFTER_DAYS,
  FORAGE_ENDS_AFTER_DAYS,
  LOCK_UP_WARNING_DAYS,
  SHED_AFTER_DAYS,
  fieldTick,
} from './crops/tick';
export type { CropEvent } from './crops/tick';
export { blobGrow, genArable, startCropping } from './crops/arable';
export type { ArableLand } from './crops/arable';
