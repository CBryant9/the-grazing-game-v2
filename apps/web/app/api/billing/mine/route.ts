import { billingRoute } from '@/server/billing/route';
import { mineHandler } from '@/server/billing/handlers';

export const dynamic = 'force-dynamic';

/** "Your purchases": the player's own, and what the account owns. */
export const GET = billingRoute({ name: 'mine', max: 30, write: false }, mineHandler);
