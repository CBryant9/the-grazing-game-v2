import 'server-only';
import { allow, clientAddress, readJson } from '../game/http';
import { GameError } from '../game/game';
import { csrfRefusal } from '../security';
import { reportError, scrubMessage } from './sentry';

/**
 * `/api/client-error` (milestone 5.5): the one place a browser error reaches the server. The game
 * page and the signed-in pages carry a few hundred bytes of script (lib/clientErrorScript.ts) that
 * sends an uncaught error or a rejected promise here with `sendBeacon`. The server forwards it to
 * Sentry (server/errors/sentry.ts) when `SENTRY_DSN` is set, and does nothing else with it.
 *
 * The shape is fixed: `kind`, `name`, `message`, `stack` and `route`, all short strings, and
 * nothing more. The same CSRF rule as every other state-changing route, a body limit, and a rate
 * limit per caller with a cap for the whole server. The message is scrubbed and cut short before
 * it goes anywhere, and is never written to the server log. The answer is always empty.
 */

/** The largest body taken. A stack cut to 2,000 characters fits with room to spare. */
export const CLIENT_ERROR_BODY_LIMIT = 4096;
/** Reports one caller may send in a minute. */
export const CLIENT_ERRORS_PER_MINUTE = 10;
/** Reports the whole server takes in a minute, whoever sends them. */
export const CLIENT_ERRORS_ALL_PER_MINUTE = 120;

const KEYS = new Set(['kind', 'name', 'message', 'stack', 'route']);
const MAX: Record<string, number> = { name: 60, message: 300, stack: 2400, route: 300 };

/** The words a page path may keep. Anything else in a path (an id, a username) becomes `:id`. */
const PAGE_FIRST = new Set([
  'play',
  'account',
  'store',
  'purchase',
  'sign-in',
  'sign-up',
  'community',
  'admin',
]);
const PAGE_WORDS = new Set([
  ...PAGE_FIRST,
  'notifications',
  'success',
  'cancelled',
  'check-email',
  'finish',
  'u',
  'farm',
  'post',
  'groups',
  'people',
  'requests',
  'me',
  'followers',
  'following',
  'ads',
  'campaigns',
  'sponsors',
  'report',
  'stats',
  'users',
  'moderation',
  'photos',
  'words',
  'challenges',
  'switches',
  'settings',
  'audit',
  'purchases',
]);

/** A page path as a template with no ids, names or query, or `other`. */
export function pageTemplate(path: unknown): string {
  if (typeof path !== 'string' || !path.startsWith('/')) return 'other';
  const parts = path
    .replace(/[?#].*$/, '')
    .split('/')
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 6 || !PAGE_FIRST.has(parts[0]!)) return 'other';
  return `/${parts.map((p) => (PAGE_WORDS.has(p) ? p : ':id')).join('/')}`;
}

interface ClientReport {
  kind: 'error' | 'rejection';
  name: string;
  message: string;
  stack: string;
  route: string;
}

/** The report, if the body has exactly the fixed shape. */
export function parseClientReport(body: unknown): ClientReport | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!KEYS.has(k)) return null;
  if (b.kind !== 'error' && b.kind !== 'rejection') return null;
  const out: Record<string, string> = {};
  for (const k of ['name', 'message', 'stack', 'route']) {
    const v = b[k] ?? '';
    if (typeof v !== 'string' || v.length > MAX[k]!) return null;
    out[k] = v;
  }
  return { kind: b.kind, ...(out as Omit<ClientReport, 'kind'>) };
}

const empty = (status: number): Response =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

export async function clientErrorRoute(req: Request): Promise<Response> {
  if (csrfRefusal(req)) return empty(403);
  const who = clientAddress(req) ?? 'unknown';
  if (!allow(`client-error:${who}`, CLIENT_ERRORS_PER_MINUTE, 60_000)) return empty(429);
  if (!allow('client-error-all', CLIENT_ERRORS_ALL_PER_MINUTE, 60_000)) return empty(429);
  let body: unknown;
  try {
    body = await readJson(req, CLIENT_ERROR_BODY_LIMIT);
  } catch (e) {
    return empty(e instanceof GameError ? e.status : 400);
  }
  const report = parseClientReport(body);
  if (!report) return empty(400);
  const route = pageTemplate(report.route);
  const reason = report.kind === 'error' ? 'window_error' : 'unhandled_rejection';
  const errorClass = /^[A-Za-z0-9_]{1,40}$/.test(report.name) ? report.name : 'unknown';
  // The line names the page, the reason and the class. Never the message or the stack.
  console.error(`failed route=client:${route} reason=${reason} error=${errorClass}`);
  void reportError({
    source: 'browser',
    route,
    reason,
    errorClass,
    message: scrubMessage(report.message),
    stack: report.stack,
  });
  return empty(204);
}
