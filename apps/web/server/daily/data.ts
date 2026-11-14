import 'server-only';
import {
  CATTLE_INDICATORS,
  DISTRICT_YARDS,
  FIRST_REAL_YEAR,
  buildRealData,
  daySerial,
  isoDate,
  weeklySaleOn,
  type DistrictRealData,
  type RealData,
  type SaleCalendar,
  type SaleDay,
} from '@gg/engine';
import { readRawTable } from '@gg/engine/server';
import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import type { SqlClient, SqlRunner } from '../db/sql';
import { addDays, parts } from './clock';

/*
 * The real weather and prices a Daily Farm runs on (PRD 5.14).
 *
 * The baked tables in packages/engine/data/raw hold every day up to the last pull. Daily Farm
 * carries on from there with one more day each day, kept in `weather_daily` and `price_daily`.
 * The engine is given one data bundle that is the baked tables with those days added on the end.
 * It is built as it stood at the end of the day being simulated, never later, so a farm that
 * catches up three days late runs on exactly what a farm rolled on time ran on.
 *
 * A day's weather row is written in the same transaction as that day's price rows. A day with a
 * weather row is therefore a day whose data is all in (docs/DATABASE.md).
 */

/** The label every Daily Farm records as its data version. The tables grow by a day each day, so a fingerprint would change daily. */
export const DAILY_DATA_VERSION = 'daily-1';
/** Years a Daily Farm can run through, in the real-year plan. The calendar runs straight on in the real year. */
const LAST_PLAN_YEAR = 2100;

export interface WeatherRow {
  rain: number;
  tmax: number | null;
  tmin: number | null;
  rad: number | null;
  evap: number | null;
  /** SILO's FAO-56 short crop evapotranspiration, mm. The growth model reads this one. */
  et0: number;
}

/** One price series: an MLA indicator, national or at a yard. */
export interface PriceSeries {
  indicator: string;
  /** `national`, or the yard's code (GME, ARM, DUB, MTL). */
  saleyard: string;
}

export interface PriceRow {
  /** c/kg live weight. */
  value: number;
  head: number;
}

/**
 * Where a day's data comes from. `null` means the source has nothing for that day yet (SILO and
 * MLA publish yesterday some hours after midnight). A thrown error means the source could not
 * be asked. Either way the day waits.
 */
export interface DailyFeed {
  weather(district: DistrictId, date: string): Promise<WeatherRow | null>;
  /** `null` is "no row for that day", which is normal for a yard that sells fortnightly. */
  prices(series: PriceSeries, date: string): Promise<PriceRow | null>;
}

/** The price series a district's farms read: the six national indicators and the yard's six. */
export function seriesFor(district: DistrictId): PriceSeries[] {
  const yard = DISTRICT_YARDS[district].cattle;
  return [
    ...CATTLE_INDICATORS.map((indicator) => ({ indicator, saleyard: 'national' })),
    ...CATTLE_INDICATORS.map((indicator) => ({ indicator, saleyard: yard })),
  ];
}

const baked = buildRealData(readRawTable);

/** The last date the baked tables hold weather for, for a district (YYYY-MM-DD). */
export function bakedThrough(district: DistrictId): string {
  return isoDate(baked.district(district).weather.last);
}

interface Dated<T> {
  date: string;
  row: T;
}

/** Everything fetched since the baked tables end. */
interface Extras {
  weather: Map<DistrictId, Dated<WeatherRow>[]>;
  prices: Map<string, Dated<PriceRow>[]>;
}

const fixed = (n: number | null): string => (n === null ? '' : String(n));
const text = (t: string): string => (t.endsWith('\n') ? t : `${t}\n`);

interface WeatherDbRow {
  district: DistrictId;
  d: string;
  rain_mm: string;
  tmax_c: string | null;
  tmin_c: string | null;
  rad_mj: string | null;
  evap_mm: string | null;
  et0_mm: string | null;
}
interface PriceDbRow {
  indicator: string;
  saleyard: string;
  d: string;
  cents_per_kg: string;
  head: number | null;
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

/**
 * The extra days, read from the database. Only the days after the baked tables are kept in
 * memory. With no database there are none, and a Daily Farm can not start.
 */
export class DailyData {
  private cache: { at: number; extras: Extras } | null = null;
  private readonly bundles = new Map<string, RealData>();

  constructor(
    private readonly sql: SqlClient | null,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 30_000,
  ) {}

  /** The extra days. Read again when `fresh` is asked for or the last read is old. */
  async extras(fresh = false): Promise<Extras> {
    if (!fresh && this.cache && this.now() - this.cache.at < this.ttlMs) return this.cache.extras;
    const extras: Extras = { weather: new Map(), prices: new Map() };
    if (this.sql) {
      const after = DISTRICT_IDS.map(bakedThrough).sort()[0]!;
      const w = await this.sql.query<WeatherDbRow>(
        `select district, to_char(date, 'YYYY-MM-DD') as d, rain_mm, tmax_c, tmin_c, rad_mj, evap_mm, et0_mm
           from public.weather_daily where date > $1::date order by district, date`,
        [after],
      );
      for (const r of w.rows) {
        if (r.et0_mm === null) continue;
        const list = extras.weather.get(r.district) ?? [];
        list.push({
          date: r.d,
          row: {
            rain: Number(r.rain_mm),
            tmax: num(r.tmax_c),
            tmin: num(r.tmin_c),
            rad: num(r.rad_mj),
            evap: num(r.evap_mm),
            et0: Number(r.et0_mm),
          },
        });
        extras.weather.set(r.district, list);
      }
      const p = await this.sql.query<PriceDbRow>(
        `select indicator, saleyard, to_char(date, 'YYYY-MM-DD') as d, cents_per_kg, head
           from public.price_daily where date > $1::date order by saleyard, indicator, date`,
        [after],
      );
      for (const r of p.rows) {
        const key = `${r.saleyard}/${r.indicator}`;
        const list = extras.prices.get(key) ?? [];
        list.push({ date: r.d, row: { value: Number(r.cents_per_kg), head: r.head ?? 0 } });
        extras.prices.set(key, list);
      }
    }
    this.cache = { at: this.now(), extras };
    this.bundles.clear();
    return extras;
  }

  /** Drop what was read, so the next ask reads the database again. */
  forget(): void {
    this.cache = null;
    this.bundles.clear();
  }

  /**
   * The last date the district's data is complete through: the baked tables, then each day
   * after them that has a weather row, with no gap.
   */
  async through(district: DistrictId, fresh = false): Promise<string> {
    const extras = await this.extras(fresh);
    let last = bakedThrough(district);
    for (const d of extras.weather.get(district) ?? []) {
      if (d.date === addDays(last, 1)) last = d.date;
      else if (d.date > last) break;
    }
    return last;
  }

  /**
   * The data bundle as it stood at the end of `date`: the baked tables and every extra day up to
   * and including `date`, and nothing after. The same bundle for the same date, however late
   * the farm is simulated.
   */
  async bundleThrough(date: string, today?: string): Promise<RealData> {
    const extras = await this.extras();
    // The bundle only changes on a day a row was kept, so one bundle serves every date between two of them.
    const days = new Set<string>();
    for (const list of extras.weather.values())
      for (const d of list) if (d.date <= date) days.add(d.date);
    const key = `${[...days].sort().at(-1) ?? 'base'}${today ? `+${today}` : ''}`;
    const kept = this.bundles.get(key);
    if (kept) return kept;
    const read = (path: string): string => {
      const base = readRawTable(path);
      const w = /^silo\/([a-z]+)\.csv$/.exec(path);
      if (w) {
        const rows = (extras.weather.get(w[1] as DistrictId) ?? []).filter(
          (d) => d.date <= date && d.date > bakedThrough(w[1] as DistrictId),
        );
        const kept =
          text(base) +
          rows
            .map(
              (d) =>
                `${d.date},${d.row.rain},${fixed(d.row.tmax)},${fixed(d.row.tmin)},${fixed(d.row.rad)},${fixed(d.row.evap)},${d.row.et0}\n`,
            )
            .join('');
        // Today's weather is not known until tomorrow. A farm that is looked at and worked on today
        // is given a placeholder for it (no rain, the last evapotranspiration), so the screens can
        // work out today's figures. The night that closes today never sees it: that night is run
        // on the bundle for today's own date, with the real row.
        if (today && addDays(lastDate(kept), 1) === today) {
          const et0 = kept.trimEnd().split('\n').at(-1)!.split(',')[6];
          return `${kept}${today},0,,,,,${et0}\n`;
        }
        return kept;
      }
      const n = /^mla\/national\/([a-z-]+)\.csv$/.exec(path);
      const y = /^mla\/yards\/([A-Z]+)\/([a-z-]+)\.csv$/.exec(path);
      const key = n ? `national/${n[1]}` : y ? `${y[1]}/${y[2]}` : null;
      if (key) {
        const last = lastDate(base);
        const rows = (extras.prices.get(key) ?? []).filter((d) => d.date <= date && d.date > last);
        return text(base) + rows.map((d) => `${d.date},${d.row.value},${d.row.head}\n`).join('');
      }
      return base;
    };
    const inner = buildRealData(read);
    const years = Array.from(
      { length: LAST_PLAN_YEAR - FIRST_REAL_YEAR + 1 },
      (_, i) => FIRST_REAL_YEAR + i,
    );
    const wrapped: RealData = {
      district(id) {
        const d = inner.district(id);
        const out: DistrictRealData = {
          ...d,
          version: DAILY_DATA_VERSION,
          years: () => years.slice(),
          cattleSales: carryOn(d.cattleSales, id),
        };
        return out;
      },
    };
    this.bundles.set(key, wrapped);
    if (this.bundles.size > 8) this.bundles.delete(this.bundles.keys().next().value!);
    return wrapped;
  }

  /**
   * Keep a day's data: its weather row and its price rows, in one transaction, so a day with a
   * weather row is a day with all its data. A day already kept is left as it is (a farm may
   * have run on it), whatever the source says now.
   */
  async keepDay(
    tx: SqlRunner,
    district: DistrictId,
    date: string,
    weather: WeatherRow,
    prices: readonly { series: PriceSeries; row: PriceRow }[],
  ): Promise<void> {
    for (const { series, row } of prices) {
      await tx.query(
        `insert into public.price_daily (indicator, saleyard, date, cents_per_kg, head)
         values ($1, $2, $3::date, $4, $5) on conflict do nothing`,
        [series.indicator, series.saleyard, date, row.value, row.head],
      );
    }
    await tx.query(
      `insert into public.weather_daily (district, date, rain_mm, tmax_c, tmin_c, rad_mj, evap_mm, et0_mm)
       values ($1, $2::date, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
      [
        district,
        date,
        weather.rain,
        weather.tmax,
        weather.tmin,
        weather.rad,
        weather.evap,
        weather.et0,
      ],
    );
  }
}

function lastDate(table: string): string {
  const lines = table.split('\n').filter((l) => l !== '');
  return lines[lines.length - 1]!.slice(0, 10);
}

/**
 * The yard's sale days carried on past the last yarding the tables hold. Until the yard's real
 * sale days are fetched, a farm sees the district's usual weekly sale (`weeklySaleOn`, the same
 * stand-in a random-seasons farm uses), with no sale from 16 December to 7 January.
 */
function carryOn(real: SaleCalendar, district: DistrictId): SaleCalendar {
  const lastSerial = daySerial(real.last);
  const beyond = (serial: number): SaleDay | null =>
    weeklySaleOn(district, parts(addDays(isoDate(real.last), serial - lastSerial)));
  return {
    ...real,
    last: { year: 9999, month: 11, date: 31 },
    saleOn(date) {
      const serial = daySerial(date);
      if (serial <= lastSerial) return real.saleOn(date);
      return beyond(serial);
    },
    nextSale(from, type) {
      const serial = daySerial(from);
      if (serial <= lastSerial) {
        const sale = real.nextSale(from, type);
        if (sale) return sale;
      }
      if (type !== undefined && type !== 'prime') return null;
      for (
        let s = Math.max(serial, lastSerial + 1);
        s <= Math.max(serial, lastSerial + 1) + 400;
        s++
      ) {
        const sale = beyond(s);
        if (sale) return sale;
      }
      return null;
    },
  };
}
