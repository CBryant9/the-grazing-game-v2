import { authRoute } from '@/server/auth/route';
import { adsClick } from '@/server/ads/routes';

export const dynamic = 'force-dynamic';

/**
 * A click on an ad: looks the link up by creative id (never taken from the request), counts the
 * click, and redirects. An unknown id, a switched-off ad or a bad link is a plain 404.
 */
export const GET = authRoute({ name: 'ad-click', max: 30, by: 'session' }, adsClick);
