/**
 * Every colour the map uses, in one place.
 *
 * The country keeps its natural colours in both themes (PRD 6.3a): grass,
 * soil, fences, water and cattle are the same in light and dark. Only the
 * map's surround, its labels and its markers change with the theme.
 *
 * The natural colours are the ones in docs/VISUALS.md.
 */

import type { ViewCattleKind } from '@gg/shared';
import { rgb } from './colour';

export type MapTheme = 'light' | 'dark';
export type CattleBreed = 'british' | 'brahman';

export interface CattleColours {
  body: number;
  head: number;
  legs: number;
  /** A pale band along the belly and brisket, or -1 for none. */
  underline: number;
  /** A light line along the back that lifts a dark beast off dark ground, or -1. */
  topline: number;
}

export const NATURAL = {
  // ---- Ground
  /** Bare soil. */
  soil: rgb(128, 94, 60),
  /** Litter under dry grass: straw, never soil (LESSONS 4). */
  litter: rgb(170, 144, 88),
  /** Shaded ground under living grass. */
  shaded: rgb(70, 88, 40),
  /** Worked soil in fallow, and its lighter clods. */
  fallow: rgb(112, 80, 52),
  fallowClod: rgb(140, 100, 65),
  /** Stubble: pale straw rows. */
  stubble: rgb(170, 146, 92),

  // ---- Grass
  leafYoung: rgb(150, 216, 70),
  leafOld: rgb(66, 138, 50),
  strawFresh: rgb(224, 192, 104),
  strawWeathered: rgb(180, 160, 108),
  seedHead: 0xefdca4,
  clover: 0xf4f1e6,
  cropGreen: rgb(128, 212, 64),
  cropGold: rgb(214, 186, 84),
  cropSeed: 0xe6c35a,

  // ---- Fences and gates
  fencePermanent: 0xa06a38,
  fenceElectric: 0xffe14a,
  fenceTape: 0xffffff,
  fenceDown: 0xff5032,
  fencePost: 0x3e2612,
  fencePostBoundary: 0x2e1c0c,
  fencePostElectric: 0x5a4a30,
  fencePostTape: 0xff8a3a,
  /** The dark line under every wire, so a fence reads on any ground. */
  fenceCasing: 0x1c1208,
  gateRail: 0xdfe5e8,
  gatePost: 0x3b2c1c,
  gateOpen: 0x5fd04a,
  gateShut: 0xe8503a,

  // ---- Water
  pipe: 0x5ab4f0,
  pipeDry: 0x7e8a96,
  troughBody: 0x8d969b,
  troughRim: 0xc3cbcf,
  water: 0x3f9fe0,
  waterShine: 0xbfe4ff,
  portableBody: 0x2f6fb8,
  portableRim: 0x5a9be0,
  portableTank: 0xe8e4da,
  levelHigh: 0x7fe05a,
  levelMid: 0xf0b43a,
  levelLow: 0xff5a3a,
  boreRing: 0xffd75a,
  windmill: 0xd8d2c4,
  windmillDark: 0x8e9196,
  windmillVane: 0xc23b22,

  // ---- Trees and buildings
  treeTrunk: 0xe6e1d3,
  treeLeaf: 0x8fa866,
  treeLeafDark: 0x4d6236,
  wall: 0xece2c8,
  roof: 0xb84a3a,
  iron: 0xb9c0c4,
  ironDark: 0x7d868c,
  timber: 0x8a6a44,
  timberDark: 0x5e4528,
  yardDirt: 0x9b7b53,

  // ---- Cattle
  /** The dark line round every beast. */
  cattleOutline: 0x120d0a,
  /** A thin pale rim outside the dark line, so a beast reads on dark ground too. */
  cattleHalo: 0xfffaf0,

  // ---- Layers
  layerWaterNear: rgb(70, 160, 240),
  layerWaterMid: rgb(240, 200, 60),
  layerWaterFar: rgb(230, 110, 30),
  layerWaterNone: rgb(200, 40, 30),
  layerQualityLow: rgb(225, 50, 40),
  layerQualityHigh: rgb(40, 210, 60),
  layerGrazed: rgb(255, 60, 40),
  layerArable: rgb(255, 240, 170),
  layerArableCropped: rgb(255, 214, 90),

  // ---- Light
  // The daytime lights are kept bright enough that cattle still stand out at
  // 3 to 1 in the dimmest of them, rain at first or last light (palette.test.ts).
  lightNight: rgb(86, 104, 168),
  lightFirst: rgb(255, 214, 176),
  lightDay: rgb(255, 255, 255),
  lightLast: rgb(255, 210, 170),
  lightOvercast: rgb(222, 228, 238),
  lightRain: rgb(205, 214, 230),
  rain: 0xdfeaff,
} as const;

/**
 * Cattle colours by breed style and kind. British-breed style: black cows,
 * dark brown heifers, red-brown steers with white faces, heavy grey bulls,
 * brown calves. Brahman style for the north: pale grey cows, cream heifers,
 * red steers, dark grey bulls with a big hump, fawn calves.
 */
export const CATTLE: Record<CattleBreed, Record<ViewCattleKind, CattleColours>> = {
  british: {
    cow: { body: 0x2b2523, head: 0x2b2523, legs: 0x141010, underline: -1, topline: 0x8a8078 },
    heifer: { body: 0x4a332a, head: 0x4a332a, legs: 0x241712, underline: -1, topline: 0x9a7a66 },
    steer: { body: 0x8e3c1e, head: 0xefe5d2, legs: 0x5a2412, underline: 0xefe5d2, topline: -1 },
    bull: { body: 0x77716a, head: 0x5c5751, legs: 0x3e3a36, underline: -1, topline: 0xb9b3a8 },
    calf: { body: 0x77503a, head: 0x8a6044, legs: 0x3a2619, underline: -1, topline: -1 },
  },
  brahman: {
    cow: { body: 0xbdb7aa, head: 0xa9a395, legs: 0x6d675c, underline: -1, topline: -1 },
    heifer: { body: 0xd8cfbd, head: 0xc4baa6, legs: 0x857c6c, underline: -1, topline: -1 },
    steer: { body: 0xb0603a, head: 0x9c5432, legs: 0x5f311c, underline: -1, topline: -1 },
    bull: { body: 0x6f6a62, head: 0x55514b, legs: 0x35322e, underline: -1, topline: 0xa8a297 },
    calf: { body: 0xc9a57a, head: 0xb8946a, legs: 0x7a6044, underline: -1, topline: -1 },
  },
};

/** The parts of the map that change with the theme. */
export interface ThemeColours {
  /** Behind and around the farm. */
  surround: number;
  /** The rim round the farm. */
  farmEdge: number;
  labelBg: number;
  labelBgAlpha: number;
  labelText: number;
  labelMuted: number;
  /** "No water" on a label or a marker. */
  noWater: number;
  /** The text on a paddock label chip. */
  chipText: number;
  markerBg: number;
  markerText: number;
  markerLine: number;
  /** The line round a highlighted paddock. */
  highlight: number;
  /** The line round the paddock under the mouse. */
  hover: number;
}

export const THEMES: Record<MapTheme, ThemeColours> = {
  dark: {
    surround: 0x10190f,
    farmEdge: 0x05080c,
    labelBg: 0x0b1220,
    labelBgAlpha: 0.88,
    labelText: 0xf3e7cf,
    labelMuted: 0xc9c2b0,
    noWater: 0xffb49a,
    chipText: 0x111111,
    markerBg: 0x0b1220,
    markerText: 0xf3e7cf,
    markerLine: 0xc6f432,
    highlight: 0xc6f432,
    hover: 0xffffff,
  },
  light: {
    surround: 0xd9d2bd,
    farmEdge: 0x6b5b3e,
    labelBg: 0xfffaf0,
    labelBgAlpha: 0.94,
    labelText: 0x1b2438,
    labelMuted: 0x4a5468,
    noWater: 0xa3301f,
    chipText: 0x111111,
    markerBg: 0xfffaf0,
    markerText: 0x1b2438,
    markerLine: 0x557a08,
    highlight: 0x557a08,
    hover: 0x1b2438,
  },
};

export interface MapPalette {
  theme: MapTheme;
  natural: typeof NATURAL;
  cattle: typeof CATTLE;
  ui: ThemeColours;
}

/** The whole palette for a theme. */
export const paletteFor = (theme: MapTheme): MapPalette => ({
  theme,
  natural: NATURAL,
  cattle: CATTLE,
  ui: THEMES[theme],
});

/** Central Queensland runs Brahman-style cattle. The southern districts run British breeds. */
export const breedFor = (district: string): CattleBreed =>
  district === 'cq' ? 'brahman' : 'british';
