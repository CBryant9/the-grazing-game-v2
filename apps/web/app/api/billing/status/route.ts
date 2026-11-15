import { billingRoute } from '@/server/billing/route';
import { statusHandler } from '@/server/billing/handlers';

export const dynamic = 'force-dynamic';

/** The state of one of the player's purchases, as the server holds it (the webhook wrote it). */
export const GET = billingRoute({ name: 'status', max: 60, write: false }, statusHandler);
