'use client';

import { useEffect, useRef, useState } from 'react';
import { money, num, plural } from '@/lib/game/format';
import { useGame } from '@/lib/game/store';
import type { OverWire } from '@/lib/game/types';
import styles from './play.module.css';

/**
 * The end of the game: why it ended, how long the farm ran, the net worth and
 * each year's score. The one way on is a new farm, behind the same confirm as
 * the More tab's: this farm will be gone.
 */
export function GameOverCard({ over }: { over: OverWire }) {
  const restart = useGame((s) => s.restart);
  const busy = useGame((s) => s.busy > 0);
  const [asking, setAsking] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, [asking]);

  return (
    <div className={styles.scrim}>
      <div className={styles.summary} role="dialog" aria-modal="true" aria-labelledby="over-title">
        <h2 id="over-title" className={`px ${styles.sumtitle}`}>
          Game over
        </h2>
        <p>{over.text}</p>
        <p>You ran the farm for {plural(over.days, 'day')}.</p>
        <dl className={styles.sumlist}>
          <div className={styles.sumrow}>
            <dt>Final net worth</dt>
            <dd>{money(over.worth)}</dd>
          </div>
          {over.years.map((y) => (
            <div key={y.n} className={styles.sumrow}>
              <dt>Year {y.n} score</dt>
              <dd>{num(y.total)}</dd>
            </div>
          ))}
          {over.years.length > 0 && (
            <div className={styles.sumrow}>
              <dt>
                <b>Total score</b>
              </dt>
              <dd>
                <b>{num(over.total)}</b>
              </dd>
            </div>
          )}
        </dl>
        {!asking ? (
          <div className={styles.sumbtns}>
            <button
              ref={firstRef}
              type="button"
              className="btn coral"
              onClick={() => setAsking(true)}
            >
              Start a new farm
            </button>
          </div>
        ) : (
          <div className={styles.jobcard} role="alertdialog" aria-label="Start a new farm">
            <p>
              Start a new farm? <b>This farm will be gone</b>, with its cattle, cash and history. It
              can not be brought back.
            </p>
            <div className={styles.jobbtns}>
              <button
                ref={firstRef}
                type="button"
                className="btn coral"
                disabled={busy}
                onClick={() => void restart()}
              >
                Yes, start a new farm
              </button>
              <button type="button" className="btn ghost" onClick={() => setAsking(false)}>
                Keep this farm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
