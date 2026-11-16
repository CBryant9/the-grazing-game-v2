import 'server-only';
import {
  CATTLE_INDICATORS,
  DISTRICT_YARDS,
  FIRST_REAL_YEAR,
  SCALING_YEARS,
  SHEEP_INDICATOR_FILES,
  buildRealData,
  daySerial,
  isoDate,
  weeklySaleOn,
  type DistrictRealData,
  type RealData,
  type SaleCalendar,
  type SaleDay,
  type SheepRealPrices,
} from '@gg/engine';
import { readRawTable } from '@gg/engine/server';
import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import type { SqlClient, SqlRunner } from '../db/sql';
import { addDays, daysBetween, parts } from './clock';

/*
 * The real weather and prices a Daily Farm runs on (PRD 5.14).
 *
 * THE LAG. A game day runs on the real weather and prices of the day DAILY_DATA_LAG_DAYS before
 * it. SILO and MLA publish a day some time after it ends, and SILO's last few days are provisional
 * until the observations arrive, so a farm that ran on the real day itself would have to wait for
 * the data at midnight, and a farm waiting at midnight clashes with the 7 am reminder (PRD 14.3
 * says the job simulates the day for every farm whose local midnight has just passed). With the lag
 * the data is there when the night runs, and it is the settled figure. The tables are labelled
 * with the game date (the real date plus the lag), so the engine is given a calendar in which the
 * weather of 9 November is the weather of 14 November. Sale days are real dates, not shifted.
 *
 * The baked tables in packages/engine/data/raw hold every day up to the last pull. Daily Farm
 * carries on from there with one more day each day, kept in `weather_daily` and `price_daily`
 * (and the yards' sale days as `yardings-prime` and `yardings-store` rows in `price_daily`). The
 * engine is given one data bundle: the baked tables with those days added on the end, as it stood
 * at the end of the day being run. A farm that catches up three days late runs on exactly what a
 * farm rolled on time ran on.
 *
 * NEVER LATE. If a row is still missing when a night needs it (an outage), the night runs anyway:
 * weather is the district's long-term average for the day of the year, prices carry the last
 * published value forward, and `fallbacksOn` says so, so the diary can state it and an admin can
 * count it. A night already run is never rewritten.
 */

/**
 * Days a game day's data runs behind the real date. Five: the data scripts' own pull on 13 and
 * 14 November 2026 found SILO's evaporation still provisional (source code 75, "interpolated from
 * long-term averages until the observations arrive") for the 3 days up to the 12th, and the
 * maximum temperature of the 12th too (docs/DATA.md, "The last three days are provisional").
 * Provisional days sit up to 4 days back from the pull, so a day 5 days back is settled. MLA's
 * indicators were complete to the day before the pull. One constant: change it here.
 */
export const DAILY_DATA_LAG_DAYS = 5;

/** The label every Daily Farm records as its data version. It names the lag, so a farm is never moved to another lag unasked. */
export const DAILY_DATA_VERSION = `daily-lag${DAILY_DATA_LAG_DAYS}`;
/** Years a Daily Farm can run through, in the real-year plan. The calendar runs straight on in the real year. */
const LAST_PLAN_YEAR = 2100;
/** A price table with nothing newer than this many days before the day asked for carries its last figure forward. */
const PRICE_CARRY_AFTER_DAYS = 7;
/** The headline series: if it is older than this many days, the diary says prices were not available. */
const HEADLINE = 'national/restocker-yearling-steer';
const HEADLINE_STALE_DAYS = 3;

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

/** A yard's sale on a day: the type and the head yarded. */
export interface Yarding {
  type: 'Prime' | 'Store';
  head: number;
}

export interface Dated<T> {
  date: string;
  row: T;
}

/**
 * Where days of data come from, a range at a time. An answer holds only the days the source has:
 * a day it does not have yet is simply not in the list (SILO and MLA publish a day some hours
 * after it ends), and a day with no row is normal for a yard that does not sell every week. A
 * thrown error means the source could not be asked. Either way the rows are asked for again at
 * the next run, until they arrive. Weather and prices are asked for separately.
 */
export interface DailyFeed {
  weather(district: DistrictId, from: string, to: string): Promise<Dated<WeatherRow>[]>;
  prices(series: PriceSeries, from: string, to: string): Promise<Dated<PriceRow>[]>;
  yardings(yard: string, from: string, to: string): Promise<Dated<Yarding>[]>;
}

/**
 * The price series a district's farms read: the six national cattle indicators and the yard's
 * six, then the six national sheep and lamb indicators (light, trade, heavy, merino and restocker
 * lamb, mutton: the tables the engine's real-year sheep prices read) and, where the district has
 * a sheep yard (DISTRICT_YARDS[...].sheep), the yard's six, as scripts/data/pull-mla.mjs lists
 * them. The engine reads only the national sheep tables today; the yard rows are kept so they are
 * there from the first day if a later engine reads them (m6 join, the TODO from m3.3).
 */
export function seriesFor(district: DistrictId): PriceSeries[] {
  const yard = DISTRICT_YARDS[district].cattle;
  const sheepYard = DISTRICT_YARDS[district].sheep;
  const sheep = Object.values(SHEEP_INDICATOR_FILES);
  return [
    ...CATTLE_INDICATORS.map((indicator) => ({ indicator, saleyard: 'national' })),
    ...CATTLE_INDICATORS.map((indicator) => ({ indicator, saleyard: yard })),
    ...sheep.map((indicator) => ({ indicator, saleyard: 'national' })),
    ...(sheepYard ? sheep.map((indicator) => ({ indicator, saleyard: sheepYard })) : []),
  ];
}

/** The yard whose sale days a district's farms read (cattle). */
export const yardOf = (district: DistrictId): string => DISTRICT_YARDS[district].cattle;

// ---- The baked tables, read once.

const baseCache = new Map<string, string>();
const baseText = (path: string): string => {
  let t = baseCache.get(path);
  if (t === undefined) {
    t = readRawTable(path);
    baseCache.set(path, t);
  }
  return t;
};

const shiftCache = new Map<string, string>();
/** A baked table with its dates moved on by the lag: the game's dates for the real figures. */
function shiftedText(path: string): string {
  let t = shiftCache.get(path);
  if (t === undefined) {
    const lines = baseText(path).split('\n');
    t = lines
      .map((l, i) =>
        i === 0 || l === '' ? l : addDays(l.slice(0, 10), DAILY_DATA_LAG_DAYS) + l.slice(10),
      )
      .join('\n');
    shiftCache.set(path, t);
  }
  return t;
}

const lastLine = (table: string): string => {
  const lines = table.split('\n').filter((l) => l !== '');
  return lines[lines.length - 1]!;
};
const text = (t: string): string => (t.endsWith('\n') ? t : `${t}\n`);

/** The last date (real) the baked weather table holds, for a district (YYYY-MM-DD). */
export function bakedThrough(district: DistrictId): string {
  return lastLine(baseText(`silo/${district}.csv`)).slice(0, 10);
}
/** The same, in the game's dates (the real date plus the lag). */
export const bakedLabelThrough = (district: DistrictId): string =>
  addDays(bakedThrough(district), DAILY_DATA_LAG_DAYS);

const averages = new Map<DistrictId, Map<string, { rain: number; et0: number }>>();
/** The district's long-term rain and evapotranspiration for each day of the year, from the baked table (the scaling years). */
function longTerm(district: DistrictId): Map<string, { rain: number; et0: number }> {
  let m = averages.get(district);
  if (!m) {
    const sums = new Map<string, { rain: number; et0: number; n: number }>();
    const lines = baseText(`silo/${district}.csv`).split('\n');
    const head = lines[0]!.split(',');
    const iRain = head.indexOf('rain');
    const iEt0 = head.indexOf('et0');
    for (const l of lines.slice(1)) {
      if (l === '') continue;
      const year = Number(l.slice(0, 4));
      if (year < SCALING_YEARS.first || year > SCALING_YEARS.last) continue;
      const cells = l.split(',');
      const key = l.slice(5, 10);
      const s = sums.get(key) ?? { rain: 0, et0: 0, n: 0 };
      s.rain += Number(cells[iRain]);
      s.et0 += Number(cells[iEt0]);
      s.n++;
      sums.set(key, s);
    }
    m = new Map(
      [...sums].map(([k, s]) => [k, { rain: round1(s.rain / s.n), et0: round1(s.et0 / s.n) }]),
    );
    averages.set(district, m);
  }
  return m;
}
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The district's long-term weather for a date (the day of the year). */
export function longTermWeather(district: DistrictId, date: string): { rain: number; et0: number } {
  const m = longTerm(district);
  return m.get(date.slice(5)) ?? m.get('02-28')!;
}

// ---- What has been kept since the baked tables.

/** Everything kept since the baked tables end, by real date. */
interface Extras {
  weather: Map<DistrictId, Map<string, WeatherRow>>;
  /** By `saleyard/indicator`. The yards' sale days are `yard/yardings-prime` and `yard/yardings-store` (head only). */
  prices: Map<string, Dated<PriceRow>[]>;
}

const fixed = (n: number | null): string => (n === null ? '' : String(n));

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

/** What a night needed that was not there, and so was filled in. The diary says so. */
export interface Fallbacks {
  weather: boolean;
  prices: boolean;
}

/**
 * The extra days, read from the database. With no database there are none, and a farm runs on the
 * baked tables and then the fallbacks.
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
        const byDate = extras.weather.get(r.district) ?? new Map<string, WeatherRow>();
        byDate.set(r.d, {
          rain: Number(r.rain_mm),
          tmax: num(r.tmax_c),
          tmin: num(r.tmin_c),
          rad: num(r.rad_mj),
          evap: num(r.evap_mm),
          et0: Number(r.et0_mm),
        });
        extras.weather.set(r.district, byDate);
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

  /** The last real date with weather kept for a district, with no gap after the baked tables. 0 days kept: the baked end. */
  async weatherLast(district: DistrictId, fresh = true): Promise<string> {
    const rows = (await this.extras(fresh)).weather.get(district);
    let last = bakedThrough(district);
    while (rows?.has(addDays(last, 1))) last = addDays(last, 1);
    return last;
  }

  /** The last real date a price series has a row for (the baked end when none is kept). */
  async priceLast(key: string, fresh = true): Promise<string> {
    const list = (await this.extras(fresh)).prices.get(key);
    return list && list.length
      ? list[list.length - 1]!.date
      : DISTRICT_IDS.map(bakedThrough).sort()[0]!;
  }

  /**
   * What the night of game date `date` is missing in a district: the weather row for the real day
   * the lag points at, or a recent figure for the headline cattle price. Both are then filled in
   * (`bundleThrough`), and the diary and the admin counts say so.
   */
  async fallbacksOn(district: DistrictId, date: string): Promise<Fallbacks> {
    const extras = await this.extras();
    const weather =
      date > bakedLabelThrough(district) &&
      !extras.weather.get(district)?.has(addDays(date, -DAILY_DATA_LAG_DAYS));
    const list = extras.prices.get(HEADLINE) ?? [];
    let last = bakedLabelThrough(district);
    for (const d of list) {
      const label = addDays(d.date, DAILY_DATA_LAG_DAYS);
      if (label <= date && label > last) last = label;
    }
    const prices = date > last && daysBetween(last, date) > HEADLINE_STALE_DAYS;
    return { weather: Boolean(weather), prices };
  }

  /**
   * The data bundle as it stood at the end of game date `date`: the baked tables, every kept day
   * up to the real day the lag points at, and fallbacks (the long-term average, the last price)
   * for what is missing up to `date`. The same bundle for the same date and the same rows.
   */
  async bundleThrough(date: string): Promise<RealData> {
    const extras = await this.extras();
    const baseEnd = DISTRICT_IDS.map(bakedLabelThrough).sort().at(-1)!;
    const key = date > baseEnd ? date : 'base';
    const kept = this.bundles.get(key);
    if (kept) return kept;
    const read = (path: string): string => {
      const w = /^silo\/([a-z]+)\.csv$/.exec(path);
      if (w) {
        const district = w[1] as DistrictId;
        let out = text(shiftedText(path));
        const byDate = extras.weather.get(district);
        for (let d = addDays(bakedLabelThrough(district), 1); d <= date; d = addDays(d, 1)) {
          const real = byDate?.get(addDays(d, -DAILY_DATA_LAG_DAYS));
          if (real) {
            out += `${d},${real.rain},${fixed(real.tmax)},${fixed(real.tmin)},${fixed(real.rad)},${fixed(real.evap)},${real.et0}\n`;
          } else {
            const avg = longTermWeather(district, d);
            out += `${d},${avg.rain},,,,,${avg.et0}\n`;
          }
        }
        return out;
      }
      const n = /^mla\/national\/([a-z-]+)\.csv$/.exec(path);
      const y = /^mla\/yards\/([A-Z]+)\/([a-z-]+)\.csv$/.exec(path);
      const k = n ? `national/${n[1]}` : y ? `${y[1]}/${y[2]}` : null;
      if (k) {
        let out = text(shiftedText(path));
        let lastDay = lastLine(out).slice(0, 10);
        let lastCells = lastLine(out).split(',');
        for (const d of extras.prices.get(k) ?? []) {
          const label = addDays(d.date, DAILY_DATA_LAG_DAYS);
          if (label > date || label <= lastDay) continue;
          out += `${label},${d.row.value},${d.row.head}\n`;
          lastDay = label;
          lastCells = [label, String(d.row.value), String(d.row.head)];
        }
        // Nothing newer for a week: carry the last published figure forward, so a gap never stops a farm loading.
        if (daysBetween(lastDay, date) > PRICE_CARRY_AFTER_DAYS) {
          for (let d = addDays(lastDay, 1); d <= date; d = addDays(d, 1)) {
            out += `${d},${lastCells[1]},${lastCells[2]}\n`;
          }
        }
        return out;
      }
      const yd = /^mla\/yardings\/([A-Z]+)-cattle\.csv$/.exec(path);
      if (yd) {
        const base = text(baseText(path));
        const last = lastLine(base).slice(0, 10);
        const rows: { date: string; type: 'Prime' | 'Store'; head: number }[] = [];
        for (const type of ['Prime', 'Store'] as const) {
          for (const d of extras.prices.get(`${yd[1]}/yardings-${type.toLowerCase()}`) ?? []) {
            if (d.date > last) rows.push({ date: d.date, type, head: d.row.head });
          }
        }
        rows.sort((a, b) =>
          a.date === b.date ? (a.type < b.type ? -1 : 1) : a.date < b.date ? -1 : 1,
        );
        return base + rows.map((r) => `${r.date},${r.type},${r.head}\n`).join('');
      }
      return baseText(path);
    };
    const inner = buildRealData(read);
    const years = Array.from(
      { length: LAST_PLAN_YEAR - FIRST_REAL_YEAR + 1 },
      (_, i) => FIRST_REAL_YEAR + i,
    );
    let sheep: SheepRealPrices | null = null;
    const wrapped: RealData = {
      // The sheep indicators carry the Daily label too: the bundle grows every day, so a version
      // worked from its text would change every night and refuse the farm's own prices.
      sheep() {
        sheep ??= { ...inner.sheep(), version: DAILY_DATA_VERSION };
        return sheep;
      },
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

  /** Keep weather rows. A day already kept is left as it is (a farm may have run on it). */
  async keepWeather(
    tx: SqlRunner,
    district: DistrictId,
    rows: readonly Dated<WeatherRow>[],
  ): Promise<void> {
    for (const { date, row } of rows) {
      await tx.query(
        `insert into public.weather_daily (district, date, rain_mm, tmax_c, tmin_c, rad_mj, evap_mm, et0_mm)
         values ($1, $2::date, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
        [district, date, row.rain, row.tmax, row.tmin, row.rad, row.evap, row.et0],
      );
    }
  }

  /** Keep price rows for one series. A day already kept is left as it is. */
  async keepPrices(
    tx: SqlRunner,
    series: PriceSeries,
    rows: readonly Dated<PriceRow>[],
  ): Promise<void> {
    for (const { date, row } of rows) {
      await tx.query(
        `insert into public.price_daily (indicator, saleyard, date, cents_per_kg, head)
         values ($1, $2, $3::date, $4, $5) on conflict do nothing`,
        [series.indicator, series.saleyard, date, row.value, row.head],
      );
    }
  }

  /** Keep a yard's sale days (the head yarded, by type) as price rows with no price. */
  async keepYardings(tx: SqlRunner, yard: string, rows: readonly Dated<Yarding>[]): Promise<void> {
    for (const { date, row } of rows) {
      await tx.query(
        `insert into public.price_daily (indicator, saleyard, date, cents_per_kg, head)
         values ($1, $2, $3::date, 0, $4) on conflict do nothing`,
        [`yardings-${row.type.toLowerCase()}`, yard, date, row.head],
      );
    }
  }

  /** Add to a day's admin counter for a fallback used by a night (`daily_counts`). */
  async noteFallback(day: string, metric: string, dims: string): Promise<void> {
    if (!this.sql) return;
    await this.sql.query(
      `insert into public.daily_counts (day, metric, dims, count) values ($1::date, $2, $3, 1)
       on conflict (day, metric, dims) do update set count = public.daily_counts.count + 1`,
      [day, metric, dims],
    );
  }
}

/**
 * The yard's sale days carried on past the last the tables hold. Real sale days are used wherever
 * the tables or the kept yardings have them. After the last real sale day the district's usual
 * weekly sale stands in (`weeklySaleOn`, the stand-in a random-seasons farm uses), with no sale
 * from 16 December to 7 January. The yards with real sale days in the baked tables are the four
 * district yards: CQLX Gracemere, Armidale, Dubbo and Mortlake (docs/DATA.md).
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
      const first = Math.max(serial, lastSerial + 1);
      for (let s = first; s <= first + 400; s++) {
        const sale = beyond(s);
        if (sale) return sale;
      }
      return null;
    },
  };
}
