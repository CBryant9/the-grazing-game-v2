'use client';

import dynamic from 'next/dynamic';
import type { AdSlotId } from '@gg/shared';
// Type only: the registry itself is loaded with the live half, so a page with every slot off
// does not carry it (m6: the community pages' budget).
import type { AdScreen } from '@/lib/ads/registry';
import { useMe } from '@/lib/auth/store';

/**
 * Put one `<AdSlot id="..." />` where the PRD names the slot (PRD 10.1).
 *
 * With the slot off (the launch default), with no keys, or for an account that owns no-ads, the
 * server does not list the slot in `/api/auth/me`, and this draws NOTHING: no markup, no empty
 * box, no request, and the code that draws ads is not even downloaded.
 *
 * - `screen`: for a slot that sits on more than one screen (the summary card), which one.
 * - `hold`: true while the player is deciding something (a job card, a plan, a move, a sheet),
 *   when the PRD says no ad may show.
 * - `onBlock`: called with true while the slot holds the screen (a video break), so the year end
 *   card can hold its button.
 */
const Live = dynamic(() => import('./AdSlotLive'), { ssr: false });

export function AdSlot({
  id,
  screen,
  hold = false,
  onBlock,
}: {
  id: AdSlotId;
  screen?: AdScreen;
  hold?: boolean;
  onBlock?: (blocking: boolean) => void;
}) {
  const listed = useMe((s) => s.me?.ads);
  if (!listed || !listed.includes(id)) return null;
  // The year end card shows its video, or the sponsor card when there is no video to show.
  if (
    screen === 'year_end' &&
    id === 'summary_sponsor_card' &&
    listed.includes('video_between_years')
  ) {
    return null;
  }
  return <Live id={id} screen={screen} hold={hold} onBlock={onBlock} />;
}
