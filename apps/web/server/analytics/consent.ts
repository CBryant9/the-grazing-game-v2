import 'server-only';
import { CONSENT_COOKIE } from '@gg/shared';
import type { SqlClient } from '../db/sql';
import { GameError } from '../game/game';
import { readJson } from '../game/http';
import { cookieText } from '../security';
import { authRoute, type AuthContext } from '../auth/route';

/**
 * The analytics consent choice (PRD 12, milestone 5.3). Default no.
 *
 * - An account's choice is kept in `analytics_consent`, changed on the account page. An account
 *   under 16 (worked out from the date of birth in the database) is always no and can not say
 *   yes: the server refuses, and so does a trigger in the database.
 * - A guest's choice is kept in the `gg_analytics` cookie (`y` or `n`), for a year. It is not
 *   HttpOnly, so the page's small beacon can see the choice and send nothing without a yes. The
 *   server never trusts the cookie for a signed-in player: their choice in the database decides.
 */

export const CONSENT_MAX_AGE = 365 * 86400;

export interface AccountConsent {
  granted: boolean;
  /** Under 16, or no date of birth kept (sign-up not finished): no, and it can not change. */
  locked: boolean;
}

export async function readAccountConsent(sql: SqlClient, userId: string): Promise<AccountConsent> {
  const r = await sql.query<{ granted: boolean | null; locked: boolean }>(
    `select c.granted,
            (a.date_of_birth is null or app.age_on(a.date_of_birth, app.today_sydney()) < 16) as locked
       from (select $1::uuid as id) u
       left join public.account_private a on a.user_id = u.id
       left join public.analytics_consent c on c.user_id = u.id`,
    [userId],
  );
  const row = r.rows[0];
  const locked = row ? row.locked : true;
  return { granted: !locked && row?.granted === true, locked };
}

export const UNDER_16 = 'Analytics stays off for accounts under 16.';

export async function setAccountConsent(
  sql: SqlClient,
  userId: string,
  granted: boolean,
): Promise<AccountConsent> {
  const now = await readAccountConsent(sql, userId);
  if (now.locked && granted) throw new GameError(403, UNDER_16);
  await sql.query(
    `insert into public.analytics_consent (user_id, granted, decided_at) values ($1, $2, now())
     on conflict (user_id) do update set granted = excluded.granted, decided_at = now()`,
    [userId, granted && !now.locked],
  );
  return { granted: granted && !now.locked, locked: now.locked };
}

/** The guest's choice from the request's cookie: true only for an explicit `y`. */
export function guestConsent(req: Request): boolean {
  const cookies = (req.headers.get('cookie') ?? '').split(';').map((c) => c.trim());
  return cookies.includes(`${CONSENT_COOKIE}=y`);
}

/** The Set-Cookie text for the choice. Readable by the page (no HttpOnly), SameSite=Lax, a year. */
export function consentCookie(req: Request, granted: boolean): string {
  return cookieText(req, CONSENT_COOKIE, granted ? 'y' : 'n', CONSENT_MAX_AGE).replace(
    '; HttpOnly',
    '',
  );
}

export interface ConsentState {
  granted: boolean;
  /** Whether the choice can be changed here. */
  canChange: boolean;
  /** Whose choice it is. */
  who: 'account' | 'guest';
  /** Why it can not be changed, when it can not. */
  reason: 'under_16' | null;
}

async function signedIn(ctx: AuthContext): Promise<string | null> {
  if (!ctx.deps) return null;
  const user = await ctx.deps.provider.session(ctx.jar).catch(() => null);
  return user && !user.anonymous ? user.id : null;
}

async function stateFor(ctx: AuthContext, set?: boolean): Promise<ConsentState> {
  const userId = await signedIn(ctx);
  if (userId && ctx.deps) {
    const c =
      set === undefined
        ? await readAccountConsent(ctx.deps.sql, userId)
        : await setAccountConsent(ctx.deps.sql, userId, set);
    // The cookie follows the account's choice, so the beacon on this device matches it.
    ctx.setCookies.push(consentCookie(ctx.req, c.granted));
    return {
      granted: c.granted,
      canChange: !c.locked,
      who: 'account',
      reason: c.locked ? 'under_16' : null,
    };
  }
  const granted = set ?? guestConsent(ctx.req);
  if (set !== undefined) ctx.setCookies.push(consentCookie(ctx.req, set));
  return { granted, canChange: true, who: 'guest', reason: null };
}

/** `GET /api/consent`: the choice as it stands. */
export const consentGet = authRoute({ name: 'consent-read', max: 60, by: 'session' }, (ctx) =>
  stateFor(ctx),
);

/** `POST /api/consent` with `{ "granted": true | false }`: change the choice. */
export const consentPost = authRoute(
  { name: 'consent', max: 20, write: true, by: 'session' },
  async (ctx) => {
    const body = (await readJson(ctx.req, 256)) as { granted?: unknown };
    if (typeof body !== 'object' || body === null || typeof body.granted !== 'boolean') {
      throw new GameError(400, 'Say yes or no.');
    }
    return stateFor(ctx, body.granted);
  },
);
