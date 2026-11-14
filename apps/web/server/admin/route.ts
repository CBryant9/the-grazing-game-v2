import 'server-only';
import { logFailure } from '../logging';
import { callerKey } from '../auth/route';
import { authDeps } from '../auth/deps';
import type { AuthDeps } from '../auth/accounts';
import { jarFor } from '../auth/provider';
import { GameError } from '../game/game';
import { allow, fail, json, readJson } from '../game/http';
import { csrfRefusal } from '../security';
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

const HEADERS = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' };
const NOT_FOUND = 'Not found.';

const plain = (status: number, message: string, extra: Record<string, string> = {}): Response => {
  const res = fail(status, message, extra);
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
};

/**
 * Wrap an admin write route. In order:
 *
 * 1. A light limit for every caller by address or session, before anything else is asked, so
 *    the route can not be used to probe for admins.
 * 2. The role gate. Everyone who is not an admin in good standing gets the same 404, and so does
 *    a copy with no accounts.
 * 3. The shared CSRF rule (security.ts): same site, JSON body.
 * 4. A limit for each admin on this route.
 * 5. The handler, which does its change and writes its audit row in one transaction.
 *
 * Only POST is exported by the routes, so a GET is the framework's 405.
 */
export function adminRoute(
  options: AdminRouteOptions,
  handler: (ctx: AdminContext) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      if (!allow(`admin-pre:${callerKey(req, 'session')}`, 120, 60_000)) {
        return plain(429, 'That was a lot of tries. Wait a minute and try again.', {
          'Retry-After': '60',
        });
      }
      const gate = await adminGate(jarFor(req));
      const deps = authDeps();
      if (gate.kind !== 'ok' || !deps) return plain(404, NOT_FOUND);
      // After the gate, so a visitor who is not an admin can not tell this route exists by what
      // the CSRF rule says. A real admin's cookies never ride a cross-site POST (SameSite=Lax).
      const refusal = csrfRefusal(req);
      if (refusal) return plain(403, refusal);
      if (!allow(`admin-${options.name}:${gate.admin.userId}`, options.max, 60_000)) {
        return plain(429, 'That was a lot of changes. Wait a minute and try again.', {
          'Retry-After': '60',
        });
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
      const res = json(out ?? { ok: true }, 200);
      for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof AdminError || e instanceof GameError) return plain(e.status, e.message);
      logFailure({ route: `admin-${options.name}`, reason: 'admin_route_failed' }, e);
      return plain(500, 'Something went wrong on the server. Nothing was changed.');
    }
  };
}
