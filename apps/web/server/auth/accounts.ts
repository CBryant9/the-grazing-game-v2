import 'server-only';
import { FEATURE_SWITCHES, type FeatureSwitchKey } from '@gg/shared';
import { sessionHash } from '../db/dbstore';
import type { SqlClient, SqlRunner } from '../db/sql';
import { banHash } from './email';
import type { AuthProvider, AuthUser } from './provider';

/**
 * Everything about accounts that touches the database: who they are, sign-up,
 * moving a guest's farm in, the data download, deleting the account. The
 * database does the rules (docs/DATABASE.md); this does what it leaves to the
 * server: the ban hash, the date of birth call, the order of steps.
 */

export interface AuthDeps {
  provider: AuthProvider;
  sql: SqlClient;
  /** BAN_HASH_PEPPER. Never in the database or the repo. */
  pepper: string;
}

/** The username rule (the database has the same one as a check). */
export const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

/** What the server knows about a signed-in account. `null` profile: signed in, sign-up not finished. */
export interface AccountView {
  userId: string;
  method: string;
  profile: { username: string; role: string; age: number; underSixteen: boolean } | null;
}

/** Run as a signed-in player, the way a request carrying their token would: the database's own rules apply. */
export async function asUser<T>(
  sql: SqlClient,
  userId: string,
  work: (tx: SqlRunner) => Promise<T>,
): Promise<T> {
  return sql.transaction(async (tx) => {
    await tx.query('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated' }),
    ]);
    return work(tx);
  });
}

export async function accountOf(deps: AuthDeps, user: AuthUser): Promise<AccountView> {
  const r = await deps.sql.query<{ username: string; role: string; age: number }>(
    `select p.username, s.role,
            app.age_on(a.date_of_birth, app.today_sydney()) as age
       from public.profiles p
       join public.account_private a on a.user_id = p.user_id
       join public.account_status s on s.user_id = p.user_id
      where p.user_id = $1`,
    [user.id],
  );
  const row = r.rows[0];
  return {
    userId: user.id,
    method: user.method,
    profile: row
      ? { username: row.username, role: row.role, age: row.age, underSixteen: row.age < 16 }
      : null,
  };
}

/**
 * Is this username free? The answer is only yes or no. A taken name and a
 * name the word filter refuses both say no, so the answer never says whose
 * name it is or why. It is asked only by a signed-in player and is rate
 * limited by the route.
 */
export async function usernameFree(deps: AuthDeps, name: string): Promise<boolean> {
  if (!USERNAME.test(name)) return false;
  const r = await deps.sql.query<{ ok: boolean }>(
    `select not exists (select 1 from public.profiles where lower(username) = lower($1))
            and not app.blocked_word_in($1, false) as ok`,
    [name],
  );
  return r.rows[0]?.ok === true;
}

export type SignUpOutcome =
  | { result: 'signed_up' }
  | {
      result:
        | 'too_young'
        | 'banned'
        | 'signups_closed'
        | 'already_signed_up'
        | 'bad_date_of_birth'
        | 'username_taken'
        | 'bad_username'
        | 'rate_limited'
        | 'unavailable';
    };

/** `YYYY-MM-DD`, a real date, not in the future. The database checks again. */
export function parseDob(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  if (y < 1900 || t.getTime() > Date.now() + 14 * 3600_000) return null;
  return v;
}

/**
 * Finish sign-up: record the peppered hash of the sign-in email, then ask the
 * database to make the account with the date of birth. A banned hash is
 * refused by the database (the same function checks `ban_records`), and the
 * server also checks it first so the player gets no profile and the reason is
 * the same either way. Under 14 the database records the refusal against this
 * sign-in, so a second try with an older date gets the same answer.
 */
export async function finishSignUp(
  deps: AuthDeps,
  user: AuthUser,
  input: { username: string; displayName?: string; dob: string },
): Promise<SignUpOutcome> {
  const hash = user.email ? banHash(user.email, deps.pepper) : null;
  if (!hash) return { result: 'unavailable' };
  try {
    // A refusal already on record answers before anything else is touched.
    const refused = await deps.sql.query(
      'select 1 from public.signup_refusals where user_id = $1',
      [user.id],
    );
    if (refused.rowCount > 0) return { result: 'too_young' };
    const banned = await deps.sql.query(
      `select 1 from public.ban_records where email_hash = $1
          and (banned_until is null or banned_until > now())`,
      [hash],
    );
    if (banned.rowCount > 0) return { result: 'banned' };
    await deps.sql.query('select public.record_signup_email($1, $2)', [user.id, hash]);
    const r = await asUser(deps.sql, user.id, (tx) =>
      tx.query<{ r: string }>('select public.complete_sign_up($1, $2::date, $3) as r', [
        input.username,
        input.dob,
        input.displayName ?? null,
      ]),
    );
    return r.rows[0]?.r === 'too_young' ? { result: 'too_young' } : { result: 'signed_up' };
  } catch (e) {
    const err = e as { code?: string; hint?: string; constraint?: string };
    switch (err.hint) {
      case 'banned':
      case 'signups_closed':
      case 'already_signed_up':
      case 'bad_date_of_birth':
      case 'rate_limited':
        return { result: err.hint };
      case 'word_filter':
        return { result: 'username_taken' };
      default:
    }
    if (err.code === '23505') return { result: 'username_taken' };
    if (err.code === '23514') return { result: 'bad_username' };
    if (err.code === '22023') return { result: 'bad_date_of_birth' };
    console.error('Sign-up failed:', e instanceof Error ? e.message : e);
    return { result: 'unavailable' };
  }
}

export type ConvertOutcome = { moved: number; noRoom: boolean };

/**
 * Move a guest's farm into the account (`convert_guest`). If the account has
 * no room the database refuses and nothing moves: the guest's farm stays as it
 * was and the player is told.
 */
export async function convertGuest(
  deps: AuthDeps,
  guestSession: string,
  userId: string,
): Promise<ConvertOutcome> {
  const g = await deps.sql.query<{ id: string }>(
    `select id from public.guest_sessions where token_hash = $1 and converted_at is null`,
    [sessionHash(guestSession)],
  );
  const id = g.rows[0]?.id;
  if (!id) return { moved: 0, noRoom: false };
  try {
    const r = await deps.sql.transaction((tx) =>
      tx.query<{ n: number }>('select public.convert_guest($1, $2) as n', [id, userId]),
    );
    return { moved: r.rows[0]?.n ?? 0, noRoom: false };
  } catch (e) {
    const err = e as { hint?: string };
    if (err.hint === 'farm_limit') return { moved: 0, noRoom: true };
    throw e;
  }
}

/** The JSON the player downloads. The database builds it (no engine save, no action log). */
export async function myData(deps: AuthDeps, userId: string): Promise<unknown> {
  const r = await asUser(deps.sql, userId, (tx) =>
    tx.query<{ d: unknown }>('select public.export_my_data() as d'),
  );
  return r.rows[0]?.d ?? {};
}

/**
 * Delete an account. In this order: tell the database (a running ban keeps
 * its peppered hash), list and remove the account's files, then delete the
 * Auth user, which cascades the profile, farms, saves, posts and the rest as
 * DATABASE.md says. If a step fails nothing later runs, and the account is
 * still there to try again.
 */
export async function deleteAccount(deps: AuthDeps, user: AuthUser): Promise<void> {
  const hash = user.email ? banHash(user.email, deps.pepper) : null;
  await deps.sql.query('select public.prepare_account_deletion($1, $2)', [user.id, hash]);
  const files = await deps.sql.query<{ bucket: string; path: string }>(
    'select bucket, path from public.account_storage_paths($1)',
    [user.id],
  );
  if (files.rows.length) await deps.provider.removeFiles(files.rows);
  await deps.provider.deleteUser(user.id);
}

/** Fast Farms the account may have, and how many are going. */
export async function fastLimits(deps: AuthDeps, userId: string): Promise<{ limit: number; going: number }> {
  const r = await deps.sql.query<{ lim: number; going: number }>(
    `select public.farm_limit($1, null, 'fast') as lim,
            (select count(*)::int from public.farms f
              where f.owner_id = $1 and f.mode = 'fast' and f.status = 'active') as going`,
    [userId],
  );
  return { limit: r.rows[0]?.lim ?? 0, going: r.rows[0]?.going ?? 0 };
}

// ---- Feature switches: from the database when it is on, the shared defaults otherwise.

let switchCache: { at: number; on: Map<string, boolean> } | null = null;
const SWITCH_TTL_MS = 30_000;

/** Read the switches. A database that can't be read falls back to the shared defaults, so the site never breaks on it. */
export async function featureSwitches(
  sql: SqlClient | null,
  now = Date.now(),
): Promise<Record<FeatureSwitchKey, boolean>> {
  const base: Record<string, boolean> = { ...FEATURE_SWITCHES };
  if (!sql) return base as Record<FeatureSwitchKey, boolean>;
  if (!switchCache || now - switchCache.at > SWITCH_TTL_MS) {
    try {
      const r = await sql.query<{ key: string; enabled: boolean }>(
        'select key, enabled from public.feature_switches',
      );
      switchCache = { at: now, on: new Map(r.rows.map((x) => [x.key, x.enabled])) };
    } catch {
      return base as Record<FeatureSwitchKey, boolean>;
    }
  }
  for (const [k, v] of switchCache.on) if (k in base) base[k] = v;
  return base as Record<FeatureSwitchKey, boolean>;
}

export function resetSwitchCache(): void {
  switchCache = null;
}
