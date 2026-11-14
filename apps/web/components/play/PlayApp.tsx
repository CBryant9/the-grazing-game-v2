'use client';

import { useEffect, useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { useGame } from '@/lib/game/store';
import { PlayScreen } from './PlayScreen';
import { SetupFlow } from './SetupFlow';
import styles from './play.module.css';

/**
 * /play. A visitor with no farm sees the setup flow. A visitor with a farm
 * sees the play screen. The farm itself lives on the server: this asks for
 * its snapshot and draws what comes back.
 */
export function PlayApp() {
  const phase = useGame((s) => s.phase);
  const snapshot = useGame((s) => s.snapshot);
  const notice = useGame((s) => s.notice);
  const load = useGame((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  if (phase === 'ready' && snapshot) return <PlayScreen snapshot={snapshot} />;

  return (
    <div className={styles.plain}>
      <div className={styles.plainhdr}>
        <SiteHeader />
      </div>
      <main id="main" className={styles.plainmain} tabIndex={-1}>
        {phase === 'loading' && (
          <p className="muted" role="status">
            Loading your farm
          </p>
        )}
        {phase === 'failed' && (
          <div className={`card ${styles.failcard}`} role="alert">
            <p>{notice?.message ?? 'Something went wrong. Try again in a moment.'}</p>
            <button type="button" className="btn coral" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}
        {phase === 'broken' && <BrokenFarm message={notice?.message} />}
        {phase === 'setup' && <SetupFlow />}
      </main>
    </div>
  );
}

/**
 * The farm is there but can not be opened. Two ways on: try again, or start
 * a new farm. The broken farm is kept aside on the server, not deleted.
 */
function BrokenFarm({ message }: { message?: string }) {
  const load = useGame((s) => s.load);
  const restart = useGame((s) => s.restart);
  const busy = useGame((s) => s.busy > 0);
  const [asking, setAsking] = useState(false);
  return (
    <div className={`card ${styles.failcard}`} role="alert">
      <p>{message ?? 'Your farm could not be opened.'}</p>
      {!asking ? (
        <div className={styles.jobbtns}>
          <button type="button" className="btn coral" onClick={() => void load()}>
            Try again
          </button>
          <button type="button" className="btn ghost" onClick={() => setAsking(true)}>
            Start a new farm
          </button>
        </div>
      ) : (
        <>
          <p>Start a new farm? The old farm can not be opened again in the game.</p>
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn coral"
              disabled={busy}
              onClick={() => void restart()}
            >
              Start a new farm
            </button>
            <button type="button" className="btn ghost" onClick={() => setAsking(false)}>
              Keep trying
            </button>
          </div>
        </>
      )}
    </div>
  );
}
