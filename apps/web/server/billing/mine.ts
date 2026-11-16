import 'server-only';
import type { SqlRunner } from '../db/sql';
import type { PaymentsProvider } from './payments';
import { isUuid } from '../admin/store';

/** The signed-in player's own purchases, for "Your purchases" and the return page. Ids and words only. */

export interface MyPurchase {
  id: string;
  product: string;
  amountCents: number;
  status: 'pending' | 'paid' | 'refunded' | 'disputed';
  /** ISO time paid, or null. */
  paidAt: string | null;
  createdAt: string;
  canReceipt: boolean;
}

export async function myPurchases(sql: SqlRunner, userId: string): Promise<MyPurchase[]> {
  const r = await sql.query<{
    id: string;
    name: string;
    amount_cents: number;
    status: MyPurchase['status'];
    paid_at: string | null;
    created_at: string;
    has_pi: boolean;
  }>(
    `select p.id, pr.name, p.amount_cents, p.status, p.paid_at, p.created_at,
            p.stripe_payment_intent_id is not null as has_pi
       from public.purchases p join public.products pr on pr.id = p.product_id
      where p.user_id = $1 and p.status <> 'failed'
        and (p.status <> 'pending' or p.created_at > now() - interval '40 minutes')
      order by p.created_at desc limit 50`,
    [userId],
  );
  return r.rows.map((x) => ({
    id: x.id,
    product: x.name,
    amountCents: x.amount_cents,
    status: x.status,
    paidAt: x.paid_at ? new Date(x.paid_at).toISOString() : null,
    createdAt: new Date(x.created_at).toISOString(),
    canReceipt: x.status !== 'pending' && x.has_pi,
  }));
}

/**
 * The state of one of the player's purchases, as the server holds it. The success page asks this:
 * what the account owns is whatever the webhook wrote, never what the browser says on its way back.
 */
export async function purchaseStatus(
  sql: SqlRunner,
  userId: string,
  id: unknown,
): Promise<{ status: string; product: string } | null> {
  if (!isUuid(id)) return null;
  const r = await sql.query<{ status: string; name: string }>(
    `select p.status, pr.name from public.purchases p
       join public.products pr on pr.id = p.product_id
      where p.id = $1 and p.user_id = $2`,
    [id, userId],
  );
  return r.rows[0] ? { status: r.rows[0].status, product: r.rows[0].name } : null;
}

/** Stripe's receipt page for one of the player's own paid purchases, if Stripe gives one. */
export async function receiptFor(
  sql: SqlRunner,
  payments: PaymentsProvider,
  userId: string,
  id: unknown,
): Promise<string | null> {
  if (!isUuid(id)) return null;
  const r = await sql.query<{ pi: string | null }>(
    `select stripe_payment_intent_id as pi from public.purchases
      where id = $1 and user_id = $2 and status in ('paid', 'refunded', 'disputed')`,
    [id, userId],
  );
  const pi = r.rows[0]?.pi;
  if (!pi) return null;
  return (await payments.paymentState(pi)).receiptUrl;
}
