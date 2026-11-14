import 'server-only';
import type { FeatureSwitchKey } from '@gg/shared';
import { logFailure } from '../logging';
import { authDeps } from '../auth/deps';
import { featureSwitches, type AuthDeps } from '../auth/accounts';
import type { CookieJar } from '../auth/provider';

/**
 * Who may use the community, decided on the server for every page and route (PRD 8.3, 9).
 *
 * Every answer comes from the verified sign-in and the database, never from anything the browser
 * sends. The answers:
 *
 * - `off`: there is no database on this copy, or the Community switch (or the part's own) is off.
 * - `denied`: not signed in, sign-up not finished, under 16 today (Sydney date), banned or
 *   suspended. The database's own rules (`app.member_raw`) say who is a member, so this is the
 *   same test the row level security uses, and it opens on the 16th birthday by itself.
 * - `ok`: a member.
 *
 * Pages and routes turn `off` and `denied` into the same plain "not found", so nothing says
 * the community exists to someone who may not use it. An admin follows the same rule while the
 * switch is off: the database lets an admin through with the switches off, but this site does not
 * show a community page, link or route anywhere until the switch is on.
 */
export interface Member {
  userId: string;
  username: string;
}

export type CommunityPart = Extract<
  FeatureSwitchKey,
  'feed_posts' | 'groups' | 'farm_viewing' | 'activity_ticker' | 'leaderboards'
>;

export type Gate =
  { kind: 'off' } | { kind: 'denied' } | { kind: 'ok'; me: Member; deps: AuthDeps };

export async function communityGate(
  jar: CookieJar,
  options: { refresh?: boolean; part?: CommunityPart } = {},
): Promise<Gate> {
  const deps = authDeps();
  if (!deps) return { kind: 'off' };
  try {
    const switches = await featureSwitches(deps.sql);
    if (!switches.community) return { kind: 'off' };
    if (options.part && !switches[options.part]) return { kind: 'off' };
    // A route may refresh an expired session (and sends the new cookies back). A page may not.
    const user =
      options.refresh === false ? await deps.provider.verify(jar) : await deps.provider.user(jar);
    if (!user || user.anonymous) return { kind: 'denied' };
    const r = await deps.sql.query<{ username: string; member: boolean }>(
      `select p.username, app.member_raw(p.user_id) as member
         from public.profiles p where p.user_id = $1`,
      [user.id],
    );
    const row = r.rows[0];
    if (!row || !row.member) return { kind: 'denied' };
    return { kind: 'ok', me: { userId: user.id, username: row.username }, deps };
  } catch (e) {
    // Fail closed: if it can not be read, nobody is a member.
    logFailure({ route: 'community-gate', reason: 'gate_failed' }, e);
    return { kind: 'denied' };
  }
}
