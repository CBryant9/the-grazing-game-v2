import 'server-only';
import { logFailure } from '../logging';
import type { SqlClient, SqlRunner } from '../db/sql';
import type { BillingEvent } from './events';
import { parseEvent } from './events';
import type { PaymentState, PaymentsProvider } from './payments';
import { applyRescue } from './rescue';
import {
  applyDispute,
  applyRefund,
  lockByIntent,
  settleFailed,
  settlePaid,
  type PaidOutcome,
} from './settle';
import { verifyStripeSignature } from './verify';

/**
 * The Stripe webhook, in order:
 *
 * 1. The raw body and the `Stripe-Signature` header are checked against the signing secret, with a
 *    time tolerance (verify.ts). Anything else is a plain 400 and nothing is read from the body.
 * 2. The event is cut down to ids and numbers (events.ts). Nothing personal is stored or logged.
 * 3. In ONE transaction: the event id is recorded (a repeat is a no-op), the event is acted on
 *    (settle.ts), and the event is marked processed. If any step fails the whole thing rolls back
 *    and the answer is a 500, so Stripe sends it again.
 * 4. A paid rescue is applied to its farm after that transaction, once.
 *
 * Event types this app does not act on are recorded and answered with a success, so Stripe does
 * not send them again. Events arrive in any order: a refund or dispute that arrives before its
 * purchase is known waits (`error = 'waiting_for_purchase'`), and is settled when the purchase is.
 */

export interface WebhookAnswer {
  status: 200 | 400 | 500;
  body: { ok: boolean; result?: string; error?: string };
}

const WAITING = 'waiting_for_purchase';

function idsOf(ev: BillingEvent): {
  objectId: string | null;
  customer: string | null;
  intent: string | null;
} {
  switch (ev.kind) {
    case 'paid':
      return { objectId: ev.sessionId, customer: ev.customer, intent: ev.paymentIntent };
    case 'failed':
      return { objectId: ev.sessionId, customer: null, intent: null };
    case 'refund':
    case 'dispute':
      return { objectId: ev.paymentIntent, customer: ev.customer, intent: ev.paymentIntent };
    default:
      return { objectId: null, customer: null, intent: null };
  }
}

async function recordEvent(tx: SqlRunner, ev: BillingEvent): Promise<'new' | 'replay' | 'again'> {
  const ids = idsOf(ev);
  const ins = await tx.query<{ id: string }>(
    `insert into public.stripe_events (id, type, object_id, stripe_customer_id, payment_intent_id)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do nothing returning id`,
    [ev.eventId, ev.type, ids.objectId, ids.customer, ids.intent],
  );
  if (ins.rows.length > 0) return 'new';
  const seen = await tx.query<{ processed_at: string | null }>(
    `select processed_at from public.stripe_events where id = $1 for update`,
    [ev.eventId],
  );
  // A processed event is never acted on again. One that was left waiting is tried again.
  return seen.rows[0]?.processed_at ? 'replay' : 'again';
}

async function finish(tx: SqlRunner, eventId: string, error: string | null): Promise<void> {
  await tx.query(
    `update public.stripe_events
        set processed_at = case when $2::text = $3 then null else now() end, error = $2
      where id = $1`,
    [eventId, error, WAITING],
  );
}

/** Act on one event inside the caller's transaction. Returns what happened, in a fixed word. */
async function act(
  tx: SqlRunner,
  ev: BillingEvent,
  later: PaymentState | null,
): Promise<{ result: string; error: string | null; rescue: string | null }> {
  switch (ev.kind) {
    case 'paid': {
      const r = await settlePaid(tx, ev, later);
      const bad: PaidOutcome[] = [
        'amount_mismatch',
        'currency_mismatch',
        'product_mismatch',
        'unknown_session',
      ];
      // Whether a waiting refund or dispute is now settled too.
      if (r.outcome === 'paid' || r.outcome === 'already') {
        await tx.query(
          `update public.stripe_events set processed_at = now(), error = null
            where payment_intent_id = $1 and error = $2 and processed_at is null`,
          [ev.paymentIntent, WAITING],
        );
      }
      return {
        result: r.outcome,
        error: bad.includes(r.outcome) ? r.outcome : null,
        rescue: r.becamePaid ? r.purchaseId : null,
      };
    }
    case 'failed': {
      const changed = await settleFailed(tx, ev.sessionId);
      return { result: changed ? 'failed' : 'nothing_to_fail', error: null, rescue: null };
    }
    case 'refund': {
      if (!ev.fullyRefunded) return { result: 'part_refund_ignored', error: null, rescue: null };
      const p = ev.paymentIntent ? await lockByIntent(tx, ev.paymentIntent) : null;
      if (!p) return { result: 'waiting', error: WAITING, rescue: null };
      const changed = await applyRefund(tx, p);
      return { result: changed ? 'refunded' : 'already', error: null, rescue: null };
    }
    case 'dispute': {
      const p = ev.paymentIntent ? await lockByIntent(tx, ev.paymentIntent) : null;
      if (!p) return { result: 'waiting', error: WAITING, rescue: null };
      const changed = await applyDispute(tx, p, ev.state);
      return {
        result: changed ? (ev.state === 'won' ? 'dispute_won' : 'disputed') : 'already',
        error: null,
        rescue: null,
      };
    }
    default:
      return { result: 'ignored', error: null, rescue: null };
  }
}

export async function handleWebhook(
  deps: { sql: SqlClient },
  payments: PaymentsProvider,
  rawBody: string,
  signature: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<WebhookAnswer> {
  const sig = verifyStripeSignature(rawBody, signature, payments.webhookSecret, nowSeconds);
  if (!sig.ok) {
    return { status: 400, body: { ok: false, error: 'The signature did not check out.' } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { ok: false, error: 'That was not an event.' } };
  }
  const ev = parseEvent(parsed);
  if (!ev) return { status: 400, body: { ok: false, error: 'That was not an event.' } };

  try {
    // A paid event that arrives after a refund or dispute for the same payment needs the true
    // state of the payment, asked of Stripe before the transaction (not inside it).
    let later: PaymentState | null = null;
    if (ev.kind === 'paid' && ev.paymentIntent) {
      const waiting = await deps.sql.query(
        `select 1 from public.stripe_events
          where payment_intent_id = $1 and error = $2 and processed_at is null limit 1`,
        [ev.paymentIntent, WAITING],
      );
      if (waiting.rows.length > 0) later = await payments.paymentState(ev.paymentIntent);
    }
    const done = await deps.sql.transaction(async (tx) => {
      const seen = await recordEvent(tx, ev);
      if (seen === 'replay') return { result: 'replay', rescue: null };
      const r = await act(tx, ev, later);
      await finish(tx, ev.eventId, r.error === WAITING ? WAITING : r.error);
      return { result: r.result, rescue: r.rescue };
    });
    if (done.rescue) {
      // After the commit: the purchase is paid whatever happens here. A failure leaves it paid
      // and not applied, which the admin page lists and the reconcile action retries.
      await applyRescue(deps, done.rescue).catch((e: unknown) =>
        logFailure({ route: 'billing-webhook', reason: 'rescue_apply_failed' }, e),
      );
    }
    return { status: 200, body: { ok: true, result: done.result } };
  } catch (e) {
    logFailure({ route: 'billing-webhook', reason: 'event_failed' }, e);
    return { status: 500, body: { ok: false, error: 'That event could not be recorded.' } };
  }
}
