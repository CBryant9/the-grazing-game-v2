/**
 * The real market: a farm's prices from MLA's figures for the real date.
 *
 * This is the second `PriceSource`, beside the stand-in (standIn.ts). The
 * price on a farm day is the district yard's price on the real date behind
 * that day, in today's dollars. There is no random part: the market stream
 * is never drawn from.
 *
 * The farm keeps only today's prices. The tables stay on the server and
 * are handed in each time the market opens or moves a day.
 */

import type { CalendarDate } from '../calendar';
import type { MarketClassId } from '../data/cattle';
import { todaysDollarsFactor, type CpiTable } from './cpi';
import type { PriceSource, Prices } from './prices';
import type { DistrictPrices } from './realPrices';

/**
 * The dollars prices are in. `today`: lifted by the Consumer Price Index
 * to today's dollars, to match the game's costs. `of-the-day`: as MLA
 * reported them at the time.
 */
export type PriceDollars = 'today' | 'of-the-day';

/**
 * The one switch for inflation. A new real-year farm takes this, and keeps
 * what it started with. PRD section 21 gives no default, so this is the
 * builder's: today's dollars. For Claudia to confirm.
 */
export const REAL_PRICE_DOLLARS: PriceDollars = 'today';

/** The real market's saved state: today's prices and nothing else. */
export interface RealMarket {
  kind: 'real';
  dollars: PriceDollars;
  /** Restocker yearling steers at the district yard, c/kg live weight. */
  indicator: number;
  /** c/kg live weight for each class, before the condition adjustments. */
  classes: Record<MarketClassId, number>;
}

export interface RealMarketOptions {
  /** The district yard's prices (see `buildDistrictPrices`). */
  prices: DistrictPrices;
  cpi: CpiTable;
  /** The real date behind a farm day (see `planRealYears`). */
  realDateOn(day: number): CalendarDate;
  /** The dollars a new market opens in. `REAL_PRICE_DOLLARS` if left out. */
  dollars?: PriceDollars;
}

/** The class prices on a real date, in the dollars asked for. */
export function realPricesOn(
  prices: DistrictPrices,
  cpi: CpiTable,
  date: CalendarDate,
  dollars: PriceDollars,
): Prices {
  const p = prices.pricesOn(date);
  if (dollars === 'of-the-day') return p;
  const f = todaysDollarsFactor(cpi, date);
  const classes = {} as Record<MarketClassId, number>;
  for (const k of Object.keys(p.classes) as MarketClassId[]) classes[k] = p.classes[k] * f;
  return { indicator: p.indicator * f, classes };
}

/** A farm's real market, as a price source. */
export function realMarket(o: RealMarketOptions): PriceSource<RealMarket> {
  const set = (m: RealMarket, day: number): void => {
    const p = realPricesOn(o.prices, o.cpi, o.realDateOn(day), m.dollars);
    m.indicator = p.indicator;
    m.classes = { ...p.classes };
  };
  return {
    open() {
      const m = {
        kind: 'real',
        dollars: o.dollars ?? REAL_PRICE_DOLLARS,
        indicator: 0,
      } as RealMarket;
      set(m, 0);
      return m;
    },
    step(m, _start, toDay) {
      set(m, toDay);
    },
    prices: (m): Prices => ({ indicator: m.indicator, classes: m.classes }),
  };
}
