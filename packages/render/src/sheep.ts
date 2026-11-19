/**
 * Where each sheep stands on the map (milestone 2.8).
 *
 * The same rules as the cattle (cattle.ts), and the same walk out from the
 * square the flock was put on, so a flock never stands across a fence and
 * never on a trough, the bore or the yards' square. A flock takes up about
 * `SHEEP_M2_PER_HEAD` a head (a flock grazes closer than a mob of cattle),
 * or its whole grazing area if that is smaller, so how crowded it looks
 * follows its real density (19 Nov 2026). Sheep are drawn near their real
 * size against the paddock, in proportion to the cattle. One sprite a head
 * up to `FLOCK_DRAWN_MAX`, then a sample spread over the flock's true
 * ground. The marker and badge always carry the real head count.
 *
 * Sheep do not walk yet: they stand where they are put.
 *
 * Lambs stand beside a ewe. Positions are worked out the same way every
 * time, so sheep do not jump about between frames or days.
 */

import { VIEW_FENCE, type FarmView, type FarmViewFlock, type ViewSheepKind } from '@gg/shared';
import {
  EVERY_BEAST_PER_SQUARE,
  cowSquares,
  herdSquares,
  markerOf,
  placementGround,
  share,
  shrinkBox,
  walkOrder,
  yardsBox,
  type PlacementGround,
  type PlacementOptions,
} from './cattle';
import { colOf, hIndex, rowOf, vIndex } from './grid';
import { hash3, scatter, unit } from './random';

/** Ground a flock takes up while it grazes together, square metres a head. */
export const SHEEP_M2_PER_HEAD = 60;
/** The most sheep drawn for one flock. Past this the flock is sampled over its true ground. */
export const FLOCK_DRAWN_MAX = 600;
/** The most sheep drawn in the stock yards. */
export const SHEEP_YARDS_DRAWN = 24;
/** Body length, metres, for the size on the map (drawn in proportion to the cattle). */
export const SHEEP_LENGTH_M: Readonly<Record<ViewSheepKind, number>> = {
  ewe: 1.3,
  wether: 1.35,
  ram: 1.5,
  young: 1.1,
  lamb: 0.75,
};

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
  /** The true ground the flock takes up, square metres. */
  herdM2: number;
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

  let cells: number[];
  let cap: number;
  let herdM2: number;
  let boxScale = 1;
  const sideM = view.scale.sideM;
  const squareM2 = sideM * sideM;
  if (flock.where === 'yards') {
    const yards = view.buildings.find((b) => b.kind === 'yards');
    if (!yards) return null;
    cells = [yards.cell];
    cap = SHEEP_YARDS_DRAWN;
    herdM2 = squareM2 * 0.2;
  } else {
    const area = g.areaCells.get(flock.area);
    if (!area || !area.length) return null;
    const start = view.squares.area[flock.anchor] === flock.area ? flock.anchor : area[0]!;
    let order = walkOrder(g, start, flock.seed);
    // An area that is all troughs and buildings: stand where they can.
    if (!order.length) order = area.slice();
    if (options.everyBeast) {
      cells = order;
      cap = order.length * EVERY_BEAST_PER_SQUARE;
      herdM2 = order.length * squareM2;
    } else {
      const n = herdSquares(flock.head, sideM, order.length, SHEEP_M2_PER_HEAD);
      cells = order.slice(0, n);
      herdM2 = Math.min(Math.max(1, flock.head) * SHEEP_M2_PER_HEAD, order.length * squareM2);
      boxScale = Math.max(0.3, Math.min(1, Math.sqrt(herdM2 / (n * squareM2))));
      cap = FLOCK_DRAWN_MAX;
    }
  }

  const drawn = Math.max(1, Math.min(total, cap));
  const used = cells.length;
  const boxes = cells.map((c) =>
    flock.where === 'yards' ? yardsBox(c) : shrinkBox(sheepBox(view, c), boxScale),
  );

  const lambs =
    flock.lambs > 0 ? Math.min(flock.lambs, Math.round((drawn * flock.lambs) / total)) : 0;
  const adults = roster(flock, Math.min(flock.head, drawn - lambs));

  // Each sheep's square: round the squares when there are more sheep than
  // squares, otherwise spread evenly through them. How many go on each
  // square, so each square's sheep are spread over a grid, not piled.
  const squareFor = (j: number): number =>
    adults.length >= used
      ? j % used
      : Math.min(used - 1, Math.floor(((j + 0.5) * used) / adults.length));
  const per = new Array<number>(used).fill(0);
  adults.forEach((_, j) => per[squareFor(j)]!++);

  const sheep: Sheep[] = [];
  const cellOf: number[] = [];
  adults.forEach((a, j) => {
    const k = squareFor(j);
    const slot = adults.length >= used ? Math.floor(j / used) : 0;
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
    const gap = cowSquares(sideM) * 0.55;
    sheep.push({
      x: clampTo(dam.x + side * gap * (0.6 + 0.3 * unit(hash3(flock.seed, c, 8))), box[0], box[2]),
      y: clampTo(dam.y + gap * (0.15 + 0.2 * unit(hash3(flock.seed, c, 9))), box[1], box[3]),
      kind: 'lamb',
      thin: false,
      flip: dam.flip,
    });
  }

  const { centre, spread } = markerOf(cells);
  return {
    flock: flock.id,
    total,
    sheep,
    sampled: sheep.length < total,
    cells,
    herdM2,
    centre,
    spread,
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
