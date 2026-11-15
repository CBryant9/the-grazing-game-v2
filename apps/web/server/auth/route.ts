import { logFailure } from '../logging';
import 'server-only';
import { createHash } from 'node:crypto';
import { GameError } from '../game/game';
import { allow, clientAddress, fail, json } from '../game/http';
import { clearCookieText, cookieText, csrfRefusal, siteOrigin } from '../security';
import type { AuthDeps } from './accounts';
import { authDeps } from './deps';
import { jarFor, type AuthUser, type CookieJar, type CookieToSet } from './provider';

export interface AuthContext {
  req: Request;
  /** Null when accounts are not set up. Routes that need them answer `NOT_SET_UP`. */
  deps: AuthDeps | null;
  jar: CookieJar & { out: CookieToSet[] };
  /** Cookies to set on the answer, as full Set-Cookie text. */
  setCookies: string[];
  /** This site's own address, for links that come back to it. */
  origin: string;
  /** The caller's address for limits, or a shared name when none is trusted. */
  who: string;
}

export const NOT_SET_UP = 'Sign-in is not set up on this copy of the game yet.';

export interface AuthRouteOptions {
  /** A name for the limit. */
  name: string;
  /** Requests allowed in `windowMs` from one address. */
  max: number;
  windowMs?: number;
  /** True for anything that changes something: the shared CSRF rule applies. */
  write?: boolean;
  /**
   * What the limit counts. `address` (the default) is for the routes a visitor with no session
   * uses (sign-in). `session` counts each signed-in player on their own, by the account id the
   * provider verified, so players behind one address (a farm's wifi, a phone network) do not use
   * each other's allowance. With no verified sign-in it falls back to the address.
   */
  by?: 'address' | 'session';
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 24);

/**
 * The caller for a limit, by address. Never one bucket for everybody: with no trusted address (a
 * developer's machine; production does not turn accounts on without one) callers are told apart
 * by their browser's own headers, which is weak, but only ever limits a caller more narrowly.
 *
 * It never reads a cookie. Cookie text is written by the caller, so a key made from it gave a fresh
 * count for every made-up `sb-*` cookie (security review, m5.5). A signed-in player is counted on
 * their own by `sessionCallerKey`, from the account id the provider verified.
 */
export function callerKey(req: Request, by?: 'address'): string;
export function callerKey(req: Request): string {
  const address = clientAddress(req);
  if (address) return `a:${address}`;
  return `u:${sha(`${req.headers.get('user-agent') ?? ''}|${req.headers.get('accept-language') ?? ''}`)}`;
}

/**
 * The caller for a `session` limit: the verified account id, or the address. The provider's
 * `session` checks the token's signature and only looks at the project's own sign-in cookie, so a
 * junk cookie verifies as nobody and is counted with its address, never in a bucket of its own.
 */
export async function sessionCallerKey(
  req: Request,
  deps: AuthDeps | null,
  jar: CookieJar,
): Promise<string> {
  if (deps) {
    const user = await deps.provider.session(jar).catch(() => null);
    if (user && !user.anonymous && /^[0-9A-Za-z-]{1,64}$/.test(user.id)) return `id:${user.id}`;
  }
  return callerKey(req);
}

/**
 * Wrap a sign-in or account route: the shared CSRF rule for writes, a rate
 * limit by address, the sign-in cookie jar (HttpOnly, SameSite=Lax, path /,
 * Secure in production), no caching, and plain errors. A thrown `GameError`
 * is answered with its status and message and nothing more.
 */
export function authRoute(
  options: AuthRouteOptions,
  handler: (ctx: AuthContext) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      const refusal = options.write ? csrfRefusal(req) : null;
      if (refusal) return fail(403, refusal);
      const jar = jarFor(req);
      const deps = authDeps();
      const who =
        options.by === 'session' ? await sessionCallerKey(req, deps, jar) : callerKey(req);
      if (!allow(`auth-${options.name}:${who}`, options.max, options.windowMs ?? 60_000)) {
        const res = fail(429, 'That was a lot of tries. Wait a minute and try again.', {
          'Retry-After': '60',
        });
        // Checking the session may have refreshed it. The new tokens go out on the refusal too.
        for (const c of jar.out) {
          res.headers.append(
            'Set-Cookie',
            c.value === '' || c.maxAge === 0
              ? clearCookieText(req, c.name)
              : cookieText(req, c.name, encodeURIComponent(c.value), c.maxAge ?? 400 * 86400),
          );
        }
        return res;
      }
      const setCookies: string[] = [];
      const out = await handler({
        req,
        deps,
        jar,
        setCookies,
        // Only worked out when accounts are on: with them off it is not needed, and in
        // production it needs GG_SITE_URL, which an off copy does not have.
        origin: deps ? siteOrigin(req) : '',
        who,
      });
      for (const c of jar.out) {
        setCookies.push(
          c.value === '' || c.maxAge === 0
            ? clearCookieText(req, c.name)
            : cookieText(req, c.name, encodeURIComponent(c.value), c.maxAge ?? 400 * 86400),
        );
      }
      const res = out instanceof Response ? out : json(out, 200);
      for (const c of setCookies) res.headers.append('Set-Cookie', c);
      res.headers.set('Cache-Control', 'no-store');
      return res;
    } catch (e) {
      if (e instanceof GameError) return fail(e.status, e.message, {}, e.code);
      logFailure({ route: `auth-${options.name}`, reason: 'account_route_failed' }, e);
      return fail(500, 'Something went wrong on the server. Try again in a moment.');
    }
  };
}

/** The signed-in user, asked of the auth server, or a plain 401. */
export async function requireUser(ctx: AuthContext): Promise<{ deps: AuthDeps; user: AuthUser }> {
  if (!ctx.deps) throw new GameError(404, NOT_SET_UP);
  const user = await ctx.deps.provider.user(ctx.jar).catch(() => null);
  if (!user || user.anonymous) throw new GameError(401, 'Sign in first.');
  return { deps: ctx.deps, user };
}

/** A redirect to a path on this site. */
export function redirect(ctx: AuthContext, path: string): Response {
  return new Response(null, { status: 303, headers: { Location: `${ctx.origin}${path}` } });
}
