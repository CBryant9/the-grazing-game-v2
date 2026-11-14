'use client';

import { useEffect } from 'react';
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
        {phase === 'setup' && <SetupFlow />}
      </main>
    </div>
  );
}
