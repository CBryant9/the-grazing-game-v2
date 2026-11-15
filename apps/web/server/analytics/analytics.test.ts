import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_COOKIE } from '@gg/shared';
import { ANALYTICS_EVENTS, COLLECT_MAX_EVENTS } from '@gg/shared/analytics';
import { freshDb } from '../../../../packages/db/src/harness';
import { pgliteSql } from '../test-support/pgliteSql';
import { FakeAuth } from '../test-support/fakeAuth';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { resetRateLimits } from '../game/http';
import { logFailure } from '../logging';
import type { SqlClient } from '../db/sql';
import { checkEvent, propsKey } from './events';
import { countWebsiteView, trackServer } from './collect';
import { hashedUserId, sendToPostHog, posthogConfig } from './record';
import { bucketOf, p75 } from './vitals';
import { cleanRoute, flushHealth, noteHealth, pendingHealth, resetHealth, timed } from './health';

const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';
const INSTALL = '3f2b8c1e-7a4d-4e2b-9c1a-5d6e7f8a9b0c';

let db: PGlite;
let sql: SqlClient;
let auth: FakeAuth;
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};
let collect: (req: Request) => Promise<Response>;
let consentGet: (req: Request) => Promise<Response>;
let consentPost: (req: Request) => Promise<Response>;
const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));

async function person(key: string, age: number) {
  const { user, cookie } = await auth.signInAs(`${key}@example.test`);
  ids[key] = user.id;
  cookies[key] = cookie;
  await db.query('insert into public.profiles (user_id, username) values ($1, $2)', [
    user.id,
    `u_${key}`,
  ]);
  await db.query(
    `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
     values ($1, ((now() at time zone 'Australia/Sydney')::date - ($2 || ' years')::interval - interval '10 days')::date, now())`,
    [user.id, String(age)],
  );
  await db.query('insert into public.account_status (user_id) values ($1)', [user.id]);
}

async function setSwitch(on: boolean) {
  await db.query(`update public.feature_switches set enabled = $1 where key = 'analytics'`, [on]);
  resetSwitchCache();
}

const counts = async () =>
  (
    await db.query<{ event: string; props: string; count: number }>(
      'select event, props, count::int as count from public.analytics_daily order by event, props',
    )
  ).rows;

function beacon(body: unknown, opts: { cookie?: string; origin?: string; type?: string } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(`${HOST}/api/collect`, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: opts.origin ?? HOST,
      'content-type': opts.type ?? 'application/json',
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: text,
  });
}
const view = { id: INSTALL, ev: [{ e: 'page_view', p: { page: 'play' } }] };

beforeAll(async () => {
  db = await freshDb({ seed: false });
  sql = pgliteSql(db);
  auth = new FakeAuth(db);
  const deps: AuthDeps = { provider: auth, sql, pepper: PEPPER };
  setAuthDeps(deps);
  await person('adult', 30);
  await person('kid', 15);
  collect = (await import('@/app/api/collect/route')).POST;
  const c = await import('@/app/api/consent/route');
  consentGet = c.GET;
  consentPost = c.POST;
  vi.stubGlobal('fetch', fetchMock);
}, 120_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  setAuthDeps(undefined);
  await db?.close();
});

beforeEach(async () => {
  resetRateLimits();
  fetchMock.mockClear();
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
  await db.exec('delete from public.analytics_daily; delete from public.web_vitals_daily;');
  await setSwitch(true);
});
afterEach(() => {
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
});

describe('the fixed event list', () => {
  it('accepts only listed names, keys and values, and every key the event names', () => {
    expect(checkEvent('page_view', { page: 'play' }, true)).toEqual({
      name: 'page_view',
      props: { page: 'play' },
    });
    expect(checkEvent('made_up', {}, true)).toBeNull();
    expect(checkEvent('toString', {}, true)).toBeNull();
    expect(checkEvent('page_view', { page: 'somewhere' }, true)).toBeNull();
    expect(checkEvent('page_view', { page: 'play', email: 'a@b.c' }, true)).toBeNull();
    expect(checkEvent('page_view', {}, true)).toBeNull();
    expect(checkEvent('web_vital', { page: 'play', metric: 'LCP', value: 1.5 }, true)).toBeNull();
    expect(checkEvent('web_vital', { page: 'play', metric: 'LCP', value: -1 }, true)).toBeNull();
    // A browser can not send what only the server records.
    expect(checkEvent('signup', {}, true)).toBeNull();
    expect(checkEvent('signup', {}, false)).toEqual({ name: 'signup', props: {} });
  });

  it('has no free-text property anywhere: every property is a word list or a whole-number range', () => {
    for (const [name, def] of Object.entries(ANALYTICS_EVENTS)) {
      for (const [key, spec] of Object.entries(def.props)) {
        const ok =
          (Array.isArray(spec) && spec.every((w) => /^[A-Za-z0-9_]{1,40}$/.test(w))) ||
          (!Array.isArray(spec) && Number.isInteger((spec as { min: number }).min));
        expect(ok, `${name}.${key}`).toBe(true);
        expect(key, name).not.toMatch(/email|name|user|ip|address|text/i);
      }
    }
  });

  it('keys the counts by the word properties only', () => {
    const e = checkEvent('skip_used', { mode: 'fast', days: 30 }, false)!;
    expect(propsKey(e)).toBe('mode=fast');
  });
});

describe('/api/collect', () => {
  it('refuses another site, a form body, a body over 2 KB, unknown events and too many events', async () => {
    const cookie = `${CONSENT_COOKIE}=y`;
    expect((await collect(beacon(view, { cookie, origin: 'https://evil.example' }))).status).toBe(
      403,
    );
    expect((await collect(beacon(view, { cookie, type: 'text/plain' }))).status).toBe(403);
    expect((await collect(beacon('x'.repeat(3000), { cookie }))).status).toBe(413);
    expect((await collect(beacon({ id: INSTALL, ev: [{ e: 'nope' }] }, { cookie }))).status).toBe(
      400,
    );
    expect((await collect(beacon({ id: INSTALL, ev: [{ e: 'signup' }] }, { cookie }))).status).toBe(
      400,
    );
    expect(
      (
        await collect(
          beacon(
            { id: INSTALL, ev: [...view.ev, { e: 'page_view', p: { page: 'play', who: 'ann' } }] },
            { cookie },
          ),
        )
      ).status,
    ).toBe(400);
    const many = Array.from({ length: COLLECT_MAX_EVENTS + 1 }, () => view.ev[0]);
    expect((await collect(beacon({ id: INSTALL, ev: many }, { cookie }))).status).toBe(400);
    expect(await counts()).toEqual([]);
  });

  it('is rate limited', async () => {
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await collect(beacon(view))).status;
    expect(last).toBe(429);
  });

  it('keeps nothing for a guest who has not said yes, or while the switch is off', async () => {
    expect((await collect(beacon(view))).status).toBe(204);
    expect((await collect(beacon(view, { cookie: `${CONSENT_COOKIE}=n` }))).status).toBe(204);
    await setSwitch(false);
    expect((await collect(beacon(view, { cookie: `${CONSENT_COOKIE}=y` }))).status).toBe(204);
    expect(await counts()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts a guest who said yes, and sends nothing on with no PostHog key', async () => {
    expect((await collect(beacon(view, { cookie: `${CONSENT_COOKIE}=y` }))).status).toBe(204);
    expect(await counts()).toEqual([{ event: 'page_view', props: 'page=play', count: 1 }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with the PostHog key, sends the events with the random id and nothing personal', async () => {
    process.env.POSTHOG_KEY = 'phc_test';
    process.env.POSTHOG_HOST = 'https://eu.posthog.example';
    await collect(beacon(view, { cookie: `${CONSENT_COOKIE}=y` }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://eu.posthog.example/batch/');
    const body = JSON.parse(String(init.body));
    expect(body.api_key).toBe('phc_test');
    expect(body.batch[0]).toMatchObject({
      event: 'page_view',
      distinct_id: `g_${INSTALL}`,
      properties: { page: 'play', $process_person_profile: false, $geoip_disable: true },
    });
  });

  it('a signed-in player is counted only by their own choice in the database, never the cookie', async () => {
    const withCookie = `${cookies.adult!}; ${CONSENT_COOKIE}=y`;
    await collect(beacon(view, { cookie: withCookie }));
    expect(await counts()).toEqual([]);

    const set = await consentPost(
      new Request(`${HOST}/api/consent`, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: HOST,
          'content-type': 'application/json',
          cookie: cookies.adult!,
        },
        body: JSON.stringify({ granted: true }),
      }),
    );
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({
      granted: true,
      canChange: true,
      who: 'account',
      reason: null,
    });
    expect(set.headers.get('set-cookie')).toMatch(new RegExp(`^${CONSENT_COOKIE}=y; Path=/;`));
    expect(set.headers.get('set-cookie')).not.toContain('HttpOnly');

    process.env.POSTHOG_KEY = 'phc_test';
    process.env.POSTHOG_HOST = 'https://eu.posthog.example';
    // Even with no cookie, the account's yes counts; the browser id is ignored.
    await collect(beacon(view, { cookie: cookies.adult! }));
    expect(await counts()).toEqual([{ event: 'page_view', props: 'page=play', count: 1 }]);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.batch[0].distinct_id).toBe(`u_${hashedUserId(PEPPER, ids.adult!)}`);
    expect(JSON.stringify(body)).not.toContain(ids.adult!);
    expect(JSON.stringify(body)).not.toContain('example.test');
    expect(JSON.stringify(body)).not.toContain(INSTALL);

    // And back to no.
    await consentPost(
      new Request(`${HOST}/api/consent`, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: HOST,
          'content-type': 'application/json',
          cookie: cookies.adult!,
        },
        body: JSON.stringify({ granted: false }),
      }),
    );
    await collect(beacon(view, { cookie: withCookie }));
    expect((await counts())[0]!.count).toBe(1);
  });

  it('under 16: off, can not be turned on by the route or by the database itself', async () => {
    const get = await consentGet(
      new Request(`${HOST}/api/consent`, {
        headers: { host: 'localhost:3000', cookie: cookies.kid! },
      }),
    );
    expect(await get.json()).toEqual({
      granted: false,
      canChange: false,
      who: 'account',
      reason: 'under_16',
    });
    const post = await consentPost(
      new Request(`${HOST}/api/consent`, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: HOST,
          'content-type': 'application/json',
          cookie: cookies.kid!,
        },
        body: JSON.stringify({ granted: true }),
      }),
    );
    expect(post.status).toBe(403);
    await expect(
      sql.query('insert into public.analytics_consent (user_id, granted) values ($1, true)', [
        ids.kid,
      ]),
    ).rejects.toThrow();
    await collect(beacon(view, { cookie: `${cookies.kid!}; ${CONSENT_COOKIE}=y` }));
    expect(await counts()).toEqual([]);
  });

  it('a guest’s choice goes in the cookie, default no', async () => {
    const get = await consentGet(
      new Request(`${HOST}/api/consent`, { headers: { host: 'localhost:3000' } }),
    );
    expect(await get.json()).toEqual({
      granted: false,
      canChange: true,
      who: 'guest',
      reason: null,
    });
    const post = await consentPost(
      new Request(`${HOST}/api/consent`, {
        method: 'POST',
        headers: { host: 'localhost:3000', origin: HOST, 'content-type': 'application/json' },
        body: JSON.stringify({ granted: true }),
      }),
    );
    expect(post.headers.get('set-cookie')).toMatch(
      /^gg_analytics=y; Path=\/; SameSite=Lax; Max-Age=31536000/,
    );
    const bad = await consentPost(
      new Request(`${HOST}/api/consent`, {
        method: 'POST',
        headers: { host: 'localhost:3000', origin: HOST, 'content-type': 'application/json' },
        body: JSON.stringify({ granted: 'yes' }),
      }),
    );
    expect(bad.status).toBe(400);
  });

  it('keeps Web Vitals as a histogram, not as readings', async () => {
    await collect(
      beacon(
        {
          id: INSTALL,
          ev: [
            { e: 'web_vital', p: { page: 'play', metric: 'LCP', value: 1234 } },
            { e: 'web_vital', p: { page: 'play', metric: 'CLS', value: 42 } },
          ],
        },
        { cookie: `${CONSENT_COOKIE}=y` },
      ),
    );
    const v = await db.query<{ metric: string; bucket: number; count: number }>(
      'select metric, bucket, count::int as count from public.web_vitals_daily order by metric',
    );
    expect(v.rows).toEqual([
      { metric: 'CLS', bucket: 50, count: 1 },
      { metric: 'LCP', bucket: 1300, count: 1 },
    ]);
    expect(await counts()).toEqual([]);
  });
});

describe('server-side events and website views', () => {
  it('trackServer counts only with consent and the switch', async () => {
    const req = new Request(`${HOST}/api/game/setup`, { headers: { host: 'localhost:3000' } });
    expect(await trackServer(req, ids.adult!, 'day_completed', { mode: 'daily' })).toBe(false);
    await sql.query(
      `insert into public.analytics_consent (user_id, granted) values ($1, true)
       on conflict (user_id) do update set granted = true`,
      [ids.adult],
    );
    expect(await trackServer(req, ids.adult!, 'day_completed', { mode: 'daily' })).toBe(true);
    expect(await trackServer(req, ids.kid!, 'day_completed', { mode: 'daily' })).toBe(false);
    expect(await trackServer(req, ids.adult!, 'day_completed', { mode: 'weekly' })).toBe(false);
    await setSwitch(false);
    expect(await trackServer(req, ids.adult!, 'day_completed', { mode: 'daily' })).toBe(false);
    expect(await counts()).toEqual([{ event: 'day_completed', props: 'mode=daily', count: 1 }]);
  });

  it('counts a public page view with no cookie or id, and leaves out bots, prefetches and other pages', async () => {
    const page = (path: string, h: Record<string, string> = {}) =>
      new Request(`${HOST}${path}`, {
        headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (Android)', ...h },
      });
    expect(await countWebsiteView(page('/'))).toBe(true);
    expect(await countWebsiteView(page('/pricing'))).toBe(true);
    expect(await countWebsiteView(page('/', { 'user-agent': 'Googlebot/2.1' }))).toBe(false);
    expect(await countWebsiteView(page('/', { 'sec-purpose': 'prefetch' }))).toBe(false);
    expect(await countWebsiteView(page('/play'))).toBe(false);
    await setSwitch(false);
    expect(await countWebsiteView(page('/'))).toBe(false);
    expect(await counts()).toEqual([
      { event: 'website_view', props: 'page=home', count: 1 },
      { event: 'website_view', props: 'page=pricing', count: 1 },
    ]);
  });

  it('PostHog: no host or a plain-http host means nothing is sent; a failure is only logged', async () => {
    expect(posthogConfig({ POSTHOG_KEY: 'k' })).toBeNull();
    expect(posthogConfig({ POSTHOG_KEY: 'k', POSTHOG_HOST: 'http://x.example' })).toBeNull();
    const e = checkEvent('page_view', { page: 'play' }, true)!;
    const failing = vi.fn(async () => {
      throw new Error('down for a@b.example');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(
      await sendToPostHog({ key: 'k', host: 'https://x.example' }, 'g_x', [e], failing as never),
    ).toBe(false);
    expect(err.mock.calls.flat().join(' ')).not.toContain('a@b.example');
    err.mockRestore();
  });
});

describe('Web Vitals buckets', () => {
  it('puts a reading in the bucket at or above it, and reads the 75th percentile', () => {
    expect(bucketOf('LCP', 0)).toBe(50);
    expect(bucketOf('LCP', 1001)).toBe(1100);
    expect(bucketOf('INP', 180)).toBe(200);
    expect(bucketOf('CLS', 50)).toBe(50);
    expect(bucketOf('LCP', 10_000_000)).toBe(600_000);
    expect(p75([])).toBeNull();
    expect(
      p75([
        { bucket: 100, count: 1 },
        { bucket: 200, count: 1 },
        { bucket: 300, count: 1 },
        { bucket: 400, count: 1 },
      ]),
    ).toBe(300);
  });
});

describe('game health', () => {
  beforeEach(() => resetHealth(false));
  afterEach(() => resetHealth(false));

  it('adds timings and failures up in memory and writes them as sums', async () => {
    await db.exec('delete from public.health_daily');
    const ok = timed('game-test', async () => new Response('ok'));
    const bad = timed('game-test', async () => new Response('no', { status: 500 }));
    await ok(new Request(HOST));
    await ok(new Request(HOST));
    await bad(new Request(HOST));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logFailure({ route: 'game-test', reason: 'game_route_failed' }, new Error('x'));
    err.mockRestore();
    noteHealth('save_conflict', 'farm-store', 'version_changed');
    noteHealth('route', 'Weird Route!', 'Not A Code', 5);
    expect(pendingHealth().length).toBe(5);
    await flushHealth(sql);
    await flushHealth(sql);
    expect(pendingHealth()).toEqual([]);
    const rows = await db.query<{ kind: string; route: string; reason: string; count: number }>(
      `select kind, route, reason, count::int as count from public.health_daily order by kind, route, reason`,
    );
    expect(rows.rows).toEqual([
      { kind: 'failure', route: 'game-test', reason: 'game_route_failed', count: 1 },
      { kind: 'failure', route: 'game-test', reason: 'status_5xx', count: 1 },
      { kind: 'route', route: 'game-test', reason: '', count: 3 },
      { kind: 'route', route: 'weird_route_', reason: 'other', count: 1 },
      { kind: 'save_conflict', route: 'farm-store', reason: 'version_changed', count: 1 },
    ]);
    noteHealth('route', 'game-test', '', 7);
    await flushHealth(sql);
    const again = await db.query<{ count: number }>(
      `select count::int as count from public.health_daily where kind = 'route' and route = 'game-test'`,
    );
    expect(again.rows[0]!.count).toBe(4);
    expect(cleanRoute('9x')).toBe('r9x');
  });
});
