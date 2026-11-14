import 'server-only';
import { randomBytes } from 'node:crypto';
import { GameError, isSessionId } from './game';

export const SESSION_COOKIE = 'gg_session';
const SESSION_DAYS = 90;
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
): Response {
  return json({ error: message }, status, extra);
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
  const secure =
    req.url.startsWith('https:') || req.headers.get('x-forwarded-proto') === 'https'
      ? '; Secure'
      : '';
  return `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
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
  /** The session, or null for a visitor with none yet. */
  sessionId: string | null;
}

/** The same site only: a browser that names another origin is refused. */
function sameSite(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get('host') ?? new URL(req.url).host);
  } catch {
    return false;
  }
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
      if (options.write && !sameSite(req)) {
        return fail(403, 'That request came from another site.');
      }
      const existing = sessionFrom(req);
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
      const minted = !existing && options.mint ? randomBytes(16).toString('hex') : null;
      const sessionId = existing ?? minted;
      const out = await handler({ req, sessionId });
      const fresh = minted ?? (options.renew ? existing : null);
      const extra: Record<string, string> = fresh ? { 'Set-Cookie': setCookie(req, fresh) } : {};
      if (out instanceof Response) {
        for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
        out.headers.set('Cache-Control', 'no-store');
        return out;
      }
      return json(out, 200, extra);
    } catch (e) {
      if (e instanceof GameError) return fail(e.status, e.message);
      // The detail stays in the server log. The player gets a plain line.
      console.error('Game route failed:', e instanceof Error ? e.message : e);
      return fail(500, 'Something went wrong on the server. Try again in a moment.');
    }
  };
}
