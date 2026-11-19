/**
 * How each square's pasture is drawn, worked out from the view's numbers.
 *
 * The picture must match the model (docs/VISUALS.md): height, colour, green
 * at the base of rank grass, seed heads, ground cover, crops in rows, fallow
 * and stubble all come from the figures for the square, never from a label.
 * Nothing here is a game rule. These are drawing rules only.
 */

import { VIEW_FORM, VIEW_LAND, type DistrictId, type FarmView, type ViewForm } from '@gg/shared';
import { blue, green, mix, red, rgb, shade } from './colour';
import { GRID_N, GRID_W } from './grid';
import { NATURAL } from './palette';
import { hash3, unit } from './random';

/** Standing tufts drawn on each square, when the ground is fully covered. */
export const TUFTS_PER_SQUARE = 9;
/** The view's tallest feed, cm. */
export const FULL_HEIGHT_CM = 90;
/** How tall a tuft of the tallest feed stands, in world units (squares). */
export const TUFT_MAX_HEIGHT = 0.62;
/** No tuft is drawn shorter than this. */
export const TUFT_MIN_HEIGHT = 0.06;
/** Crops are capped a little under the tallest grass (docs/VISUALS.md). */
export const CROP_MAX_HEIGHT = 0.5;
/** Stubble is very short and all the same height. */
export const STUBBLE_HEIGHT = 0.08;
/** Zoomed out, a square of the tallest feed is drawn raised this far, in world units. */
export const RAISE_MAX = 0.5;
/** A tuft's width, in world units. */
export const TUFT_WIDTH = 0.3;

export type SquareKind = 'pasture' | 'sown' | 'crop' | 'fallow' | 'stubble';

/**
 * The form a district's native pasture takes, for a view sent before the
 * view carried `squares.form` (a past day's picture). The server's own
 * table is the one that counts (docs/VISUALS.md, "The base of a paddock").
 */
const NATIVE_FORM_FALLBACK: Record<DistrictId, ViewForm> = {
  cq: VIEW_FORM.tropicalTussock,
  nsw: VIEW_FORM.lowTufts,
  cw: VIEW_FORM.openTussock,
  wv: VIEW_FORM.openTussock,
};

/** True for the forms whose plants stand as tussocks or clumps. */
export const tussocky = (form: number): boolean =>
  form === VIEW_FORM.tropicalTussock ||
  form === VIEW_FORM.openTussock ||
  form === VIEW_FORM.bunch ||
  form === VIEW_FORM.hedgerow;

/** True for the forms with a clover through them, which shows white flowers. */
export const clovery = (form: number): boolean =>
  form === VIEW_FORM.carpet || form === VIEW_FORM.tussockClover;

/**
 * How much of the sward's own top colour shows where it hides the ground,
 * seen from above, by form. A carpet is leaf all over; between tussocks
 * the lower layer of leaf and litter shows. Drawing figures (builder).
 */
const BASE_TOPS: Record<ViewForm, number> = {
  [VIEW_FORM.tropicalTussock]: 0.4,
  [VIEW_FORM.lowTufts]: 0.5,
  [VIEW_FORM.openTussock]: 0.35,
  [VIEW_FORM.bunch]: 0.35,
  [VIEW_FORM.hedgerow]: 0.35,
  [VIEW_FORM.carpet]: 0.65,
  [VIEW_FORM.tussockClover]: 0.55,
  [VIEW_FORM.crowns]: 0.5,
  [VIEW_FORM.rows]: 0.55,
  [VIEW_FORM.bare]: 0,
};

/** A tuft's width by form: tussocks are broad clumps, a carpet's tufts fine. Drawing figures (builder). */
const TUFT_WIDE: Record<ViewForm, number> = {
  [VIEW_FORM.tropicalTussock]: 1.1,
  [VIEW_FORM.lowTufts]: 0.85,
  [VIEW_FORM.openTussock]: 1.1,
  [VIEW_FORM.bunch]: 1.2,
  [VIEW_FORM.hedgerow]: 1.15,
  [VIEW_FORM.carpet]: 0.8,
  [VIEW_FORM.tussockClover]: 1,
  [VIEW_FORM.crowns]: 0.95,
  [VIEW_FORM.rows]: 1,
  [VIEW_FORM.bare]: 1,
};

/** One square's pasture, as drawing figures. */
export interface SquareLook {
  kind: SquareKind;
  /** How the plants sit on the ground (a VIEW_FORM code). */
  form: ViewForm;
  /** True where tufts sit in cultivated rows. */
  rows: boolean;
  /**
   * Share of the ground the sward and its litter hide, seen from above, 0
   * to 1 (the view's `hidden`). It is also the share of the tuft spots that
   * stand. Low cover shows soil between the plants.
   */
  cover: number;
  /** Tuft height before each tuft's own variation, world units. */
  height: number;
  /** Share of a tuft's height that is green, from the ground up, 0 to 1. */
  greenReach: number;
  /** Green share of the feed, 0 to 1. */
  greenShare: number;
  /** Colour of the green leaf. */
  leaf: number;
  /** Colour of the dry tops. */
  straw: number;
  /** Colour of the seed heads, or -1 for none. */
  seed: number;
  /** Colour of the ground itself: soil, straw litter or shaded ground (docs/VISUALS.md). */
  ground: number;
  /** Colour of the open ground between plants: soil, with a little litter where dry feed lies about. */
  bare: number;
  /** Colour of the sward at ground level, where it hides the ground: low leaf and litter. */
  base: number;
  /**
   * What shows between the tufts, zoomed in, on average: the open ground and
   * the sward's base, by how much of the ground is hidden. The ground
   * picture draws the two in the pattern of the pasture's form.
   */
  floor: number;
  /** One colour for the whole square, for the zoomed-out map. */
  field: number;
  /** How far the square is raised on the zoomed-out map, world units. */
  raise: number;
}

/** Tuft height in world units for a height in cm. */
export const tuftHeight = (cm: number): number =>
  Math.max(TUFT_MIN_HEIGHT, (Math.min(cm, FULL_HEIGHT_CM) / FULL_HEIGHT_CM) * TUFT_MAX_HEIGHT);

/** How one square is drawn. */
export function squareLook(view: FarmView, i: number): SquareLook {
  const s = view.squares;
  const N = NATURAL;
  const land = s.land[i] ?? VIEW_LAND.native;
  const cm = s.heightCm[i] ?? 0;

  if (land === VIEW_LAND.fallow) {
    // Worked brown soil. No tufts.
    return {
      kind: 'fallow',
      form: VIEW_FORM.bare,
      rows: true,
      cover: 0,
      height: 0,
      greenReach: 0,
      greenShare: 0,
      leaf: N.fallow,
      straw: N.fallow,
      seed: -1,
      ground: N.fallow,
      bare: N.fallow,
      base: N.fallow,
      floor: N.fallow,
      field: N.fallow,
      raise: 0,
    };
  }
  if (land === VIEW_LAND.stubble) {
    // Pale straw rows, very short, full cover, no green. A finished crop does not regrow.
    return {
      kind: 'stubble',
      form: VIEW_FORM.rows,
      rows: true,
      cover: 1,
      height: STUBBLE_HEIGHT,
      greenReach: 0,
      greenShare: 0,
      leaf: N.stubble,
      straw: shade(N.stubble, 1.12),
      seed: -1,
      ground: N.stubble,
      bare: N.stubble,
      base: N.stubble,
      floor: N.stubble,
      field: N.stubble,
      raise: (STUBBLE_HEIGHT / TUFT_MAX_HEIGHT) * RAISE_MAX,
    };
  }

  const greenShare = (s.green[i] ?? 0) / 20;
  const seeded = (s.seedHeads[i] ?? 0) === 1;
  const cropping = land === VIEW_LAND.annual || land === VIEW_LAND.crop;
  // How the plants sit on the ground, and how much of it they hide. A view
  // from before these were sent (a past day) falls back to the district's
  // native form and the model's ground cover.
  const sentForm = s.form?.[i];
  const form: ViewForm =
    sentForm !== undefined && sentForm >= 0 && sentForm <= VIEW_FORM.bare
      ? (sentForm as ViewForm)
      : cropping
        ? VIEW_FORM.rows
        : land === VIEW_LAND.sown
          ? VIEW_FORM.carpet
          : (NATIVE_FORM_FALLBACK[view.district] ?? VIEW_FORM.openTussock);
  const sentHidden = s.hidden?.[i];
  const cover =
    sentHidden !== undefined ? Math.min(1, Math.max(0, sentHidden / 20)) : (s.cover[i] ?? 0) / 10;

  let leaf = mix(N.leafYoung, N.leafOld, (s.leafAge[i] ?? 0) / 10);
  let kind: SquareKind = 'pasture';
  let height = tuftHeight(cm);
  let seed = seeded ? N.seedHead : -1;
  if (land === VIEW_LAND.sown) {
    // Sown pasture is a deeper green.
    kind = 'sown';
    leaf = rgb(red(leaf) * 0.8, Math.min(255, green(leaf) * 1.05), blue(leaf) * 0.95);
  } else if (cropping) {
    // Bright green while leafy, golden with seed heads once heading or done.
    kind = 'crop';
    leaf = seeded ? N.cropGold : N.cropGreen;
    seed = seeded ? N.cropSeed : -1;
    height = Math.min(height, CROP_MAX_HEIGHT);
  }
  const straw = mix(N.strawFresh, N.strawWeathered, (s.weathered[i] ?? 0) / 10);

  // Green from the ground up: a short grazed sward is green to the tip, a
  // rank tussock has green only at the base.
  const greenReach = Math.min(1, greenShare * 1.25);
  // Under dry grass the ground is straw litter, not soil. Under green, shaded.
  const under = mix(N.shaded, N.litter, 1 - greenShare);
  const ground = mix(N.soil, under, cover);
  // From a distance the tops are what shows, so rank grass reads as straw.
  const tops = mix(straw, leaf, greenReach ** 1.5);
  // The open ground between plants is soil. The more of the ground the
  // sward hides, the more litter lies about in the gaps too, so a
  // well-covered paddock does not show raw soil between its plants (builder).
  const bare = mix(N.soil, N.litter, 0.45 * cover);
  // Where the sward hides the ground: its low leaf over litter or shade.
  const base = mix(under, tops, BASE_TOPS[form]);
  const floor = mix(bare, base, cover);
  const field = mix(floor, tops, cover * (cropping ? 0.7 : 0.85));

  return {
    kind,
    form,
    rows: cropping,
    cover,
    height,
    greenReach,
    greenShare,
    leaf,
    straw,
    seed,
    ground,
    bare,
    base,
    floor,
    field,
    raise: (Math.min(cm, FULL_HEIGHT_CM) / FULL_HEIGHT_CM) * RAISE_MAX,
  };
}

/** One band of colour on the front of a raised square, by height above the ground in world units. */
export interface FarBand {
  from: number;
  to: number;
  colour: number;
}

/** How dark the front of a raised square is beside its top. */
export const FAR_FRONT_SHADE = 0.68;

/**
 * The front of a raised square on the zoomed-out map: what shows above the
 * square in front of it, which stands `next` high.
 *
 * It is the sward in profile. Green shows from the ground up as far as the
 * green reaches, and dry feed above that. So rank grass with green at its
 * base shows a green band under a straw one, from a distance too.
 */
export function farFrontBands(look: SquareLook, next: number): FarBand[] {
  if (look.raise <= next + 0.004) return [];
  const thin = look.cover * 0.85;
  const face = (c: number): number => shade(mix(look.ground, c, thin), FAR_FRONT_SHADE);
  const greenTop = Math.min(look.raise, look.greenReach * look.raise);
  const bands: FarBand[] = [];
  if (greenTop > next + 0.004) bands.push({ from: next, to: greenTop, colour: face(look.leaf) });
  const dryFrom = Math.max(next, greenTop);
  if (look.raise > dryFrom + 0.004) {
    bands.push({ from: dryFrom, to: look.raise, colour: face(look.straw) });
  }
  return bands;
}

/**
 * True where the zoomed-out map flecks a square with seed heads. Crops
 * already read as rows, and turn gold when they head.
 */
export const farSeedFlecks = (look: SquareLook): boolean => look.seed >= 0 && look.kind !== 'crop';

/** Every square's look. */
export function allLooks(view: FarmView): SquareLook[] {
  const out = new Array<SquareLook>(GRID_N);
  for (let i = 0; i < GRID_N; i++) out[i] = squareLook(view, i);
  return out;
}

/** True if two looks would draw the same. */
export function sameLook(a: SquareLook, b: SquareLook): boolean {
  return (
    a.kind === b.kind &&
    a.form === b.form &&
    a.cover === b.cover &&
    a.height === b.height &&
    a.greenReach === b.greenReach &&
    a.leaf === b.leaf &&
    a.straw === b.straw &&
    a.seed === b.seed &&
    a.ground === b.ground &&
    a.bare === b.bare &&
    a.base === b.base
  );
}

export type TuftShape = 'grass' | 'crop' | 'stubble';

/** One standing tuft. */
export interface Tuft {
  /** Where its base sits, in ground coordinates. */
  x: number;
  y: number;
  /** Its full height and width, world units. */
  h: number;
  w: number;
  /** The height of its green part, from the ground up, world units. 0 for all dry. */
  greenH: number;
  shape: TuftShape;
  /** Which of the drawn pieces to use, 0 to 2. */
  variant: number;
  leaf: number;
  straw: number;
  /** Seed head colour, or -1 for none. */
  seed: number;
  /** True for a white clover flower on top (sown pasture). */
  clover: boolean;
}

/** Numbers kept for each tuft spot: stand, vary, tall, across, down, tone, variant. */
const SPOT = 7;
let spots: Float32Array | null = null;

/**
 * The fixed scatter for every tuft spot on the farm, worked out once. It
 * never changes, so a new view costs no scatter at all.
 */
export function spotTable(): Float32Array {
  if (!spots) {
    spots = new Float32Array(GRID_N * TUFTS_PER_SQUARE * SPOT);
    for (let i = 0; i < GRID_N; i++) {
      for (let k = 0; k < TUFTS_PER_SQUARE; k++) {
        const o = (i * TUFTS_PER_SQUARE + k) * SPOT;
        for (let n = 0; n < 6; n++) spots[o + n] = unit(hash3(i, k, n + 1));
        spots[o + 6] = hash3(i, k, 7) % 3;
      }
    }
  }
  return spots;
}

/** Numbers kept for each tuft spot, for the ground picture's clumps. */
export const SPOT_STRIDE = SPOT;

/**
 * Where tuft spot `k` of square `i` sits inside its square (0 to 1 across
 * and down), when the plants are not in rows, and the number that says how
 * soon it stands (it stands while that number is under the cover). The
 * ground picture grows its clumps round these same spots, so the tussocks
 * zoomed in stand on their own clumps.
 */
export function spotPlace(i: number, k: number): [fx: number, fy: number, stand: number] {
  const table = spotTable();
  const o = (i * TUFTS_PER_SQUARE + k) * SPOT;
  const gx = k % 3;
  const gy = Math.floor(k / 3);
  return [
    (gx + 0.12 + 0.76 * table[o + 3]!) / 3,
    (gy + 0.12 + 0.76 * table[o + 4]!) / 3,
    table[o]!,
  ];
}

/**
 * The tufts standing on a square. Each square has nine fixed spots, so a
 * tuft never moves when the grass changes: it only grows, shrinks, changes
 * colour, or goes when ground cover is lost.
 */
export function squareTufts(i: number, look: SquareLook, out: Tuft[] = []): Tuft[] {
  if (look.kind === 'fallow' || look.cover <= 0) return out;
  const col = i % GRID_W;
  const row = Math.floor(i / GRID_W);
  const shape: TuftShape =
    look.kind === 'stubble' ? 'stubble' : look.kind === 'crop' ? 'crop' : 'grass';
  const table = spotTable();
  for (let k = 0; k < TUFTS_PER_SQUARE; k++) {
    const o = (i * TUFTS_PER_SQUARE + k) * SPOT;
    const stand = table[o]!;
    // Tufts only stand where cover allows.
    if (stand > look.cover * 1.05) continue;
    const vary = table[o + 1]!;
    const tall = 0.65 + 0.7 * table[o + 2]!;
    const gx = k % 3;
    const gy = Math.floor(k / 3);
    let fx: number;
    let fy: number;
    let h: number;
    if (look.rows) {
      // Cultivated rows: three rows to a square, plants snapped to the row.
      fx = (gx + 0.5 + (table[o + 3]! - 0.5) * 0.2) / 3;
      fy = (gy + 0.5) / 3;
      h = look.height * (0.9 + (0.15 * (tall - 0.65)) / 0.7);
    } else {
      fx = (gx + 0.12 + 0.76 * table[o + 3]!) / 3;
      fy = (gy + 0.12 + 0.76 * table[o + 4]!) / 3;
      h = look.height * tall;
    }
    h = Math.max(TUFT_MIN_HEIGHT, h);
    // Green from the ground up to height x green share x (0.65 to 1.35) x 1.25
    // (docs/VISUALS.md). A sward that is all green is green to the tip.
    const greenH =
      look.kind === 'stubble'
        ? 0
        : look.greenShare >= 1
          ? h
          : h * Math.min(1, look.greenShare * (0.65 + 0.7 * vary) * 1.25);
    const tone = 0.9 + 0.2 * table[o + 5]!;
    const seedMin = look.rows ? 0.11 : 0.22;
    out.push({
      x: col + fx,
      y: row + fy,
      h,
      // A short tuft is narrow too, so it reads as a tuft and not a dash.
      // Tussocks are broad clumps, a carpet's tufts fine.
      w: Math.min(TUFT_WIDTH, Math.max(0.13, h * 1.5)) * (0.85 + 0.3 * vary) * TUFT_WIDE[look.form],
      greenH,
      shape,
      variant: table[o + 6]!,
      leaf: shade(look.leaf, tone),
      straw: shade(look.straw, tone),
      seed: look.seed >= 0 && h > seedMin ? look.seed : -1,
      // White flowers where a clover runs through the sward.
      clover: clovery(look.form) && vary > 0.94 && look.greenShare > 0.4,
    });
  }
  return out;
}
