import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

// `/admin` is not named here on purpose: naming it would tell the world it exists. The admin pages
// are `noindex` once the role check passes; everyone else gets the same not found as any unknown address.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api', '/dev'] }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
