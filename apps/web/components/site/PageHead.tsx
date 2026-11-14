import Head from 'next/head';
import { SITE } from '@gg/shared';
import { SITE_PAGES, absoluteUrl } from '@/lib/site';

/**
 * The head of a public page: title, description, canonical address, Open Graph
 * and Twitter text, the share image (made in code, app/**\/opengraph-image.tsx),
 * and any structured data. The public pages use the pages router so they can
 * send no JavaScript, so this replaces the metadata export the app router has.
 */
export function PageHead({
  path,
  jsonLd = [],
}: {
  path: string;
  jsonLd?: Record<string, unknown>[];
}) {
  const page = SITE_PAGES.find((p) => p.path === path);
  if (!page) throw new Error(`No page listed for ${path} in SITE_PAGES`);
  const title = path === '/' ? `${SITE.name}: ${SITE.tagline}` : `${page.title} | ${SITE.name}`;
  const url = absoluteUrl(path);
  const image = `${absoluteUrl(path === '/' ? '' : path)}/opengraph-image`;
  const alt = `${SITE.name}: ${path === '/' ? 'a real grazing game' : page.title}`;
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={page.description} />
      <link rel="canonical" href={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:locale" content="en_AU" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={page.description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={alt} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={page.description} />
      <meta name="twitter:image" content={image} />
      {jsonLd.map((data, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\u003c') }}
        />
      ))}
    </Head>
  );
}
