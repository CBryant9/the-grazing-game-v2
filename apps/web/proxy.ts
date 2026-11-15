import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { countWebsiteView } from './server/analytics/collect';

/**
 * Website page views (milestone 5.3). The public pages send no script, so their views are counted
 * here, on the server, after the page is answered: by page and day only, with no cookie read or
 * set and no identifier. Only while the analytics switch is on (server/analytics/collect.ts).
 * The matcher names the public pages exactly; nothing else passes through this file.
 */
export function proxy(request: NextRequest, event: NextFetchEvent): NextResponse {
  event.waitUntil(countWebsiteView(request).then(() => undefined));
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/about',
    '/advertise',
    '/pricing',
    '/privacy',
    '/terms',
    '/community-rules',
    '/leaderboards',
  ],
};
