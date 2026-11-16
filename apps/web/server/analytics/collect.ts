import 'server-only';
import {
  COLLECT_BODY_LIMIT,
  COLLECT_MAX_EVENTS,
  PUBLIC_PAGES,
  type AnalyticsEventName,
} from '@gg/shared/analytics';
import type { AuthDeps } from '../auth/accounts';
import { authDeps } from '../auth/deps';
import { authRoute, type AuthContext } from '../auth/route';
import { sqlFromEnv, type SqlClient } from '../db/sql';
import { GameError } from '../game/game';
import { readJson } from '../game/http';
import { logFailure } from '../logging';
import { guestConsent, readAccountConsent } from './consent';
import { checkEvent, type CheckedEvent, type Props } from './events';
import { collectionOn, countEvents, hashedUserId, posthogConfig, sendToPostHog } from './record';

/**
 * `/api/collect`: the first-party beacon (milestone 5.3). The browser sends a few events with
 * `navigator.sendBeacon`; no analytics script runs in the browser.
 *
 * In order: the shared CSRF rule (same site, JSON), a rate limit per player, a body of at most
 * 2 KB with at most 10 events, every event on the fixed list (one unknown name refuses the whole
 * beacon), then: nothing at all is kept unless the database is set, the analytics switch is on,
 * and this person said yes (a signed-in player by their choice in the database, a guest by the
 * consent cookie). It answers 204 with no body either way, so the answer says nothing about
 * whether anything was kept.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const noContent = (): Response => new Response(null, { status: 204 });

export interface Beacon {
  /** A random id this browser made for itself (guests). Ignored for a signed-in player. */
  id: string | null;
  events: CheckedEvent[];
}

/** Read and check a beacon's body. Throws a 400 for anything not on the list. */
export function parseBeacon(raw: unknown): Beacon {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new GameError(400, 'That request was not sent properly.');
  }
  const body = raw as { id?: unknown; ev?: unknown };
  if (!Array.isArray(body.ev) || body.ev.length === 0 || body.ev.length > COLLECT_MAX_EVENTS) {
    throw new GameError(400, 'That request was not sent properly.');
  }
  const events: CheckedEvent[] = [];
  for (const item of body.ev) {
    const e =
      typeof item === 'object' && item !== null
        ? checkEvent((item as { e?: unknown }).e, (item as { p?: unknown }).p, true)
        : null;
    if (!e) throw new GameError(400, 'That event is not one this site counts.');
    events.push(e);
  }
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null;
  return { id, events };
}

/** Who the events are for, if they may be kept at all. Null: keep nothing. */
async function allowedSubject(
  ctx: { req: Request; deps: AuthDeps | null; jar: AuthContext['jar'] },
  sql: SqlClient,
  installId: string | null,
): Promise<string | null> {
  const user = ctx.deps ? await ctx.deps.provider.session(ctx.jar).catch(() => null) : null;
  if (user && !user.anonymous && ctx.deps) {
    const c = await readAccountConsent(sql, user.id);
    return c.granted ? `u_${hashedUserId(ctx.deps.pepper, user.id)}` : null;
  }
  if (!guestConsent(ctx.req) || !installId) return null;
  return `g_${installId}`;
}

export async function handleCollect(
  ctx: AuthContext,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const beacon = parseBeacon(await readJson(ctx.req, COLLECT_BODY_LIMIT));
  const sql = ctx.deps?.sql ?? sqlFromEnv();
  if (!(await collectionOn(sql)) || !sql) return noContent();
  const subject = await allowedSubject(ctx, sql, beacon.id);
  if (!subject) return noContent();
  await countEvents(sql, beacon.events);
  await sendToPostHog(posthogConfig(), subject, beacon.events, fetchImpl);
  return noContent();
}

export const collectPost = authRoute(
  { name: 'collect', max: 60, write: true, by: 'session' },
  (ctx) => handleCollect(ctx),
);

/**
 * An event the server records where the thing happened (a farm started, a day done). The same
 * rules as the beacon: the switch, the consent, the fixed list. Never throws.
 */
export async function trackServer(
  req: Request,
  userId: string | null,
  name: AnalyticsEventName,
  props: Props = {},
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const e = checkEvent(name, props, false);
    const deps = authDeps();
    const sql = deps?.sql ?? sqlFromEnv();
    if (!e || !sql || !(await collectionOn(sql))) return false;
    let subject: string | null = null;
    if (userId && deps) {
      subject = (await readAccountConsent(sql, userId)).granted
        ? `u_${hashedUserId(deps.pepper, userId)}`
        : null;
    }
    // A guest's server-side events are counted but not sent on: the server has no install id.
    else if (!userId && guestConsent(req)) subject = '';
    if (subject === null) return false;
    await countEvents(sql, [e]);
    if (subject) await sendToPostHog(posthogConfig(), subject, [e], fetchImpl);
    return true;
  } catch (err) {
    logFailure({ route: 'analytics-track', reason: 'track_failed' }, err);
    return false;
  }
}

/**
 * The farm's day when a Next day or a skip has just ended the game, else null (farm_ended, m7
 * join). A farm already over is refused before it runs, so a game ends on one answer only.
 */
export function endedDays(out: unknown): number | null {
  const o = out as { ok?: unknown; snapshot?: { over?: unknown; day?: unknown } } | null;
  return o?.ok === true && o.snapshot?.over && typeof o.snapshot.day === 'number'
    ? o.snapshot.day
    : null;
}

const BOT = /bot|crawl|spider|slurp|lighthouse|headless|preview|monitor|curl|wget|python|java\//i;

/**
 * A public website page was asked for: count one view by page and day. No cookie is read or set,
 * no id is made, nothing is sent on. Bots, prefetches and anything that is not a page load are
 * left out. Called from the proxy after the page has been answered.
 */
export async function countWebsiteView(req: Request): Promise<boolean> {
  try {
    if (req.method !== 'GET') return false;
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    const page = (PUBLIC_PAGES as Record<string, string>)[path];
    if (!page) return false;
    const h = req.headers;
    if (BOT.test(h.get('user-agent') ?? '')) return false;
    if (h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) return false;
    if (h.get('next-router-prefetch') || h.get('rsc')) return false;
    if (!(h.get('accept') ?? '').includes('text/html')) return false;
    const e = checkEvent('website_view', { page }, false);
    const sql = authDeps()?.sql ?? sqlFromEnv();
    if (!e || !sql || !(await collectionOn(sql))) return false;
    await countEvents(sql, [e]);
    return true;
  } catch (err) {
    logFailure({ route: 'analytics-website', reason: 'count_failed' }, err);
    return false;
  }
}
