'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './play.module.css';

/**
 * The container for anything opened from the farm: a bottom sheet on a
 * phone held upright, the whole screen on a phone on its side, and a side
 * panel on a PC (the layout is set by the stylesheet, so one component
 * serves all three). The next piece fills it with the full paddock sheet.
 *
 * It takes focus when it opens, closes on Escape, and gives focus back to
 * what opened it.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      // The map is not focusable, so only hand focus back to a real control.
      if (before && before !== document.body && document.contains(before)) before.focus();
    };
  }, []);

  return (
    <aside
      ref={ref}
      className={styles.sheet}
      role="complementary"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className={styles.grab} aria-hidden="true" />
      <header className={styles.sheethead}>
        <h2 className={`px ${styles.sheettitle}`}>{title}</h2>
        <button type="button" className="iconbtn" onClick={onClose} aria-label={`Close ${title}`}>
          <Icon name="close" size={20} />
        </button>
      </header>
      <div className={styles.sheetbody}>{children}</div>
    </aside>
  );
}
