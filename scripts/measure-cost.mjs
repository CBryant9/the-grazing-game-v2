// Cost measurement (BUILD_PLAN section 5.2): what the server does for one
// player, measured on this machine.
//
//   pnpm build && node scripts/measure-cost.mjs
//
// It starts the built game server on its own port with its own empty farm
// folder, starts a farm of about 3,000 ha (the setup size nearest to --ha 3000;
// today Northern Tablelands NSW, large), on a running start,
// and times what a player does:
//   - Next day (the full request: check, simulate, save, build the snapshot)
//   - a +1 week skip
//   - a +1 year skip
//   - opening the farm (the snapshot the browser asks for on /play)
// It then reads the size of the stored farm file, and prints a short table.
//
// Times are the round trip on this machine, so they include a few
// milliseconds of local HTTP. They say what the work costs, not what Vercel
// charges: pick the same figures up again in Stage 3 on the real host.
//
// Options: --port 3217  --days 10  --years 3  --ha 3000  --keep (leave the farm folder)

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps/web');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('--port', '3217'));
const DAYS = Number(arg('--days', '10'));
const YEARS = Number(arg('--years', '3'));
const HA = Number(arg('--ha', '3000'));
const KEEP = process.argv.includes('--keep');
const BASE = `http://127.0.0.1:${PORT}`;

if (!statSyncOrNull(join(WEB, '.next/BUILD_ID'))) {
  console.error('There is no production build. Run `pnpm build` first.');
  process.exit(1);
}
function statSyncOrNull(p) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

const farms = mkdtempSync(join(tmpdir(), 'gg-cost-'));
const nextBin = join(WEB, 'node_modules/next/dist/bin/next');
const server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
  cwd: WEB,
  env: { ...process.env, GG_FARMS_DIR: farms, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

function stopServer() {
  if (server.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    server.kill('SIGTERM');
  }
}
process.on('exit', stopServer);
process.on('SIGINT', () => process.exit(130));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let cookie = '';
async function call(path, method = 'GET', body) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/game/${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Origin: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const ms = performance.now() - t0;
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
  return { ms, bytes: Buffer.byteLength(text), data: JSON.parse(text) };
}

async function waitUntilReady() {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`The server stopped:\n${serverLog}`);
    try {
      const r = await fetch(`${BASE}/api/game/setup`);
      if (r.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The server did not start:\n${serverLog}`);
}

/** The size of the one farm file, as it is and compressed. */
function sizeNow() {
  const files = readdirSync(farms).filter((f) => /^[0-9a-f]{32}\.json$/.test(f));
  if (files.length !== 1) throw new Error(`Expected one farm file, found ${files.length}.`);
  const raw = readFileSync(join(farms, files[0]));
  return { raw: raw.length, zipped: gzipSync(raw).length };
}

async function main() {
  await waitUntilReady();
  const opts = (await call('setup')).data;
  // The farm nearest the target size, from the setup list the player sees.
  let best = null;
  for (const d of opts.districts) {
    for (const sz of d.sizes) {
      const off = Math.abs(sz.ha - HA);
      if (!best || off < best.off) best = { off, cw: d, large: sz };
    }
  }
  if (!best) throw new Error('The setup list has no farms.');
  const { cw, large } = best;

  const made = await call('farm', 'POST', {
    district: cw.id,
    size: large.id,
    enterprise: 'grazing',
    years: 'real-in-order',
    startType: 'running',
    difficulty: 'medium',
    name: 'Cost test',
  });
  const snap = made.data.snapshot;
  const atStart = sizeNow();
  const head = snap.mobs.reduce((n, m) => n + (m.head ?? 0), 0);

  const rows = [];
  rows.push(['Start the farm', 1, made.ms, made.ms, made.bytes]);

  const open = [];
  for (let i = 0; i < 5; i++) open.push(await call('farm'));
  rows.push([
    'Open the farm (snapshot)',
    open.length,
    median(open.map((r) => r.ms)),
    Math.max(...open.map((r) => r.ms)),
    open[0].bytes,
  ]);

  let version = open[0].data.snapshot.farmVersion;
  const days = [];
  for (let i = 0; i < DAYS; i++) {
    const r = await call('day', 'POST', { version });
    if (!r.data.ok) throw new Error('Next day was refused as stale.');
    version = r.data.snapshot.farmVersion;
    days.push(r);
  }
  rows.push([
    'Next day',
    days.length,
    median(days.map((r) => r.ms)),
    Math.max(...days.map((r) => r.ms)),
    days[0].bytes,
  ]);

  const week = await call('skip', 'POST', { length: 'week', anyway: true, version });
  version = week.data.snapshot.farmVersion;
  rows.push(['+1 week skip', 1, week.ms, week.ms, week.bytes]);

  const years = [];
  let daysRun = 0;
  for (let i = 0; i < YEARS; i++) {
    const r = await call('skip', 'POST', { length: 'year', anyway: true, version });
    if (!r.data.ok) throw new Error('A skip was refused as stale.');
    version = r.data.snapshot.farmVersion;
    daysRun += r.data.summary.daysRun;
    years.push(r);
    // The route allows 10 requests in 10 seconds. Stay well inside it.
    await new Promise((r2) => setTimeout(r2, 300));
  }
  rows.push([
    '+1 year skip',
    years.length,
    median(years.map((r) => r.ms)),
    Math.max(...years.map((r) => r.ms)),
    years[0].bytes,
  ]);

  console.log('');
  console.log(
    `Farm: ${cw.name}, ${large.ha.toLocaleString('en-AU')} ha, ${head.toLocaleString('en-AU')} head at the start.`,
  );
  console.log(`Machine: ${process.platform}, Node ${process.version}, production build.`);
  console.log('');
  const w = [26, 5, 12, 11, 15];
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join(' ');
  console.log(line(['What the player does', 'Runs', 'Median (ms)', 'Worst (ms)', 'Answer size']));
  for (const [what, n, med, worst, bytes] of rows) {
    console.log(line([what, n, med.toFixed(0), worst.toFixed(0), kb(bytes)]));
  }
  if (daysRun) {
    const yearMs = median(years.map((r) => r.ms));
    console.log('');
    console.log(
      `A year skip ran ${Math.round(daysRun / years.length)} days on average: ${(yearMs / (daysRun / years.length)).toFixed(1)} ms a day.`,
    );
  }

  const after = sizeNow();
  console.log('');
  console.log('Stored farm (one JSON file):');
  console.log(`  when started    ${kb(atStart.raw)}, ${kb(atStart.zipped)} compressed`);
  console.log(`  after the test  ${kb(after.raw)}, ${kb(after.zipped)} compressed`);
}

let code = 0;
try {
  await main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  code = 1;
} finally {
  stopServer();
  if (!KEEP) rmSync(farms, { recursive: true, force: true });
}
process.exit(code);
