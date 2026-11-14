import { adsMedia } from '@/server/ads/routes';

export const dynamic = 'force-dynamic';

/** An ad's picture or video, served with safe headers from our own address. */
export const GET = adsMedia;
