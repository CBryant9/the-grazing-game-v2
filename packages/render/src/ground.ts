/**
 * The ground under the grass, painted into one picture.
 *
 * Each square has two colours: its open ground (soil, with a little litter)
 * and its sward's base (low leaf over litter or shade), and a share of the
 * ground the sward hides. The picture lays the two down in the pattern the
 * pasture really forms from above (docs/VISUALS.md, "The base of a
 * paddock"): tussocks as clumps with open ground between, a sown carpet as
 * near-continuous leaf with small gaps, crops in drilled rows, lucerne as
 * crowns. As the hidden share rises the clumps grow and join; as it falls
 * the gaps open. Only where the model says the ground is bare is it soil.
 *
 * The colours and the hidden share are blended softly between squares, but
 * never across a fence line or a change of country, so a short paddock
 * beside a rank one keeps a sharp fence-line contrast, and neighbouring
 * squares inside a paddock never jump. A light speckle, crop furrows,
 * fallow clods, leucaena hedgerows and clover flowers are laid on top. The
 * map stretches this picture over the farm.
 *
 * The patterns are fixed for the farm and worked out once, so a new day
 * only blends and thresholds: nothing here runs per frame. It works on a
 * plain block of pixels, so it can be tested without a screen.
 */

import { VIEW_FORM, type FarmView, type ViewForm } from '@gg/shared';
import { blue, green, mix, red, shade } from './colour';
import { TUFTS_PER_SQUARE, clovery, spotPlace, tussocky, type SquareLook } from './grass';
import { GRID_H, GRID_N, GRID_W } from './grid';
import { NATURAL } from './palette';
import { hash2, unit } from './random';

/**
 * Pixels of the ground picture across one square. Eighteen gives a fine
 * enough grain for tussocks, gaps and rows to read when zoomed in (720 by
 * 468 pixels, painted once for each new day) and six pixels to a drill row.
 */
export const GROUND_PX = 18;
export const GROUND_W = GRID_W * GROUND_PX;
export const GROUND_H = GRID_H * GROUND_PX;
const PX2 = GROUND_PX * GROUND_PX;

/** Pixels in each drill row: three rows to a square. */
const ROW_PX = GROUND_PX / 3;

let noise: Float32Array | null = null;

/** A fixed speckle, the same every time, so the ground never shimmers between days. */
function speckle(): Float32Array {
  if (!noise) {
    noise = new Float32Array(GROUND_W * GROUND_H);
    for (let k = 0; k < noise.length; k++) noise[k] = unit(hash2(k, 0x9d1f));
  }
  return noise;
}

// ---------------------------------------------------------------------------
// The patterns: for each pixel, how soon it is hidden as the sward thickens
// ---------------------------------------------------------------------------

/**
 * Which pattern each form is drawn with. Each pattern gives every pixel an
 * order from 0 to 1, spread evenly inside each square, and a pixel is hidden
 * once the square's hidden share passes its order. So the share of hidden
 * pixels in a square is the share the server sent, whatever the pattern.
 */
type Pattern = 'clump' | 'couch' | 'tufts' | 'carpet' | 'clover' | 'crowns' | 'rows';

const PATTERN: Record<ViewForm, Pattern | null> = {
  // Black speargrass and bluegrass tussocks, with Indian couch running between.
  [VIEW_FORM.tropicalTussock]: 'couch',
  // Low tufts of red grass and wallaby grass, weeping grass between.
  [VIEW_FORM.lowTufts]: 'tufts',
  // Speargrass, wallaby grass and kangaroo grass tussocks, open ground between.
  [VIEW_FORM.openTussock]: 'clump',
  // Buffel: big bunch tussocks.
  [VIEW_FORM.bunch]: 'clump',
  // Buffel between leucaena hedgerows (the hedgerows are laid on top).
  [VIEW_FORM.hedgerow]: 'clump',
  // Ryegrass and white clover, or a multi-species mix.
  [VIEW_FORM.carpet]: 'carpet',
  // Phalaris tussocks in a sub clover carpet.
  [VIEW_FORM.tussockClover]: 'clover',
  [VIEW_FORM.crowns]: 'crowns',
  [VIEW_FORM.rows]: 'rows',
  [VIEW_FORM.bare]: null,
};

/** Each pattern's order for each square, worked out when a square first needs it. */
const patterns = new Map<Pattern, (Uint8Array | undefined)[]>();

/** A smooth noise on a lattice `cell` pixels apart, 0 to 1, for every pixel. Fixed for the farm. */
function valueNoiseField(cell: number, salt: number): Float32Array {
  const gw = Math.ceil(GROUND_W / cell) + 2;
  const gh = Math.ceil(GROUND_H / cell) + 2;
  const lat = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) lat[y * gw + x] = unit(hash2(hash2(x, y), salt));
  }
  const out = new Float32Array(GROUND_W * GROUND_H);
  for (let py = 0; py < GROUND_H; py++) {
    const gy = py / cell;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const sy = fy * fy * (3 - 2 * fy);
    for (let px = 0; px < GROUND_W; px++) {
      const gx = px / cell;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const sx = fx * fx * (3 - 2 * fx);
      const o = y0 * gw + x0;
      const a = lat[o]! + (lat[o + 1]! - lat[o]!) * sx;
      const b = lat[o + gw]! + (lat[o + gw + 1]! - lat[o + gw]!) * sx;
      out[py * GROUND_W + px] = a + (b - a) * sy;
    }
  }
  return out;
}

/** Fine grain: single pixels with a softer swirl under them. */
let grainField: Float32Array | null = null;
function grain(): Float32Array {
  if (!grainField) {
    const swirl = valueNoiseField(3, 0x1b7);
    grainField = new Float32Array(GROUND_W * GROUND_H);
    for (let p = 0; p < grainField.length; p++) {
      grainField[p] = 0.6 * unit(hash2(p, 0x51ed)) + 0.4 * swirl[p]!;
    }
  }
  return grainField;
}

/** A coarser swirl that roughens the edge of a clump, so a tussock is not a perfect disc. */
let raggedField: Float32Array | null = null;
const ragged = (): Float32Array => (raggedField ??= valueNoiseField(2, 0x7c3));

/** Where each tuft spot sits on the farm, in squares, and its "stand" number. */
let spotXYS: Float32Array | null = null;
function spotsOnFarm(): Float32Array {
  if (!spotXYS) {
    spotXYS = new Float32Array(GRID_N * TUFTS_PER_SQUARE * 3);
    for (let i = 0; i < GRID_N; i++) {
      for (let k = 0; k < TUFTS_PER_SQUARE; k++) {
        const [fx, fy, stand] = spotPlace(i, k);
        const o = (i * TUFTS_PER_SQUARE + k) * 3;
        spotXYS[o] = (i % GRID_W) + fx;
        spotXYS[o + 1] = Math.floor(i / GRID_W) + fy;
        spotXYS[o + 2] = stand;
      }
    }
  }
  return spotXYS;
}

/** How far a clump can reach from its spot, in squares. Past it a pixel is open ground until the square is nearly hidden. */
const CLUMP_REACH = 0.42;

/**
 * Clumps round the tuft spots, for one square's pixels (`out`, 18 by 18). A
 * pixel's value is its distance to a spot (in squares, over 0.3) plus most
 * of that spot's own "stand" number, so the clumps round the spots whose
 * tufts stand first are the first to show, and grow outwards from there.
 * Spots in the squares round about count too, so a clump is never cut off
 * at a square's edge. Each spot only reaches the pixels near it.
 */
function clumpSquare(col: number, row: number, out: Float32Array): void {
  const spots = spotsOnFarm();
  const rag = ragged();
  out.fill(4);
  const x0 = col * GROUND_PX;
  const y0 = row * GROUND_PX;
  const reachPx = CLUMP_REACH * GROUND_PX;
  for (let r = row - 1; r <= row + 1; r++) {
    if (r < 0 || r >= GRID_H) continue;
    for (let c = col - 1; c <= col + 1; c++) {
      if (c < 0 || c >= GRID_W) continue;
      const base = (r * GRID_W + c) * TUFTS_PER_SQUARE * 3;
      for (let k = 0; k < TUFTS_PER_SQUARE; k++) {
        const o = base + k * 3;
        const sx = spots[o]! * GROUND_PX;
        const sy = spots[o + 1]! * GROUND_PX;
        const stand = 0.85 * spots[o + 2]!;
        const ax = Math.max(0, Math.floor(sx - reachPx - x0));
        const bx = Math.min(GROUND_PX - 1, Math.ceil(sx + reachPx - x0));
        const ay = Math.max(0, Math.floor(sy - reachPx - y0));
        const by = Math.min(GROUND_PX - 1, Math.ceil(sy + reachPx - y0));
        for (let ty = ay; ty <= by; ty++) {
          const dy = y0 + ty + 0.5 - sy;
          for (let tx = ax; tx <= bx; tx++) {
            const dx = x0 + tx + 0.5 - sx;
            const v = Math.sqrt(dx * dx + dy * dy) / (0.3 * GROUND_PX) + stand;
            const q = ty * GROUND_PX + tx;
            if (v < out[q]!) out[q] = v;
          }
        }
      }
    }
  }
  for (let ty = 0; ty < GROUND_PX; ty++) {
    for (let tx = 0; tx < GROUND_PX; tx++) {
      out[ty * GROUND_PX + tx] =
        out[ty * GROUND_PX + tx]! + 0.22 * rag[(y0 + ty) * GROUND_W + x0 + tx]!;
    }
  }
}

/** Lucerne crowns: four to a square each way, each a little off its mark. */
function crownSquare(col: number, row: number, out: Float32Array): void {
  const cell = GROUND_PX / 4;
  out.fill(4);
  const x0 = col * GROUND_PX;
  const y0 = row * GROUND_PX;
  for (let gy = row * 4 - 1; gy <= row * 4 + 4; gy++) {
    for (let gx = col * 4 - 1; gx <= col * 4 + 4; gx++) {
      const h = hash2(gx * 7919 + 13, gy);
      const ox = (gx + 0.25 + 0.5 * unit(hash2(h, 1))) * cell - x0;
      const oy = (gy + 0.25 + 0.5 * unit(hash2(h, 2))) * cell - y0;
      const ax = Math.max(0, Math.floor(ox - cell));
      const bx = Math.min(GROUND_PX - 1, Math.ceil(ox + cell));
      const ay = Math.max(0, Math.floor(oy - cell));
      const by = Math.min(GROUND_PX - 1, Math.ceil(oy + cell));
      for (let ty = ay; ty <= by; ty++) {
        for (let tx = ax; tx <= bx; tx++) {
          const dx = tx + 0.5 - ox;
          const dy = ty + 0.5 - oy;
          const v = Math.sqrt(dx * dx + dy * dy) / cell;
          const q = ty * GROUND_PX + tx;
          if (v < out[q]!) out[q] = v;
        }
      }
    }
  }
  for (let q = 0; q < PX2; q++) {
    const p = (y0 + Math.floor(q / GROUND_PX)) * GROUND_W + x0 + (q % GROUND_PX);
    out[q] = out[q]! + 0.35 * unit(hash2(p, 0x2c9));
  }
}

/** One square's raw values for a pattern, into `out` (18 by 18). */
function rawSquare(
  pattern: Pattern,
  col: number,
  row: number,
  out: Float32Array,
  tmp: Float32Array,
): void {
  const x0 = col * GROUND_PX;
  const y0 = row * GROUND_PX;
  if (pattern === 'crowns') {
    crownSquare(col, row, out);
    return;
  }
  if (pattern === 'rows') {
    // Drill rows: plants fill out from the middle of each row.
    for (let q = 0; q < PX2; q++) {
      const ty = Math.floor(q / GROUND_PX);
      const v = (ty + 0.5) / ROW_PX;
      const d = Math.abs((v % 1) - 0.5) * 2;
      const p = (y0 + ty) * GROUND_W + x0 + (q % GROUND_PX);
      out[q] = d * 0.75 + 0.25 * unit(hash2(p, 0x3e1));
    }
    return;
  }
  // The clump share of each mixed pattern: tussocks with something finer between.
  const clumpShare =
    pattern === 'clump'
      ? 1
      : pattern === 'couch'
        ? 0.7
        : pattern === 'tufts'
          ? 0.45
          : pattern === 'clover'
            ? 0.35
            : 0;
  if (clumpShare > 0) clumpSquare(col, row, tmp);
  const fine = clumpShare < 1 ? grain() : null;
  for (let q = 0; q < PX2; q++) {
    const p = (y0 + Math.floor(q / GROUND_PX)) * GROUND_W + x0 + (q % GROUND_PX);
    const c = clumpShare > 0 ? tmp[q]! / 2.2 : 0;
    out[q] = clumpShare * c + (1 - clumpShare) * (fine ? fine[p]! : 0);
  }
}

const RANK_BINS = 1024;
const scratch = {
  raw: new Float32Array(PX2),
  tmp: new Float32Array(PX2),
  bins: new Uint16Array(RANK_BINS),
};

/**
 * A pattern's order for each pixel of one square, 0 to 255, spread evenly
 * across the square's pixels (they are ranked, by a count into bins), so
 * the share of the square that is hidden is the share the server sent.
 * Worked out the first time the square is drawn with that pattern, then kept.
 */
function squareOrder(pattern: Pattern, i: number): Uint8Array {
  let list = patterns.get(pattern);
  if (!list) {
    list = new Array<Uint8Array | undefined>(GRID_N);
    patterns.set(pattern, list);
  }
  const done = list[i];
  if (done) return done;
  const { raw, tmp, bins } = scratch;
  rawSquare(pattern, i % GRID_W, Math.floor(i / GRID_W), raw, tmp);
  let lo = Infinity;
  let hi = -Infinity;
  for (let q = 0; q < PX2; q++) {
    const v = raw[q]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const scale = hi > lo ? (RANK_BINS - 1) / (hi - lo) : 0;
  bins.fill(0);
  for (let q = 0; q < PX2; q++) {
    const b = Math.floor((raw[q]! - lo) * scale);
    bins[b] = bins[b]! + 1;
  }
  // Each bin's pixels take the middle of the ranks they share.
  let below = 0;
  for (let b = 0; b < RANK_BINS; b++) {
    const n = bins[b]!;
    bins[b] = below * 2 + n; // twice the mid rank, kept whole
    below += n;
  }
  const out = new Uint8Array(PX2);
  for (let q = 0; q < PX2; q++) {
    const mid2 = bins[Math.floor((raw[q]! - lo) * scale)]!;
    out[q] = Math.min(255, Math.round((mid2 / 2 / PX2) * 256));
  }
  list[i] = out;
  return out;
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** Squares blend together only inside one paddock, one kind of country and one planting. */
function blendKeys(view: FarmView, looks: readonly SquareLook[]): Int32Array {
  const keys = new Int32Array(GRID_N);
  const code = { pasture: 0, sown: 0, crop: 1, fallow: 2, stubble: 3 } as const;
  for (let i = 0; i < GRID_N; i++) {
    const kind = code[looks[i]!.kind];
    const planting = view.squares.planting[i] ?? 0;
    keys[i] = (view.squares.paddock[i] ?? 0) * 4096 + planting * 4 + kind;
  }
  return keys;
}

/** Each pixel of a square: which corner of the square it is in, and how much it takes from each neighbour. */
interface Blend {
  /** 0 top left, 1 top right, 2 bottom left, 3 bottom right. */
  quad: Uint8Array;
  /** Weights: self, across, down, diagonal. */
  w: Float32Array;
}
let blendTable: Blend | null = null;
function blends(): Blend {
  if (blendTable) return blendTable;
  const quad = new Uint8Array(PX2);
  const w = new Float32Array(PX2 * 4);
  for (let ty = 0; ty < GROUND_PX; ty++) {
    for (let tx = 0; tx < GROUND_PX; tx++) {
      const k = ty * GROUND_PX + tx;
      const u = (tx + 0.5) / GROUND_PX - 0.5;
      const v = (ty + 0.5) / GROUND_PX - 0.5;
      quad[k] = (u < 0 ? 0 : 1) + (v < 0 ? 0 : 2);
      const wx = Math.abs(u);
      const wy = Math.abs(v);
      w[k * 4] = (1 - wx) * (1 - wy);
      w[k * 4 + 1] = wx * (1 - wy);
      w[k * 4 + 2] = (1 - wx) * wy;
      w[k * 4 + 3] = wx * wy;
    }
  }
  blendTable = { quad, w };
  return blendTable;
}

/** Leucaena hedgerows: two to a square, two pixels wide, on these pixel rows of a square. */
const HEDGE_ROW = new Uint8Array(GROUND_PX);
for (const r of [4, 5, 13, 14]) HEDGE_ROW[r] = 1;

/**
 * Paint the ground for the whole farm into `out`: GROUND_W by GROUND_H
 * pixels, four bytes each (red, green, blue, alpha). `fromRow` and `toRow`
 * paint only those rows of squares (to, not including), so a map can spread
 * a new day's picture over a few frames.
 */
export function paintGround(
  view: FarmView,
  looks: readonly SquareLook[],
  out: Uint8ClampedArray,
  fromRow = 0,
  toRow = GRID_H,
): void {
  const n = speckle();
  const keys = blendKeys(view, looks);
  const { quad: QUAD, w: W } = blends();
  // Per square: open ground, sward base, hidden share.
  const BR = new Float32Array(GRID_N);
  const BG = new Float32Array(GRID_N);
  const BB = new Float32Array(GRID_N);
  const SR = new Float32Array(GRID_N);
  const SG = new Float32Array(GRID_N);
  const SB = new Float32Array(GRID_N);
  const H = new Float32Array(GRID_N);
  for (let i = 0; i < GRID_N; i++) {
    const l = looks[i]!;
    BR[i] = red(l.bare);
    BG[i] = green(l.bare);
    BB[i] = blue(l.bare);
    SR[i] = red(l.base);
    SG[i] = green(l.base);
    SB[i] = blue(l.base);
    H[i] = l.cover;
  }
  const clodBoost = red(NATURAL.fallowClod) / red(NATURAL.fallow);
  const fr = red(NATURAL.clover);
  const fg = green(NATURAL.clover);
  const fb = blue(NATURAL.clover);
  // The neighbours each corner of a square blends with (across, down,
  // diagonal), or -1 where they are off the farm or across a fence.
  const nb = new Int32Array(12);

  for (let row = Math.max(0, fromRow); row < Math.min(GRID_H, toRow); row++) {
    for (let col = 0; col < GRID_W; col++) {
      const i = row * GRID_W + col;
      const look = looks[i]!;
      const key = keys[i]!;
      for (let q = 0; q < 4; q++) {
        const dx = q & 1 ? 1 : -1;
        const dy = q & 2 ? 1 : -1;
        const okX = col + dx >= 0 && col + dx < GRID_W;
        const okY = row + dy >= 0 && row + dy < GRID_H;
        const jx = i + dx;
        const jy = i + dy * GRID_W;
        const jd = jy + dx;
        nb[q * 3] = okX && keys[jx] === key ? jx : -1;
        nb[q * 3 + 1] = okY && keys[jy] === key ? jy : -1;
        nb[q * 3 + 2] = okX && okY && keys[jd] === key ? jd : -1;
      }
      const pattern = look.kind === 'fallow' ? null : PATTERN[look.form];
      const order = pattern ? squareOrder(pattern, i) : null;
      const tussock = tussocky(look.form);
      const clover = clovery(look.form) && look.greenShare > 0.4;
      const fallow = look.kind === 'fallow';
      // Leucaena keeps its leaf well into the dry: dark green, going to straw only as the green goes.
      const hedgeColour =
        look.form === VIEW_FORM.hedgerow
          ? shade(
              mix(
                look.straw,
                mix(look.leaf, NATURAL.leafOld, 0.6),
                Math.min(1, look.greenShare * 2),
              ),
              0.62,
            )
          : -1;
      const hr = red(hedgeColour);
      const hg = green(hedgeColour);
      const hb = blue(hedgeColour);
      for (let ty = 0; ty < GROUND_PX; ty++) {
        const py = row * GROUND_PX + ty;
        // Three furrows to a square on cropping country, between the drill rows.
        const inRow = ty % ROW_PX;
        const furrow = look.rows && (inRow === 0 || inRow === ROW_PX - 1);
        const hedgeRow = hedgeColour >= 0 && HEDGE_ROW[ty] === 1;
        for (let tx = 0; tx < GROUND_PX; tx++) {
          const k = ty * GROUND_PX + tx;
          const q3 = QUAD[k]! * 3;
          // This square, then its neighbours across, down and diagonal, where they match.
          let w = W[k * 4]!;
          let sum = w;
          let br = BR[i]! * w;
          let bg = BG[i]! * w;
          let bb = BB[i]! * w;
          let sr = SR[i]! * w;
          let sg = SG[i]! * w;
          let sb = SB[i]! * w;
          let h = H[i]! * w;
          for (let m = 0; m < 3; m++) {
            const j = nb[q3 + m]!;
            if (j < 0) continue;
            w = W[k * 4 + 1 + m]!;
            sum += w;
            br += BR[j]! * w;
            bg += BG[j]! * w;
            bb += BB[j]! * w;
            sr += SR[j]! * w;
            sg += SG[j]! * w;
            sb += SB[j]! * w;
            h += H[j]! * w;
          }
          const inv = 1 / sum;
          const hidden = h * inv;
          const px = col * GROUND_PX + tx;
          const p = py * GROUND_W + px;
          // Hidden once the share passes this pixel's order, with a soft edge.
          let t: number;
          let depth = 1;
          if (!order) t = hidden;
          else if (hidden >= 0.995) t = 1;
          else if (hidden <= 0.005) t = 0;
          else {
            const d = hidden - (order[k]! + 0.5) / 256;
            t = d * 14 + 0.5;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            // Into a tussock the leaf is thicker and catches the light; its edge is in shade.
            if (tussock && t > 0.5) depth = 0.9 + 0.16 * Math.min(1, Math.max(0, d / 0.22));
          }
          let r = (br + (sr - br) * t) * inv;
          let g = (bg + (sg - bg) * t) * inv;
          let b = (bb + (sb - bb) * t) * inv;
          const nz = n[p]!;
          let f = (nz < 0.25 ? 0.92 : nz > 0.85 ? 1.07 : 1) * depth;
          if (furrow) f *= 0.8;
          // Fallow: a few lighter clods.
          if (fallow && nz > 0.94) f *= clodBoost;
          if (clover && t > 0.9 && nz > 0.993) {
            // A white clover flower.
            r += (fr - r) * 0.7;
            g += (fg - g) * 0.7;
            b += (fb - b) * 0.7;
          }
          if (hedgeRow) {
            // A leucaena hedgerow: thinner where it has been browsed hard.
            const a = 0.8 * Math.min(1, 0.35 + hidden);
            r += (hr - r) * a;
            g += (hg - g) * a;
            b += (hb - b) * a;
          }
          const o = p * 4;
          out[o] = r * f;
          out[o + 1] = g * f;
          out[o + 2] = b * f;
          out[o + 3] = 255;
        }
      }
    }
  }
}
