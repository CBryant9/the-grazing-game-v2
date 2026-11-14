import 'server-only';
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
      const who = clientAddress(req) ?? 'shared';
      if (!allow(`auth-${options.name}:${who}`, options.max, options.windowMs ?? 60_000)) {
        return fail(429, 'That was a lot of tries. Wait a minute and try again.', {
          'Retry-After': '60',
        });
      }
      const jar = jarFor(req);
      const setCookies: string[] = [];
      const out = await handler({
        req,
        deps: authDeps(),
        jar,
        setCookies,
        origin: siteOrigin(req),
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
      console.error('Account route failed:', e instanceof Error ? e.message : e);
      return fail(500, 'Something went wrong on the server. Try again in a moment.');
    }
  };
}

/** The signed-in user, asked of the auth server, or a plain 401. */
export async function requireUser(ctx: AuthContext): Promise<{ deps: AuthDeps; user: AuthUser }> {
  if (!ctx.deps) throw new GameError(503, NOT_SET_UP);
  const user = await ctx.deps.provider.user(ctx.jar).catch(() => null);
  if (!user || user.anonymous) throw new GameError(401, 'Sign in first.');
  return { deps: ctx.deps, user };
}

/** A redirect to a path on this site. */
export function redirect(ctx: AuthContext, path: string): Response {
  return new Response(null, { status: 303, headers: { Location: `${ctx.origin}${path}` } });
}
