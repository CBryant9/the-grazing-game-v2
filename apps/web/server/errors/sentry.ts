import 'server-only';
import { randomBytes } from 'node:crypto';

/** Environment variables, as `process.env` holds them. */
type Env = Readonly<Record<string, string | undefined>>;

/**
 * Error reporting to Sentry, from the server only (milestone 5.5).
 *
 * There is no Sentry SDK in the browser or on the server. Several pages sit within 1 KB of their
 * script limit, and a small hand-written sender needs no package, no build plugin and no
 * instrumentation of every request. It posts one event to the DSN's envelope endpoint.
 *
 * With no `SENTRY_DSN` nothing is sent anywhere and nothing fails.
 *
 * What an event carries, and nothing else: where it came from (server or browser), the route
 * name, a fixed reason code, the error's class, the release, the environment, and a trimmed
 * stack (function names and file paths inside the app, no query strings, no absolute paths).
 * Never cookies, tokens, emails, usernames, request bodies, query strings, the request itself or
 * who was asking. A server error's message is never sent (a provider can fill it with an
 * address or a link). A browser error's message is cut short and scrubbed first (`scrubMessage`).
 */

export interface ErrorReport {
  source: 'server' | 'browser';
  /** A route name or page template, for example `game-act` or `/community/u/:id`. */
  route: string;
  /** A fixed reason code, for example `save_failed` or `window_error`. */
  reason: string;
  /** The error's class name (`TypeError`), or `unknown`. */
  errorClass: string;
  /** Browser errors only: the message, already scrubbed and cut short. */
  message?: string;
  /** The raw stack text. It is trimmed here before anything is sent. */
  stack?: unknown;
}

export interface SentryFrame {
  function: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

/** Where to send, worked out from a DSN. */
export interface SentryTarget {
  endpoint: string;
  publicKey: string;
}

/** Sends one envelope. The real one is `fetch`; tests put in their own. */
export type SentryTransport = (url: string, init: RequestInit) => Promise<unknown>;

const NAME = /^[A-Za-z0-9_$.<> ]{1,60}$/;
/** The most events one server process sends in a minute. A loop that fails never floods. */
export const EVENTS_PER_MINUTE = 30;
/** Stack frames kept, the newest. */
export const FRAMES_KEPT = 20;
/** A browser message is cut to this many characters after scrubbing. */
export const MESSAGE_KEPT = 120;
const SEND_TIMEOUT_MS = 2000;

/** The target for a DSN, or null when it is empty or not a DSN. */
export function parseDsn(dsn: string | undefined): SentryTarget | null {
  const text = dsn?.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!/^[0-9a-zA-Z]{8,64}$/.test(url.username) || url.password) return null;
  if (url.search || url.hash) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const project = parts.pop();
  if (!project || !/^\d{1,20}$/.test(project)) return null;
  const prefix = parts.length ? `/${parts.join('/')}` : '';
  return {
    endpoint: `${url.protocol}//${url.host}${prefix}/api/${project}/envelope/`,
    publicKey: url.username,
  };
}

/** A file path or script address cut to what is safe to send: inside the app, no query, no host. */
export function cleanFile(raw: string): string {
  let f = raw.trim();
  // A script address: keep the path only.
  const url = /^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/[^?#]*)?/i.exec(f);
  if (url) f = url[1] ?? '/';
  f = f.replace(/[?#].*$/, '').replace(/\\/g, '/');
  for (const root of ['apps/', 'packages/', 'node_modules/', '.next/', '_next/']) {
    const at = f.indexOf(root);
    if (at >= 0) {
      f = f.slice(at);
      break;
    }
  }
  // An absolute path outside the app: the file name only, so no home folder or user name is sent.
  if (/^(?:[a-z]:)?\//i.test(f) && !f.startsWith('/_next/')) f = f.slice(f.lastIndexOf('/') + 1);
  f = f.replace(/[^A-Za-z0-9_./[\]()@-]/g, '');
  return f.slice(0, 160) || '?';
}

/** The stack as Sentry frames, oldest first, at most `FRAMES_KEPT`, with nothing but names and places. */
export function trimStack(stack: unknown): SentryFrame[] {
  if (typeof stack !== 'string' || !stack) return [];
  const frames: SentryFrame[] = [];
  for (const line of stack.split('\n').slice(0, 60)) {
    const l = line.trim();
    // V8: "at fn (file:1:2)" or "at file:1:2". Firefox and Safari: "fn@file:1:2".
    const v8 = /^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(l);
    const ff = v8 ? null : /^(.*?)@(.+?):(\d+):(\d+)$/.exec(l);
    const m = v8 ?? ff;
    if (!m) continue;
    const fn = (m[1] ?? '').replace(/^async /, '').trim();
    const filename = cleanFile(m[2]!);
    frames.push({
      function: NAME.test(fn) ? fn : '?',
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.startsWith('node_modules/') && !filename.startsWith('node:'),
    });
    if (frames.length >= FRAMES_KEPT) break;
  }
  return frames.reverse();
}

/**
 * A browser message made safe to keep: email addresses, web addresses, `name=value` pairs, long
 * numbers and anything that looks like a token or an id are replaced, then it is cut to
 * `MESSAGE_KEPT` characters.
 */
export function scrubMessage(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return (
    raw
      .slice(0, 2000)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\s@]+@[^\s@]+/g, '[email]')
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]')
      .replace(/\b(?:www\.)\S+/gi, '[url]')
      // A cookie, a query pair or a setting: neither the name nor the value is kept.
      .replace(/[\w.-]+=\S*/g, '[value]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
      .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[token]')
      .replace(/\d{5,}/g, '[n]')
      .replace(/[^\x20-\x7e]/g, '')
      .trim()
      .slice(0, MESSAGE_KEPT)
  );
}

const safeWord = (s: string, max: number): string => {
  const t = s.replace(/[^A-Za-z0-9_:/.[\]-]/g, '').slice(0, max);
  return t || 'unknown';
};

/** The release and environment the server says it is. Only plain words. */
function releaseOf(env: Env): { release?: string; environment: string } {
  const r = (env.GG_RELEASE || env.VERCEL_GIT_COMMIT_SHA || '').trim();
  const e = (env.VERCEL_ENV || env.NODE_ENV || 'development').trim();
  return {
    ...(/^[A-Za-z0-9._-]{1,64}$/.test(r) ? { release: r } : {}),
    environment: /^[A-Za-z0-9_-]{1,32}$/.test(e) ? e : 'unknown',
  };
}

/** The event Sentry is sent. Exported so tests can read every field. */
export function buildEvent(
  report: ErrorReport,
  env: Env = process.env,
  now = Date.now(),
): Record<string, unknown> {
  const errorClass = NAME.test(report.errorClass) ? report.errorClass : 'unknown';
  const route = safeWord(report.route, 80);
  const reason = safeWord(report.reason, 60);
  const message = report.source === 'browser' ? scrubMessage(report.message ?? '') : '';
  const frames = trimStack(report.stack);
  return {
    event_id: randomBytes(16).toString('hex'),
    timestamp: now / 1000,
    platform: report.source === 'browser' ? 'javascript' : 'node',
    level: 'error',
    logger: report.source,
    ...releaseOf(env),
    transaction: route,
    tags: { source: report.source, route, reason },
    // Sentry fills in the sender's address unless told not to. The sender is this server, not a
    // player, but nothing about who was asking is kept.
    user: { ip_address: null },
    exception: {
      values: [
        {
          type: errorClass,
          value: message || reason,
          ...(frames.length ? { stacktrace: { frames } } : {}),
        },
      ],
    },
    sdk: { name: 'gg.server-sender', version: '1' },
  };
}

/** The envelope text: a header line, an item header line and the event. */
export function envelopeOf(event: Record<string, unknown>, now = Date.now()): string {
  const body = JSON.stringify(event);
  return [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date(now).toISOString() }),
    JSON.stringify({ type: 'event', length: Buffer.byteLength(body, 'utf8') }),
    body,
  ].join('\n');
}

// ---- The sender

let transport: SentryTransport = (url, init) => fetch(url, init);
let minute = { from: 0, count: 0 };
let warned = false;

/** For tests: the transport to use, or undefined for the real `fetch`. Also resets the minute's count. */
export function setSentryTransport(t: SentryTransport | undefined): void {
  transport = t ?? ((url, init) => fetch(url, init));
  minute = { from: 0, count: 0 };
}

/** Is error reporting set up? */
export function sentryEnabled(env: Env = process.env): boolean {
  return parseDsn(env.SENTRY_DSN) !== null;
}

/**
 * Send a report to Sentry, in the background. Never throws, never waits on the network for the
 * caller, and sends nothing without a valid `SENTRY_DSN`. Returns the send, for tests to await.
 */
export function reportError(
  report: ErrorReport,
  env: Env = process.env,
  now = Date.now(),
): Promise<void> {
  try {
    const target = parseDsn(env.SENTRY_DSN);
    if (!target) {
      if (env.SENTRY_DSN?.trim() && !warned) {
        warned = true;
        console.warn('SENTRY_DSN is set but is not a DSN. No errors are sent to Sentry.');
      }
      return Promise.resolve();
    }
    if (now - minute.from >= 60_000) minute = { from: now, count: 0 };
    if (++minute.count > EVENTS_PER_MINUTE) return Promise.resolve();
    const body = envelopeOf(buildEvent(report, env, now), now);
    return Promise.resolve(
      transport(target.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-sentry-envelope',
          'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${target.publicKey}, sentry_client=gg.server-sender/1`,
        },
        body,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      }),
    ).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}
