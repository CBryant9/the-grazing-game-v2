import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';
import styles from '@/components/admin/admin.module.css';
import { requireAdmin } from '@/server/admin/page';

// Never for search engines, never cached (the service worker leaves /admin to the network, and
// next.config.ts sends X-Robots-Tag). Every request asks who is signed in.
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const page = await requireAdmin();
  if (!page) {
    return (
      <main id="main" className={styles.plain}>
        <h1 className={styles.h1}>Admin needs accounts to be set up</h1>
        <p className={styles.lede}>
          The admin area works through sign-in and the database. This copy of the game has neither
          set up yet, so there is nothing to show here. The game itself is not affected.
        </p>
      </main>
    );
  }
  return (
    <div className={styles.shell}>
      <AdminNav username={page.admin.username} />
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
