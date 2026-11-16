import { authRoute } from '@/server/auth/route';
import { adsEvent } from '@/server/ads/routes';

export const dynamic = 'force-dynamic';

/** A view, or a video's end or skip, reported by the browser with the server's signed token. */
export const POST = authRoute({ name: 'ad-event', max: 120, write: true, by: 'session' }, adsEvent);
