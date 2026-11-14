import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import styles from '@/components/community/community.module.css';
import { Ticker } from '@/components/site/Ticker';
import { featureSwitches } from '@/server/auth/accounts';
import { requireMember } from '@/server/community/page';

// Never for search engines and never kept by the service worker (lib/pwa/cacheablePage.ts: only
// `/` and `/play` are). Every request asks who is signed in: a page for members only.
export const metadata: Metadata = {
  title: 'Community',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function CommunityLayout({ children }: { children: ReactNode }) {
  const { deps } = await requireMember();
  // The live ticker (PRD 9.4) shows on community pages when its own switch is on.
  const live = await featureSwitches(deps.sql);
  const tickerOn = live.community && live.activity_ticker;
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
      {tickerOn ? <Ticker place="strip" /> : null}
    </div>
  );
}
