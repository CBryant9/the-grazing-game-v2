/**
 * Sheep prices, wool prices and the costs of running sheep (milestone 2.4,
 * engine half). Every figure is sourced, or marked STAND-IN and listed in
 * docs/DATA.md ("Sheep in the game") and DEVELOPMENT_LOG. Server only.
 */

import type { SheepBreed } from './sheep';

/**
 * MLA's national sheep indicators, c/kg carcase weight, on 12 Nov 2026: the
 * last day of the tables the repo pulls from MLA's statistics service
 * (`packages/engine/data/raw/mla/national/*.csv`, pulled with
 * `pnpm data:mla`). A dated stand-in for every farm until the real-year
 * sheep prices are wired in (listed): the indicators the game needs are
 * these six.
 */
export const SHEEP_INDICATORS_C_KG = {
  /** National Light Lamb Indicator, 12 to 20 kg carcase. */
  lightLamb: 1152.61,
  /** National Trade Lamb Indicator, 20 to 26 kg. */
  tradeLamb: 1169.05,
  /** National Heavy Lamb Indicator, 26 kg and over. */
  heavyLamb: 1156.65,
  /** National Merino Lamb Indicator, all weights. */
  merinoLamb: 1083.55,
  /** National Restocker Lamb Indicator, 0 to 22 kg (store lambs bought to grow on). */
  restockerLamb: 1259.4,
  /** National Mutton Indicator, ewes and wethers. */
  mutton: 872.92,
} as const;
export type SheepIndicatorId = keyof typeof SHEEP_INDICATORS_C_KG;
/** The date of the stand-in indicators. */
export const SHEEP_PRICE_DATE = '2026-11-12';

/** The carcase weight bands of the lamb indicators (MLA spec sheet, S52), kg. */
export const LAMB_BANDS = { light: 20, trade: 26 } as const;

/**
 * Store and breeding sheep bought by the head, where MLA's indicators are
 * per kg of carcase:
 * - first-cross ewes, 1.5 years old: $556 a head (Bendigo First X Blue
 *   Ribbon sale, 6 Nov 2026, in MLA's weekly market wrap of 13 Nov 2026);
 * - Merino breeding ewes, wethers and rams: STAND-INS. No dated Online
 *   Sheep (AuctionsPlus) figure was read; Merino ewes and wethers are priced
 *   at their mutton value × `breedingPremium`, rams at `ramHead`.
 */
export const SHEEP_HEAD_PRICES = {
  xbEwe: 556,
  breedingPremium: 1.5,
  ramHead: 1200,
} as const;

/**
 * Selling and buying costs for sheep, the cattle figures (money/costs.ts,
 * the MVP's): 5% commission on a sale. Freight and yard dues for sheep are a
 * STAND-IN of $3 a head each way: no dated sheep freight was found.
 */
export const SHEEP_TRADE = { commission: 0.05, headFee: 3 } as const;

/** Most sheep bought at once (as the cattle limit's scale). */
export const MAX_SHEEP_BUY = 5000;

/**
 * Wool, c/kg clean by micron (AWEX micron price guides in AWI's weekly
 * price report, sales week 10, 1 to 2 September 2026, S53; call C20: a
 * dated stand-in until the AWEX agreement). In between, the price is drawn
 * as a straight line; outside, the nearest figure.
 */
export const WOOL_PRICE_C_KG: readonly (readonly [number, number])[] = [
  [17, 2569],
  [18, 2443],
  [19, 2178],
  [20, 1914],
  [21, 1786],
  [26, 852],
  [28, 642],
  [30, 605],
];

/**
 * Shearing and crutching by contractors (Fair Work Ombudsman, Pastoral
 * Award pay guide, rates from 1 July 2024, S47; call C16, dated): machine
 * shearing flock sheep $381.58 a 100 and rams $763.16 a 100; a full crutch
 * at the shed $110.66 a 100. The shed hands, classer and presser are not
 * charged (no all-in rate was found).
 */
export const SHEARING_RATE = { sheep: 3.8158, ram: 7.6316, crutch: 1.1066 } as const;

/**
 * Animal health (drench, vaccine, lice), dollars a head a year. STAND-IN:
 * no sheep figure was read (the NSW DPIRD budgets refused automatic
 * reading); the cattle figure for the district ($30 a head, the MVP's) over
 * 8.4, one DSE's share of an AE, about $3.57.
 */
export const SHEEP_HEALTH_PER_HEAD_YEAR = 30 / 8.4;

/** Clean wool price for a micron, c/kg. */
export function woolPriceCKg(micron: number): number {
  const t = WOOL_PRICE_C_KG;
  if (micron <= t[0]![0]) return t[0]![1];
  for (let i = 1; i < t.length; i++) {
    const [m1, p1] = t[i]!;
    const [m0, p0] = t[i - 1]!;
    if (micron <= m1) return p0 + ((p1 - p0) * (micron - m0)) / (m1 - m0);
  }
  return t[t.length - 1]![1];
}

/** The lamb indicator for a lamb's carcase weight and breed. */
export function lambIndicator(carcaseKg: number, breed: SheepBreed): SheepIndicatorId {
  if (breed === 'merino') return 'merinoLamb';
  return carcaseKg < LAMB_BANDS.light
    ? 'lightLamb'
    : carcaseKg < LAMB_BANDS.trade
      ? 'tradeLamb'
      : 'heavyLamb';
}
