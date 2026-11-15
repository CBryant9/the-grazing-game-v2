/**
 * The country round the farm: bush, painted as one small tile that repeats
 * (mockup, map code: the `bush` pattern). The farm sits in it, so it never
 * floats in an empty field. It is scenery only. It carries no game figure
 * and nothing on it can be tapped.
 *
 * It works on a plain block of pixels, so it can be tested without a screen.
 */

import { blue, green, red } from './colour';
import { scatter } from './random';

/** Pixels across the tile. The mockup's bush tile is 64 pixels. */
export const SURROUND_TILE = 64;

/**
 * World units across one tile once zoomed in far enough. Zoomed out, the tile
 * keeps its 64 screen pixels; zoomed in past that, it grows with the farm.
 */
export const SURROUND_TILE_UNITS = 6;

/** How much the tile is scaled at a zoom (screen pixels per square). Never below 1. */
export const surroundScale = (zoom: number): number =>
  Math.max(1, (zoom * SURROUND_TILE_UNITS) / SURROUND_TILE);

/**
 * Paint the bush tile into `out` (SURROUND_TILE by SURROUND_TILE pixels, four
 * bytes each): the base colour, then 60 soft clumps in the speck colours,
 * wrapped at the edges so the tile repeats without a seam. Always the same
 * picture for the same colours.
 */
export function paintSurround(
  base: number,
  specks: readonly number[],
  out: Uint8ClampedArray,
): void {
  const N = SURROUND_TILE;
  for (let p = 0; p < N * N * 4; p += 4) {
    out[p] = red(base);
    out[p + 1] = green(base);
    out[p + 2] = blue(base);
    out[p + 3] = 255;
  }
  if (specks.length === 0) return;
  const rnd = scatter(0x5b1d);
  const alpha = 0.6;
  for (let i = 0; i < 60; i++) {
    const c = specks[Math.floor(rnd() * specks.length)]!;
    const cx = rnd() * N;
    const cy = rnd() * N;
    const r = 2 + rnd() * 5;
    const ry = r * 0.7;
    const R = red(c);
    const G = green(c);
    const B = blue(c);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = (x + 0.5 - cx) / r;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const px = ((x % N) + N) % N;
        const py = ((y % N) + N) % N;
        const p = (py * N + px) * 4;
        out[p] = out[p]! + (R - out[p]!) * alpha;
        out[p + 1] = out[p + 1]! + (G - out[p + 1]!) * alpha;
        out[p + 2] = out[p + 2]! + (B - out[p + 2]!) * alpha;
      }
    }
  }
}
