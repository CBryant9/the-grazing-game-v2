import type { PageConfig } from 'next';
import Head from 'next/head';
import Link from '@/components/site/SiteLink';
import { PublicHeader } from '@/components/site/PublicHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import styles from '@/components/shell/shell.module.css';
import { ErrorCard } from '@/components/shell/ErrorCard';

export const config: PageConfig = { unstable_runtimeJS: false };

/** An address that is not a page here. */
export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found | The Grazing Game</title>
        <meta name="robots" content="noindex" />
      </Head>
      <PublicHeader current="" />
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
      <SiteFooter />
    </>
  );
}
