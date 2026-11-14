import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FEATURE_SWITCHES } from '@gg/shared';
import { freshDb } from '../../../../packages/db/src/harness';
import { GameServer, setGameServer } from '../game/game';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { DbFarmStore } from '../db/dbstore';
import type { SqlClient, SqlRunner } from '../db/sql';
import { pgliteSql } from '../test-support/pgliteSql';
import { FakeAuth } from '../test-support/fakeAuth';
import { featureSwitches, resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { banHash } from '../auth/email';
import { adminGate } from './gate';
import { jarFor } from '../auth/provider';
import { MAINTENANCE_WORDINGS } from './info';
import {
  auditActions,
  dashboard,
  describeAudit,
  listAudit,
  listSettings,
  listSwitches,
  parseUserAction,
  searchUsers,
  setSetting,
  setSwitch,
  userAction,
  userDetail,
} from './store';
import { AdminError } from './errors';
import { SWITCH_INFO } from './info';

const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';

type Handler = (req: Request) => Promise<Response>;
const routes: Record<string, { POST?: Handler; GET?: Handler; DELETE?: Handler }> = {};

let db: PGlite;
let auth: FakeAuth;
let deps: AuthDeps;
let ip = 0;

beforeAll(async () => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  db = await freshDb({ seed: false });
  routes.switches = await import('@/app/api/admin/switches/route');
  routes.settings = await import('@/app/api/admin/settings/route');
  routes.users = await import('@/app/api/admin/users/route');
  routes.farm = await import('@/app/api/game/farm/route');
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
  username: string;
  email: string;
}
let people: Record<string, Person>;

async function person(
  key: string,
  opts: {
    role?: string;
    ageYears?: number;
    suspended?: boolean;
    banned?: boolean;
    profile?: boolean;
  } = {},
): Promise<Person> {
  const email = `${key}@example.test`;
  const { user, cookie } = await auth.signInAs(email);
  const username = `u_${key}`.slice(0, 20);
  if (opts.profile !== false) {
    await db.query('insert into public.profiles (user_id, username) values ($1, $2)', [
      user.id,
      username,
    ]);
    await db.query(
      `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
       values ($1, ((now() at time zone 'Australia/Sydney')::date - ($2 || ' years')::interval)::date, now())`,
      [user.id, String(opts.ageYears ?? 30)],
    );
    await db.query(
      `insert into public.account_status (user_id, role, suspended_until, banned_at)
       values ($1, $2, $3, $4)`,
      [
        user.id,
        opts.role ?? 'player',
        opts.suspended ? new Date(Date.now() + 86_400_000).toISOString() : null,
        opts.banned ? new Date().toISOString() : null,
      ],
    );
  }
  const p = { id: user.id, cookie, username, email };
  people[key] = p;
  return p;
}

beforeEach(async () => {
  await db.exec(
    `truncate public.admin_audit_log;
     update public.account_status set banned_at = null, suspended_until = null;
     delete from public.farms; delete from public.guest_sessions; delete from auth.users;
     delete from public.ban_records; delete from public.signup_refusals;
     delete from public.site_settings; delete from public.moderation_actions;
     update public.feature_switches set enabled = true, updated_by = null where key in ('signups_open','daily_farm','fast_farm','leaderboards','push_notifications');
     update public.feature_switches set enabled = false, updated_by = null where key not in ('signups_open','daily_farm','fast_farm','leaderboards','push_notifications');`,
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

async function post(
  route: string,
  body: unknown,
  who: Person | null,
  headers: Record<string, string> = {},
  address = `10.1.0.${ip}`,
): Promise<Response> {
  const req = new Request(`${HOST}/api/admin/${route}`, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      'x-real-ip': address,
      'content-type': 'application/json',
      ...(who ? { cookie: who.cookie } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return routes[route]!.POST!(req);
}

const auditRows = async () =>
  (
    await db.query<{
      action: string;
      admin_id: string;
      target_type: string;
      target_id: string;
      details: Record<string, unknown>;
    }>(
      'select action, admin_id, target_type, target_id, details from public.admin_audit_log order by id',
    )
  ).rows;

/** The same SQL client, but a statement that touches the audit log fails. */
function failingAudit(sql: SqlClient): SqlClient {
  const wrap = (tx: SqlRunner): SqlRunner => ({
    query(text, params) {
      if (/insert into public\.admin_audit_log/.test(text)) {
        return Promise.reject(new Error('audit write failed'));
      }
      return tx.query(text, params);
    },
  });
  return {
    query: (t, p) => wrap(sql).query(t, p),
    transaction: (fn) => sql.transaction((tx) => fn(wrap(tx))),
  };
}

// ------------------------------------------------------------------ the role gate

const BODIES: Record<string, unknown> = {
  switches: { key: 'community', enabled: true },
  settings: { key: 'maintenance_wording', value: { id: 'short' } },
  users: { userId: '00000000-0000-4000-8000-000000000001', action: 'sign_out_all' },
};

describe('the role gate on every admin route', () => {
  it('gives signed-out visitors, players, under-16 players, suspended and banned admins the same plain 404', async () => {
    await person('admin', { role: 'admin' });
    const player = await person('player');
    const kid = await person('kid', { ageYears: 15 });
    const susp = await person('susp', { role: 'admin', suspended: true });
    const banned = await person('banned', { role: 'admin', banned: true });
    const noprofile = await person('noprof', { role: 'admin', profile: false });
    const mod = await person('mod', { role: 'moderator' });
    const answers = new Set<string>();
    for (const route of Object.keys(BODIES)) {
      for (const who of [null, player, kid, susp, banned, noprofile, mod]) {
        const res = await post(
          route,
          BODIES[route],
          who,
          {},
          `10.2.${ip}.${Math.floor(Math.random() * 250)}`,
        );
        expect(res.status, `${route} as ${who?.username ?? 'nobody'}`).toBe(404);
        // Nothing that tells it from an unknown address.
        expect(res.headers.get('x-robots-tag')).toBeNull();
        expect(res.headers.get('cache-control')).toBe('no-store');
        answers.add(await res.text());
      }
    }
    expect([...answers]).toEqual(['{"error":"Not found."}']);
    expect(await auditRows()).toEqual([]);
  });

  it('the first-admin statement in the log (run by the owner in the SQL editor) makes an admin', async () => {
    const first = await person('first');
    expect((await post('switches', BODIES.switches, first)).status).toBe(404);
    const r = await db.query(
      `update public.account_status
          set role = 'admin'
        where user_id = (select user_id from public.profiles where username = 'u_first')`,
    );
    expect(r.affectedRows).toBe(1);
    expect((await post('switches', BODIES.switches, first)).status).toBe(200);
  });

  it('refuses a non-admin before it says anything about the CSRF rule', async () => {
    const player = await person('player');
    const res = await post('switches', BODIES.switches, player, { origin: 'https://evil.example' });
    expect(res.status).toBe(404);
  });

  it('lets an admin in good standing through, from the verified session and the database row', async () => {
    const admin = await person('admin', { role: 'admin' });
    const res = await post('switches', { key: 'community', enabled: true }, admin);
    expect(res.status).toBe(200);
    // Nothing the browser sends can make an admin: a role in the body or a header is ignored.
    const player = await person('player');
    const forged = await post('switches', { key: 'ads', enabled: true, role: 'admin' }, player, {
      'x-role': 'admin',
      'x-admin': '1',
    });
    expect(forged.status).toBe(404);
  });

  it('refuses when the role is taken away in the database, with no change on the browser side', async () => {
    const admin = await person('admin', { role: 'admin' });
    await person('second', { role: 'admin' });
    expect((await post('switches', BODIES.switches, admin)).status).toBe(200);
    await db.query("update public.account_status set role = 'player' where user_id = $1", [
      admin.id,
    ]);
    expect((await post('switches', BODIES.switches, admin)).status).toBe(404);
  });

  it('refuses a signed-out-everywhere session that the auth server no longer accepts', async () => {
    const admin = await person('admin', { role: 'admin' });
    const jar = jarFor(new Request(HOST, { headers: { cookie: admin.cookie } }));
    await auth.signOut(jar, 'global');
    expect((await post('switches', BODIES.switches, admin)).status).toBe(404);
  });

  it('with no accounts set up every route answers 404 and the gate says off', async () => {
    setAuthDeps(null);
    for (const route of Object.keys(BODIES)) {
      const res = await post(route, BODIES[route], null);
      expect(res.status).toBe(404);
    }
    expect(await adminGate(jarFor(new Request(HOST)))).toEqual({ kind: 'off' });
  });

  it('a gate that can not read the database fails closed', async () => {
    const admin = await person('admin', { role: 'admin' });
    setAuthDeps({
      ...deps,
      sql: {
        query: () => Promise.reject(new Error('down')),
        transaction: () => Promise.reject(new Error('down')),
      },
    });
    expect((await post('switches', BODIES.switches, admin)).status).toBe(404);
  });

  it('answers only POST: a GET is not a handler', () => {
    for (const r of ['switches', 'settings', 'users']) expect(routes[r]!.GET).toBeUndefined();
  });
});

// ------------------------------------------------------------------ CSRF and limits

describe('CSRF and rate limits on admin writes', () => {
  it('applies the shared CSRF rule', async () => {
    const admin = await person('admin', { role: 'admin' });
    const body = { key: 'community', enabled: true };
    expect((await post('switches', body, admin, { origin: 'https://evil.example' })).status).toBe(
      403,
    );
    expect((await post('switches', body, admin, { 'sec-fetch-site': 'same-site' })).status).toBe(
      403,
    );
    expect((await post('switches', body, admin, { 'sec-fetch-site': 'cross-site' })).status).toBe(
      403,
    );
    expect((await post('switches', body, admin, { 'content-type': 'text/plain' })).status).toBe(
      403,
    );
    expect(
      (await post('switches', body, admin, { 'content-type': 'application/x-www-form-urlencoded' }))
        .status,
    ).toBe(403);
    expect(
      (await post('switches', body, admin, { origin: HOST, 'sec-fetch-site': 'same-origin' }))
        .status,
    ).toBe(200);
    expect(await auditRows()).toHaveLength(1);
  });

  it('limits each admin on each route', async () => {
    const admin = await person('admin', { role: 'admin' });
    let last = 0;
    for (let i = 0; i < 31; i++) {
      const res = await post('switches', { key: 'community', enabled: i % 2 === 0 }, admin);
      last = res.status;
      if (i < 30) expect(res.status).toBe(200);
    }
    expect(last).toBe(429);
  });

  it('limits visitors by address before the gate is asked', async () => {
    let last = 0;
    for (let i = 0; i < 121; i++)
      last = (await post('switches', BODIES.switches, null, {}, '10.9.9.9')).status;
    expect(last).toBe(429);
  });

  it('refuses a body that is too big, not an object, or not JSON', async () => {
    const admin = await person('admin', { role: 'admin' });
    const mk = (body: string) =>
      routes.switches!.POST!(
        new Request(`${HOST}/api/admin/switches`, {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            'content-type': 'application/json',
            cookie: admin.cookie,
            'x-real-ip': '10.3.3.3',
          },
          body,
        }),
      );
    expect((await mk('[1]')).status).toBe(400);
    expect((await mk('{nope')).status).toBe(400);
    expect((await mk(JSON.stringify({ pad: 'x'.repeat(5000) }))).status).toBe(413);
  });
});

// ------------------------------------------------------------------ feature switches

describe('feature switches', () => {
  it('lists exactly the shared keys, each with words, and the rebuild flags only name shared keys', async () => {
    const rows = await listSwitches(deps.sql);
    expect(rows.map((r) => r.key)).toEqual(Object.keys(FEATURE_SWITCHES));
    expect(Object.keys(SWITCH_INFO).sort()).toEqual(Object.keys(FEATURE_SWITCHES).sort());
    for (const k of Object.keys(SWITCH_INFO) as (keyof typeof SWITCH_INFO)[]) {
      const i = SWITCH_INFO[k];
      expect(i.label.length).toBeGreaterThan(2);
      expect(i.what && i.whenOn && i.whenOff).toBeTruthy();
      expect(JSON.stringify(i)).not.toMatch(/—/);
    }
    // The database has a row for each shared key and no other (a test in packages/db keeps them equal).
    const dbKeys = (
      await db.query<{ key: string }>('select key from public.feature_switches order by key')
    ).rows.map((r) => r.key);
    expect(dbKeys).toEqual(Object.keys(FEATURE_SWITCHES).sort());
  });

  it('turns a switch on and off, records who and when, and writes one audit row', async () => {
    const admin = await person('admin', { role: 'admin' });
    expect((await post('switches', { key: 'community', enabled: true }, admin)).status).toBe(200);
    let row = (await listSwitches(deps.sql)).find((r) => r.key === 'community')!;
    expect(row.enabled).toBe(true);
    expect(row.changedBy).toBe(admin.username);
    expect(row.changedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(await auditRows()).toEqual([
      {
        action: 'switch_set',
        admin_id: admin.id,
        target_type: 'feature_switch',
        target_id: 'community',
        details: { switch_key: 'community', enabled: true },
      },
    ]);
    await post('switches', { key: 'community', enabled: false }, admin);
    row = (await listSwitches(deps.sql)).find((r) => r.key === 'community')!;
    expect(row.enabled).toBe(false);
    expect(await auditRows()).toHaveLength(2);
  });

  it('the next request sees the change (this server reads it at once)', async () => {
    const admin = await person('admin', { role: 'admin' });
    expect((await featureSwitches(deps.sql)).community).toBe(false);
    await post('switches', { key: 'community', enabled: true }, admin);
    expect((await featureSwitches(deps.sql)).community).toBe(true);
  });

  it('does nothing, and writes nothing, when the switch is already in that state', async () => {
    const admin = await person('admin', { role: 'admin' });
    const out = await setSwitch(deps.sql, admin.id, 'signups_open', true);
    expect(out.changed).toBe(false);
    expect(await auditRows()).toEqual([]);
  });

  it('refuses a key that is not a shared key, and a state that is not on or off', async () => {
    const admin = await person('admin', { role: 'admin' });
    expect((await post('switches', { key: 'nope', enabled: true }, admin)).status).toBe(400);
    expect((await post('switches', { key: 'community', enabled: 'yes' }, admin)).status).toBe(400);
    expect(
      (await post('switches', { key: 'community; drop table x', enabled: true }, admin)).status,
    ).toBe(400);
    expect(await auditRows()).toEqual([]);
  });

  it('a failed audit write rolls the change back', async () => {
    const admin = await person('admin', { role: 'admin' });
    await expect(setSwitch(failingAudit(deps.sql), admin.id, 'community', true)).rejects.toThrow(
      'audit write failed',
    );
    const row = (await listSwitches(deps.sql)).find((r) => r.key === 'community')!;
    expect(row.enabled).toBe(false);
    expect(row.changedBy).toBeNull();
  });

  it('answers a failed audit write over HTTP with a plain 500 and no change', async () => {
    const admin = await person('admin', { role: 'admin' });
    setAuthDeps({ ...deps, sql: failingAudit(deps.sql) });
    const res = await post('switches', { key: 'community', enabled: true }, admin);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/audit write failed/);
    setAuthDeps(deps);
    expect((await listSwitches(deps.sql)).find((r) => r.key === 'community')!.enabled).toBe(false);
  });
});

// ------------------------------------------------------------------ site settings

describe('site settings', () => {
  it('saves a valid announcement, shows it, and audits only its length', async () => {
    const admin = await person('admin', { role: 'admin' });
    const res = await post(
      'settings',
      { key: 'announcement', value: { text: 'Rain on the way', link: '/play' } },
      admin,
    );
    expect(res.status).toBe(200);
    const s = (await listSettings(deps.sql)).find((x) => x.key === 'announcement')!;
    expect(s.value).toEqual({ text: 'Rain on the way', link: '/play' });
    expect(s.changedBy).toBe(admin.username);
    const rows = await auditRows();
    expect(rows).toEqual([
      {
        action: 'setting_set',
        admin_id: admin.id,
        target_type: 'site_setting',
        target_id: 'announcement',
        details: { count: 15 },
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/Rain/);
    const pub = await db.query<{ is_public: boolean }>(
      "select is_public from public.site_settings where key = 'announcement'",
    );
    expect(pub.rows[0]!.is_public).toBe(true);
  });

  it('refuses what does not fit, and changes nothing', async () => {
    const admin = await person('admin', { role: 'admin' });
    const bad: [string, unknown][] = [
      ['announcement', { text: 'x'.repeat(141), link: null }],
      ['announcement', { text: 'two\nlines', link: null }],
      ['announcement', { text: '', link: '/play' }],
      ['announcement', { text: 'Hi', link: 'javascript:alert(1)' }],
      ['announcement', { text: 'Hi', link: '//evil.example' }],
      ['announcement', { text: 'Hi', link: 'http://plain.example' }],
      ['announcement', { text: 5, link: null }],
      ['districts_available', []],
      ['districts_available', ['cq', 'moon']],
      ['districts_available', 'cq'],
      ['community_rules', { text: 'x'.repeat(10_001) }],
      ['community_rules', { text: 'bell\u0007' }],
      ['maintenance_wording', { id: 'Buy now at example.test' }],
      ['maintenance_wording', null],
      ['not_a_setting', { id: 'short' }],
    ];
    for (const [key, value] of bad) {
      const res = await post('settings', { key, value }, admin);
      expect(res.status, `${key} ${JSON.stringify(value).slice(0, 40)}`).toBe(400);
    }
    expect(await auditRows()).toEqual([]);
    expect((await db.query('select 1 from public.site_settings')).rowCount).toBe(0);
  });

  it('keeps districts in the game order with no repeats, and the wording as an id from the list', async () => {
    const admin = await person('admin', { role: 'admin' });
    await post('settings', { key: 'districts_available', value: ['wv', 'cq', 'wv'] }, admin);
    await post('settings', { key: 'maintenance_wording', value: { id: 'longer' } }, admin);
    const all = await listSettings(deps.sql);
    expect(all.find((x) => x.key === 'districts_available')!.value).toEqual(['cq', 'wv']);
    expect(all.find((x) => x.key === 'maintenance_wording')!.value).toEqual({ id: 'longer' });
    expect((await auditRows()).map((r) => r.details)).toEqual([{ count: 2 }, { value: 3 }]);
    const pub = await db.query<{ is_public: boolean }>(
      "select is_public from public.site_settings where key = 'maintenance_wording'",
    );
    expect(pub.rows[0]!.is_public).toBe(false);
  });

  it('lists every setting, with its default when none is stored', async () => {
    const all = await listSettings(deps.sql);
    expect(all.map((x) => x.key)).toEqual([
      'announcement',
      'districts_available',
      'community_rules',
      'maintenance_wording',
    ]);
    expect(all.every((x) => x.changedBy === null)).toBe(true);
  });

  it('a failed audit write rolls the setting back', async () => {
    const admin = await person('admin', { role: 'admin' });
    await expect(
      setSetting(failingAudit(deps.sql), admin.id, 'announcement', { text: 'Hello', link: null }),
    ).rejects.toThrow('audit write failed');
    expect((await db.query('select 1 from public.site_settings')).rowCount).toBe(0);
  });
});

// ------------------------------------------------------------------ users

describe('finding users', () => {
  it('finds by username prefix (any case), by exact id, and never by email', async () => {
    const admin = await person('admin', { role: 'admin' });
    const ava = await person('ava_grazier');
    await person('ava_two');
    await person('ben');
    expect((await searchUsers(deps.sql, 'U_AVA_')).map((u) => u.username).sort()).toEqual([
      'u_ava_grazier',
      'u_ava_two',
    ]);
    expect((await searchUsers(deps.sql, 'u_ava_grazier')).map((u) => u.id)).toEqual([ava.id]);
    expect((await searchUsers(deps.sql, ava.id)).map((u) => u.id)).toEqual([ava.id]);
    expect((await searchUsers(deps.sql, ava.id.toUpperCase())).map((u) => u.id)).toEqual([ava.id]);
    expect(await searchUsers(deps.sql, ava.email)).toEqual([]);
    expect(await searchUsers(deps.sql, 'ava_grazier@example')).toEqual([]);
    expect(await searchUsers(deps.sql, 'example.test')).toEqual([]);
    // A wildcard is a letter, not a wildcard; one character lists nobody.
    expect(await searchUsers(deps.sql, '%%')).toEqual([]);
    expect(await searchUsers(deps.sql, 'u')).toEqual([]);
    expect((await searchUsers(deps.sql, 'u_a_')).length).toBe(0);
    expect(admin.id).toBeTruthy();
  });

  it('shows status, role, joined, farms, last seen, under 16 as a yes or no, and no date of birth or email', async () => {
    await person('admin', { role: 'admin' });
    const kid = await person('kid', { ageYears: 15 });
    const adult = await person('adult', { ageYears: 40 });
    await db.query(
      `insert into public.farms (owner_id, mode, name, district, size, size_ha, enterprise, start_type, difficulty, engine_version, timezone, sim_through)
       values ($1, 'fast', 'A', 'cq', 'small', 100, 'grazing', 'scratch', 'easy', 'e1', null, null),
              ($1, 'fast', 'B', 'cq', 'small', 100, 'grazing', 'scratch', 'easy', 'e1', null, null),
              ($1, 'daily', 'C', 'cq', 'small', 100, 'grazing', 'scratch', 'easy', 'e1', 'Australia/Sydney', current_date)`,
      [adult.id],
    );
    const a = (await userDetail(deps.sql, adult.id))!;
    const k = (await userDetail(deps.sql, kid.id))!;
    expect(a).toMatchObject({
      username: adult.username,
      role: 'player',
      state: 'active',
      underSixteen: false,
      farms: { daily: 1, fast: 2 },
    });
    expect(a.lastSeen).toMatch(/^\d{4}/);
    expect(k.underSixteen).toBe(true);
    expect(k.lastSeen).toBeNull();
    const text = JSON.stringify([a, k]);
    expect(text).not.toMatch(/date_of_birth|dob|birth/i);
    expect(text).not.toContain('@');
    expect(text).not.toMatch(/\b(19|20)\d\d-\d\d-\d\d\b.*(birth)/);
    expect(await userDetail(deps.sql, 'not-an-id')).toBeNull();
    expect(await userDetail(deps.sql, '00000000-0000-4000-8000-0000000000ff')).toBeNull();
  });
});

describe('user actions', () => {
  const act = (admin: Person, userId: string, body: Record<string, unknown>) =>
    post('users', { userId, ...body }, admin);

  it('suspends for a chosen length, records it in the history, and writes one audit row', async () => {
    const admin = await person('admin', { role: 'admin' });
    const p = await person('pat');
    expect((await act(admin, p.id, { action: 'suspend', days: 7 })).status).toBe(200);
    const d = (await userDetail(deps.sql, p.id))!;
    expect(d.state).toBe('suspended');
    expect(d.suspendedUntil).not.toBeNull();
    expect(d.history).toMatchObject([{ action: 'suspended', by: admin.username }]);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'user_suspend',
      admin_id: admin.id,
      target_type: 'account',
      target_id: p.id,
    });
    expect(Object.keys(rows[0]!.details).sort()).toEqual(['count', 'until']);
    const days = (new Date(d.suspendedUntil!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect((await act(admin, p.id, { action: 'suspend', days: 5 })).status).toBe(400);
    expect((await act(admin, p.id, { action: 'suspend' })).status).toBe(400);
  });

  it('bans with the hashed record, lifts it, and removes the record', async () => {
    const admin = await person('admin', { role: 'admin' });
    const p = await person('pat');
    expect((await act(admin, p.id, { action: 'ban' })).status).toBe(200);
    const hash = banHash(p.email, PEPPER)!;
    expect((await userDetail(deps.sql, p.id))!.state).toBe('banned');
    const rec = await db.query<{ email_hash: string; banned_until: string | null }>(
      'select email_hash, banned_until from public.ban_records',
    );
    expect(rec.rows).toEqual([{ email_hash: hash, banned_until: null }]);
    expect(JSON.stringify(rec.rows)).not.toContain(p.email);
    // A second ban does not make a second record.
    await act(admin, p.id, { action: 'ban' });
    expect((await db.query('select 1 from public.ban_records')).rowCount).toBe(1);
    expect((await act(admin, p.id, { action: 'suspend', days: 1 })).status).toBe(409);
    expect((await act(admin, p.id, { action: 'lift' })).status).toBe(200);
    expect((await userDetail(deps.sql, p.id))!.state).toBe('active');
    expect((await db.query('select 1 from public.ban_records')).rowCount).toBe(0);
    expect((await userDetail(deps.sql, p.id))!.history.map((h) => h.action)).toEqual([
      'unbanned',
      'banned',
      'banned',
    ]);
    expect((await auditRows()).map((r) => r.action)).toEqual(['user_ban', 'user_ban', 'user_lift']);
  });

  it('a ban whose email can not be found still bans, and the hash is made at deletion as before', async () => {
    const admin = await person('admin', { role: 'admin' });
    const p = await person('pat');
    auth.users.delete(p.id);
    expect((await act(admin, p.id, { action: 'ban' })).status).toBe(200);
    expect((await userDetail(deps.sql, p.id))!.state).toBe('banned');
    expect((await db.query('select 1 from public.ban_records')).rowCount).toBe(0);
  });

  it('changes a role, and the role is read from the database for the next request', async () => {
    const admin = await person('admin', { role: 'admin' });
    const p = await person('pat');
    expect((await act(admin, p.id, { action: 'set_role', role: 'moderator' })).status).toBe(200);
    expect((await userDetail(deps.sql, p.id))!.role).toBe('moderator');
    expect((await auditRows())[0]).toMatchObject({
      action: 'user_set_role',
      details: { role: 'moderator' },
    });
    expect((await act(admin, p.id, { action: 'set_role', role: 'owner' })).status).toBe(400);
    // The new admin passes the gate at once.
    await act(admin, p.id, { action: 'set_role', role: 'admin' });
    expect((await post('switches', BODIES.switches, p)).status).toBe(200);
  });

  it('signs a user out everywhere: their sessions go and one audit row is written', async () => {
    const admin = await person('admin', { role: 'admin' });
    const p = await person('pat');
    await db.query('insert into auth.sessions (user_id) values ($1), ($1), ($2)', [p.id, admin.id]);
    expect((await act(admin, p.id, { action: 'sign_out_all' })).status).toBe(200);
    expect(
      (await db.query('select 1 from auth.sessions where user_id = $1', [p.id])).rowCount,
    ).toBe(0);
    expect(
      (await db.query('select 1 from auth.sessions where user_id = $1', [admin.id])).rowCount,
    ).toBe(1);
    expect(await auditRows()).toEqual([
      {
        action: 'user_sign_out_all',
        admin_id: admin.id,
        target_type: 'account',
        target_id: p.id,
        details: {},
      },
    ]);
  });

  it('clears a mistyped under-14 refusal (the server-only function) and logs it once', async () => {
    const admin = await person('admin', { role: 'admin' });
    const lost = await person('lost', { profile: false });
    expect((await act(admin, lost.id, { action: 'clear_refusal' })).status).toBe(404);
    await db.query(
      "insert into public.signup_refusals (user_id, reason) values ($1, 'too_young')",
      [lost.id],
    );
    const d = (await userDetail(deps.sql, lost.id))!;
    expect(d).toMatchObject({ username: null, refusedUnder14: true });
    expect((await act(admin, lost.id, { action: 'clear_refusal' })).status).toBe(200);
    expect((await db.query('select 1 from public.signup_refusals')).rowCount).toBe(0);
    expect(await auditRows()).toEqual([
      {
        action: 'clear_signup_refusal',
        admin_id: admin.id,
        target_type: 'account',
        target_id: lost.id,
        details: {},
      },
    ]);
  });

  it('an admin can not suspend, ban or change the role of their own account', async () => {
    const admin = await person('admin', { role: 'admin' });
    await person('second', { role: 'admin' });
    for (const body of [
      { action: 'suspend', days: 1 },
      { action: 'ban' },
      { action: 'set_role', role: 'player' },
      { action: 'set_role', role: 'admin' },
    ]) {
      const res = await act(admin, admin.id, body);
      expect(res.status).toBe(409);
      expect(await res.text()).toMatch(/your own account/);
    }
    expect(await auditRows()).toEqual([]);
    expect((await userDetail(deps.sql, admin.id))!.role).toBe('admin');
  });

  it('the last admin in good standing can not lose the role, be suspended or be banned', async () => {
    const one = await person('one', { role: 'admin' });
    const two = await person('two', { role: 'admin' });
    // Two admins: one can remove the other. Then the remaining one is the last, and nobody else
    // is left to act on them (an admin can not act on themselves).
    expect((await act(one, two.id, { action: 'set_role', role: 'player' })).status).toBe(200);
    expect((await act(two, one.id, { action: 'ban' })).status).toBe(404);
    expect((await act(one, one.id, { action: 'set_role', role: 'player' })).status).toBe(409);
    expect((await userDetail(deps.sql, one.id))!.role).toBe('admin');
  });

  it('two admins removing each other at once leave one: the second change sees no other admin and is refused', async () => {
    const one = await person('one', { role: 'admin' });
    const two = await person('two', { role: 'admin' });
    // Simulate the other change landing between the first check and the lock: right after the
    // acting admin is checked, `two` removes `one`, the way a second request would.
    const racing: SqlClient = {
      query: (t, p) => deps.sql.query(t, p),
      transaction: (fn) =>
        deps.sql.transaction((tx) =>
          fn({
            async query<T>(text: string, params?: unknown[]) {
              const out = await tx.query<T>(text, params);
              if (
                /s\.role = 'admin'\s+and s\.banned_at is null/.test(text) &&
                params?.[0] === one.id
              ) {
                await tx.query(
                  "update public.account_status set role = 'player' where user_id = $1",
                  [one.id],
                );
              }
              return out;
            },
          }),
        ),
    };
    await expect(
      userAction(racing, one.id, two.id, { action: 'set_role', role: 'player' }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/always be one admin/),
    });
    expect((await userDetail(deps.sql, two.id))!.role).toBe('admin');
    expect(await auditRows()).toEqual([]);
  });

  it('the database refuses to leave no admin, whoever writes', async () => {
    const one = await person('one', { role: 'admin' });
    await expect(
      db.query("update public.account_status set role = 'player' where user_id = $1", [one.id]),
    ).rejects.toMatchObject({ hint: 'last_admin' });
    await person('two', { role: 'admin' });
    await db.query("update public.account_status set role = 'player' where user_id = $1", [one.id]);
    // Making an admin is never refused.
    await db.query("update public.account_status set role = 'admin' where user_id = $1", [one.id]);
  });

  it('refuses a bad id, an unknown account and an unknown action', async () => {
    const admin = await person('admin', { role: 'admin' });
    expect((await act(admin, 'nope', { action: 'ban' })).status).toBe(400);
    expect(
      (await act(admin, '00000000-0000-4000-8000-0000000000ff', { action: 'ban' })).status,
    ).toBe(404);
    expect((await act(admin, admin.id, { action: 'delete' })).status).toBe(400);
    expect(() => parseUserAction({ action: 'drop' })).toThrow(AdminError);
  });

  it('a failed audit write rolls every action back', async () => {
    const admin = await person('admin', { role: 'admin' });
    const p = await person('pat');
    const bad = failingAudit(deps.sql);
    await expect(userAction(bad, admin.id, p.id, { action: 'suspend', days: 3 })).rejects.toThrow(
      'audit write failed',
    );
    await expect(
      userAction(
        bad,
        admin.id,
        p.id,
        { action: 'ban' },
        { emailOf: (id) => auth.emailOf(id), pepper: PEPPER },
      ),
    ).rejects.toThrow('audit write failed');
    await expect(
      userAction(bad, admin.id, p.id, { action: 'set_role', role: 'moderator' }),
    ).rejects.toThrow('audit write failed');
    const d = (await userDetail(deps.sql, p.id))!;
    expect(d).toMatchObject({ state: 'active', role: 'player', history: [] });
    expect((await db.query('select 1 from public.ban_records')).rowCount).toBe(0);
  });

  it('a failure inside the sign-out and clear-refusal functions rolls back with their audit row', async () => {
    const admin = await person('admin', { role: 'admin' });
    const p = await person('pat');
    await db.query('insert into auth.sessions (user_id) values ($1)', [p.id]);
    // Not an admin any more by the time the function runs: it refuses, nothing changes.
    await expect(
      userAction(deps.sql, p.id, p.id, { action: 'sign_out_all' }),
    ).rejects.toBeInstanceOf(AdminError);
    expect(
      (await db.query('select 1 from auth.sessions where user_id = $1', [p.id])).rowCount,
    ).toBe(1);
    // The functions also refuse a caller who is not an admin when called directly.
    await expect(
      db.query('select public.admin_sign_out_everywhere($1, $2)', [p.id, admin.id]),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await auditRows()).toEqual([]);
  });

  it('only a service caller may run the sign-out function', async () => {
    const r = await db.query<{ a: boolean; b: boolean; s: boolean }>(
      `select has_function_privilege('anon', 'public.admin_sign_out_everywhere(uuid, uuid)', 'EXECUTE') as a,
              has_function_privilege('authenticated', 'public.admin_sign_out_everywhere(uuid, uuid)', 'EXECUTE') as b,
              has_function_privilege('service_role', 'public.admin_sign_out_everywhere(uuid, uuid)', 'EXECUTE') as s`,
    );
    expect(r.rows[0]).toEqual({ a: false, b: false, s: true });
  });
});

// ------------------------------------------------------------------ audit log

describe('the audit log screen data', () => {
  it('lists newest first, filters by action and admin, pages, and describes the fixed shape', async () => {
    const one = await person('one', { role: 'admin' });
    const two = await person('two', { role: 'admin' });
    for (let i = 0; i < 14; i++) {
      await setSwitch(deps.sql, i % 2 ? one.id : two.id, 'community', i % 2 === 0);
      await setSwitch(deps.sql, one.id, 'groups', i % 2 === 0);
    }
    await setSetting(deps.sql, one.id, 'maintenance_wording', { id: 'update' });
    const first = await listAudit(deps.sql);
    expect(first.rows).toHaveLength(25);
    expect(first.hasNext).toBe(true);
    expect(first.rows[0]!.action).toBe('setting_set');
    const ids = first.rows.map((r) => r.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    const second = await listAudit(deps.sql, { page: 2 });
    expect(second.rows).toHaveLength(4);
    expect(second.hasNext).toBe(false);
    expect((await listAudit(deps.sql, { action: 'setting_set' })).rows).toHaveLength(1);
    expect((await listAudit(deps.sql, { action: 'bad action!' })).rows).toEqual([]);
    const byTwo = await listAudit(deps.sql, { admin: two.username });
    expect(byTwo.rows.length).toBe(7);
    expect(byTwo.rows.every((r) => r.adminId === two.id && r.admin === two.username)).toBe(true);
    expect((await listAudit(deps.sql, { admin: two.id })).rows.length).toBe(7);
    expect((await listAudit(deps.sql, { admin: 'nobody_here' })).rows).toEqual([]);
    expect(await auditActions(deps.sql)).toEqual(['setting_set', 'switch_set']);
    expect(describeAudit(first.rows[0]!)).toBe('site setting maintenance_wording: value 2');
    expect(
      describeAudit({
        action: 'switch_set',
        targetType: 'feature_switch',
        targetId: 'groups',
        details: { switch_key: 'groups', enabled: true },
      }),
    ).toBe('feature switch groups: switch groups, turned on');
  });

  it('can not be changed or removed, by the server either', async () => {
    const admin = await person('admin', { role: 'admin' });
    await setSwitch(deps.sql, admin.id, 'community', true);
    await expect(
      deps.sql.query("update public.admin_audit_log set action = 'x'"),
    ).rejects.toBeTruthy();
    await expect(deps.sql.query('delete from public.admin_audit_log')).rejects.toBeTruthy();
  });

  it('has nothing in a row that could hold a name or an email', async () => {
    const admin = await person('admin', { role: 'admin' });
    const p = await person('pat');
    await userAction(
      deps.sql,
      admin.id,
      p.id,
      { action: 'ban' },
      { emailOf: (id) => auth.emailOf(id), pepper: PEPPER },
    );
    await setSetting(deps.sql, admin.id, 'announcement', { text: 'Secret words here', link: null });
    const text = JSON.stringify(await auditRows());
    expect(text).not.toContain('@');
    expect(text).not.toContain('Secret');
    expect(text).not.toContain(p.username);
  });
});

// ------------------------------------------------------------------ dashboard

describe('the dashboard counts', () => {
  it('match the database for seeded rows', async () => {
    const a = await person('ava');
    await person('ben');
    await person('admin', { role: 'admin' });
    const g1 = (
      await db.query<{ id: string }>(
        `insert into public.guest_sessions (token_hash) values (repeat('a', 64)) returning id`,
      )
    ).rows[0]!.id;
    const g2 = (
      await db.query<{ id: string }>(
        `insert into public.guest_sessions (token_hash) values (repeat('b', 64)) returning id`,
      )
    ).rows[0]!.id;
    await db.query(
      `insert into public.guest_sessions (token_hash, converted_at, converted_to) values (repeat('c', 64), now(), $1)`,
      [a.id],
    );
    const farm = async (
      owner: string | null,
      guest: string | null,
      mode: string,
      status: string,
      savedDaysAgo: number | null,
    ) => {
      const id = (
        await db.query<{ id: string }>(
          `insert into public.farms (owner_id, guest_session_id, mode, name, district, size, size_ha, enterprise, start_type, difficulty, engine_version, status, ended_at, timezone, sim_through)
           values ($1, $2, $3, 'F', 'cq', 'small', 100, 'grazing', 'scratch', 'easy', 'e1', $4,
                   case when $4 = 'ended' then now() end,
                   case when $3 = 'daily' then 'Australia/Sydney' end,
                   case when $3 = 'daily' then current_date end) returning id`,
          [owner, guest, mode, status],
        )
      ).rows[0]!.id;
      if (savedDaysAgo !== null) {
        await db.query(
          `insert into public.farm_saves (farm_id, stored_format, save_format, engine_version, save, setup, farm_version)
           values ($1, 1, 1, 'e1', '{}', '{}', 'v1')`,
          [id],
        );
        await db.exec('alter table public.farm_saves disable trigger farm_saves_touch');
        // Saved this many whole days ago, mid-day Sydney time (0 is today, once the clock is past noon: use the start of the day plus a minute).
        await db.query(
          `update public.farm_saves set updated_at = (app.today_sydney()::timestamp at time zone 'Australia/Sydney') - ($2 || ' days')::interval + interval '1 minute' where farm_id = $1`,
          [id, String(savedDaysAgo)],
        );
        await db.exec('alter table public.farm_saves enable trigger farm_saves_touch');
      }
    };
    await farm(a.id, null, 'daily', 'active', 0);
    await farm(a.id, null, 'fast', 'active', 2);
    await farm(a.id, null, 'fast', 'ended', 6);
    await farm(null, g1, 'fast', 'active', 7);
    await farm(null, g2, 'fast', 'active', 0);
    await db.query(
      `insert into public.farm_saves_aside (farm_id, owner_id, reason) values (gen_random_uuid(), $1, 'x'), (gen_random_uuid(), $1, 'y')`,
      [a.id],
    );
    const d = await dashboard(deps.sql);
    expect(d.accounts).toBe(3);
    expect(d.guests).toBe(2);
    expect(d.farms.daily).toEqual({ active: 1, ended: 0 });
    expect(d.farms.fast).toEqual({ active: 3, ended: 1 });
    expect(d.playedToday).toBe(2);
    expect(d.playedWeek).toBe(4);
    expect(d.brokenSaves).toBe(2);
    expect(Math.abs(new Date(d.asAt).getTime() - Date.now())).toBeLessThan(5000);
    const direct = await db.query<{ n: number }>('select count(*)::int as n from public.farms');
    expect(
      d.farms.daily.active + d.farms.daily.ended + d.farms.fast.active + d.farms.fast.ended,
    ).toBe(direct.rows[0]!.n);
  });

  it('is all zeros on an empty database', async () => {
    const d = await dashboard(deps.sql);
    expect(d).toMatchObject({
      accounts: 0,
      guests: 0,
      playedToday: 0,
      playedWeek: 0,
      brokenSaves: 0,
    });
    expect(d.farms).toEqual({ daily: { active: 0, ended: 0 }, fast: { active: 0, ended: 0 } });
  });
});

// ------------------------------------------------------------------ maintenance mode

describe('maintenance mode', () => {
  // A route that changes the farm (throwing it away). Maintenance mode refuses these; reads still work
  // (see second.test.ts for every route).
  const farmGet = async (who: Person | null, address = `10.5.0.${ip}`) =>
    routes.farm!.DELETE!(
      new Request(`${HOST}/api/game/farm`, {
        method: 'DELETE',
        headers: {
          host: 'localhost:3000',
          'x-real-ip': address,
          ...(who ? { cookie: who.cookie } : {}),
        },
      }),
    );

  it('shows everyone but an admin the plain message with the code, and opens again when turned off', async () => {
    const admin = await person('admin', { role: 'admin' });
    const player = await person('pat');
    expect((await farmGet(null)).status).toBe(200);
    await post('switches', { key: 'maintenance_mode', enabled: true }, admin);
    for (const who of [null, player]) {
      const res = await farmGet(who);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        error: MAINTENANCE_WORDINGS[0].text,
        code: 'maintenance',
      });
    }
    expect(MAINTENANCE_WORDINGS[0].text).toBe(
      'The game is down for maintenance. Your farm is safe.',
    );
    expect((await farmGet(admin)).status).toBe(200);
    await post('switches', { key: 'maintenance_mode', enabled: false }, admin);
    expect((await farmGet(player)).status).toBe(200);
  });

  it('uses the chosen wording, and the default for anything that is not on the list', async () => {
    const admin = await person('admin', { role: 'admin' });
    await post('switches', { key: 'maintenance_mode', enabled: true }, admin);
    await post('settings', { key: 'maintenance_wording', value: { id: 'longer' } }, admin);
    expect(((await (await farmGet(null)).json()) as { error: string }).error).toBe(
      MAINTENANCE_WORDINGS[2].text,
    );
    // Even a row written by hand with free text can not reach a player.
    await db.query(
      `update public.site_settings set value = '{"id": "<b>Buy now</b>"}' where key = 'maintenance_wording'`,
    );
    expect(((await (await farmGet(null)).json()) as { error: string }).error).toBe(
      MAINTENANCE_WORDINGS[0].text,
    );
  });

  it('a suspended admin is a player: the game is down for them', async () => {
    const admin = await person('admin', { role: 'admin' });
    const susp = await person('susp', { role: 'admin', suspended: true });
    await post('switches', { key: 'maintenance_mode', enabled: true }, admin);
    expect((await farmGet(susp)).status).toBe(503);
  });

  it('refuses a job after it starts, before the farm is touched, and a finished one stays saved', async () => {
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    // pat starts a farm while the game is open.
    const create = await routes.farm!.POST!(
      new Request(`${HOST}/api/game/farm`, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'x-real-ip': '10.6.0.1',
          'content-type': 'application/json',
          cookie: pat.cookie,
        },
        body: JSON.stringify({
          district: 'wv',
          size: 'small',
          enterprise: 'grazing',
          years: 'random',
          startType: 'scratch',
          difficulty: 'medium',
          name: 'Kept Farm',
        }),
      }),
    );
    expect(create.status).toBe(200);
    const before = (
      await db.query<{ farm_version: string }>('select farm_version from public.farm_saves')
    ).rows;
    await post('switches', { key: 'maintenance_mode', enabled: true }, admin);
    const refused = await routes.farm!.POST!(
      new Request(`${HOST}/api/game/farm`, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'x-real-ip': '10.6.0.2',
          'content-type': 'application/json',
          cookie: pat.cookie,
        },
        body: JSON.stringify({
          district: 'cq',
          size: 'small',
          enterprise: 'grazing',
          years: 'random',
          startType: 'scratch',
          difficulty: 'medium',
          name: 'Second',
        }),
      }),
    );
    expect(refused.status).toBe(503);
    expect((await db.query('select 1 from public.farms')).rowCount).toBe(1);
    expect(
      (await db.query<{ farm_version: string }>('select farm_version from public.farm_saves')).rows,
    ).toEqual(before);
  });

  it('a database that can not be read leaves the game open', async () => {
    setAuthDeps({
      ...deps,
      sql: {
        query: () => Promise.reject(new Error('down')),
        transaction: () => Promise.reject(new Error('down')),
      },
    });
    resetSwitchCache();
    const { maintenanceNotice } = await import('./maintenance');
    expect(await maintenanceNotice(null)).toBeNull();
  });
});
