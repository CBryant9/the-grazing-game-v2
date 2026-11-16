/**
 * Lines on the grid: which fence segment or corner is under a finger, and
 * the path a drag makes along the grid.
 *
 * Plain arithmetic, no drawing, no PixiJS (so a page can import it without
 * loading the map). Fence lines run along the edges of squares. A corner
 * is where four squares meet. Both are numbered as in `@gg/shared`
 * (`ViewEdge`; corners as row line times 41 plus column line).
 */

import { VIEW_FENCE, type FarmView, type ViewEdge } from '@gg/shared';
import { screenToWorld, type Camera, type Viewport } from './camera';
import { GRID_H, GRID_W, GROUND_SQUASH as K, edgeEnds, hIndex, vIndex } from './grid';

/** A grid corner: column line 0 to 40, row line 0 to 26. */
export interface Corner {
  vx: number;
  vy: number;
}

export const CORNERS_ACROSS = GRID_W + 1;

/** A corner's number: row line times 41, plus the column line (the engine's `vertexId`). */
export const cornerVertex = (c: Corner): number => c.vy * CORNERS_ACROSS + c.vx;

/** The corner a number names. */
export const vertexCorner = (vertex: number): Corner => ({
  vx: vertex % CORNERS_ACROSS,
  vy: Math.floor(vertex / CORNERS_ACROSS),
});

export const sameCorner = (a: Corner, b: Corner): boolean => a.vx === b.vx && a.vy === b.vy;

/** Touch-sized: the farthest, in screen pixels, a tap can be from a line and still mean it. */
export const TOUCH_PX = 22;

/** A segment found near a point, and how far away it is in screen pixels. */
export interface EdgeHit {
  edge: ViewEdge;
  distPx: number;
}

/** A corner found near a point, and how far away it is in screen pixels. */
export interface CornerHit extends Corner {
  distPx: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function distToSegment(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - x0) * dx + (py - y0) * dy) / len2, 0, 1);
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/**
 * The segment nearest a screen point, within `maxPx` pixels, or null. A
 * segment is one side of a square. `accept` leaves out segments that do
 * not count (for a tool that wants a fence, say). Distance is measured as
 * drawn: the ground is squashed to 70% height.
 */
export function nearestEdge(
  cam: Camera,
  vp: Viewport,
  sx: number,
  sy: number,
  maxPx: number = TOUCH_PX,
  accept?: (edge: ViewEdge) => boolean,
): EdgeHit | null {
  const w = screenToWorld(cam, vp, sx, sy);
  const r = maxPx / cam.zoom;
  let best: EdgeHit | null = null;
  const consider = (edge: ViewEdge): void => {
    if (accept && !accept(edge)) return;
    const [x0, y0, x1, y1] = edgeEnds(edge);
    const d = distToSegment(w.x, w.y, x0, y0 * K, x1, y1 * K) * cam.zoom;
    if (d <= maxPx && (!best || d < best.distPx)) best = { edge, distPx: d };
  };
  // Lines across the map: row lines 0 to 26, one column at a time.
  const vy0 = Math.max(0, Math.ceil((w.y - r) / K));
  const vy1 = Math.min(GRID_H, Math.floor((w.y + r) / K));
  const x0 = Math.max(0, Math.floor(w.x - r));
  const x1 = Math.min(GRID_W - 1, Math.floor(w.x + r));
  for (let vy = vy0; vy <= vy1; vy++) {
    for (let x = x0; x <= x1; x++) consider({ line: 'h', index: hIndex(vy, x) });
  }
  // Lines down the map: column lines 0 to 40, one row at a time.
  const vx0 = Math.max(0, Math.ceil(w.x - r));
  const vx1 = Math.min(GRID_W, Math.floor(w.x + r));
  const y0 = Math.max(0, Math.floor((w.y - r) / K));
  const y1 = Math.min(GRID_H - 1, Math.floor((w.y + r) / K));
  for (let vx = vx0; vx <= vx1; vx++) {
    for (let y = y0; y <= y1; y++) consider({ line: 'v', index: vIndex(y, vx) });
  }
  return best;
}

/**
 * The corner nearest a screen point. With a limit, null past it. With none
 * it always answers, held to the farm: a drag that wanders off the edge
 * keeps the line on the boundary.
 */
export function nearestCorner(
  cam: Camera,
  vp: Viewport,
  sx: number,
  sy: number,
  maxPx: number = Infinity,
): CornerHit | null {
  const w = screenToWorld(cam, vp, sx, sy);
  const vx = clamp(Math.round(w.x), 0, GRID_W);
  const vy = clamp(Math.round(w.y / K), 0, GRID_H);
  const d = Math.hypot(w.x - vx, w.y - vy * K) * cam.zoom;
  return d <= maxPx ? { vx, vy, distPx: d } : null;
}

// ---- What stands on a line

/** The VIEW_FENCE code on a segment. */
export function fenceCodeAt(view: FarmView, edge: ViewEdge): number {
  return (edge.line === 'h' ? view.fences.h : view.fences.v)[edge.index] ?? 0;
}

/** True for a fence knocked down, which a tap puts back up. */
export const isDownCode = (code: number): boolean =>
  code === VIEW_FENCE.electricDown || code === VIEW_FENCE.tapeDown;

/** True for tape, up or down. */
export const isTapeCode = (code: number): boolean =>
  code === VIEW_FENCE.tape || code === VIEW_FENCE.tapeDown;

export const sameEdge = (a: ViewEdge, b: ViewEdge): boolean =>
  a.line === b.line && a.index === b.index;

export const edgeKey = (e: ViewEdge): string => `${e.line}${e.index}`;

/** The four segments that meet at a corner. */
export function edgesAtCorner(c: Corner): ViewEdge[] {
  const out: ViewEdge[] = [];
  if (c.vx > 0) out.push({ line: 'h', index: hIndex(c.vy, c.vx - 1) });
  if (c.vx < GRID_W) out.push({ line: 'h', index: hIndex(c.vy, c.vx) });
  if (c.vy > 0) out.push({ line: 'v', index: vIndex(c.vy - 1, c.vx) });
  if (c.vy < GRID_H) out.push({ line: 'v', index: vIndex(c.vy, c.vx) });
  return out;
}

/** True where a line ending at this corner would join a fence, a gate or the boundary. */
export function cornerJoinsFence(view: FarmView, c: Corner): boolean {
  return edgesAtCorner(c).some((e) => fenceCodeAt(view, e) !== VIEW_FENCE.none);
}

/**
 * The straight run of tape a segment is part of, as the engine rolls it
 * up: along the same line, both ways, while there is tape (up or down).
 */
export function tapeRun(view: FarmView, edge: ViewEdge): ViewEdge[] {
  if (!isTapeCode(fenceCodeAt(view, edge))) return [edge];
  const across = edge.line === 'h';
  // The line it lies on (a row line, or a column line) and its place along it.
  const lineNo = across ? Math.floor(edge.index / GRID_W) : edge.index % CORNERS_ACROSS;
  const pos = across ? edge.index % GRID_W : Math.floor(edge.index / CORNERS_ACROSS);
  const last = across ? GRID_W - 1 : GRID_H - 1;
  const make = (k: number): ViewEdge =>
    across ? { line: 'h', index: hIndex(lineNo, k) } : { line: 'v', index: vIndex(k, lineNo) };
  const run: ViewEdge[] = [edge];
  for (let k = pos - 1; k >= 0; k--) {
    const e = make(k);
    if (!isTapeCode(fenceCodeAt(view, e))) break;
    run.unshift(e);
  }
  for (let k = pos + 1; k <= last; k++) {
    const e = make(k);
    if (!isTapeCode(fenceCodeAt(view, e))) break;
    run.push(e);
  }
  return run;
}

// ---- The path a drag makes

/** The segment between two corners that are one step apart, or null. */
export function edgeBetween(a: Corner, b: Corner): ViewEdge | null {
  if (a.vy === b.vy && Math.abs(a.vx - b.vx) === 1) {
    return { line: 'h', index: hIndex(a.vy, Math.min(a.vx, b.vx)) };
  }
  if (a.vx === b.vx && Math.abs(a.vy - b.vy) === 1) {
    return { line: 'v', index: vIndex(Math.min(a.vy, b.vy), a.vx) };
  }
  return null;
}

/** The segments a path of corners runs along, in order. */
export function edgesOfPath(path: readonly Corner[]): ViewEdge[] {
  const out: ViewEdge[] = [];
  for (let i = 1; i < path.length; i++) {
    const e = edgeBetween(path[i - 1]!, path[i]!);
    if (e) out.push(e);
  }
  return out;
}

/**
 * Carry a path on to a new corner, along the grid. The long way is walked
 * first, then the short way, so a quick jump is one corner and not a
 * staircase. Dragging back over the line undoes it: if the target is on
 * the path already, the path is cut back to it.
 */
export function extendPath(path: readonly Corner[], target: Corner): Corner[] {
  if (path.length === 0) return [target];
  const out = path.slice();
  const back = out.findIndex((c) => sameCorner(c, target));
  if (back >= 0) return out.slice(0, back + 1);
  let at = out[out.length - 1]!;
  // Keep going the way the path was going when the two ways are as long as each other.
  const prev = out.length > 1 ? out[out.length - 2]! : null;
  const wasAcross = prev ? prev.vy === at.vy : true;
  const dx = target.vx - at.vx;
  const dy = target.vy - at.vy;
  const acrossFirst = Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && wasAcross);
  const step = (c: Corner, across: boolean): Corner =>
    across
      ? { vx: c.vx + Math.sign(target.vx - c.vx), vy: c.vy }
      : { vx: c.vx, vy: c.vy + Math.sign(target.vy - c.vy) };
  for (const across of [acrossFirst, !acrossFirst]) {
    while (across ? at.vx !== target.vx : at.vy !== target.vy) {
      at = step(at, across);
      out.push(at);
    }
  }
  return out;
}

/** The path as a drag starting at `from`: continue it from its end, or from its start turned round, or begin a new one. */
export function startPath(path: readonly Corner[], from: Corner): Corner[] {
  if (path.length > 0) {
    if (sameCorner(path[path.length - 1]!, from)) return path.slice();
    if (sameCorner(path[0]!, from)) return path.slice().reverse();
  }
  return [from];
}

// ---- Squares (pipe)

const squareCol = (s: number): number => s % GRID_W;
const squareRow = (s: number): number => Math.floor(s / GRID_W);

/**
 * Carry a run of squares on to a new square, along the grid, the way
 * `extendPath` does for corners. Pipe joins squares that touch at a side.
 */
export function extendSquares(path: readonly number[], target: number): number[] {
  if (target < 0) return path.slice();
  if (path.length === 0) return [target];
  const out = path.slice();
  const back = out.indexOf(target);
  if (back >= 0) return out.slice(0, back + 1);
  let col = squareCol(out[out.length - 1]!);
  let row = squareRow(out[out.length - 1]!);
  const tc = squareCol(target);
  const tr = squareRow(target);
  const prev = out.length > 1 ? out[out.length - 2]! : null;
  const wasAcross = prev === null ? true : squareRow(prev) === row;
  const dx = tc - col;
  const dy = tr - row;
  const acrossFirst = Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && wasAcross);
  for (const across of [acrossFirst, !acrossFirst]) {
    while (across ? col !== tc : row !== tr) {
      if (across) col += Math.sign(tc - col);
      else row += Math.sign(tr - row);
      out.push(row * GRID_W + col);
    }
  }
  return out;
}

/** A drag of pipe begins on a square: continue from the end of the run, or begin again. */
export function startSquares(path: readonly number[], from: number): number[] {
  if (path.length > 0 && path[path.length - 1] === from) return path.slice();
  if (path.length > 0 && path[0] === from) return path.slice().reverse();
  return [from];
}
