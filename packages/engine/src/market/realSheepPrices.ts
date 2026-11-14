/**
 * Real-year sheep prices (review of the third pass, item 10): MLA's six
 * national sheep indicators for the real date behind a farm day, in the
 * dollars the farm's market keeps (today's dollars by the CPI, as cattle).
 *
 * The tables are the ones `pnpm data:mla` pulls
 * (`packages/engine/data/raw/mla/national/*.csv`, c/kg carcase weight). A
 * row with fewer than `thinHead` head behind it is passed over, and the
 * newest usable row stands for up to `maxGapDays` days. Two series have a
 * break longer than the cattle's 21 days, both over the 1996 to 1997
 * Christmas: heavy lamb, no usable row from 3 December 1996 to 9 January
 * 1997 (37 days), and Merino lamb, 17 December 1996 to 9 January 1997 (23
 * days). Every other break from 1997 is 12 days or less. So the sheep
 * figures stand for 45 days, which covers both. Wool has no MLA series and
 * stays at the dated stand-in on every farm (call C20).
 *
 * The sheep tables have their own data version, kept apart from the
 * district's cattle and weather version so cattle farms read exactly as
 * before. Server-side data: browser code must never import this.
 */

import type { CalendarDate } from '../calendar';
import type { SheepIndicatorId } from '../data/sheepMarket';
import { daySerial } from '../season/weatherTable';
import { todaysDollarsFactor, type CpiTable } from './cpi';
import type { PriceDollars } from './realMarket';
import { latestPriceRow, type PriceTable } from './priceTable';

/** The file each indicator is pulled into, under `mla/national/`. */
export const SHEEP_INDICATOR_FILES: Readonly<Record<SheepIndicatorId, string>> = {
  lightLamb: 'light-lamb',
  tradeLamb: 'trade-lamb',
  heavyLamb: 'heavy-lamb',
  merinoLamb: 'merino-lamb',
  restockerLamb: 'restocker-lamb',
  mutton: 'mutton',
};

export const SHEEP_REAL_RULES = {
  /** A row with fewer head than this behind it is too thin to use (the cattle figure). */
  thinHead: 20,
  /** The newest usable row stands this long (see the module note). */
  maxGapDays: 45,
} as const;

export type SheepIndicators = Record<SheepIndicatorId, number>;

export interface SheepRealPrices {
  /** 16 hex digits worked from the six tables and the CPI table. */
  version: string;
  /** The six indicators on a real date, c/kg carcase weight, in the dollars asked for. */
  on(date: CalendarDate, dollars: PriceDollars): SheepIndicators;
}

/** Build the sheep prices from the six tables (by indicator) and the CPI table. */
export function buildSheepPrices(
  tables: Readonly<Record<SheepIndicatorId, PriceTable>>,
  cpi: CpiTable,
  version: string,
): SheepRealPrices {
  return {
    version,
    on(date, dollars) {
      const serial = daySerial(date);
      const f = dollars === 'today' ? todaysDollarsFactor(cpi, date) : 1;
      const out = {} as SheepIndicators;
      for (const id of Object.keys(SHEEP_INDICATOR_FILES) as SheepIndicatorId[]) {
        const row = latestPriceRow(
          tables[id],
          serial,
          SHEEP_REAL_RULES.maxGapDays,
          SHEEP_REAL_RULES.thinHead,
        );
        if (!row) {
          throw new RangeError(
            `There is no national ${SHEEP_INDICATOR_FILES[id]} figure for ${date.year}-${date.month + 1}-${date.date}.`,
          );
        }
        out[id] = row.value * f;
      }
      return out;
    },
  };
}
