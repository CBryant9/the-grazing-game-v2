// The service worker. It is bundled by the route in app/serwist/[path]/route.ts
// and registered from /play (components/shell/PwaRegister.tsx).
//
// What it keeps, so the farm can be looked at offline and second visits are
// quick: the page shell and the site's own scripts, styles, fonts and icons.
// What it never keeps: any page other than / and /play, and anything under /api. The farm's numbers are read from
// the server each time, and the last copy the player saw is kept by the page
// itself (lib/game/offline.ts), not here. Nothing from the engine is in any
// of this, and `pnpm check:browser-bundle` still looks at everything sent.

import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from 'serwist';
import type { PrecacheEntry, RuntimeCaching } from 'serwist';
import { isCacheablePagePath } from '../lib/pwa/cacheablePage';

declare const self: {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

/** A page request for exactly this path. */
const isDocument = (request: Request, path: string): boolean =>
  request.destination === 'document' && new URL(request.url).pathname === path;

const runtimeCaching: RuntimeCaching[] = [
  // The game's own requests are never stored.
  {
    matcher: ({ url }) => url.pathname.startsWith('/api/'),
    handler: new NetworkOnly(),
  },
  // The manifest and service worker itself: always ask the network first.
  {
    matcher: ({ url }) => url.pathname.startsWith('/serwist/'),
    handler: new NetworkOnly(),
  },
  // Script and style chunks that were not in the build list (loaded later by
  // the map). Their names change with their content, so a kept copy is right.
  {
    matcher: ({ url }) => url.pathname.startsWith('/_next/static/'),
    handler: new CacheFirst({
      cacheName: 'next-static',
      plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })],
    }),
  },
  // Only the home page and the game page are kept. Every other page (admin,
  // sign-in callbacks, account pages) goes to the network and is never stored.
  // The network first, so a new version shows at once; the last copy when it can not be reached.
  {
    matcher: ({ request, sameOrigin, url }) =>
      sameOrigin && request.destination === 'document' && isCacheablePagePath(url.pathname),
    handler: new NetworkFirst({
      cacheName: 'pages',
      networkTimeoutSeconds: 4,
      plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 30 * 24 * 60 * 60 })],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  // When a page can not be had from the network or the kept pages, the
  // copy saved when the service worker was installed.
  fallbacks: {
    entries: [
      {
        url: '/play',
        matcher: ({ request }) => isDocument(request, '/play'),
      },
      {
        url: '/',
        matcher: ({ request }) => isDocument(request, '/'),
      },
    ],
  },
});

serwist.addEventListeners();
