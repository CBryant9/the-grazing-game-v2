import 'server-only';
import { randomBytes } from 'node:crypto';
import { GameError, isSessionId } from './game';

export const SESSION_COOKIE = 'gg_session';
const SESSION_DAYS = 90;
const BODY_LIMIT = 4096;

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

/** Read a small JSON body. Anything else is a plain 400. */
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > BODY_LIMIT) throw new GameError(400, 'That request was too big.');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new GameError(400, 'That request was not sent properly.');
  }
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

export interface RouteOptions {
  /** Start a session if the visitor has none. Only the create route does. */
  mint?: boolean;
  /** Requests allowed in ten seconds. */
  max?: number;
  /** A name for the limit, so a slow route does not share a count with a quick one. */
  name: string;
  /** True for anything that changes a farm: a cross-site request is refused. */
  write?: boolean;
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
      let sessionId = sessionFrom(req);
      const minted = !sessionId && options.mint ? randomBytes(16).toString('hex') : null;
      sessionId ??= minted;
      const who = sessionId ?? req.headers.get('x-forwarded-for') ?? 'guest';
      if (!allow(`${options.name}:${who}`, options.max ?? 100, 10_000)) {
        return fail(429, 'That was a lot of requests. Wait a few seconds and try again.', {
          'Retry-After': '10',
        });
      }
      const out = await handler({ req, sessionId });
      const extra: Record<string, string> = minted ? { 'Set-Cookie': setCookie(req, minted) } : {};
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
