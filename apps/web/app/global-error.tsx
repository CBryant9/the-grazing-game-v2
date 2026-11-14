'use client';

import { useEffect } from 'react';
import { ErrorCard } from '@/components/shell/ErrorCard';
import styles from '@/components/shell/shell.module.css';
import { themeScript } from '@/lib/themeScript';
import './globals.css';

/**
 * The last resort: the page layout itself failed, so this replaces the whole
 * page, including the header. It has to bring its own html and body. A plain
 * link is used for the home page, because the router may be what failed.
 */
export default function GlobalError({
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
    <html lang="en-AU" suppressHydrationWarning>
      <head>
        <title>Something went wrong | The Grazing Game</title>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
        <main id="main" className={styles.bare}>
          <ErrorCard
            title="Something went wrong"
            actions={
              <>
                <button type="button" className="btn coral" onClick={reset}>
                  Try again
                </button>
                {/* A full page load, on purpose: it starts clean after a failure this deep. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/" className="btn ghost">
                  Home page
                </a>
              </>
            }
          >
            <p>The game could not be shown. Your farm is kept on the server.</p>
            <p className="muted">Try again, or go back to the home page.</p>
          </ErrorCard>
        </main>
      </body>
    </html>
  );
}
