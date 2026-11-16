import { adminRoute } from '@/server/admin/route';
import { AdminError } from '@/server/admin/errors';
import { paymentsProvider } from '@/server/billing/payments';
import { reconcilePurchase, refundPurchase, setProductActive } from '@/server/billing/admin';

export const dynamic = 'force-dynamic';

/** Admin purchases: switch a product, refund, or ask Stripe about one that looks stuck. Audited. */
export const POST = adminRoute({ name: 'purchases', max: 20 }, async ({ admin, deps, body }) => {
  if (body.action === 'product') {
    const out = await setProductActive(deps.sql, admin.userId, body.product, body.active);
    return { ok: true, changed: out.changed };
  }
  if (body.action === 'refund' || body.action === 'reconcile') {
    const payments = paymentsProvider();
    if (!payments) throw new AdminError(409, 'Stripe is not connected on this copy of the game.');
    if (body.action === 'refund') {
      return { ok: true, ...(await refundPurchase(deps, payments, admin.userId, body.id)) };
    }
    return { ok: true, ...(await reconcilePurchase(deps, payments, admin.userId, body.id)) };
  }
  throw new AdminError(400, 'That is not something this page does.');
});
