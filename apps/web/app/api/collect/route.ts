import { collectPost } from '@/server/analytics/collect';

export const dynamic = 'force-dynamic';

/** The first-party analytics beacon (milestone 5.3). Keeps nothing without consent and the switch. */
export const POST = collectPost;
