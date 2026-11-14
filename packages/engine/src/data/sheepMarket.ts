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
 * What the game charges for wool harvesting and rams (review of the third
 * pass, item 14), from the NSW DPIRD Merino ewe gross margin budgets (Farm
 * Enterprise Budget Series, October 2024, 20-micron ewes; the pages refuse
 * automatic reading, so the figures were seen in search summaries only,
 * docs/DATA.md "Sheep gross margin budget"):
 * - shearing $9.81 a head shorn, all in (shearers, shed hands, classer and
 *   presser; the award piece rate above is the shearer's alone), rams twice
 *   that (the award's ram to sheep ratio);
 * - crutching $1.92 a head;
 * - rams at 2% of the ewes (the budget's ram percentage; the game joins at
 *   1% + 1, call C13) are replaced over `ramYears` working years at the
 *   ram price (SHEEP_HEAD_PRICES.ramHead): a running cost a ram a day.
 *   `ramYears` 4 is a STAND-IN: no ram working life was read.
 */
export const SHEEP_BUDGET_COSTS = {
  shearPerHead: 9.81,
  crutchPerHead: 1.92,
  ramYears: 4,
} as const;

/**
 * Animal health (drench, vaccine, lice), dollars a head a year. STAND-IN:
 * no sheep figure was read (the NSW DPIRD budgets refused automatic
 * reading); the cattle figure for the district ($30 a head, the MVP's) over
 * 8.4, one DSE's share of an AE, about $3.57.
 */
export const SHEEP_HEALTH_PER_HEAD_YEAR = 30 / 8.4;

/**
 * Call C20 names the sale commentary's Eastern Market Indicator, 1,890 c/kg
 * clean (1 to 2 September 2026, S53), as the dated wool price. The micron
 * guides above sit in the same page's ticker, which carries no date and an
 * EMI of 1,722. So the price by micron is the guide's line scaled to the
 * dated EMI: × 1,890 ÷ 1,722. The guide gives the spread across microns, the
 * EMI the level (docs/DATA.md).
 */
export const WOOL_EMI = { dated: 1890, ticker: 1722 } as const;

/** Clean wool price for a micron, c/kg (the guide's line at the dated EMI). */
export function woolPriceCKg(micron: number): number {
  const t = WOOL_PRICE_C_KG;
  const k = WOOL_EMI.dated / WOOL_EMI.ticker;
  if (micron <= t[0]![0]) return t[0]![1] * k;
  for (let i = 1; i < t.length; i++) {
    const [m1, p1] = t[i]!;
    const [m0, p0] = t[i - 1]!;
    if (micron <= m1) return (p0 + ((p1 - p0) * (micron - m0)) / (m1 - m0)) * k;
  }
  return t[t.length - 1]![1] * k;
}

/**
 * What it costs to harvest and sell wool beyond the shearers' piece rate,
 * all in one place. Every figure here is a STAND-IN: the pages that give
 * them (the NSW DPIRD budgets, AWI's selling systems review, the Pastoral
 * Award's shed hand rates) refused automatic reading on 15 Nov 2026, and the
 * values were seen only in search summaries (docs/DATA.md lists each):
 * - shed staff (wool handlers, presser, classer), dollars a head shorn;
 * - the wool levy, a share of the sale (WoolPoll);
 * - broker's commission, testing and warehousing, dollars a bale;
 * - cartage to store and the pack, dollars a bale;
 * - kg of greasy wool in a bale;
 * - oddments (bellies, pieces, locks, crutchings): their share of the clip
 *   and their price against fleece wool (Mecardo, "Merino wool categories",
 *   9 June 2022, read: pieces about 125 c/kg clean, about 10%, under fleece).
 */
export const WOOL_HARVEST = {
  shedStaffPerHead: 1.5,
  levyShare: 0.015,
  sellingPerBale: 40,
  cartagePerBale: 16,
  packPerBale: 14,
  kgGreasyPerBale: 180,
  oddmentsShare: 0.22,
  oddmentsPrice: 0.9,
} as const;

/** Feed barley, dollars a kg: about $330 a tonne up-country (Grain Central, "Feedgrain Focus", 9 July 2026, read). */
export const GRAIN_PER_KG = 0.33;

/** The lamb indicator for a lamb's carcase weight and breed. */
export function lambIndicator(carcaseKg: number, breed: SheepBreed): SheepIndicatorId {
  if (breed === 'merino') return 'merinoLamb';
  return carcaseKg < LAMB_BANDS.light
    ? 'lightLamb'
    : carcaseKg < LAMB_BANDS.trade
      ? 'tradeLamb'
      : 'heavyLamb';
}
