// Shared helpers for the data pull scripts (MLA prices, SILO weather).
// Plain Node, no dependencies. Run from anywhere; paths are worked out from this file.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** Untracked. Every response fetched is kept here so a re-run never refetches. */
export const CACHE_DIR = join(ROOT, '.data-cache');
/** Tracked. Server-side engine data. Browser code must never import it. */
export const RAW_DIR = join(ROOT, 'packages/engine/data/raw');
export const MANIFEST_PATH = join(RAW_DIR, 'manifest.json');

const DAY_MS = 86_400_000;

/** Adds days to a YYYY-MM-DD date. */
export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from one YYYY-MM-DD date to another. */
export function daysBetween(fromIso, toIso) {
  const t = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(toIso) - t(fromIso)) / DAY_MS);
}

/** Today's date in Sydney, as YYYY-MM-DD. Both services publish on eastern Australian time. */
export function sydneyToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Reads `--name=value` and `--flag` arguments. */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

/**
 * Loads KEY=value lines from the untracked .env.local (then .env) into process.env,
 * without overwriting anything already set. Secrets and contact details live there, never in the repo.
 */
export function loadLocalEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = join(ROOT, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trimStart().startsWith('#')) continue;
      const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

/** Writes a file in one step, so a stopped run never leaves half a file. */
export function writeFileAtomic(file, text) {
  ensureDir(dirname(file));
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Thrown when the service keeps failing. The script stops and says why. */
export class StopError extends Error {}

/**
 * A polite client: one request at a time, a minimum gap between requests,
 * a few slow retries, and a hard stop when the service keeps failing.
 */
export function makePoliteClient({
  userAgent,
  minIntervalMs = 1100,
  minGapAfterMs = 300,
  timeoutMs = 60_000,
  retryWaitsMs = [10_000, 30_000],
  maxRequests = Infinity,
  // Applied to any error text before it is printed, to take a contact detail out.
  redact = (text) => text,
}) {
  let lastStart = 0;
  let lastEnd = 0;
  const stats = { requests: 0, failures: 0, busyMs: 0, firstAt: null, lastAt: null };

  async function attempt(url) {
    const wait = Math.max(
      lastStart + minIntervalMs - Date.now(),
      lastEnd + minGapAfterMs - Date.now(),
    );
    if (wait > 0) await sleep(wait);
    if (stats.requests >= maxRequests) {
      throw new StopError(`Reached the request limit for this run (${maxRequests}).`);
    }
    lastStart = Date.now();
    stats.requests += 1;
    stats.firstAt ??= new Date(lastStart).toISOString();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json, text/csv, text/plain, */*' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      return { status: res.status, text };
    } finally {
      lastEnd = Date.now();
      stats.busyMs += lastEnd - lastStart;
      stats.lastAt = new Date(lastEnd).toISOString();
    }
  }

  /**
   * Gets a URL. `isGood` decides whether the answer is usable. Bad answers are retried slowly,
   * then the run stops. `describe` is what to print, so a URL holding a contact detail is never logged.
   */
  async function get(url, { isGood = (r) => r.status === 200, describe = url } = {}) {
    let last = '';
    for (let i = 0; i <= retryWaitsMs.length; i++) {
      try {
        const res = await attempt(url);
        if (isGood(res)) return res;
        last = `HTTP ${res.status}: ${res.text.slice(0, 160).replace(/\s+/g, ' ')}`;
      } catch (err) {
        if (err instanceof StopError) throw err;
        last = String(err?.cause ?? err);
      }
      // An error from the service could repeat the request back. Nothing unredacted is printed.
      last = redact(last);
      stats.failures += 1;
      if (i < retryWaitsMs.length) {
        console.log(`  problem (${last}). Waiting ${retryWaitsMs[i] / 1000} s, then trying again.`);
        await sleep(retryWaitsMs[i]);
      }
    }
    throw new StopError(
      `Gave up after ${retryWaitsMs.length + 1} tries: ${describe}\n  last problem: ${last}`,
    );
  }

  return { get, stats };
}

/** Rounds to a fixed number of decimal places and drops trailing zeros. */
export function fmt(value, places) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value)))
    return '';
  return String(Number(Number(value).toFixed(places)));
}

/** Writes a CSV table with LF line ends. Rows are arrays of already formatted cells. */
export function writeCsv(file, header, rows) {
  const lines = [header.join(',')];
  for (const row of rows) lines.push(row.join(','));
  writeFileAtomic(file, `${lines.join('\n')}\n`);
}

/**
 * Adds or replaces entries in the manifest, keyed by path, and keeps them in path order.
 * `sources` holds the credit line and licence note for each service.
 */
export function updateManifest({ sourceKey, source, files, dropPrefix }) {
  const manifest = readJson(MANIFEST_PATH, { note: '', sources: {}, files: [] });
  manifest.note =
    'Real price and weather history, pulled once by scripts/data and kept here so the game needs no live connection for past years. Server-side engine data: never import it into browser code. Do not edit by hand; re-run the scripts.';
  manifest.sources[sourceKey] = source;
  const byPath = new Map(
    manifest.files
      .filter((f) => !(dropPrefix && f.path.startsWith(dropPrefix)))
      .map((f) => [f.path, f]),
  );
  for (const f of files) byPath.set(f.path, f);
  manifest.files = [...byPath.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  writeJson(MANIFEST_PATH, manifest);
  return manifest;
}
