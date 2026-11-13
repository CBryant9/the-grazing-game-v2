/**
 * The farm grid as the map sees it.
 *
 * Two sets of coordinates are used, both measured in squares:
 * - ground: (gx, gy), flat, 0 to 40 across and 0 to 26 down.
 * - world: what is drawn. The ground is squashed to 70% height so things
 *   that stand up read as tall (docs/VISUALS.md): world y = ground y x 0.7.
 */

import { FARM_GRID_H, FARM_GRID_N, FARM_GRID_W, VIEW_FENCE, type ViewEdge } from '@gg/shared';

export const GRID_W = FARM_GRID_W;
export const GRID_H = FARM_GRID_H;
export const GRID_N = FARM_GRID_N;

/** Ground is drawn at 70% height, so standing things read as tall (VISUALS). */
export const GROUND_SQUASH = 0.7;

/** The farm's size in world units. */
export const WORLD_W = GRID_W;
export const WORLD_H = GRID_H * GROUND_SQUASH;

export const colOf = (square: number): number => square % GRID_W;
export const rowOf = (square: number): number => Math.floor(square / GRID_W);
export const squareAt = (col: number, row: number): number => row * GRID_W + col;

/** World y for a ground y. */
export const worldY = (gy: number): number => gy * GROUND_SQUASH;

/** The two ends of a fence line, in ground coordinates: [x0, y0, x1, y1]. */
export function edgeEnds(edge: ViewEdge): [number, number, number, number] {
  if (edge.line === 'h') {
    const vy = Math.floor(edge.index / GRID_W);
    const x = edge.index % GRID_W;
    return [x, vy, x + 1, vy];
  }
  const y = Math.floor(edge.index / (GRID_W + 1));
  const vx = edge.index % (GRID_W + 1);
  return [vx, y, vx, y + 1];
}

/** Index of the line along the top of row `vy` (0 to 26) at column `x`. */
export const hIndex = (vy: number, x: number): number => vy * GRID_W + x;
/** Index of the line down the left of column `vx` (0 to 40) at row `y`. */
export const vIndex = (y: number, vx: number): number => y * (GRID_W + 1) + vx;

/** A grid corner's position, in ground coordinates. */
export const cornerXY = (vertex: number): [number, number] => [
  vertex % (GRID_W + 1),
  Math.floor(vertex / (GRID_W + 1)),
];

/** True for anything standing on a line: a fence, a gate or the boundary, up or down. */
export const isFence = (code: number): boolean => code !== VIEW_FENCE.none;
