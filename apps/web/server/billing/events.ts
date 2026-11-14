import 'server-only';

/**
 * A Stripe event, cut down to the ids and numbers this app acts on. Nothing else is kept: a
 * Checkout event carries the buyer's email and name (and DATABASE.md says `stripe_events` holds
 * ids only), so the rest of the payload is dropped here, before anything is stored or logged.
 */

export type BillingEvent =
  | {
      kind: 'paid';
      eventId: string;
      type: string;
      sessionId: string;
      paymentIntent: string | null;
      amountTotal: number | null;
      currency: string | null;
      /** `paid` is the only value that grants anything. */
      paymentStatus: string;
      customer: string | null;
      metaProductId: string | null;
      metaPurchaseId: string | null;
      metaUserId: string | null;
    }
  | { kind: 'failed'; eventId: string; type: string; sessionId: string }
  | {
      kind: 'refund';
      eventId: string;
      type: string;
      paymentIntent: string | null;
      fullyRefunded: boolean;
      customer: string | null;
    }
  | {
      kind: 'dispute';
      eventId: string;
      type: string;
      paymentIntent: string | null;
      /** `open` for a dispute that was just raised or is under review, `won` once it went our way. */
      state: 'open' | 'won';
      customer: string | null;
    }
  | { kind: 'ignored'; eventId: string; type: string };

const EVENT_ID = /^evt_[A-Za-z0-9]{1,200}$/;
const CS = /^cs_[A-Za-z0-9_]{1,250}$/;
const PI = /^pi_[A-Za-z0-9_]{1,200}$/;
const CUS = /^cus_[A-Za-z0-9]{1,200}$/;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const idOf = (v: unknown): string | null =>
  typeof v === 'string'
    ? v
    : typeof v === 'object' && v !== null
      ? str((v as { id?: unknown }).id)
      : null;
const pick = (re: RegExp, v: string | null): string | null => (v && re.test(v) ? v : null);

/**
 * Parse a verified event body. `null` when it is not an event this app can record (no usable id).
 * An event type the app does not handle is `ignored`, not an error: Stripe may send any type, and
 * the endpoint must answer them all with a success so they are not sent again.
 */
export function parseEvent(body: unknown): BillingEvent | null {
  if (typeof body !== 'object' || body === null) return null;
  const e = body as { id?: unknown; type?: unknown; data?: { object?: unknown } };
  const eventId = str(e.id);
  const type = str(e.type);
  if (!eventId || !EVENT_ID.test(eventId) || !type || type.length > 100) return null;
  const o = (
    typeof e.data === 'object' && e.data !== null && typeof e.data.object === 'object'
      ? e.data.object
      : {}
  ) as Record<string, unknown>;

  switch (type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const sessionId = pick(CS, str(o.id));
      if (!sessionId) return { kind: 'ignored', eventId, type };
      const meta = (
        typeof o.metadata === 'object' && o.metadata !== null ? o.metadata : {}
      ) as Record<string, unknown>;
      return {
        kind: 'paid',
        eventId,
        type,
        sessionId,
        paymentIntent: pick(PI, idOf(o.payment_intent)),
        amountTotal: num(o.amount_total),
        currency: str(o.currency)?.toLowerCase() ?? null,
        paymentStatus: str(o.payment_status) ?? 'unpaid',
        customer: pick(CUS, idOf(o.customer)),
        metaProductId: str(meta.product_id),
        metaPurchaseId: str(meta.purchase_id),
        metaUserId: str(meta.user_id),
      };
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const sessionId = pick(CS, str(o.id));
      return sessionId
        ? { kind: 'failed', eventId, type, sessionId }
        : { kind: 'ignored', eventId, type };
    }
    case 'charge.refunded': {
      const amount = num(o.amount);
      const refunded = num(o.amount_refunded);
      const full =
        o.refunded === true ||
        (amount !== null && refunded !== null && amount > 0 && refunded >= amount);
      return {
        kind: 'refund',
        eventId,
        type,
        paymentIntent: pick(PI, idOf(o.payment_intent)),
        fullyRefunded: full,
        customer: pick(CUS, idOf(o.customer)),
      };
    }
    case 'charge.dispute.created':
    case 'charge.dispute.closed': {
      const status = str(o.status);
      // A dispute closed in our favour gives the entitlement back. So does an inquiry closed
      // without becoming a dispute (`warning_closed`): there is nothing left to hold it for, and
      // it must never take anything away. Every other state (open, under review, lost) keeps it away.
      const won =
        type === 'charge.dispute.closed' && (status === 'won' || status === 'warning_closed');
      return {
        kind: 'dispute',
        eventId,
        type,
        paymentIntent: pick(PI, idOf(o.payment_intent)),
        state: won ? 'won' : 'open',
        customer: null,
      };
    }
    default:
      return { kind: 'ignored', eventId, type };
  }
}
