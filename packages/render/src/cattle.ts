/**
 * Where each beast stands on the map.
 *
 * The farm does not store where cattle stand: the model has no use for it
 * (LESSONS W3, "the model never reads the picture"). The map works it out
 * from the view, and always the same way, so cattle do not jump about
 * between frames or days for no reason. A mob moves on the map only when
 * something about it changes: it is moved, its numbers change, or a fence,
 * gate or trough in its grazing area changes.
 *
 * The rules, all drawing rules:
 * - Cattle stand inside their grazing area, and never on the wrong side of
 *   a fence (LESSONS 29). They stand back from fence lines.
 * - No beast stands on a square with a trough, the bore or a building.
 * - A mob gathers round the square it was put on (usually water) and spreads
 *   out from there, two to a square.
 * - Big mobs do not hide the pasture (REQUIREMENTS). On open country a mob
 *   stands on no more than four squares in ten of its grazing area, three to
 *   a square at most. Past that it draws a sample of its cattle. The marker
 *   and badge always carry the real head count (PRD 7).
 * - On a small area (a tape cell, say) the mob uses every square, up to six
 *   to a square, so high density looks crowded.
 */

import { VIEW_FENCE, type FarmView, type FarmViewMob, type ViewCattleKind } from '@gg/shared';
import { GRID_H, GRID_N, GRID_W, colOf, hIndex, rowOf, vIndex } from './grid';
import { hash3, scatter, unit } from './random';

/** A mob with room spreads out to about this many to a square. */
export const SPREAD_PER_SQUARE = 2;
/** The most cattle drawn on one square of open country. Past this a mob is sampled. */
export const MAX_DRAWN_PER_SQUARE = 3;
/** The most cattle drawn on one square of a small area, where a crowd should look like one. */
export const MAX_DRAWN_CROWDED = 6;
/** An area of this many squares or fewer is small: the mob may use all of it. */
export const SMALL_AREA_SQUARES = 8;
/** On a bigger area a mob stands on no more than this share of the squares, so the pasture shows. */
export const MAX_SHARE_OF_AREA = 0.4;
/** The most cattle drawn in the stock yards. */
export const YARDS_DRAWN = 14;

/**
 * How far cattle stand back inside a square, as a share of the square.
 * `side` and `top` apply where there is a fence on that side. The top is
 * deeper because a beast is drawn standing up from its feet: any closer to
 * a fence above it and its back would show over the wire.
 */
export const STAND_BACK = { side: 0.3, top: 0.55, bottom: 0.06, open: 0.08 } as const;

export type BodyShape = 'thin' | 'normal' | 'fat';

export interface Beast {
  /** Where its feet are, in ground coordinates. */
  x: number;
  y: number;
  kind: ViewCattleKind;
  shape: BodyShape;
  /** True to draw it facing left. */
  flip: boolean;
}

export interface MobPlacement {
  mob: number;
  /** Head in the mob, calves included. */
  total: number;
  /** The cattle drawn. Fewer than `total` when the mob is sampled. */
  beasts: Beast[];
  sampled: boolean;
  /** The squares the mob stands on. */
  cells: number[];
  /** The middle of the mob, in ground coordinates. The marker goes here. */
  centre: { x: number; y: number };
  /** How far the mob reaches from its middle, in squares. */
  spread: { x: number; y: number };
}

/** True if stock cannot cross a line with this code. Open gates are handled by the caller. */
const stops = (code: number): boolean =>
  code === VIEW_FENCE.boundary ||
  code === VIEW_FENCE.permanent ||
  code === VIEW_FENCE.electric ||
  code === VIEW_FENCE.tape ||
  code === VIEW_FENCE.gate;

/** What the placement needs from a view, worked out once for all its mobs. */
export interface PlacementOptions {
  /**
   * Draw every beast where there is room for it, up to six to a square over
   * the whole area. For the speed test: it hides the pasture.
   */
  everyBeast?: boolean;
}

export interface PlacementGround {
  view: FarmView;
  /** The squares of each grazing area. */
  areaCells: Map<number, number[]>;
  /** 1 on squares no beast may stand on. */
  blocked: Uint8Array;
  /** Open gates, as "h12" or "v340". */
  openGates: Set<string>;
}

export function placementGround(view: FarmView): PlacementGround {
  const areaCells = new Map<number, number[]>();
  for (let i = 0; i < GRID_N; i++) {
    const a = view.squares.area[i] ?? -1;
    let list = areaCells.get(a);
    if (!list) areaCells.set(a, (list = []));
    list.push(i);
  }
  const blocked = new Uint8Array(GRID_N);
  blocked[view.water.bore] = 1;
  for (const t of view.water.troughs) blocked[t.cell] = 1;
  for (const b of view.buildings) blocked[b.cell] = 1;
  const openGates = new Set<string>();
  for (const g of view.gates) if (g.open) openGates.add(g.line + g.index);
  return { view, areaCells, blocked, openGates };
}

/** True if stock can walk from a square to the next one across, down, back or up. */
function canStep(g: PlacementGround, from: number, dx: number, dy: number): boolean {
  const col = colOf(from);
  const row = rowOf(from);
  const f = g.view.fences;
  let line: 'h' | 'v';
  let index: number;
  if (dx !== 0) {
    if (col + dx < 0 || col + dx >= GRID_W) return false;
    line = 'v';
    index = vIndex(row, dx > 0 ? col + 1 : col);
  } else {
    if (row + dy < 0 || row + dy >= GRID_H) return false;
    line = 'h';
    index = hIndex(dy > 0 ? row + 1 : row, col);
  }
  const code = (line === 'h' ? f.h[index] : f.v[index]) ?? 0;
  if (code === VIEW_FENCE.gate) return g.openGates.has(line + index);
  return !stops(code);
}

/**
 * The squares of a grazing area a mob can stand on, nearest first, walking
 * out from `start` without crossing a fence. Squares the same distance away
 * come in an order fixed by the mob's seed.
 */
export function walkOrder(g: PlacementGround, start: number, seed: number): number[] {
  // A step across or down costs 2 and a step on the diagonal 3, so the mob
  // spreads out in a rounded shape, not a diamond.
  const FAR = 1e9;
  const dist = new Int32Array(GRID_N).fill(FAR);
  const queue = [start];
  dist[start] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const d = dist[i]!;
    for (const [dx, dy] of STEPS) {
      let open: boolean;
      if (dx !== 0 && dy !== 0) {
        // A diagonal step needs both ways round the corner to be open.
        open =
          canStep(g, i, dx, 0) &&
          canStep(g, i + dx, 0, dy) &&
          canStep(g, i, 0, dy) &&
          canStep(g, i + dy * GRID_W, dx, 0);
      } else {
        open = canStep(g, i, dx, dy);
      }
      if (!open) continue;
      const j = i + dx + dy * GRID_W;
      const cost = d + (dx !== 0 && dy !== 0 ? 3 : 2);
      if (cost >= dist[j]!) continue;
      dist[j] = cost;
      queue.push(j);
    }
  }
  const reached: number[] = [];
  for (let i = 0; i < GRID_N; i++) if (dist[i]! < FAR && !g.blocked[i]) reached.push(i);
  return reached.sort((a, b) => dist[a]! - dist[b]! || hash3(seed, a, 11) - hash3(seed, b, 11));
}

const STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/** The part of a square cattle may stand in: [x0, y0, x1, y1] in ground coordinates. */
export function standingBox(view: FarmView, square: number): [number, number, number, number] {
  const col = colOf(square);
  const row = rowOf(square);
  const f = view.fences;
  const fenced = (code: number | undefined): boolean => (code ?? 0) !== VIEW_FENCE.none;
  const left = fenced(f.v[vIndex(row, col)]) ? STAND_BACK.side : STAND_BACK.open;
  const right = fenced(f.v[vIndex(row, col + 1)]) ? STAND_BACK.side : STAND_BACK.open;
  const top = fenced(f.h[hIndex(row, col)]) ? STAND_BACK.top : STAND_BACK.open;
  return [col + left, row + top, col + 1 - right, row + 1 - STAND_BACK.bottom];
}

/** Share `count` places among groups in proportion to their sizes, each present group getting at least one if there is room. */
function share(sizes: readonly number[], count: number): number[] {
  const total = sizes.reduce((t, n) => t + n, 0);
  const out = sizes.map(() => 0);
  const places = Math.min(count, total);
  if (places <= 0) return out;
  const exact = sizes.map((n) => (n * places) / total);
  let given = 0;
  exact.forEach((e, k) => {
    out[k] = Math.floor(e);
    given += out[k]!;
  });
  // Hand out what rounding left over, biggest remainder first.
  const order = exact
    .map((e, k) => ({ k, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.k - b.k);
  for (const o of order) {
    if (given >= places) break;
    if (out[o.k]! < sizes[o.k]!) {
      out[o.k]!++;
      given++;
    }
  }
  // A kind that is in the mob shows at least once, taken from the biggest group.
  if (places >= sizes.filter((n) => n > 0).length) {
    sizes.forEach((n, k) => {
      if (n === 0 || out[k]! > 0) return;
      let big = 0;
      out.forEach((v, m) => {
        if (v > out[big]!) big = m;
      });
      if (out[big]! > 1) {
        out[big]!--;
        out[k] = 1;
      }
    });
  }
  return out;
}

/** The adults to draw, as kind and body shape, mixed up in a fixed order. */
function roster(mob: FarmViewMob, adults: number): { kind: ViewCattleKind; shape: BodyShape }[] {
  const kinds = mob.cattle.filter((c) => c.kind !== 'calf' && c.n > 0);
  const counts = share(
    kinds.map((c) => c.n),
    adults,
  );
  const out: { kind: ViewCattleKind; shape: BodyShape }[] = [];
  kinds.forEach((c, k) => {
    const d = counts[k]!;
    const thin = Math.min(d, Math.round((d * c.thin) / c.n));
    const fat = Math.min(d - thin, Math.round((d * c.fat) / c.n));
    for (let j = 0; j < d; j++) {
      out.push({ kind: c.kind, shape: j < thin ? 'thin' : j < thin + fat ? 'fat' : 'normal' });
    }
  });
  // Mix them, the same way every time, so the thin ones are not all in one corner.
  const next = scatter(mob.seed ^ 0x5bd1e995);
  for (let j = out.length - 1; j > 0; j--) {
    const k = Math.floor(next() * (j + 1));
    const t = out[j]!;
    out[j] = out[k]!;
    out[k] = t;
  }
  return out;
}

const clampTo = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Where one mob's cattle stand, or null for a mob the map does not draw (the feedlot). */
export function placeMob(
  g: PlacementGround,
  mob: FarmViewMob,
  options: PlacementOptions = {},
): MobPlacement | null {
  const total = mob.head + mob.calves;
  if (mob.where === 'lot' || total <= 0) return null;
  const view = g.view;

  let order: number[];
  let cap: number;
  if (mob.where === 'yards') {
    const yards = view.buildings.find((b) => b.kind === 'yards');
    if (!yards) return null;
    order = [yards.cell];
    cap = YARDS_DRAWN;
  } else {
    const cells = g.areaCells.get(mob.area);
    if (!cells || !cells.length) return null;
    const start = view.squares.area[mob.anchor] === mob.area ? mob.anchor : cells[0]!;
    order = walkOrder(g, start, mob.seed);
    // An area that is all troughs and buildings: stand where they can.
    if (!order.length) order = cells.slice();
    if (options.everyBeast || order.length <= SMALL_AREA_SQUARES) {
      cap = order.length * MAX_DRAWN_CROWDED;
    } else {
      // Open country: at most four squares in ten, three to a square.
      order = order.slice(0, Math.max(1, Math.ceil(order.length * MAX_SHARE_OF_AREA)));
      cap = order.length * MAX_DRAWN_PER_SQUARE;
    }
  }

  const drawn = Math.min(total, cap);
  const used = Math.min(order.length, Math.max(1, Math.ceil(drawn / SPREAD_PER_SQUARE)));
  const cells = order.slice(0, used);
  const boxes = cells.map((c) =>
    mob.where === 'yards'
      ? ([colOf(c) + 0.22, rowOf(c) + 0.5, colOf(c) + 0.78, rowOf(c) + 0.92] as const)
      : standingBox(view, c),
  );

  const calves =
    mob.calves > 0 ? Math.min(mob.calves, Math.round((drawn * mob.calves) / total)) : 0;
  const adults = roster(mob, Math.min(mob.head, drawn - calves));
  const beasts: Beast[] = [];
  const cellOf: number[] = [];
  adults.forEach((a, j) => {
    const k = j % used;
    const box = boxes[k]!;
    beasts.push({
      x: box[0] + (box[2] - box[0]) * unit(hash3(mob.seed, j, 1)),
      y: box[1] + (box[3] - box[1]) * unit(hash3(mob.seed, j, 2)),
      kind: a.kind,
      shape: a.shape,
      flip: (hash3(mob.seed, j, 3) & 1) === 1,
    });
    cellOf.push(k);
  });
  // Calves stand beside a cow where there is one, otherwise beside any adult.
  const cows = adults.map((a, j) => (a.kind === 'cow' ? j : -1)).filter((j) => j >= 0);
  const dams = cows.length ? cows : adults.map((_, j) => j);
  for (let c = 0; c < calves; c++) {
    if (!dams.length) {
      const k = c % used;
      const box = boxes[k]!;
      beasts.push({
        x: box[0] + (box[2] - box[0]) * unit(hash3(mob.seed, c, 4)),
        y: box[1] + (box[3] - box[1]) * unit(hash3(mob.seed, c, 5)),
        kind: 'calf',
        shape: 'normal',
        flip: (hash3(mob.seed, c, 6) & 1) === 1,
      });
      continue;
    }
    const j = dams[c % dams.length]!;
    const dam = beasts[j]!;
    const box = boxes[cellOf[j]!]!;
    const side = (hash3(mob.seed, c, 7) & 1) === 1 ? 1 : -1;
    beasts.push({
      x: clampTo(dam.x + side * (0.14 + 0.06 * unit(hash3(mob.seed, c, 8))), box[0], box[2]),
      y: clampTo(dam.y + 0.05 + 0.05 * unit(hash3(mob.seed, c, 9)), box[1], box[3]),
      kind: 'calf',
      shape: 'normal',
      flip: dam.flip,
    });
  }

  let mx = 0;
  let my = 0;
  for (const c of cells) {
    mx += colOf(c) + 0.5;
    my += rowOf(c) + 0.5;
  }
  mx /= cells.length;
  my /= cells.length;
  // The marker sits on one of the mob's own squares, so it is never across a fence.
  let best = cells[0]!;
  let bd = Infinity;
  let sx = 0.5;
  let sy = 0.5;
  for (const c of cells) {
    const dx = colOf(c) + 0.5 - mx;
    const dy = rowOf(c) + 0.5 - my;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = c;
    }
    sx = Math.max(sx, Math.abs(dx) + 0.5);
    sy = Math.max(sy, Math.abs(dy) + 0.5);
  }
  return {
    mob: mob.id,
    total,
    beasts,
    sampled: beasts.length < total,
    cells,
    centre: { x: colOf(best) + 0.5, y: rowOf(best) + 0.5 },
    spread: { x: sx, y: sy },
  };
}

/** Where every mob's cattle stand. Mobs in the feedlot are left out. */
export function placeCattle(view: FarmView, options: PlacementOptions = {}): MobPlacement[] {
  const g = placementGround(view);
  const out: MobPlacement[] = [];
  for (const mob of view.mobs) {
    const p = placeMob(g, mob, options);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Everything the placement depends on, as text. While this stays the same
 * between two views, the cattle stay where they are.
 */
export function placementKey(view: FarmView): string {
  return JSON.stringify([
    view.fences,
    view.gates,
    view.water.bore,
    view.water.troughs.map((t) => t.cell),
    view.buildings,
    view.squares.area,
    view.mobs.map((m) => [m.id, m.where, m.area, m.anchor, m.head, m.calves, m.cattle, m.seed]),
  ]);
}
