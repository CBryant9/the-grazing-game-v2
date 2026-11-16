import type { PGlite } from '@electric-sql/pglite';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import type { Integrations, NotifyDeps } from '../notify/deps';
import { setNotifyIntegrations } from '../notify/deps';
import { addDevice } from '../notify/store';
import { FakeAuth } from './fakeAuth';
import { FAKE_AUTH, FAKE_P256DH, FakeMail, FakePush } from './fakeNotify';
import { pgliteSql } from './pgliteSql';

/** 12:00 noon in Sydney (AEDT, +11) on Tuesday 17 November 2026. */
export const NOON = Date.UTC(2026, 10, 17, 1, 0, 0);
export const HOUR = 3600_000;
export const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
export const TOKEN_SECRET = 'notify-token-secret-for-tests-'.padEnd(48, 'x');
export const CRON = 'cron-secret-for-tests-'.padEnd(40, 'c');

export interface World {
  db: PGlite;
  auth: FakeAuth;
  push: FakePush;
  mail: FakeMail;
  clock: { t: number };
  integ: Integrations;
  nd: NotifyDeps;
  deps: AuthDeps;
  people: Record<string, Person>;
  /** Leave the push or mail sender out, as when no keys are set. */
  keys(k: { push: boolean; mail: boolean }): void;
}

export interface Person {
  id: string;
  cookie: string;
  username: string;
  email: string;
}

export function makeWorld(db: PGlite): World {
  const auth = new FakeAuth(db);
  const push = new FakePush();
  const mail = new FakeMail();
  const clock = { t: NOON };
  const integ: Integrations = {
    push,
    vapidPublicKey: 'BPublicKeyForTests',
    mail,
    from: 'The Grazing Game <alerts@mail.example.test>',
    site: 'https://game.example.test',
    tokenSecret: TOKEN_SECRET,
    cronSecret: CRON,
    now: () => clock.t,
  };
  const deps: AuthDeps = { provider: auth, sql: pgliteSql(db), pepper: PEPPER };
  const nd: NotifyDeps = {
    sql: deps.sql,
    emailOf: (id) => auth.emailOf(id),
    integrations: integ,
    switchOn: async () => {
      const r = await db.query<{ enabled: boolean }>(
        "select enabled from public.feature_switches where key = 'push_notifications'",
      );
      return r.rows[0]?.enabled ?? true;
    },
  };
  setAuthDeps(deps);
  setNotifyIntegrations(integ);
  return {
    db,
    auth,
    push,
    mail,
    clock,
    integ,
    nd,
    deps,
    people: {},
    keys(k) {
      integ.push = k.push ? push : null;
      integ.vapidPublicKey = k.push ? 'BPublicKeyForTests' : null;
      integ.mail = k.mail ? mail : null;
    },
  };
}

export async function resetWorld(w: World): Promise<void> {
  await w.db.exec(
    `update public.account_status set banned_at = null, suspended_until = null;
     delete from public.farms; delete from public.guest_sessions; delete from auth.users;
     delete from public.ban_records; delete from public.signup_refusals;
     delete from public.site_settings; truncate public.admin_audit_log;
     update public.feature_switches set enabled = true, updated_by = null where key in ('signups_open','daily_farm','fast_farm','leaderboards','push_notifications');
     update public.feature_switches set enabled = false, updated_by = null where key not in ('signups_open','daily_farm','fast_farm','leaderboards','push_notifications');`,
  );
  resetSwitchCache();
  w.auth = new FakeAuth(w.db);
  w.deps.provider = w.auth;
  w.nd.emailOf = (id) => w.auth.emailOf(id);
  w.push.sent.length = 0;
  w.push.attempts.length = 0;
  w.push.plan.clear();
  w.mail.sent.length = 0;
  w.mail.plan.length = 0;
  w.clock.t = NOON;
  w.keys({ push: true, mail: true });
  w.people = {};
  setAuthDeps(w.deps);
  setNotifyIntegrations(w.integ);
}

export async function addPerson(
  w: World,
  key: string,
  opts: { role?: string; ageYears?: number; banned?: boolean; profile?: boolean } = {},
): Promise<Person> {
  const email = `${key}@example.test`;
  const { user, cookie } = await w.auth.signInAs(email);
  const username = `u_${key}`.slice(0, 20);
  if (opts.profile !== false) {
    await w.db.query('insert into public.profiles (user_id, username) values ($1, $2)', [
      user.id,
      username,
    ]);
    await w.db.query(
      `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
       values ($1, ((now() at time zone 'Australia/Sydney')::date - ($2 || ' years')::interval)::date, now())`,
      [user.id, String(opts.ageYears ?? 30)],
    );
    await w.db.query(
      `insert into public.account_status (user_id, role, banned_at) values ($1, $2, $3)`,
      [user.id, opts.role ?? 'player', opts.banned ? new Date().toISOString() : null],
    );
  }
  const p = { id: user.id, cookie, username, email };
  w.people[key] = p;
  return p;
}

let n = 0;
/** Save a device for an account, through the same function the route uses. */
export async function addDeviceFor(
  w: World,
  userId: string,
  host = 'web.push.apple.com',
): Promise<string> {
  const endpoint = `https://${host}/wpush/v2/${++n}-${Math.random().toString(16).slice(2)}`;
  await addDevice(w.deps.sql, userId, {
    endpoint,
    p256dh: FAKE_P256DH,
    auth: FAKE_AUTH,
    label: 'Test phone',
  });
  return endpoint;
}

export async function addFarm(
  w: World,
  ownerId: string,
  opts: { name?: string; timezone?: string; lastOpenedAt?: string } = {},
): Promise<string> {
  const r = await w.db.query<{ id: string }>(
    `insert into public.farms (owner_id, mode, name, district, size, size_ha, enterprise, start_type,
                               difficulty, engine_version, timezone, sim_through, last_opened_at)
     values ($1, 'daily', $2, 'nsw', 'small', 100, 'grazing', 'scratch', 'easy', 'test-1', $3,
             '2026-11-16', $4)
     returning id`,
    [
      ownerId,
      opts.name ?? 'Kooringa',
      opts.timezone ?? 'Australia/Sydney',
      opts.lastOpenedAt ?? '2026-11-01T00:00:00Z',
    ],
  );
  return r.rows[0]!.id;
}

export async function setPrefs(
  w: World,
  userId: string,
  kind: string,
  push: boolean,
  email = false,
): Promise<void> {
  await w.db.query(
    `insert into public.notification_prefs (user_id, kind, push, email) values ($1, $2, $3, $4)
     on conflict (user_id, kind) do update set push = excluded.push, email = excluded.email`,
    [userId, kind, push, email],
  );
}

export async function setSettings(
  w: World,
  userId: string,
  s: {
    quietStart?: string | null;
    quietEnd?: string | null;
    reminder?: string;
    later?: boolean;
    tz?: string;
  },
): Promise<void> {
  await w.db.query(
    `insert into public.notification_settings (user_id, reminder_time, later_nudge, quiet_start, quiet_end, timezone)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id) do update set reminder_time = excluded.reminder_time, later_nudge = excluded.later_nudge,
       quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, timezone = excluded.timezone`,
    [
      userId,
      s.reminder ?? '07:00',
      s.later ?? true,
      s.quietStart ?? null,
      s.quietEnd ?? null,
      s.tz ?? 'Australia/Sydney',
    ],
  );
}

export async function sends(
  w: World,
  userId?: string,
): Promise<
  {
    kind: string;
    channel: string;
    state: string;
    reason: string | null;
    attempts: number;
    not_before: number | null;
    title: string;
  }[]
> {
  const r = await w.db.query<{
    kind: string;
    channel: string;
    state: string;
    reason: string | null;
    attempts: number;
    not_before: number | null;
    title: string;
  }>(
    `select n.kind, s.channel, s.state, s.reason, s.attempts, (case when s.not_before = 'infinity' then null else extract(epoch from s.not_before) * 1000 end)::float8 as not_before, n.title
       from public.notification_sends s join public.notifications n on n.id = s.notification_id
      ${userId ? 'where s.user_id = $1' : ''} order by s.created_at, s.channel`,
    userId ? [userId] : [],
  );
  return r.rows;
}

export const iso = (ms: number): string => new Date(ms).toISOString();
