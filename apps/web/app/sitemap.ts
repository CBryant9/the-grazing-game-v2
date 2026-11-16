import type { MetadataRoute } from 'next';
import { SITE_PAGES, absoluteUrl } from '@/lib/site';

// Every public page, from one list (lib/site.ts), plus the game page.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...SITE_PAGES.map((p) => ({
      url: absoluteUrl(p.path),
      changeFrequency: p.path === '/' ? ('weekly' as const) : ('monthly' as const),
      priority: p.path === '/' ? 1 : 0.6,
    })),
    { url: absoluteUrl('/play'), changeFrequency: 'weekly' as const, priority: 0.8 },
  ];
}
