import 'server-only';
import { logFailure } from '../logging';
import { authDeps } from '../auth/deps';
import type { CookieJar } from '../auth/provider';
import type { SqlRunner } from '../db/sql';

/**
 * The admin role check. It runs on the server for every admin page and every admin route, and
 * the answer comes from two places only: the verified session (the auth server is asked, never
 * the cookie alone) and the `role` in the account's row in the database. Nothing the browser
 * sends (a header, a query, a body) is read.
 *
 * Three answers:
 * - `off`: accounts are not set up on this copy. The page says so; every route refuses.
 * - `denied`: signed out, not an admin, not finished sign-up, suspended or banned. Every one of
 *   these gets the same plain "not found", so nothing says that `/admin` exists.
 * - `ok`: an admin in good standing.
 */
export interface AdminSession {
  userId: string;
  username: string;
}

export type GateResult = { kind: 'off' } | { kind: 'denied' } | { kind: 'ok'; admin: AdminSession };

/** Is this account an admin in good standing right now? The username when it is, else null. */
export async function activeAdmin(sql: SqlRunner, userId: string): Promise<string | null> {
  const r = await sql.query<{ username: string }>(
    `select p.username
       from public.account_status s
       join public.profiles p on p.user_id = s.user_id
      where s.user_id = $1
        and s.role = 'admin'
        and s.banned_at is null
        and (s.suspended_until is null or s.suspended_until <= now())`,
    [userId],
  );
  return r.rows[0]?.username ?? null;
}

/** A jar that only reads: a page can not set cookies, so a stale token is simply not an admin. */
export function readOnlyJar(all: () => { name: string; value: string }[]): CookieJar {
  return { getAll: all, setAll: () => undefined };
}

export async function adminGate(jar: CookieJar): Promise<GateResult> {
  const deps = authDeps();
  if (!deps) return { kind: 'off' };
  try {
    const user = await deps.provider.user(jar);
    if (!user || user.anonymous) return { kind: 'denied' };
    const username = await activeAdmin(deps.sql, user.id);
    if (!username) return { kind: 'denied' };
    return { kind: 'ok', admin: { userId: user.id, username } };
  } catch (e) {
    // Fail closed: if the role can not be read, nobody is an admin.
    logFailure({ route: 'admin-gate', reason: 'gate_failed' }, e);
    return { kind: 'denied' };
  }
}
