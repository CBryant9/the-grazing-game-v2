/**
 * What is under a tap or the mouse: a square and its paddock.
 *
 * A tap opens the paddock, never a cow (CLAUDE.md rule 7), so cattle and
 * everything else standing on the map are ignored: only the ground counts.
 *
 * The test is made against what is drawn (LESSONS 28). Zoomed out, squares
 * are drawn raised by their grass height, so a tall square covers part of
 * the square behind it. The search runs from the front row back and takes
 * the first square whose drawn shape holds the point.
 */

import type { FarmView } from '@gg/shared';
import { screenToWorld, type Camera, type Viewport } from './camera';
import { GRID_H, GRID_W, GROUND_SQUASH } from './grid';

export interface MapHit {
  square: number;
  col: number;
  row: number;
  /** The paddock's id and name. */
  paddock: number;
  paddockName: string;
  /** The grazing area's id. */
  area: number;
}

/**
 * The square drawn under a world point, or -1 off the farm. `raise` gives
 * how far each square is drawn raised, in world units; leave it out for a
 * flat map.
 */
export function squareAtWorld(wx: number, wy: number, raise?: ArrayLike<number> | null): number {
  const col = Math.floor(wx);
  if (col < 0 || col >= GRID_W) return -1;
  if (!raise) {
    const row = Math.floor(wy / GROUND_SQUASH);
    return row < 0 || row >= GRID_H ? -1 : row * GRID_W + col;
  }
  for (let row = GRID_H - 1; row >= 0; row--) {
    const i = row * GRID_W + col;
    const top = row * GROUND_SQUASH - (raise[i] ?? 0);
    const bottom = (row + 1) * GROUND_SQUASH;
    if (wy >= top && wy < bottom) return i;
  }
  return -1;
}

/** The square drawn under a screen point, or -1 off the farm. */
export function squareAtScreen(
  cam: Camera,
  vp: Viewport,
  sx: number,
  sy: number,
  raise?: ArrayLike<number> | null,
): number {
  const w = screenToWorld(cam, vp, sx, sy);
  return squareAtWorld(w.x, w.y, raise);
}

/** The square and paddock under a screen point, or null off the farm. */
export function hitTest(
  view: FarmView,
  cam: Camera,
  vp: Viewport,
  sx: number,
  sy: number,
  raise?: ArrayLike<number> | null,
): MapHit | null {
  const square = squareAtScreen(cam, vp, sx, sy, raise);
  if (square < 0) return null;
  const paddock = view.squares.paddock[square] ?? -1;
  return {
    square,
    col: square % GRID_W,
    row: Math.floor(square / GRID_W),
    paddock,
    paddockName: view.paddocks.find((p) => p.id === paddock)?.name ?? '',
    area: view.squares.area[square] ?? -1,
  };
}
