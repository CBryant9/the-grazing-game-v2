/**
 * Where each sheep stands on the map (milestone 2.8).
 *
 * The same rules as the cattle (cattle.ts), and the same walk out from the
 * square the flock was put on, so a flock never stands across a fence and
 * never on a trough, the bore or the yards' square. What differs is size.
 * A sheep is about half the length of a cow, so more stand on a square:
 * four a square when a flock has room, five at most on open country, eight
 * on a small area. A big flock still stands on no more than four squares in
 * ten of its grazing area, so the pasture shows, and past that it draws a
 * sample. The marker and badge always carry the real head count.
 *
 * Lambs stand beside a ewe. Positions are worked out the same way every
 * time, so sheep do not jump about between frames or days.
 */

import { VIEW_FENCE, type FarmView, type FarmViewFlock, type ViewSheepKind } from '@gg/shared';
import {
  MAX_SHARE_OF_AREA,
  SMALL_AREA_SQUARES,
  placementGround,
  share,
  walkOrder,
  type PlacementGround,
  type PlacementOptions,
} from './cattle';
import { colOf, hIndex, rowOf, vIndex } from './grid';
import { hash3, scatter, unit } from './random';

/** A flock with room spreads out to about this many to a square. */
export const SHEEP_SPREAD_PER_SQUARE = 4;
/**
 * The most sheep drawn to a square of open country, on average. Past this a
 * flock is sampled. Lambs stand beside their ewes, so one square can hold a
 * few more than the average.
 */
export const SHEEP_MAX_PER_SQUARE = 5;
/** The most sheep drawn on one square of a small area, where a crowd should look like one. */
export const SHEEP_MAX_CROWDED = 8;
/** The most sheep drawn in the stock yards. */
export const SHEEP_YARDS_DRAWN = 24;

/**
 * How far sheep stand back inside a square, as a share of the square. A
 * sheep is low, so it stands closer to a fence than a beast does.
 */
export const SHEEP_STAND_BACK = { side: 0.2, top: 0.3, bottom: 0.06, open: 0.06 } as const;

export interface Sheep {
  /** Where its feet are, in ground coordinates. */
  x: number;
  y: number;
  kind: ViewSheepKind;
  /** Under CS 2: drawn leaner and duller. */
  thin: boolean;
  /** True to draw it facing left. */
  flip: boolean;
}

export interface FlockPlacement {
  flock: number;
  /** Head in the flock, lambs at foot included. */
  total: number;
  /** The sheep drawn. Fewer than `total` when the flock is sampled. */
  sheep: Sheep[];
  sampled: boolean;
  /** The squares the flock stands on. */
  cells: number[];
  /** The middle of the flock, in ground coordinates. The marker goes here. */
  centre: { x: number; y: number };
  /** How far the flock reaches from its middle, in squares. */
  spread: { x: number; y: number };
}

/** The part of a square sheep may stand in: [x0, y0, x1, y1] in ground coordinates. */
export function sheepBox(view: FarmView, square: number): [number, number, number, number] {
  const col = colOf(square);
  const row = rowOf(square);
  const f = view.fences;
  const fenced = (code: number | undefined): boolean => (code ?? 0) !== VIEW_FENCE.none;
  const b = SHEEP_STAND_BACK;
  const left = fenced(f.v[vIndex(row, col)]) ? b.side : b.open;
  const right = fenced(f.v[vIndex(row, col + 1)]) ? b.side : b.open;
  const top = fenced(f.h[hIndex(row, col)]) ? b.top : b.open;
  return [col + left, row + top, col + 1 - right, row + 1 - b.bottom];
}

/** The adults to draw, as kind and whether thin, mixed up in a fixed order. */
function roster(flock: FarmViewFlock, adults: number): { kind: ViewSheepKind; thin: boolean }[] {
  const kinds = flock.sheep.filter((s) => s.kind !== 'lamb' && s.n > 0);
  const counts = share(
    kinds.map((s) => s.n),
    adults,
  );
  const out: { kind: ViewSheepKind; thin: boolean }[] = [];
  kinds.forEach((s, k) => {
    const d = counts[k]!;
    const thin = Math.min(d, Math.round((d * s.thin) / s.n));
    for (let j = 0; j < d; j++) out.push({ kind: s.kind, thin: j < thin });
  });
  const next = scatter(flock.seed ^ 0x2545f491);
  for (let j = out.length - 1; j > 0; j--) {
    const k = Math.floor(next() * (j + 1));
    const t = out[j]!;
    out[j] = out[k]!;
    out[k] = t;
  }
  return out;
}

const clampTo = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Where one flock's sheep stand, or null for a flock with nothing to draw. */
export function placeFlock(
  g: PlacementGround,
  flock: FarmViewFlock,
  options: PlacementOptions = {},
): FlockPlacement | null {
  const total = flock.head + flock.lambs;
  if (total <= 0) return null;
  const view = g.view;

  let order: number[];
  let cap: number;
  if (flock.where === 'yards') {
    const yards = view.buildings.find((b) => b.kind === 'yards');
    if (!yards) return null;
    order = [yards.cell];
    cap = SHEEP_YARDS_DRAWN;
  } else {
    const cells = g.areaCells.get(flock.area);
    if (!cells || !cells.length) return null;
    const start = view.squares.area[flock.anchor] === flock.area ? flock.anchor : cells[0]!;
    order = walkOrder(g, start, flock.seed);
    // An area that is all troughs and buildings: stand where they can.
    if (!order.length) order = cells.slice();
    if (options.everyBeast || order.length <= SMALL_AREA_SQUARES) {
      cap = order.length * SHEEP_MAX_CROWDED;
    } else {
      // Open country: at most four squares in ten, five to a square.
      order = order.slice(0, Math.max(1, Math.ceil(order.length * MAX_SHARE_OF_AREA)));
      cap = order.length * SHEEP_MAX_PER_SQUARE;
    }
  }

  const drawn = Math.min(total, cap);
  const used = Math.min(order.length, Math.max(1, Math.ceil(drawn / SHEEP_SPREAD_PER_SQUARE)));
  const cells = order.slice(0, used);
  const boxes = cells.map((c) =>
    flock.where === 'yards'
      ? ([colOf(c) + 0.22, rowOf(c) + 0.5, colOf(c) + 0.78, rowOf(c) + 0.92] as const)
      : sheepBox(view, c),
  );

  const lambs =
    flock.lambs > 0 ? Math.min(flock.lambs, Math.round((drawn * flock.lambs) / total)) : 0;
  const adults = roster(flock, Math.min(flock.head, drawn - lambs));

  // How many adults go on each square, so each square's sheep are spread over a grid, not piled.
  const per = new Array<number>(used).fill(0);
  adults.forEach((_, j) => per[j % used]!++);

  const sheep: Sheep[] = [];
  const cellOf: number[] = [];
  adults.forEach((a, j) => {
    const k = j % used;
    const slot = Math.floor(j / used);
    const n = per[k]!;
    const box = boxes[k]!;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.3)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const fx = ((slot % cols) + 0.15 + 0.7 * unit(hash3(flock.seed, j, 1))) / cols;
    const fy = (Math.floor(slot / cols) + 0.15 + 0.7 * unit(hash3(flock.seed, j, 2))) / rows;
    sheep.push({
      x: box[0] + (box[2] - box[0]) * fx,
      y: box[1] + (box[3] - box[1]) * fy,
      kind: a.kind,
      thin: a.thin,
      flip: (hash3(flock.seed, j, 3) & 1) === 1,
    });
    cellOf.push(k);
  });
  // Lambs stand beside a ewe where there is one, otherwise beside any adult.
  const ewes = adults.map((a, j) => (a.kind === 'ewe' ? j : -1)).filter((j) => j >= 0);
  const dams = ewes.length ? ewes : adults.map((_, j) => j);
  for (let c = 0; c < lambs; c++) {
    if (!dams.length) {
      const k = c % used;
      const box = boxes[k]!;
      sheep.push({
        x: box[0] + (box[2] - box[0]) * unit(hash3(flock.seed, c, 4)),
        y: box[1] + (box[3] - box[1]) * unit(hash3(flock.seed, c, 5)),
        kind: 'lamb',
        thin: false,
        flip: (hash3(flock.seed, c, 6) & 1) === 1,
      });
      continue;
    }
    const j = dams[c % dams.length]!;
    const dam = sheep[j]!;
    const box = boxes[cellOf[j]!]!;
    const side = (hash3(flock.seed, c, 7) & 1) === 1 ? 1 : -1;
    sheep.push({
      x: clampTo(dam.x + side * (0.09 + 0.04 * unit(hash3(flock.seed, c, 8))), box[0], box[2]),
      y: clampTo(dam.y + 0.03 + 0.04 * unit(hash3(flock.seed, c, 9)), box[1], box[3]),
      kind: 'lamb',
      thin: false,
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
  // The marker sits on one of the flock's own squares, so it is never across a fence.
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
    flock: flock.id,
    total,
    sheep,
    sampled: sheep.length < total,
    cells,
    centre: { x: colOf(best) + 0.5, y: rowOf(best) + 0.5 },
    spread: { x: sx, y: sy },
  };
}

/** Where every flock's sheep stand. A view with no flocks gives an empty list. */
export function placeSheep(view: FarmView, options: PlacementOptions = {}): FlockPlacement[] {
  const flocks = view.flocks;
  if (!flocks || !flocks.length) return [];
  const g = placementGround(view);
  const out: FlockPlacement[] = [];
  for (const flock of flocks) {
    const p = placeFlock(g, flock, options);
    if (p) out.push(p);
  }
  return out;
}

/**
 * What the sheep's places depend on, beyond what the cattle's do (see
 * `placementKey` in cattle.ts, which the map adds to this): the flocks.
 * Empty for a view with no flocks.
 */
export function sheepPlacementKey(view: FarmView): string {
  const flocks = view.flocks;
  if (!flocks || !flocks.length) return '';
  return JSON.stringify(
    flocks.map((f) => [f.id, f.where, f.area, f.anchor, f.head, f.lambs, f.sheep, f.seed]),
  );
}
