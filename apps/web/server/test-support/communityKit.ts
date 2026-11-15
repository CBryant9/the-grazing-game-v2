import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { GameServer, setGameServer } from '../game/game';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { DbFarmStore } from '../db/dbstore';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { setPhotoDeps } from '../community/photos';
import { pgliteSql } from './pgliteSql';
import { FakeAuth } from './fakeAuth';
import { FakeCheck, FakeStorage } from './fakePhotos';

/**
 * The shared set-up for the Stage 4 community tests (PGlite with every migration, the fake sign-in
 * provider, a fake Storage and image check, and a game server on the database store). Call
 * `communityKit()` at the top level of a test file: it registers its own hooks. Each test starts
 * with no accounts, no farms, the switches named in `switches` on and every other community switch off.
 */
export interface Person {
  id: string;
  cookie: string;
  username: string;
}

export interface PersonOptions {
  role?: 'player' | 'moderator' | 'admin';
  ageYears?: number;
  suspended?: boolean;
  banned?: boolean;
  profile?: boolean;
  privacy?: 'public' | 'followers' | 'private';
  farmView?: 'public' | 'followers' | 'off';
  ticker?: boolean;
}

export const COMMUNITY_KEYS = [
  'community',
  'feed_posts',
  'groups',
  'activity_ticker',
  'farm_viewing',
  'leaderboards',
] as const;

export const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
export const HOST = 'http://localhost:3000';

type Handler = (req: Request) => Promise<Response>;
export type RouteModule = { GET?: Handler; POST?: Handler };

export interface Kit {
  db: PGlite;
  auth: FakeAuth;
  deps: AuthDeps;
  storage: FakeStorage;
  check: FakeCheck;
  people: Record<string, Person>;
  person(key: string, opts?: PersonOptions): Promise<Person>;
  setSwitch(key: string, on: boolean): Promise<void>;
  /** A farm made through the game's own route, as the player. Returns its database id. */
  farmFor(who: Person, choices?: Record<string, unknown>): Promise<string>;
  call(
    mod: RouteModule,
    path: string,
    method: 'GET' | 'POST',
    who: Person | null,
    body?: unknown,
    opts?: { headers?: Record<string, string>; address?: string },
  ): Promise<Response>;
}

export function communityKit(
  switches: readonly string[] = ['community', 'feed_posts'],
  options: { gameServer?: boolean } = {},
): Kit {
  let ip = 0;
  const kit = { people: {} } as Kit;
  beforeAll(async () => {
    process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
    kit.db = await freshDb({ seed: false });
  }, 120_000);
  afterAll(async () => {
    delete process.env[TRUSTED_IP_HEADER_ENV];
    setAuthDeps(undefined);
    setPhotoDeps(undefined);
    setGameServer(undefined);
    await kit.db?.close();
  });
  beforeEach(async () => {
    const keys = COMMUNITY_KEYS.map((k) => `'${k}'`).join(',');
    const on = switches.map((k) => `'${k}'`).join(',') || `''`;
    await kit.db.exec(
      `delete from public.reports;
       truncate public.admin_audit_log;
       update public.account_status set banned_at = null, suspended_until = null;
       delete from storage.objects; delete from public.word_filter;
       delete from public.leaderboard_entries; delete from public.challenges;
       delete from public.farms; delete from public.guest_sessions; delete from auth.users;
       truncate public.rate_limit_hits;
       update public.feature_switches set enabled = false where key in (${keys});
       update public.feature_switches set enabled = true where key in (${on});`,
    );
    resetRateLimits();
    resetSwitchCache();
    kit.auth = new FakeAuth(kit.db);
    kit.deps = { provider: kit.auth, sql: pgliteSql(kit.db), pepper: PEPPER };
    setAuthDeps(kit.deps);
    kit.storage = new FakeStorage(kit.db);
    kit.check = new FakeCheck();
    setPhotoDeps({ storage: kit.storage, check: kit.check });
    if (options.gameServer !== false) {
      setGameServer(
        new GameServer({
          store: new DbFarmStore(kit.deps.sql),
          seed: () => 3,
          saveRetryMs: [0, 0],
        }),
      );
    }
    kit.people = {};
    ip++;
  });

  kit.person = async (key, opts = {}) => {
    const { user, cookie } = await kit.auth.signInAs(`${key}@example.test`);
    const username = key.slice(0, 20);
    if (opts.profile !== false) {
      await kit.db.query(
        `insert into public.profiles (user_id, username, privacy_profile, privacy_farm_view, ticker_opt_in)
         values ($1, $2, $3, $4, $5)`,
        [user.id, username, opts.privacy ?? 'public', opts.farmView ?? 'followers', !!opts.ticker],
      );
      await kit.db.query(
        `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
         values ($1, ((now() at time zone 'Australia/Sydney')::date - ($2 || ' years')::interval)::date, now())`,
        [user.id, String(opts.ageYears ?? 30)],
      );
      await kit.db.query(
        `insert into public.account_status (user_id, role, suspended_until, banned_at) values ($1, $2, $3, $4)`,
        [
          user.id,
          opts.role ?? 'player',
          opts.suspended ? new Date(Date.now() + 86_400_000).toISOString() : null,
          opts.banned ? new Date().toISOString() : null,
        ],
      );
    }
    const p = { id: user.id, cookie, username };
    kit.people[key] = p;
    return p;
  };

  kit.setSwitch = async (key, on) => {
    await kit.db.query('update public.feature_switches set enabled = $2 where key = $1', [key, on]);
    resetSwitchCache();
  };

  kit.farmFor = async (who, choices = {}) => {
    const route = (await import('@/app/api/game/farm/route')) as RouteModule;
    const res = await kit.call(route, '/api/game/farm', 'POST', who, {
      district: 'wv',
      size: 'small',
      enterprise: 'grazing',
      years: 'random',
      startType: 'scratch',
      difficulty: 'medium',
      name: 'Kit Farm',
      ...choices,
    });
    if (res.status !== 200) throw new Error(`farm not made: ${await res.text()}`);
    const r = await kit.db.query<{ id: string }>(
      'select id from public.farms where owner_id = $1 order by created_at desc limit 1',
      [who.id],
    );
    return r.rows[0]!.id;
  };

  kit.call = async (mod, path, method, who, body, opts = {}) => {
    const req = new Request(`${HOST}${path}`, {
      method,
      headers: {
        host: 'localhost:3000',
        'x-real-ip': opts.address ?? `10.4.${ip % 250}.${(ip * 7) % 250}`,
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        ...(who ? { cookie: who.cookie } : {}),
        ...opts.headers,
      },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
    });
    const handler = mod[method];
    if (!handler) return new Response(null, { status: 405 });
    return handler(req);
  };

  return kit;
}

/** The cookie a page test hands to its `next/headers` mock. */
export const cookieList = (cookie: string): { name: string; value: string }[] =>
  cookie
    ? cookie.split('; ').map((c) => ({ name: c.split('=')[0]!, value: c.split('=')[1]! }))
    : [];
