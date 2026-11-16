import type { Metadata } from 'next';
import Link from 'next/link';
import { ErrorCard } from '@/components/shell/ErrorCard';
import styles from '@/components/shell/shell.module.css';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

/** An address that is not a page here. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className={`wrap ${styles.errorpage}`}>
        <ErrorCard
          title="That page was not found"
          actions={
            <>
              <Link href="/" className="btn coral">
                Home page
              </Link>
              <Link href="/play" className="btn ghost">
                Play
              </Link>
            </>
          }
        >
          <p>There is no page at this address. The link may be old or mistyped.</p>
        </ErrorCard>
      </main>
    </>
  );
}
