/**
 * The map renderer (PixiJS v8). Built in milestone 1.6.
 *
 * It draws from a farm view: plain numbers the server sends. It holds no
 * game rules. The picture must match the model (docs/VISUALS.md).
 *
 * This file loads PixiJS. Load it only on pages that draw the map, and load
 * it lazily. The side-view pasture picture needs no PixiJS: import it from
 * `@gg/render/sward`.
 */

export { createFarmMap } from './map';
export type { PickablePaddock } from './pickable';
export type {
  BenchOptions,
  ContractorFence,
  FarmMap,
  FarmMapOptions,
  MapDragEvent,
  MapEvents,
  MapFenceTapEvent,
  MapPointerEvent,
  MapStats,
  MapTool,
  MapToolTapEvent,
} from './map';

export {
  FARM_MARGIN,
  MAX_ZOOM,
  clampCamera,
  clampZoom,
  containZoom,
  fillHeightZoom,
  fitFarm,
  lookAt,
  minZoom,
  panBy,
  pinch,
  screenToWorld,
  visibleWorld,
  worldToScreen,
  zoomAt,
} from './camera';
export type { Camera, FitMode, Point, ScreenInset, Viewport } from './camera';

export { GRID_H, GRID_N, GRID_W, GROUND_SQUASH, WORLD_H, WORLD_W } from './grid';
export { LOD_FADE_MS, LOD_SLACK, LOD_SWITCH_PX_PER_SQUARE, fadeStep, lodMode } from './lod';
export type { LodMode } from './lod';
export { hitTest, squareAtScreen, squareAtWorld } from './hit';
export type { MapHit } from './hit';

export { DEFAULT_LAYERS, MAP_LAYER_IDS, MAP_LAYER_INFO, toggleLayer, withLayers } from './layers';
export type { MapLayerId, MapLayerInfo, MapLayers } from './layers';

export { lightTint, mapTint, weatherTint } from './light';
export type { MapWeather, MapWeatherKind } from './light';

export { CATTLE, NATURAL, THEMES, breedFor, paletteFor } from './palette';
export type { CattleBreed, MapPalette, MapTheme, ThemeColours } from './palette';

export {
  MAX_DRAWN_CROWDED,
  MAX_DRAWN_PER_SQUARE,
  MAX_SHARE_OF_AREA,
  SMALL_AREA_SQUARES,
  SPREAD_PER_SQUARE,
  STAND_BACK,
  placeCattle,
  placementKey,
} from './cattle';
export type { Beast, BodyShape, MobPlacement, PlacementOptions } from './cattle';

export {
  SHEEP_MAX_CROWDED,
  SHEEP_MAX_PER_SQUARE,
  SHEEP_SPREAD_PER_SQUARE,
  SHEEP_STAND_BACK,
  SHEEP_YARDS_DRAWN,
  placeSheep,
  sheepPlacementKey,
} from './sheep';
export type { FlockPlacement, Sheep } from './sheep';
export { SHEEP } from './palette';
export type { SheepColours } from './palette';
export { LINE_PATTERN } from './linestyle';
export type { LinePattern, LineStyleId } from './linestyle';

export { squareLook, squareTufts, TUFTS_PER_SQUARE } from './grass';
export type { SquareLook, Tuft } from './grass';

export { STRUGGLE, frameStats, struggling } from './bench';
export type { BenchResult, FrameStats } from './bench';

export { SpriteRegistry, packAtlas } from './sprites/registry';
export type { SpriteDef } from './sprites/registry';
export { cattleSprite, defaultSprites, sheepSprite } from './sprites/painters';

export { drawSward, swardCaption, swardParts, swardPlan } from './sward';
export type { SwardPart, SwardPictureOptions, SwardPlan } from './sward';

export {
  CORNERS_ACROSS,
  TOUCH_PX,
  cornerJoinsFence,
  cornerVertex,
  edgeBetween,
  edgeKey,
  edgesAtCorner,
  edgesOfPath,
  extendPath,
  extendSquares,
  fenceCodeAt,
  isDownCode,
  isTapeCode,
  nearestCorner,
  nearestEdge,
  sameCorner,
  sameEdge,
  startPath,
  startSquares,
  tapeRun,
  vertexCorner,
} from './lines';
export type { Corner, CornerHit, EdgeHit } from './lines';

export {
  fenceDraft,
  markDraft,
  markSquares,
  pipeDraft,
  snapDots,
  styleSegments,
  styleSquares,
} from './draft';
export type {
  DraftDot,
  DraftKind,
  DraftSegment,
  DraftSquare,
  DraftStyle,
  MapDraft,
  NotFit,
} from './draft';

export {
  BUILD_GRID,
  fencedCorners,
  fencedEdges,
  gridKindFor,
  gridLines,
  gridStep,
  lengthWords,
  showCornerDots,
} from './buildgrid';
export type { BuildTarget, GridKind } from './buildgrid';
