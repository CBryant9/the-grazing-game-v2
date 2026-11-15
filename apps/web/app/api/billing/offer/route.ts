import { billingRoute } from '@/server/billing/route';
import { offerHandler } from '@/server/billing/handlers';

export const dynamic = 'force-dynamic';

/** The "keep going" offer card for one finished farm. Nothing at all until the game can apply it. */
export const GET = billingRoute({ name: 'offer', max: 30, write: false }, offerHandler);
