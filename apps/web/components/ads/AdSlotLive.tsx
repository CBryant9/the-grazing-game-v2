'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdSlotId } from '@gg/shared';
import { pickAds, reportAd, type WireAd } from '@/lib/ads/api';
import { useAdLease } from '@/lib/ads/lease';
import { SLOTS, type AdScreen } from '@/lib/ads/registry';
import { useLayout } from '@/lib/game/hooks';
import { AdCard } from './AdCard';
import { VideoBreak } from './VideoBreak';
import { useSeen } from './useSeen';
import styles from './ads.module.css';

/**
 * The live half of a slot. It is loaded only when the server has said the slot is on and has
 * something to show (`/api/auth/me` lists such slots), so with every switch off none of this
 * code is even downloaded.
 *
 * It asks the server what to show (the server decides: house ads when no campaign is live,
 * caps, dates), reserves the slot's size, draws the ad with its label, and tells the server about
 * a view only after the ad was really on screen. It registers with the lease, which lets only
 * one ad draw on a phone.
 */

function Seen({ ad, children }: { ad: WireAd; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useSeen(ref, true, () => reportAd(ad.token, 'view'), ad.token);
  return <div ref={ref}>{children}</div>;
}

export default function AdSlotLive({
  id,
  screen: screenGiven,
  hold,
  onBlock,
}: {
  id: AdSlotId;
  /** Left out: the slot's first screen. */
  screen?: AdScreen;
  hold: boolean;
  onBlock?: (blocking: boolean) => void;
}) {
  const def = SLOTS[id];
  const screen = screenGiven ?? def.screens[0]!;
  const layout = useLayout();
  const size = def.sizes[layout];
  const [ads, setAds] = useState<WireAd[]>([]);
  const [loaded, setLoaded] = useState(false);
  const fits = size !== null;
  const granted = useAdLease(id, screen, layout, ads.length > 0);

  useEffect(() => {
    // Nothing is asked while the slot has no size here or the player is deciding something. What
    // was showing is cleared by the cleanup below when `hold` turns on.
    if (!fits || hold) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, seconds: number): void => {
      timers.push(setTimeout(fn, Math.max(1, seconds) * 1000));
    };
    const run = async (): Promise<void> => {
      const pick = await pickAds(id);
      if (cancelled) return;
      setLoaded(true);
      setAds(pick.items);
      if (pick.items.length === 0) {
        // A cap: ask again when it is over (a timed banner), else there is nothing to show.
        if (def.timed && pick.retryAfter) later(() => void run(), Math.min(pick.retryAfter, 600));
        return;
      }
      if (def.timed) {
        // Shown for a short time, then hidden, then asked for again after the cap.
        later(() => {
          setAds([]);
          later(() => void run(), pick.retryAfter ?? 300);
        }, pick.showSeconds ?? 45);
      }
    };
    void run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setAds([]);
      setLoaded(false);
    };
    // `def` is a constant for the slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fits, hold]);

  // The year end card holds its button while a video break is on screen.
  const blocking = def.video && (granted || (fits && !hold && !loaded));
  useEffect(() => {
    onBlock?.(blocking);
    return () => onBlock?.(false);
  }, [blocking, onBlock]);

  if (!size) return null;

  // A slot that sits in the page's flow keeps its room while it loads, so nothing moves when it
  // arrives. The room is empty and unseen until there is an ad.
  if (id === 'pc_farm_rail' && !loaded) return <div className={styles.rail} aria-hidden="true" />;
  if (!def.timed && !def.video && !hold && !loaded) {
    return <div aria-hidden="true" style={{ minHeight: size.h }} />;
  }
  if (!granted || ads.length === 0) return null;

  if (def.video) {
    const ad = ads[0]!;
    return <VideoBreak key={ad.token} ad={ad} onDone={() => setAds([])} />;
  }

  const close = def.timed ? (
    <button
      type="button"
      className={styles.close}
      aria-label="Close this ad"
      onClick={() => setAds([])}
    >
      <span aria-hidden="true">×</span>
    </button>
  ) : undefined;

  if (id === 'pc_farm_rail') {
    return (
      <aside className={styles.rail} aria-label="Sponsors">
        {ads.map((ad) => (
          <Seen key={ad.token} ad={ad}>
            <AdCard ad={ad} shape={def.shape} size={size} />
          </Seen>
        ))}
      </aside>
    );
  }
  const body = ads.map((ad) => (
    <Seen key={ad.token} ad={ad}>
      <AdCard ad={ad} shape={def.shape} size={size} close={close} fixedHeight={def.timed} />
    </Seen>
  ));
  if (id === 'pc_banner') return <div className={styles.pcStrip}>{body}</div>;
  if (id === 'summary_sponsor_card') return <div className={styles.summarySlot}>{body}</div>;
  return <>{body}</>;
}
