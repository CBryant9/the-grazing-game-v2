/**
 * Real cattle prices: MLA's indicators, turned into the game's classes.
 *
 * For a real date this gives a price for each class the game sells in, in
 * c/kg live weight, in the dollars of that day. Three steps:
 *
 *   1. The national figure for each indicator, with a stand-in for the two
 *      feeder indicators before they start in June 2003.
 *   2. The district yard's own figure where the yard has one, and the
 *      national figure times the yard's usual premium where it has not.
 *   3. The game's classes, each read off one indicator.
 *
 * The mapping, the fill-in rules and where each figure came from are in
 * docs/DATA.md ("Real prices: indicators to classes"). The mapping is
 * PROPOSED, FOR CLAUDIA. Nothing here reads a file or the clock.
 */

import type { CalendarDate } from '../calendar';
import { MARKET_CLASSES, type MarketClassId } from '../data/cattle';
import type { YardId } from '../data/yards';
import { dateOfSerial, daySerial, isoDate } from '../season/weatherTable';
import type { Prices } from './prices';
import { latestPriceRow, priceRowOn, type PriceRow, type PriceTable } from './priceTable';

/** The MLA cattle indicators the game reads. All are c/kg live weight. */
export const CATTLE_INDICATORS = [
  'restocker-yearling-steer',
  'restocker-yearling-heifer',
  'feeder-steer',
  'feeder-heifer',
  'heavy-steer',
  'processor-cow',
] as const;
export type CattleIndicatorId = (typeof CATTLE_INDICATORS)[number];

/** One table for each indicator. */
export type IndicatorTables = Readonly<Record<CattleIndicatorId, PriceTable>>;

/**
 * Each game class as a multiple of one indicator. PROPOSED, FOR CLAUDIA.
 *
 * A multiple of 1 is the indicator as it is. The others have no indicator
 * of their own, so they carry the MVP's own spread and are tuning values
 * (docs/DATA.md gives the reason for each).
 */
export const CLASS_INDICATORS: Readonly<
  Record<MarketClassId, { indicator: CattleIndicatorId; times: number }>
> = {
  wean: { indicator: 'restocker-yearling-steer', times: 1.08 },
  feed: { indicator: 'feeder-steer', times: 1 },
  heavy: { indicator: 'heavy-steer', times: 1 },
  wheif: { indicator: 'restocker-yearling-heifer', times: 1.08 },
  heifer: { indicator: 'feeder-heifer', times: 1 },
  cow: { indicator: 'processor-cow', times: 1 },
  bull: { indicator: 'processor-cow', times: 0.906 },
  calf: { indicator: 'restocker-yearling-steer', times: 1.1 },
};

/** The indicator the game calls "the indicator": restocker yearling steers. */
export const HEADLINE_INDICATOR: CattleIndicatorId = 'restocker-yearling-steer';

/** The figures behind the fill-in rules. All tuning values but the years. */
export const REAL_PRICE_RULES = {
  /**
   * A row with fewer head than this behind it is too thin to use, at a
   * yard or nationally. A national figure usually has thousands of head
   * behind it, but around Christmas it can rest on one beast: restocker
   * steers read 147 c/kg on 1 head from 29 December 2004, against 183 c/kg
   * on 290 head four days before. The same low limit is used for both
   * because the national restocker heifer figure rested on 20 to 70 head
   * through early 1997.
   */
  thinHead: 20,
  /** A yard's last usable figure stands for this many days after its date. */
  holdDays: 14,
  /**
   * A yard's own series is used only if it has this many usable days in
   * the premium years. Under that, the national figure is used as it is.
   */
  seriesMinDays: 730,
  /** The years a yard's premium is worked out over. Fixed, so a later pull does not move it. */
  premiumYears: { first: 1997, last: 2025 },
  /**
   * The national figure stands this long across a break in the usable
   * rows. The longest break, with the thin rows left out, is 15 days.
   */
  nationalMaxGapDays: 21,
} as const;

/**
 * What stands in for a feeder indicator before its first row (16 June
 * 2003): a multiple of the geometric mean of two indicators that do run
 * from 1997. The multiple is worked out from the tables, over every day
 * all three have a row, up to the end of the premium years.
 */
export const FEEDER_STAND_INS: Readonly<
  Partial<Record<CattleIndicatorId, readonly [CattleIndicatorId, CattleIndicatorId]>>
> = {
  'feeder-steer': ['restocker-yearling-steer', 'heavy-steer'],
  'feeder-heifer': ['restocker-yearling-heifer', 'heavy-steer'],
};

/** Where a figure came from. */
export type PriceOrigin =
  /** The yard's own row for the day. */
  | 'yard'
  /** The yard's last usable row, held. */
  | 'yard-held'
  /** The national figure times the yard's usual premium. */
  | 'national'
  /** The national stand-in for a feeder indicator before June 2003, times the premium. */
  | 'stand-in';

export interface IndicatorFigure {
  /** c/kg live weight, in the dollars of the day. Always above 0. */
  value: number;
  origin: PriceOrigin;
}

export interface NationalPrices {
  tables: IndicatorTables;
  /** The multiple each feeder stand-in uses. */
  standInTimes: Readonly<Partial<Record<CattleIndicatorId, number>>>;
  /** The national figure for an indicator on a day, and whether it is a stand-in. */
  on(indicator: CattleIndicatorId, serial: number): { value: number; standIn: boolean };
}

const premiumFrom = daySerial({ year: REAL_PRICE_RULES.premiumYears.first, month: 0, date: 1 });
const premiumTo = daySerial({ year: REAL_PRICE_RULES.premiumYears.last, month: 11, date: 31 });

const dateText = (serial: number): string => isoDate(dateOfSerial(serial));

/** A national row for a day, if it has enough head behind it to use. */
function usableNational(table: PriceTable, serial: number): PriceRow | null {
  const row = priceRowOn(table, serial);
  return row && row.head >= REAL_PRICE_RULES.thinHead ? row : null;
}

/** The national indicators, with the feeder stand-ins worked out. */
export function buildNationalPrices(tables: IndicatorTables): NationalPrices {
  const standInTimes: Partial<Record<CattleIndicatorId, number>> = {};
  for (const id of CATTLE_INDICATORS) {
    const pair = FEEDER_STAND_INS[id];
    if (!pair) continue;
    const t = tables[id];
    let sum = 0;
    let n = 0;
    for (let s = t.firstSerial; s <= premiumTo; s++) {
      const row = usableNational(t, s);
      const a = usableNational(tables[pair[0]], s);
      const b = usableNational(tables[pair[1]], s);
      if (!row || !a || !b) continue;
      sum += row.value / Math.sqrt(a.value * b.value);
      n++;
    }
    if (n < 365) {
      throw new Error(`The national ${id} table is too short to work out its stand-in.`);
    }
    standInTimes[id] = sum / n;
  }

  const real = (id: CattleIndicatorId, serial: number): number => {
    const row = latestPriceRow(
      tables[id],
      serial,
      REAL_PRICE_RULES.nationalMaxGapDays,
      REAL_PRICE_RULES.thinHead,
    );
    if (!row) {
      throw new RangeError(`There is no national ${id} figure for ${dateText(serial)}.`);
    }
    return row.value;
  };

  return {
    tables,
    standInTimes,
    on(id, serial) {
      const pair = FEEDER_STAND_INS[id];
      if (pair && serial < tables[id].firstSerial) {
        const value = standInTimes[id]! * Math.sqrt(real(pair[0], serial) * real(pair[1], serial));
        return { value, standIn: true };
      }
      return { value: real(id, serial), standIn: false };
    },
  };
}

export interface DistrictPrices {
  yard: YardId;
  national: NationalPrices;
  /**
   * The yard's usual premium over the national figure for each indicator:
   * the average of yard ÷ national over the days both have a usable row in
   * the premium years. Null where the yard's series is too short to use,
   * and the national figure is then used as it is.
   */
  premiums: Readonly<Record<CattleIndicatorId, number | null>>;
  /** One indicator at the yard on a real date. */
  indicatorOn(indicator: CattleIndicatorId, date: CalendarDate): IndicatorFigure;
  /** The game's class prices on a real date, c/kg live weight, in the dollars of the day. */
  pricesOn(date: CalendarDate): Prices;
}

const CLASS_IDS = Object.keys(MARKET_CLASSES) as MarketClassId[];

/** A district yard's prices, filled in from the national figures. */
export function buildDistrictPrices(
  yard: YardId,
  national: NationalPrices,
  yardTables: IndicatorTables,
): DistrictPrices {
  const R = REAL_PRICE_RULES;
  const premiums = {} as Record<CattleIndicatorId, number | null>;
  for (const id of CATTLE_INDICATORS) {
    const t = yardTables[id];
    const nat = national.tables[id];
    let sum = 0;
    let n = 0;
    const from = Math.max(premiumFrom, t.firstSerial);
    for (let s = from; s <= premiumTo; s++) {
      const row = priceRowOn(t, s);
      if (!row || row.head < R.thinHead) continue;
      const base = usableNational(nat, s);
      if (!base) continue;
      sum += row.value / base.value;
      n++;
    }
    premiums[id] = n >= R.seriesMinDays ? sum / n : null;
  }

  const indicatorOn = (id: CattleIndicatorId, date: CalendarDate): IndicatorFigure => {
    const serial = daySerial(date);
    const premium = premiums[id];
    if (premium !== null) {
      const row = latestPriceRow(yardTables[id], serial, R.holdDays, R.thinHead);
      if (row) return { value: row.value, origin: row.serial === serial ? 'yard' : 'yard-held' };
    }
    const nat = national.on(id, serial);
    const value = nat.value * (premium ?? 1);
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new Error(`The ${id} price at ${yard} on ${isoDate(date)} came out as ${value}.`);
    }
    return { value, origin: nat.standIn ? 'stand-in' : 'national' };
  };

  return {
    yard,
    national,
    premiums,
    indicatorOn,
    pricesOn(date): Prices {
      const seen = new Map<CattleIndicatorId, number>();
      const of = (id: CattleIndicatorId): number => {
        let v = seen.get(id);
        if (v === undefined) {
          v = indicatorOn(id, date).value;
          seen.set(id, v);
        }
        return v;
      };
      const classes = {} as Record<MarketClassId, number>;
      for (const k of CLASS_IDS) {
        const c = CLASS_INDICATORS[k];
        classes[k] = of(c.indicator) * c.times;
      }
      return { indicator: of(HEADLINE_INDICATOR), classes };
    },
  };
}
