import { billingRoute } from '@/server/billing/route';
import { receiptHandler } from '@/server/billing/handlers';

export const dynamic = 'force-dynamic';

/** The address of Stripe's receipt for one of the player's own paid purchases, if Stripe has one. */
export const GET = billingRoute(
  { name: 'receipt', max: 10, windowMs: 60_000, write: false },
  receiptHandler,
);
