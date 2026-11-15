// Load test (milestone 5.5). Not part of `pnpm test`.
//
//   pnpm build && pnpm test:load [--players 60] [--rounds 2] [--port 3100]
//
// Starts the built site on this machine (scripts/load/server.mjs: production mode, the file
// store in a new temporary folder, no keys at all) and plays many guest farms at once. Each
// player is one guest with its own address (the trusted address header is set for the test, so
// each player counts as a different caller):
//
//   create a farm, open it, preview and confirm one job, Next day, then skip a year
//   (+1 year, run again until a year has closed)
//
// Players start together in waves of 30, one wave a minute: the server lets at most 30 farms be
// started a minute whoever asks (CREATES_PER_MINUTE in server/game/http.ts), and that cap is the
// design, so the test keeps to it rather than counting it as a fault. A create refused by that cap
// is reported on its own line.
//
// It reports, for each route: requests, errors, and p50, p95 and p99 times in ms. Memory: the
// server process's heap and RSS after a full garbage collection, before the test, after each round
// and after a last idle collection, so growth that stays is told apart from growth that goes.
//
// What it does not prove: a real database (no Postgres, no pooler, no network between servers),
// more than one server process, a real network, or real phones. It is one machine playing against
// itself, so the times include the load generator's own work on the same processor.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};
const PLAYERS = arg('--players', 60);
const ROUNDS = arg('--rounds', 2);
const PORT = arg('--port', 3100);
const WAVE = 30;
const WAVE_GAP_MS = 61_000;
const REQUEST_TIMEOUT_MS = 120_000;
const BASE = `http://127.0.0.1:${PORT}`;

const farms = mkdtempSync(join(tmpdir(), 'gg-load-farms-'));
const server = spawn(
  process.execPath,
  ['--expose-gc', join(ROOT, 'scripts/load/server.mjs'), String(PORT)],
  {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: 'production',
      GG_FARMS_DIR: farms,
      GG_TRUSTED_IP_HEADER: 'x-real-ip',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  },
);
let serverErrors = 0;
const memWaiters = [];
server.stderr.on('data', (d) => {
  for (const line of String(d).split('\n')) if (/^failed /.test(line)) serverErrors++;
});
const ready = new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('The server did not start in 60 s.')), 60_000);
  server.stdout.on('data', (d) => {
    for (const line of String(d).split('\n')) {
      if (line.startsWith('READY')) {
        clearTimeout(timer);
        ok();
      }
      if (line.startsWith('MEM ')) memWaiters.shift()?.(JSON.parse(line.slice(4)));
    }
  });
  server.on('exit', (code) => fail(new Error(`The server stopped (${code}).`)));
});

const memory = () =>
  new Promise((ok) => {
    memWaiters.push(ok);
    server.stdin.write('gc\n');
  });

// ---- Timing

const times = new Map();
const errors = new Map();
const statuses = new Map();
let capRefusals = 0;
const reasons = [];

async function call(route, path, { method = 'GET', body, cookie, ip }) {
  const started = performance.now();
  let status = 0;
  let json = null;
  let setCookie = null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'x-real-ip': ip,
        origin: BASE,
        'sec-fetch-site': 'same-origin',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    status = res.status;
    setCookie = res.headers.get('set-cookie');
    json = await res.json().catch(() => null);
  } catch (e) {
    status = -1;
    json = { error: `no answer (${e?.cause?.code ?? e?.name ?? 'error'})` };
  }
  const ms = performance.now() - started;
  if (!times.has(route)) times.set(route, []);
  times.get(route).push(ms);
  const key = `${route} ${status}`;
  statuses.set(key, (statuses.get(key) ?? 0) + 1);
  if (status !== 200) {
    if (route === 'create' && status === 429) capRefusals++;
    else {
      errors.set(route, (errors.get(route) ?? 0) + 1);
      const why = `${route} ${status}: ${String(json?.error ?? 'no answer').slice(0, 120)}`;
      if (!reasons.includes(why)) reasons.push(why);
    }
  }
  return { status, json, setCookie };
}

async function player(n, round) {
  const ip = `10.${round}.${Math.floor(n / 250)}.${(n % 250) + 1}`;
  const made = await call('create', '/api/game/farm', {
    method: 'POST',
    ip,
    body: {
      district: ['wv', 'nsw', 'cw', 'cq'][n % 4],
      size: 'small',
      enterprise: 'grazing',
      years: n % 2 ? 'random' : 'real-random',
      startType: 'running',
      difficulty: 'medium',
      name: `Load ${round}-${n}`,
    },
  });
  if (made.status !== 200 || !made.setCookie) return;
  const cookie = made.setCookie.split(';')[0];
  const open = await call('open', '/api/game/farm', { ip, cookie });
  let snap = open.json?.snapshot ?? made.json?.snapshot;
  if (!snap) return;
  const mob = snap.mobs?.[0];
  if (mob) {
    const supp = (mob.suppOptions ?? []).map((o) => o.id).find((id) => id !== mob.supp) ?? 'hay';
    const job = { action: { type: 'setSupplement', mob: mob.id, supp } };
    const card = await call('preview', '/api/game/preview', {
      method: 'POST',
      ip,
      cookie,
      body: job,
    });
    const acted = await call('act', '/api/game/act', {
      method: 'POST',
      ip,
      cookie,
      body: { ...job, version: card.json?.version, requestId: `load-${round}-${n}` },
    });
    snap = acted.json?.snapshot ?? snap;
  }
  const day = await call('day', '/api/game/day', {
    method: 'POST',
    ip,
    cookie,
    body: { version: snap.farmVersion },
  });
  snap = day.json?.snapshot ?? snap;
  for (let tries = 0; tries < 4; tries++) {
    const skip = await call('skip-year', '/api/game/skip', {
      method: 'POST',
      ip,
      cookie,
      body: { length: 'year', anyway: true, version: snap.farmVersion },
    });
    if (skip.status !== 200 || !skip.json?.snapshot) return;
    snap = skip.json.snapshot;
    if ((skip.json.yearsClosed ?? 0) >= 1) return;
  }
}

const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0;
const mb = (b) => (b / 1024 / 1024).toFixed(1);

try {
  await ready;
  // Warm up: one request to each kind of route, then the starting memory.
  await call('warm', '/api/game/setup', { ip: '10.250.0.1' });
  const before = await memory();
  const rounds = [];
  const t0 = performance.now();
  for (let round = 1; round <= ROUNDS; round++) {
    const runs = [];
    for (let start = 0; start < PLAYERS; start += WAVE) {
      if (start > 0 || round > 1) await new Promise((r) => setTimeout(r, WAVE_GAP_MS));
      for (let n = start; n < Math.min(PLAYERS, start + WAVE); n++) runs.push(player(n, round));
    }
    await Promise.all(runs);
    rounds.push(await memory());
  }
  const seconds = (performance.now() - t0) / 1000;
  await new Promise((r) => setTimeout(r, 5000));
  const idle = await memory();

  console.log(
    `\nLoad test: ${PLAYERS} guest farms a round, ${ROUNDS} rounds, ${seconds.toFixed(0)} s`,
  );
  console.log('route        requests  errors     p50 ms     p95 ms     p99 ms     max ms');
  for (const [route, list] of times) {
    if (route === 'warm') continue;
    const s = [...list].sort((a, b) => a - b);
    console.log(
      `${route.padEnd(12)} ${String(s.length).padStart(8)} ${String(errors.get(route) ?? 0).padStart(7)} ${[
        50, 95, 99,
      ]
        .map((p) => pct(s, p).toFixed(0).padStart(10))
        .join(' ')} ${s[s.length - 1].toFixed(0).padStart(10)}`,
    );
  }
  console.log(`creates refused by the 30-a-minute cap (by design): ${capRefusals}`);
  console.log(`server failure lines logged: ${serverErrors}`);
  for (const why of reasons) console.log(`  error: ${why}`);
  console.log(`answers by route and status: ${JSON.stringify(Object.fromEntries(statuses))}`);
  console.log('memory after a full collection (heap / RSS, MB):');
  console.log(`  before            ${mb(before.heapUsed)} / ${mb(before.rss)}`);
  rounds.forEach((m, i) =>
    console.log(`  after round ${i + 1}     ${mb(m.heapUsed)} / ${mb(m.rss)}`),
  );
  console.log(`  after 5 s idle    ${mb(idle.heapUsed)} / ${mb(idle.rss)}`);
  const failed = [...errors.values()].reduce((a, b) => a + b, 0);
  process.exitCode = failed > 0 ? 1 : 0;
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  server.kill();
  rmSync(farms, { recursive: true, force: true });
}
