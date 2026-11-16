import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { DbFarmStore } from '../db/dbstore';
import { GameServer, setGameServer } from '../game/game';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { FakeAuth } from '../test-support/fakeAuth';
import { pgliteSql } from '../test-support/pgliteSql';

/*
 * Launch check (m5.5), flows 2 and 7: a guest becomes an account and takes the farm along, and an
 * account downloads its data and then deletes itself. Every step goes through the real route
 * handlers, with PGlite and the fake sign-in provider (the same set-up as auth/flows.test.ts).
 */

const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';
type Handler = (req: Request) => Promise<Response>;
type Mod = { GET?: Handler; POST?: Handler; DELETE?: Handler };
const routes: Record<string, Mod> = {};

let db: PGlite;
let auth: FakeAuth;
let ip = 0;

beforeAll(async () => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  db = await freshDb({ seed: false });
  routes.email = (await import('@/app/api/auth/email/route')) as Mod;
  routes.callback = (await import('@/app/auth/callback/route')) as Mod;
  routes.finish = (await import('@/app/api/auth/finish/route')) as Mod;
  routes.me = (await import('@/app/api/auth/me/route')) as Mod;
  routes.data = (await import('@/app/api/account/data/route')) as Mod;
  routes.delete = (await import('@/app/api/account/delete/route')) as Mod;
  routes.farm = (await import('@/app/api/game/farm/route')) as Mod;
  routes.day = (await import('@/app/api/game/day/route')) as Mod;
  routes.post = (await import('@/app/api/community/post/route')) as Mod;
}, 120_000);
afterAll(async () => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
  setGameServer(undefined);
  await db?.close();
});

beforeEach(async () => {
  await db.exec(
    `delete from public.farms; delete from public.guest_sessions; delete from auth.users;
     update public.feature_switches set enabled = true where key = 'signups_open';
     update public.feature_switches set enabled = false where key in ('community', 'feed_posts');`,
  );
  resetRateLimits();
  resetSwitchCache();
  auth = new FakeAuth(db);
  const deps: AuthDeps = { provider: auth, sql: pgliteSql(db), pepper: PEPPER };
  setAuthDeps(deps);
  setGameServer(
    new GameServer({ store: new DbFarmStore(deps.sql), seed: () => 3, saveRetryMs: [0, 0] }),
  );
  ip++;
});

/** A browser with its own cookie jar and address. */
class Browser {
  cookies = new Map<string, string>();
  constructor(readonly address = `10.55.0.${ip}`) {}
  eat(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq);
      const value = pair!.slice(eq + 1);
      if (value === '' || attrs.some((a) => /max-age=0/i.test(a))) this.cookies.delete(name);
      else this.cookies.set(name, decodeURIComponent(value));
    }
  }
  async call(route: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) {
    const req = new Request(`${HOST}${path}`, {
      method,
      headers: {
        host: 'localhost:3000',
        'x-real-ip': this.address,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.cookies.size
          ? {
              cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
            }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await routes[route]![method]!(req);
    this.eat(res);
    return res;
  }
}

const choices = {
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'scratch',
  difficulty: 'medium',
  name: 'Launch Account',
};

/** Ask for the emailed link, open it, and finish sign-up, as a person would. */
async function signUp(b: Browser, email: string, username: string) {
  expect((await b.call('email', 'POST', '/api/auth/email', { email })).status).toBe(200);
  const link = auth.sent[auth.sent.length - 1]!;
  expect(link.email).toBe(email);
  const url = new URL(link.redirectTo);
  url.searchParams.set('code', link.code);
  const back = await b.call('callback', 'GET', `${url.pathname}${url.search}`);
  expect(back.status).toBe(303);
  expect(b.cookies.has('fake_session')).toBe(true);
  const res = await b.call('finish', 'POST', '/api/auth/finish', { username, dob: '1985-06-15' });
  expect(res.status).toBe(200);
  return (await res.json()) as { ok: boolean; moved?: number; noRoom?: boolean };
}

const count = async (sql: string, params: unknown[] = []): Promise<number> =>
  (await db.query(sql, params)).rows.length;

describe('launch flow 2: a guest becomes an account', () => {
  it('the guest farm moves into the account with its days, and the old guest cookie reaches nothing', async () => {
    const b = new Browser();
    const made = await b.call('farm', 'POST', '/api/game/farm', choices);
    expect(made.status).toBe(200);
    const start = ((await made.json()) as { snapshot: { farmVersion: string; day: number } })
      .snapshot;
    const guestCookie = b.cookies.get('gg_session');
    expect(guestCookie).toMatch(/^[0-9a-f]{32}$/);
    const day = await b.call('day', 'POST', '/api/game/day', { version: start.farmVersion });
    expect(day.status).toBe(200);
    expect(((await day.json()) as { snapshot: { day: number } }).snapshot.day).toBe(1);
    expect(
      await count(
        'select 1 from public.farms where owner_id is null and guest_session_id is not null',
      ),
    ).toBe(1);

    const out = await signUp(b, 'launch.convert@example.test', 'launch_convert');
    expect(out).toMatchObject({ ok: true, moved: 1, noRoom: false });
    expect(b.cookies.has('gg_session')).toBe(false);

    // The account sees its farm, still on day 1.
    const me = (await (await b.call('me', 'GET', '/api/auth/me')).json()) as {
      signedIn?: boolean;
      username?: string | null;
    };
    expect(JSON.stringify(me)).toContain('launch_convert');
    const farm = (await (await b.call('farm', 'GET', '/api/game/farm')).json()) as {
      snapshot: { day: number; farm: { name: string } } | null;
    };
    expect(farm.snapshot).toMatchObject({ day: 1, farm: { name: 'Launch Account' } });
    expect(
      await count(
        'select 1 from public.farms where owner_id is not null and guest_session_id is null',
      ),
    ).toBe(1);

    // Someone holding a copy of the old guest cookie gets nothing, and can not move the farm on.
    const thief = new Browser('10.56.0.9');
    thief.cookies.set('gg_session', guestCookie!);
    const seen = (await (await thief.call('farm', 'GET', '/api/game/farm')).json()) as {
      snapshot: unknown;
    };
    expect(seen.snapshot).toBeNull();
    expect(
      (await thief.call('day', 'POST', '/api/game/day', { version: start.farmVersion })).status,
    ).toBe(404);
    const row = await db.query<{ current_day: number }>('select current_day from public.farms');
    expect(row.rows.map((r) => r.current_day)).toEqual([1]);
  }, 180_000);
});

describe('launch flow 7: download my data, then delete my account', () => {
  it('the download holds the profile, the farm and the post; after delete none of them is left', async () => {
    await db.exec(
      `update public.feature_switches set enabled = true where key in ('community', 'feed_posts');`,
    );
    resetSwitchCache();
    const b = new Browser();
    expect(await signUp(b, 'launch.leaver@example.test', 'launch_leaver')).toMatchObject({
      ok: true,
    });
    const userId = (
      await db.query<{ id: string }>(`select id from auth.users where email = $1`, [
        'launch.leaver@example.test',
      ])
    ).rows[0]!.id;
    expect((await b.call('farm', 'POST', '/api/game/farm', choices)).status).toBe(200);
    const posted = await b.call('post', 'POST', '/api/community/post', {
      action: 'create',
      body: 'Rain at last on the back paddock',
    });
    expect(posted.status).toBe(200);
    expect(await count('select 1 from public.posts where author_id = $1', [userId])).toBe(1);

    // Download my data.
    const data = await b.call('data', 'GET', '/api/account/data');
    expect(data.status).toBe(200);
    expect(data.headers.get('content-disposition')).toMatch(/attachment/);
    const text = await data.text();
    expect(text).toContain('launch_leaver');
    expect(text).toContain('Launch Account');
    expect(text).toContain('Rain at last on the back paddock');
    expect(text).not.toMatch(/"saved"|engineVersion/);

    // Delete: the username must be typed exactly.
    expect(
      (await b.call('delete', 'POST', '/api/account/delete', { confirm: 'launch' })).status,
    ).toBe(400);
    expect(await count('select 1 from auth.users where id = $1', [userId])).toBe(1);
    const gone = await b.call('delete', 'POST', '/api/account/delete', {
      confirm: 'launch_leaver',
    });
    expect(gone.status).toBe(200);
    expect(b.cookies.has('fake_session')).toBe(false);
    expect(await count('select 1 from auth.users where id = $1', [userId])).toBe(0);
    expect(await count('select 1 from public.profiles where user_id = $1', [userId])).toBe(0);
    expect(await count('select 1 from public.farms where owner_id = $1', [userId])).toBe(0);
    expect(await count('select 1 from public.farm_saves')).toBe(0);
    expect(await count('select 1 from public.posts where author_id = $1', [userId])).toBe(0);
    expect(await count(`select 1 from public.posts where body like 'Rain at last%'`)).toBe(0);

    // Signed out now: the download has nothing to give.
    expect((await b.call('data', 'GET', '/api/account/data')).status).toBe(401);
  }, 180_000);
});
