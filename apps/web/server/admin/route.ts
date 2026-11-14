import 'server-only';
import { logFailure } from '../logging';
import { callerKey } from '../auth/route';
import { authDeps } from '../auth/deps';
import type { AuthDeps } from '../auth/accounts';
import { jarFor } from '../auth/provider';
import { GameError } from '../game/game';
import { allow, fail, json, readJson } from '../game/http';
import { clearCookieText, cookieText, csrfRefusal } from '../security';
import { AdminError } from './errors';
import { adminGate, type AdminSession } from './gate';

export { AdminError };

export interface AdminContext {
  req: Request;
  admin: AdminSession;
  deps: AuthDeps;
  /** The parsed JSON body (a small object) for a write. */
  body: Record<string, unknown>;
}

export interface AdminRouteOptions {
  /** A name for the limits. */
  name: string;
  /** Changes an admin may make in a minute. */
  max: number;
  /** The most bytes a body may have. Small by default. */
  bodyLimit?: number;
}

const NOT_FOUND = 'Not found.';
const NOINDEX = 'noindex, nofollow';

/**
 * Wrap an admin write route. In order:
 *
 * 1. A light limit by the caller's address (the trusted header: never a cookie the caller writes,
 *    so changing a cookie gives no fresh count), before anything else is asked.
 * 2. The role gate. Everyone who is not an admin in good standing gets the same plain 404 (no
 *    `X-Robots-Tag`, nothing that tells it from an unknown address), and so does a copy with no accounts.
 * 3. The shared CSRF rule (security.ts): same site, JSON body.
 * 4. A limit for each admin, by id, on this route.
 * 5. The handler, which does its change and writes its audit row in one transaction.
 *
 * Whatever the answer, every cookie the sign-in provider set is sent with it. The gate asks the
 * auth server, which may refresh an expired session and spend its refresh token; the new tokens
 * must reach the browser or the next request is signed out. Only answers given after the gate
 * passed carry `X-Robots-Tag: noindex`.
 *
 * Only POST is exported by the routes, so a GET is the framework's 405.
 */
export function adminRoute(
  options: AdminRouteOptions,
  handler: (ctx: AdminContext) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const jar = jarFor(req);
    let gated = false;
    const finish = (res: Response): Response => {
      res.headers.set('Cache-Control', 'no-store');
      if (gated) res.headers.set('X-Robots-Tag', NOINDEX);
      for (const c of jar.out) {
        res.headers.append(
          'Set-Cookie',
          c.value === '' || c.maxAge === 0
            ? clearCookieText(req, c.name)
            : cookieText(req, c.name, encodeURIComponent(c.value), c.maxAge ?? 400 * 86400),
        );
      }
      return res;
    };
    try {
      if (!allow(`admin-pre:${callerKey(req, 'address')}`, 120, 60_000)) {
        return finish(
          fail(429, 'That was a lot of tries. Wait a minute and try again.', {
            'Retry-After': '60',
          }),
        );
      }
      const gate = await adminGate(jar);
      const deps = authDeps();
      if (gate.kind !== 'ok' || !deps) return finish(fail(404, NOT_FOUND));
      gated = true;
      // After the gate, so a visitor who is not an admin can not tell this route exists by what
      // the CSRF rule says. A real admin's cookies never ride a cross-site POST (SameSite=Lax).
      const refusal = csrfRefusal(req);
      if (refusal) return finish(fail(403, refusal));
      if (!allow(`admin-${options.name}:${gate.admin.userId}`, options.max, 60_000)) {
        return finish(
          fail(429, 'That was a lot of changes. Wait a minute and try again.', {
            'Retry-After': '60',
          }),
        );
      }
      const raw = await readJson(req, options.bodyLimit ?? 4096);
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new AdminError(400, 'That request was not sent properly.');
      }
      const out = await handler({
        req,
        admin: gate.admin,
        deps,
        body: raw as Record<string, unknown>,
      });
      return finish(json(out ?? { ok: true }, 200));
    } catch (e) {
      if (e instanceof AdminError || e instanceof GameError)
        return finish(fail(e.status, e.message));
      logFailure({ route: `admin-${options.name}`, reason: 'admin_route_failed' }, e);
      return finish(fail(500, 'Something went wrong on the server. Nothing was changed.'));
    }
  };
}
