// Pulls the Consumer Price Index from the Australian Bureau of Statistics, once, and writes a small
// table to packages/engine/data/raw/abs. The game uses it to put past cattle prices into today's dollars.
// See scripts/data/README.md.
//
//   node scripts/data/pull-cpi.mjs              one request, unless the answer is cached
//   node scripts/data/pull-cpi.mjs --offline    write the table from the cache, no request
//
// The series: All groups CPI, index numbers, original, Australia, quarterly (ABS data service,
// dataflow CPI, key 1.10001.10.50.Q). No key and no contact detail is sent.
//
// Credit: Source: Australian Bureau of Statistics, Consumer Price Index, Australia. CC BY 4.0.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CACHE_DIR,
  RAW_DIR,
  StopError,
  makePoliteClient,
  parseArgs,
  sydneyToday,
  updateManifest,
  writeCsv,
  writeFileAtomic,
  writeJson,
  readJson,
} from './lib.mjs';

const KEY = '1.10001.10.50.Q';
const URL = `https://data.api.abs.gov.au/rest/data/ABS,CPI/${KEY}?startPeriod=1990-Q1&format=csvfilewithlabels`;
const LICENCE_PAGE = 'https://www.abs.gov.au/website-privacy-copyright-and-disclaimer';
const CREDIT = 'Source: Australian Bureau of Statistics, Consumer Price Index, Australia.';
const LICENCE = 'Creative Commons Attribution 4.0 International (CC BY 4.0)';
const TABLE = 'abs/cpi-all-groups.csv';

const args = parseArgs();
const cacheFile = join(CACHE_DIR, 'abs', 'cpi-all-groups.csv');
const metaFile = join(CACHE_DIR, 'abs', 'cpi-all-groups.meta.json');

/** Splits one CSV line. The ABS quotes a cell only when it holds a comma. */
function cells(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function main() {
  let text;
  if (existsSync(cacheFile)) {
    text = readFileSync(cacheFile, 'utf8');
    console.log('Using the cached answer.');
  } else if (args.offline) {
    console.log('Nothing cached, and --offline was given. Nothing written.');
    process.exitCode = 2;
    return;
  } else {
    // A plain client name. No project name, no contact detail.
    const client = makePoliteClient({ userAgent: 'data-pull/1.0', minIntervalMs: 2000 });
    try {
      const res = await client.get(URL, {
        isGood: (r) => r.status === 200 && r.text.includes('TIME_PERIOD'),
      });
      text = res.text;
    } catch (err) {
      if (!(err instanceof StopError)) throw err;
      console.log(`STOPPED: ${err.message}`);
      process.exitCode = 2;
      return;
    }
    writeFileAtomic(cacheFile, text);
    writeJson(metaFile, { fetchedAt: new Date().toISOString(), url: URL });
  }
  const meta = readJson(metaFile, { fetchedAt: new Date().toISOString() });

  const lines = text.split(/\r?\n/).filter((l) => l !== '');
  const header = cells(lines[0]);
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`The ABS answer has no "${name}" column.`);
    return i;
  };
  const want = {
    Measure: 'Index numbers',
    Index: 'All groups CPI',
    'Adjustment Type': 'Original',
    Region: 'Australia',
    Frequency: 'Quarterly',
  };
  const rows = [];
  let base = null;
  for (const line of lines.slice(1)) {
    const c = cells(line);
    for (const [name, value] of Object.entries(want)) {
      if (c[col(name)] !== value) {
        throw new Error(`The ABS answer has ${name} "${c[col(name)]}", not "${value}".`);
      }
    }
    const quarter = c[col('TIME_PERIOD')];
    const index = Number(c[col('OBS_VALUE')]);
    if (!/^\d{4}-Q[1-4]$/.test(quarter) || !(index > 0)) {
      throw new Error(`The ABS answer has a row that can't be read: ${line}`);
    }
    const b = c[col('Reference Base Period')];
    if (base !== null && b !== base) throw new Error('The ABS answer mixes two reference bases.');
    base = b;
    rows.push([quarter, String(index)]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  // Every quarter once, with none missing.
  for (let i = 1; i < rows.length; i++) {
    const [y, q] = rows[i - 1][0].split('-Q').map(Number);
    const next = q === 4 ? `${y + 1}-Q1` : `${y}-Q${q + 1}`;
    if (rows[i][0] !== next)
      throw new Error(`The ABS answer goes from ${rows[i - 1][0]} to ${rows[i][0]}.`);
  }

  writeCsv(join(RAW_DIR, TABLE), ['quarter', 'index'], rows);
  updateManifest({
    sourceKey: 'abs',
    source: {
      name: 'Australian Bureau of Statistics, Consumer Price Index, Australia (ABS data service)',
      credit: CREDIT,
      licence: LICENCE,
      licencePage: LICENCE_PAGE,
      note: 'Reformatted: one series, two columns (quarter, index number). Values as served.',
    },
    files: [
      {
        path: TABLE,
        source: 'abs',
        kind: 'cpi',
        what: 'Consumer Price Index, All groups CPI, index numbers, original, Australia, quarterly',
        url: URL,
        series: {
          dataflow: 'ABS:CPI',
          key: KEY,
          measure: want.Measure,
          index: want.Index,
          adjustment: want['Adjustment Type'],
          region: want.Region,
          frequency: want.Frequency,
        },
        columns: ['quarter', 'index'],
        units: { index: `index number, ${base}` },
        first: rows[0][0],
        last: rows[rows.length - 1][0],
        rows: rows.length,
        pulled: sydneyToday(new Date(meta.fetchedAt)),
      },
    ],
  });
  console.log(
    `CPI: ${rows.length} quarters, ${rows[0][0]} to ${rows[rows.length - 1][0]} (${base}).`,
  );
}

await main();
