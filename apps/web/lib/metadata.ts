import type { Metadata } from 'next';
import { SITE } from '@gg/shared';
import { SITE_PAGES } from './site';

/**
 * Metadata for one public page: title, description, canonical address, and the
 * Open Graph and Twitter text. The share image comes from the page's own
 * `opengraph-image.tsx`, made in code (see lib/shareImage.tsx).
 */
export function pageMetadata(path: string): Metadata {
  const page = SITE_PAGES.find((p) => p.path === path);
  if (!page) throw new Error(`No page listed for ${path} in SITE_PAGES`);
  const title = path === '/' ? `${SITE.name}: ${SITE.tagline}` : page.title;
  const fullTitle = path === '/' ? title : `${page.title} | ${SITE.name}`;
  return {
    title: path === '/' ? { absolute: title } : page.title,
    description: page.description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      locale: 'en_AU',
      title: fullTitle,
      description: page.description,
      url: path,
    },
    twitter: { card: 'summary_large_image', title: fullTitle, description: page.description },
  };
}
