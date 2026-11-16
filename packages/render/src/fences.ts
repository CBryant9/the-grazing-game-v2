/**
 * Fence lines as runs to draw, and the outline of a paddock.
 *
 * Plain geometry in ground coordinates. Lines of the same kind that follow
 * on from each other are joined into one run, so a long fence is one stroke
 * and a dashed tape keeps an even dash along its whole length.
 */

import { VIEW_FENCE, type FarmView } from '@gg/shared';
import { GRID_H, GRID_W, hIndex, vIndex } from './grid';

export interface FenceRun {
  /** What it is (a VIEW_FENCE code). Gates are not in runs: each gate is drawn on its own. */
  code: number;
  /** True for a run across the map, false for one down it. */
  across: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Every fence on the farm as runs. Gates are left out. */
export function fenceRuns(view: FarmView): FenceRun[] {
  const out: FenceRun[] = [];
  const { h, v } = view.fences;
  for (let vy = 0; vy <= GRID_H; vy++) {
    let start = 0;
    let code = 0;
    for (let x = 0; x <= GRID_W; x++) {
      const c = x < GRID_W ? (h[hIndex(vy, x)] ?? 0) : -1;
      if (c === code) continue;
      if (code !== VIEW_FENCE.none && code !== VIEW_FENCE.gate) {
        out.push({ code, across: true, x0: start, y0: vy, x1: x, y1: vy });
      }
      start = x;
      code = c;
    }
  }
  for (let vx = 0; vx <= GRID_W; vx++) {
    let start = 0;
    let code = 0;
    for (let y = 0; y <= GRID_H; y++) {
      const c = y < GRID_H ? (v[vIndex(y, vx)] ?? 0) : -1;
      if (c === code) continue;
      if (code !== VIEW_FENCE.none && code !== VIEW_FENCE.gate) {
        out.push({ code, across: false, x0: vx, y0: start, x1: vx, y1: y });
      }
      start = y;
      code = c;
    }
  }
  return out;
}

/** The edge of a set of squares, as line segments [x0, y0, x1, y1] in ground coordinates. */
export function outlineOf(inside: (square: number) => boolean): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      const i = row * GRID_W + col;
      if (!inside(i)) continue;
      if (col === 0 || !inside(i - 1)) out.push([col, row, col, row + 1]);
      if (col === GRID_W - 1 || !inside(i + 1)) out.push([col + 1, row, col + 1, row + 1]);
      if (row === 0 || !inside(i - GRID_W)) out.push([col, row, col + 1, row]);
      if (row === GRID_H - 1 || !inside(i + GRID_W)) out.push([col, row + 1, col + 1, row + 1]);
    }
  }
  return out;
}

/** How many columns a set of squares spans. Used to decide whether a label fits. */
export function columnsSpanned(squares: readonly number[]): number {
  if (!squares.length) return 0;
  let lo = GRID_W;
  let hi = -1;
  for (const i of squares) {
    const col = i % GRID_W;
    if (col < lo) lo = col;
    if (col > hi) hi = col;
  }
  return hi - lo + 1;
}
