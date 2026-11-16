'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import styles from './admin.module.css';

/** The admin menu. `later` marks the parts built in a later milestone. */
export const ADMIN_LINKS = [
  { href: '/admin', label: 'Dashboard', later: false },
  { href: '/admin/users', label: 'Users', later: false },
  { href: '/admin/switches', label: 'Feature switches', later: false },
  { href: '/admin/settings', label: 'Site settings', later: false },
  { href: '/admin/notifications', label: 'Notifications', later: false },
  { href: '/admin/audit', label: 'Audit log', later: false },
  { href: '/admin/photos', label: 'Photo queue', later: false },
  { href: '/admin/moderation', label: 'Moderation', later: false },
  { href: '/admin/words', label: 'Word filter', later: false },
  { href: '/admin/ads', label: 'Ads and sponsors', later: false },
  { href: '/admin/purchases', label: 'Purchases', later: false },
  { href: '/admin/challenges', label: 'Challenges', later: false },
] as const;

/**
 * `logo` and `counts` are drawn by the server layout and handed in, so they add no script here.
 * `counts` puts a badge on a menu item, by its address (the open reports on Moderation).
 */
export function AdminNav({
  username,
  logo,
  counts,
}: {
  username: string;
  logo?: ReactNode;
  counts?: Partial<Record<string, ReactNode>>;
}) {
  const path = usePathname() ?? '';
  // A page can not refresh a sign-in that has run out (it can not write cookies), but this call can:
  // it keeps an open admin screen signed in, so the next page does not come up as not found.
  useEffect(() => {
    const ping = (): void => {
      if (document.visibilityState === 'visible') {
        void fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' }).catch(
          () => undefined,
        );
      }
    };
    ping();
    const timer = setInterval(ping, 5 * 60_000);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, []);
  const here = (href: string): boolean =>
    href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`);
  return (
    <nav className={styles.nav} aria-label="Admin">
      <div className={styles.brand}>
        {logo ?? <span>Admin</span>}
        <span className={styles.who}>Signed in as {username}</span>
      </div>
      <ul className={styles.links}>
        {ADMIN_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} prefetch={false} aria-current={here(l.href) ? 'page' : undefined}>
              {l.label}
              {l.later && <span className={styles.later}>(later)</span>}
              {counts?.[l.href]}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/play" prefetch={false}>
            Back to the game
          </Link>
        </li>
      </ul>
    </nav>
  );
}
