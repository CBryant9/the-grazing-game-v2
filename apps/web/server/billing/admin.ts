import 'server-only';
import { logFailure } from '../logging';
import { AdminError } from '../admin/errors';
import { audit, isUuid } from '../admin/store';
import type { AuthDeps } from '../auth/accounts';
import type { PaymentsProvider } from './payments';
import { OPEN_PRICE_PRODUCTS, getProduct, listProducts, type ProductRow } from './products';
import { applyRescue, rescueReady } from './rescue';
import {
  applyDispute,
  applyRefund,
  factsFromSession,
  lockById,
  settleFailed,
  settlePaid,
} from './settle';

/**
 * What the admin purchases page reads and does (PRD 11.5). Reads show ids, products, amounts,
 * states and times only: no email, name or card detail is ever read here (none is stored).
 * Every change is audited in the same transaction as the change, in the audit log's fixed shape.
 */

export interface PurchaseListRow {
  id: string;
  product: string;
  amountCents: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  /** A paid rescue not yet applied to its farm. */
  rescueWaiting: boolean;
  /** Has a Stripe payment, so it can be refunded or checked. */
  hasPayment: boolean;
  farmId: string | null;
}

export interface PurchasesOverview {
  asAt: string;
  counts: Record<'pending' | 'paid' | 'refunded' | 'disputed' | 'failed', number>;
  /** Total of paid purchases, in cents. */
  paidCents: number;
  rescuesWaiting: number;
  products: ProductRow[];
  recent: PurchaseListRow[];
  events: { total: number; lastAt: string | null; waiting: number; failed: number };
}

export async function purchasesOverview(sql: AuthDeps['sql']): Promise<PurchasesOverview> {
  const [counts, sums, rows, ev, products, now] = await Promise.all([
    sql.query<{ status: string; n: number }>(
      `select status, count(*)::int as n from public.purchases group by status`,
    ),
    sql.query<{ cents: number }>(
      `select coalesce(sum(amount_cents), 0)::int as cents from public.purchases where status = 'paid'`,
    ),
    sql.query<{
      id: string;
      name: string;
      amount_cents: number;
      status: string;
      created_at: string;
      paid_at: string | null;
      kind: string;
      applied_at: string | null;
      pi: string | null;
      farm_id: string | null;
    }>(
      `select p.id, pr.name, p.amount_cents, p.status, p.created_at, p.paid_at, pr.kind, p.applied_at,
              p.stripe_payment_intent_id as pi, p.farm_id
         from public.purchases p join public.products pr on pr.id = p.product_id
        order by p.created_at desc limit 30`,
    ),
    sql.query<{ total: number; last_at: string | null; waiting: number; failed: number }>(
      `select count(*)::int as total, max(received_at) as last_at,
              count(*) filter (where processed_at is null and error = 'waiting_for_purchase')::int as waiting,
              count(*) filter (where error is not null and error <> 'waiting_for_purchase')::int as failed
         from public.stripe_events`,
    ),
    listProducts(sql),
    sql.query<{ now: string }>('select now() as now'),
  ]);
  const by = new Map(counts.rows.map((r) => [r.status, r.n]));
  const waiting = await sql.query<{ n: number }>(
    `select count(*)::int as n from public.purchases p join public.products pr on pr.id = p.product_id
      where pr.kind = 'keep_going' and p.status = 'paid' and p.applied_at is null`,
  );
  return {
    asAt: new Date(now.rows[0]!.now).toISOString(),
    counts: {
      pending: by.get('pending') ?? 0,
      paid: by.get('paid') ?? 0,
      refunded: by.get('refunded') ?? 0,
      disputed: by.get('disputed') ?? 0,
      failed: by.get('failed') ?? 0,
    },
    paidCents: sums.rows[0]?.cents ?? 0,
    rescuesWaiting: waiting.rows[0]?.n ?? 0,
    products,
    recent: rows.rows.map((r) => ({
      id: r.id,
      product: r.name,
      amountCents: r.amount_cents,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
      paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
      rescueWaiting: r.kind === 'keep_going' && r.status === 'paid' && !r.applied_at,
      hasPayment: r.pi !== null,
      farmId: r.farm_id,
    })),
    events: {
      total: ev.rows[0]?.total ?? 0,
      lastAt: ev.rows[0]?.last_at ? new Date(ev.rows[0].last_at).toISOString() : null,
      waiting: ev.rows[0]?.waiting ?? 0,
      failed: ev.rows[0]?.failed ?? 0,
    },
  };
}

/** Switch one product on or off. A product with an Open price, or a rescue with no engine, stays off. */
export async function setProductActive(
  sql: AuthDeps['sql'],
  adminId: string,
  productId: unknown,
  active: unknown,
): Promise<{ changed: boolean }> {
  if (typeof productId !== 'string') throw new AdminError(400, 'Choose a product.');
  if (typeof active !== 'boolean') throw new AdminError(400, 'Say whether it is on or off.');
  const out = await sql.transaction(async (tx) => {
    const p = await getProduct(tx, productId);
    if (!p) throw new AdminError(404, 'That is not a product.');
    if (active && OPEN_PRICE_PRODUCTS.includes(p.id)) {
      throw new AdminError(
        409,
        'The price for this one is still to be set (PRD 10.3), so it can not be switched on.',
      );
    }
    if (active && p.kind === 'keep_going' && !rescueReady()) {
      throw new AdminError(
        409,
        'Paying to keep going can not be switched on yet: the game does not have the rescue step built.',
      );
    }
    if (p.active === active) return false;
    await tx.query('update public.products set active = $2 where id = $1', [p.id, active]);
    await audit(tx, adminId, 'product_set', 'product', p.id, { enabled: active });
    return true;
  });
  return { changed: out };
}

/** Refund a paid purchase in full through the payments provider, then record it. */
export async function refundPurchase(
  deps: AuthDeps,
  payments: PaymentsProvider,
  adminId: string,
  id: unknown,
): Promise<{ status: string }> {
  if (!isUuid(id)) throw new AdminError(400, 'Choose a purchase.');
  const before = await deps.sql.transaction((tx) => lockById(tx, id));
  if (!before) throw new AdminError(404, 'That purchase was not found.');
  if (before.status !== 'paid') throw new AdminError(409, 'Only a paid purchase can be refunded.');
  if (!before.stripe_payment_intent_id) {
    throw new AdminError(409, 'That purchase has no payment to refund.');
  }
  try {
    await payments.refund(before.stripe_payment_intent_id, `refund-${before.id}`);
  } catch (e) {
    logFailure({ route: 'admin-purchases', reason: 'refund_failed' }, e);
    throw new AdminError(503, 'Stripe did not refund it. Nothing was changed here.');
  }
  // The refund is made. Record it, with the audit row in the same transaction. The webhook
  // for the same refund may land first: then there is nothing left to change, and the row says so.
  const status = await deps.sql.transaction(async (tx) => {
    const p = await lockById(tx, before.id);
    if (p) await applyRefund(tx, p);
    await audit(tx, adminId, 'purchase_refund', 'purchase', before.id, {
      value: before.amount_cents,
    });
    return 'refunded';
  });
  return { status };
}

/**
 * Ask the payments provider for the true state of a purchase that looks stuck, and settle it the
 * way the webhook would have. Also retries a paid rescue that did not reach its farm.
 */
export async function reconcilePurchase(
  deps: AuthDeps,
  payments: PaymentsProvider,
  adminId: string,
  id: unknown,
): Promise<{ status: string; rescue: string | null }> {
  if (!isUuid(id)) throw new AdminError(400, 'Choose a purchase.');
  const first = await deps.sql.query<{ session: string | null; pi: string | null; status: string }>(
    `select stripe_checkout_session_id as session, stripe_payment_intent_id as pi, status
       from public.purchases where id = $1`,
    [id],
  );
  const row = first.rows[0];
  if (!row) throw new AdminError(404, 'That purchase was not found.');
  let session = null;
  if (row.session) {
    try {
      session = await payments.retrieveSession(row.session);
    } catch (e) {
      logFailure({ route: 'admin-purchases', reason: 'reconcile_lookup_failed' }, e);
      throw new AdminError(503, 'Stripe could not be asked just now. Nothing was changed.');
    }
  }
  const intent = session?.paymentIntent ?? row.pi;
  let state = null;
  if (intent) {
    try {
      state = await payments.paymentState(intent);
    } catch (e) {
      logFailure({ route: 'admin-purchases', reason: 'reconcile_state_failed' }, e);
      throw new AdminError(503, 'Stripe could not be asked just now. Nothing was changed.');
    }
  }
  const status = await deps.sql.transaction(async (tx) => {
    if (session?.status === 'complete' && session.paymentStatus === 'paid') {
      await settlePaid(tx, factsFromSession(session), state);
    } else if (session?.status === 'expired') {
      await settleFailed(tx, session.id);
    }
    const p = await lockById(tx, id);
    if (p && state) {
      if (state.fullyRefunded) await applyRefund(tx, p);
      else if (state.disputed && p.status === 'paid') await applyDispute(tx, p, 'open');
    }
    await audit(tx, adminId, 'purchase_reconcile', 'purchase', id, {});
    return (await lockById(tx, id))?.status ?? row.status;
  });
  let rescue: string | null = null;
  if (status === 'paid') {
    rescue = await applyRescue(deps, id).catch((e: unknown) => {
      logFailure({ route: 'admin-purchases', reason: 'rescue_apply_failed' }, e);
      return 'failed';
    });
    if (rescue === 'not_applicable') rescue = null;
  }
  return { status, rescue };
}
