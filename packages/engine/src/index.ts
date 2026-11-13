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

// First light and last light for a place and a date (milestone 1.5).
export { clockText, daylightFor, durationText, utcOffsetMinutes } from './daylight/daylight';
export type { Daylight, Place } from './daylight/daylight';
export { DISTRICT_PLACES } from './daylight/places';

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

export { averageYear } from './season/factors';
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
// Milestone 1.4: real years and growth from real weather. The weather
// tables themselves are read by server code only (`@gg/engine/server`).
export {
  dateOfSerial,
  daySerial,
  isoDate,
  parseWeatherTable,
  tableDays,
  tableIndex,
  tableLast,
} from './season/weatherTable';
export type { WeatherTable } from './season/weatherTable';
export {
  SCALING_YEARS,
  SOIL_WATER,
  WEATHER_FACTOR_CEILING,
  buildWeatherGrowth,
  soilWaterDay,
  soilWaterTally,
  waterIndex,
} from './season/weatherGrowth';
export type { SoilWater, SoilWaterTally, WeatherGrowth } from './season/weatherGrowth';
export { FIRST_REAL_YEAR, isLeapYear, planRealYears, playableYears } from './season/realYears';
export type { RealYearPlan, RealYearPlanOptions, YearOrder } from './season/realYears';
export {
  SEASON_LABEL_EDGES,
  SEASON_WINDOW_DAYS,
  seasonLabel,
  weatherSeasons,
  weatherYears,
} from './season/weatherSeasons';
export type { WeatherSeasons, WeatherSeasonsOptions } from './season/weatherSeasons';

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
  GrazingArea as TopologyArea,
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

// Milestone 1.2c: the whole farm (state, the daily tick, money, actions, saves).
export {
  COSTS,
  COST_PER_M,
  COW_CALF_FREIGHT,
  DIFFICULTY,
  HEAD_FEE,
  HERD_CASH_SHARE,
  INFRA_WORTH_SHARE,
  INTEREST,
  OVERHEADS,
  PASTURE_ASSET_SHARE,
  PORTABLE_RESALE_SHARE,
  SELL_COMMISSION,
  carryingCapacityAE,
  cashBase,
  overheadsPerYear,
  segmentCost,
  startMoney,
} from './money/costs';
export type { Difficulty, PerMetreItem, StartMoney } from './money/costs';
export {
  SCORE,
  closeYear,
  infraInPlace,
  liveYear,
  netWorth,
  netWorthParts,
  newYear,
  scoreYear,
  spend,
  stockWorth,
  tapeOwned,
} from './money/worth';

export {
  BULL_PRICE,
  PREG_PREMIUM,
  bullPrice,
  buyPrice,
  centsPerKg,
  estimateBuy,
  netSaleValue,
  saleValue,
} from './market/prices';
export type { PriceSource, Priced, Prices } from './market/prices';
export {
  CLASS_MULTIPLIERS,
  STAND_IN_DAILY,
  STAND_IN_FIRST_YEAR,
  STAND_IN_SERIES,
  STAND_IN_WALK,
  standInMarket,
} from './market/standIn';
export type { StandInMarket } from './market/standIn';

export { INBOX_LIMIT, PLAY_STREAMS, PRICE_HISTORY_DAYS, cloneFarm, emptyLedger } from './sim/state';
export type {
  FarmMob,
  FarmState,
  GameOverReason,
  InboxMessage,
  InfraLedger,
  LoggedAction,
  MarketState,
  MobWhere,
  PlayStream,
  PriceDay,
  SeasonSpec,
  YearRecord,
  YearScore,
  YearTotals,
} from './sim/state';
export type {
  ActionEvent,
  FarmEvent,
  FarmStarted,
  MobPlaceNote,
  StartHerd,
  TickEvent,
} from './sim/events';
export { HERD_STREAM, START_HERD_SHARE, createFarm, startHerd } from './sim/create';
export type { CreateFarmOptions, FarmSizeName } from './sim/create';
export {
  areaIdOf,
  areaNameOf,
  placeAnchor,
  plantingsNow,
  pricesOf,
  seasonsOf,
  surveyOf,
} from './sim/derived';
export type { SourceEnv } from './sim/derived';
export { autoWeanDest, defaultSupplement, mergeShared, newMob, splitMobs } from './sim/mobs';
export { stopsToday } from './sim/plans';
export {
  BREAKOUT_CHANCE,
  BREAKOUT_COOLDOWN_DAYS,
  BREAKOUT_FEED_SHARE,
  BREAKOUT_SIZE,
  EATEN_OUT_DAYS,
  EATEN_OUT_KG,
  stepDay,
} from './sim/tick';
export type { DayResult, TickEnv } from './sim/tick';
export {
  calibrationView,
  farmTotals,
  mobSummaries,
  paddockSummaries,
  pregTests,
} from './sim/summary';
export type {
  CalibrationView,
  FarmTotals,
  MobSummary,
  PaddockView,
  PregTestResult,
} from './sim/summary';

export { MAX_BUY, applyAction } from './actions/apply';
export type { ActionEnv } from './actions/apply';
export type {
  Action,
  ActionDone,
  ActionRefusal,
  ActionRefusalReason,
  ActionResult,
  ActionType,
  FenceKind,
  MoveTarget,
} from './actions/types';

export { farmHash, fromBase64, loadFarm, saveFarm, toBase64 } from './save/save';
export type { SavedFarm } from './save/save';
