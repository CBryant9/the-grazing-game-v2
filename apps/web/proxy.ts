import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { STATIC_PAGES, contentSecurityPolicy, newNonce } from './lib/csp';
import { countWebsiteView } from './server/analytics/collect';

/**
 * One proxy for two jobs.
 *
 * 1. The Content-Security-Policy on every page (milestone 5.5, lib/csp.ts). A public website page
 *    gets the fixed hash policy and stays static. Every other page gets a fresh nonce, which
 *    Next.js reads from the request's policy header and puts on its own scripts
 *    (node_modules/next/dist/docs, "Content Security Policy").
 * 2. Website page views (milestone 5.3). The public pages send no script, so their views are
 *    counted here, on the server, after the page is answered: by page and day only, with no cookie
 *    read or set and no identifier, never for bots or prefetches, and only while the analytics
 *    switch is on. `countWebsiteView` checks the page is a public one itself
 *    (server/analytics/collect.ts).
 *
 * API routes, built files and the service worker are left alone.
 */
export function proxy(request: NextRequest, event: NextFetchEvent): NextResponse {
  const dev = process.env.NODE_ENV === 'development';
  if (STATIC_PAGES.has(request.nextUrl.pathname)) {
    event.waitUntil(countWebsiteView(request).then(() => undefined));
    const res = NextResponse.next();
    res.headers.set('Content-Security-Policy', contentSecurityPolicy({ dev }));
    return res;
  }
  const nonce = newNonce();
  const policy = contentSecurityPolicy({ nonce, dev });
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', policy);
  return res;
}

export const config = {
  matcher: [
    {
      source: '/((?!api/|_next/|serwist/|.*\\.[A-Za-z0-9]+$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
