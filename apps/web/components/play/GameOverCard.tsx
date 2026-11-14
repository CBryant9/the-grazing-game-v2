'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { money, num, plural } from '@/lib/game/format';
import { useGame } from '@/lib/game/store';
import type { OverWire } from '@/lib/game/types';
import styles from './play.module.css';

/** "Start a new farm" behind the confirm that says this farm will be gone. */
function NewFarm({
  asking,
  setAsking,
  firstRef,
  className,
}: {
  asking: boolean;
  setAsking: (v: boolean) => void;
  firstRef?: RefObject<HTMLButtonElement | null>;
  className: string;
}) {
  const restart = useGame((s) => s.restart);
  const busy = useGame((s) => s.busy > 0);
  if (!asking) {
    return (
      <button ref={firstRef} type="button" className={className} onClick={() => setAsking(true)}>
        Start a new farm
      </button>
    );
  }
  return (
    <div className={styles.jobcard} role="alertdialog" aria-label="Start a new farm">
      <p>
        Start a new farm? <b>This farm will be gone</b>, with its cattle, cash and history. It can
        not be brought back.
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
  );
}

/** What a year is called in the list: a year under way at the end is a part year, with its days. */
const yearLabel = (y: OverWire['years'][number]): string =>
  y.partDays === null
    ? `Year ${y.n} score`
    : `Year ${y.n} (part year, ${plural(y.partDays, 'day')}) score`;

/**
 * The end of the game: why it ended, how long the farm ran, the net worth and
 * each year's score. The ways on are to look around the finished farm, or a new
 * farm behind the confirm that says this farm will be gone.
 */
export function GameOverCard({ over }: { over: OverWire }) {
  const hide = useGame((s) => s.setOverHidden);
  const [asking, setAsking] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);
  const part = over.years.some((y) => y.partDays !== null);

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
              <dt>{yearLabel(y)}</dt>
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
        {part && (
          <p className={styles.sumwhen}>
            The total counts the part year as if it had closed on the last day.
          </p>
        )}
        {!asking && (
          <div className={styles.sumbtns}>
            <button type="button" className="btn ghost" onClick={() => hide(true)}>
              Look around
            </button>
            <NewFarm
              asking={false}
              setAsking={setAsking}
              firstRef={firstRef}
              className="btn coral"
            />
          </div>
        )}
        {asking && <NewFarm asking setAsking={setAsking} firstRef={firstRef} className="" />}
      </div>
    </div>
  );
}

/**
 * The strip left when the player looks around a finished farm. The map, the
 * lists, Scores and Diary stay readable. Nothing can change the farm: time and
 * jobs are switched off, and the server refuses them.
 */
export function OverStrip() {
  const hide = useGame((s) => s.setOverHidden);
  const [asking, setAsking] = useState(false);
  return (
    <div className={styles.gameover} role="status">
      <p>The game is over on this farm.</p>
      {!asking && (
        <div className={styles.noticebtns}>
          <button type="button" className="btn sm" onClick={() => hide(false)}>
            Show the result
          </button>
          <NewFarm asking={false} setAsking={setAsking} className="btn sm ghost" />
        </div>
      )}
      {asking && <NewFarm asking setAsking={setAsking} className="" />}
    </div>
  );
}
