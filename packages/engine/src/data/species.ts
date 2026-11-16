/**
 * Sown pastures, forages and crops.
 *
 * Copied from the MVP's SPECIES table for the four launch districts
 * (docs/DATA.md, Sown pastures, forages and crops). Jarra digit grass is left
 * out, because only the Top End could plant it. Its figures stay in
 * docs/DATA.md.
 *
 * `g` is growth potential, kg DM/ha/day, January to December, once
 * established. `sow` lists the months it can be sown (0 is January).
 * `cost` is $/ha to establish (seed, fertiliser, spraying, sowing). Days are
 * counted from sowing. A change to any figure here is a model change.
 */

import type { DistrictId } from '@gg/shared';

/** Winter crop growth curve. */
export const WINTER_CURVE: readonly number[] = [5, 5, 15, 30, 35, 30, 30, 45, 75, 85, 55, 15];
/** Summer crop growth curve. */
export const SUMMER_CURVE: readonly number[] = [90, 95, 70, 30, 8, 2, 0, 0, 10, 40, 70, 85];
/** Summer brassica growth curve. */
export const BRASSICA_CURVE: readonly number[] = [60, 55, 40, 20, 5, 0, 0, 0, 15, 45, 65, 65];

/**
 * `pasture` is a perennial pasture (sown, or oversown into native).
 * `annual` is a forage crop or annual pasture: grazed, no grain.
 * `crop` is a grain crop. Dual-purpose ones can be grazed early.
 */
export type SpeciesType = 'pasture' | 'annual' | 'crop';

export type SpeciesId =
  | 'buffel'
  | 'leucaena'
  | 'stylo'
  | 'phal'
  | 'rye'
  | 'lucerne'
  | 'multi'
  | 'oats'
  | 'wheat'
  | 'barley'
  | 'grsorg'
  | 'forsorg'
  | 'millet'
  | 'annrye'
  | 'brass';

export interface Species {
  id: SpeciesId;
  name: string;
  /** Short name, for labels. */
  short: string;
  type: SpeciesType;
  /** What it is and how it behaves, in a sentence or two. */
  info: string;
  /** Growth curve, or one curve for each district that grows it. Oversown species have none. */
  g?: readonly number[] | Partial<Record<DistrictId, readonly number[]>>;
  /** Days from sowing until it is established. */
  estab: number;
  /** Months it can be sown, 0 for January. The first is when its window opens. */
  sow: readonly number[];
  /** $/ha to establish. */
  cost: number;
  /** The most standing feed it can carry, kg DM/ha, on average soil. */
  bmax?: number;

  // Perennial pasture.
  /** Pasture: years before it thins out. Annual: days from sowing until it finishes. */
  life?: number;
  /** Digestibility of its youngest leaf, 0 to 1. */
  dmd?: number;
  /** Crude protein % of its youngest leaf. */
  cp?: number;
  /** Crude protein % of its dead feed. */
  cpDead?: number;
  /** Sown into the native pasture, which keeps growing. */
  oversow?: true;
  /** Oversown: growth as a multiple of the native curve. */
  gx?: number;
  /** Oversown: added to the native pasture's top digestibility. */
  dmdAdd?: number;
  /** Oversown: added to the native pasture's top crude protein %. */
  cpAdd?: number;
  /** Oversown: added to the crude protein % of dead native feed (5). */
  cpDeadAdd?: number;

  // Annual forages and grain crops.
  /** Digestibility while leafy. */
  dmdV?: number;
  /** Crude protein % while leafy. */
  cpV?: number;
  /** Annual pasture: the share that comes back from seed the next year, once. */
  regen?: number;

  // Grain crops.
  /** The grain it gives. */
  grain?: string;
  /** Day it is locked up for grain. */
  lock?: number;
  /** Day it starts heading. */
  head?: number;
  /** Day the grain is ready. */
  mature?: number;
  /** Grain yield in an average season, t/ha, before the district factor. */
  yield?: number;
  /** Grain price, $/t. */
  price?: number;
  /** Harvest cost, $/ha. */
  harvest?: number;
  /** False for a grain-only crop: any grazing before maturity costs yield. */
  graze?: false;
}

type Figures = Omit<Species, 'id'>;

const FIGURES: Record<SpeciesId, Figures> = {
  buffel: {
    name: 'Buffel grass + butterfly pea',
    short: 'buffel',
    type: 'pasture',
    g: [60, 62, 48, 22, 9, 4, 2, 2, 4, 10, 30, 50],
    dmd: 0.64,
    cp: 12,
    cpDead: 6,
    bmax: 8000,
    estab: 150,
    life: 25,
    sow: [10, 11, 0, 1],
    cost: 120,
    info: 'Hardy perennial tropical grass with a climbing legume. Big summer growth, holds on into the dry. Lasts for decades.',
  },
  leucaena: {
    name: 'Leucaena + buffel',
    short: 'leucaena',
    type: 'pasture',
    g: [50, 55, 45, 28, 14, 8, 6, 7, 12, 20, 35, 45],
    dmd: 0.7,
    cp: 20,
    cpDead: 10,
    bmax: 7000,
    estab: 365,
    life: 30,
    sow: [10, 11, 0],
    cost: 450,
    info: 'Rows of leucaena (a high-protein tree legume) with grass between. Excellent for fattening, green well into the dry. Takes a year to establish.',
  },
  stylo: {
    name: 'Stylo, oversown',
    short: 'stylo',
    type: 'pasture',
    oversow: true,
    gx: 1.05,
    dmdAdd: 0.02,
    cpAdd: 4,
    cpDeadAdd: 2,
    estab: 120,
    life: 20,
    sow: [11, 0, 1],
    cost: 40,
    info: 'Cheap legume broadcast into the native pasture. Same grass, but more protein, especially in the dry season. No loss of feed while it establishes.',
  },
  phal: {
    name: 'Phalaris + sub clover',
    short: 'phalaris',
    type: 'pasture',
    g: {
      nsw: [25, 20, 22, 28, 20, 8, 5, 12, 35, 55, 48, 32],
      cw: [12, 10, 18, 30, 22, 12, 10, 20, 45, 60, 38, 18],
      wv: [8, 6, 15, 32, 28, 18, 14, 28, 55, 72, 55, 20],
    },
    dmd: 0.74,
    cp: 20,
    cpDead: 7,
    bmax: 6500,
    estab: 200,
    life: 6,
    sow: [2, 3, 4, 8],
    cost: 350,
    info: 'Long-lived perennial grass with an annual clover. Winter and spring feed, tough in dry summers. Thins out after about 6 years.',
  },
  rye: {
    name: 'Perennial ryegrass + white clover',
    short: 'ryegrass',
    type: 'pasture',
    g: {
      nsw: [28, 22, 24, 30, 18, 6, 4, 10, 38, 60, 50, 35],
      wv: [10, 8, 15, 30, 28, 18, 15, 30, 60, 80, 60, 25],
    },
    dmd: 0.77,
    cp: 23,
    cpDead: 7,
    bmax: 6000,
    estab: 150,
    life: 5,
    sow: [2, 3, 4, 8],
    cost: 300,
    info: 'Top-quality feed in winter and spring, but needs good rainfall and goes quiet in a dry summer. Thins out after about 5 years. Cheaper than a mix.',
  },
  lucerne: {
    name: 'Lucerne',
    short: 'lucerne',
    type: 'pasture',
    g: {
      cw: [45, 38, 30, 22, 10, 4, 3, 8, 25, 45, 55, 50],
      nsw: [38, 32, 25, 15, 6, 2, 1, 5, 18, 38, 45, 42],
    },
    dmd: 0.7,
    cp: 22,
    cpDead: 12,
    bmax: 6000,
    estab: 150,
    life: 6,
    sow: [2, 3, 8],
    cost: 400,
    info: 'Deep-rooted perennial legume. Green and high-protein through summer when other pastures stop. Rotationally graze it or it dies out.',
  },
  multi: {
    name: 'Multi-species mix',
    short: 'multi-species',
    type: 'pasture',
    g: {
      nsw: [35, 30, 28, 30, 18, 7, 5, 12, 35, 52, 48, 40],
      cw: [25, 22, 25, 30, 20, 10, 8, 18, 40, 52, 40, 30],
      wv: [20, 15, 20, 32, 26, 15, 12, 25, 52, 68, 55, 30],
    },
    dmd: 0.76,
    cp: 22,
    cpDead: 8,
    bmax: 6000,
    estab: 120,
    life: 5,
    sow: [2, 3, 4, 8, 9],
    cost: 450,
    info: 'Chicory, plantain, clovers, cocksfoot and fescue together. Something is growing most of the year, protein stays high. Costs more and needs resting.',
  },
  oats: {
    name: 'Oats (graze & grain)',
    short: 'oats',
    type: 'crop',
    grain: 'oats',
    g: WINTER_CURVE,
    dmdV: 0.78,
    cpV: 22,
    estab: 50,
    lock: 110,
    head: 150,
    mature: 200,
    yield: 2.5,
    price: 300,
    harvest: 60,
    cost: 220,
    bmax: 9000,
    sow: [1, 2, 3, 4],
    info: 'Dual-purpose. Graze from about 7 weeks, lock up by mid-winter, harvest grain in late spring. Or just graze it as winter forage.',
  },
  wheat: {
    name: 'Dual-purpose wheat',
    short: 'wheat',
    type: 'crop',
    grain: 'wheat',
    g: WINTER_CURVE,
    dmdV: 0.78,
    cpV: 24,
    estab: 60,
    lock: 100,
    head: 150,
    mature: 200,
    yield: 3,
    price: 330,
    harvest: 65,
    cost: 320,
    bmax: 10000,
    sow: [2, 3, 4],
    info: 'Graze it early in winter, then lock it up for a grain crop. Grazing after lock-up eats the heads.',
  },
  barley: {
    name: 'Barley (grain)',
    short: 'barley',
    type: 'crop',
    grain: 'barley',
    g: WINTER_CURVE,
    dmdV: 0.76,
    cpV: 20,
    estab: 50,
    lock: 70,
    head: 130,
    mature: 180,
    yield: 3.2,
    price: 280,
    harvest: 60,
    cost: 300,
    bmax: 9000,
    sow: [4, 5],
    graze: false,
    info: 'Grain crop. Keep stock off it until harvest, then graze the stubble.',
  },
  grsorg: {
    name: 'Grain sorghum',
    short: 'sorghum',
    type: 'crop',
    grain: 'sorghum',
    g: SUMMER_CURVE,
    dmdV: 0.7,
    cpV: 14,
    estab: 35,
    lock: 45,
    head: 80,
    mature: 120,
    yield: 3.5,
    price: 300,
    harvest: 60,
    cost: 300,
    bmax: 12000,
    sow: [9, 10, 11, 0],
    graze: false,
    info: 'Summer grain crop. Not for grazing while it grows: graze the stubble after harvest.',
  },
  forsorg: {
    name: 'Forage sorghum',
    short: 'forage sorghum',
    type: 'annual',
    g: SUMMER_CURVE,
    dmdV: 0.72,
    cpV: 16,
    estab: 45,
    life: 200,
    cost: 200,
    bmax: 14000,
    sow: [9, 10, 11, 0],
    info: 'Big summer bulk feed. Graze from 6–8 weeks (not earlier: prussic acid risk in young plants), regrows after each grazing until frost or the dry.',
  },
  millet: {
    name: 'Japanese millet',
    short: 'millet',
    type: 'annual',
    g: SUMMER_CURVE.map((v) => v * 0.8),
    dmdV: 0.72,
    cpV: 16,
    estab: 40,
    life: 130,
    cost: 150,
    bmax: 9000,
    sow: [9, 10, 11],
    info: 'Quick summer forage that fills the summer gap. Ready in about 6 weeks.',
  },
  annrye: {
    name: 'Annual ryegrass',
    short: 'annual rye',
    type: 'annual',
    g: WINTER_CURVE,
    dmdV: 0.8,
    cpV: 24,
    estab: 50,
    life: 250,
    cost: 180,
    bmax: 7000,
    sow: [2, 3, 4],
    regen: 0.12,
    info: 'High-quality winter feed. Dies off in early summer; about 10% comes back from seed the next year, for one year.',
  },
  brass: {
    name: 'Summer brassica (rape / turnip)',
    short: 'brassica',
    type: 'annual',
    g: BRASSICA_CURVE,
    dmdV: 0.84,
    cpV: 18,
    estab: 50,
    life: 140,
    cost: 260,
    bmax: 8000,
    sow: [9, 10],
    info: 'Very high-quality feed for the dry summer gap. Graze it in one or two hits.',
  },
};

export const SPECIES_IDS = Object.keys(FIGURES) as SpeciesId[];

export const SPECIES: Readonly<Record<SpeciesId, Species>> = Object.fromEntries(
  SPECIES_IDS.map((id) => [id, { id, ...FIGURES[id] }]),
) as Record<SpeciesId, Species>;

/**
 * A species' growth curve in a district. Where it has a curve for each
 * district and this one is not listed, the first listed curve is used, as
 * the MVP did. Oversown species have no curve of their own.
 */
export function speciesCurve(sp: Species, district: DistrictId): readonly number[] {
  const g = sp.g;
  if (!g) throw new Error(`${sp.id} has no growth curve of its own`);
  if (Array.isArray(g)) return g as readonly number[];
  const byDistrict = g as Partial<Record<DistrictId, readonly number[]>>;
  return byDistrict[district] ?? Object.values(byDistrict)[0]!;
}
