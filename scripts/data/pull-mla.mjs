// Pulls real price history from Meat & Livestock Australia's public statistics service, once,
// and writes compact tables to packages/engine/data/raw/mla. See scripts/data/README.md.
//
//   node scripts/data/pull-mla.mjs                 pull whatever is missing, then write the tables
//   node scripts/data/pull-mla.mjs --plan          only count the requests still needed
//   node scripts/data/pull-mla.mjs --offline       write the tables from the cache, no requests
//   node scripts/data/pull-mla.mjs --only=national,yards,yardings,sales   limit the stages
//   node scripts/data/pull-mla.mjs --yards=GME,DUB limit the yards
//   node scripts/data/pull-mla.mjs --indicators=2,12   limit the indicators (IDs from /indicator)
//   node scripts/data/pull-mla.mjs --species=Cattle    Cattle or Sheep only
//   node scripts/data/pull-mla.mjs --max-requests=500   stop after this many requests (resume later)
//   node scripts/data/pull-mla.mjs --max-minutes=60     stop after this long (resume later)
//   node scripts/data/pull-mla.mjs --to=2026-11-12 last date to ask for (default: yesterday, Sydney time)
//
// Credit line required by MLA:
//   Reproduced courtesy of Meat & Livestock Australia Limited – www.mla.com.au

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  CACHE_DIR,
  MANIFEST_PATH,
  RAW_DIR,
  StopError,
  addDays,
  daysBetween,
  fmt,
  makePoliteClient,
  parseArgs,
  readJson,
  sydneyToday,
  updateManifest,
  writeCsv,
  writeJson,
} from './lib.mjs';

const BASE = 'https://api-mlastatistics.mla.com.au';
const DOCS = 'https://app.nlrsreports.mla.com.au/statistics/documentation';
const CREDIT = 'Reproduced courtesy of Meat & Livestock Australia Limited – www.mla.com.au';
const TERMS =
  'https://www.mla.com.au/globalassets/mla-corporate/prices--markets/documents/minlrs-information-brochures-etc/mla-market-reports-data-and-information-terms-of-use.pdf';

// The indicators start in mid-1996 and the game's years start in 1997, so nothing earlier is asked for.
// Request windows sit on a fixed grid from this date, so a finished window has the same address
// on every run and is never fetched twice.
const GRID_START = '1996-01-01';
// The service gives 100 rows a page and gets very slow on deep pages of a long range
// (page 60 of a 30-year range timed out). An indicator has at most one row a day,
// so a 100-day window always fits on one fast page.
const INDICATOR_WINDOW_DAYS = 100;
// Yardings have a row per sale and sale type, so a longer window still fits on one page.
// A window that does not fit is cut in half.
const YARDINGS_WINDOW_DAYS = 600;

/** Indicators to pull, with the name the service must give for that ID. Checked against /indicator. */
const INDICATORS = [
  {
    id: 0,
    slug: 'eastern-young-cattle',
    name: 'Eastern Young Cattle Indicator',
    species: 'Cattle',
  },
  {
    id: 2,
    slug: 'restocker-yearling-steer',
    name: 'National Restocker Yearling Steer Indicator',
    species: 'Cattle',
  },
  {
    id: 12,
    slug: 'restocker-yearling-heifer',
    name: 'National Restocker Yearling Heifer Indicator',
    species: 'Cattle',
  },
  { id: 3, slug: 'feeder-steer', name: 'National Feeder Steer Indicator', species: 'Cattle' },
  { id: 17, slug: 'feeder-heifer', name: 'National Feeder Heifer Indicator', species: 'Cattle' },
  { id: 4, slug: 'heavy-steer', name: 'National Heavy Steer Indicator', species: 'Cattle' },
  { id: 13, slug: 'processor-cow', name: 'National Processor Cow Indicator', species: 'Cattle' },
  // The service will not give this one by yard: "Indicators that contain online livestock sales data
  // are not available via the Indicators by Saleyard endpoint."
  {
    id: 14,
    slug: 'young-cattle',
    name: 'National Young Cattle Indicator',
    species: 'Cattle',
    nationalOnly: true,
  },
  { id: 6, slug: 'light-lamb', name: 'National Light Lamb Indicator', species: 'Sheep' },
  { id: 7, slug: 'trade-lamb', name: 'National Trade Lamb Indicator', species: 'Sheep' },
  { id: 8, slug: 'heavy-lamb', name: 'National Heavy Lamb Indicator', species: 'Sheep' },
  { id: 9, slug: 'merino-lamb', name: 'National Merino Lamb Indicator', species: 'Sheep' },
  { id: 10, slug: 'restocker-lamb', name: 'National Restocker Lamb Indicator', species: 'Sheep' },
  { id: 11, slug: 'mutton', name: 'National Mutton Indicator', species: 'Sheep' },
];

/**
 * Yards to pull, in priority order, with the name the service must give for that ID.
 * `species` is what the game uses the yard for. Fill-in yards cover short histories.
 */
const YARDS = [
  { id: 'GME', name: 'CQLX Gracemere', district: 'cq', role: 'district yard', species: ['Cattle'] },
  { id: 'ARM', name: 'Armidale', district: 'nsw', role: 'district yard', species: ['Cattle'] },
  { id: 'DUB', name: 'Dubbo', district: 'cw', role: 'district yard', species: ['Cattle', 'Sheep'] },
  {
    id: 'MTL',
    name: 'Mortlake',
    district: 'wv',
    role: 'district yard (cattle)',
    species: ['Cattle'],
  },
  {
    id: 'HAM',
    name: 'Hamilton',
    district: 'wv',
    role: 'district yard (sheep)',
    species: ['Sheep'],
  },
  { id: 'EME', name: 'Emerald', district: 'cq', role: 'fill-in', species: ['Cattle'] },
  { id: 'INV', name: 'IRLX Inverell', district: 'nsw', role: 'fill-in', species: ['Cattle'] },
  {
    id: 'BAL',
    name: 'CVLX Ballarat',
    district: 'wv',
    role: 'fill-in',
    species: ['Cattle', 'Sheep'],
  },
];

/** Yardings categories the service takes, by species. */
const YARDING_CATEGORIES = { Cattle: ['Cattle'], Sheep: ['Sheep', 'Lamb'] };

const args = parseArgs();
const TO = typeof args.to === 'string' ? args.to : addDays(sydneyToday(), -1);
const OFFLINE = Boolean(args.offline);
const PLAN = Boolean(args.plan);
const STAGES =
  typeof args.only === 'string' ? args.only.split(',') : ['national', 'yards', 'yardings', 'sales'];
const ONLY_YARDS = typeof args.yards === 'string' ? args.yards.split(',') : null;
const ONLY_INDICATORS =
  typeof args.indicators === 'string' ? args.indicators.split(',').map(Number) : null;
const ONLY_SPECIES = typeof args.species === 'string' ? args.species.split(',') : null;
const MAX_REQUESTS = args['max-requests'] ? Number(args['max-requests']) : Infinity;

const cacheDir = join(CACHE_DIR, 'mla');
const firstDatesPath = join(cacheDir, 'first-dates.json');
const statsPath = join(cacheDir, 'stats.json');
const firstDates = readJson(firstDatesPath, {});

// Two ways to cap a run: --max-minutes=60, or --until=20:05 (this computer's clock, today).
const DEADLINE = Math.min(
  args['max-minutes'] ? Date.now() + Number(args['max-minutes']) * 60_000 : Infinity,
  typeof args.until === 'string'
    ? new Date().setHours(...args.until.split(':').map(Number), 0, 0)
    : Infinity,
);

const client = makePoliteClient({
  // A plain, honest name. The service answers it. No contact detail is sent.
  userAgent: 'grazing-game-data-pull/1.0 (one-off history pull, one request at a time)',
  maxRequests: MAX_REQUESTS,
  // On 13 Nov 2026 about 7 requests in 100 came back as an error from inside the service
  // ("Throttling ... ListExports", "loging request issue"). The rate was the same at one request
  // every two seconds and one every three, so it does not seem to be caused by this script.
  // The brief for this pull set a ceiling of about one request a second. This goes at half that,
  // and waits a good while before a retry.
  minIntervalMs: 2000,
  retryWaitsMs: [20_000, 60_000, 180_000],
});

/** Offline only: the cache does not hold everything a series needs. */
class MissingError extends StopError {}

/** Stops the run once the time given with --max-minutes is used up. The cache keeps what was fetched. */
function checkTime() {
  if (Date.now() > DEADLINE) throw new StopError('Reached the time limit given for this run.');
}

function buildUrl(report, query) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) params.set(k, String(v));
  return `${BASE}/${report}?${params.toString()}`;
}

/** A usable answer is HTTP 200 with a data list. Anything else is retried, then the run stops. */
function isGood(res) {
  if (res.status !== 200) return false;
  try {
    return Array.isArray(JSON.parse(res.text).data);
  } catch {
    return false;
  }
}

/** Gets one page, from the cache when it is there. Returns { body, fetchedAt } or null when planning. */
async function getPage(cacheKey, url) {
  const file = join(cacheDir, `${cacheKey}.json`);
  if (existsSync(file)) return readJson(file);
  if (OFFLINE) throw new MissingError(`Not in the cache and --offline was given: ${cacheKey}`);
  checkTime();
  const res = await client.get(url, { isGood });
  const entry = { fetchedAt: new Date().toISOString(), url, body: JSON.parse(res.text) };
  writeJson(file, entry);
  return entry;
}

/** The fixed windows (100 days for indicators, 600 for yardings) from the one holding `first` to the one holding TO. */
function windowsFrom(first, windowDays) {
  const out = [];
  const k0 = Math.floor(daysBetween(GRID_START, first) / windowDays);
  for (let k = k0; ; k++) {
    const from = addDays(GRID_START, k * windowDays);
    if (from > TO) break;
    const end = addDays(from, windowDays - 1);
    out.push({ from, to: end < TO ? end : TO });
  }
  return out;
}

/**
 * Pulls one series: finds its first date, then walks the windows.
 * series = { key, report, query, dateField, windowDays }
 * Returns { rows, pulled, total, first } with rows as the service gave them, or null if it has none.
 */
async function pullSeries(series) {
  // 1. First date served. One request for the whole range, first page only.
  // Indicator pages come in date order, so the first row of the first page is the first date.
  // Yardings pages do not, so those series are walked from the start of the grid instead.
  let known = series.scanFromGridStart
    ? { first: GRID_START, total: null, to: null }
    : firstDates[series.key];
  if (!known) {
    if (OFFLINE)
      throw new MissingError(`First date not known and --offline was given: ${series.key}`);
    checkTime();
    const url = buildUrl(series.report, { ...series.query, fromDate: GRID_START, toDate: TO });
    const res = await client.get(url, { isGood });
    const body = JSON.parse(res.text);
    const dates = body.data.map((r) => r[series.dateField]);
    if (dates.some((d, i) => i > 0 && d < dates[i - 1])) {
      throw new StopError(
        `${series.key}: the first page is not in date order, so the first date is not known.`,
      );
    }
    known = { first: dates[0] ?? null, total: body['total number rows'] ?? 0, to: TO };
    firstDates[series.key] = known;
    writeJson(firstDatesPath, firstDates);
    // Keep the first page too. It is the proof of the first date.
    writeJson(join(cacheDir, `${series.key}/first-page.json`), {
      fetchedAt: new Date().toISOString(),
      url,
      body,
    });
  }
  if (!known.first) return null;

  // 2. The windows.
  const windows = windowsFrom(known.first, series.windowDays);
  const missing = windows.filter(
    (w) => !existsSync(join(cacheDir, `${series.key}/${w.from}_${w.to}.json`)),
  );
  if (PLAN)
    return {
      planned: missing.length,
      windows: windows.length,
      first: known.first,
      total: known.total,
    };

  const rows = [];
  let pulled = '';
  const queue = [...windows];
  while (queue.length > 0) {
    const w = queue.shift();
    const query = { ...series.query, fromDate: w.from, toDate: w.to };
    const first = await getPage(`${series.key}/${w.from}_${w.to}`, buildUrl(series.report, query));
    const pages = [first];
    const total = first.body['total number rows'] ?? first.body.data.length;
    // Yardings pages are in no fixed order, so walking pages could miss or repeat a row.
    // A window with more than one page is cut in half and asked for again instead.
    if (total > 100 && series.scanFromGridStart && w.from < w.to) {
      const mid = addDays(w.from, Math.floor(daysBetween(w.from, w.to) / 2));
      queue.unshift({ from: w.from, to: mid }, { from: addDays(mid, 1), to: w.to });
      continue;
    }
    // More than one page in this window: walk the rest. These are shallow pages, which are fast.
    for (let page = 2; (page - 1) * 100 < total; page++) {
      pages.push(
        await getPage(
          `${series.key}/${w.from}_${w.to}_p${page}`,
          buildUrl(series.report, { ...query, page }),
        ),
      );
    }
    let got = 0;
    for (const p of pages) {
      got += p.body.data.length;
      rows.push(...p.body.data);
      if (p.fetchedAt > pulled) pulled = p.fetchedAt;
    }
    if (got !== total) {
      throw new StopError(
        `${series.key} ${w.from} to ${w.to}: the service said ${total} rows but gave ${got}.`,
      );
    }
  }
  return {
    rows,
    pulled: sydneyToday(new Date(pulled)),
    total: known.total,
    totalTo: known.to,
    first: known.first,
  };
}

/** Checks the IDs in this file against the service's own lists. Stops on any mismatch. */
async function checkReferenceLists() {
  const indicators = (await getPage('ref/indicator', `${BASE}/indicator`)).body.data;
  const saleyards = (await getPage('ref/saleyard', `${BASE}/saleyard`)).body.data;
  const units = new Map();
  for (const ind of INDICATORS) {
    const found = indicators.find((r) => Number(r.indicator_id) === ind.id);
    if (!found || found.indicator_desc !== ind.name || found.species_id !== ind.species) {
      throw new StopError(
        `Indicator ${ind.id} is not "${ind.name}" on the service: ${JSON.stringify(found)}`,
      );
    }
    units.set(ind.id, found.indicator_units);
  }
  for (const yard of YARDS) {
    const found = saleyards.find((r) => r.saleyard_id === yard.id);
    if (!found || found.saleyard_desc !== yard.name) {
      throw new StopError(
        `Yard ${yard.id} is not "${yard.name}" on the service: ${JSON.stringify(found)}`,
      );
    }
    yard.state = found.state_id;
  }
  return units;
}

/** Turns indicator rows into a table: one row per date, ascending, no duplicates. */
function indicatorTable(rows, label) {
  const byDate = new Map();
  for (const r of rows) {
    const date = r.calendar_date;
    const cells = [date, fmt(r.indicator_value, 2), fmt(r.head_count, 0)];
    const seen = byDate.get(date);
    if (seen && (seen[1] !== cells[1] || seen[2] !== cells[2])) {
      throw new StopError(`${label}: two different rows for ${date}.`);
    }
    byDate.set(date, cells);
  }
  return [...byDate.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Yardings rows as served: date, sale type, head. Sorted, exact repeats dropped. */
function yardingsTable(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const cells = [r.result_date, String(r.tranx_type_id ?? '').trim(), fmt(r.head_count, 0)];
    const key = cells.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cells);
  }
  return out.sort((a, b) =>
    a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
  );
}

/**
 * The days a yard held a sale for one species, from the yardings tables already written.
 * Cattle use the Cattle category. Sheep add the Sheep and Lamb categories together,
 * because a sheep and lamb sale is one sale. Returns null until every category has been pulled.
 */
function saleDays(yard, species, written) {
  // Tables written in this run are not in the manifest yet, so look there first.
  const manifest = { files: [...written, ...readJson(MANIFEST_PATH, { files: [] }).files] };
  const byDate = new Map();
  const from = [];
  let pulled = '';
  for (const category of YARDING_CATEGORIES[species]) {
    const path = `mla/yardings/${yard.id}-${category.toLowerCase()}.csv`;
    const entry = manifest.files.find((f) => f.path === path);
    const file = join(RAW_DIR, path);
    if (!entry || !existsSync(file)) return null;
    from.push(path);
    if (entry.pulled > pulled) pulled = entry.pulled;
    for (const line of readFileSync(file, 'utf8').trimEnd().split('\n').slice(1)) {
      const [date, , head] = line.split(',');
      byDate.set(date, (byDate.get(date) ?? 0) + Number(head));
    }
  }
  const table = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, head]) => [date, String(head)]);
  return table.length > 0 ? { table, from, pulled } : null;
}

function manifestEntry(path, table, extra) {
  return {
    path,
    source: 'mla',
    ...extra,
    first: table[0][0],
    last: table[table.length - 1][0],
    rows: table.length,
  };
}

async function main() {
  console.log(
    `MLA pull to ${TO}. Stages: ${STAGES.join(', ')}.${OFFLINE ? ' Offline.' : ''}${PLAN ? ' Plan only.' : ''}`,
  );
  const units = await checkReferenceLists();
  const yards = YARDS.filter((y) => !ONLY_YARDS || ONLY_YARDS.includes(y.id));
  const wanted = (species) => !ONLY_SPECIES || ONLY_SPECIES.includes(species);
  const indicators = INDICATORS.filter(
    (i) => (!ONLY_INDICATORS || ONLY_INDICATORS.includes(i.id)) && wanted(i.species),
  );
  const files = [];
  const empty = [];
  const incomplete = [];
  let planned = 0;

  const jobs = [];
  if (STAGES.includes('national')) {
    for (const ind of indicators) {
      jobs.push({
        kind: 'indicator',
        label: `national ${ind.slug}`,
        path: `mla/national/${ind.slug}.csv`,
        series: {
          key: `national/i${ind.id}`,
          report: 'report/5',
          query: { indicatorID: ind.id },
          dateField: 'calendar_date',
          windowDays: INDICATOR_WINDOW_DAYS,
        },
        extra: {
          what: `${ind.name}, all contributing yards`,
          url: `${BASE}/report/5?indicatorID=${ind.id}&fromDate={from}&toDate={to}`,
          columns: ['date', 'value', 'head'],
          units: { value: units.get(ind.id), head: 'head in the indicator' },
        },
      });
    }
  }
  if (STAGES.includes('yards')) {
    for (const yard of yards) {
      for (const ind of indicators.filter(
        (i) => yard.species.includes(i.species) && !i.nationalOnly,
      )) {
        jobs.push({
          kind: 'indicator',
          label: `yard ${yard.id} ${ind.slug}`,
          path: `mla/yards/${yard.id}/${ind.slug}.csv`,
          series: {
            key: `yards/${yard.id}/i${ind.id}`,
            report: 'report/6',
            query: { indicatorID: ind.id, saleyardID: yard.id },
            dateField: 'calendar_date',
            windowDays: INDICATOR_WINDOW_DAYS,
          },
          extra: {
            what: `${ind.name} at ${yard.name} (${yard.state}), ${yard.role} for ${yard.district}`,
            url: `${BASE}/report/6?indicatorID=${ind.id}&saleyardID=${yard.id}&fromDate={from}&toDate={to}`,
            columns: ['date', 'value', 'head'],
            units: { value: units.get(ind.id), head: 'head in the indicator at this yard' },
          },
        });
      }
    }
  }
  if (STAGES.includes('yardings')) {
    for (const yard of yards) {
      for (const species of yard.species.filter(wanted)) {
        for (const category of YARDING_CATEGORIES[species]) {
          jobs.push({
            kind: 'yardings',
            label: `yardings ${yard.id} ${category}`,
            path: `mla/yardings/${yard.id}-${category.toLowerCase()}.csv`,
            series: {
              key: `yardings/${yard.id}/${category.toLowerCase()}`,
              report: 'report/4',
              query: { category, saleyardID: yard.id },
              dateField: 'result_date',
              windowDays: YARDINGS_WINDOW_DAYS,
              scanFromGridStart: true,
            },
            extra: {
              what: `${category} yardings at ${yard.name} (${yard.state}) as served, one row per sale and sale type`,
              url: `${BASE}/report/4?category=${category}&saleyardID=${yard.id}&fromDate={from}&toDate={to}`,
              columns: ['date', 'type', 'head'],
              units: { head: 'head yarded' },
            },
          });
        }
      }
    }
  }

  let stopped = null;
  for (const job of jobs) {
    try {
      const result = await pullSeries(job.series);
      if (!result || (result.rows && result.rows.length === 0)) {
        empty.push(job.label);
        console.log(`${job.label}: nothing served.`);
        const file = join(RAW_DIR, job.path);
        if (existsSync(file)) rmSync(file);
        continue;
      }
      if (PLAN) {
        planned += result.planned;
        console.log(
          `${job.label}: from ${result.first}, ${result.total} rows, ${result.planned} of ${result.windows} windows still to fetch.`,
        );
        continue;
      }
      const table =
        job.kind === 'indicator'
          ? indicatorTable(result.rows, job.label)
          : yardingsTable(result.rows);
      const header = job.extra.columns;
      writeCsv(join(RAW_DIR, job.path), header, table);
      files.push(
        manifestEntry(job.path, table, { kind: job.kind, ...job.extra, pulled: result.pulled }),
      );
      const check =
        result.totalTo === TO && result.total !== result.rows.length
          ? ` (the service counted ${result.total})`
          : '';
      console.log(
        `${job.label}: ${table.length} rows, ${table[0][0]} to ${table[table.length - 1][0]}${check}. Requests so far: ${client.stats.requests}.`,
      );
    } catch (err) {
      if (!(err instanceof StopError)) throw err;
      // Offline, a series that is only partly cached is left out and the rest are still written.
      if (err instanceof MissingError) {
        incomplete.push(job.label);
        continue;
      }
      stopped = `${job.label}: ${err.message}`;
      break;
    }
  }

  // Sale days: worked out from the yardings tables on disk, so this stage makes no requests.
  if (STAGES.includes('sales') && !PLAN) {
    for (const yard of yards) {
      for (const species of yard.species.filter(wanted)) {
        const sales = saleDays(yard, species, files);
        if (!sales) continue;
        const path = `mla/sales/${yard.id}-${species.toLowerCase()}.csv`;
        writeCsv(join(RAW_DIR, path), ['date', 'head'], sales.table);
        files.push(
          manifestEntry(path, sales.table, {
            kind: 'sales',
            what: `Days ${yard.name} (${yard.state}) held a ${species.toLowerCase()} sale, with the head yarded. Worked out from ${sales.from.join(' and ')}: every sale type that day added together.`,
            url: `${BASE}/report/4?category={${YARDING_CATEGORIES[species].join('|')}}&saleyardID=${yard.id}&fromDate={from}&toDate={to}`,
            columns: ['date', 'head'],
            units: { head: 'head yarded that day' },
            pulled: sales.pulled,
          }),
        );
        console.log(`sale days ${yard.id} ${species}: ${sales.table.length} days.`);
      }
    }
  }

  // Keep a running tally across runs, for the record in docs/DATA.md.
  const stats = readJson(statsPath, { requests: 0, failures: 0, busyMs: 0, runs: [] });
  stats.requests += client.stats.requests;
  stats.failures += client.stats.failures;
  stats.busyMs += client.stats.busyMs;
  if (client.stats.requests > 0) stats.runs.push({ ...client.stats, to: TO });
  writeJson(statsPath, stats);

  if (PLAN) {
    console.log(
      // About 4 seconds a request, counting the service's slow spells and errors.
      `Plan: ${planned} requests still needed, about ${Math.ceil((planned * 4) / 60)} minutes.`,
    );
  } else if (files.length > 0) {
    updateManifest({
      sourceKey: 'mla',
      source: {
        name: 'Meat & Livestock Australia, National Livestock Reporting Service, public statistics service',
        credit: CREDIT,
        terms: TERMS,
        docs: DOCS,
        baseUrl: BASE,
        note: 'Reformatted: values rounded to 2 decimal places, head to whole numbers, one file per series. Daily rows as served. An indicator row holds the last 7 days of sales, so a value repeats until the next sale.',
      },
      files,
    });
  }
  console.log(
    `This run: ${client.stats.requests} requests, ${client.stats.failures} problems, ${Math.round(client.stats.busyMs / 1000)} s waiting on the service. All runs: ${stats.requests} requests.`,
  );
  if (empty.length > 0) console.log(`Nothing served for: ${empty.join('; ')}.`);
  if (incomplete.length > 0) {
    console.log(`Not fully cached yet, so not written: ${incomplete.join('; ')}.`);
  }
  if (stopped) {
    console.log(`STOPPED at ${stopped}`);
    console.log('Everything fetched so far is cached. Run the same command again to carry on.');
    process.exitCode = 2;
  }
}

await main();
