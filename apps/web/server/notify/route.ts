import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { logFailure } from '../logging';
import { authDeps } from '../auth/deps';
import { authRoute, callerKey, requireUser, type AuthContext } from '../auth/route';
import type { AuthUser } from '../auth/provider';
import { GameError } from '../game/game';
import { allow, fail, json, readJson } from '../game/http';
import { notifyDepsFor, type NotifyDeps } from './deps';

/**
 * The three kinds of route notifications have, and the only three. A test walks every file under
 * `app/api/notify` and fails if one does not go through one of them, so a new route can not skip
 * the sign-in check, the CSRF rule, the rate limit or the secret:
 *
 *  - `notifyRoute`: a signed-in player's own settings, devices and inbox. It is `authRoute` (the
 *    CSRF rule for writes, a limit for each session, no caching, plain errors) plus a verified
 *    sign-in. The account is the one the session names, never one the request names.
 *  - `cronRoute`: the sender, called by the scheduler with `Authorization: Bearer <CRON_SECRET>`,
 *    compared in constant time. No cookie is read.
 *  - `tokenRoute`: the unsubscribe link in an email. No sign-in and no cookie; the encrypted,
 *    expiring token is the credential. A limit for each address.
 */

export interface NotifyContext {
  ctx: AuthContext;
  user: AuthUser;
  nd: NotifyDeps;
  body: Record<string, unknown>;
}

export interface NotifyRouteOptions {
  name: string;
  max: number;
  write?: boolean;
}

export function notifyRoute(
  options: NotifyRouteOptions,
  handler: (c: NotifyContext) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return authRoute(
    {
      name: `notify-${options.name}`,
      max: options.max,
      write: options.write ?? false,
      by: 'session',
    },
    async (ctx) => {
      const { deps, user } = await requireUser(ctx);
      let body: Record<string, unknown> = {};
      if (options.write) {
        const raw = await readJson(ctx.req, 4096);
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          throw new GameError(400, 'That request was not sent properly.');
        }
        body = raw as Record<string, unknown>;
      }
      return handler({ ctx, user, nd: notifyDepsFor(deps), body });
    },
  );
}

/** Constant-time equality of two secrets of any length. */
export function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function cronRoute(
  name: string,
  secret: () => string | null,
  handler: (nd: NotifyDeps) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      // Bounds guessing: a few tries a minute from one caller, whoever they are.
      if (!allow(`notify-cron-${name}:${callerKey(req, 'address')}`, 30, 60_000)) {
        return fail(429, 'Too many requests.', { 'Retry-After': '60' });
      }
      const expected = secret();
      const header = req.headers.get('authorization') ?? '';
      const given = /^Bearer (.+)$/.exec(header)?.[1] ?? '';
      // With no secret set the route does not exist as far as anyone can tell.
      if (!expected || !given || !sameSecret(given, expected)) return fail(404, 'Not found.');
      const auth = authDeps();
      if (!auth) return json({ ok: true, skipped: 'not_set_up' });
      return json(await handler(notifyDepsFor(auth)));
    } catch (e) {
      logFailure({ route: `notify-${name}`, reason: 'cron_route_failed' }, e);
      return fail(500, 'Something went wrong on the server.');
    }
  };
}

export function tokenRoute(
  name: string,
  max: number,
  handler: (req: Request, nd: NotifyDeps) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      if (!allow(`notify-token-${name}:${callerKey(req, 'address')}`, max, 60_000)) {
        return new Response('Too many tries. Wait a minute and try again.', {
          status: 429,
          headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
        });
      }
      const auth = authDeps();
      if (!auth) return new Response('Not found.', { status: 404 });
      const res = await handler(req, notifyDepsFor(auth));
      res.headers.set('Cache-Control', 'no-store');
      res.headers.set('Referrer-Policy', 'no-referrer');
      res.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return res;
    } catch (e) {
      logFailure({ route: `notify-${name}`, reason: 'token_route_failed' }, e);
      return new Response('Something went wrong. Try again in a moment.', { status: 500 });
    }
  };
}
