import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from './SiteFooter';
import { JsonLd } from './JsonLd';
import { SITE_PAGES, absoluteUrl } from '@/lib/site';
import { SITE } from '@gg/shared';
import styles from './site.module.css';

/**
 * The frame every public page shares: the website header, a main area with a
 * big page heading and a short line under it (PRD 6.3), and the footer.
 * Pages here never load the game's code.
 */
export function PageShell({
  path,
  heading,
  subtitle,
  children,
}: {
  path: string;
  heading: string;
  subtitle: string;
  children: ReactNode;
}) {
  const page = SITE_PAGES.find((p) => p.path === path);
  return (
    <>
      <SiteHeader current={path} />
      <main id="main" className={styles.main}>
        <div className="wrap">
          <div className="pagehead">
            <h1>{heading}</h1>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
      </main>
      <SiteFooter />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: SITE.name, item: absoluteUrl('/') },
            {
              '@type': 'ListItem',
              position: 2,
              name: page?.title ?? heading,
              item: absoluteUrl(path),
            },
          ],
        }}
      />
    </>
  );
}
