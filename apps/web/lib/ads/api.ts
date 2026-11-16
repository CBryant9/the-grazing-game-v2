import type { AdSlotId } from '@gg/shared';
import type { CreativeKind } from './registry';

/** What `/api/ads/pick` sends the browser: the words and pictures to draw, and a signed token for the view. */
export interface WireAd {
  token: string;
  creativeId: string;
  kind: CreativeKind;
  headline: string | null;
  body: string | null;
  alt: string | null;
  sponsor: string | null;
  label: 'Ad' | 'Sponsored';
  mediaUrl: string | null;
  href: string | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
}

export interface WirePick {
  items: WireAd[];
  retryAfter?: number;
  showSeconds?: number;
}

/** Ask the server what to show in a slot. Never throws: a failure is "nothing to show". */
export async function pickAds(slot: AdSlotId): Promise<WirePick> {
  try {
    const res = await fetch(`/api/ads/pick?slot=${encodeURIComponent(slot)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { items: [] };
    const data = (await res.json()) as WirePick;
    return Array.isArray(data.items) ? data : { items: [] };
  } catch {
    return { items: [] };
  }
}

/**
 * Tell the server an ad was seen (or a video ended or was skipped). Sent as a beacon so it still
 * goes when the page is closing. It is JSON, so the server's one CSRF rule applies to it.
 */
export function reportAd(token: string, kind: 'view' | 'video_complete' | 'video_skip'): void {
  const body = JSON.stringify({ token, kind });
  try {
    const blob = new Blob([body], { type: 'application/json' });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon?.('/api/ads/event', blob)) return;
  } catch {
    // fall through to fetch
  }
  void fetch('/api/ads/event', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => undefined);
}
