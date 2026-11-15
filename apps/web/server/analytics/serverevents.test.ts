import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_COOKIE } from '@gg/shared';
import { freshDb } from '../../../../packages/db/src/harness';
import { pgliteSql } from '../test-support/pgliteSql';
import { FakeAuth } from '../test-support/fakeAuth';
import { FakePayments } from '../test-support/fakePayments';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { setGameServer, type GameServer } from '../game/game';
import { setPaymentsProvider } from '../billing/payments';
import type { SqlClient } from '../db/sql';
import { endedDays } from './collect';

/*
 * The server-side analytics events wired at the m7 join: signup, login, farm_ended and
 * checkout_started. Each goes through its real route, and each is counted only with consent and
 * the analytics switch on.
 */

const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';
type Handler = (req: Request) => Promise<Response>;

let db: PGlite;
let sql: SqlClient;
let auth: FakeAuth;
let ip = 0;
const routes: Record<string, Handler> = {};

beforeAll(async () => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  db = await freshDb({ seed: false });
  sql = pgliteSql(db);
  routes.callback = (await import('@/app/auth/callback/route')).GET;
  routes.finish = (await import('@/app/api/auth/finish/route')).POST;
  routes.checkout = (await import('@/app/api/billing/checkout/route')).POST;
  routes.day = (await import('@/app/api/game/day/route')).POST;
  routes.skip = (await import('@/app/api/game/skip/route')).POST;
}, 120_000);
afterAll(async () => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
  setGameServer(undefined);
  setPaymentsProvider(undefined);
  await db?.close();
});

beforeEach(async () => {
  await db.exec(
    `delete from public.analytics_daily; delete from public.analytics_consent;
     delete from public.purchases; delete from public.farms; delete from auth.users;
     update public.feature_switches set enabled = true where key in ('analytics', 'signups_open', 'purchases');
     update public.products set active = true where id = 'farm_pack';`,
  );
  resetRateLimits();
  resetSwitchCache();
  auth = new FakeAuth(db);
  const deps: AuthDeps = { provider: auth, sql, pepper: PEPPER };
  setAuthDeps(deps);
  setPaymentsProvider(new FakePayments());
  ip++;
});

const counted = async (event: string) =>
  (
    await db.query<{ props: string; count: number }>(
      'select props, count::int as count from public.analytics_daily where event = $1',
      [event],
    )
  ).rows;

async function adult(key: string, consent: boolean): Promise<{ id: string; cookie: string }> {
  const { user, cookie } = await auth.signInAs(`${key}@example.test`, 'google');
  await db.query('insert into public.profiles (user_id, username) values ($1, $2)', [
    user.id,
    `u_${key}`,
  ]);
  await db.query(
    `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
     values ($1, '1985-06-15', now())`,
    [user.id],
  );
  await db.query('insert into public.account_status (user_id) values ($1)', [user.id]);
  if (consent) {
    await db.query('insert into public.analytics_consent (user_id, granted) values ($1, true)', [
      user.id,
    ]);
  }
  return { id: user.id, cookie };
}

function request(path: string, method: 'GET' | 'POST', cookie: string, body?: unknown): Request {
  return new Request(`${HOST}${path}`, {
    method,
    headers: {
      host: 'localhost:3000',
      origin: HOST,
      'x-real-ip': `10.9.0.${ip}`,
      cookie,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('server-side analytics events (m7 join)', () => {
  it('login: counted with its method when the player said yes, not otherwise', async () => {
    for (const [key, consent] of [
      ['lia', true],
      ['lou', false],
    ] as const) {
      await adult(key, consent);
      const jar = {
        getAll: () => [{ name: 'fake_verifier', value: 'google:v1' }],
        setAll: () => undefined,
      };
      const code = auth.googleReturn(jar as never, `${key}@example.test`);
      const res = await routes.callback!(
        request(`/auth/callback?code=${code}&next=/play`, 'GET', 'fake_verifier=google:v1'),
      );
      expect(res.status).toBe(303);
    }
    expect(await counted('login')).toEqual([{ props: 'method=google', count: 1 }]);
    await db.query(`update public.feature_switches set enabled = false where key = 'analytics'`);
    resetSwitchCache();
    expect(await counted('login')).toHaveLength(1);
  });

  it('signup: decided by the choice made as a guest, and counted only here', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const [key, cookieChoice] of [
      ['sam', 'y'],
      ['sue', 'n'],
    ] as const) {
      const { cookie } = await auth.signInAs(`${key}@example.test`);
      const res = await routes.finish!(
        request('/api/auth/finish', 'POST', `${cookie}; ${CONSENT_COOKIE}=${cookieChoice}`, {
          username: `u_${key}`,
          dob: '1990-02-03',
        }),
      );
      expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    }
    expect(await counted('signup')).toEqual([{ props: '', count: 1 }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('checkout_started: counted when a checkout is made for a player who said yes', async () => {
    const yes = await adult('cat', true);
    const no = await adult('col', false);
    for (const who of [yes, no]) {
      const res = await routes.checkout!(
        request('/api/billing/checkout', 'POST', who.cookie, { product: 'farm_pack' }),
      );
      expect(res.status).toBe(200);
    }
    expect(await counted('checkout_started')).toEqual([{ props: '', count: 1 }]);
  });

  it('farm_ended: counted when Next day or a skip ends the game, the days go to PostHog only, not into the counts', async () => {
    const who = await adult('fay', true);
    const ended = { ok: true, snapshot: { over: 'The bank has taken the farm.', day: 412 } };
    const going = { ok: true, snapshot: { over: null, day: 413 } };
    let answer: unknown = going;
    setGameServer({
      sessionUsable: async () => true,
      // One account farm, so the player is signed up with a farm to play.
      farms: async () => [{ id: 'a'.repeat(32) }],
      endDay: async () => answer,
      skip: async () => answer,
    } as unknown as GameServer);
    const day = () =>
      routes.day!(request('/api/game/day', 'POST', who.cookie, { version: 'abcdef0123456789' }));
    const skip = () =>
      routes.skip!(
        request('/api/game/skip', 'POST', who.cookie, {
          length: 'week',
          version: 'abcdef0123456789',
        }),
      );
    expect((await day()).status).toBe(200);
    expect(await counted('farm_ended')).toEqual([]);
    answer = ended;
    expect((await day()).status).toBe(200);
    expect((await skip()).status).toBe(200);
    expect(await counted('farm_ended')).toEqual([{ props: 'mode=fast', count: 2 }]);
    setGameServer(undefined);
  });

  it('endedDays reads only an answer that ended the game', () => {
    expect(endedDays({ ok: true, snapshot: { over: 'x', day: 5 } })).toBe(5);
    expect(endedDays({ ok: true, snapshot: { over: null, day: 5 } })).toBeNull();
    expect(endedDays({ ok: false, reason: 'stale', snapshot: { over: 'x', day: 5 } })).toBeNull();
    expect(endedDays(null)).toBeNull();
  });
});
