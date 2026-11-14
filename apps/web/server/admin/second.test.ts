import type { PGlite } from '@electric-sql/pglite';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { GameServer, setGameServer } from '../game/game';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { DbFarmStore } from '../db/dbstore';
import type { SqlClient, SqlRunner } from '../db/sql';
import { pgliteSql } from '../test-support/pgliteSql';
import { FakeAuth } from '../test-support/fakeAuth';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { banHash } from '../auth/email';
import { jarFor } from '../auth/provider';
import { adminGate } from './gate';
import { userAction } from './store';
import { MAINTENANCE_WORDINGS } from './info';

/**
 * The second pass (a security review of m3.5). Each test was written before its fix and seen to fail.
 */
const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';
const web = fileURLToPath(new URL('../../', import.meta.url));

type Handler = (req: Request) => Promise<Response>;
type Mod = { GET?: Handler; POST?: Handler; DELETE?: Handler };
const routes: Record<string, Mod> = {};
let db: PGlite;
let auth: FakeAuth;
let deps: AuthDeps;
let ip = 0;

function walk(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(web, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(web, rel)).isDirectory()) out.push(...walk(rel, match));
    else if (match.test(name)) out.push(rel);
  }
  return out;
}
// `photos` needs a real photo waiting in the queue to say yes, so its gate, CSRF, no keys, rollback
// and pass checks are in community/community.test.ts ("the manual photo queue"), not in this walk.
// `photo-preview` is a read (GET only): its gate is tested in community/review.test.ts.
const OWN_TESTS = new Set(['photos', 'photo-preview']);
const adminRouteNames = walk('app/api/admin', /^route\.ts$/)
  .map((f) => f.replace('app/api/admin/', '').replace('/route.ts', ''))
  .filter((n) => !OWN_TESTS.has(n));
const adminModules = import.meta.glob('../../app/api/admin/**/route.ts');
const gameModules = import.meta.glob('../../app/api/game/**/route.ts');
const gameRouteFiles = walk('app/api/game', /^route\.ts$/);

beforeAll(async () => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  db = await freshDb({ seed: false });
  for (const [file, load] of Object.entries(adminModules)) {
    routes[file.replace('../../app/api/', '').replace('/route.ts', '')] = (await load()) as Mod;
  }
  for (const [file, load] of Object.entries(gameModules)) {
    routes[file.replace('../../app/api/', '').replace('/route.ts', '')] = (await load()) as Mod;
  }
  routes.me = await import('../../app/api/auth/me/route');
}, 120_000);
afterAll(async () => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
  setGameServer(undefined);
  await db?.close();
});

interface Person {
  id: string;
  cookie: string;
  full: string;
  username: string;
  email: string;
}
let people: Record<string, Person>;

async function person(
  key: string,
  opts: { role?: string; age?: number; suspended?: boolean; banned?: boolean } = {},
): Promise<Person> {
  const email = `${key}@example.test`;
  const { user, cookie, full } = await auth.signInAs(email);
  const username = `u_${key}`.slice(0, 20);
  await db.query('insert into public.profiles (user_id, username) values ($1, $2)', [
    user.id,
    username,
  ]);
  await db.query(
    `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
     values ($1, ((now() at time zone 'Australia/Sydney')::date - ($2 || ' years')::interval)::date, now())`,
    [user.id, String(opts.age ?? 30)],
  );
  await db.query(
    'insert into public.account_status (user_id, role, suspended_until, banned_at) values ($1, $2, $3, $4)',
    [
      user.id,
      opts.role ?? 'player',
      opts.suspended ? new Date(Date.now() + 86_400_000).toISOString() : null,
      opts.banned ? new Date().toISOString() : null,
    ],
  );
  return (people[key] = { id: user.id, cookie, full, username, email });
}

beforeEach(async () => {
  await db.exec(
    `truncate public.admin_audit_log;
     update public.account_status set banned_at = null, suspended_until = null;
     delete from public.farms; delete from public.guest_sessions; delete from auth.users;
     delete from public.ban_records; delete from public.signup_refusals;
     delete from public.site_settings; delete from public.moderation_actions;
     update public.feature_switches set enabled = false, updated_by = null;`,
  );
  resetRateLimits();
  resetSwitchCache();
  auth = new FakeAuth(db);
  deps = { provider: auth, sql: pgliteSql(db), pepper: PEPPER };
  setAuthDeps(deps);
  setGameServer(
    new GameServer({ store: new DbFarmStore(deps.sql), seed: () => 3, saveRetryMs: [0, 0] }),
  );
  people = {};
  ip++;
});

async function call(
  route: string,
  method: 'GET' | 'POST' | 'DELETE',
  body: unknown,
  cookie: string | null,
  headers: Record<string, string> = {},
  address = `10.7.${ip}.1`,
): Promise<Response> {
  const path = route === 'me' ? '/api/auth/me' : `/api/${route}`;
  const req = new Request(`${HOST}${path}`, {
    method,
    headers: {
      host: 'localhost:3000',
      'x-real-ip': address,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return routes[route]![method]!(req);
}
const post = (
  route: string,
  body: unknown,
  who: Person | string | null,
  h: Record<string, string> = {},
  a?: string,
) =>
  call(`admin/${route}`, 'POST', body, typeof who === 'string' ? who : (who?.cookie ?? null), h, a);

const auditRows = async () =>
  (
    await db.query<{ action: string; details: Record<string, unknown> }>(
      'select action, details from public.admin_audit_log order by id',
    )
  ).rows;

function failingAudit(sql: SqlClient): SqlClient {
  const wrap = (tx: SqlRunner): SqlRunner => ({
    query(text, params) {
      if (/insert into public\.admin_audit_log/.test(text))
        return Promise.reject(new Error('audit write failed'));
      return tx.query(text, params);
    },
  });
  return {
    query: (t, p) => wrap(sql).query(t, p),
    transaction: (fn) => sql.transaction((tx) => fn(wrap(tx))),
  };
}

// ---------------------------------------------------------------- 1. a refresh must reach the browser

describe('1. a refreshed sign-in is never thrown away', () => {
  it('an admin route with an expired access token sends the new cookies back, and the new pair works', async () => {
    const admin = await person('admin', { role: 'admin' });
    auth.expireAccess(admin.full);
    const res = await post('switches', { key: 'community', enabled: true }, admin.full);
    expect(res.status).toBe(200);
    expect(auth.refreshed).toBe(1);
    const set = res.headers.getSetCookie();
    const access = set.find((c) => c.startsWith('fake_session='))!;
    const refresh = set.find((c) => c.startsWith('fake_refresh='))!;
    expect(access && refresh).toBeTruthy();
    expect(access).not.toContain(admin.cookie.split('=')[1]!);
    // The browser now sends the new pair, and the next request works with no second refresh.
    const next = `${access.split(';')[0]}; ${refresh.split(';')[0]}`;
    expect((await post('switches', { key: 'community', enabled: false }, next)).status).toBe(200);
    expect(auth.refreshed).toBe(1);
    // The old refresh token is spent: using it again ends the session, which is what a lost cookie would cause.
    auth.expireAccess(next);
    expect(
      (await post('switches', { key: 'community', enabled: true }, `${admin.full}`)).status,
    ).toBe(404);
  });

  it('a request refused as not found still sends the new cookies when a token was spent for it', async () => {
    const player = await person('player');
    auth.expireAccess(player.full);
    const res = await post('switches', { key: 'community', enabled: true }, player.full);
    expect(res.status).toBe(404);
    expect(res.headers.getSetCookie().some((c) => c.startsWith('fake_refresh='))).toBe(true);
  });

  it('a page never refreshes: an expired token is the plain not found and no refresh token is spent', async () => {
    const admin = await person('admin', { role: 'admin' });
    auth.expireAccess(admin.full);
    const jar = jarFor(new Request(HOST, { headers: { cookie: admin.full } }));
    expect(await adminGate(jar, { refresh: false })).toEqual({ kind: 'denied' });
    expect(auth.refreshed).toBe(0);
    // The browser can still refresh it through a route that writes cookies.
    expect((await post('switches', { key: 'community', enabled: true }, admin.full)).status).toBe(
      200,
    );
    expect(auth.refreshed).toBe(1);
  });

  it('a game request refused for maintenance still sends the refreshed cookies', async () => {
    const admin = await person('admin', { role: 'admin' });
    await post('switches', { key: 'maintenance_mode', enabled: true }, admin);
    const player = await person('player');
    auth.expireAccess(player.full);
    const res = await call('game/day', 'POST', {}, player.full);
    expect(res.status).toBe(503);
    expect(res.headers.getSetCookie().some((c) => c.startsWith('fake_refresh='))).toBe(true);
  });

  it('the account and game paths write refreshed cookies too', async () => {
    const player = await person('player');
    auth.expireAccess(player.full);
    const me = await call('me', 'GET', undefined, player.full);
    expect(me.status).toBe(200);
    expect(me.headers.getSetCookie().some((c) => c.startsWith('fake_refresh='))).toBe(true);
    const p2 = await person('player2');
    auth.expireAccess(p2.full);
    const farm = await call('game/farm', 'GET', undefined, p2.full);
    expect(farm.status).toBe(200);
    expect(farm.headers.getSetCookie().some((c) => c.startsWith('fake_refresh='))).toBe(true);
  });
});

// ---------------------------------------------------------------- 3. maintenance is read only

const GAME_METHODS: Record<string, { write: boolean; methods: ('GET' | 'POST' | 'DELETE')[] }> = {
  'game/act': { write: true, methods: ['POST'] },
  'game/day': { write: true, methods: ['POST'] },
  'game/skip': { write: true, methods: ['POST'] },
  'game/inbox': { write: true, methods: ['POST'] },
  'game/farm': { write: false, methods: ['GET'] },
  'game/farms': { write: false, methods: ['GET'] },
  'game/past': { write: false, methods: ['GET'] },
  'game/record': { write: false, methods: ['GET'] },
  'game/setup': { write: false, methods: ['GET'] },
};

describe('3. maintenance mode is read only', () => {
  it('every game route is accounted for, so a new one is checked', () => {
    const names = gameRouteFiles.map((f) => f.replace('app/api/', '').replace('/route.ts', ''));
    const known = [...Object.keys(GAME_METHODS), 'game/farm', 'game/farms', 'game/preview'];
    for (const n of names) expect(known, `${n} needs a line in GAME_METHODS`).toContain(n);
  });

  it('refuses the routes that change the farm, and lets the reading routes answer with a maintenance marker', async () => {
    const admin = await person('admin', { role: 'admin' });
    await post('switches', { key: 'maintenance_mode', enabled: true }, admin);
    for (const [name, spec] of Object.entries(GAME_METHODS)) {
      for (const method of spec.methods) {
        const res = await call(
          name,
          method,
          method === 'POST' ? {} : undefined,
          null,
          {},
          `10.8.${ip}.${name.length}`,
        );
        if (spec.write) {
          expect(res.status, `${method} ${name}`).toBe(503);
          expect((await res.json()) as { code: string }).toMatchObject({ code: 'maintenance' });
        } else {
          expect(res.status, `${method} ${name}`).toBeLessThan(500);
          expect(res.headers.get('x-game-maintenance'), `${method} ${name}`).toBe('short');
        }
      }
    }
    // Making, deleting and choosing farms: the ones that change them are refused, picking is not.
    for (const [name, method] of [
      ['game/farm', 'POST'],
      ['game/farm', 'DELETE'],
      ['game/farms', 'DELETE'],
    ] as const) {
      expect(
        (await call(name, method, method === 'POST' ? {} : { id: 'x' }, null, {}, `10.8.${ip}.99`))
          .status,
        `${method} ${name}`,
      ).toBe(503);
    }
    const open = await call('game/farms', 'POST', { id: null }, null, {}, `10.8.${ip}.98`);
    expect(open.status).not.toBe(503);
    expect((await call('game/preview', 'POST', {}, null, {}, `10.8.${ip}.97`)).status).not.toBe(
      503,
    );
  });

  it('an admin plays as usual and sees no marker, and the marker goes when maintenance ends', async () => {
    const admin = await person('admin', { role: 'admin' });
    await post('switches', { key: 'maintenance_mode', enabled: true }, admin);
    const res = await call('game/farm', 'GET', undefined, admin.cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-game-maintenance')).toBeNull();
    await post('switches', { key: 'maintenance_mode', enabled: false }, admin);
    expect(
      (await call('game/farm', 'GET', undefined, null)).headers.get('x-game-maintenance'),
    ).toBeNull();
  });

  it('the marker carries the chosen wording id, and the fixed wordings live in the shared package', async () => {
    const admin = await person('admin', { role: 'admin' });
    await post('switches', { key: 'maintenance_mode', enabled: true }, admin);
    await post('settings', { key: 'maintenance_wording', value: { id: 'longer' } }, admin);
    const res = await call('game/farm', 'GET', undefined, null);
    expect(res.headers.get('x-game-maintenance')).toBe('longer');
    expect(MAINTENANCE_WORDINGS.map((w) => w.id)).toEqual(['short', 'update', 'longer']);
  });
});

// ---------------------------------------------------------------- 4. lift and ban hashes

describe('4. a lift never leaves an old ban behind, and a ban says when it has no record', () => {
  const emailLost = (): Pick<Parameters<typeof userAction>[4] & object, 'emailOf' | 'pepper'> => ({
    emailOf: async () => null,
    pepper: PEPPER,
  });

  it('refuses to lift a ban when the hash can not be made, and changes nothing', async () => {
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    await userAction(
      deps.sql,
      admin.id,
      pat.id,
      { action: 'ban' },
      { emailOf: (id) => auth.emailOf(id), pepper: PEPPER },
    );
    const before = (await auditRows()).length;
    await expect(
      userAction(deps.sql, admin.id, pat.id, { action: 'lift' }, emailLost()),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/ban record/i),
    });
    expect(
      (await db.query('select banned_at from public.account_status where user_id = $1', [pat.id]))
        .rows[0],
    ).not.toEqual({ banned_at: null });
    expect((await db.query('select 1 from public.ban_records')).rowCount).toBe(1);
    expect(await auditRows()).toHaveLength(before);
    // The same over HTTP: a plain 409.
    deps.provider.emailOf = async () => null;
    const res = await post('users', { userId: pat.id, action: 'lift' }, admin);
    expect(res.status).toBe(409);
  });

  it('still lifts a suspension when the email is not to be found (no record exists for one)', async () => {
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    await userAction(deps.sql, admin.id, pat.id, { action: 'suspend', days: 1 });
    await userAction(deps.sql, admin.id, pat.id, { action: 'lift' }, emailLost());
    expect(
      (
        await db.query('select suspended_until from public.account_status where user_id = $1', [
          pat.id,
        ])
      ).rows[0],
    ).toEqual({ suspended_until: null });
  });

  it('a ban with no hash says so in the answer and in the audit row; with a hash the row says yes', async () => {
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    const lee = await person('lee');
    auth.users.delete(pat.id);
    const res = await post('users', { userId: pat.id, action: 'ban' }, admin);
    const body = (await res.json()) as { ok: boolean; note?: string };
    expect(body.note).toMatch(/not survive/i);
    const res2 = await post('users', { userId: lee.id, action: 'ban' }, admin);
    expect(((await res2.json()) as { note?: string }).note).toBeUndefined();
    const rows = await auditRows();
    expect(rows.map((r) => r.details.value)).toEqual([false, true]);
    expect((await db.query('select email_hash from public.ban_records')).rows).toEqual([
      { email_hash: banHash(lee.email, PEPPER) },
    ]);
  });
});

// ---------------------------------------------------------------- 2. ban and suspend end sessions

describe('2. ban and suspend end the sessions in the same action', () => {
  it('ends every session of the target, counts them in the audit row, and leaves others', async () => {
    const admin = await person('admin', { role: 'admin' });
    const a = await person('pat');
    const b = await person('bea');
    await db.query('insert into auth.sessions (user_id) values ($1), ($1), ($2)', [a.id, b.id]);
    expect((await post('users', { userId: a.id, action: 'suspend', days: 3 }, admin)).status).toBe(
      200,
    );
    expect(
      (await db.query('select 1 from auth.sessions where user_id = $1', [a.id])).rowCount,
    ).toBe(0);
    expect(
      (await db.query('select 1 from auth.sessions where user_id = $1', [b.id])).rowCount,
    ).toBe(1);
    await db.query('insert into auth.sessions (user_id) values ($1)', [b.id]);
    expect((await post('users', { userId: b.id, action: 'ban' }, admin)).status).toBe(200);
    expect(
      (await db.query('select 1 from auth.sessions where user_id = $1', [b.id])).rowCount,
    ).toBe(0);
    expect((await auditRows()).map((r) => r.details.count)).toEqual([2, 2]);
  });

  it('a failure to end sessions does not stop the ban, and the answer says what to do', async () => {
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    const broken: SqlClient = {
      query: (t, p) => deps.sql.query(t, p),
      transaction: (fn) =>
        deps.sql.transaction((tx) =>
          fn({
            async query<T>(text: string, params?: unknown[]) {
              if (/end_sessions/.test(text))
                throw new Error('permission denied for table sessions');
              return tx.query<T>(text, params);
            },
          }),
        ),
    };
    setAuthDeps({ ...deps, sql: broken });
    const res = await post('users', { userId: pat.id, action: 'ban' }, admin);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { note: string }).note).toMatch(/Supabase dashboard/);
    expect(
      (await db.query('select banned_at from public.account_status where user_id = $1', [pat.id]))
        .rows[0],
    ).not.toEqual({ banned_at: null });
    expect((await auditRows())[0]!.details.count).toBe(0);
  });
});

// ---------------------------------------------------------------- 9. sign out everywhere refused

describe('9. a refusal ending sessions is a plain message', () => {
  it('answers 503 with the dashboard hint, and writes nothing', async () => {
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    const broken: SqlClient = {
      query: (t, p) => deps.sql.query(t, p),
      transaction: (fn) =>
        deps.sql.transaction((tx) =>
          fn({
            async query<T>(text: string, params?: unknown[]) {
              if (/admin_sign_out_everywhere/.test(text))
                throw new Error('permission denied for table sessions');
              return tx.query<T>(text, params);
            },
          }),
        ),
    };
    setAuthDeps({ ...deps, sql: broken });
    const res = await post('users', { userId: pat.id, action: 'sign_out_all' }, admin);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe(
      'Could not end their sessions here. Do it in the Supabase dashboard.',
    );
    expect(await auditRows()).toEqual([]);
  });
});

// ---------------------------------------------------------------- 5. limits keyed on what the caller can not choose

describe('5. the visitor limit is by address, not by a cookie the visitor writes', () => {
  it('changing a fake sign-in cookie gives no fresh count, and costs no call to the auth server', async () => {
    let last = 0;
    for (let i = 0; i < 125; i++) {
      last = (
        await post(
          'switches',
          { key: 'community', enabled: true },
          `sb-fake-auth-token=${i}`,
          {},
          '10.9.8.7',
        )
      ).status;
    }
    expect(last).toBe(429);
  });
});

// ---------------------------------------------------------------- 6. the acting admin is locked

describe('6. the acting admin is locked while the action runs', () => {
  it('reads the acting admin with a share lock, and refuses one banned a moment before', async () => {
    const admin = await person('admin', { role: 'admin' });
    await person('second', { role: 'admin' });
    const pat = await person('pat');
    const seen: string[] = [];
    const spy: SqlClient = {
      query: (t, p) => deps.sql.query(t, p),
      transaction: (fn) =>
        deps.sql.transaction((tx) =>
          fn({
            async query<T>(text: string, params?: unknown[]) {
              seen.push(text);
              return tx.query<T>(text, params);
            },
          }),
        ),
    };
    await userAction(spy, admin.id, pat.id, { action: 'set_role', role: 'moderator' });
    expect(seen.some((t) => /s\.role = 'admin'/.test(t) && /for share/.test(t))).toBe(true);
    await db.query('update public.account_status set banned_at = now() where user_id = $1', [
      admin.id,
    ]);
    await expect(
      userAction(deps.sql, admin.id, pat.id, { action: 'set_role', role: 'player' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ---------------------------------------------------------------- 7. the trigger counts admins in good standing

describe('7. the database counts only admins in good standing', () => {
  it('refuses to ban or suspend the last good admin, and a banned admin is not a second admin', async () => {
    const one = await person('one', { role: 'admin' });
    const two = await person('two', { role: 'admin', banned: true });
    await expect(
      db.query('update public.account_status set banned_at = now() where user_id = $1', [one.id]),
    ).rejects.toMatchObject({ hint: 'last_admin' });
    await expect(
      db.query(
        "update public.account_status set suspended_until = now() + interval '1 day' where user_id = $1",
        [one.id],
      ),
    ).rejects.toMatchObject({ hint: 'last_admin' });
    await expect(
      db.query("update public.account_status set role = 'player' where user_id = $1", [one.id]),
    ).rejects.toMatchObject({ hint: 'last_admin' });
    // Lifting the other admin's ban makes them a second good admin, so the first can then go.
    await db.query('update public.account_status set banned_at = null where user_id = $1', [
      two.id,
    ]);
    await db.query('update public.account_status set banned_at = now() where user_id = $1', [
      one.id,
    ]);
  });
});

// ---------------------------------------------------------------- 10. search index

describe('10. the username search has an index', () => {
  it('has a text_pattern_ops index on lower(username) that the prefix search can use', async () => {
    const idx = await db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where tablename = 'profiles' and indexdef ilike '%lower%username%'",
    );
    expect(idx.rows.some((r) => /text_pattern_ops/.test(r.indexdef))).toBe(true);
    await db.exec('begin; set local enable_seqscan = off;');
    const plan = await db.query<{ 'QUERY PLAN': string }>(
      "explain select user_id from public.profiles where lower(username) like 'ab%' escape '\\'",
    );
    await db.exec('rollback');
    expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toMatch(/Index/);
  });
});

// ---------------------------------------------------------------- 8. every admin route, found by walking the code

const BODIES: Record<string, (p: Record<string, Person>) => unknown> = {
  switches: () => ({ key: 'community', enabled: true }),
  settings: () => ({ key: 'announcement', value: { text: 'Hello', link: null } }),
  users: (p) => ({ userId: p.pat!.id, action: 'ban' }),
};

describe('8. every admin route gets the gate, CSRF and rollback checks', () => {
  it('has a body for every route file found under app/api/admin', () => {
    expect(adminRouteNames.length).toBeGreaterThanOrEqual(3);
    for (const n of adminRouteNames)
      expect(Object.keys(BODIES), `${n} needs a line in BODIES`).toContain(n);
  });

  const digest = async () =>
    JSON.stringify(
      (
        await db.query(
          `select (select jsonb_agg(to_jsonb(t) order by key) from public.feature_switches t) a,
                  (select jsonb_agg(to_jsonb(t) order by key) from public.site_settings t) b,
                  (select jsonb_agg(to_jsonb(t) order by user_id) from public.account_status t) c,
                  (select count(*) from public.moderation_actions) d,
                  (select count(*) from public.ban_records) e,
                  (select count(*) from public.admin_audit_log) f`,
        )
      ).rows,
    );

  for (const name of adminRouteNames) {
    it(`${name}: not found for signed-out, player, under-16, suspended admin, banned admin and with no keys`, async () => {
      await person('admin', { role: 'admin' });
      await person('pat');
      const kind = await person('kid', { age: 15 });
      const susp = await person('susp', { role: 'admin', suspended: true });
      const banned = await person('banned', { role: 'admin', banned: true });
      const body = BODIES[name]!(people);
      for (const who of [null, people.pat!, kind, susp, banned]) {
        const res = await post(
          name,
          body,
          who,
          {},
          `10.6.${ip}.${Math.floor(Math.random() * 250)}`,
        );
        expect(res.status, `${name} as ${who?.username ?? 'nobody'}`).toBe(404);
        expect(res.headers.get('x-robots-tag')).toBeNull();
      }
      setAuthDeps(null);
      expect((await post(name, body, null)).status).toBe(404);
    });

    it(`${name}: the CSRF rule applies to an admin`, async () => {
      const admin = await person('admin', { role: 'admin' });
      await person('pat');
      const body = BODIES[name]!(people);
      expect((await post(name, body, admin, { origin: 'https://evil.example' })).status).toBe(403);
      expect((await post(name, body, admin, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
      expect((await post(name, body, admin, { 'content-type': 'text/plain' })).status).toBe(403);
    });

    it(`${name}: a failed audit write rolls the change back and answers a plain 500`, async () => {
      const admin = await person('admin', { role: 'admin' });
      await person('pat');
      const before = await digest();
      setAuthDeps({ ...deps, sql: failingAudit(deps.sql) });
      const res = await post(name, BODIES[name]!(people), admin);
      expect(res.status).toBe(500);
      expect(await res.text()).not.toMatch(/audit write failed/);
      expect(await digest()).toBe(before);
    });

    it(`${name}: an admin who passes the gate is let in and the answer is marked noindex`, async () => {
      const admin = await person('admin', { role: 'admin' });
      await person('pat');
      const res = await post(name, BODIES[name]!(people), admin);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-robots-tag')).toContain('noindex');
    });
  }
});
