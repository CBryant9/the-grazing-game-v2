/**
 * Arable land and the starting rotation.
 *
 * Arable land is one natural patch of better country, sometimes with a
 * smaller patch elsewhere. On a mixed farm the cropping rotation sits inside
 * it as square blocks, at a stage that suits the start month (REQUIREMENTS,
 * Crops and pastures). These are the MVP's blobGrow, genArable and
 * startCropping, drawing their random numbers in the same order.
 */

import { dateAt } from '../calendar';
import { ROTATIONS } from '../data/crops';
import { SPECIES } from '../data/species';
import { GRID_H, GRID_N, GRID_W } from '../grid';
import { lerp } from '../num';
import { LAND, type PastureState } from '../pasture/state';
import type { Rng } from '../rng';
import { addField, type CropContext, type CropState, type Field } from './fields';

/**
 * Grow a natural-looking patch outwards from seed squares until `target`
 * more squares are in it. Squares in the patch are marked 2 in `mark`.
 * Returns how many squares are marked.
 *
 * One fix against the MVP: the seed squares are always part of the patch.
 * The MVP left them out when there was nothing more to add, which gave a
 * mixed farm rotation blocks on land that was not arable.
 */
export function blobGrow(
  seeds: readonly number[],
  target: number,
  mark: Uint8Array,
  rng: Rng,
): number {
  if (!seeds.length) return 0;
  if (target <= 0) {
    let marked = 0;
    for (const i of seeds) mark[i] = 2;
    for (let i = 0; i < GRID_N; i++) if (mark[i] === 2) marked++;
    return marked;
  }
  // Smooth noise, so the patch follows "better country" and is not a circle.
  const v = new Float32Array(GRID_N);
  const gx = 5;
  const gy = 4;
  const c: number[] = [];
  for (let k = 0; k < (gx + 1) * (gy + 1); k++) c.push(rng.next());
  const q = (a: number, b: number): number => c[b * (gx + 1) + a]!;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const fx = (x / (GRID_W - 1)) * gx;
      const fy = (y / (GRID_H - 1)) * gy;
      const ix = Math.min(gx - 1, Math.floor(fx));
      const iy = Math.min(gy - 1, Math.floor(fy));
      const tx = fx - ix;
      const ty = fy - iy;
      v[y * GRID_W + x] = lerp(
        lerp(q(ix, iy), q(ix + 1, iy), tx),
        lerp(q(ix, iy + 1), q(ix + 1, iy + 1), tx),
        ty,
      );
    }
  }
  let mx = 0;
  let my = 0;
  for (const i of seeds) {
    mx += i % GRID_W;
    my += (i / GRID_W) | 0;
  }
  mx /= seeds.length;
  my /= seeds.length;
  // The squares next to the patch. The order they were added in is the
  // order they are scored in, so this must stay a Set.
  const front = new Set<number>();
  let n = 0;
  const add = (i: number): void => {
    if (mark[i] === 2) return;
    if (mark[i] !== 1) n++;
    mark[i] = 2;
    front.delete(i);
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    for (const j of [
      x < GRID_W - 1 ? i + 1 : -1,
      x > 0 ? i - 1 : -1,
      y < GRID_H - 1 ? i + GRID_W : -1,
      y > 0 ? i - GRID_W : -1,
    ]) {
      if (j >= 0 && mark[j] !== 2) front.add(j);
    }
  };
  for (const i of seeds) {
    if (mark[i] !== 2) {
      mark[i] = 1;
      add(i);
    }
  }
  n = 0;
  for (let i = 0; i < GRID_N; i++) if (mark[i] === 2) n++;
  const start = n;
  while (n - start < target && front.size) {
    let best = -1;
    let bs = -1e9;
    for (const j of front) {
      const d = Math.hypot((j % GRID_W) - mx, ((j / GRID_W) | 0) - my);
      // Better country first, close to the middle first, with some chance.
      const sc = v[j]! * 1.4 - 0.07 * d + rng.next() * 0.15;
      if (sc > bs) {
        bs = sc;
        best = j;
      }
    }
    if (best < 0) break;
    add(best);
  }
  return n;
}

export interface ArableLand {
  /** 1 where the land is arable, for each square. */
  arable: Uint8Array;
  /** The rotation blocks of a mixed farm: one for each crop in the rotation and one for fallow. */
  rotBlocks: number[][];
  /** Arable squares. */
  squares: number;
}

/**
 * Lay out the arable land. `pct` is the arable share of the farm, %.
 * `cropPct` is the share of the arable land in the cropping rotation, %, or
 * 0 for a grazing farm.
 */
export function genArable(
  district: keyof typeof ROTATIONS,
  pct: number,
  cropPct: number,
  rng: Rng,
): ArableLand {
  const arable = new Uint8Array(GRID_N);
  const rotBlocks: number[][] = [];
  const total = Math.round((GRID_N * pct) / 100);
  if (!total) return { arable, rotBlocks, squares: 0 };
  const mark = new Uint8Array(GRID_N);
  let seeds: number[] = [];
  if (cropPct) {
    // Square blocks side by side, as near to square overall as they fit.
    const C = Math.max(1, Math.round((total * cropPct) / 100));
    const nb = ROTATIONS[district].length + 1;
    const cols = Math.ceil(Math.sqrt(nb));
    const rows = Math.ceil(nb / cols);
    let side = Math.max(1, Math.round(Math.sqrt(C / nb)));
    side = Math.max(
      1,
      Math.min(side, Math.floor((GRID_W - 2) / cols), Math.floor((GRID_H - 2) / rows)),
    );
    const x0 = rng.int(1, GRID_W - 1 - cols * side);
    const y0 = rng.int(1, GRID_H - 1 - rows * side);
    for (let b = 0; b < nb; b++) {
      const bx = x0 + (b % cols) * side;
      const by = y0 + Math.floor(b / cols) * side;
      const cells: number[] = [];
      for (let y = by; y < by + side; y++) {
        for (let x = bx; x < bx + side; x++) cells.push(y * GRID_W + x);
      }
      rotBlocks.push(cells);
      seeds.push(...cells);
    }
  } else {
    const row = rng.int(3, GRID_H - 4);
    seeds = [row * GRID_W + rng.int(3, GRID_W - 4)];
  }
  // Sometimes a smaller second patch takes 18% of the arable land.
  const second = total > 16 && rng.next() < 0.45;
  const mainT = Math.max(0, Math.round(total * (second ? 0.82 : 1)) - seeds.length);
  blobGrow(seeds, mainT, mark, rng);
  if (second) {
    let s2: number;
    do {
      const row = rng.int(2, GRID_H - 3);
      s2 = row * GRID_W + rng.int(2, GRID_W - 3);
    } while (mark[s2]);
    blobGrow([s2], total - Math.round(total * 0.82) - 1, mark, rng);
  }
  let n = 0;
  for (let i = 0; i < GRID_N; i++) {
    if (mark[i] === 2) {
      arable[i] = 1;
      n++;
    }
  }
  return { arable, rotBlocks, squares: n };
}

/**
 * Put a mixed farm part-way through its rotation for the start day. Every
 * rotation block starts as bare fallow. Each crop whose sowing window was
 * open within its own life is then in the ground, at the stage it would
 * have reached. The last block stays in fallow. Returns the plantings made.
 */
export function startCropping(
  crops: CropState,
  pasture: PastureState,
  ctx: CropContext,
  day: number,
): Field[] {
  const rot = ROTATIONS[ctx.district];
  const blocks = crops.rotBlocks;
  const made: Field[] = [];
  if (!blocks.length) return made;
  for (const b of blocks) {
    for (const i of b) {
      pasture.land[i] = LAND.fallow;
      pasture.G[i] = 0;
      pasture.D[i] = 0;
      pasture.X[i] = 0;
    }
  }
  for (let b = 0; b < rot.length; b++) {
    const cells = blocks[b] ?? [];
    if (!cells.length) continue;
    const key = rot[b]!;
    const sp = SPECIES[key];
    const life = (sp.type === 'crop' ? sp.mature : sp.life)!;
    // The most recent day its sowing window was open. If that is not today,
    // it was sown 10 days before the window closed.
    let sown: number | null = null;
    for (let back = 0; back <= life; back++) {
      const d = day - back;
      if (sp.sow.includes(dateAt(ctx.start, d).month)) {
        sown = d - (back === 0 ? 0 : 10);
        break;
      }
    }
    if (sown === null) continue;
    const f = addField(crops, pasture, ctx, key, cells, sown, { keep: true });
    const t = day - sown;
    const head = sp.head || life * 0.75;
    for (const i of cells) {
      if (t < sp.estab) {
        pasture.G[i] = 40 + t * 6;
        pasture.D[i] = 150;
      } else if (t < head) {
        pasture.G[i] = Math.min((sp.bmax || 9000) * 0.45, 500 + (t - sp.estab) * 40);
        pasture.D[i] = 150;
      } else {
        pasture.G[i] = 1800;
        pasture.D[i] = 1500;
      }
      pasture.A[i] = t < head ? 12 : 60;
    }
    made.push(f);
  }
  return made;
}
