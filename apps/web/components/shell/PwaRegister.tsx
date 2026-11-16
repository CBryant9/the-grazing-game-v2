'use client';

import { useEffect } from 'react';
import { startInstallWatch } from '@/lib/pwa/install';

/** How long after the page has loaded the service worker is started. */
const REGISTER_AFTER_MS = 8000;

/**
 * On /play: starts the service worker (production only, so the dev server is
 * never held by a cache) and listens for the browser's install offer. The
 * service worker never touches /api, so nothing from the farm is cached by it.
 */
export function PwaRegister() {
  useEffect(() => {
    const stop = startInstallWatch();
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      // Well after the page is up. The worker saves about 1.6 MB of the site's
      // files when it installs, and on a slow phone connection that would
      // compete with the farm's first load (the Lighthouse mobile test caught
      // it). The farm is looked at offline from the second visit on.
      const start = (): void => {
        const w = window as { requestIdleCallback?: (cb: () => void) => void };
        const go = (): void => {
          navigator.serviceWorker
            .register('/serwist/sw.js', { scope: '/', type: 'module' })
            .catch(() => {
              // No service worker: the game still works online.
            });
        };
        setTimeout(
          () => (w.requestIdleCallback ? w.requestIdleCallback(go) : go()),
          REGISTER_AFTER_MS,
        );
      };
      if (document.readyState === 'complete') start();
      else window.addEventListener('load', start, { once: true });
    }
    return stop;
  }, []);
  return null;
}
