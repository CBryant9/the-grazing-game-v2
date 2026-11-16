'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './play.module.css';

/**
 * The container for anything opened from the farm: a bottom sheet on a
 * phone held upright, the whole screen on a phone on its side, and a side
 * panel on a PC (the layout is set by the stylesheet, so one component
 * serves all three). `aside` sits on the title row: the paddock's label
 * chip and its hectares and water, for example.
 *
 * It takes focus when it opens, closes on Escape, and gives focus back to
 * what opened it.
 */
export function Sheet({
  title,
  aside,
  onClose,
  children,
}: {
  title: string;
  aside?: ReactNode;
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
        <button
          type="button"
          className={`iconbtn sm ${styles.sheetclose}`}
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <Icon name="close" size={16} />
        </button>
        <h2 className={`px ${styles.sheettitle}`}>{title}</h2>
        {aside}
      </header>
      <div className={styles.sheetbody}>{children}</div>
    </aside>
  );
}
