/**
 * The ground under the grass, painted into one small picture.
 *
 * Each square's floor colour (the ground with the sward over it, or fallow
 * or stubble) is blended softly into its neighbours, but never across a fence
 * line or a change of country, so a short paddock beside a rank one keeps a
 * sharp fence-line contrast. A light speckle, crop rows and fallow clods are
 * laid on top. The map stretches this picture over the farm.
 *
 * It works on a plain block of pixels, so it can be tested without a screen.
 */

import type { FarmView } from '@gg/shared';
import { blue, green, red } from './colour';
import type { SquareLook } from './grass';
import { GRID_H, GRID_N, GRID_W } from './grid';
import { NATURAL } from './palette';
import { hash2, unit } from './random';

/** Pixels of the ground picture across one square. */
export const GROUND_PX = 16;
export const GROUND_W = GRID_W * GROUND_PX;
export const GROUND_H = GRID_H * GROUND_PX;

let noise: Float32Array | null = null;

/** A fixed speckle, the same every time, so the ground never shimmers between days. */
function speckle(): Float32Array {
  if (!noise) {
    noise = new Float32Array(GROUND_W * GROUND_H);
    for (let k = 0; k < noise.length; k++) noise[k] = unit(hash2(k, 0x9d1f));
  }
  return noise;
}

/** Squares blend together only inside one paddock, one kind of country and one planting. */
function blendKeys(view: FarmView, looks: readonly SquareLook[]): Int32Array {
  const keys = new Int32Array(GRID_N);
  const code = { pasture: 0, sown: 0, crop: 1, fallow: 2, stubble: 3 } as const;
  for (let i = 0; i < GRID_N; i++) {
    const kind = code[looks[i]!.kind];
    const planting = kind === 1 ? (view.squares.planting[i] ?? 0) : 0;
    keys[i] = (view.squares.paddock[i] ?? 0) * 4096 + planting * 4 + kind;
  }
  return keys;
}

/**
 * Paint the ground for the whole farm into `out`: GROUND_W by GROUND_H
 * pixels, four bytes each (red, green, blue, alpha).
 */
export function paintGround(
  view: FarmView,
  looks: readonly SquareLook[],
  out: Uint8ClampedArray,
): void {
  const n = speckle();
  const keys = blendKeys(view, looks);
  const R = new Float32Array(GRID_N);
  const G = new Float32Array(GRID_N);
  const B = new Float32Array(GRID_N);
  for (let i = 0; i < GRID_N; i++) {
    const c = looks[i]!.floor;
    R[i] = red(c);
    G[i] = green(c);
    B[i] = blue(c);
  }
  const clodBoost = red(NATURAL.fallowClod) / red(NATURAL.fallow);

  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      const i = row * GRID_W + col;
      const look = looks[i]!;
      const key = keys[i]!;
      for (let ty = 0; ty < GROUND_PX; ty++) {
        const v = (ty + 0.5) / GROUND_PX - 0.5;
        const dy = v < 0 ? -1 : 1;
        const wy = Math.abs(v);
        const rowB = row + dy;
        const py = row * GROUND_PX + ty;
        // Three furrows to a square on cropping country.
        const furrow = look.rows && (ty * 3) % GROUND_PX < 3;
        for (let tx = 0; tx < GROUND_PX; tx++) {
          const u = (tx + 0.5) / GROUND_PX - 0.5;
          const dx = u < 0 ? -1 : 1;
          const wx = Math.abs(u);
          const colB = col + dx;
          // This square, then its neighbours across, down and diagonal, where they match.
          let w = (1 - wx) * (1 - wy);
          let r = R[i]! * w;
          let g = G[i]! * w;
          let b = B[i]! * w;
          let sum = w;
          const okX = colB >= 0 && colB < GRID_W;
          const okY = rowB >= 0 && rowB < GRID_H;
          if (okX) {
            const j = i + dx;
            if (keys[j] === key) {
              w = wx * (1 - wy);
              r += R[j]! * w;
              g += G[j]! * w;
              b += B[j]! * w;
              sum += w;
            }
          }
          if (okY) {
            const j = i + dy * GRID_W;
            if (keys[j] === key) {
              w = (1 - wx) * wy;
              r += R[j]! * w;
              g += G[j]! * w;
              b += B[j]! * w;
              sum += w;
            }
          }
          if (okX && okY) {
            const j = i + dy * GRID_W + dx;
            if (keys[j] === key) {
              w = wx * wy;
              r += R[j]! * w;
              g += G[j]! * w;
              b += B[j]! * w;
              sum += w;
            }
          }
          const px = col * GROUND_PX + tx;
          const nz = n[py * GROUND_W + px]!;
          let f = nz < 0.25 ? 0.9 : nz > 0.85 ? 1.08 : 1;
          if (furrow) f *= 0.8;
          // Fallow: a few lighter clods.
          if (look.kind === 'fallow' && nz > 0.94) f *= clodBoost;
          f /= sum;
          const p = (py * GROUND_W + px) * 4;
          out[p] = r * f;
          out[p + 1] = g * f;
          out[p + 2] = b * f;
          out[p + 3] = 255;
        }
      }
    }
  }
}
