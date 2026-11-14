'use client';

import { promptInstall, useInstall } from '@/lib/pwa/install';
import styles from './shell.module.css';

/**
 * In the More tab. Shows only when the browser can install the game: an
 * Install button, or on iPhone and iPad the two steps. Nothing otherwise, and
 * never a pop-up.
 */
export function InstallEntry() {
  const mode = useInstall((s) => s.mode);
  if (mode === 'none') return null;
  return (
    <div className={styles.install}>
      <p>
        <b>Install to your home screen</b>
      </p>
      {mode === 'prompt' ? (
        <div>
          <button type="button" className="btn" onClick={() => void promptInstall()}>
            Install
          </button>
        </div>
      ) : (
        <ol className={styles.steps}>
          <li>Tap the Share button in your browser.</li>
          <li>Tap Add to Home Screen.</li>
        </ol>
      )}
    </div>
  );
}
