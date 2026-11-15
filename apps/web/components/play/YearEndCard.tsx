'use client';

import { useEffect, useRef, useState } from 'react';
import { AdSlot } from '@/components/ads/AdSlot';
import { plural } from '@/lib/game/format';
import { useGame, type YearEndState } from '@/lib/game/store';
import { YearScore } from './YearBlocks';
import styles from './play.module.css';

/**
 * The card for a year that has just closed: its score, the parts and the
 * facts. It shows before the day or skip summary, which is still there when
 * the player closes it. It takes focus when it opens, keeps focus inside, and
 * closes on Escape.
 */
export function YearEndCard({ end }: { end: YearEndState }) {
  const dismiss = useGame((s) => s.dismissYearEnd);
  // The game ended in the same skip that closed the year: there is no next year to start.
  const over = useGame((s) => s.snapshot?.over != null);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // A video break (when the slot is on) holds the button until it ends or is skipped.
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    // Once the video break is over (or when there was none) the button takes focus.
    if (!blocked) closeRef.current?.focus();
  }, [blocked]);

  return (
    <div
      className={styles.scrim}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !blocked) dismiss();
        if (e.key === 'Tab') {
          // Keep focus in the card.
          const items = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
          if (!items?.length) return;
          const first = items[0]!;
          const last = items[items.length - 1]!;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <div
        ref={ref}
        className={styles.summary}
        role="dialog"
        aria-modal="true"
        aria-labelledby="yearend-title"
      >
        <h2 id="yearend-title" className={`px ${styles.sumtitle}`}>
          Year {end.view.n} done
        </h2>
        <p className={styles.sumwhen}>{end.view.title}</p>
        {end.closed > 1 && (
          <p className={styles.sumwhen}>
            {plural(end.closed, 'year')} went by. This is the latest.
          </p>
        )}
        <YearScore view={end.view} />
        <AdSlot id="video_between_years" screen="year_end" onBlock={setBlocked} />
        <AdSlot id="summary_sponsor_card" screen="year_end" />
        {blocked && (
          <p id="yearend-wait" className={styles.sumwhen}>
            The button works when the video ends or you skip it.
          </p>
        )}
        <div className={styles.sumbtns}>
          <button
            ref={closeRef}
            type="button"
            className="btn coral"
            disabled={blocked}
            aria-describedby={blocked ? 'yearend-wait' : undefined}
            onClick={dismiss}
          >
            {over ? 'Close' : `Start year ${end.view.n + 1}`}
          </button>
        </div>
      </div>
    </div>
  );
}
