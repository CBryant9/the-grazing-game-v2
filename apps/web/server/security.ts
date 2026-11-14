import 'server-only';

/**
 * Checks every state-changing route shares (milestone 3.2).
 *
 * CSRF. Before 3.2 the game routes refused a request whose Origin header named
 * another site, and let one with no Origin through. That is now one function,
 * used by the game routes and the sign-in and account routes alike:
 *
 * 1. A browser that names an Origin must name this site's own host.
 * 2. A browser that sends `Sec-Fetch-Site` must say `same-origin` (or `none`,
 *    which is the player typing the address). `same-site` and `cross-site` are
 *    refused, so a sibling domain can not act for the player either.
 * 3. A request with a body must say it is JSON. A cross-site form can only send
 *    form or plain-text bodies, so it can not get past this even with no Origin.
 * 4. The session cookies are SameSite=Lax and HttpOnly, so a page on another
 *    site can not send them on a POST at all.
 *
 * A request with no Origin and no Sec-Fetch-Site is not a browser acting for a
 * player (no current browser omits both on a cross-site POST), so it is let
 * through: that is a script or a test, and it carries no player's cookie unless
 * it was given one.
 */
export function csrfRefusal(req: Request): string | null {
  const host = req.headers.get('host') ?? safeHost(req.url);
  const origin = req.headers.get('origin');
  if (origin !== null) {
    if (safeHost(origin) !== host) return 'That request came from another site.';
  }
  const site = req.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') {
    return 'That request came from another site.';
  }
  if (hasBody(req)) {
    const type = req.headers.get('content-type') ?? '';
    if (!/^application\/json\s*(;|$)/i.test(type)) return 'That request was not sent properly.';
  }
  return null;
}

function hasBody(req: Request): boolean {
  if (req.body === null) return false;
  const length = req.headers.get('content-length');
  return length === null || length.trim() !== '0';
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Where a player may be sent after signing in. Only these pages, by exact
 * path, with nothing after the path: no other site, no scheme, no `//`, no
 * backslash, no query or fragment to carry anything, and no path that is not on
 * the list. Anything else becomes `/play`.
 */
export const NEXT_ALLOWED: readonly string[] = ['/', '/play', '/account', '/about', '/pricing'];
export const NEXT_DEFAULT = '/play';

export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return NEXT_DEFAULT;
  return NEXT_ALLOWED.includes(value) ? value : NEXT_DEFAULT;
}

/**
 * The site's own address, for the redirect a sign-in link comes back to. It is
 * worked out from the request's own host, never from a header the caller
 * could set to send the link somewhere else: the Host header must match the
 * origin the request names, or the public URL set in the environment.
 */
export function siteOrigin(req: Request): string {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  if (fixed && /^https?:\/\/[^/\s]+$/.test(fixed)) return fixed;
  const url = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') === 'https' ? 'https:' : url.protocol;
  return `${proto}//${req.headers.get('host') ?? url.host}`;
}

/** True in a production build running on https. */
export const isProduction = (): boolean => process.env.NODE_ENV === 'production';

/** The cookie text for a cookie only the server reads: HttpOnly, SameSite=Lax, path /, Secure on https. */
export function cookieText(
  req: Request,
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  // Secure over https, and in production on any real host (a production build run on
  // localhost for a check is not a real host, and a plain-http cookie there would be dropped).
  const host = (req.headers.get('host') ?? safeHost(req.url) ?? '').replace(/:\d+$/, '');
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  const secure =
    req.url.startsWith('https:') ||
    req.headers.get('x-forwarded-proto') === 'https' ||
    (isProduction() && !local)
      ? '; Secure'
      : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/** The text of a cookie that removes another. */
export function clearCookieText(req: Request, name: string): string {
  return cookieText(req, name, '', 0).replace('Max-Age=0', 'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
}
