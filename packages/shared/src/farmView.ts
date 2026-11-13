/**
 * The farm view: the plain numbers the server hands the browser to draw a
 * farm from (PRD 5.16).
 *
 * It holds what the map draws and nothing more. No formulas, no data
 * tables, no prices, no random number state and nothing about days to come.
 * Everything in it is JSON: numbers, strings, true or false, lists and
 * plain records.
 *
 * The engine builds it (`farmView` in `@gg/engine`). The map renderer
 * (`@gg/render`) reads it. Nothing here may reveal a game rule.
 */

import type { DistrictId, PaddockLabelId } from './index';

/**
 * The version of the view's shape. It goes up whenever a field is added,
 * removed or changes meaning, so a browser holding an old map can tell.
 */
export const FARM_VIEW_VERSION = 2;

/** Every farm is this many squares, whatever its size in hectares. */
export const FARM_GRID_W = 40;
export const FARM_GRID_H = 26;
export const FARM_GRID_N = FARM_GRID_W * FARM_GRID_H;

/** What a square is used for (`squares.land`). */
export const VIEW_LAND = {
  /** Native pasture. */
  native: 0,
  /** Sown perennial pasture. */
  sown: 1,
  /** Annual pasture or forage crop. */
  annual: 2,
  /** Grain crop. */
  crop: 3,
  /** Fallow: bare worked soil after a crop. */
  fallow: 4,
  /** Stubble: dry straw left after harvest. */
  stubble: 5,
} as const;
export type ViewLand = (typeof VIEW_LAND)[keyof typeof VIEW_LAND];

/** What sits on a line between two squares (`fences.h` and `fences.v`). */
export const VIEW_FENCE = {
  none: 0,
  /** The farm boundary. */
  boundary: 1,
  permanent: 2,
  electric: 3,
  /** Temporary tape, standing. */
  tape: 4,
  /** Electric fence knocked down. */
  electricDown: 5,
  /** Tape lying down. */
  tapeDown: 6,
  /** A gate. Whether it is open, and what kind it is, is in `gates`. */
  gate: 7,
} as const;
export type ViewFence = (typeof VIEW_FENCE)[keyof typeof VIEW_FENCE];

/** The neutral paddock labels, in the order `squares.label` counts them. */
export const VIEW_LABELS: readonly PaddockLabelId[] = ['green', 'mixed', 'rank', 'short'];

/** One line between two squares. */
export interface ViewEdge {
  /** `h` runs along the top or bottom of a square, `v` down its side. */
  line: 'h' | 'v';
  /**
   * `h`: row line (0 to 26) times 40, plus the column.
   * `v`: row (0 to 25) times 41, plus the column line (0 to 40).
   */
  index: number;
}

/**
 * What the map draws on each square. Every list has one whole number for
 * each of the 1,040 squares, row by row from the top left.
 */
export interface FarmViewSquares {
  /** Land use (see VIEW_LAND). */
  land: number[];
  /** Standing height of the feed, cm, 0 to 90. */
  heightCm: number[];
  /** Green share of the standing feed, in twentieths: 0 is all dry, 20 is all green. */
  green: number[];
  /** Ground cover, in tenths: 0 is bare, 10 is fully covered. */
  cover: number[];
  /** How old the green leaf looks, 0 (young) to 10 (old). */
  leafAge: number[];
  /** How weathered the dry feed looks, 0 (fresh straw) to 10 (grey). */
  weathered: number[];
  /** 1 where seed heads show. */
  seedHeads: number[];
  /** The neutral label for the square on its own (an index into VIEW_LABELS). */
  label: number[];
  /** The planting on the square: 0 for none, otherwise its place in `plantings` plus 1. */
  planting: number[];
  /** Energy of the diet there, in tenths of a MJ/kg DM (87 is ME 8.7). For the pasture quality layer. */
  me10: number[];
  /** Recent grazing, 0 (none) to 10 (heavy). For the recently grazed layer. */
  grazed: number[];
  /** Distance to water in hundreds of metres, or -1 where stock there have no water. */
  waterDist: number[];
  /** 1 where the land is arable. */
  arable: number[];
  /** The paddock each square is in (an id in `paddocks`). */
  paddock: number[];
  /** The grazing area each square is in (an id in `areas`). */
  area: number[];
}

/** Every fence line on the farm, as VIEW_FENCE codes. */
export interface FarmViewFences {
  /** Lines along the top and bottom of squares: 27 rows of 40. */
  h: number[];
  /** Lines down the sides of squares: 26 rows of 41. */
  v: number[];
}

/** Gate types (PRD 5.13). Only swing gates exist until the gate types are built. */
export type ViewGateKind = 'swing' | 'wire' | 'tape';

export interface FarmViewGate extends ViewEdge {
  open: boolean;
  kind: ViewGateKind;
}

export interface FarmViewTrough {
  kind: 'fixed' | 'portable';
  /** The square it stands on. */
  cell: number;
  /** A portable trough's id. 0 for a fixed trough. */
  id: number;
  /** How full it is, %. A fixed trough is always 100. */
  levelPct: number;
}

export interface FarmViewWater {
  /** The square the bore is on. */
  bore: number;
  /** Squares with pipe that is joined to the bore. */
  pipe: number[];
  /** Squares with pipe that is not joined to the bore. */
  pipeDry: number[];
  troughs: FarmViewTrough[];
  /** Water hubs on a fence line or corner, by grid corner: row line times 41, plus the column line. */
  hubs: number[];
}

/** Buildings. Sheds, silos and feed bins arrive in a later milestone. */
export type ViewBuildingKind = 'homestead' | 'yards' | 'shed' | 'silo' | 'feedBin';

export interface FarmViewBuilding {
  kind: ViewBuildingKind;
  /** The square it stands on. */
  cell: number;
}

/**
 * A pasture in profile: the figures the side-view picture is drawn from.
 *
 * They are rounded to what a paddock sheet shows and no finer, so one
 * figure can't be worked back from the others.
 */
export interface FarmViewSward {
  /** Standing feed, kg DM/ha, to the nearest 10. */
  massKgHa: number;
  /** Green feed and dead feed, kg DM/ha, each to the nearest 10. */
  greenKgHa: number;
  deadKgHa: number;
  /** Standing height, whole cm. */
  heightCm: number;
  /** How high the green leaf reaches, whole cm. */
  leafCm: number;
  /** Green share of the feed, whole %. */
  greenPct: number;
  /** Ground cover, whole %. */
  coverPct: number;
  /** The share of the dry stems that carry a seed head, in tenths. 0 where no seed heads show. */
  seedHeads: number;
  /** How old the green leaf looks, 0 (young) to 10 (old). */
  leafAge: number;
}

/** One kind of country inside a paddock, for split side-view pictures. */
export interface FarmViewPart {
  kind: 'pasture' | 'crop' | 'stubble' | 'fallow';
  ha: number;
  /** The main planting on it (its place in `plantings`), or -1. */
  planting: number;
  sward: FarmViewSward;
}

export interface FarmViewPaddock {
  id: number;
  /** "Paddock 1", "Paddock 2" and so on. */
  name: string;
  ha: number;
  /** The square nearest its middle, where its label goes. */
  labelCell: number;
  /** The grazing area it is part of. */
  area: number;
  /** The neutral label: Green, Mixed, Dry & rank or Short. */
  label: PaddockLabelId;
  /** 'own' for a water point in the paddock, 'gate' for water through an open gate, 'none'. */
  water: 'own' | 'gate' | 'none';
  /** The mobs grazing it, by id. */
  mobs: number[];
  sward: FarmViewSward;
  /** Its kinds of country, when it has more than one (crop beside pasture, say). Otherwise empty. */
  parts: FarmViewPart[];
}

/** What stock can reach: one paddock, or several joined by open gates. */
export interface FarmViewArea {
  id: number;
  name: string;
  ha: number;
  labelCell: number;
  paddocks: number[];
  hasWater: boolean;
}

export type ViewPlantingKind = 'pasture' | 'annual' | 'crop';
/**
 * Where a planting is up to today. Perennial pasture: `est` then `ok`.
 * Annuals and crops: `none`, `est`, `veg`, `lock`, `head`, `done`.
 */
export type ViewPlantingStage = 'est' | 'ok' | 'none' | 'veg' | 'lock' | 'head' | 'done';

export interface FarmViewPlanting {
  id: number;
  /** Its short name, for a label: "oats". The screen sets the capital. */
  name: string;
  kind: ViewPlantingKind;
  stage: ViewPlantingStage;
  /** How many squares it covers. */
  squares: number;
  /** The square nearest its middle. */
  labelCell: number;
  /** True for a stand that came back from seed. */
  selfSown: boolean;
  /** True for a species sown into native pasture, which gets no label of its own. */
  oversown: boolean;
  /** True when the crop can be harvested today. */
  ready: boolean;
}

export type ViewCattleKind = 'cow' | 'heifer' | 'steer' | 'bull' | 'calf';

/** The cattle of one kind in a mob, with how many look thin and how many look fat. */
export interface FarmViewCattle {
  kind: ViewCattleKind;
  n: number;
  thin: number;
  fat: number;
}

export interface FarmViewMob {
  id: number;
  name: string;
  /** On pasture, in the stock yards, or in the feedlot (never drawn on the map). */
  where: 'paddock' | 'yards' | 'lot';
  /** The grazing area it is on, or -1 off pasture. */
  area: number;
  /** The square it was put on, or -1 off pasture. */
  anchor: number;
  /** Head, not counting calves. */
  head: number;
  calves: number;
  /** Adult equivalents. */
  ae: number;
  /** Head in each class, by the class's id. */
  classes: Record<string, number>;
  /** The mob by kind, for the map to draw. */
  cattle: FarmViewCattle[];
  /**
   * A number the map uses to stand each beast in the same place every time.
   * It comes from the mob's id alone and says nothing about the farm.
   */
  seed: number;
  /** What the map pins need. */
  status: {
    noWater: boolean;
    /** Days in a row without water. */
    dryDays: number;
    /** Bull calves and young bulls waiting to be marked. */
    toMark: number;
  };
}

/**
 * A job under way, such as a half-built fence line. Jobs arrive in a later
 * milestone. The field is here so the map can be built to expect it.
 */
export interface FarmViewJob {
  id: number;
  kind: 'fence';
  /** What is being built (a VIEW_FENCE code). */
  fence: number;
  /** The whole line, in the order it is being built. */
  edges: ViewEdge[];
  /** How much of it is done, 0 to 1. */
  done: number;
  /** Who is building it. */
  by: 'farmer' | 'team';
}

export interface FarmView {
  viewVersion: number;
  district: DistrictId;
  /** The farm day. Day 0 is the farm's first day. */
  day: number;
  /** The calendar date. `month` is 0 for January. */
  date: { year: number; month: number; date: number };
  /** First light and last light today, in minutes after midnight on the farm's clock. */
  light: { first: number; last: number };
  scale: {
    /** The whole farm, ha. */
    farmHa: number;
    /** Hectares in one square. */
    haPerSquare: number;
    /** Metres along one side of a square. */
    sideM: number;
  };
  squares: FarmViewSquares;
  fences: FarmViewFences;
  gates: FarmViewGate[];
  water: FarmViewWater;
  /** Squares with a tree. The model has no trees yet, so this is empty. */
  trees: number[];
  /** The homestead, the stock yards and anything else built. */
  buildings: FarmViewBuilding[];
  paddocks: FarmViewPaddock[];
  areas: FarmViewArea[];
  plantings: FarmViewPlanting[];
  mobs: FarmViewMob[];
  /** Jobs under way. Left out until jobs are built. */
  jobs?: FarmViewJob[];
}
