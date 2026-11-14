'use client';

import { useEffect, type RefObject } from 'react';

/** Half of the ad on screen, for this long, with the tab showing: that is a view. */
export const SEEN_RATIO = 0.5;
export const SEEN_MS = 1000;

/**
 * Calls `onSeen` once, when the element has really been on screen: at least half of it showing
 * for a second while the tab is visible. Nothing is measured before that, and nothing about the
 * player is read. `active` false (not drawn, or not allowed to show) measures nothing.
 */
export function useSeen(
  ref: RefObject<Element | null>,
  active: boolean,
  onSeen: () => void,
  key: string,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inView = false;
    let done = false;
    const stop = (): void => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const check = (): void => {
      stop();
      if (done || !inView || document.visibilityState !== 'visible') return;
      timer = setTimeout(() => {
        if (done) return;
        done = true;
        observer.disconnect();
        onSeen();
      }, SEEN_MS);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        inView = Boolean(e && e.isIntersecting && e.intersectionRatio >= SEEN_RATIO);
        check();
      },
      { threshold: [0, SEEN_RATIO, 1] },
    );
    observer.observe(el);
    document.addEventListener('visibilitychange', check);
    return () => {
      done = true;
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', check);
    };
    // `onSeen` is read when it fires; `key` restarts the watch for a new ad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, ref]);
}
