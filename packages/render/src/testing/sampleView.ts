/**
 * A hand-made farm view for the renderer's tests.
 *
 * The renderer must never import the engine, so its tests build a view by
 * hand: plain numbers, laid out so each test can say what it expects. Test
 * use only.
 */

import {
  FARM_GRID_H as H,
  FARM_GRID_N as N,
  FARM_GRID_W as W,
  FARM_VIEW_VERSION,
  VIEW_FENCE,
  VIEW_LAND,
  type FarmView,
  type FarmViewMob,
  type FarmViewSward,
} from '@gg/shared';

export const cell = (col: number, row: number): number => row * W + col;
export const hEdge = (vy: number, x: number): number => vy * W + x;
export const vEdge = (y: number, vx: number): number => y * (W + 1) + vx;

export const SWARD: FarmViewSward = {
  massKgHa: 2000,
  greenKgHa: 1200,
  deadKgHa: 800,
  heightCm: 20,
  leafCm: 12,
  greenPct: 60,
  coverPct: 100,
  seedHeads: 0,
  leafAge: 3,
};

/** One square's pasture, in the view's own units. */
export interface SquareSpec {
  land?: number;
  heightCm?: number;
  green?: number;
  cover?: number;
  leafAge?: number;
  weathered?: number;
  seedHeads?: number;
}

export const LEAFY: SquareSpec = { heightCm: 14, green: 18, cover: 10, leafAge: 2, weathered: 1 };
export const RANK: SquareSpec = {
  heightCm: 70,
  green: 4,
  cover: 10,
  leafAge: 9,
  weathered: 7,
  seedHeads: 1,
};
export const SHORT: SquareSpec = { heightCm: 4, green: 12, cover: 4, leafAge: 1, weathered: 0 };
export const FALLOW: SquareSpec = { land: VIEW_LAND.fallow, heightCm: 0, green: 0, cover: 0 };
export const STUBBLE: SquareSpec = { land: VIEW_LAND.stubble, heightCm: 20, green: 0, cover: 10 };

export function mob(over: Partial<FarmViewMob> = {}): FarmViewMob {
  return {
    id: 1,
    name: 'Mob 1',
    where: 'paddock',
    area: 0,
    anchor: cell(5, 5),
    head: 40,
    calves: 0,
    ae: 30,
    classes: { yearlingSteer: 40 },
    cattle: [{ kind: 'steer', n: 40, thin: 0, fat: 0 }],
    seed: 12345,
    status: { noWater: false, dryDays: 0, toMark: 0 },
    ...over,
  };
}

/**
 * A farm with its boundary fence and a fence down the middle (between
 * columns 19 and 20), making two paddocks and two grazing areas: 0 on the
 * left, 1 on the right. The bore is at (2, 2) with a trough at (5, 5). The
 * yards are at (2, 22). Every square starts leafy.
 */
export function sampleView(): FarmView {
  const fill = (v: number): number[] => new Array<number>(N).fill(v);
  const h = new Array<number>((H + 1) * W).fill(VIEW_FENCE.none);
  const v = new Array<number>(H * (W + 1)).fill(VIEW_FENCE.none);
  for (let x = 0; x < W; x++) {
    h[hEdge(0, x)] = VIEW_FENCE.boundary;
    h[hEdge(H, x)] = VIEW_FENCE.boundary;
  }
  for (let y = 0; y < H; y++) {
    v[vEdge(y, 0)] = VIEW_FENCE.boundary;
    v[vEdge(y, W)] = VIEW_FENCE.boundary;
    v[vEdge(y, 20)] = VIEW_FENCE.permanent;
  }
  const paddock = fill(0).map((_, i) => (i % W < 20 ? 0 : 1));
  const view: FarmView = {
    viewVersion: FARM_VIEW_VERSION,
    district: 'nsw',
    day: 10,
    date: { year: 2023, month: 9, date: 11 },
    light: { first: 330, last: 1110 },
    scale: { farmHa: 1040, haPerSquare: 1, sideM: 100 },
    squares: {
      land: fill(VIEW_LAND.native),
      heightCm: fill(LEAFY.heightCm!),
      green: fill(LEAFY.green!),
      cover: fill(LEAFY.cover!),
      leafAge: fill(LEAFY.leafAge!),
      weathered: fill(LEAFY.weathered!),
      seedHeads: fill(0),
      label: fill(0),
      planting: fill(0),
      me10: fill(90),
      grazed: fill(0),
      waterDist: fill(3),
      arable: fill(0),
      paddock,
      area: paddock.slice(),
    },
    fences: { h, v },
    gates: [],
    water: {
      bore: cell(2, 2),
      pipe: [],
      pipeDry: [],
      troughs: [{ kind: 'fixed', cell: cell(5, 5), id: 0, levelPct: 100 }],
      hubs: [],
      squareHubs: [],
    },
    trees: [],
    buildings: [{ kind: 'yards', cell: cell(2, 22) }],
    paddocks: [0, 1].map((id) => ({
      id,
      name: `Paddock ${id + 1}`,
      ha: 520,
      labelCell: cell(id === 0 ? 10 : 30, 13),
      area: id,
      label: 'green' as const,
      water: id === 0 ? ('own' as const) : ('none' as const),
      mobs: [],
      sward: { ...SWARD },
      parts: [],
    })),
    areas: [0, 1].map((id) => ({
      id,
      name: `Paddock ${id + 1}`,
      ha: 520,
      labelCell: cell(id === 0 ? 10 : 30, 13),
      paddocks: [id],
      hasWater: id === 0,
    })),
    plantings: [],
    mobs: [],
  };
  return view;
}

/** Set a square's pasture. */
export function setSquare(view: FarmView, i: number, spec: SquareSpec): void {
  const s = view.squares;
  if (spec.land !== undefined) s.land[i] = spec.land;
  if (spec.heightCm !== undefined) s.heightCm[i] = spec.heightCm;
  if (spec.green !== undefined) s.green[i] = spec.green;
  if (spec.cover !== undefined) s.cover[i] = spec.cover;
  if (spec.leafAge !== undefined) s.leafAge[i] = spec.leafAge;
  if (spec.weathered !== undefined) s.weathered[i] = spec.weathered;
  if (spec.seedHeads !== undefined) s.seedHeads[i] = spec.seedHeads;
}

/** Fence a box of squares off as its own paddock and grazing area. Returns the new id. */
export function fenceBox(
  view: FarmView,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  code: number = VIEW_FENCE.tape,
): number {
  const id = view.paddocks.length;
  for (let x = x0; x <= x1; x++) {
    if (!view.fences.h[hEdge(y0, x)]) view.fences.h[hEdge(y0, x)] = code;
    if (!view.fences.h[hEdge(y1 + 1, x)]) view.fences.h[hEdge(y1 + 1, x)] = code;
  }
  for (let y = y0; y <= y1; y++) {
    if (!view.fences.v[vEdge(y, x0)]) view.fences.v[vEdge(y, x0)] = code;
    if (!view.fences.v[vEdge(y, x1 + 1)]) view.fences.v[vEdge(y, x1 + 1)] = code;
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      view.squares.paddock[cell(x, y)] = id;
      view.squares.area[cell(x, y)] = id;
    }
  }
  const ha = (x1 - x0 + 1) * (y1 - y0 + 1);
  const labelCell = cell(Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2));
  view.paddocks.push({
    id,
    name: `Paddock ${id + 1}`,
    ha,
    labelCell,
    area: id,
    label: 'green',
    water: 'none',
    mobs: [],
    sward: { ...SWARD },
    parts: [],
  });
  view.areas.push({
    id,
    name: `Paddock ${id + 1}`,
    ha,
    labelCell,
    paddocks: [id],
    hasWater: false,
  });
  return id;
}
