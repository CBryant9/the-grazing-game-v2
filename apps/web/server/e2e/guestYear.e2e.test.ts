import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setAuthDeps } from '../auth/deps';
import { GameServer, setGameServer } from '../game/game';
import { resetRateLimits } from '../game/http';
import { FileFarmStore } from '../game/store';

/*
 * Launch check (m5.5), flow 1: a guest starts a farm and plays a year, through the real route
 * handlers, with the file store and no keys. Each step checks its answer and what it changed, so a
 * break anywhere in the chain fails this test.
 */

type Handler = (req: Request) => Promise<Response>;
type Mod = { GET?: Handler; POST?: Handler; DELETE?: Handler };
const routes: Record<string, Mod> = {};
const HOST = 'http://localhost:3000';
const dir = mkdtempSync(join(tmpdir(), 'gg-e2e-guest-'));

beforeAll(async () => {
  setAuthDeps(null);
  setGameServer(
    new GameServer({ store: new FileFarmStore(dir), seed: () => 3, saveRetryMs: [0, 0] }),
  );
  routes.farm = (await import('@/app/api/game/farm/route')) as Mod;
  routes.preview = (await import('@/app/api/game/preview/route')) as Mod;
  routes.act = (await import('@/app/api/game/act/route')) as Mod;
  routes.day = (await import('@/app/api/game/day/route')) as Mod;
  routes.skip = (await import('@/app/api/game/skip/route')) as Mod;
  routes.record = (await import('@/app/api/game/record/route')) as Mod;
}, 120_000);
afterAll(() => {
  setGameServer(undefined);
  setAuthDeps(undefined);
  rmSync(dir, { recursive: true, force: true });
});

interface Snap {
  farmVersion: string;
  day: number;
  date: { year: number; month: number; date: number };
  over: string | null;
  farm: { name: string };
  mobs: { id: number; supp?: string; suppOptions?: { id: string }[] }[];
}

let cookie = '';
async function call(name: string, method: 'GET' | 'POST', body?: unknown): Promise<Response> {
  const res = await routes[name]![method]!(
    new Request(`${HOST}/api/game/${name}`, {
      method,
      headers: {
        host: 'localhost:3000',
        origin: HOST,
        'sec-fetch-site': 'same-origin',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const set = res.headers.get('set-cookie');
  if (set?.startsWith('gg_session=')) cookie = set.split(';')[0]!;
  return res;
}

describe('launch flow 1: a guest plays a year', () => {
  it('starts a farm, does a job, ends the day, skips a year and finds the farm a year on', async () => {
    resetRateLimits();
    // Start.
    const made = await call('farm', 'POST', {
      district: 'wv',
      size: 'small',
      enterprise: 'grazing',
      years: 'random',
      startType: 'running',
      difficulty: 'medium',
      name: 'Launch Year',
    });
    expect(made.status).toBe(200);
    expect(cookie).toMatch(/^gg_session=[0-9a-f]{32}$/);
    const start = ((await made.json()) as { snapshot: Snap }).snapshot;
    expect(start.farm.name).toBe('Launch Year');
    expect(start.day).toBe(0);
    expect(readdirSync(dir).filter((f) => /^[0-9a-f]{32}\.json$/.test(f))).toHaveLength(1);

    // One job: a supplement change, previewed, then confirmed on the version the card was made on.
    const mob = start.mobs[0]!;
    const supp = (mob.suppOptions ?? []).map((o) => o.id).find((id) => id !== mob.supp) ?? 'hay';
    const job = { action: { type: 'setSupplement', mob: mob.id, supp } };
    const preview = await call('preview', 'POST', job);
    expect(preview.status).toBe(200);
    const card = (await preview.json()) as { ok: boolean; version: string };
    expect(card.ok).toBe(true);
    expect(card.version).toBe(start.farmVersion);
    const requestId = 'launch-e2e-0001';
    const acted = await call('act', 'POST', { ...job, version: card.version, requestId });
    expect(acted.status).toBe(200);
    const done = (await acted.json()) as { ok: boolean; snapshot: Snap };
    expect(done.ok).toBe(true);
    expect(done.snapshot.farmVersion).not.toBe(start.farmVersion);
    expect(mob.supp).not.toBe(supp);
    expect(done.snapshot.mobs.find((m) => m.id === mob.id)!.supp).toBe(supp);
    // The same Confirm sent again is not done twice.
    const again = (await (
      await call('act', 'POST', { ...job, version: card.version, requestId })
    ).json()) as { repeat?: boolean; snapshot: Snap };
    expect(again.repeat).toBe(true);
    expect(again.snapshot.farmVersion).toBe(done.snapshot.farmVersion);

    // Next day.
    const day = await call('day', 'POST', { version: done.snapshot.farmVersion });
    expect(day.status).toBe(200);
    const d1 = (await day.json()) as { ok: boolean; snapshot: Snap };
    expect(d1.ok).toBe(true);
    expect(d1.snapshot.day).toBe(1);

    // A year skip, run through whatever stops it, until a year has closed.
    let snap = d1.snapshot;
    let closed = 0;
    for (let tries = 0; tries < 4 && closed === 0; tries++) {
      const res = await call('skip', 'POST', {
        length: 'year',
        anyway: true,
        version: snap.farmVersion,
      });
      expect(res.status).toBe(200);
      const out = (await res.json()) as { ok: boolean; snapshot: Snap; yearsClosed: number };
      expect(out.ok).toBe(true);
      expect(out.snapshot.day).toBeGreaterThan(snap.day);
      snap = out.snapshot;
      closed += out.yearsClosed;
    }
    expect(closed).toBeGreaterThanOrEqual(1);
    expect(snap.day).toBeGreaterThanOrEqual(365);

    // Opened again, the farm is where the skip left it, and the record holds the closed year.
    const back = (await (await call('farm', 'GET')).json()) as { snapshot: Snap };
    expect(back.snapshot.day).toBe(snap.day);
    expect(back.snapshot.farmVersion).toBe(snap.farmVersion);
    const record = await call('record', 'GET');
    expect(record.status).toBe(200);
    const rec = (await record.json()) as { years: { n: number }[] };
    expect(rec.years.map((y) => y.n)).toContain(1);
  }, 300_000);
});
