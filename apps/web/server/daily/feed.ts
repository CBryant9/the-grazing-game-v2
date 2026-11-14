import 'server-only';
import type { DistrictId } from '@gg/shared';
import type { DailyFeed, PriceRow, PriceSeries, WeatherRow } from './data';

/*
 * Where a day's real weather and prices come from (PRD 5.14).
 *
 * `fixtureFeed` is what the tests use: rows written down beforehand, nothing fetched.
 * `liveFeed` asks SILO and MLA for one day. It is built from the requests the data scripts
 * already make (scripts/data/pull-silo.mjs and pull-mla.mjs, docs/DATA.md) and was NOT run
 * against the live services while it was built: the first run is on a preview, with the keys
 * and settings listed in the milestone 3.3 log entry. The contact address SILO asks for comes
 * from SILO_CONTACT_EMAIL and is never written down in the repo, a log or a stored row.
 */

/** A feed that serves rows it was given. A day or series with no row is "not in yet" or "no row today". */
export function fixtureFeed(rows: {
  weather?: Partial<Record<string, WeatherRow>>;
  prices?: Partial<Record<string, PriceRow>>;
}): DailyFeed & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async weather(district, date) {
      asked.push(`weather ${district} ${date}`);
      return rows.weather?.[`${district} ${date}`] ?? null;
    },
    async prices(series, date) {
      asked.push(`prices ${series.saleyard}/${series.indicator} ${date}`);
      return rows.prices?.[`${series.saleyard}/${series.indicator} ${date}`] ?? null;
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

/** MLA's indicator numbers for the six cattle indicators the game reads (docs/DATA.md). */
const MLA_INDICATOR: Record<string, number> = {
  'restocker-yearling-steer': 2,
  'restocker-yearling-heifer': 12,
  'feeder-steer': 3,
  'feeder-heifer': 17,
  'heavy-steer': 4,
  'processor-cow': 13,
};

const SILO_ENDPOINT = 'https://www.longpaddock.qld.gov.au/cgi-bin/silo/DataDrillDataset.php';
const MLA_BASE = 'https://api-mlastatistics.mla.com.au';
/** SILO's variable codes, as the data script asks for them: rain, max, min, radiation, pan evaporation, FAO-56 short crop. */
const SILO_COLUMNS = ['daily_rain', 'max_temp', 'min_temp', 'radiation', 'evap_comb', 'et_short_crop'];

export interface LiveFeedOptions {
  fetch?: typeof fetch;
  /** The address SILO asks for as the user name. From SILO_CONTACT_EMAIL. */
  siloUser: string | undefined;
  timeoutMs?: number;
}

/** Parse the one row SILO gives for a day, by column name. Throws when the answer is not what was asked for. */
export function parseSiloDay(body: string, date: string): WeatherRow | null {
  const lines = body.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0]?.split(',') ?? [];
  const at = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`SILO answered without a "${name}" column.`);
    return i;
  };
  const iDate = at('YYYY-MM-DD');
  const cols = SILO_COLUMNS.map(at);
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (cells[iDate] !== date) continue;
    const n = (k: number): number | null => {
      const raw = cells[cols[k]!];
      if (raw === undefined || raw === '') return null;
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new Error('SILO gave a figure that is not a number.');
      return v;
    };
    const rain = n(0);
    const et0 = n(5);
    // The growth model needs rain and evapotranspiration. Without both the day is not in yet.
    if (rain === null || et0 === null || rain < 0 || et0 < 0) return null;
    return { rain, tmax: n(1), tmin: n(2), rad: n(3), evap: n(4), et0 };
  }
  return null;
}

/** Parse MLA's answer for one indicator on one day. */
export function parseMlaDay(body: unknown, date: string): PriceRow | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new Error('MLA answered without a data list.');
  for (const r of data as Record<string, unknown>[]) {
    if (r.calendar_date !== date) continue;
    const value = Number(r.indicator_value);
    const head = Number(r.head_count);
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(head) || head < 0) return null;
    return { value: Math.round(value * 100) / 100, head };
  }
  return null;
}

/** Ask SILO and MLA for one day at a time. A failed request throws, and the day waits for the next run. */
export function liveFeed(options: LiveFeedOptions): DailyFeed {
  const get = options.fetch ?? fetch;
  const timeout = options.timeoutMs ?? 20_000;
  const ask = async (url: string): Promise<Response> => {
    const res = await get(url, {
      signal: AbortSignal.timeout(timeout),
      headers: { 'User-Agent': 'grazing-game-daily/1.0' },
    });
    if (!res.ok) throw new Error(`The data service answered ${res.status}.`);
    return res;
  };
  return {
    async weather(district: DistrictId, date: string): Promise<WeatherRow | null> {
      if (!options.siloUser) throw new Error('SILO_CONTACT_EMAIL is not set.');
      const point = SILO_POINTS[district];
      const compact = date.replaceAll('-', '');
      const params = new URLSearchParams({
        lat: point.lat.toFixed(2),
        lon: point.lon.toFixed(2),
        start: compact,
        finish: compact,
        format: 'csv',
        comment: 'RXNJCF',
        username: options.siloUser,
        password: 'apirequest',
      });
      const text = await (await ask(`${SILO_ENDPOINT}?${params.toString()}`)).text();
      return parseSiloDay(text, date);
    },
    async prices(series: PriceSeries, date: string): Promise<PriceRow | null> {
      const id = MLA_INDICATOR[series.indicator];
      if (id === undefined) throw new Error(`No MLA indicator for ${series.indicator}.`);
      const params = new URLSearchParams({ indicatorID: String(id), fromDate: date, toDate: date });
      const report = series.saleyard === 'national' ? 'report/5' : 'report/6';
      if (series.saleyard !== 'national') params.set('saleyardID', series.saleyard);
      const body: unknown = await (await ask(`${MLA_BASE}/${report}?${params.toString()}`)).json();
      return parseMlaDay(body, date);
    },
  };
}
