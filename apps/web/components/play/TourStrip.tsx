'use client';

import { useRef, useState } from 'react';
import { useHelp } from '@/lib/game/helpstore';
import { useGame } from '@/lib/game/store';
import { currentStep, DAILY_TOUR_TEXT, stepLabel, TOUR_FINISHED, TOUR_TEXT } from '@/lib/game/tour';
import { Icon } from './Icon';
import styles from './help.module.css';

/**
 * The coach strip for the guided first day: two lines and the skip buttons.
 * It sits in the page's flow between the top bar and the map, so it never
 * covers the map. Each step finishes when the player does it. Skipping and
 * replaying are always there.
 *
 * On a phone held upright (`compact`) it floats over the map under the top
 * bar, so it is one line: the step and its title. A tap opens the rest.
 */
export function TourStrip({
  hasCattle,
  compact = false,
}: {
  hasCattle: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tour = useHelp((s) => s.tour);
  const skipStep = useHelp((s) => s.tourSkipStep);
  const endTour = useHelp((s) => s.tourEnd);
  const strip = useRef<HTMLElement>(null);
  const daily = useGame((s) => s.snapshot?.daily != null);
  // The strip's buttons go away when the tour ends or the step changes, which
  // would drop focus to the page body. Send it somewhere sensible instead:
  // the map region when the tour ends, the strip itself when a step is skipped.
  const end = (): void => {
    endTour();
    requestAnimationFrame(() => document.getElementById('main')?.focus());
  };
  const skip = (step: Parameters<typeof skipStep>[0]): void => {
    skipStep(step);
    requestAnimationFrame(() => strip.current?.focus());
  };
  if (!tour || tour.status !== 'active') return null;

  const step = currentStep(tour, hasCattle);
  if (step === null) {
    return (
      <section ref={strip} tabIndex={-1} className={styles.strip} aria-label="First day tour">
        <div className={styles.stext} role="status">
          <p className={styles.sbody}>{TOUR_FINISHED}</p>
        </div>
        <div className={styles.sbtns}>
          <button type="button" className="btn sm" onClick={end}>
            Close the tour
          </button>
        </div>
      </section>
    );
  }

  // A Daily Farm keeps the daylight budget and has no Next day: its day ends at midnight.
  const text = (daily ? DAILY_TOUR_TEXT[step] : undefined) ?? TOUR_TEXT[step];
  if (compact && !open) {
    return (
      <section ref={strip} tabIndex={-1} className={styles.strip} aria-label="First day tour">
        <button
          type="button"
          className={styles.sline}
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          <span className={styles.sstep}>
            {stepLabel(tour, hasCattle)}: {text.title}
          </span>
          <Icon name="chevron" size={14} />
        </button>
      </section>
    );
  }
  return (
    <section ref={strip} tabIndex={-1} className={styles.strip} aria-label="First day tour">
      <div className={styles.stext} role="status">
        {compact ? (
          <button
            type="button"
            className={styles.sline}
            aria-expanded={true}
            onClick={() => setOpen(false)}
          >
            <span className={styles.sstep}>
              {stepLabel(tour, hasCattle)}: {text.title}
            </span>
            <span className={styles.sflip}>
              <Icon name="chevron" size={14} />
            </span>
          </button>
        ) : (
          <p className={styles.sstep}>
            {stepLabel(tour, hasCattle)}: {text.title}
          </p>
        )}
        <p className={styles.sbody}>{text.body}</p>
      </div>
      <div className={styles.sbtns}>
        <button type="button" className="btn sm ghost" onClick={() => skip(step)}>
          Skip this step
        </button>
        <button type="button" className="btn sm ghost" onClick={end}>
          Skip the tour
        </button>
      </div>
    </section>
  );
}
