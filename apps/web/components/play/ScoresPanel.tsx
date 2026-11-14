'use client';

import { num } from '@/lib/game/format';
import { useGame } from '@/lib/game/store';
import { YearFacts, YearMoney, YearParts, YearScore } from './YearBlocks';
import styles from './play.module.css';

/** What each part is, in plain words. No weights and no formulas. */
export const PARTS_EXPLAINED =
  'Profit is the change in net worth. Weight gain is the live weight the cattle put on. Pasture use is the share of the feed grown that was eaten. Ground cover is the average for the year. Deaths take points off.';

/** Shown while the data loads, and when it could not be had. */
export function RecordStatus() {
  const record = useGame((s) => s.record);
  const load = useGame((s) => s.loadRecord);
  if (record?.status === 'failed' && !record.data) {
    return (
      <div className={styles.jobcard} role="alert">
        <p>{record.message ?? 'Something went wrong. Try again in a moment.'}</p>
        <div className={styles.jobbtns}>
          <button type="button" className="btn coral" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!record?.data) {
    return (
      <p className="muted" role="status">
        Loading
      </p>
    );
  }
  return null;
}

/** The Scores panel: the year so far, then the finished years, newest first. */
export function ScoresPanel() {
  const data = useGame((s) => s.record?.data ?? null);
  return (
    <div className={styles.stack}>
      <RecordStatus />
      {data && (
        <>
          <section aria-labelledby="sofar-title" className={styles.stack}>
            <h3 id="sofar-title" className={`px ${styles.minihead}`}>
              {data.soFar.title} so far
            </h3>
            <YearScore view={data.soFar} />
          </section>
          <p className="muted">{PARTS_EXPLAINED}</p>
          <section aria-labelledby="past-title" className={styles.stack}>
            <h3 id="past-title" className={`px ${styles.minihead}`}>
              Past years
            </h3>
            {data.years.length === 0 ? (
              <p className="muted">No finished years yet.</p>
            ) : (
              <ul className={styles.rows}>
                {data.years.map((y) => (
                  <li key={y.n}>
                    <details className={styles.yeardetails}>
                      <summary className={styles.yearsummary}>
                        <span>{y.title}</span>
                        <b>{num(y.total)}</b>
                      </summary>
                      <div className={styles.stack}>
                        <YearParts view={y} />
                        <YearFacts view={y} />
                        <YearMoney view={y} />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
