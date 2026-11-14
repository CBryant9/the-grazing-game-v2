'use client';

import { useEffect, type ReactNode } from 'react';
import { OFFLINE_LINE } from '@/lib/game/offline';
import { startOfflineWatch, useOffline } from '@/lib/game/offlineWatch';
import styles from './shell.module.css';

/**
 * Around the play screen. Starts the offline watch and, while the farm on the
 * screen is a kept copy or the connection is down, shows one plain line above
 * it. The buttons are switched off by the watch (see lib/game/offlineWatch.ts).
 */
export function PlayOffline({ children }: { children: ReactNode }) {
  const offline = useOffline((s) => s.offline);
  useEffect(() => startOfflineWatch(), []);
  return (
    <div className={styles.shell} data-offline={offline}>
      {offline && (
        <p className={styles.offline} role="status">
          {OFFLINE_LINE}
        </p>
      )}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
