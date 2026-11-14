import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allow, resetRateLimits } from './http';

const dir = mkdtempSync(join(tmpdir(), 'gg-farms-'));
process.env.GG_FARMS_DIR = dir;

type Handler = (req: Request) => Promise<Response>;
let farm: { GET: Handler; POST: Handler; DELETE: Handler };
let preview: { POST: Handler };
let act: { POST: Handler };
let day: { POST: Handler };
let skip: { POST: Handler };
let setup: { GET: Handler };

beforeAll(async () => {
  farm = await import('@/app/api/game/farm/route');
  preview = await import('@/app/api/game/preview/route');
  act = await import('@/app/api/game/act/route');
  day = await import('@/app/api/game/day/route');
  skip = await import('@/app/api/game/skip/route');
  setup = await import('@/app/api/game/setup/route');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetRateLimits());

const HOST = 'http://localhost:3000';
const body = {
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'Route Test',
};

const post = (path: string, data: unknown, cookie?: string, headers: Record<string, string> = {}) =>
  new Request(`${HOST}/api/game/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'localhost:3000',
      ...headers,
      ...(cookie ? { cookie } : {}),
    },
    body: typeof data === 'string' ? data : JSON.stringify(data),
  });

async function started(): Promise<string> {
  const res = await farm.POST(post('farm', body));
  expect(res.status).toBe(200);
  const set = res.headers.get('set-cookie')!;
  return set.split(';')[0]!;
}

describe('the game routes', () => {
  it('serves the setup choices, never cached', async () => {
    const res = await setup.GET(new Request(`${HOST}/api/game/setup`));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).districts).toHaveLength(4);
  });

  it('gives a visitor with no farm null, and sets no cookie', async () => {
    const res = await farm.GET(new Request(`${HOST}/api/game/farm`));
    expect(await res.json()).toEqual({ snapshot: null });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('creates a farm with an http-only, same-site cookie, and keeps it in a file', async () => {
    const res = await farm.POST(post('farm', body));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const set = res.headers.get('set-cookie')!;
    expect(set).toMatch(/^gg_session=[0-9a-f]{32};/);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Lax/);
    const json = await res.json();
    expect(json.snapshot.farm.name).toBe('Route Test');
    expect(readdirSync(dir).some((f) => /^[0-9a-f]{32}\.json$/.test(f))).toBe(true);
    // The session id is not the file name.
    const session = set.split(';')[0]!.split('=')[1]!;
    expect(readdirSync(dir).join(',')).not.toContain(session);
    // The cookie brings the farm back.
    const again = await farm.GET(
      new Request(`${HOST}/api/game/farm`, { headers: { cookie: `gg_session=${session}` } }),
    );
    expect((await again.json()).snapshot.farm.name).toBe('Route Test');
  });

  it('answers a bad body with a 400 and a plain message', async () => {
    for (const bad of ['{not json', '[]', { ...body, district: 'moon' }, { ...body, name: '' }]) {
      const res = await farm.POST(post('farm', bad));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(Object.keys(json)).toEqual(['error']);
      expect(json.error).toMatch(/^[A-Z]/);
      expect(json.error).not.toMatch(/Error:|\.ts|at .*\(/);
    }
    expect((await farm.POST(post('farm', 'x'.repeat(10_000)))).status).toBe(400);
  });

  it('says there is no farm for a session without one', async () => {
    const cookie = `gg_session=${'c'.repeat(32)}`;
    for (const [handler, path, data] of [
      [day.POST, 'day', {}],
      [skip.POST, 'skip', { length: 'week' }],
      [preview.POST, 'preview', { todo: 'x' }],
      [act.POST, 'act', { todo: 'x' }],
    ] as const) {
      const res = await handler(post(path, data, cookie));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/no farm/);
    }
    // And a forged or odd cookie is treated as none.
    const odd = await day.POST(post('day', {}, 'gg_session=../../x'));
    expect(odd.status).toBe(404);
  });

  it('runs Next day and a skip, and checks the skip length', async () => {
    const cookie = await started();
    const d = await day.POST(post('day', {}, cookie));
    expect(d.status).toBe(200);
    const dj = await d.json();
    expect(dj.snapshot.day).toBe(1);
    expect(dj.summary.daysRun).toBe(1);
    const s = await skip.POST(post('skip', { length: 'week' }, cookie));
    expect((await s.json()).summary.daysAsked).toBe(7);
    for (const bad of [{ length: 'decade' }, {}, { length: 7 }]) {
      expect((await skip.POST(post('skip', bad, cookie))).status).toBe(400);
    }
  });

  it('refuses a job with its reason and a 200, and a bad job with a 400', async () => {
    const cookie = await started();
    const r = await act.POST(post('act', { action: { type: 'markCalves', mob: 4242 } }, cookie));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: false, reason: 'no-such-mob' });
    const p = await preview.POST(
      post('preview', { action: { type: 'markCalves', mob: 4242 } }, cookie),
    );
    expect(await p.json()).toMatchObject({ ok: false, reason: 'no-such-mob' });
    for (const bad of [{}, { action: { type: 'sellClass' } }, { todo: 5 }]) {
      expect((await act.POST(post('act', bad, cookie))).status).toBe(400);
    }
  });

  it('refuses a request from another site', async () => {
    const cookie = await started();
    const res = await day.POST(post('day', {}, cookie, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    const ok = await day.POST(post('day', {}, cookie, { origin: 'http://localhost:3000' }));
    expect(ok.status).toBe(200);
  });

  it('starts over when asked', async () => {
    const cookie = await started();
    const gone = await farm.DELETE(
      new Request(`${HOST}/api/game/farm`, {
        method: 'DELETE',
        headers: { cookie, host: 'localhost:3000' },
      }),
    );
    expect(await gone.json()).toEqual({ snapshot: null });
    const after = await farm.GET(new Request(`${HOST}/api/game/farm`, { headers: { cookie } }));
    expect(await after.json()).toEqual({ snapshot: null });
  });

  it('limits a flood lightly, with a plain message', async () => {
    const cookie = await started();
    let last = 200;
    for (let i = 0; i < 40; i++) {
      last = (await skip.POST(post('skip', { length: 'bad' }, cookie))).status;
    }
    expect(last).toBe(429);
    const res = await skip.POST(post('skip', { length: 'bad' }, cookie));
    expect((await res.json()).error).toMatch(/Wait a few seconds/);
    expect(res.headers.get('retry-after')).toBe('10');
  });
});

describe('allow', () => {
  it('counts in a window and starts again after it', () => {
    expect(allow('k', 2, 1000, 0)).toBe(true);
    expect(allow('k', 2, 1000, 10)).toBe(true);
    expect(allow('k', 2, 1000, 20)).toBe(false);
    expect(allow('k', 2, 1000, 1500)).toBe(true);
  });
});
