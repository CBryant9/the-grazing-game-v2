import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BODY_LIMIT,
  CREATES_PER_ADDRESS,
  CREATES_PER_MINUTE,
  TRUSTED_IP_HEADER_ENV,
  allow,
  allowCreate,
  clientAddress,
  readJson,
  resetRateLimits,
} from './http';
import { farmIdFor } from './game';

const dir = mkdtempSync(join(tmpdir(), 'gg-farms-'));
process.env.GG_FARMS_DIR = dir;

type Handler = (req: Request) => Promise<Response>;
let farm: { GET: Handler; POST: Handler; DELETE: Handler };
let preview: { POST: Handler };
let act: { POST: Handler };
let day: { POST: Handler };
let skip: { POST: Handler };
let setup: { GET: Handler };
let inbox: { POST: Handler };
let record: { GET: Handler };

beforeAll(async () => {
  inbox = await import('@/app/api/game/inbox/route');
  record = await import('@/app/api/game/record/route');
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

const getFarm = async (cookie: string) =>
  (await (
    await farm.GET(new Request(`${HOST}/api/game/farm`, { headers: { cookie } }))
  ).json()) as {
    snapshot: { farmVersion: string; day: number; mobs: { id: number }[] } | null;
    broken?: string;
  };

let ids = 0;
const rid = (): string => `req-${Date.now()}-${++ids}`;

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
      [day.POST, 'day', { version: 'abc' }],
      [skip.POST, 'skip', { length: 'week', version: 'abc' }],
      [preview.POST, 'preview', { todo: 'x' }],
      [act.POST, 'act', { todo: 'x', version: 'abc', requestId: rid() }],
    ] as const) {
      const res = await handler(post(path, data, cookie));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/no farm/);
    }
    // And a forged or odd cookie is treated as none.
    const odd = await day.POST(post('day', { version: 'abc' }, 'gg_session=../../x'));
    expect(odd.status).toBe(404);
  });

  it('runs Next day and a skip, and checks the skip length', async () => {
    const cookie = await started();
    const v0 = (await getFarm(cookie)).snapshot!.farmVersion;
    const d = await day.POST(post('day', { version: v0 }, cookie));
    expect(d.status).toBe(200);
    const dj = await d.json();
    expect(dj.snapshot.day).toBe(1);
    expect(dj.summary.daysRun).toBe(1);
    expect(dj.snapshot.farmVersion).not.toBe(v0);
    const s = await skip.POST(
      post('skip', { length: 'week', version: dj.snapshot.farmVersion }, cookie),
    );
    expect((await s.json()).summary.daysAsked).toBe(7);
    const v = dj.snapshot.farmVersion;
    for (const bad of [
      { length: 'decade', version: v },
      { version: v },
      { length: 7, version: v },
    ]) {
      expect((await skip.POST(post('skip', bad, cookie))).status).toBe(400);
    }
    // With no version, or a version that is not a version: refused, nothing runs.
    expect((await skip.POST(post('skip', { length: 'week' }, cookie))).status).toBe(400);
    expect((await day.POST(post('day', {}, cookie))).status).toBe(400);
    expect((await day.POST(post('day', { version: 'NOT A VERSION' }, cookie))).status).toBe(400);
  });

  it('refuses a job with its reason and a 200, and a bad job with a 400', async () => {
    const cookie = await started();
    const version = (await getFarm(cookie)).snapshot!.farmVersion;
    const r = await act.POST(
      post('act', { action: { type: 'markCalves', mob: 4242 }, version, requestId: rid() }, cookie),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: false, reason: 'no-such-mob' });
    const p = await preview.POST(
      post('preview', { action: { type: 'markCalves', mob: 4242 } }, cookie),
    );
    expect(await p.json()).toMatchObject({ ok: false, reason: 'no-such-mob' });
    for (const bad of [{}, { action: { type: 'sellClass' } }, { todo: 5 }]) {
      expect(
        (await act.POST(post('act', { ...bad, version, requestId: rid() }, cookie))).status,
      ).toBe(400);
    }
    // An act with no version or no request id is refused before anything runs.
    const job = { action: { type: 'markCalves', mob: 1 } };
    expect((await act.POST(post('act', { ...job, requestId: rid() }, cookie))).status).toBe(400);
    expect((await act.POST(post('act', { ...job, version }, cookie))).status).toBe(400);
    expect((await act.POST(post('act', { ...job, version, requestId: 'x' }, cookie))).status).toBe(
      400,
    );
  });

  it('marks the inbox read, checks the number, and needs a farm', async () => {
    const none = await inbox.POST(post('inbox', { upTo: 3 }, `gg_session=${'d'.repeat(32)}`));
    expect(none.status).toBe(404);
    const cookie = await started();
    const before = await (
      await farm.GET(new Request(`${HOST}/api/game/farm`, { headers: { cookie } }))
    ).json();
    expect(before.snapshot.inboxUnread).toBeGreaterThan(0);
    const newest = Math.max(...before.snapshot.inbox.map((m: { seq: number }) => m.seq));
    for (const bad of [{}, { upTo: 'x' }, { upTo: -1 }, { upTo: 1.5 }, { upTo: 2 ** 40 }, []]) {
      expect((await inbox.POST(post('inbox', bad, cookie))).status).toBe(400);
    }
    const ok = await inbox.POST(post('inbox', { upTo: newest }, cookie));
    expect(ok.status).toBe(200);
    expect((await ok.json()).snapshot.inboxUnread).toBe(0);
    const cross = await inbox.POST(
      post('inbox', { upTo: 1 }, cookie, { origin: 'https://evil.example' }),
    );
    expect(cross.status).toBe(403);
  });

  it('refuses a request from another site', async () => {
    const cookie = await started();
    const version = (await getFarm(cookie)).snapshot!.farmVersion;
    const res = await day.POST(
      post('day', { version }, cookie, { origin: 'https://evil.example' }),
    );
    expect(res.status).toBe(403);
    const ok = await day.POST(
      post('day', { version }, cookie, { origin: 'http://localhost:3000' }),
    );
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

describe('farm creation limits', () => {
  const at = (headers: Record<string, string> = {}) =>
    new Request(`${HOST}/api/game/farm`, { method: 'POST', headers });
  afterEach(() => {
    delete process.env[TRUSTED_IP_HEADER_ENV];
  });

  it('trusts no address header unless told to, and then only the one named', () => {
    const req = at({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2', 'x-real-ip': '3.3.3.3' });
    expect(clientAddress(req)).toBeNull();
    process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
    expect(clientAddress(req)).toBe('3.3.3.3');
    // Behind a proxy that appends to x-forwarded-for, the last entry is the proxy's; earlier ones are the client's.
    process.env[TRUSTED_IP_HEADER_ENV] = 'x-forwarded-for';
    expect(clientAddress(req)).toBe('2.2.2.2');
  });

  it('a made-up cookie or a made-up x-forwarded-for gets no fresh count', async () => {
    let last = 200;
    let made = 0;
    for (let i = 0; i < CREATES_PER_ADDRESS + 3; i++) {
      // Each request has a new forged session and a new forged address.
      const cookie = `gg_session=${i.toString(16).padStart(32, 'e')}`;
      const res = await farm.POST(post('farm', body, cookie, { 'x-forwarded-for': `9.9.9.${i}` }));
      last = res.status;
      if (res.status === 200) made++;
    }
    expect(made).toBe(CREATES_PER_ADDRESS);
    expect(last).toBe(429);
  });

  it('a request with no cookie at all is limited too', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < CREATES_PER_ADDRESS + 2; i++) {
      statuses.push((await farm.POST(post('farm', { ...body, name: '' }))).status);
    }
    expect(statuses.slice(0, CREATES_PER_ADDRESS).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(CREATES_PER_ADDRESS).every((s) => s === 429)).toBe(true);
  });

  it('keys on the trusted address, with a cap on all creations a minute', () => {
    process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
    const now = 1_000_000;
    // Different addresses each get their own count...
    let allowed = 0;
    for (let i = 0; i < CREATES_PER_MINUTE + 10; i++) {
      if (allowCreate(at({ 'x-real-ip': `10.0.0.${i}` }), now)) allowed++;
    }
    // ...but the whole server stops at the cap.
    expect(allowed).toBe(CREATES_PER_MINUTE);
    expect(allowCreate(at({ 'x-real-ip': '10.0.1.1' }), now + 61_000)).toBe(true);
    // One address stops at its own limit.
    resetRateLimits();
    let one = 0;
    for (let i = 0; i < CREATES_PER_ADDRESS + 4; i++) {
      if (allowCreate(at({ 'x-real-ip': '10.9.9.9' }), now)) one++;
    }
    expect(one).toBe(CREATES_PER_ADDRESS);
  });
});

describe('request bodies', () => {
  const big = 'x'.repeat(BODY_LIMIT + 10);

  it('refuses a body that says it is too long before reading it', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          pulled++;
          c.enqueue(new TextEncoder().encode('{}'));
          c.close();
        },
      },
      { highWaterMark: 0 },
    );
    const req = new Request(`${HOST}/x`, {
      method: 'POST',
      headers: { 'content-length': String(BODY_LIMIT + 1) },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    await expect(readJson(req)).rejects.toMatchObject({ status: 413 });
    expect(pulled).toBe(0);
  });

  it('cuts off a body with no length, or a false one, once it passes the limit', async () => {
    let sent = 0;
    const endless = () =>
      new ReadableStream<Uint8Array>({
        pull(c) {
          sent += 4096;
          c.enqueue(new Uint8Array(4096).fill(32));
        },
      });
    const noLength = new Request(`${HOST}/x`, {
      method: 'POST',
      body: endless(),
      duplex: 'half',
    } as RequestInit);
    await expect(readJson(noLength)).rejects.toMatchObject({ status: 413 });
    // It stopped soon after the limit, not at the end of a body that never ends.
    expect(sent).toBeLessThan(BODY_LIMIT + 3 * 4096);
    sent = 0;
    const lying = new Request(`${HOST}/x`, {
      method: 'POST',
      headers: { 'content-length': '10' },
      body: endless(),
      duplex: 'half',
    } as RequestInit);
    await expect(readJson(lying)).rejects.toMatchObject({ status: 413 });
    expect(sent).toBeLessThan(BODY_LIMIT + 3 * 4096);
  });

  it('answers an oversized body on a route with a plain 413', async () => {
    const res = await farm.POST(post('farm', big));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('That request was too big.');
    // A body just under the limit is read (and refused for what it says).
    const ok = await readJson(
      new Request(`${HOST}/x`, { method: 'POST', body: JSON.stringify({ a: 'y'.repeat(1000) }) }),
    );
    expect(ok).toMatchObject({ a: expect.any(String) });
  });
});

describe('a job card and the job agree', () => {
  /** A job that changes the farm and is safe to repeat: switching a supplement back and forth. */
  async function setUp() {
    const cookie = await started();
    const snap = (await getFarm(cookie)).snapshot!;
    return { cookie, snap, mob: snap.mobs[0]!.id };
  }
  const send = (cookie: string, data: unknown) => act.POST(post('act', data, cookie));

  it('two tabs: the second tab is refused with the latest farm, and nothing is done twice', async () => {
    const { cookie, snap, mob } = await setUp();
    const job = { action: { type: 'setSupplement', mob, supp: 'hay' } };
    const p1 = await (await preview.POST(post('preview', job, cookie))).json();
    const p2 = await (await preview.POST(post('preview', job, cookie))).json();
    expect(p1.version).toBe(snap.farmVersion);
    expect(p2.version).toBe(snap.farmVersion);
    const one = await (
      await send(cookie, { ...job, version: p1.version, requestId: rid() })
    ).json();
    expect(one.ok).toBe(true);
    const two = await (
      await send(cookie, { ...job, version: p2.version, requestId: rid() })
    ).json();
    expect(two).toMatchObject({
      ok: false,
      reason: 'stale',
      message: 'The farm has changed since this was shown. Here is the latest.',
    });
    expect(two.snapshot.farmVersion).toBe(one.snapshot.farmVersion);
    // Next day from the first tab's old view is refused the same way.
    const d = await (await day.POST(post('day', { version: snap.farmVersion }, cookie))).json();
    expect(d).toMatchObject({ ok: false, reason: 'stale' });
    expect(d.snapshot.day).toBe(0);
  });

  it('a double confirm does the job once, and both answers say the same', async () => {
    const { cookie, snap, mob } = await setUp();
    const requestId = rid();
    const job = {
      action: { type: 'setSupplement', mob, supp: 'pellet' },
      version: snap.farmVersion,
      requestId,
    };
    const [a, b] = await Promise.all([send(cookie, job), send(cookie, job)]);
    const ja = await a.json();
    const jb = await b.json();
    expect(ja.ok).toBe(jb.ok);
    expect(ja.message).toBe(jb.message);
    expect(ja.snapshot.farmVersion).toBe(jb.snapshot.farmVersion);
    // Only one change to the farm: its version moved once from the one shown.
    const after = (await getFarm(cookie)).snapshot!;
    expect(after.farmVersion).toBe(ja.snapshot.farmVersion);
    expect([ja.repeat, jb.repeat].filter(Boolean)).toHaveLength(1);
  });

  it('a lost reply then a retry gets the first answer, not a second job', async () => {
    const { cookie, snap, mob } = await setUp();
    const requestId = rid();
    const job = {
      action: { type: 'setSupplement', mob, supp: 'lick' },
      version: snap.farmVersion,
      requestId,
    };
    const first = await (await send(cookie, job)).json();
    expect(first.ok).toBe(true);
    // The reply never reached the browser. It sends the same request again.
    const again = await (await send(cookie, job)).json();
    expect(again).toMatchObject({ ok: true, message: first.message, repeat: true });
    expect((await getFarm(cookie)).snapshot!.farmVersion).toBe(first.snapshot.farmVersion);
  });

  it('a card shown before Next day is refused, with the latest farm', async () => {
    const { cookie, snap, mob } = await setUp();
    const job = { action: { type: 'setSupplement', mob, supp: 'hay' } };
    const p = await (await preview.POST(post('preview', job, cookie))).json();
    await day.POST(post('day', { version: snap.farmVersion }, cookie));
    const r = await (await send(cookie, { ...job, version: p.version, requestId: rid() })).json();
    expect(r).toMatchObject({ ok: false, reason: 'stale' });
    expect(r.snapshot.day).toBe(1);
  });
});

describe('a farm that can not be opened', () => {
  it('says so plainly, keeps the file aside, and lets the player start again', async () => {
    const cookie = await started();
    const session = cookie.split('=')[1]!;
    const file = join(dir, `${farmIdFor(session)}.json`);
    writeFileSync(file, '{"name": "half a fa');
    // A fresh server, so nothing is held in memory.
    globalThis.__ggGameServer = undefined;
    vi.resetModules();
    const fresh = await import('@/app/api/game/farm/route');
    const got = await fresh.GET(new Request(`${HOST}/api/game/farm`, { headers: { cookie } }));
    expect(got.status).toBe(200);
    const body = await got.json();
    expect(body.snapshot).toBeNull();
    expect(body.broken).toMatch(/could not be opened/);
    const freshDay = await import('@/app/api/game/day/route');
    const d = await freshDay.POST(post('day', { version: 'abc' }, cookie));
    expect(d.status).toBe(409);
    expect((await d.json()).error).toMatch(/could not be opened/);
    // Start a new farm: the broken one is renamed, not deleted.
    const gone = await fresh.DELETE(
      new Request(`${HOST}/api/game/farm`, {
        method: 'DELETE',
        headers: { cookie, host: 'localhost:3000' },
      }),
    );
    expect(gone.status).toBe(200);
    const names = readdirSync(dir);
    expect(names).not.toContain(`${farmIdFor(session)}.json`);
    expect(names.some((n) => n.startsWith(`${farmIdFor(session)}.broken-`))).toBe(true);
    const again = await fresh.POST(post('farm', body0(), cookie));
    expect(again.status).toBe(200);
  });
});

const body0 = () => ({ ...body });

describe('allow', () => {
  it('counts in a window and starts again after it', () => {
    expect(allow('k', 2, 1000, 0)).toBe(true);
    expect(allow('k', 2, 1000, 10)).toBe(true);
    expect(allow('k', 2, 1000, 20)).toBe(false);
    expect(allow('k', 2, 1000, 1500)).toBe(true);
  });
});

describe('the session cookie is renewed', () => {
  it('a request that loads the farm sends the same session again with a fresh Max-Age', async () => {
    const cookie = await started();
    const session = cookie.split('=')[1]!;
    const got = await farm.GET(new Request(`${HOST}/api/game/farm`, { headers: { cookie } }));
    const set = got.headers.get('set-cookie')!;
    expect(set).toMatch(new RegExp(`^gg_session=${session};`));
    expect(set).toMatch(/Max-Age=7776000/);
    expect(set).toMatch(/HttpOnly/);
    const version = (await got.json()).snapshot.farmVersion;
    const d = await day.POST(post('day', { version }, cookie));
    expect(d.headers.get('set-cookie')).toMatch(new RegExp(`^gg_session=${session};`));
    // A refusal sends nothing new, and a visitor with no session gets no cookie.
    const bad = await day.POST(post('day', {}, cookie));
    expect(bad.status).toBe(400);
    expect(bad.headers.get('set-cookie')).toBeNull();
  });
});

describe('the record route', () => {
  const get = (query: string, cookie?: string) =>
    record.GET(
      new Request(`${HOST}/api/game/record${query}`, { headers: cookie ? { cookie } : {} }),
    );

  it('gives the year so far, the finished years and a page of the diary', async () => {
    const cookie = await started();
    const version = (await getFarm(cookie)).snapshot!.farmVersion;
    const sk = await skip.POST(post('skip', { length: 'year', anyway: false, version }, cookie));
    expect(sk.status).toBe(200);
    const body = await sk.json();
    expect(body.yearsClosed).toBe(1);
    expect(body.yearEnd.n).toBe(1);
    const res = await get('', cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=7776000/);
    const rec = await res.json();
    expect(Object.keys(rec).sort()).toEqual(['diary', 'earlier', 'soFar', 'years']);
    expect(rec.years.map((y: { n: number }) => y.n)).toEqual([1]);
    expect(rec.soFar.n).toBe(2);
    expect(rec.diary).toHaveLength(30);
    expect(rec.earlier).toBe(rec.diary[29].day);
    const older = await (await get(`?before=${rec.earlier}`, cookie)).json();
    expect(older.diary[0].day).toBeLessThan(rec.earlier);
  });

  it('refuses a visitor with no farm, and a bad page', async () => {
    expect((await get('')).status).toBe(404);
    const cookie = await started();
    for (const bad of [
      '?before=abc',
      '?before=-1',
      '?before=1.5',
      '?before=',
      '?before=1&before=2',
    ]) {
      const res = await get(bad, cookie);
      expect(res.status).toBe(400);
      expect(Object.keys(await res.json())).toEqual(['error']);
    }
    expect((await get('?before=0', cookie)).status).toBe(200);
  });

  it('is limited like the other routes', async () => {
    const cookie = await started();
    let last = 200;
    for (let i = 0; i < 101; i++) last = (await get('', cookie)).status;
    expect(last).toBe(429);
  });
});
