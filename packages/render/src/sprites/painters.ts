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

import type { ViewCattleKind } from '@gg/shared';
import type { BodyShape } from '../cattle';
import { css, cssA, shade } from '../colour';
import { CATTLE, NATURAL, type CattleBreed, type CattleColours } from '../palette';
import { scatter } from '../random';
import { SpriteRegistry, type SpriteDef } from './registry';

type Ctx = CanvasRenderingContext2D;

/** The name of a cattle sprite. Calves have one shape. */
export const cattleSprite = (breed: CattleBreed, kind: ViewCattleKind, shape: BodyShape): string =>
  `cattle.${breed}.${kind}.${kind === 'calf' ? 'normal' : shape}`;

export const TUFT_VARIANTS = 3;

/** Texture pixels for one square across, for cattle. A cow is about four tenths of a square long. */
const CATTLE_PPU = 210;

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
}

function paintBeast(ctx: Ctx, W: number, H: number, art: BeastArt): void {
  const L = art.len;
  const c = art.colours;
  const brahman = art.breed === 'brahman';
  const bull = art.kind === 'bull';
  const deep = art.shape === 'thin' ? 0.82 : art.shape === 'fat' ? 1.18 : 1;
  const lw = Math.max(1.6, L * 0.045);
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
      const w = Math.round(len * 1.3);
      const h = Math.round(len * 1.02) + 10;
      for (const shape of kind === 'calf' ? (['normal'] as const) : shapes) {
        reg.set(cattleSprite(breed, kind, shape), {
          w,
          h,
          ax: 0.5,
          ay: (h - 8) / h,
          ppu: CATTLE_PPU,
          paint: (ctx, W, H) =>
            paintBeast(ctx, W, H, { colours: CATTLE[breed][kind], breed, kind, shape, len }),
        });
      }
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

function paintHomestead(ctx: Ctx, W: number, H: number): void {
  const base = H - 10;
  const x = W * 0.1;
  const w = W * 0.66;
  const wallH = H * 0.3;
  shadow(ctx, W / 2 + 6, base, W * 0.46, 9, 0.26);
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css(0x4a3a2a);
  // Rainwater tank at the end of the house.
  ctx.fillStyle = css(N.iron);
  rrect(ctx, x + w + 4, base - H * 0.34, W * 0.16, H * 0.34, 6);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = css(N.ironDark);
  ctx.lineWidth = 1.2;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(x + w + 6, base - (H * 0.34 * k) / 4);
    ctx.lineTo(x + w + 2 + W * 0.16, base - (H * 0.34 * k) / 4);
    ctx.stroke();
  }
  ctx.strokeStyle = css(0x4a3a2a);
  ctx.lineWidth = 2.2;
  // Walls.
  ctx.fillStyle = css(N.wall);
  ctx.fillRect(x, base - wallH, w, wallH);
  ctx.strokeRect(x, base - wallH, w, wallH);
  // Roof.
  ctx.fillStyle = css(N.roof);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.07, base - wallH);
  ctx.lineTo(x + w * 0.22, base - wallH - H * 0.3);
  ctx.lineTo(x + w * 0.78, base - wallH - H * 0.3);
  ctx.lineTo(x + w * 1.07, base - wallH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = css(shade(N.roof, 0.8));
  ctx.fillRect(x - w * 0.07, base - wallH, w * 1.14, 5);
  // Verandah posts, windows and a door.
  ctx.fillStyle = css(0x5a8fc0);
  for (const wx of [0.12, 0.7]) {
    ctx.fillRect(x + w * wx, base - wallH * 0.72, w * 0.16, wallH * 0.36);
    ctx.strokeRect(x + w * wx, base - wallH * 0.72, w * 0.16, wallH * 0.36);
  }
  ctx.fillStyle = css(0x6b4a2c);
  ctx.fillRect(x + w * 0.44, base - wallH * 0.74, w * 0.12, wallH * 0.74);
  ctx.strokeRect(x + w * 0.44, base - wallH * 0.74, w * 0.12, wallH * 0.74);
  // Chimney.
  ctx.fillStyle = css(N.ironDark);
  ctx.fillRect(x + w * 0.62, base - wallH - H * 0.4, w * 0.07, H * 0.14);
  ctx.strokeRect(x + w * 0.62, base - wallH - H * 0.4, w * 0.07, H * 0.14);
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

function paintShed(ctx: Ctx, W: number, H: number): void {
  const base = H - 10;
  const x = W * 0.08;
  const w = W * 0.84;
  const wallH = H * 0.42;
  shadow(ctx, W / 2 + 6, base, W * 0.46, 8, 0.26);
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css(shade(N.ironDark, 0.5));
  ctx.fillStyle = css(N.iron);
  ctx.fillRect(x, base - wallH, w, wallH);
  ctx.strokeRect(x, base - wallH, w, wallH);
  ctx.fillStyle = css(N.ironDark);
  ctx.beginPath();
  ctx.moveTo(x - 6, base - wallH);
  ctx.lineTo(x + w / 2, base - wallH - H * 0.26);
  ctx.lineTo(x + w + 6, base - wallH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // An open bay.
  ctx.fillStyle = css(0x2a2622);
  ctx.fillRect(x + w * 0.18, base - wallH * 0.8, w * 0.64, wallH * 0.8);
  ctx.strokeRect(x + w * 0.18, base - wallH * 0.8, w * 0.64, wallH * 0.8);
}

function paintSilo(ctx: Ctx, W: number, H: number): void {
  const base = H - 10;
  const x = W * 0.16;
  const w = W * 0.68;
  shadow(ctx, W / 2 + 5, base, W * 0.44, 7, 0.26);
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css(shade(N.ironDark, 0.5));
  ctx.fillStyle = css(N.iron);
  rrect(ctx, x, base - H * 0.62, w, H * 0.62, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = css(N.ironDark);
  ctx.beginPath();
  ctx.moveTo(x - 3, base - H * 0.62);
  ctx.lineTo(W / 2, base - H * 0.86);
  ctx.lineTo(x + w + 3, base - H * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = css(N.ironDark);
  ctx.lineWidth = 1.2;
  for (let k = 1; k < 5; k++) {
    ctx.beginPath();
    ctx.moveTo(x + 2, base - (H * 0.62 * k) / 5);
    ctx.lineTo(x + w - 2, base - (H * 0.62 * k) / 5);
    ctx.stroke();
  }
}

function paintFeedBin(ctx: Ctx, W: number, H: number): void {
  const base = H - 8;
  shadow(ctx, W / 2 + 3, base, W * 0.4, 5, 0.26);
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css(shade(N.ironDark, 0.5));
  // Legs, then a hopper.
  ctx.beginPath();
  for (const lx of [0.26, 0.74]) {
    ctx.moveTo(W * lx, base);
    ctx.lineTo(W * lx, base - H * 0.4);
  }
  ctx.stroke();
  ctx.fillStyle = css(N.iron);
  ctx.beginPath();
  ctx.moveTo(W * 0.16, base - H * 0.82);
  ctx.lineTo(W * 0.84, base - H * 0.82);
  ctx.lineTo(W * 0.84, base - H * 0.46);
  ctx.lineTo(W * 0.58, base - H * 0.24);
  ctx.lineTo(W * 0.42, base - H * 0.24);
  ctx.lineTo(W * 0.16, base - H * 0.46);
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

/** Green when open, red when shut. Drawn large so it still reads zoomed out. */
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
  def('building.homestead', 250, 176, 0.42, 166 / 176, 104, paintHomestead);
  def('building.yards', 210, 132, 0.5, 0.72, 110, paintYards);
  def('building.shed', 176, 136, 0.5, 126 / 136, 104, paintShed);
  def('building.silo', 92, 176, 0.5, 166 / 176, 104, paintSilo);
  def('building.feedBin', 72, 92, 0.5, 84 / 92, 104, paintFeedBin);
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
  def('rain', 10, 44, 0.5, 0.5, 44, paintRain);
}

/** Every sprite the map uses, drawn in code. */
export function defaultSprites(): SpriteRegistry {
  const reg = new SpriteRegistry();
  addCattle(reg);
  addGrass(reg);
  addThings(reg);
  return reg;
}
