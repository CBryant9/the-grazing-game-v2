/**
 * The real data a real-year farm runs on, in one bundle.
 *
 * The engine never reads a file, and a farm's save never holds a table. So
 * whoever runs the engine (the server, a test) builds this bundle once and
 * passes it in the `env` of `createFarm`, `stepDay` and `applyAction`:
 *
 *     const data = loadRealData();              // from '@gg/engine/server'
 *     const farm = createFarm(options, { data });
 *     stepDay(farm, { data });
 *
 * The bundle is given one thing: a way to get a table's text by its path
 * under `packages/engine/data/raw/`. It reads a district's tables the
 * first time that district is asked for, and keeps what it built.
 *
 * Each district has a data version: a fingerprint of every table its farms
 * read. A farm records the version it started on. Stepping it on data with
 * another version is refused, so a later pull can't quietly change a
 * running farm's past (docs/MODEL.md, section 1A).
 *
 * These tables are server-side data. Browser code must never import this
 * module or what it holds (CLAUDE.md, rule 14).
 */

import type { DistrictId } from '@gg/shared';
import { DISTRICTS } from '../data/districts';
import { DISTRICT_YARDS, type YardId } from '../data/yards';
import { parseCpiTable, type CpiTable } from '../market/cpi';
import { parsePriceTable } from '../market/priceTable';
import {
  CATTLE_INDICATORS,
  buildDistrictPrices,
  buildNationalPrices,
  type CattleIndicatorId,
  type DistrictPrices,
  type IndicatorTables,
  type NationalPrices,
} from '../market/realPrices';
import { priceTableLast } from '../market/priceTable';
import { buildSaleCalendar, type SaleCalendar } from '../market/saleCalendar';
import { hash32 } from '../rng';
import { buildWeatherGrowth, type WeatherGrowth } from '../season/weatherGrowth';
import { weatherYears } from '../season/weatherSeasons';
import { daySerial, parseWeatherTable } from '../season/weatherTable';

/**
 * Gets the text of a table by its path under the raw data folder, for
 * example `silo/cq.csv`. A table that can't be read must throw.
 */
export type RawTableReader = (path: string) => string;

/** Where each table lives under `packages/engine/data/raw/`. */
export const RAW_TABLE_PATHS = {
  weather: (district: DistrictId): string => `silo/${district}.csv`,
  national: (indicator: CattleIndicatorId): string => `mla/national/${indicator}.csv`,
  yard: (yard: YardId, indicator: CattleIndicatorId): string =>
    `mla/yards/${yard}/${indicator}.csv`,
  cattleYardings: (yard: YardId): string => `mla/yardings/${yard}-cattle.csv`,
  cpi: 'abs/cpi-all-groups.csv',
} as const;

/** Every table a district's farms read, in a fixed order. */
export function districtTablePaths(district: DistrictId): string[] {
  const yard = DISTRICT_YARDS[district].cattle;
  return [
    RAW_TABLE_PATHS.weather(district),
    ...CATTLE_INDICATORS.map((i) => RAW_TABLE_PATHS.national(i)),
    ...CATTLE_INDICATORS.map((i) => RAW_TABLE_PATHS.yard(yard, i)),
    RAW_TABLE_PATHS.cattleYardings(yard),
    RAW_TABLE_PATHS.cpi,
  ];
}

/** The real data for one district. */
export interface DistrictRealData {
  district: DistrictId;
  /** The district's cattle yard. */
  yard: YardId;
  /**
   * The data version: 16 hex digits worked from the text of every table
   * the district's farms read. Any change to any of them gives another
   * version.
   */
  version: string;
  /** Growth factors from the district's weather. */
  weather: WeatherGrowth;
  /** Cattle prices at the district yard, in the dollars of the day. */
  prices: DistrictPrices;
  cpi: CpiTable;
  /** The cattle yard's sale days. */
  cattleSales: SaleCalendar;
  /**
   * The real years a farm here can start a game year in, oldest first, for
   * a start month (0 for January). Each has its whole 12 months in the
   * weather, the prices and the sale calendar.
   */
  years(startMonth: number): number[];
}

export interface RealData {
  /** A district's data. Read and worked out the first time, then kept. */
  district(id: DistrictId): DistrictRealData;
}

const hex = (n: number): string => n.toString(16).padStart(8, '0');

/** A fingerprint of some tables: their paths and text, in order. 16 hex digits. */
export function tablesVersion(tables: readonly { path: string; text: string }[]): string {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (const t of tables) {
    const head = `${t.path}\n${t.text.length}\n`;
    a = hash32(t.text, hash32(head, a));
    b = hash32(t.text, hash32(head, b));
  }
  return hex(a) + hex(b);
}

/** Build the bundle. Nothing is read until a district is asked for. */
export function buildRealData(read: RawTableReader): RealData {
  // Each table's text is read once, however many districts share it.
  const texts = new Map<string, string>();
  const text = (path: string): string => {
    let t = texts.get(path);
    if (t === undefined) {
      t = read(path);
      if (typeof t !== 'string') throw new Error(`The table ${path} could not be read.`);
      texts.set(path, t);
    }
    return t;
  };
  const indicatorTables = (path: (i: CattleIndicatorId) => string): IndicatorTables => {
    const out = {} as Record<CattleIndicatorId, ReturnType<typeof parsePriceTable>>;
    for (const i of CATTLE_INDICATORS) {
      const table = parsePriceTable(text(path(i)));
      if (table.dropped > 0) {
        throw new Error(
          `The cattle price table ${path(i)} has ${table.dropped} rows with no usable price. Look at them before they are passed over.`,
        );
      }
      out[i] = table;
    }
    return out;
  };

  let national: NationalPrices | undefined;
  let cpi: CpiTable | undefined;
  const built = new Map<DistrictId, DistrictRealData>();

  return {
    district(id) {
      let d = built.get(id);
      if (d) return d;
      if (!Object.hasOwn(DISTRICTS, id)) throw new Error(`No district "${id}".`);
      const yard = DISTRICT_YARDS[id].cattle;
      const version = tablesVersion(
        districtTablePaths(id).map((path) => ({ path, text: text(path) })),
      );

      const weather = buildWeatherGrowth(
        DISTRICTS[id],
        parseWeatherTable(text(RAW_TABLE_PATHS.weather(id))),
      );
      national ??= buildNationalPrices(indicatorTables(RAW_TABLE_PATHS.national));
      cpi ??= parseCpiTable(text(RAW_TABLE_PATHS.cpi));
      const prices = buildDistrictPrices(
        yard,
        national,
        indicatorTables((i) => RAW_TABLE_PATHS.yard(yard, i)),
      );
      const cattleSales = buildSaleCalendar(
        yard,
        'cattle',
        text(RAW_TABLE_PATHS.cattleYardings(yard)),
      );

      // The last day every table covers. The national prices end the price cover.
      let through = daySerial(cattleSales.last);
      for (const i of CATTLE_INDICATORS) {
        through = Math.min(through, daySerial(priceTableLast(national.tables[i])));
      }
      const years = new Map<number, number[]>();

      d = {
        district: id,
        yard,
        version,
        weather,
        prices,
        cpi,
        cattleSales,
        years(startMonth) {
          let list = years.get(startMonth);
          if (!list) {
            list = weatherYears(weather, startMonth).filter(
              (year) => daySerial({ year: year + 1, month: startMonth, date: 1 }) - 1 <= through,
            );
            years.set(startMonth, list);
          }
          return list.slice();
        },
      };
      built.set(id, d);
      return d;
    },
  };
}
