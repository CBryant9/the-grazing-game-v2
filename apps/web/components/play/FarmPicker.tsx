'use client';

import { useState } from 'react';
import { useGame } from '@/lib/game/store';
import type { FarmListItem } from '@/lib/game/types';
import styles from './accounts.module.css';

const played = (ms: number): string =>
  new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Your farms: shown on /play when a signed-in player has more than one, and from More. Each farm
 * has its name, district, day and when it was last played, with Open and Delete. Delete asks first
 * and says plainly that it can not be undone.
 */
export function FarmPicker() {
  const farms = useGame((s) => s.farms);
  const limit = useGame((s) => s.farmLimit);
  const open = useGame((s) => s.openFarm);
  const del = useGame((s) => s.deleteFarm);
  const another = useGame((s) => s.startAnother);
  const busy = useGame((s) => s.busy > 0);
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <section className={styles.pick} aria-labelledby="pick-title">
      <h1 id="pick-title" className={`px ${styles.picktitle}`}>
        Your farms
      </h1>
      <ul className={styles.farmlist}>
        {farms.map((f) => (
          <li key={f.id} className={styles.farmcard}>
            <b className={styles.farmname}>{f.name}</b>
            <p className={styles.farmsub}>
              {f.districtName} · Day {(f.day + 1).toLocaleString('en-AU')}
            </p>
            <p className={styles.farmsub}>Last played {played(f.lastPlayed)}</p>
            {asking === f.id ? (
              <FarmDelete
                farm={f}
                busy={busy}
                onYes={() => {
                  setAsking(null);
                  void del(f.id);
                }}
                onNo={() => setAsking(null)}
              />
            ) : (
              <div className={styles.row}>
                <button
                  type="button"
                  className="btn coral"
                  disabled={busy}
                  onClick={() => void open(f.id)}
                >
                  Open
                </button>
                <button type="button" className="btn ghost" onClick={() => setAsking(f.id)}>
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {farms.length < limit ? (
        <div className={styles.row}>
          <button type="button" className="btn" onClick={another}>
            Start a new farm
          </button>
        </div>
      ) : (
        <p className="muted">
          You have the most farms this account can have ({limit}). Delete one to start another.
        </p>
      )}
    </section>
  );
}

function FarmDelete({
  farm,
  busy,
  onYes,
  onNo,
}: {
  farm: FarmListItem;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className={styles.confirm} role="alertdialog" aria-label={`Delete ${farm.name}`}>
      <p>
        Delete <b>{farm.name}</b>? The farm, its cattle, cash and history will be gone.{' '}
        <b>This can not be undone.</b>
      </p>
      <div className={styles.row}>
        <button type="button" className="btn coral" disabled={busy} onClick={onYes}>
          Yes, delete it
        </button>
        <button type="button" className="btn ghost" onClick={onNo}>
          Keep it
        </button>
      </div>
    </div>
  );
}
