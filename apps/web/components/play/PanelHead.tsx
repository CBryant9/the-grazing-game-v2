'use client';

import type { ReactNode } from 'react';
import { useGame } from '@/lib/game/store';
import { Icon } from './Icon';
import styles from './play.module.css';

/**
 * The head of a full-screen panel on a phone, as the mockup: a close button, the title and a
 * short line under it. On a PC the panel sits beside the map, so the close button is not drawn.
 */
export function PanelHead({ title, sub }: { title: string; sub?: ReactNode }) {
  const setTab = useGame((s) => s.setTab);
  return (
    <div className={styles.panelhead}>
      <button
        type="button"
        className={`iconbtn ${styles.panelclose}`}
        aria-label={`Close ${title}`}
        onClick={() => setTab('farm')}
      >
        <Icon name="close" size={16} />
      </button>
      <div className={styles.paneltitle}>
        <h2 className={`px ${styles.soontitle}`}>{title}</h2>
        {sub && <p className={styles.panelsub}>{sub}</p>}
      </div>
    </div>
  );
}
