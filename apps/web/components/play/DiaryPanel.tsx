'use client';

import { dateText } from '@/lib/game/format';
import { useEffect } from 'react';
import { usePast } from '@/lib/game/pastStore';
import { useGame } from '@/lib/game/store';
import { RecordStatus } from './ScoresPanel';
import styles from './play.module.css';

/** The Diary panel: the days lived, newest first, a page at a time. */
export function DiaryPanel() {
  const record = useGame((s) => s.record);
  const loadEarlier = useGame((s) => s.loadEarlier);
  const days = record?.data ? record.diary : null;
  const pictures = usePast((s) => s.days);
  const loadDays = usePast((s) => s.loadDays);
  const view = usePast((s) => s.view);
  const status = usePast((s) => s.status);
  const message = usePast((s) => s.message);
  useEffect(() => {
    void loadDays();
  }, [loadDays]);
  return (
    <div className={styles.stack}>
      <RecordStatus />
      {days &&
        (days.length === 0 ? (
          <p className="muted">Nothing in the diary yet. It fills as the days go by.</p>
        ) : (
          <>
            <ul className={styles.inbox}>
              {days.map((d) => (
                <li key={d.day} className={styles.msg}>
                  <h4 className={styles.diaryhead}>
                    Day {(d.day + 1).toLocaleString('en-AU')} · {dateText(d.date)}
                  </h4>
                  <ul className={styles.diarylines}>
                    {d.lines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  {pictures?.includes(d.day) && (
                    <button
                      type="button"
                      className="btn sm ghost"
                      disabled={status === 'loading'}
                      onClick={() => void view(d.day)}
                    >
                      View the farm on this day
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {status === 'failed' && message && (
              <p className="muted" role="alert">
                {message}
              </p>
            )}
            {record?.status === 'failed' && record.message && (
              <p className="muted" role="alert">
                {record.message}
              </p>
            )}
            {record && record.earlier !== null && (
              <div className={styles.jobbtns}>
                <button
                  type="button"
                  className="btn"
                  disabled={record.paging}
                  onClick={() => void loadEarlier()}
                >
                  Show earlier days
                </button>
              </div>
            )}
          </>
        ))}
    </div>
  );
}
