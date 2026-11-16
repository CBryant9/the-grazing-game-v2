'use client';

import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { useMe } from '@/lib/auth/store';
import { Icon } from './Icon';
import styles from './play.module.css';

/** The links and the account on /play: what the mockup's PC header holds. */
function PlayNav() {
  const me = useMe((s) => s.me);
  const signedIn = !!me?.accounts && me.signedIn && !me.needsSignUp;
  const links = [
    { href: '/play', label: 'Farm', on: true, show: true },
    { href: '/community', label: 'Community', on: false, show: !!me?.community },
    { href: '/leaderboards', label: 'Leaderboard', on: false, show: !!me?.leaderboards },
    { href: '/community/groups', label: 'Groups', on: false, show: !!me?.community },
  ].filter((l) => l.show);
  return (
    <>
      <nav className={styles.pcnav} aria-label="Main">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={styles.pcnavlink}
            aria-current={l.on ? 'page' : undefined}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      {signedIn && (
        <div className={styles.pcme}>
          <Link href="/account/notifications" className="iconbtn sm" aria-label="Notifications">
            <Icon name="bell" size={16} />
          </Link>
          <Link
            href="/account"
            className={styles.avatar}
            aria-label={`Account, ${me?.username ?? ''}`}
          >
            {(me?.username ?? '?').charAt(0).toUpperCase()}
          </Link>
        </div>
      )}
    </>
  );
}

/** The website header on /play. `theme`: keep the light and dark switch (the setup screen). */
export function PlayHeader({ theme = false }: { theme?: boolean }) {
  return <SiteHeader nav={<PlayNav />} theme={theme} />;
}
