/**
 * Water: the bore, pipe, troughs, water hubs and portable troughs.
 *
 * Water flows from the bore through pipe, troughs and hubs. A trough can go
 * on any square the water reaches. A hub on a fence line or corner waters
 * the two to four squares that touch it. A portable trough needs no pipe,
 * but it empties and has to be refilled (docs/MODEL.md, section 5).
 *
 * This is the MVP's pipeReach, hubCells, waterUse and the water part of
 * recompute, matched exactly.
 */

import { GRID_H, GRID_N, GRID_W } from '../grid';
import type { Topology } from './topology';

/** Litres in a full portable trough and its tank. */
export const PORTABLE_CAPACITY_L = 6000;
/** A portable trough gives its low-water warning below this share of full. */
export const PORTABLE_LOW_SHARE = 0.25;
/** The distance-to-water figure for a square whose grazing area has no water. */
export const NO_WATER_DISTANCE = 999;

export interface PortableTrough {
  id: number;
  /** The square it stands on. */
  cell: number;
  /** Litres left. */
  level: number;
  /** True once the low-water warning has gone out. Refilling clears it. */
  warned: boolean;
  /** Litres drawn from it on the last day it was used. */
  lastUse: number;
}

export interface Water {
  /** The square the bore is on. */
  bore: number;
  /** 1 where pipe is laid, for each square. */
  pipe: Uint8Array;
  /** Squares with a fixed trough, in the order they were put in. */
  troughs: number[];
  /** Grid corners with a fence-line hub (see vertexId), in the order they were built. */
  hubs: number[];
  /** Portable troughs, in the order they were set up. */
  ports: PortableTrough[];
  /** The id the next portable trough gets. */
  nextPortId: number;
}

/** A farm's water before anything is built: the bore alone. */
export function createWater(bore: number): Water {
  return { bore, pipe: new Uint8Array(GRID_N), troughs: [], hubs: [], ports: [], nextPortId: 1 };
}

export function cloneWater(w: Water): Water {
  return {
    bore: w.bore,
    pipe: w.pipe.slice(),
    troughs: w.troughs.slice(),
    hubs: w.hubs.slice(),
    ports: w.ports.map((p) => ({ ...p })),
    nextPortId: w.nextPortId,
  };
}

/** The id of the grid corner at column line `vx` (0 to GRID_W) and row line `vy` (0 to GRID_H). */
export const vertexId = (vx: number, vy: number): number => vy * (GRID_W + 1) + vx;

/** True if the id is a grid corner on the farm. */
export const vertexOnFarm = (v: number): boolean =>
  Number.isInteger(v) && v >= 0 && v < (GRID_W + 1) * (GRID_H + 1);

/** True if the number is a square on the farm. */
export const cellOnFarm = (i: number): boolean => Number.isInteger(i) && i >= 0 && i < GRID_N;

/** The squares that touch a grid corner: up to four. */
export function hubCells(v: number): number[] {
  const vx = v % (GRID_W + 1);
  const vy = Math.floor(v / (GRID_W + 1));
  const out: number[] = [];
  for (const [x, y] of [
    [vx - 1, vy - 1],
    [vx, vy - 1],
    [vx - 1, vy],
    [vx, vy],
  ] as const) {
    if (x >= 0 && x < GRID_W && y >= 0 && y < GRID_H) out.push(y * GRID_W + x);
  }
  return out;
}

/**
 * The squares water reaches: 1 where a trough could go. Water starts at the
 * bore and flows along pipe and through troughs and hubs, square to square.
 * A hub links all the squares it touches.
 */
export function pipeReach(water: Water): Uint8Array {
  const node = new Uint8Array(GRID_N);
  const hubOf = new Map<number, number[]>();
  for (let i = 0; i < GRID_N; i++) if (water.pipe[i]) node[i] = 1;
  for (const t of water.troughs) node[t] = 1;
  node[water.bore] = 1;
  for (const v of water.hubs) {
    for (const c of hubCells(v)) {
      node[c] = 1;
      let list = hubOf.get(c);
      if (!list) hubOf.set(c, (list = []));
      list.push(v);
    }
  }
  const r = new Uint8Array(GRID_N);
  const st = [water.bore];
  r[water.bore] = 1;
  while (st.length) {
    const i = st.pop()!;
    const x = i % GRID_W;
    const nb = [
      x < GRID_W - 1 ? i + 1 : -1,
      x > 0 ? i - 1 : -1,
      i + GRID_W < GRID_N ? i + GRID_W : -1,
      i - GRID_W >= 0 ? i - GRID_W : -1,
    ];
    const hubs = hubOf.get(i);
    if (hubs) for (const v of hubs) nb.push(...hubCells(v));
    for (const j of nb) {
      if (j >= 0 && node[j] && !r[j]) {
        r[j] = 1;
        st.push(j);
      }
    }
  }
  return r;
}

/** Where stock can drink, for the current fences and water. */
export interface WaterPoints {
  /** The watered squares in each paddock, by paddock id. */
  paddockTroughs: number[][];
  /** The watered squares in each grazing area, by area id. An empty list means no water. */
  areaTroughs: number[][];
  /**
   * For each square, the straight-line distance in squares to the nearest
   * watered square in its grazing area. 999 where the area has no water.
   * Multiply by the farm's `sideM` for metres.
   */
  dist: Float32Array;
}

/**
 * Work out the watered squares and the distance to water. Fixed troughs
 * come first, then the squares each hub touches, then portable troughs that
 * still hold water.
 */
export function waterPoints(topology: Topology, water: Water): WaterPoints {
  const collect = (of: Int16Array, count: number): number[][] => {
    const lists: number[][] = Array.from({ length: count }, () => []);
    for (const t of water.troughs) lists[of[t]!]!.push(t);
    for (const v of water.hubs) {
      for (const c of hubCells(v)) {
        const list = lists[of[c]!]!;
        if (!list.includes(c)) list.push(c);
      }
    }
    for (const pt of water.ports) {
      const list = lists[of[pt.cell]!]!;
      if (pt.level > 0 && !list.includes(pt.cell)) list.push(pt.cell);
    }
    return lists;
  };
  const paddockTroughs = collect(topology.paddockOf, topology.paddocks.length);
  const areaTroughs = collect(topology.areaOf, topology.areas.length);
  const dist = new Float32Array(GRID_N);
  for (const r of topology.areas) {
    const troughs = areaTroughs[r.id]!;
    for (const i of r.cells) {
      let d = NO_WATER_DISTANCE;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      for (const t of troughs) {
        const dd = Math.hypot(x - (t % GRID_W), y - ((t / GRID_W) | 0));
        if (dd < d) d = dd;
      }
      dist[i] = d;
    }
  }
  return { paddockTroughs, areaTroughs, dist };
}

/** True if stock in the grazing area can drink. */
export const areaWatered = (points: WaterPoints, areaId: number): boolean =>
  points.areaTroughs[areaId]!.length > 0;

/** How much more stock drink in summer (December to February) and less in winter (June to August). */
export function waterSeasonFactor(month: number): number {
  return month === 11 || month <= 1 ? 1.3 : month >= 5 && month <= 7 ? 0.8 : 1;
}

/**
 * Litres one beast drinks in a day: 10% of its live weight, more in summer
 * and less in winter. Add these up, beast by beast, for a grazing area's need.
 */
export function waterNeedPerHead(liveWeightKg: number, month: number): number {
  return liveWeightKg * 0.1 * waterSeasonFactor(month);
}

export type WaterEvent =
  /** A portable trough ran dry today. Stock that relied on it have no water. Stop the clock. */
  | { type: 'portable-empty'; portId: number; cell: number }
  /** A portable trough is under a quarter full. Sent once until it is refilled. */
  | { type: 'portable-low'; portId: number; cell: number; pct: number; daysLeft: number };

export interface PortableDrain {
  /** The water with the day's use taken off the portable troughs. */
  water: Water;
  events: WaterEvent[];
  /** True if a trough ran dry, so the watered squares must be worked out again. */
  changed: boolean;
}

/**
 * A day's drinking from the portable troughs. Stock share the watered
 * squares they can reach, so each portable trough gives up the area's need
 * divided by the number of watered squares in the area. `needLitres` gives
 * the day's need of the stock on pasture in a grazing area (see
 * waterNeedPerHead). `points` is as worked out before today's use.
 */
export function drainPortables(
  water: Water,
  topology: Topology,
  points: WaterPoints,
  needLitres: (areaId: number) => number,
): PortableDrain {
  const next = cloneWater(water);
  const events: WaterEvent[] = [];
  let changed = false;
  for (const pt of next.ports) {
    if (pt.level <= 0) {
      pt.lastUse = 0;
      continue;
    }
    const area = topology.areaOf[pt.cell]!;
    const need = needLitres(area);
    const use = need / (points.areaTroughs[area]!.length || 1);
    pt.lastUse = use;
    pt.level -= use;
    if (pt.level <= 0) {
      pt.level = 0;
      changed = true;
      events.push({ type: 'portable-empty', portId: pt.id, cell: pt.cell });
    } else if (pt.level < PORTABLE_CAPACITY_L * PORTABLE_LOW_SHARE && !pt.warned && use > 0) {
      pt.warned = true;
      events.push({
        type: 'portable-low',
        portId: pt.id,
        cell: pt.cell,
        pct: Math.round((pt.level / PORTABLE_CAPACITY_L) * 100),
        daysLeft: Math.max(1, Math.floor(pt.level / use)),
      });
    }
  }
  return { water: next, events, changed };
}
