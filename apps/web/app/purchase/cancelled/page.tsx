import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountShell } from '@/components/account/Shell';
import styles from '@/components/account/account.module.css';

export const metadata: Metadata = {
  title: 'Purchase cancelled',
  description: 'Nothing was charged.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AccountShell title="Purchase cancelled">
      <div className={styles.card}>
        <p>You cancelled, so nothing was charged. Nothing on your account has changed.</p>
        <Link href="/store" className={`btn ${styles.linkbtn}`}>
          Back to the store
        </Link>
        <Link href="/play" className={`btn ghost ${styles.linkbtn}`}>
          Back to the game
        </Link>
      </div>
    </AccountShell>
  );
}
