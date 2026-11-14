import 'server-only';
import type { SqlRunner } from '../db/sql';
import type { CheckoutSession, PaymentState } from './payments';

/**
 * What a purchase becomes, decided here and nowhere else, and only ever from a verified webhook
 * event or from the payments provider's own answer (the admin's reconcile). Never from the
 * browser coming back from Checkout.
 *
 * Every function takes the caller's transaction and locks the purchase row first, so two events
 * for one purchase (in any order, or the same one twice) take turns. The rules:
 *
 * - Paid: only when Stripe says the session is paid, and the amount, currency and product match
 *   OUR row, which was made from the product table at the moment the checkout was made. Metadata
 *   on the event is only an extra check, never the answer.
 * - Refund (the whole amount) and dispute (raised or under review): the entitlement is taken away
 *   (`revoked_at`), and the purchase says why. A dispute closed in our favour gives it back.
 *   PRD 10.3 is silent on both, so this is a stated call (m5.2 log, "Calls for Claudia").
 * - A part refund changes nothing. Admin refunds are always the whole amount.
 */

export interface PaidFacts {
  sessionId: string;
  paymentIntent: string | null;
  amountTotal: number | null;
  currency: string | null;
  paymentStatus: string;
  customer: string | null;
  metaProductId: string | null;
  metaPurchaseId: string | null;
}

export const factsFromSession = (s: CheckoutSession): PaidFacts => ({
  sessionId: s.id,
  paymentIntent: s.paymentIntent,
  amountTotal: s.amountTotal,
  currency: s.currency?.toLowerCase() ?? null,
  paymentStatus: s.paymentStatus,
  customer: s.customer,
  metaProductId: s.metadata.product_id ?? null,
  metaPurchaseId: s.metadata.purchase_id ?? null,
});

export interface PurchaseLock {
  id: string;
  user_id: string | null;
  product_id: string;
  farm_id: string | null;
  status: 'pending' | 'paid' | 'refunded' | 'disputed' | 'failed';
  amount_cents: number;
  currency: string;
  stripe_payment_intent_id: string | null;
  kind: 'pack' | 'upgrade' | 'keep_going';
  grants: string[];
}

const COLUMNS = `p.id, p.user_id, p.product_id, p.farm_id, p.status, p.amount_cents, p.currency,
  p.stripe_payment_intent_id, pr.kind, pr.grants`;

export async function lockBySession(
  tx: SqlRunner,
  sessionId: string,
): Promise<PurchaseLock | null> {
  const r = await tx.query<PurchaseLock>(
    `select ${COLUMNS} from public.purchases p join public.products pr on pr.id = p.product_id
      where p.stripe_checkout_session_id = $1 for update of p`,
    [sessionId],
  );
  return r.rows[0] ?? null;
}

export async function lockByIntent(tx: SqlRunner, intent: string): Promise<PurchaseLock | null> {
  const r = await tx.query<PurchaseLock>(
    `select ${COLUMNS} from public.purchases p join public.products pr on pr.id = p.product_id
      where p.stripe_payment_intent_id = $1 for update of p`,
    [intent],
  );
  return r.rows[0] ?? null;
}

export async function lockById(tx: SqlRunner, id: string): Promise<PurchaseLock | null> {
  const r = await tx.query<PurchaseLock>(
    `select ${COLUMNS} from public.purchases p join public.products pr on pr.id = p.product_id
      where p.id = $1 for update of p`,
    [id],
  );
  return r.rows[0] ?? null;
}

export type PaidOutcome =
  | 'paid'
  | 'already'
  | 'not_paid_yet'
  | 'unknown_session'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'product_mismatch';

/** Take away what a purchase gave. The rows stay, marked revoked, so a won dispute can restore them. */
async function revoke(tx: SqlRunner, purchaseId: string): Promise<void> {
  await tx.query(
    `update public.account_entitlements set revoked_at = now()
      where purchase_id = $1 and revoked_at is null`,
    [purchaseId],
  );
}

async function grant(tx: SqlRunner, p: PurchaseLock): Promise<void> {
  if (!p.user_id) return; // the account was deleted: the record stays, nothing to give to
  for (const g of p.grants) {
    await tx.query(
      `insert into public.account_entitlements (user_id, entitlement, purchase_id, granted_at)
       values ($1, $2, $3, now())
       on conflict (user_id, entitlement) do update
         set purchase_id = excluded.purchase_id, granted_at = now(), revoked_at = null`,
      [p.user_id, g, p.id],
    );
  }
}

export async function applyRefund(tx: SqlRunner, p: PurchaseLock): Promise<boolean> {
  if (p.status !== 'paid' && p.status !== 'disputed') return false;
  await tx.query(`update public.purchases set status = 'refunded' where id = $1`, [p.id]);
  await revoke(tx, p.id);
  return true;
}

export async function applyDispute(
  tx: SqlRunner,
  p: PurchaseLock,
  state: 'open' | 'won',
): Promise<boolean> {
  if (state === 'open') {
    if (p.status !== 'paid') return false;
    await tx.query(`update public.purchases set status = 'disputed' where id = $1`, [p.id]);
    await revoke(tx, p.id);
    return true;
  }
  if (p.status !== 'disputed') return false;
  await tx.query(`update public.purchases set status = 'paid' where id = $1`, [p.id]);
  await tx.query(
    `update public.account_entitlements set revoked_at = null
      where purchase_id = $1 and revoked_at is not null`,
    [p.id],
  );
  return true;
}

/**
 * A session that Stripe says is paid. `later` is what the provider says about refunds and
 * disputes on this payment, passed when an earlier refund or dispute event was waiting for this
 * purchase to be known (events arrive in any order).
 */
export async function settlePaid(
  tx: SqlRunner,
  f: PaidFacts,
  later: PaymentState | null,
): Promise<{ outcome: PaidOutcome; purchaseId: string | null; becamePaid: boolean }> {
  const p = await lockBySession(tx, f.sessionId);
  if (!p) return { outcome: 'unknown_session', purchaseId: null, becamePaid: false };
  if (f.paymentStatus !== 'paid')
    return { outcome: 'not_paid_yet', purchaseId: p.id, becamePaid: false };
  if (p.status === 'paid' || p.status === 'refunded' || p.status === 'disputed') {
    return { outcome: 'already', purchaseId: p.id, becamePaid: false };
  }
  // Checked against our own row (made from the product table), never against the metadata alone.
  const wrong: PaidOutcome | null =
    f.currency !== 'aud' || p.currency !== 'aud'
      ? 'currency_mismatch'
      : f.amountTotal !== p.amount_cents
        ? 'amount_mismatch'
        : (f.metaProductId !== null && f.metaProductId !== p.product_id) ||
            (f.metaPurchaseId !== null && f.metaPurchaseId !== p.id)
          ? 'product_mismatch'
          : null;
  if (wrong) {
    // Money was taken, but not for what we offered. Nothing is given. The id is kept so an admin
    // can refund it from the purchases page.
    await tx.query(
      `update public.purchases set status = 'failed',
              stripe_payment_intent_id = coalesce($2, stripe_payment_intent_id)
        where id = $1`,
      [p.id, f.paymentIntent],
    );
    return { outcome: wrong, purchaseId: p.id, becamePaid: false };
  }
  await tx.query(
    `update public.purchases set status = 'paid', paid_at = coalesce(paid_at, now()),
            stripe_payment_intent_id = coalesce($2, stripe_payment_intent_id)
      where id = $1`,
    [p.id, f.paymentIntent],
  );
  await grant(tx, p);
  if (f.customer && p.user_id) {
    await tx.query(
      `insert into public.stripe_customers (user_id, stripe_customer_id) values ($1, $2)
       on conflict do nothing`,
      [p.user_id, f.customer],
    );
  }
  if (later) {
    const now = { ...p, status: 'paid' as const };
    if (later.fullyRefunded) await applyRefund(tx, now);
    else if (later.disputed) await applyDispute(tx, now, 'open');
  }
  return { outcome: 'paid', purchaseId: p.id, becamePaid: !later?.fullyRefunded };
}

/** An expired or failed checkout. Never touches a purchase that was paid. */
export async function settleFailed(tx: SqlRunner, sessionId: string): Promise<boolean> {
  const p = await lockBySession(tx, sessionId);
  if (!p || p.status !== 'pending') return false;
  await tx.query(`update public.purchases set status = 'failed' where id = $1`, [p.id]);
  return true;
}
