import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimits } from '../game/http';
import { setGameServer } from '../game/game';
import { setAuthDeps } from './deps';

/*
 * Accounts not set up must answer cleanly in production: a 200 "not set up" for /me, a plain
 * refusal for every other auth and account route, never a 5xx. Found by running the production
 * build with no keys: /api/auth/me answered 500 on every page load. These tests use the real
 * environment-driven settings (no test override) with NODE_ENV=production.
 */

type Handler = (req: Request) => Promise<Response>;
type Mod = { GET?: Handler; POST?: Handler; DELETE?: Handler };
const routes: Record<string, Mod> = {};
const dir = mkdtempSync(join(tmpdir(), 'gg-off-'));

beforeAll(async () => {
  process.env.GG_FARMS_DIR = dir;
  routes.email = await import('@/app/api/auth/email/route');
  routes.google = await import('@/app/api/auth/google/route');
  routes.callback = await import('@/app/auth/callback/route');
  routes.me = await import('@/app/api/auth/me/route');
  routes.username = await import('@/app/api/auth/username/route');
  routes.finish = await import('@/app/api/auth/finish/route');
  routes.signout = await import('@/app/api/auth/signout/route');
  routes.data = await import('@/app/api/account/data/route');
  routes.delete = await import('@/app/api/account/delete/route');
  routes.farm = await import('@/app/api/game/farm/route');
  routes.farms = await import('@/app/api/game/farms/route');
});
afterAll(() => {
  setAuthDeps(undefined);
  setGameServer(undefined);
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  resetRateLimits();
  setAuthDeps(undefined);
  setGameServer(undefined);
  vi.stubEnv('NODE_ENV', 'production');
  for (const k of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_DB_POOLER_URL',
    'BAN_HASH_PEPPER',
    'GG_TRUSTED_IP_HEADER',
    'GG_SITE_URL',
  ]) {
    vi.stubEnv(k, '');
  }
});
afterEach(() => vi.unstubAllEnvs());

const ALL_KEYS = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk',
  SUPABASE_SECRET_KEY: 'sk',
  SUPABASE_DB_POOLER_URL: 'postgres://u:p@localhost:6543/postgres',
  BAN_HASH_PEPPER: 'p'.repeat(40),
};

const call = (route: string, method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) =>
  routes[route]![method]!(
    new Request(`http://localhost:3000${path}`, {
      method,
      headers: {
        host: 'localhost:3000',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

const NOT_SET_UP = 'Sign-in is not set up on this copy of the game yet.';

/** Every auth and account route, with what it must say when accounts are off. */
const CASES: [string, () => Promise<Response>, number][] = [
  [
    '/api/auth/email',
    () => call('email', 'POST', '/api/auth/email', { email: 'a@example.test' }),
    404,
  ],
  ['/api/auth/google', () => call('google', 'POST', '/api/auth/google', {}), 404],
  ['/auth/callback', () => call('callback', 'GET', '/auth/callback?code=x'), 404],
  [
    '/api/auth/username',
    () => call('username', 'POST', '/api/auth/username', { name: 'abc' }),
    404,
  ],
  ['/api/auth/finish', () => call('finish', 'POST', '/api/auth/finish', {}), 404],
  ['/api/auth/signout', () => call('signout', 'POST', '/api/auth/signout', {}), 404],
  ['/api/account/data', () => call('data', 'GET', '/api/account/data'), 404],
  ['/api/account/delete', () => call('delete', 'POST', '/api/account/delete', {}), 404],
];

const checkAll = async (): Promise<void> => {
  const me = await call('me', 'GET', '/api/auth/me');
  expect(me.status).toBe(200);
  expect(await me.json()).toMatchObject({ accounts: false, signedIn: false, interestAds: true });
  for (const [name, run, status] of CASES) {
    const res = await run();
    expect(res.status, name).toBe(status);
    expect(res.status, name).toBeLessThan(600);
    expect((await res.json()).error, name).toBe(NOT_SET_UP);
  }
  // The game carries on as a guest.
  expect((await call('farm', 'GET', '/api/game/farm')).status).toBe(200);
  expect(await (await call('farms', 'GET', '/api/game/farms')).json()).toMatchObject({
    signedIn: false,
  });
};

describe('accounts not set up, in production', () => {
  it('with no keys at all every auth and account route answers cleanly, and /me says not set up', async () => {
    await checkAll();
  });

  it('with some keys but not all, accounts fail closed with no 5xx', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ALL_KEYS.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      ALL_KEYS.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    await checkAll();
    setAuthDeps(undefined);
    vi.stubEnv('SUPABASE_SECRET_KEY', ALL_KEYS.SUPABASE_SECRET_KEY);
    vi.stubEnv('BAN_HASH_PEPPER', ALL_KEYS.BAN_HASH_PEPPER);
    await checkAll();
  });

  it('with every key but no trusted header or site address, accounts stay off with no 5xx', async () => {
    for (const [k, v] of Object.entries(ALL_KEYS)) vi.stubEnv(k, v);
    await checkAll();
    setAuthDeps(undefined);
    vi.stubEnv('GG_TRUSTED_IP_HEADER', 'x-real-ip');
    await checkAll();
  });
});
