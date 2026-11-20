/**
 * The map's sprites, drawn in code (the clean illustrated style, PRD 7).
 *
 * Smooth shapes with a dark outline and a soft shadow, drawn large and
 * scaled down smoothly. Each one is registered by name, so it can be
 * swapped for exported art later without touching the map code.
 *
 * Grass pieces are drawn in greys. The map tints them with the colours it
 * works out from the model, so one drawn piece serves every pasture state.
 */

import type { ViewCattleKind, ViewSheepKind } from '@gg/shared';
import type { BodyShape } from '../cattle';
import { css, cssA, shade } from '../colour';
import {
  CATTLE,
  NATURAL,
  RAM_HORN,
  SHEEP,
  THIN_FLEECE,
  type CattleBreed,
  type CattleColours,
} from '../palette';
import { scatter } from '../random';
import { SpriteRegistry, type SpriteDef } from './registry';

type Ctx = CanvasRenderingContext2D;

/** The name of a cattle sprite. Calves have one shape. */
export const cattleSprite = (breed: CattleBreed, kind: ViewCattleKind, shape: BodyShape): string =>
  `cattle.${breed}.${kind}.${kind === 'calf' ? 'normal' : shape}`;

export const TUFT_VARIANTS = 3;

/**
 * Texture pixels for one square across, for cattle, before the map sizes
 * them. The map draws each beast near its real size against the paddock
 * (cattle.ts, `cowPx`), so this is only the size a sprite has on its own.
 */
const CATTLE_PPU = 210;

/** A cattle sprite is this many times as wide as the beast's body is long. The map sizes by body length. */
export const CATTLE_W_PER_BODY = 1.3;
/** A sheep sprite is this many times as wide as the sheep's body is long. */
export const SHEEP_W_PER_BODY = 1.55;

/**
 * Below this many screen pixels long, an animal is drawn from its small
 * sprite (`smallSprite`): the same animal with a heavier line and rim, so
 * the pale rim and the dark line stay at least `MIN_RIM_PX` wide on screen
 * at every small size. At full size each would be a fraction of a pixel.
 */
export const SMALL_SPRITE_BELOW_PX = 10;
/** The least the pale rim, and the dark line inside it, are drawn on screen, CSS pixels. */
export const MIN_RIM_PX = 1;
/** The name of an animal's small sprite. */
export const smallSprite = (id: string): string => `${id}.small`;
/** A small sprite's body length in texture pixels, for a cow or a ewe (others in proportion). */
const SMALL_LEN = 30;

/**
 * Line widths for a small sprite of body length `len` texture pixels: the
 * width of the rim ring outside the dark line is `MIN_RIM_PX` on screen when
 * the animal is drawn `SMALL_SPRITE_BELOW_PX` long, and more below that.
 * `ring` is how many line widths the ring is in that painter.
 */
const smallLine = (len: number, ring: number): number =>
  (len * MIN_RIM_PX) / SMALL_SPRITE_BELOW_PX / ring;

/** The zoomed-out dot for a beast or a sheep, and its size in texture pixels. */
export const DOT_SPRITE = { cattle: 'dot.cattle', sheep: 'dot.sheep' } as const;
export const DOT_TEXTURE_PX = 16;

const N = NATURAL;

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function oval(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.28): void {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  oval(ctx, x, y, rx, ry);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Cattle
// ---------------------------------------------------------------------------

interface BeastArt {
  colours: CattleColours;
  breed: CattleBreed;
  kind: ViewCattleKind;
  shape: BodyShape;
  /** Body length in texture pixels. */
  len: number;
  /** The line width, texture pixels, for a small sprite. Left out: worked out from the length. */
  lw?: number;
}

function paintBeast(ctx: Ctx, W: number, H: number, art: BeastArt): void {
  const L = art.len;
  const c = art.colours;
  const brahman = art.breed === 'brahman';
  const bull = art.kind === 'bull';
  const deep = art.shape === 'thin' ? 0.82 : art.shape === 'fat' ? 1.18 : 1;
  const lw = art.lw ?? Math.max(1.6, L * 0.045);
  const bodyH = L * 0.42 * deep;
  const bodyTop = -L * 0.21 - bodyH;
  const legX = [-0.33, -0.19, 0.15, 0.27];

  ctx.save();
  ctx.translate(W / 2 - L * 0.05, H - 8);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  shadow(ctx, 0, 1, L * 0.5, L * 0.1, 0.3);

  const hump = (): void =>
    oval(ctx, L * 0.13, bodyTop + L * 0.03, L * (bull ? 0.17 : 0.13), L * (bull ? 0.13 : 0.09));
  const crest = (): void => oval(ctx, L * 0.18, bodyTop + L * 0.07, L * 0.17, L * 0.11);
  const body = (): void =>
    rrect(ctx, -L * 0.45, bodyTop, L * 0.82, bodyH, L * (art.shape === 'fat' ? 0.2 : 0.16));
  const head = (): void => rrect(ctx, L * 0.3, bodyTop - L * 0.09, L * 0.27, L * 0.25, L * 0.08);
  const legs = (): void => {
    ctx.beginPath();
    for (const lx of legX) ctx.rect(L * lx, -L * 0.26, L * 0.085, L * 0.26);
  };
  const pieces: (() => void)[] = [legs, body, head];
  if (brahman) pieces.push(hump);
  else if (bull) pieces.push(crest);

  // A thin pale rim outside the dark line, so the beast reads on dark ground.
  ctx.strokeStyle = css(N.cattleHalo);
  ctx.lineWidth = lw * 3.2;
  for (const piece of pieces) {
    piece();
    ctx.stroke();
  }

  ctx.strokeStyle = css(N.cattleOutline);
  ctx.lineWidth = lw;
  // Tail.
  ctx.beginPath();
  ctx.moveTo(-L * 0.44, bodyTop + L * 0.08);
  ctx.quadraticCurveTo(-L * 0.53, bodyTop + L * 0.2, -L * 0.5, -L * 0.2);
  ctx.stroke();

  ctx.fillStyle = css(c.legs);
  legs();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = css(c.body);
  if (brahman) {
    hump();
    ctx.fill();
    ctx.stroke();
  } else if (bull) {
    crest();
    ctx.fill();
    ctx.stroke();
  }
  body();
  ctx.fill();
  ctx.stroke();

  if (c.underline >= 0) {
    ctx.fillStyle = css(c.underline);
    rrect(ctx, -L * 0.24, -L * 0.3, L * 0.5, L * 0.075, L * 0.04);
    ctx.fill();
  }
  if (c.topline >= 0) {
    ctx.strokeStyle = cssA(c.topline, 0.75);
    ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    ctx.moveTo(-L * 0.32, bodyTop + lw * 1.4);
    ctx.lineTo(L * 0.2, bodyTop + lw * 1.4);
    ctx.stroke();
    ctx.strokeStyle = css(N.cattleOutline);
    ctx.lineWidth = lw;
  }
  if (art.shape === 'thin') {
    // Ribs and a hip bone showing.
    ctx.strokeStyle = cssA(N.cattleOutline, 0.55);
    ctx.lineWidth = lw * 0.7;
    for (const rx of [-0.12, -0.02, 0.08]) {
      ctx.beginPath();
      ctx.moveTo(L * rx, bodyTop + bodyH * 0.25);
      ctx.lineTo(L * (rx - 0.03), bodyTop + bodyH * 0.8);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-L * 0.36, bodyTop + bodyH * 0.2);
    ctx.lineTo(-L * 0.3, bodyTop + bodyH * 0.42);
    ctx.stroke();
    ctx.strokeStyle = css(N.cattleOutline);
    ctx.lineWidth = lw;
  }

  ctx.fillStyle = css(c.head);
  head();
  ctx.fill();
  ctx.stroke();
  // Ear: long and drooping on a Brahman, small on a British breed.
  ctx.fillStyle = css(brahman ? c.legs : c.body);
  if (brahman) oval(ctx, L * 0.335, bodyTop + L * 0.085, L * 0.04, L * 0.085, 0.5);
  else oval(ctx, L * 0.33, bodyTop - L * 0.08, L * 0.055, L * 0.04, -0.3);
  ctx.fill();
  ctx.lineWidth = lw * 0.6;
  ctx.stroke();
  // Eye.
  ctx.fillStyle = css(N.cattleOutline);
  oval(ctx, L * 0.48, bodyTop - L * 0.005, L * 0.018, L * 0.018);
  ctx.fill();
  ctx.restore();
}

function addCattle(reg: SpriteRegistry): void {
  const shapes: BodyShape[] = ['thin', 'normal', 'fat'];
  for (const breed of ['british', 'brahman'] as const) {
    for (const kind of ['cow', 'heifer', 'steer', 'bull', 'calf'] as const) {
      const size = kind === 'bull' ? 1.14 : kind === 'calf' ? 0.58 : kind === 'heifer' ? 0.92 : 1;
      const len = Math.round(88 * size);
      const w = Math.round(len * CATTLE_W_PER_BODY);
      const h = Math.round(len * 1.02) + 10;
      // The small sprite: the pale rim sits 1.1 line widths outside the dark line.
      const sLen = Math.round(SMALL_LEN * size);
      const sLw = smallLine(sLen, 1.1);
      const sPad = Math.ceil(sLw * 1.6) + 1;
      const sw = Math.round(sLen * CATTLE_W_PER_BODY) + sPad * 2;
      const sh = Math.round(sLen * 1.02) + 10 + sPad;
      for (const shape of kind === 'calf' ? (['normal'] as const) : shapes) {
        const id = cattleSprite(breed, kind, shape);
        const colours = CATTLE[breed][kind];
        reg.set(id, {
          w,
          h,
          ax: 0.5,
          ay: (h - 8) / h,
          ppu: CATTLE_PPU,
          body: len,
          paint: (ctx, W, H) => paintBeast(ctx, W, H, { colours, breed, kind, shape, len }),
        });
        reg.set(smallSprite(id), {
          w: sw,
          h: sh,
          ax: 0.5,
          ay: (sh - 8) / sh,
          ppu: CATTLE_PPU,
          body: sLen,
          paint: (ctx, W, H) =>
            paintBeast(ctx, W, H, { colours, breed, kind, shape, len: sLen, lw: sLw }),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Sheep
// ---------------------------------------------------------------------------

/** The name of a sheep sprite. Lambs have one shape. */
export const sheepSprite = (kind: ViewSheepKind, thin: boolean): string =>
  `sheep.${kind}.${kind !== 'lamb' && thin ? 'thin' : 'normal'}`;

/** Texture pixels for one square across, for sheep. A ewe's body is about a quarter of a square long. */
const SHEEP_PPU = 210;

interface SheepArt {
  kind: ViewSheepKind;
  thin: boolean;
  /** Body length in texture pixels. */
  len: number;
  /** The line width, texture pixels, for a small sprite. Left out: worked out from the length. */
  lw?: number;
}

/**
 * A sheep seen from the side: a rounded woolly body made of overlapping
 * lobes, a small dark grey head, thin dark legs. The pieces are outlined as
 * one shape (dark line, then a thin pale rim outside it), so a flock never
 * blurs into straw or grass, and the bumpy outline reads as wool at any
 * zoom, where a cow is a long smooth box.
 */
function paintSheep(ctx: Ctx, W: number, H: number, art: SheepArt): void {
  const L = art.len;
  const c = SHEEP[art.kind];
  const lamb = art.kind === 'lamb';
  const ram = art.kind === 'ram';
  const thin = art.thin && !lamb;
  const lw = art.lw ?? Math.max(1.5, L * 0.05);
  const fleece = thin ? shade(c.fleece, THIN_FLEECE) : c.fleece;
  const ry = L * (thin ? 0.24 : lamb ? 0.33 : 0.3);
  const rx = L * (thin ? 0.43 : 0.46);
  const legH = L * (lamb ? 0.3 : thin ? 0.28 : 0.23);
  const cy = -legH - ry * 0.7;
  const lobes: [number, number, number][] = thin
    ? [
        [-0.2, -0.78, 0.15],
        [0.12, -0.8, 0.15],
      ]
    : [
        [-0.34, -0.7, 0.17],
        [-0.12, -0.95, 0.19],
        [0.14, -0.92, 0.18],
        [0.34, -0.62, 0.15],
        [-0.46, 0.05, 0.15],
        [-0.3, 0.6, 0.15],
        [0.1, 0.7, 0.16],
      ];

  ctx.save();
  ctx.translate(W / 2 - L * 0.1, H - 8);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  shadow(ctx, 0, 1, L * 0.5, L * 0.09, 0.3);

  const wool: (() => void)[] = [
    () => oval(ctx, 0, cy, rx, ry),
    // The poll: a cap of wool on the head.
    () => oval(ctx, L * 0.47, cy - ry * 0.55, L * 0.09, L * 0.075),
  ];
  for (const [lx, ly, lr] of lobes) {
    wool.push(() => oval(ctx, L * lx * 0.92, cy + ry * ly, L * lr, L * lr));
  }
  const headX = L * 0.55;
  const headY = cy - ry * 0.1;
  const head = (): void => oval(ctx, headX, headY, L * 0.14, L * 0.1, 0.55);
  const ear = (): void => oval(ctx, headX - L * 0.07, headY - L * 0.1, L * 0.065, L * 0.03, -0.5);
  const legX = [-0.3, -0.2, 0.19, 0.3];
  const legs = (): void => {
    ctx.beginPath();
    for (const lx of legX) ctx.rect(L * lx - L * 0.03, cy + ry * 0.4, L * 0.06, -cy - ry * 0.4);
  };
  const solid: (() => void)[] = [legs, head, ear, ...wool];

  // A thin pale rim outside the dark line, so the sheep reads on dark ground.
  ctx.strokeStyle = css(N.sheepHalo);
  ctx.lineWidth = lw * 3.4;
  for (const p of solid) {
    p();
    ctx.stroke();
  }
  ctx.strokeStyle = css(N.sheepOutline);
  ctx.lineWidth = lw * 2;
  for (const p of solid) {
    p();
    ctx.stroke();
  }

  if (ram) {
    // Curled horns, drawn behind the head.
    ctx.strokeStyle = css(N.sheepOutline);
    ctx.lineWidth = lw * 2.6;
    ctx.beginPath();
    ctx.arc(headX - L * 0.06, headY - L * 0.02, L * 0.11, Math.PI * 1.05, Math.PI * 2.2);
    ctx.stroke();
    ctx.strokeStyle = css(RAM_HORN);
    ctx.lineWidth = lw * 1.2;
    ctx.beginPath();
    ctx.arc(headX - L * 0.06, headY - L * 0.02, L * 0.11, Math.PI * 1.05, Math.PI * 2.2);
    ctx.stroke();
  }

  ctx.fillStyle = css(c.legs);
  legs();
  ctx.fill();
  ctx.fillStyle = css(c.head);
  head();
  ctx.fill();
  ear();
  ctx.fill();
  ctx.fillStyle = css(fleece);
  for (const p of wool) {
    p();
    ctx.fill();
  }

  // Curls in the wool, so the body reads as wool close up.
  ctx.strokeStyle = cssA(c.curl, 0.9);
  ctx.lineWidth = lw * 0.8;
  const curls: [number, number][] = thin
    ? [
        [-0.15, 0.1],
        [0.12, 0.05],
      ]
    : [
        [-0.28, -0.1],
        [-0.05, -0.28],
        [0.2, -0.12],
        [-0.15, 0.3],
        [0.12, 0.28],
      ];
  for (const [kx, ky] of curls) {
    ctx.beginPath();
    ctx.arc(L * kx, cy + ry * ky, L * 0.055, Math.PI * 0.15, Math.PI * 1.3);
    ctx.stroke();
  }
  if (thin) {
    // Hip bone and backbone showing through thin wool.
    ctx.strokeStyle = cssA(N.sheepOutline, 0.5);
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.moveTo(-L * 0.38, cy - ry * 0.3);
    ctx.lineTo(-L * 0.3, cy + ry * 0.15);
    ctx.moveTo(-L * 0.25, cy - ry * 0.85);
    ctx.lineTo(L * 0.3, cy - ry * 0.85);
    ctx.stroke();
  }
  // Eye.
  ctx.fillStyle = '#e9e1cf';
  oval(ctx, headX + L * 0.07, headY - L * 0.015, L * 0.016, L * 0.016);
  ctx.fill();
  ctx.restore();
}

function addSheep(reg: SpriteRegistry): void {
  const size: Record<ViewSheepKind, number> = {
    ewe: 1,
    wether: 1.04,
    ram: 1.18,
    young: 0.82,
    lamb: 0.52,
  };
  for (const kind of ['ewe', 'wether', 'ram', 'young', 'lamb'] as const) {
    const len = Math.round(50 * size[kind]);
    const w = Math.round(len * SHEEP_W_PER_BODY);
    const h = Math.round(len * 1.08) + 10;
    // The small sprite: the pale rim sits 0.7 line widths outside the dark line.
    const sLen = Math.round(SMALL_LEN * size[kind]);
    const sLw = smallLine(sLen, 0.7);
    const sPad = Math.ceil(sLw * 1.7) + 1;
    const sw = Math.round(sLen * SHEEP_W_PER_BODY) + sPad * 2;
    const sh = Math.round(sLen * 1.08) + 10 + sPad;
    for (const thin of kind === 'lamb' ? [false] : [false, true]) {
      const id = sheepSprite(kind, thin);
      reg.set(id, {
        w,
        h,
        ax: 0.5,
        ay: (h - 8) / h,
        ppu: SHEEP_PPU,
        body: len,
        paint: (ctx, W, H) => paintSheep(ctx, W, H, { kind, thin, len }),
      });
      reg.set(smallSprite(id), {
        w: sw,
        h: sh,
        ax: 0.5,
        ay: (sh - 8) / sh,
        ppu: SHEEP_PPU,
        body: sLen,
        paint: (ctx, W, H) => paintSheep(ctx, W, H, { kind, thin, len: sLen, lw: sLw }),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Grass pieces (drawn in greys, tinted by the map)
// ---------------------------------------------------------------------------

/** One tapered blade from (x0, base) to (x1, tip), bent through a middle point. */
function blade(
  ctx: Ctx,
  x0: number,
  base: number,
  x1: number,
  tip: number,
  half: number,
  grey: number,
): void {
  const mx = x0 + (x1 - x0) * 0.35;
  const my = base + (tip - base) * 0.6;
  ctx.fillStyle = `rgb(${grey},${grey},${grey})`;
  ctx.beginPath();
  ctx.moveTo(x0 - half, base);
  ctx.quadraticCurveTo(mx - half * 0.7, my, x1, tip);
  ctx.quadraticCurveTo(mx + half * 0.7, my, x0 + half, base);
  ctx.closePath();
  ctx.fill();
}

function paintTuft(ctx: Ctx, W: number, H: number, variant: number, dry: boolean): void {
  const next = scatter(0x7a11 + variant * 97 + (dry ? 13 : 0));
  shadow(ctx, W / 2, H - 2.5, W * 0.34, 2.5, 0.22);
  const blades = dry ? 6 : 7;
  for (let k = 0; k < blades; k++) {
    const f = k / (blades - 1) - 0.5;
    const x0 = W / 2 + f * W * 0.34;
    const lean = f * W * (dry ? 0.75 : 0.55) + (next() - 0.5) * W * 0.14;
    const tall = (dry ? 0.82 : 0.7) + next() * (dry ? 0.18 : 0.3);
    // A darker and a lighter blade in every tuft, for depth.
    const grey = k % 3 === 0 ? 178 : k % 3 === 1 ? 255 : 222;
    blade(ctx, x0, H - 2, x0 + lean, H - 2 - (H - 6) * tall, dry ? W * 0.05 : W * 0.075, grey);
  }
}

function paintCropPlant(ctx: Ctx, W: number, H: number): void {
  shadow(ctx, W / 2, H - 2.5, W * 0.3, 2.5, 0.22);
  // An upright stem with paired leaves.
  blade(ctx, W / 2, H - 2, W / 2, 4, W * 0.07, 235);
  for (const [at, side, grey] of [
    [0.25, -1, 190],
    [0.38, 1, 255],
    [0.55, -1, 255],
    [0.68, 1, 200],
  ] as const) {
    const y = H - 2 - (H - 6) * at;
    blade(ctx, W / 2, y, W / 2 + side * W * 0.4, y - H * 0.2, W * 0.06, grey);
  }
}

function paintStubble(ctx: Ctx, W: number, H: number): void {
  const next = scatter(0x57ab);
  for (let k = 0; k < 6; k++) {
    const x = W * (0.12 + (k / 5) * 0.76);
    const tall = 0.6 + next() * 0.4;
    const grey = k % 2 ? 255 : 205;
    ctx.fillStyle = `rgb(${grey},${grey},${grey})`;
    ctx.fillRect(x - W * 0.03, H - 2 - (H - 4) * tall, W * 0.06, (H - 4) * tall);
  }
}

function paintSeedHead(ctx: Ctx, W: number, H: number): void {
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of [
    [0.5, 0.3, 0.2],
    [0.36, 0.55, 0.16],
    [0.64, 0.6, 0.16],
  ] as const) {
    oval(ctx, W * x, H * y, W * r, H * r * 1.25, 0);
    ctx.fill();
  }
}

function addGrass(reg: SpriteRegistry): void {
  const tuft = { w: 48, h: 96, ax: 0.5, ay: 94 / 96, ppu: 160 };
  for (let v = 0; v < TUFT_VARIANTS; v++) {
    reg.set(`tuft.dry.${v}`, { ...tuft, paint: (c, W, H) => paintTuft(c, W, H, v, true) });
    reg.set(`tuft.leaf.${v}`, { ...tuft, paint: (c, W, H) => paintTuft(c, W, H, v, false) });
  }
  reg.set('tuft.crop', { ...tuft, w: 44, paint: paintCropPlant });
  reg.set('tuft.stubble', { w: 48, h: 32, ax: 0.5, ay: 30 / 32, ppu: 160, paint: paintStubble });
  reg.set('tuft.seed', { w: 20, h: 28, ax: 0.5, ay: 0.8, ppu: 160, paint: paintSeedHead });
  reg.set('tuft.clover', {
    w: 12,
    h: 12,
    ax: 0.5,
    ay: 0.5,
    ppu: 160,
    paint: (ctx, W, H) => {
      ctx.fillStyle = '#ffffff';
      oval(ctx, W / 2, H / 2, W * 0.4, H * 0.4);
      ctx.fill();
    },
  });
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------

function paintTrough(ctx: Ctx, W: number, H: number): void {
  const lw = 2;
  shadow(ctx, W / 2 + 2, H - 9, W * 0.47, 8, 0.28);
  // Grey concrete with blue water.
  ctx.fillStyle = css(N.troughBody);
  ctx.strokeStyle = css(shade(N.troughBody, 0.45));
  ctx.lineWidth = lw;
  rrect(ctx, 4, H - 34, W - 8, 24, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = css(N.troughRim);
  rrect(ctx, 4, H - 40, W - 8, 18, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = css(N.water);
  rrect(ctx, 10, H - 36, W - 20, 10, 5);
  ctx.fill();
  ctx.fillStyle = css(N.waterShine);
  rrect(ctx, 16, H - 34, W * 0.22, 3.5, 2);
  ctx.fill();
}

function paintPortable(ctx: Ctx, W: number, H: number): void {
  shadow(ctx, W / 2 + 2, H - 8, W * 0.47, 7, 0.28);
  ctx.lineWidth = 2;
  // White tank behind, blue plastic trough in front.
  ctx.fillStyle = css(N.portableTank);
  ctx.strokeStyle = css(shade(N.portableTank, 0.4));
  rrect(ctx, W * 0.52, H - 62, W * 0.4, 52, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  rrect(ctx, W * 0.56, H - 58, W * 0.32, 6, 3);
  ctx.fill();
  ctx.fillStyle = css(N.portableBody);
  ctx.strokeStyle = css(shade(N.portableBody, 0.45));
  rrect(ctx, 4, H - 30, W * 0.6, 21, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = css(N.portableRim);
  rrect(ctx, 4, H - 35, W * 0.6, 14, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = css(N.waterShine);
  rrect(ctx, 10, H - 32, W * 0.6 - 12, 6, 3);
  ctx.fill();
}

function paintHub(ctx: Ctx, W: number, H: number): void {
  // A round trough that sits across the fence line.
  shadow(ctx, W / 2 + 2, H * 0.62, W * 0.46, H * 0.3, 0.28);
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(shade(N.troughBody, 0.45));
  ctx.fillStyle = css(N.troughBody);
  oval(ctx, W / 2, H * 0.56, W * 0.44, H * 0.32);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = css(N.troughRim);
  oval(ctx, W / 2, H * 0.46, W * 0.44, H * 0.32);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = css(N.water);
  oval(ctx, W / 2, H * 0.46, W * 0.33, H * 0.23);
  ctx.fill();
  ctx.fillStyle = css(N.waterShine);
  oval(ctx, W * 0.4, H * 0.4, W * 0.1, H * 0.04, -0.2);
  ctx.fill();
}

function paintWindmillTower(ctx: Ctx, W: number, H: number): void {
  const x = W * 0.42;
  const base = H - 8;
  const top = 34;
  const s = base - top;
  shadow(ctx, x + 6, base, W * 0.36, 7, 0.26);
  // Tank beside the tower.
  ctx.lineWidth = 2;
  ctx.fillStyle = css(N.iron);
  ctx.strokeStyle = css(shade(N.ironDark, 0.6));
  rrect(ctx, x + s * 0.12, base - s * 0.22, s * 0.3, s * 0.22, 4);
  ctx.fill();
  ctx.stroke();
  // Lattice tower: dark behind, pale in front, so it reads on any ground.
  for (const [colour, width] of [
    [css(N.cattleOutline), 5],
    [css(N.windmill), 2.6],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.15, base);
    ctx.lineTo(x, top);
    ctx.lineTo(x + s * 0.15, base);
    for (let k = 1; k < 5; k++) {
      const y = base - (s * k) / 5;
      const hw = s * 0.15 * (1 - k / 5);
      ctx.moveTo(x - hw, y);
      ctx.lineTo(x + hw, y);
    }
    ctx.stroke();
  }
  // Tail vane.
  ctx.strokeStyle = css(N.cattleOutline);
  ctx.lineWidth = 1.5;
  ctx.fillStyle = css(N.windmill);
  ctx.fillRect(x, top - 2, s * 0.3, 4);
  ctx.fillStyle = css(N.windmillVane);
  rrect(ctx, x + s * 0.26, top - 9, s * 0.14, 18, 2);
  ctx.fill();
  ctx.stroke();
}

function paintWindmillFan(ctx: Ctx, W: number, H: number): void {
  const cx = W / 2;
  const cy = H / 2;
  const r = W / 2 - 4;
  for (let b = 0; b < 12; b++) {
    const a = (b / 12) * Math.PI * 2;
    const half = 0.17;
    ctx.fillStyle = css(b % 2 ? N.windmill : N.windmillDark);
    ctx.strokeStyle = css(N.cattleOutline);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.18, cy + Math.sin(a) * r * 0.18);
    ctx.lineTo(cx + Math.cos(a - half) * r, cy + Math.sin(a - half) * r);
    ctx.lineTo(cx + Math.cos(a + half) * r, cy + Math.sin(a + half) * r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = css(N.ironDark);
  oval(ctx, cx, cy, r * 0.14, r * 0.14);
  ctx.fill();
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Trees and buildings
// ---------------------------------------------------------------------------

function paintTree(ctx: Ctx, W: number, H: number): void {
  const x = W / 2;
  const base = H - 8;
  const s = H - 16;
  const next = scatter(0x7ee);
  shadow(ctx, x + s * 0.2, base, s * 0.42, s * 0.07, 0.24);
  for (const [colour, width] of [
    [css(shade(N.treeTrunk, 0.35)), s * 0.1],
    [css(N.treeTrunk), s * 0.06],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x - s * 0.04, base - s * 0.35, x + s * 0.02, base - s * 0.62);
    ctx.moveTo(x, base - s * 0.4);
    ctx.lineTo(x - s * 0.22, base - s * 0.68);
    ctx.moveTo(x + s * 0.01, base - s * 0.48);
    ctx.lineTo(x + s * 0.24, base - s * 0.72);
    ctx.stroke();
  }
  for (let k = 0; k < 9; k++) {
    const bx = x + (next() - 0.5) * s * 0.7;
    const by = base - s * (0.64 + next() * 0.26);
    const br = s * (0.11 + next() * 0.08);
    const g = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.35, br * 0.1, bx, by, br);
    g.addColorStop(0, css(N.treeLeaf));
    g.addColorStop(1, css(N.treeLeafDark));
    ctx.fillStyle = g;
    oval(ctx, bx, by, br, br);
    ctx.fill();
  }
}

/** Timber stock yards: pens, a race and a loading ramp. The farm's own yards, never a saleyard. */
function paintYards(ctx: Ctx, W: number, H: number): void {
  const x0 = 10;
  const x1 = W - 12;
  const y0 = H * 0.3;
  const y1 = H - 12;
  // Trodden dirt inside the pens.
  ctx.fillStyle = cssA(N.yardDirt, 0.9);
  ctx.beginPath();
  ctx.moveTo(x0 + 8, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1 - 6, y1);
  ctx.lineTo(x0, y1);
  ctx.closePath();
  ctx.fill();
  const rail = (ax: number, ay: number, bx: number, by: number): void => {
    for (const lift of [5, 11, 17]) {
      ctx.beginPath();
      ctx.moveTo(ax, ay - lift);
      ctx.lineTo(bx, by - lift);
      ctx.stroke();
    }
  };
  const post = (px: number, py: number): void => {
    ctx.fillStyle = css(N.timberDark);
    ctx.fillRect(px - 2, py - 22, 4, 22);
  };
  ctx.lineCap = 'round';
  const fence = (ax: number, ay: number, bx: number, by: number, posts: number): void => {
    ctx.strokeStyle = css(N.cattleOutline);
    ctx.lineWidth = 4;
    rail(ax, ay, bx, by);
    ctx.strokeStyle = css(N.timber);
    ctx.lineWidth = 2.2;
    rail(ax, ay, bx, by);
    for (let k = 0; k <= posts; k++)
      post(ax + ((bx - ax) * k) / posts, ay + ((by - ay) * k) / posts);
  };
  // Back rail, a dividing rail, a short race, then the front rail.
  fence(x0 + 8, y0, x1, y0, 5);
  fence(x0 + 8, y0, x0, y1, 3);
  fence(x1, y0, x1 - 6, y1, 3);
  const midX = (x0 + x1) / 2;
  fence(midX + 4, y0, midX, y1, 3);
  fence(x0 + 5, (y0 + y1) / 2, midX + 2, (y0 + y1) / 2, 3);
  fence(x0, y1, x1 - 6, y1, 5);
  // Loading ramp at the back corner.
  ctx.fillStyle = css(N.timber);
  ctx.strokeStyle = css(N.cattleOutline);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x1 - 2, y0 - 4);
  ctx.lineTo(x1 + 10, y0 - 20);
  ctx.lineTo(x1 + 10, y0 - 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Gates and markers
// ---------------------------------------------------------------------------

const GATE_PPU = 110;
const GATE_PAD = 12;
const GATE_H = 72;
/** Room under an open gate for its panel, swung towards the viewer. */
const GATE_SWING = 40;

/** A gate on a line that runs across the map: strainer posts, a white three-rail panel and a flag. */
function paintGateAcross(ctx: Ctx, W: number, _H: number, open: boolean): void {
  const base = GATE_H - 8;
  const x0 = GATE_PAD;
  const x1 = W - GATE_PAD;
  // The far end of the panel: at the other post when shut, swung into the paddock when open.
  const ex = open ? x0 + GATE_PPU * 0.36 : x1;
  const ey = open ? base + GATE_SWING - 4 : base;
  gatePanel(ctx, x0, base, ex, ey, open);
  gatePost(ctx, x0, base);
  gatePost(ctx, x1, base);
  gateFlag(ctx, (x0 + x1) / 2, base - 40, open);
}

/** A gate on a line that runs down the map. The line is squashed, so the gate is short and steep. */
function paintGateDown(ctx: Ctx, W: number, H: number, open: boolean): void {
  const top = 46;
  const base = H - 8;
  const x = W * 0.3;
  const ex = open ? x + GATE_PPU * 0.5 : x;
  const ey = open ? top + 4 : base;
  gatePanel(ctx, x, top, ex, ey, open);
  gatePost(ctx, x, top);
  gatePost(ctx, x, base);
  gateFlag(ctx, x + 14, top - 34, open);
}

function gatePost(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = css(N.gatePost);
  ctx.strokeStyle = css(N.cattleOutline);
  ctx.lineWidth = 1.4;
  rrect(ctx, x - 4, y - 30, 8, 30, 2);
  ctx.fill();
  ctx.stroke();
}

function gatePanel(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, open: boolean): void {
  ctx.lineCap = 'round';
  for (const [colour, width] of [
    [css(N.cattleOutline), 5.5],
    [css(N.gateRail), 2.8],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const lift of [7, 15, 23]) {
      ctx.moveTo(x0, y0 - lift);
      ctx.lineTo(x1, y1 - lift);
    }
    // A brace across the panel and the upright at its far end.
    ctx.moveTo(x0, y0 - 7);
    ctx.lineTo(x1, y1 - 23);
    ctx.moveTo(x1, y1 - 5);
    ctx.lineTo(x1, y1 - 25);
    ctx.stroke();
  }
  if (open) {
    ctx.fillStyle = cssA(0x000000, 0.18);
    oval(ctx, (x0 + x1) / 2, (y0 + y1) / 2 + 2, Math.abs(x1 - x0) / 2 + 4, 3);
    ctx.fill();
  }
}

/** Green when open, slate when shut (red means only "does not fit today"). Drawn large so it still reads zoomed out. */
function gateFlag(ctx: Ctx, x: number, y: number, open: boolean): void {
  ctx.fillStyle = css(open ? N.gateOpen : N.gateShut);
  ctx.strokeStyle = css(N.cattleOutline);
  ctx.lineWidth = 1.8;
  oval(ctx, x, y, 9, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = cssA(0xffffff, 0.55);
  oval(ctx, x - 3, y - 3, 3, 3);
  ctx.fill();
}

function paintAlert(ctx: Ctx, W: number, H: number): void {
  ctx.fillStyle = css(N.fenceDown);
  ctx.strokeStyle = css(N.cattleOutline);
  ctx.lineWidth = 2;
  oval(ctx, W / 2, H / 2, W / 2 - 3, H / 2 - 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  rrect(ctx, W / 2 - 2.5, H * 0.2, 5, H * 0.38, 2);
  ctx.fill();
  oval(ctx, W / 2, H * 0.74, 3, 3);
  ctx.fill();
}

/** The cow on a mob marker. Drawn white and tinted to the theme. */
function paintMarkerCow(ctx: Ctx, W: number, H: number): void {
  const s = W;
  ctx.fillStyle = '#ffffff';
  oval(ctx, s * 0.44, H * 0.5, s * 0.36, H * 0.26);
  ctx.fill();
  oval(ctx, s * 0.84, H * 0.36, s * 0.13, H * 0.16);
  ctx.fill();
  ctx.fillRect(s * 0.16, H * 0.5, s * 0.08, H * 0.42);
  ctx.fillRect(s * 0.3, H * 0.5, s * 0.08, H * 0.42);
  ctx.fillRect(s * 0.52, H * 0.5, s * 0.08, H * 0.42);
  ctx.fillRect(s * 0.66, H * 0.5, s * 0.08, H * 0.42);
}

/** The sheep on a flock marker: a woolly cloud on thin legs with a small head. Drawn white and tinted to the theme. A cow's is long and smooth, so the two never read alike. */
function paintMarkerSheep(ctx: Ctx, W: number, H: number): void {
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of [
    [0.3, 0.44, 0.2],
    [0.46, 0.34, 0.22],
    [0.62, 0.42, 0.2],
    [0.38, 0.6, 0.2],
    [0.56, 0.62, 0.19],
  ] as const) {
    oval(ctx, W * x, H * y, H * r * 1.15, H * r * 1.15);
    ctx.fill();
  }
  oval(ctx, W * 0.84, H * 0.5, W * 0.07, H * 0.14, 0.5);
  ctx.fill();
  for (const x of [0.28, 0.36, 0.54, 0.62]) ctx.fillRect(W * x, H * 0.7, W * 0.045, H * 0.28);
}

function paintRain(ctx: Ctx, W: number, H: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, cssA(N.rain, 0));
  g.addColorStop(1, cssA(N.rain, 0.85));
  ctx.strokeStyle = g;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W - 2, 1);
  ctx.lineTo(2, H - 1);
  ctx.stroke();
}

function addThings(reg: SpriteRegistry): void {
  const def = (
    id: string,
    w: number,
    h: number,
    ax: number,
    ay: number,
    ppu: number,
    paint: SpriteDef['paint'],
  ): void => {
    reg.set(id, { w, h, ax, ay, ppu, paint });
  };
  def('trough.fixed', 92, 54, 0.5, 40 / 54, 128, paintTrough);
  def('trough.portable', 104, 74, 0.45, 62 / 74, 128, paintPortable);
  def('hub', 96, 72, 0.5, 0.5, 128, paintHub);
  def('windmill.tower', 120, 226, 0.42, 218 / 226, 110, paintWindmillTower);
  def('windmill.fan', 124, 124, 0.5, 0.5, 110, paintWindmillFan);
  def('tree', 140, 156, 0.5, 148 / 156, 124, paintTree);
  def('building.yards', 210, 132, 0.5, 0.72, 110, paintYards);
  const across = GATE_PPU + GATE_PAD * 2;
  def(
    'gate.across.shut',
    across,
    GATE_H,
    GATE_PAD / across,
    (GATE_H - 8) / GATE_H,
    GATE_PPU,
    (c, W, H) => paintGateAcross(c, W, H, false),
  );
  def(
    'gate.across.open',
    across,
    GATE_H + GATE_SWING,
    GATE_PAD / across,
    (GATE_H - 8) / (GATE_H + GATE_SWING),
    GATE_PPU,
    (c, W, H) => paintGateAcross(c, W, H, true),
  );
  // A line down the map is 0.7 of a square long on screen.
  const down = Math.round(GATE_PPU * 0.7) + 46 + 8;
  def('gate.down.shut', 84, down, 0.3, 46 / down, GATE_PPU, (c, W, H) =>
    paintGateDown(c, W, H, false),
  );
  def('gate.down.open', 84, down, 0.3, 46 / down, GATE_PPU, (c, W, H) =>
    paintGateDown(c, W, H, true),
  );
  def('mark.alert', 40, 40, 0.5, 1, 110, paintAlert);
  def('marker.cow', 36, 24, 0.5, 0.5, 36, paintMarkerCow);
  def('marker.sheep', 36, 24, 0.5, 0.5, 36, paintMarkerSheep);
  def('rain', 10, 44, 0.5, 0.5, 44, paintRain);
}

/**
 * Zoomed out, each beast is a dot: a dark middle in the cattle outline colour
 * with a thin pale rim, so it reads on every ground and grass colour as the
 * cattle do (the same pair of colours, held to 3 to 1 by the palette test).
 * A sheep's dot is pale with a dark rim, so a flock never reads as cattle.
 */
function addDots(reg: SpriteRegistry): void {
  const S = DOT_TEXTURE_PX;
  const paint =
    (inner: number, outer: number) =>
    (ctx: Ctx): void => {
      ctx.fillStyle = css(outer);
      oval(ctx, S / 2, S / 2, S / 2 - 0.5, S / 2 - 0.5);
      ctx.fill();
      ctx.fillStyle = css(inner);
      oval(ctx, S / 2, S / 2, S * 0.33, S * 0.33);
      ctx.fill();
    };
  const dot = { w: S, h: S, ax: 0.5, ay: 0.5, ppu: S };
  reg.set(DOT_SPRITE.cattle, { ...dot, paint: paint(N.cattleOutline, N.cattleHalo) });
  reg.set(DOT_SPRITE.sheep, { ...dot, paint: paint(N.sheepHalo, N.sheepOutline) });
}

/** Every sprite the map uses, drawn in code. */
export function defaultSprites(): SpriteRegistry {
  const reg = new SpriteRegistry();
  addCattle(reg);
  addSheep(reg);
  addDots(reg);
  addGrass(reg);
  addThings(reg);
  return reg;
}
