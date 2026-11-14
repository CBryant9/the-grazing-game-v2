import 'server-only';
import { logFailure } from '../logging';
import { callerKey } from '../auth/route';
import { asUser, type AuthDeps } from '../auth/accounts';
import { jarFor } from '../auth/provider';
import { GameError } from '../game/game';
import { allow, fail, json, readJson } from '../game/http';
import { clearCookieText, cookieText, csrfRefusal } from '../security';
import type { SqlRunner } from '../db/sql';
import { CommunityError, fromDatabase } from './errors';
import { communityGate, type CommunityPart, type Member } from './gate';
import { TextError } from './text';
import { ImageError } from './image';

export { CommunityError };

export interface CommunityContext {
  req: Request;
  me: Member;
  deps: AuthDeps;
  /** The parsed JSON body for a write. Empty for a read. */
  body: Record<string, unknown>;
  url: URL;
  /** Run as the signed-in player, so the database's own rules apply to every statement. */
  run: <T>(work: (tx: SqlRunner) => Promise<T>) => Promise<T>;
}

export interface CommunityRouteOptions {
  /** A name for the limits. */
  name: string;
  /** Requests one member may make in a minute on this route. */
  max: number;
  /** The most bytes a body may have. Small by default. */
  bodyLimit?: number;
  /** The part of the community the route belongs to, for its own switch. */
  part?: CommunityPart;
  /** `GET` for a read (no body, no CSRF rule). `POST` (the default) for anything that changes something. */
  method?: 'GET' | 'POST';
}

const NOT_FOUND = 'Not found.';

/**
 * Wrap a community route. In order:
 *
 * 1. A light limit by the caller's address (the trusted header), before anything is asked.
 * 2. The gate: a member, with the community switch (and the part's own) on. Everyone else gets
 *    the same plain 404 (a visitor, an account under 16, a banned or suspended one, no database).
 * 3. For a write: the shared CSRF rule (security.ts), after the gate, so a visitor who is not a
 *    member can not tell the route exists from what the rule says.
 * 4. A limit for each member, by id, on this route.
 * 5. The handler. `ctx.run` runs its statements as the player, so a row the player may not see
 *    or change is refused by the database whatever the browser sent.
 *
 * Every cookie the sign-in provider set rides on the answer (the gate may refresh an expired
 * session). Answers that passed the gate say `noindex` and are never cached.
 */
export function communityRoute(
  options: CommunityRouteOptions,
  handler: (ctx: CommunityContext) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  const method = options.method ?? 'POST';
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
      if (!allow(`community-pre:${callerKey(req, 'address')}`, 240, 60_000)) {
        return finish(
          fail(429, 'That was a lot of tries. Wait a minute and try again.', {
            'Retry-After': '60',
          }),
        );
      }
      const gate = await communityGate(jar, { part: options.part });
      if (gate.kind !== 'ok') return finish(fail(404, NOT_FOUND));
      gated = true;
      if (method === 'POST') {
        const refusal = csrfRefusal(req);
        if (refusal) return finish(fail(403, refusal));
      }
      if (!allow(`community-${options.name}:${gate.me.userId}`, options.max, 60_000)) {
        return finish(
          fail(429, 'That was a lot in a short time. Wait a minute and try again.', {
            'Retry-After': '60',
          }),
        );
      }
      let body: Record<string, unknown> = {};
      if (method === 'POST') {
        const raw = await readJson(req, options.bodyLimit ?? 8192);
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          throw new CommunityError(400, 'That request was not sent properly.');
        }
        body = raw as Record<string, unknown>;
      }
      const out = await handler({
        req,
        me: gate.me,
        deps: gate.deps,
        body,
        url: new URL(req.url),
        run: (work) => asUser(gate.deps.sql, gate.me.userId, work),
      });
      return finish(out instanceof Response ? out : json(out ?? { ok: true }, 200));
    } catch (e) {
      if (e instanceof CommunityError) return finish(fail(e.status, e.message, {}, e.code));
      if (e instanceof GameError) return finish(fail(e.status, e.message));
      if (e instanceof TextError || e instanceof ImageError) return finish(fail(400, e.message));
      const known = fromDatabase(e);
      if (known) return finish(fail(known.status, known.message, {}, known.code));
      logFailure({ route: `community-${options.name}`, reason: 'community_route_failed' }, e);
      return finish(fail(500, 'Something went wrong on the server. Nothing was changed.'));
    }
  };
}
