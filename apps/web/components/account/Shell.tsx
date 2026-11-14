import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import styles from './account.module.css';

/** The frame every sign-in and account page shares: the site header, then one narrow column. */
export function AccountShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main id="main" className={styles.main} tabIndex={-1}>
        <h1 className={`px ${styles.title}`}>{title}</h1>
        {children}
      </main>
    </div>
  );
}
