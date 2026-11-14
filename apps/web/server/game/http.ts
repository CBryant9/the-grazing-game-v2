import { logFailure } from '../logging';
import 'server-only';
import { randomBytes } from 'node:crypto';
import { jarFor, type CookieJar, type CookieToSet } from '../auth/provider';
import { MAINTENANCE_CODE, maintenanceNotice } from '../admin/maintenance';
import { identify, type Player } from '../player';
import { clearCookieText, cookieText, csrfRefusal } from '../security';
import { GameError, gameServer, isSessionId } from './game';
import { gameStoreKind } from './kind';

export const SESSION_COOKIE = 'gg_session';
/**
 * How long a guest's cookie lasts, renewed each time the farm is played. With files it is
 * 90 days (the file store removes a farm not used for 90 days). With the database it is 30,
 * because the database removes a guest not seen for 30 days (docs/DATABASE.md, "Guests").
 */
const sessionDays = (): number => (gameStoreKind() === 'db' ? 30 : 90);
/** A line of fence is up to 400 segments, each about 30 bytes, so a request can be long. */
export const BODY_LIMIT = 32 * 1024;

/**
 * Farm creation for callers with no session (milestone 1.7f). A session id
 * is a cookie the caller makes up, so creation is never keyed on it: it is
 * keyed on the caller's address, with a cap on all creations as a backstop.
 */
/** Farms one address may start in `CREATE_WINDOW_MS`. */
export const CREATES_PER_ADDRESS = 5;
export const CREATE_WINDOW_MS = 10 * 60_000;
/** Farms the whole server may start in a minute, whoever asks. */
export const CREATES_PER_MINUTE = 30;

/**
 * The environment variable naming the header a trusted proxy sets to the
 * caller's address (for example `x-real-ip` on Vercel). Unset, no header is
 * trusted: a client can write any header it likes.
 */
export const TRUSTED_IP_HEADER_ENV = 'GG_TRUSTED_IP_HEADER';

const HEADERS = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' };

/** Every game response is JSON and is never cached. */
export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extra } });
}

/** A plain message and nothing else: no stack, no internals. */
export function fail(
  status: number,
  message: string,
  extra: Record<string, string> = {},
  code?: string,
): Response {
  return json(code ? { error: message, code } : { error: message }, status, extra);
}

function cookieOf(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export function sessionFrom(req: Request): string | null {
  const id = cookieOf(req, SESSION_COOKIE);
  return isSessionId(id) ? id : null;
}

function setCookie(req: Request, id: string): string {
  return cookieText(req, SESSION_COOKIE, id, sessionDays() * 86400);
}

const TOO_BIG = 'That request was too big.';

/**
 * Read a small JSON body. A body over the limit is refused before it is
 * read when it says its length, and cut off as it arrives when it does not
 * (or says a false one). Anything else that is not JSON is a plain 400.
 */
export async function readJson(req: Request, limit = BODY_LIMIT): Promise<unknown> {
  const said = req.headers.get('content-length');
  if (said !== null && (!/^\d+$/.test(said.trim()) || Number(said) > limit)) {
    throw new GameError(413, TOO_BIG);
  }
  const text = await readCapped(req, limit);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new GameError(400, 'That request was not sent properly.');
  }
}

/** The body as text, stopping as soon as it passes `limit` bytes. */
async function readCapped(req: Request, limit: number): Promise<string> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw new GameError(413, TOO_BIG);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/**
 * The caller's address as the platform reports it, or null when the app is
 * not told it sits behind a trusted proxy. Only the header the environment
 * names is read. For `x-forwarded-for` the last entry is taken: it is the
 * one the trusted proxy added, while earlier ones came from the client.
 */
export function clientAddress(req: Request): string | null {
  const header = process.env[TRUSTED_IP_HEADER_ENV]?.trim().toLowerCase();
  if (!header) return null;
  const value = req.headers.get(header);
  if (!value) return null;
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const ip = header === 'x-forwarded-for' ? parts[parts.length - 1] : parts[0];
  return ip && ip.length <= 64 ? ip : null;
}

// ---- A light rate limit, in memory.

interface Bucket {
  from: number;
  count: number;
}
const buckets = new Map<string, Bucket>();

/** True if this key may go ahead. A fixed window of `windowMs`, `max` requests. */
export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || now - b.from >= windowMs) {
    buckets.set(key, { from: now, count: 1 });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now - v.from >= windowMs) buckets.delete(k);
    }
    return true;
  }
  b.count++;
  return b.count <= max;
}

export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * May this caller start a farm now? Keyed on the address the platform
 * reports (all callers with no known address share one count), and on a cap
 * for the whole server.
 */
export function allowCreate(req: Request, now = Date.now()): boolean {
  const who = clientAddress(req) ?? 'unknown';
  if (!allow(`create-address:${who}`, CREATES_PER_ADDRESS, CREATE_WINDOW_MS, now)) return false;
  return allow('create-all', CREATES_PER_MINUTE, 60_000, now);
}

export interface RouteOptions {
  /** Start a session if the visitor has none. Only the create route does. */
  mint?: boolean;
  /** Requests allowed in ten seconds. */
  max?: number;
  /** A name for the limit, so a slow route does not share a count with a quick one. */
  name: string;
  /** True for anything that changes a farm: a cross-site request is refused. */
  write?: boolean;
  /**
   * True for a route that loads the farm: the session cookie is sent again
   * with a fresh Max-Age, so a farm that is played is never removed as stale.
   */
  renew?: boolean;
}

export interface RouteContext {
  req: Request;
  /**
   * What names the farm for the game server: the guest session, or `farm:` and
   * the id of the account's open farm. Null when there is none yet.
   */
  sessionId: string | null;
  /** Who is asking (signed in or a guest), and which farm is theirs. */
  player: Player;
  /** The sign-in cookie jar, for routes that talk to the sign-in provider. */
  jar: CookieJar & { out: CookieToSet[] };
  /** Cookies to set on the answer, as full Set-Cookie text. */
  setCookies: string[];
}

const SLOW_DOWN = 'That was a lot of requests. Wait a few seconds and try again.';

/**
 * Wrap a route: session, rate limit, same-site check, plain errors. The
 * handler returns data (sent as JSON) or a Response.
 */
export function route(
  options: RouteOptions,
  handler: (ctx: RouteContext) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      // One CSRF rule for every state-changing route, game and account (server/security.ts).
      const refusal = options.write ? csrfRefusal(req) : null;
      if (refusal) return fail(403, refusal);
      const sent = sessionFrom(req);
      // A guest session whose farm moved into an account is finished: it is treated as no session.
      const existing = sent && (await gameServer().sessionUsable(sent)) ? sent : null;
      // The limit's key is worked out before any session is made, and never
      // from a session the caller could have made up to get a fresh count.
      const who = existing ?? clientAddress(req) ?? 'guest';
      if (!allow(`${options.name}:${who}`, options.max ?? 100, 10_000)) {
        return fail(429, SLOW_DOWN, { 'Retry-After': '10' });
      }
      if (options.mint && !allowCreate(req)) {
        return fail(429, 'A lot of farms were started just now. Wait a minute and try again.', {
          'Retry-After': '60',
        });
      }
      const jar = jarFor(req);
      const player = await identify(req, jar, existing);
      // Maintenance mode (admin switch): everyone but an admin is told the game is down, before
      // anything on the farm is touched. See server/admin/maintenance.ts.
      const down = await maintenanceNotice(player.user?.id ?? null);
      if (down) throw new GameError(503, down, MAINTENANCE_CODE);
      // A signed-in player with a finished account has farms named by the account, so no guest
      // session is made for them. Anyone else (a visitor, a sign-in not finished, a sign-in
      // refused as under 14) plays as a guest, with a session made and renewed as for anyone.
      const account = player.user !== null && player.signedUp;
      const minted = !existing && options.mint && !account ? randomBytes(16).toString('hex') : null;
      const setCookies: string[] = [];
      const out = await handler({
        req,
        sessionId: account && player.key ? player.key : (existing ?? minted),
        player: { ...player, guestSession: existing ?? minted },
        jar,
        setCookies,
      });
      const fresh = minted ?? (options.renew && !account ? existing : null);
      if (fresh) setCookies.push(setCookie(req, fresh));
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
      // The detail stays in the server log. The player gets a plain line.
      logFailure({ route: `game-${options.name}`, reason: 'game_route_failed' }, e);
      return fail(500, 'Something went wrong on the server. Try again in a moment.');
    }
  };
}
