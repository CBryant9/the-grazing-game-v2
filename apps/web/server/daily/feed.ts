import 'server-only';
import type { DistrictId } from '@gg/shared';
import { addDays } from './clock';
import type { DailyFeed, Dated, PriceRow, PriceSeries, WeatherRow, Yarding } from './data';

/*
 * Where a day's real weather and prices come from (PRD 5.14).
 *
 * `fixtureFeed` is what the tests use: rows written down beforehand, nothing fetched.
 * `liveFeed` asks SILO and MLA for a range of days at a time, one request each. It is built from
 * the requests the data scripts already make (scripts/data/pull-silo.mjs and pull-mla.mjs,
 * docs/DATA.md) and was NOT run against the live services while it was built: the first run is on
 * a preview, with the keys and settings listed in the milestone 3.3 log entry. The contact address
 * SILO asks for comes from SILO_CONTACT_EMAIL and is never written down in the repo, a log or a
 * stored row. Every request has a short timeout, so a slow service can not hold a run.
 */

const inRange = (date: string, from: string, to: string): boolean => date >= from && date <= to;

function* days(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

/** A feed that serves rows it was given. A day or series with no row is "not in yet" or "no row today". */
export function fixtureFeed(rows: {
  weather?: Partial<Record<string, WeatherRow>>;
  prices?: Partial<Record<string, PriceRow>>;
  yardings?: Partial<Record<string, Yarding>>;
}): DailyFeed & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async weather(district, from, to) {
      asked.push(`weather ${district} ${from} ${to}`);
      const out: Dated<WeatherRow>[] = [];
      for (const date of days(from, to)) {
        const row = rows.weather?.[`${district} ${date}`];
        if (row) out.push({ date, row });
      }
      return out;
    },
    async prices(series, from, to) {
      asked.push(`prices ${series.saleyard}/${series.indicator} ${from} ${to}`);
      const out: Dated<PriceRow>[] = [];
      for (const date of days(from, to)) {
        const row = rows.prices?.[`${series.saleyard}/${series.indicator} ${date}`];
        if (row) out.push({ date, row });
      }
      return out;
    },
    async yardings(yard, from, to) {
      asked.push(`yardings ${yard} ${from} ${to}`);
      const out: Dated<Yarding>[] = [];
      for (const date of days(from, to)) {
        for (const type of ['Prime', 'Store']) {
          const row = rows.yardings?.[`${yard} ${date} ${type}`];
          if (row) out.push({ date, row });
        }
      }
      return out;
    },
  };
}

/** SILO's grid point for each district town (docs/DATA.md, "Weather: SILO"). */
const SILO_POINTS: Record<DistrictId, { lat: number; lon: number }> = {
  cq: { lat: -23.55, lon: 148.2 },
  nsw: { lat: -30.55, lon: 151.6 },
  cw: { lat: -32.2, lon: 148.6 },
  wv: { lat: -37.65, lon: 142.05 },
};

/**
 * MLA's indicator numbers for the six cattle and six sheep indicators the game reads (docs/DATA.md),
 * the same numbers scripts/data/pull-mla.mjs asks for (it checks each name against MLA's list).
 */
export const MLA_INDICATOR: Record<string, number> = {
  'restocker-yearling-steer': 2,
  'restocker-yearling-heifer': 12,
  'feeder-steer': 3,
  'feeder-heifer': 17,
  'heavy-steer': 4,
  'processor-cow': 13,
  // Sheep and lamb (m6), as seriesFor lists them.
  'light-lamb': 6,
  'trade-lamb': 7,
  'heavy-lamb': 8,
  'merino-lamb': 9,
  'restocker-lamb': 10,
  mutton: 11,
};

const SILO_ENDPOINT = 'https://www.longpaddock.qld.gov.au/cgi-bin/silo/DataDrillDataset.php';
const MLA_BASE = 'https://api-mlastatistics.mla.com.au';
/** SILO's variable codes, as the data script asks for them: rain, max, min, radiation, pan evaporation, FAO-56 short crop. */
const SILO_COLUMNS = [
  'daily_rain',
  'max_temp',
  'min_temp',
  'radiation',
  'evap_comb',
  'et_short_crop',
];

export interface LiveFeedOptions {
  fetch?: typeof fetch;
  /** The address SILO asks for as the user name. From SILO_CONTACT_EMAIL. */
  siloUser: string | undefined;
  /** How long one request may take, ms. Short: a run has 45 seconds in all. */
  timeoutMs?: number;
}

/** Parse the days SILO gives, by column name, for dates in the range. A day without rain and evapotranspiration is left out. */
export function parseSilo(body: string, from: string, to: string): Dated<WeatherRow>[] {
  const lines = body.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0]?.split(',') ?? [];
  const at = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`SILO answered without a "${name}" column.`);
    return i;
  };
  const iDate = at('YYYY-MM-DD');
  const cols = SILO_COLUMNS.map(at);
  const out: Dated<WeatherRow>[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const date = cells[iDate]!;
    if (!inRange(date, from, to)) continue;
    const n = (k: number): number | null => {
      const raw = cells[cols[k]!];
      if (raw === undefined || raw === '') return null;
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new Error('SILO gave a figure that is not a number.');
      return v;
    };
    const rain = n(0);
    const et0 = n(5);
    // The growth model needs rain and evapotranspiration. Without both the day is not in.
    if (rain === null || et0 === null || rain < 0 || et0 < 0) continue;
    out.push({ date, row: { rain, tmax: n(1), tmin: n(2), rad: n(3), evap: n(4), et0 } });
  }
  return out;
}

/** Parse MLA's answer for one indicator: the days in the range with a usable price. */
export function parseMla(body: unknown, from: string, to: string): Dated<PriceRow>[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new Error('MLA answered without a data list.');
  const out: Dated<PriceRow>[] = [];
  for (const r of data as Record<string, unknown>[]) {
    const date = String(r.calendar_date);
    if (!inRange(date, from, to)) continue;
    const value = Number(r.indicator_value);
    const head = Number(r.head_count);
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(head) || head < 0) continue;
    out.push({ date, row: { value: Math.round(value * 100) / 100, head } });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Parse MLA's yardings report: a row for each sale and sale type. */
export function parseYardings(body: unknown, from: string, to: string): Dated<Yarding>[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new Error('MLA answered without a data list.');
  const out: Dated<Yarding>[] = [];
  for (const r of data as Record<string, unknown>[]) {
    const date = String(r.result_date);
    const type = String(r.tranx_type_id ?? '').trim();
    const head = Number(r.head_count);
    if (!inRange(date, from, to) || (type !== 'Prime' && type !== 'Store')) continue;
    if (!Number.isInteger(head) || head < 0) continue;
    out.push({ date, row: { type, head } });
  }
  return out.sort((a, b) =>
    a.date === b.date ? (a.row.type < b.row.type ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
}

/** Ask SILO and MLA for a range of days at a time. A failed request throws, and the rows are asked for again at the next run. */
export function liveFeed(options: LiveFeedOptions): DailyFeed {
  const get = options.fetch ?? fetch;
  const timeout = options.timeoutMs ?? 8_000;
  const ask = async (url: string): Promise<Response> => {
    const res = await get(url, {
      signal: AbortSignal.timeout(timeout),
      headers: { 'User-Agent': 'grazing-game-daily/1.0' },
    });
    if (!res.ok) throw new Error(`The data service answered ${res.status}.`);
    return res;
  };
  return {
    async weather(district, from, to) {
      if (!options.siloUser) throw new Error('SILO_CONTACT_EMAIL is not set.');
      const point = SILO_POINTS[district];
      const params = new URLSearchParams({
        lat: point.lat.toFixed(2),
        lon: point.lon.toFixed(2),
        start: from.replaceAll('-', ''),
        finish: to.replaceAll('-', ''),
        format: 'csv',
        comment: 'RXNJCF',
        username: options.siloUser,
        password: 'apirequest',
      });
      return parseSilo(await (await ask(`${SILO_ENDPOINT}?${params.toString()}`)).text(), from, to);
    },
    async prices(series: PriceSeries, from, to) {
      const id = MLA_INDICATOR[series.indicator];
      if (id === undefined) throw new Error(`No MLA indicator for ${series.indicator}.`);
      const params = new URLSearchParams({ indicatorID: String(id), fromDate: from, toDate: to });
      const report = series.saleyard === 'national' ? 'report/5' : 'report/6';
      if (series.saleyard !== 'national') params.set('saleyardID', series.saleyard);
      const body: unknown = await (await ask(`${MLA_BASE}/${report}?${params.toString()}`)).json();
      return parseMla(body, from, to);
    },
    async yardings(yard, from, to) {
      const params = new URLSearchParams({
        category: 'Cattle',
        saleyardID: yard,
        fromDate: from,
        toDate: to,
      });
      const body: unknown = await (await ask(`${MLA_BASE}/report/4?${params.toString()}`)).json();
      return parseYardings(body, from, to);
    },
  };
}
