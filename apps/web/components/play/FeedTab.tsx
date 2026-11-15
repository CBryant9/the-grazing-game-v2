'use client';

import dynamic from 'next/dynamic';
import { useGame } from '@/lib/game/store';
import type { Snapshot } from '@/lib/game/types';
import { ActJob } from './ActJob';

/** The Feed panel loads only when it is opened, so the first load of /play stays small. */
const FeedPanel = dynamic(() => import('./FeedPanel').then((m) => m.FeedPanel), {
  loading: () => (
    <p className="muted" role="status">
      Loading the feed forecast
    </p>
  ),
});

/**
 * The Feed panel (mockup E): the year's feed forecast and the supplements, one mob a card.
 * A supplement button asks for the same job card the mob card does, and it shows under that
 * mob's card: switch on or off, then Confirm.
 */
export function FeedTab({ snapshot }: { snapshot: Snapshot }) {
  const startAct = useGame((s) => s.startAct);
  const dismissAct = useGame((s) => s.dismissAct);
  return (
    <FeedPanel
      feed={snapshot.feed}
      onPick={(a) => {
        const slot = `${a.mob}:supp`;
        dismissAct(slot);
        const label = snapshot.mobs
          .find((m) => m.id === a.mob)
          ?.suppOptions.find((o) => o.id === a.supp)?.label;
        void startAct(
          slot,
          a.supp === 'none' ? 'Switch off' : `Switch on ${label ?? ''}`.trim(),
          a,
        );
      }}
      job={(mob) => <ActJob slot={`${mob}:supp`} title="Supplement" confirmLabel="Confirm" />}
    />
  );
}
