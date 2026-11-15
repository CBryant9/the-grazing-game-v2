import 'server-only';
import { logFailure } from '../logging';
import { authDeps } from '../auth/deps';
import { callerKey } from '../auth/route';
import { jarFor } from '../auth/provider';
import { GameError } from '../game/game';
import { allow, fail } from '../game/http';
import { clearCookieText, cookieText } from '../security';
import { AdminError } from '../admin/errors';
import { adminGate, type AdminSession } from '../admin/gate';
import type { AuthDeps } from '../auth/accounts';

/**
 * A read-only admin route (a download). The same order as `adminRoute`: a light limit by address,
 * the role gate (everyone who is not an admin in good standing gets the same plain 404, and so
 * does a copy with no accounts), then a limit for each admin, then the handler. Cookies the
 * sign-in provider set go back with every answer. Only GET is exported by the routes.
 */
export function adminReadRoute(
  options: { name: string; max: number },
  handler: (ctx: { req: Request; admin: AdminSession; deps: AuthDeps }) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const jar = jarFor(req);
    let gated = false;
    const finish = (res: Response): Response => {
      res.headers.set('Cache-Control', 'no-store');
      if (gated) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
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
      if (gate.kind !== 'ok' || !deps) return finish(fail(404, 'Not found.'));
      gated = true;
      if (!allow(`admin-${options.name}:${gate.admin.userId}`, options.max, 60_000)) {
        return finish(
          fail(429, 'That was a lot of tries. Wait a minute and try again.', {
            'Retry-After': '60',
          }),
        );
      }
      return finish(await handler({ req, admin: gate.admin, deps }));
    } catch (e) {
      if (e instanceof AdminError || e instanceof GameError)
        return finish(fail(e.status, e.message));
      logFailure({ route: `admin-${options.name}`, reason: 'admin_route_failed' }, e);
      return finish(fail(500, 'Something went wrong on the server.'));
    }
  };
}
