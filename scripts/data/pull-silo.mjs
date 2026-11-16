// Pulls real daily weather for each district town from SILO (Queensland Government, Long Paddock), once,
// and writes compact tables to packages/engine/data/raw/silo. See scripts/data/README.md.
//
//   node scripts/data/pull-silo.mjs              one request per district that is not cached yet
//   node scripts/data/pull-silo.mjs --offline    write the tables from the cache, no requests
//   node scripts/data/pull-silo.mjs --to=2026-11-12   last date to ask for (default: yesterday, Sydney time)
//
// SILO asks for an email address as the user name. It is read from SILO_CONTACT_EMAIL
// (in the untracked .env.local) and is never written to the cache, the tables or the log.
//
// Credit: Climate data: SILO, Queensland Government (© State of Queensland), CC BY 4.0,
// built from Bureau of Meteorology observations. The data has been reformatted.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CACHE_DIR,
  RAW_DIR,
  StopError,
  addDays,
  daysBetween,
  fmt,
  loadLocalEnv,
  makePoliteClient,
  parseArgs,
  readJson,
  sydneyToday,
  updateManifest,
  writeCsv,
  writeFileAtomic,
  writeJson,
} from './lib.mjs';

const ENDPOINT = 'https://www.longpaddock.qld.gov.au/cgi-bin/silo/DataDrillDataset.php';
const DOCS = 'https://www.longpaddock.qld.gov.au/silo/api-documentation/reference/';
const VARIABLES_PAGE = 'https://www.longpaddock.qld.gov.au/silo/about/climate-variables/';
const CREDIT =
  'Climate data: SILO, Queensland Government (© State of Queensland), CC BY 4.0, built from Bureau of Meteorology observations. The data has been reformatted.';
const LICENCE = 'Creative Commons Attribution 4.0 International (CC BY 4.0)';

const START = '1990-01-01';

// One grid point per district town. SILO's grid is 0.05 degrees, so each point is snapped to it.
const POINTS = [
  { district: 'cq', town: 'Emerald, Qld', lat: -23.55, lon: 148.2 },
  {
    district: 'nsw',
    town: 'Armidale, NSW (grid point nearest the airport)',
    lat: -30.55,
    lon: 151.6,
  },
  { district: 'cw', town: 'Dubbo, NSW', lat: -32.2, lon: 148.6 },
  { district: 'wv', town: 'Hamilton, Vic', lat: -37.65, lon: 142.05 },
];

// Variable codes from SILO's climate variables page: the code, SILO's column name, ours, and the unit.
// C is pan evaporation: SILO's synthetic estimate before 1970 and Class A pan from 1970 on.
const VARIABLES = [
  { code: 'R', silo: 'daily_rain', column: 'rain', unit: 'mm', places: 1, min: 0, max: 600 },
  { code: 'X', silo: 'max_temp', column: 'tmax', unit: '°C', places: 1, min: -15, max: 55 },
  { code: 'N', silo: 'min_temp', column: 'tmin', unit: '°C', places: 1, min: -25, max: 40 },
  { code: 'J', silo: 'radiation', column: 'rad', unit: 'MJ/m²', places: 1, min: 0, max: 45 },
  {
    code: 'C',
    silo: 'evap_comb',
    column: 'evap',
    unit: 'mm (Class A pan)',
    places: 1,
    min: 0,
    max: 30,
  },
  {
    code: 'F',
    silo: 'et_short_crop',
    column: 'et0',
    unit: 'mm (FAO-56 short crop)',
    places: 1,
    min: 0,
    max: 20,
  },
];

const args = parseArgs();
const TO = typeof args.to === 'string' ? args.to : addDays(sydneyToday(), -1);
const OFFLINE = Boolean(args.offline);
const cacheDir = join(CACHE_DIR, 'silo');
const compact = (iso) => iso.replaceAll('-', '');

loadLocalEnv();
const email = process.env.SILO_CONTACT_EMAIL ?? '';

const client = makePoliteClient({
  userAgent: 'grazing-game-data-pull/1.0 (one-off history pull, four requests)',
  minIntervalMs: 5000,
  timeoutMs: 180_000,
  retryWaitsMs: [30_000],
  redact: scrub,
});

/** Takes the contact address out of any text before it is kept. */
function scrub(text) {
  return email
    ? text.replaceAll(email, '[contact]').replaceAll(encodeURIComponent(email), '[contact]')
    : text;
}

function urlFor(point, user) {
  const params = new URLSearchParams({
    lat: point.lat.toFixed(2),
    lon: point.lon.toFixed(2),
    start: compact(START),
    finish: compact(TO),
    format: 'csv',
    comment: VARIABLES.map((v) => v.code).join(''),
    username: user,
    password: 'apirequest',
  });
  return `${ENDPOINT}?${params.toString()}`;
}

/** A usable answer is HTTP 200 that starts with SILO's CSV header. */
function isGood(res) {
  return res.status === 200 && /^latitude,longitude,YYYY-MM-DD,/.test(res.text.trimStart());
}

async function getRaw(point) {
  const name = `${point.district}_${compact(START)}_${compact(TO)}`;
  const file = join(cacheDir, `${name}.csv`);
  if (existsSync(file))
    return { text: readFileSync(file, 'utf8'), meta: readJson(join(cacheDir, `${name}.json`)) };
  if (OFFLINE) throw new StopError(`Not in the cache and --offline was given: ${name}`);
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) {
    throw new StopError(
      'Set SILO_CONTACT_EMAIL in .env.local first. SILO uses it as the user name.',
    );
  }
  const res = await client.get(urlFor(point, email), {
    isGood,
    describe: urlFor(point, '[contact]'),
  });
  const meta = { fetchedAt: new Date().toISOString(), url: urlFor(point, '[contact]') };
  writeFileAtomic(file, scrub(res.text));
  writeJson(join(cacheDir, `${name}.json`), meta);
  return { text: scrub(res.text), meta };
}

/** Reads SILO's CSV by column name. Returns the table, the count of each source code, and the metadata notes. */
function parse(text, point) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(',');
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0)
      throw new StopError(
        `${point.district}: SILO's answer has no "${name}" column. Header: ${lines[0]}`,
      );
    return i;
  };
  const iDate = col('YYYY-MM-DD');
  const iLat = col('latitude');
  const iLon = col('longitude');
  const iMeta = header.indexOf('metadata');
  const idx = VARIABLES.map((v) => ({ v, value: col(v.silo), source: col(`${v.silo}_source`) }));
  const sources = Object.fromEntries(VARIABLES.map((v) => [v.column, {}]));
  const notes = [];
  const table = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (Number(cells[iLat]) !== point.lat || Number(cells[iLon]) !== point.lon) {
      throw new StopError(
        `${point.district}: SILO answered for a different grid point: ${cells[iLat]}, ${cells[iLon]}`,
      );
    }
    const row = [cells[iDate]];
    for (const { v, value, source } of idx) {
      const n = Number(cells[value]);
      if (cells[value] === '' || Number.isNaN(n) || n < v.min || n > v.max) {
        throw new StopError(
          `${point.district} ${cells[iDate]}: ${v.column} is out of range: "${cells[value]}"`,
        );
      }
      row.push(fmt(n, v.places));
      const code = cells[source];
      sources[v.column][code] = (sources[v.column][code] ?? 0) + 1;
    }
    // SILO puts a few notes (elevation, date extracted) in the last column of the first rows.
    const note = iMeta >= 0 ? cells.slice(iMeta).join(',').replaceAll('"', '').trim() : '';
    if (note) notes.push(note.replace(/\s+/g, ' '));
    table.push(row);
  }
  // SILO has no gaps: one row for every day asked for.
  const expected = daysBetween(START, TO) + 1;
  if (table.length !== expected || table[0][0] !== START || table[table.length - 1][0] !== TO) {
    throw new StopError(
      `${point.district}: expected ${expected} days from ${START} to ${TO}, got ${table.length}.`,
    );
  }
  for (let i = 1; i < table.length; i++) {
    if (table[i][0] !== addDays(table[i - 1][0], 1)) {
      throw new StopError(
        `${point.district}: a day is missing or repeated after ${table[i - 1][0]}.`,
      );
    }
  }
  return { table, sources, notes };
}

async function main() {
  console.log(
    `SILO pull, ${START} to ${TO}, ${POINTS.length} grid points.${OFFLINE ? ' Offline.' : ''}`,
  );
  const files = [];
  try {
    for (const point of POINTS) {
      const { text, meta } = await getRaw(point);
      const { table, sources, notes } = parse(text, point);
      const path = `silo/${point.district}.csv`;
      const csvText = table.map((r) => r.join(',')).join('\n');
      if (email && csvText.includes(email))
        throw new StopError('The contact address turned up in a table. Nothing written.');
      writeCsv(join(RAW_DIR, path), ['date', ...VARIABLES.map((v) => v.column)], table);
      files.push({
        path,
        source: 'silo',
        kind: 'weather',
        what: `Daily weather at the SILO grid point for ${point.town}`,
        url: `${ENDPOINT}?lat=${point.lat.toFixed(2)}&lon=${point.lon.toFixed(2)}&start={from}&finish={to}&format=csv&comment=${VARIABLES.map((v) => v.code).join('')}&username={SILO_CONTACT_EMAIL}&password=apirequest`,
        point: { lat: point.lat, lon: point.lon },
        columns: ['date', ...VARIABLES.map((v) => v.column)],
        units: Object.fromEntries(VARIABLES.map((v) => [v.column, v.unit])),
        siloVariables: Object.fromEntries(
          VARIABLES.map((v) => [v.column, `${v.code} (${v.silo})`]),
        ),
        // How many days came from each SILO source code. 25 is interpolated from that day's observations.
        sourceCodes: sources,
        siloNotes: notes,
        first: table[0][0],
        last: table[table.length - 1][0],
        rows: table.length,
        pulled: sydneyToday(new Date(meta.fetchedAt)),
      });
      console.log(
        `${point.district}: ${table.length} days, ${table[0][0]} to ${table[table.length - 1][0]}.`,
      );
    }
  } catch (err) {
    if (!(err instanceof StopError)) throw err;
    console.log(`STOPPED: ${scrub(err.message)}`);
    console.log('Anything fetched so far is cached. Run the same command again to carry on.');
    process.exitCode = 2;
  }
  if (files.length > 0) {
    updateManifest({
      sourceKey: 'silo',
      source: {
        name: 'SILO Data Drill, Queensland Government (Long Paddock)',
        credit: CREDIT,
        licence: LICENCE,
        docs: DOCS,
        variables: VARIABLES_PAGE,
        // The meanings SILO gives for the source codes seen in this pull (from the page below).
        sourceCodesPage: 'https://www.longpaddock.qld.gov.au/silo/about/about-data/',
        sourceCodeMeanings: {
          25: 'Interpolated from daily observations for that date.',
          26: 'Synthetic Class A pan evaporation, calculated from temperatures, radiation and vapour pressure. Every FAO-56 value in this pull carries this code.',
          42: 'Satellite radiation estimate from BoM.',
          75: 'Interpolated from the long term averages of daily observations for that day of year. Seen on the last few days before a pull, until the observations arrive.',
        },
        note: 'Reformatted: one file per district, six variables, source-code columns counted in this manifest and then dropped. Values as served. Data Drill values are interpolated to a 0.05 degree grid, so they are not a single station.',
      },
      files,
    });
  }
  console.log(
    `This run: ${client.stats.requests} requests, ${Math.round(client.stats.busyMs / 1000)} s waiting on the service.`,
  );
}

await main();
