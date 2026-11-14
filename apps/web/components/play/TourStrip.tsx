'use client';

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
  const end = useHelp((s) => s.tourEnd);
  if (!tour || tour.status !== 'active') return null;

  const step = currentStep(tour, hasCattle);
  if (step === null) {
    return (
      <section className={styles.strip} aria-label="First day tour">
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
    <section className={styles.strip} aria-label="First day tour">
      <div className={styles.stext} role="status">
        <p className={styles.sstep}>
          {stepLabel(tour, hasCattle)}: {text.title}
        </p>
        <p className={styles.sbody}>{text.body}</p>
      </div>
      <div className={styles.sbtns}>
        <button type="button" className="btn sm ghost" onClick={() => skipStep(step)}>
          Skip this step
        </button>
        <button type="button" className="btn sm ghost" onClick={end}>
          Skip the tour
        </button>
      </div>
    </section>
  );
}
