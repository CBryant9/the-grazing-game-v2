import type { ReactNode } from 'react';
import styles from './shell.module.css';

/**
 * The words and buttons of an error screen. Plain words, no codes, no stack:
 * what happened, what is safe, and two ways on.
 */
export function ErrorCard({
  title,
  children,
  actions,
  level = 1,
  alert = false,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  level?: 1 | 2;
  alert?: boolean;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <section className={`card ${styles.errorcard}`} role={alert ? 'alert' : undefined}>
      <Heading className="px">{title}</Heading>
      {children}
      <div className={styles.errorbtns}>{actions}</div>
    </section>
  );
}
