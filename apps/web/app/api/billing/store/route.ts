import { billingRoute } from '@/server/billing/route';
import { storeHandler } from '@/server/billing/handlers';

export const dynamic = 'force-dynamic';

/** What is for sale to this visitor. With purchases off or no keys: `selling: false` and nothing listed. */
export const GET = billingRoute({ name: 'store', max: 60, write: false }, storeHandler);
