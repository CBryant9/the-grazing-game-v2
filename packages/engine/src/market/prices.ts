/**
 * Cattle prices: where they come from, and what an animal is worth.
 *
 * The rest of the engine reads prices through `Prices` and gets them from a
 * `PriceSource`. Milestone 1.4 puts real MLA data behind this interface.
 * Until then the MVP's approximate series is the stand-in (standIn.ts).
 *
 * The valuing rules here are the MVP's cpk, value, netSale and estBuy,
 * matched number for number (docs/DATA.md, Market).
 */

import { marketClass } from '../cattle/animal';
import type { Animal } from '../cattle/types';
import type { FarmStart } from '../calendar';
import { SALE_CLASSES, type MarketClassId, type SaleClassId } from '../data/cattle';
import { COW_CALF_FREIGHT, HEAD_FEE, SELL_COMMISSION } from '../money/costs';
import type { Rng } from '../rng';

/** Today's prices, as the rest of the engine reads them. */
export interface Prices {
  /** The young cattle indicator (restocker yearling steers), c/kg live weight. */
  indicator: number;
  /** c/kg live weight for each class, before the condition adjustments. */
  classes: Readonly<Record<MarketClassId, number>>;
}

/**
 * Where prices come from. A source keeps its own state, which is saved with
 * the farm, so it must be plain data that survives JSON.
 */
export interface PriceSource<State> {
  /** The market on the farm's first day. May draw from the market stream. */
  open(start: FarmStart, rng: Rng): State;
  /** Move the market on to a farm day. Called once at the end of each day, in order. */
  step(state: State, start: FarmStart, toDay: number, rng: Rng): void;
  /** Today's prices. */
  prices(state: State): Prices;
}

/** The parts of an animal that set its price. */
export type Priced = Pick<Animal, 'kind' | 'wt' | 'cond' | 'preg'>;

/** A pregnancy of 50 days or more adds this many dollars, at an indicator of 400 c/kg. */
export const PREG_PREMIUM = { dollars: 320, atIndicator: 400, fromDays: 50 } as const;
/** A bull costs this many dollars to buy, at an indicator of 400 c/kg. */
export const BULL_PRICE = { dollars: 5500, atIndicator: 400 } as const;

/**
 * c/kg live weight for an animal. Cows under CS 2 make 15% less and cows at
 * CS 3 or better 5% more. Other stock (not bulls or calves) under CS 2 make
 * 14% less.
 */
export function centsPerKg(a: Priced, prices: Prices): number {
  let c = prices.classes[marketClass(a)];
  if (a.kind === 'cow') c *= a.cond < 2 ? 0.85 : a.cond >= 3 ? 1.05 : 1;
  else if (a.kind !== 'bull' && a.kind !== 'calf' && a.cond < 2) c *= 0.86;
  return c;
}

/** What an animal makes at the saleyards, dollars, before selling costs. */
export function saleValue(a: Priced, prices: Prices): number {
  let v = (a.wt * centsPerKg(a, prices)) / 100;
  if ((a.kind === 'cow' || a.kind === 'heifer') && a.preg >= PREG_PREMIUM.fromDays) {
    v += (PREG_PREMIUM.dollars * prices.indicator) / PREG_PREMIUM.atIndicator;
  }
  return v;
}

/** What an animal puts in the bank when sold: its value less 5% commission and $30 a head. */
export const netSaleValue = (a: Priced, prices: Prices): number =>
  saleValue(a, prices) * (1 - SELL_COMMISSION) - HEAD_FEE;

/** What a bull costs to buy, before freight. Bulls are priced by the head, not by weight. */
export const bullPrice = (prices: Prices): number =>
  (BULL_PRICE.dollars * prices.indicator) / BULL_PRICE.atIndicator;

/** What an animal costs to buy, before freight: a bull by the head, anything else at its sale value. */
export const buyPrice = (a: Priced, prices: Prices): number =>
  a.kind === 'bull' ? bullPrice(prices) : saleValue(a, prices);

/**
 * A quick estimate of what buying a class costs, for the saleyard list,
 * from the middle of its weight range at CS 3. The real price depends on the
 * animals that turn up.
 */
export function estimateBuy(key: SaleClassId, qty: number, prices: Prices): number {
  const c = SALE_CLASSES[key];
  const a: Priced = {
    kind: c.kind,
    wt: (c.wt[0] + c.wt[1]) / 2,
    cond: 3,
    preg: 'preg' in c ? 150 : -1,
  };
  let p = buyPrice(a, prices);
  if ('calf' in c) {
    p += saleValue({ kind: 'calf', wt: 110, cond: 3, preg: -1 }, prices) + COW_CALF_FREIGHT;
  }
  return (p + HEAD_FEE) * qty;
}
