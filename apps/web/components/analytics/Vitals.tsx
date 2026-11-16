'use client';

import { useEffect } from 'react';
import type { AppPageId } from '@gg/shared/analytics';
import { consented, sendEvents, type BeaconEvent } from '@/lib/analytics/beacon';

/**
 * A page view and the page's Web Vitals (LCP, CLS, INP), measured with the browser's own
 * PerformanceObserver and sent once when the page is hidden (milestone 5.3, PRD 14.10). Only on
 * the game and signed-in pages, and only with consent. Draws nothing.
 *
 * - LCP: the last largest-contentful-paint before the first input, in ms.
 * - CLS: the largest burst of layout shifts (shifts under a second apart, within five seconds)
 *   not caused by input, times 1000.
 * - INP: the longest interaction seen, in ms. The full measure drops one in fifty on a page with
 *   many interactions; this one does not, so it reads a little high on long sessions.
 */
export function Vitals({ page }: { page: AppPageId }) {
  useEffect(() => {
    if (!consented() || typeof PerformanceObserver === 'undefined') return;
    sendEvents([{ e: 'page_view', p: { page } }]);
    let lcp = -1;
    let cls = 0;
    let burst = 0;
    let first = 0;
    let last = 0;
    let inp = -1;
    const watch = (type: string, fn: (list: PerformanceEntry[]) => void, extra = {}) => {
      try {
        const o = new PerformanceObserver((l) => fn(l.getEntries()));
        o.observe({ type, buffered: true, ...extra });
        return o;
      } catch {
        return null;
      }
    };
    const seen = [
      watch('largest-contentful-paint', (l) => {
        const e = l[l.length - 1];
        if (e) lcp = e.startTime;
      }),
      watch('layout-shift', (l) => {
        for (const e of l as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (e.hadRecentInput) continue;
          if (burst && e.startTime - last < 1000 && e.startTime - first < 5000) burst += e.value;
          else {
            burst = e.value;
            first = e.startTime;
          }
          last = e.startTime;
          cls = Math.max(cls, burst);
        }
      }),
      watch(
        'event',
        (l) => {
          for (const e of l as (PerformanceEntry & { interactionId?: number })[]) {
            if (e.interactionId) inp = Math.max(inp, e.duration);
          }
        },
        { durationThreshold: 40 },
      ),
    ];
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== 'hidden') return;
      sent = true;
      const ev: BeaconEvent[] = [];
      const add = (metric: 'LCP' | 'CLS' | 'INP', v: number) => {
        if (v >= 0)
          ev.push({ e: 'web_vital', p: { page, metric, value: Math.min(Math.round(v), 600_000) } });
      };
      add('LCP', lcp);
      add('CLS', cls * 1000);
      add('INP', inp);
      sendEvents(ev);
    };
    document.addEventListener('visibilitychange', send);
    return () => {
      document.removeEventListener('visibilitychange', send);
      for (const o of seen) o?.disconnect();
    };
  }, [page]);
  return null;
}
