import { billingRoute } from '@/server/billing/route';
import { checkoutHandler } from '@/server/billing/handlers';

export const dynamic = 'force-dynamic';

/** Make a Stripe Checkout for one product and answer with its address. The price is the server's own. */
export const POST = billingRoute({ name: 'checkout', max: 8, write: true }, checkoutHandler);
