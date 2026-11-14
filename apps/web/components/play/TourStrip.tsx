'use client';

import { useRef } from 'react';
import { useHelp } from '@/lib/game/helpstore';
import { currentStep, stepLabel, TOUR_FINISHED, TOUR_TEXT } from '@/lib/game/tour';
import styles from './help.module.css';

/**
 * The coach strip for the guided first day: two lines and the skip buttons.
 * It sits in the page's flow between the top bar and the map, so it never
 * covers the map. Each step finishes when the player does it. Skipping and
 * replaying are always there.
 */
export function TourStrip({ hasCattle }: { hasCattle: boolean }) {
  const tour = useHelp((s) => s.tour);
  const skipStep = useHelp((s) => s.tourSkipStep);
  const endTour = useHelp((s) => s.tourEnd);
  const strip = useRef<HTMLElement>(null);
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

  const text = TOUR_TEXT[step];
  return (
    <section ref={strip} tabIndex={-1} className={styles.strip} aria-label="First day tour">
      <div className={styles.stext} role="status">
        <p className={styles.sstep}>
          {stepLabel(tour, hasCattle)}: {text.title}
        </p>
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
