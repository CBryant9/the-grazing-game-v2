/**
 * The side-view picture of a pasture (the MVP's drawSward, docs/VISUALS.md).
 *
 * A 0 to 80 cm frame with a cm scale, sky, soil and a litter layer. Dry
 * stems stand behind, tall and leaning, with seed heads when the pasture is
 * rank. Green leaf is drawn in front, from the base. Everything comes from
 * the view's figures for the paddock, so the picture says what the paddock
 * sheet says.
 *
 * Plain 2D canvas. It needs nothing from the map and loads without PixiJS.
 */

import type { FarmViewPaddock, FarmViewPlanting, FarmViewSward } from '@gg/shared';
import { scatter } from './random';

/** The top of the picture's frame, cm. */
export const SWARD_FRAME_CM = 80;

export interface SwardPictureOptions {
  /** Size on screen, in CSS pixels. */
  width: number;
  height: number;
  /** Screen pixels per CSS pixel. Capped at 2. */
  pixelRatio?: number;
  /** Changes where each stem stands. Use the paddock's id so a paddock always looks the same. */
  seed?: number;
  /** Text drawn in a strip along the top, such as "Then, day 31". */
  label?: string;
  /** The font for the scale and the label. */
  fontFamily?: string;
}

const whole = (v: number): string => Math.round(v).toLocaleString('en-AU');

/** The caption under a picture: height, green leaf height, % green and kg DM/ha. */
export function swardCaption(s: FarmViewSward): string {
  return `About ${whole(s.heightCm)} cm tall. Green leaf to about ${whole(s.leafCm)} cm. ${whole(s.greenPct)}% green. ${whole(s.massKgHa)} kg DM/ha.`;
}

/** What is drawn, as numbers: how many stems of each kind and how tall. For tests and for the picture. */
export interface SwardPlan {
  /** Height of the dry stems and of the green leaf, cm. */
  dryCm: number;
  greenCm: number;
  dryStems: number;
  greenLeaves: number;
  /** True when seed heads are drawn on the dry stems. */
  seedHeads: boolean;
  /** Thickness of the litter layer, 0 to 1. */
  litter: number;
  /** Leaf colour, 0 (young) to 1 (old). */
  leafAge: number;
}

export function swardPlan(s: FarmViewSward): SwardPlan {
  const cover = Math.min(1, Math.max(0, s.coverPct / 100));
  const green = Math.min(1, Math.max(0, s.greenPct / 100));
  // Stem count follows ground cover.
  const stems = Math.round(90 * cover) + 3;
  return {
    dryCm: s.heightCm,
    greenCm: s.leafCm,
    dryStems: Math.round(stems * (1 - green) * 1.1),
    greenLeaves: Math.round(stems * green * 1.6) + (s.greenKgHa > 80 ? 4 : 0),
    seedHeads: s.rank > 30,
    litter: cover > 0.05 ? Math.min(1, s.deadKgHa / 3000) : 0,
    leafAge: Math.min(1, Math.max(0, s.leafAge / 100)),
  };
}

/** Draw a pasture in profile onto a canvas. */
export function drawSward(
  canvas: HTMLCanvasElement,
  sward: FarmViewSward,
  options: SwardPictureOptions,
): void {
  const pr = Math.min(2, Math.max(1, options.pixelRatio ?? 1));
  const w = options.width;
  const h = options.height;
  canvas.width = Math.round(w * pr);
  canvas.height = Math.round(h * pr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const x = canvas.getContext('2d');
  if (!x) return;
  x.setTransform(pr, 0, 0, pr, 0, 0);
  const font = options.fontFamily ?? 'ui-monospace, Menlo, Consolas, monospace';
  const plan = swardPlan(sward);
  const r = scatter((options.seed ?? 7) * 2654435761);
  const left = 26;
  const ground = h - 16;
  const top = options.label ? 22 : 8;
  const cm = (c: number): number => ground - (Math.min(c, 90) / SWARD_FRAME_CM) * (ground - top);

  // Sky and soil.
  const sky = x.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, '#8fb9d6');
  sky.addColorStop(1, '#dbe7d6');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, ground);
  x.fillStyle = '#6b4a2c';
  x.fillRect(0, ground, w, h - ground);
  x.fillStyle = '#86643f';
  for (let k = 0; k < w; k += 4) x.fillRect(k, ground + 3 + ((k * 7) % 7), 2, 2);
  // Litter: its thickness follows the dead feed.
  if (plan.litter > 0 || sward.coverPct > 5) {
    x.fillStyle = '#c4a462';
    x.fillRect(left, ground - 3 * plan.litter - 1, w - left, 3 * plan.litter + 1);
  }

  x.lineCap = 'round';
  // Dry stems behind, tall and leaning.
  for (let k = 0; k < plan.dryStems; k++) {
    const sx = left + 4 + r() * (w - left - 8);
    const tall = plan.dryCm * (0.45 + 0.65 * r());
    const lean = (r() - 0.5) * 12;
    x.strokeStyle = r() < 0.5 ? '#cdb070' : '#b4975a';
    x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(sx, ground);
    x.quadraticCurveTo(sx + lean * 0.2, cm(tall * 0.6), sx + lean, cm(tall));
    x.stroke();
    if (plan.seedHeads && r() < sward.rank / 100) {
      x.fillStyle = '#ead6a0';
      x.beginPath();
      x.ellipse(sx + lean, cm(tall) - 3, 2, 4.5, lean * 0.03, 0, Math.PI * 2);
      x.fill();
    }
  }
  // Green leaf in front, from the base.
  const t = plan.leafAge;
  for (let k = 0; k < plan.greenLeaves; k++) {
    const sx = left + 4 + r() * (w - left - 8);
    const tall = Math.max(2, plan.greenCm * (0.4 + 0.8 * r()));
    const reach = ground - cm(tall);
    const lean = (r() - 0.5) * reach * 0.8;
    const j = Math.min(1, t + r() * 0.25);
    x.strokeStyle = `rgb(${Math.round(125 + (58 - 125) * j)},${Math.round(205 + (132 - 205) * t)},${Math.round(72 + (48 - 72) * t)})`;
    x.lineWidth = 2.2;
    x.beginPath();
    x.moveTo(sx, ground);
    x.quadraticCurveTo(sx + lean * 0.25, ground - reach * 0.7, sx + lean, ground - reach);
    x.stroke();
  }

  // The cm scale down the left.
  x.fillStyle = 'rgba(28,21,15,0.78)';
  x.fillRect(0, 0, left, ground);
  x.fillStyle = '#f2e7c9';
  x.font = `10px ${font}`;
  x.textBaseline = 'alphabetic';
  for (const c of [0, 20, 40, 60, 80]) {
    const y = cm(c);
    if (y < top - 2) continue;
    x.fillRect(left - 7, Math.round(y), 7, 1);
    x.fillText(String(c), 2, y + (c ? 3.5 : -2));
  }
  x.fillText('cm', 2, top + 2);

  if (options.label) {
    x.fillStyle = 'rgba(11,18,32,0.84)';
    x.fillRect(left, 0, w - left, 16);
    x.fillStyle = '#f3e7cf';
    x.font = `600 10px ${font}`;
    x.fillText(options.label, left + 6, 11.5);
  }
}

/** One picture of a split paddock: its title, area and figures. */
export interface SwardPart {
  title: string;
  ha: number;
  sward: FarmViewSward;
}

/**
 * The pictures to show for a paddock. A paddock that is part crop and part
 * pasture shows two side by side, crop then pasture, each with its area.
 * Any other paddock shows one.
 */
export function swardParts(
  paddock: FarmViewPaddock,
  plantings: readonly FarmViewPlanting[],
): SwardPart[] {
  const crop = paddock.parts.find((p) => p.kind === 'crop');
  const pasture = paddock.parts.find((p) => p.kind === 'pasture');
  if (crop && pasture) {
    return [
      { title: plantings[crop.planting]?.name ?? 'crop', ha: crop.ha, sward: crop.sward },
      { title: 'pasture', ha: pasture.ha, sward: pasture.sward },
    ];
  }
  return [{ title: paddock.name, ha: paddock.ha, sward: paddock.sward }];
}
