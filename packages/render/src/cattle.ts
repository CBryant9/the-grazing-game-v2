/**
 * Where each beast stands on the map, and how big it is drawn.
 *
 * The farm does not store where cattle stand: the model has no use for it
 * (LESSONS W3, "the model never reads the picture"). The map works it out
 * from the view, and always the same way, so cattle do not jump about for no
 * reason. This file gives each mob's first places. From there the cattle
 * walk and graze (herd.ts), and keep their places from one day to the next.
 *
 * The rules, all drawing rules:
 * - Cattle stand inside their grazing area, and never on the wrong side of
 *   a fence (LESSONS 29). They stand back from fence lines.
 * - No beast stands on a square with a trough, the bore or a building.
 * - A mob takes up about as much ground as a real mob grazing together:
 *   `HERD_M2_PER_HEAD` a head, or the whole grazing area if that is smaller.
 *   So a mob in a big paddock is a loose cluster round the square it was put
 *   on (usually water), and the same mob in a small strip fills it.
 * - Each beast is drawn near its real size against the paddock (see
 *   `cowPx`), so how crowded a mob looks follows its real density
 *   (Claudia, 19 Nov 2026: "900 fills like a quarter of the area on 3000 ha").
 * - One sprite a head up to `MOB_DRAWN_MAX` a mob and `FARM_DRAWN_MAX` a
 *   farm. Past that a mob draws a sample, spread over its true area, so its
 *   footprint stays true. The marker and badge always carry the real head
 *   count (PRD 7).
 */

import {
  VIEW_FENCE,
  type FarmView,
  type FarmViewMob,
  type ViewCattleKind,
} from '@gg/shared';
import { GRID_H, GRID_N, GRID_W, colOf, hIndex, rowOf, vIndex } from './grid';
import { hash3, scatter, unit } from './random';

/**
 * Ground a mob takes up while it grazes together, square metres a head. A
 * mob of 100 spreads over about 4 ha. Real cattle spread wider over a day;
 * the herd's patch moves about the paddock to show that (herd.ts).
 */
export const HERD_M2_PER_HEAD = 400;
/** The most cattle drawn for one mob. Past this the mob is sampled over its true area. */
export const MOB_DRAWN_MAX = 400;
/** The most cattle drawn on the whole farm. Past this every mob draws fewer, in proportion. */
export const FARM_DRAWN_MAX = 3000;
/** The fewest drawn for a mob when the farm's budget is shared out (or the whole mob, if smaller). */
export const MOB_DRAWN_MIN = 24;
/** The most cattle drawn in the stock yards. */
export const YARDS_DRAWN = 14;
/** The speed test's "every beast" draws up to this many to a square, over the whole area. */
export const EVERY_BEAST_PER_SQUARE = 6;
/** An area of this many squares or fewer is small (kept for the sheep and the tests). */
export const SMALL_AREA_SQUARES = 8;

/** Body length nose to tail, metres, for the size on the map. */
export const CATTLE_LENGTH_M: Readonly<Record<ViewCattleKind, number>> = {
  cow: 2.4,
  heifer: 2.2,
  steer: 2.3,
  bull: 2.7,
  calf: 1.3,
};
/** How many times its real size a beast is drawn, so it reads as a beast and not a speck. */
export const CATTLE_EXAGGERATION = 4;
/** A cow is never drawn shorter than this on screen, zoomed in (CSS pixels). */
export const CATTLE_MIN_PX = 5;
/** A cow is never drawn longer than this on screen (CSS pixels). A bull is a little longer. */
export const CATTLE_MAX_PX = 18;
/** Nothing that stands is drawn shorter than this (a calf or lamb on a big farm). */
export const ANIMAL_MIN_PX = 3.5;

/**
 * How long a cow is drawn, in screen pixels, at a zoom of `pxPerSquare` on
 * a farm whose squares are `sideM` metres a side: its real length times the
 * exaggeration, held between the least and most.
 */
export function cowPx(pxPerSquare: number, sideM: number): number {
  const real = (CATTLE_LENGTH_M.cow * pxPerSquare * CATTLE_EXAGGERATION) / Math.max(1, sideM);
  return real < CATTLE_MIN_PX ? CATTLE_MIN_PX : real > CATTLE_MAX_PX ? CATTLE_MAX_PX : real;
}

/** How long an animal `lengthM` long is drawn, in screen pixels: in proportion to the cow. */
export function animalPx(lengthM: number, pxPerSquare: number, sideM: number): number {
  return Math.max(ANIMAL_MIN_PX, (cowPx(pxPerSquare, sideM) * lengthM) / CATTLE_LENGTH_M.cow);
}

/** A cow's length in squares at its exaggerated size, held to what reads. For spacing calves. */
export const cowSquares = (sideM: number): number =>
  Math.min(0.42, Math.max(0.025, (CATTLE_LENGTH_M.cow * CATTLE_EXAGGERATION) / Math.max(1, sideM)));

/** How many squares a mob of `head` grazes over, on squares `sideM` a side, in an area of `areaSquares`. */
export function herdSquares(head: number, sideM: number, areaSquares: number, m2PerHead = HERD_M2_PER_HEAD): number {
  const want = Math.ceil((Math.max(1, head) * m2PerHead) / (sideM * sideM));
  return Math.max(1, Math.min(areaSquares, want));
}

/**
 * How far cattle stand back inside a square, as a share of the square.
 * `side` and `top` apply where there is a fence on that side. The top is
 * deeper because a beast is drawn standing up from its feet: any closer to
 * a fence above it and its back would show over the wire.
 */
export const STAND_BACK = { side: 0.2, top: 0.35, bottom: 0.03, open: 0.03 } as const;

export type BodyShape = 'thin' | 'normal' | 'fat';

export interface Beast {
  /** Where its feet are, in ground coordinates. */
  x: number;
  y: number;
  kind: ViewCattleKind;
  shape: BodyShape;
  /** True to draw it facing left. */
  flip: boolean;
  /** For a calf: its mother's place in the mob's `beasts`, or -1. */
  dam: number;
}

export interface MobPlacement {
  mob: number;
  where: FarmViewMob['where'];
  /** The grazing area, or -1 in the yards. */
  area: number;
  /** Head in the mob, calves included. */
  total: number;
  /** The cattle drawn. Fewer than `total` when the mob is sampled. */
  beasts: Beast[];
  sampled: boolean;
  /** The squares the mob grazes over now, nearest its start first. */
  cells: number[];
  /** The square the mob gathers round (the first of `cells`). */
  start: number;
  /**
   * The true ground the mob takes up, square metres: head times
   * `HERD_M2_PER_HEAD`, or its whole grazing area if smaller. For how crowded
   * it is drawn zoomed out.
   */
  herdM2: number;
  /** The middle of the mob, in ground coordinates. The marker goes here. */
  centre: { x: number; y: number };
  /** How far the mob reaches from its middle, in squares. */
  spread: { x: number; y: number };
}

/** True if stock cannot cross a line with this code. Open gates are handled by the caller. */
export const stops = (code: number): boolean =>
  code === VIEW_FENCE.boundary ||
  code === VIEW_FENCE.permanent ||
  code === VIEW_FENCE.electric ||
  code === VIEW_FENCE.tape ||
  code === VIEW_FENCE.netting ||
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
export function canStep(g: PlacementGround, from: number, dx: number, dy: number): boolean {
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

/**
 * True if stock can walk from one square to a square next to it, across or
 * on the diagonal, without going through a fence or a shut gate. A diagonal
 * step needs one of the two ways round the corner to be open.
 */
export function stepOpen(g: PlacementGround, from: number, to: number): boolean {
  if (from === to) return true;
  const dx = colOf(to) - colOf(from);
  const dy = rowOf(to) - rowOf(from);
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
  if (dx === 0 || dy === 0) return canStep(g, from, dx, dy);
  return (
    (canStep(g, from, dx, 0) && canStep(g, from + dx, 0, dy)) ||
    (canStep(g, from, 0, dy) && canStep(g, from + dy * GRID_W, dx, 0))
  );
}

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
export function share(sizes: readonly number[], count: number): number[] {
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

/** The yards' standing box for a square: inside the pens. */
export const yardsBox = (c: number): [number, number, number, number] => [
  colOf(c) + 0.22,
  rowOf(c) + 0.5,
  colOf(c) + 0.78,
  rowOf(c) + 0.92,
];

/**
 * Shrink a standing box about its middle to `k` of its size. A mob that
 * takes up less than a square stands in part of it, so its density is true.
 */
export function shrinkBox(
  box: readonly [number, number, number, number],
  k: number,
): [number, number, number, number] {
  if (k >= 1) return [box[0], box[1], box[2], box[3]];
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  const hx = ((box[2] - box[0]) / 2) * k;
  const hy = ((box[3] - box[1]) / 2) * k;
  return [cx - hx, cy - hy, cx + hx, cy + hy];
}

/** Where a mob's marker sits, and how far the mob reaches from it, for a set of squares. */
export function markerOf(cells: readonly number[]): {
  centre: { x: number; y: number };
  spread: { x: number; y: number };
} {
  let mx = 0;
  let my = 0;
  for (const c of cells) {
    mx += colOf(c) + 0.5;
    my += rowOf(c) + 0.5;
  }
  mx /= Math.max(1, cells.length);
  my /= Math.max(1, cells.length);
  // The marker sits on one of the mob's own squares, so it is never across a fence.
  let best = cells[0] ?? 0;
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
  return { centre: { x: colOf(best) + 0.5, y: rowOf(best) + 0.5 }, spread: { x: sx, y: sy } };
}

/** The squares a mob grazes over from `start`, nearest first, and the true ground it covers. */
export function herdGround(
  g: PlacementGround,
  mob: Pick<FarmViewMob, 'area' | 'head' | 'seed'>,
  start: number,
  options: PlacementOptions = {},
): { cells: number[]; herdM2: number; boxScale: number } {
  const sideM = g.view.scale.sideM;
  const squareM2 = sideM * sideM;
  let order = walkOrder(g, start, mob.seed);
  // An area that is all troughs and buildings: stand where they can.
  if (!order.length) order = (g.areaCells.get(mob.area) ?? [start]).slice();
  if (options.everyBeast) return { cells: order, herdM2: order.length * squareM2, boxScale: 1 };
  const n = herdSquares(mob.head, sideM, order.length);
  const herdM2 = Math.min(Math.max(1, mob.head) * HERD_M2_PER_HEAD, order.length * squareM2);
  // Less ground than the squares it is given: stand in the middle part of each.
  const boxScale = n > 1 ? 1 : Math.max(0.3, Math.min(1, Math.sqrt(herdM2 / squareM2)));
  return { cells: order.slice(0, n), herdM2, boxScale };
}

/**
 * Where one mob's cattle stand, or null for a mob the map does not draw (the
 * feedlot). `budget` is the most to draw for it (its share of the farm's).
 */
export function placeMob(
  g: PlacementGround,
  mob: FarmViewMob,
  options: PlacementOptions = {},
  budget = MOB_DRAWN_MAX,
): MobPlacement | null {
  const total = mob.head + mob.calves;
  if (mob.where === 'lot' || total <= 0) return null;
  const view = g.view;

  let cells: number[];
  let cap: number;
  let herdM2: number;
  let boxScale = 1;
  if (mob.where === 'yards') {
    const yards = view.buildings.find((b) => b.kind === 'yards');
    if (!yards) return null;
    cells = [yards.cell];
    cap = YARDS_DRAWN;
    herdM2 = view.scale.sideM * view.scale.sideM * 0.2;
  } else {
    const area = g.areaCells.get(mob.area);
    if (!area || !area.length) return null;
    const start = view.squares.area[mob.anchor] === mob.area ? mob.anchor : area[0]!;
    const ground = herdGround(g, mob, start, options);
    cells = ground.cells;
    herdM2 = ground.herdM2;
    boxScale = ground.boxScale;
    cap = options.everyBeast ? cells.length * EVERY_BEAST_PER_SQUARE : budget;
  }

  const drawn = Math.max(1, Math.min(total, cap));
  const used = cells.length;
  const boxes = cells.map((c) =>
    mob.where === 'yards' ? yardsBox(c) : shrinkBox(standingBox(view, c), boxScale),
  );
  // Each beast's square: round the squares when there are more beasts than
  // squares, otherwise spread evenly through them.
  const squareFor = (j: number, n: number): number =>
    n >= used ? j % used : Math.min(used - 1, Math.floor(((j + 0.5) * used) / n));

  const calves =
    mob.calves > 0 ? Math.min(mob.calves, Math.round((drawn * mob.calves) / total)) : 0;
  const adults = roster(mob, Math.min(mob.head, drawn - calves));
  const beasts: Beast[] = [];
  const cellOf: number[] = [];
  adults.forEach((a, j) => {
    const k = squareFor(j, adults.length);
    const box = boxes[k]!;
    beasts.push({
      x: box[0] + (box[2] - box[0]) * unit(hash3(mob.seed, j, 1)),
      y: box[1] + (box[3] - box[1]) * unit(hash3(mob.seed, j, 2)),
      kind: a.kind,
      shape: a.shape,
      flip: (hash3(mob.seed, j, 3) & 1) === 1,
      dam: -1,
    });
    cellOf.push(k);
  });
  // Calves stand beside a cow where there is one, otherwise beside any adult.
  const cows = adults.map((a, j) => (a.kind === 'cow' ? j : -1)).filter((j) => j >= 0);
  const dams = cows.length ? cows : adults.map((_, j) => j);
  const gap = cowSquares(view.scale.sideM);
  for (let c = 0; c < calves; c++) {
    if (!dams.length) {
      const box = boxes[c % used]!;
      beasts.push({
        x: box[0] + (box[2] - box[0]) * unit(hash3(mob.seed, c, 4)),
        y: box[1] + (box[3] - box[1]) * unit(hash3(mob.seed, c, 5)),
        kind: 'calf',
        shape: 'normal',
        flip: (hash3(mob.seed, c, 6) & 1) === 1,
        dam: -1,
      });
      continue;
    }
    const j = dams[c % dams.length]!;
    const dam = beasts[j]!;
    const box = boxes[cellOf[j]!]!;
    const side = (hash3(mob.seed, c, 7) & 1) === 1 ? 1 : -1;
    beasts.push({
      x: clampTo(dam.x + side * gap * (0.55 + 0.25 * unit(hash3(mob.seed, c, 8))), box[0], box[2]),
      y: clampTo(dam.y + gap * (0.1 + 0.15 * unit(hash3(mob.seed, c, 9))), box[1], box[3]),
      kind: 'calf',
      shape: 'normal',
      flip: dam.flip,
      dam: j,
    });
  }

  const { centre, spread } = markerOf(cells);
  return {
    mob: mob.id,
    where: mob.where,
    area: mob.where === 'yards' ? -1 : mob.area,
    total,
    beasts,
    sampled: beasts.length < total,
    cells,
    start: cells[0]!,
    herdM2,
    centre,
    spread,
  };
}

/**
 * How many to draw for each mob: one a head up to `MOB_DRAWN_MAX`, and if
 * the farm would draw more than `FARM_DRAWN_MAX`, every mob fewer in proportion.
 */
export function drawBudgets(view: FarmView): Map<number, number> {
  const want = new Map<number, number>();
  let sum = 0;
  for (const m of view.mobs) {
    if (m.where !== 'paddock') continue;
    const n = Math.min(MOB_DRAWN_MAX, m.head + m.calves);
    want.set(m.id, n);
    sum += n;
  }
  if (sum > FARM_DRAWN_MAX) {
    const k = FARM_DRAWN_MAX / sum;
    for (const [id, n] of want) {
      want.set(id, Math.max(Math.min(n, MOB_DRAWN_MIN), Math.floor(n * k)));
    }
  }
  return want;
}

/** Where every mob's cattle stand. Mobs in the feedlot are left out. */
export function placeCattle(view: FarmView, options: PlacementOptions = {}): MobPlacement[] {
  const g = placementGround(view);
  const budgets = drawBudgets(view);
  const out: MobPlacement[] = [];
  for (const mob of view.mobs) {
    const p = placeMob(g, mob, options, budgets.get(mob.id) ?? MOB_DRAWN_MAX);
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
