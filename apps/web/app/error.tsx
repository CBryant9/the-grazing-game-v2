'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ErrorCard } from '@/components/shell/ErrorCard';
import styles from '@/components/shell/shell.module.css';
import { SiteHeader } from '@/components/SiteHeader';

/**
 * Shown when a page fails while it is being drawn. Plain words, no stack. The
 * error is logged to the console for now; Sentry takes it in Stage 3.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <>
      <SiteHeader />
      <main id="main" className={`wrap ${styles.errorpage}`} tabIndex={-1}>
        <ErrorCard
          title="Something went wrong"
          actions={
            <>
              <button type="button" className="btn coral" onClick={reset}>
                Try again
              </button>
              <Link href="/" className="btn ghost">
                Home page
              </Link>
            </>
          }
        >
          <p>This page could not be shown. Your farm is kept on the server.</p>
          <p className="muted">Try again, or go back to the home page.</p>
        </ErrorCard>
      </main>
    </>
  );
}
