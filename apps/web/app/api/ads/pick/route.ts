import { authRoute } from '@/server/auth/route';
import { adsPick } from '@/server/ads/routes';

export const dynamic = 'force-dynamic';

/** What to show in one slot, for this viewer, now. Reads no farm. An empty list when the slot is off. */
export const GET = authRoute({ name: 'ad-pick', max: 60, by: 'session' }, adsPick);
