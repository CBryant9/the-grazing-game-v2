import { createHash } from 'node:crypto';
import { clientErrorScript } from './clientErrorScript';
import { themeScript } from './themeScript';
import { themeToggleScript } from './themeToggleScript';

/** Environment variables, as `process.env` holds them. */
type Env = Readonly<Record<string, string | undefined>>;

/**
 * The Content-Security-Policy for every page (milestone 5.5 security review), set by `proxy.ts`.
 *
 * Two kinds of page, one policy shape:
 *
 * - The public website pages (apps/web/pages: `/`, about, pricing and the rest) are built ahead
 *   and send no script file. Their only scripts are two fixed inline lines (the theme), allowed
 *   by their hashes. They stay static: no nonce, nothing worked out per request.
 * - The app pages (`/play`, account, store, sign-in, community, admin) are rendered for each
 *   request. Each gets a fresh nonce; Next.js puts it on its own scripts, and `'strict-dynamic'`
 *   lets those scripts load the chunks they need. The fixed inline lines are allowed by hash.
 *
 * Scripts never get `'unsafe-inline'` or `'unsafe-eval'` (the map uses PixiJS's no-eval build,
 * `pixi.js/unsafe-eval`, imported in packages/render). Styles do get `'unsafe-inline'`: React
 * writes `style` attributes, which a nonce can not cover.
 *
 * Images may come from the Supabase project (`NEXT_PUBLIC_SUPABASE_URL`). The browser calls no
 * outside service itself (sign-in, Stripe and push all go through this site's own routes, and a
 * redirect is a navigation, which this policy does not limit), so `connect-src` is this site only.
 */

/** The fixed inline scripts, by name, so a test can check each one is allowed. */
export const INLINE_SCRIPTS: Readonly<Record<string, string>> = {
  themeScript,
  themeToggleScript,
  clientErrorScript,
};

const sha256 = (text: string): string =>
  `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

const HASHES = Object.values(INLINE_SCRIPTS).map(sha256).join(' ');

/** The public website pages, which are static and get the hash-only policy. */
export const STATIC_PAGES: ReadonlySet<string> = new Set([
  '/',
  '/about',
  '/advertise',
  '/community-rules',
  '/leaderboards',
  '/pricing',
  '/privacy',
  '/terms',
  '/404',
]);

/** The origin of a plain https address from the environment, or null. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1'
      ? u.origin
      : null;
  } catch {
    return null;
  }
}

export interface CspOptions {
  /** Per-request nonce (base64). Left out for a static page. */
  nonce?: string;
  env?: Env;
  /** `next dev` needs `'unsafe-eval'` for React's error overlay. Never in production. */
  dev?: boolean;
}

export function contentSecurityPolicy(options: CspOptions = {}): string {
  const env = options.env ?? process.env;
  const storage = originOf(env.NEXT_PUBLIC_SUPABASE_URL);
  const script = options.nonce
    ? `'self' 'nonce-${options.nonce}' 'strict-dynamic' ${HASHES}`
    : `'self' ${HASHES}`;
  return [
    `default-src 'self'`,
    `script-src ${script}${options.dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:${storage ? ` ${storage}` : ''}`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `media-src 'self'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

/** A fresh nonce: 16 random bytes, base64. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
