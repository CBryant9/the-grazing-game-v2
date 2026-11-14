import { randomBytes } from 'node:crypto';
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentState,
  PaymentsProvider,
} from '../billing/payments';
import { signStripePayload } from '../billing/verify';

/**
 * A fake Stripe for tests, behind the same interface as the real one. It keeps sessions and
 * payments in memory and builds signed webhook requests the way Stripe signs them (same HMAC over
 * `t.body`, using the code in billing/verify.ts), so the webhook's own signature check is the one
 * under test. What it can NOT prove: Stripe's real behaviour (its API shapes, hosted page, the
 * receipt, event timing). That is owed against Stripe's test mode (see the m5.2 log entry).
 */
export class FakePayments implements PaymentsProvider {
  readonly mode = 'fake' as const;
  readonly webhookSecret = 'whsec_faketestsecretforthetests';
  readonly sessions = new Map<string, CheckoutSession & { req: CheckoutRequest }>();
  readonly byKey = new Map<string, string>();
  readonly refundCalls: { intent: string; key: string }[] = [];
  readonly states = new Map<string, PaymentState>();
  /** For tests: make the next call of this kind throw. */
  fail: Partial<Record<'create' | 'retrieve' | 'refund' | 'state', boolean>> = {};
  createCalls = 0;
  private n = 0;
  /** What the "hosted page" says each session was paid with. */
  private readonly paid = new Map<string, { amount: number; intent: string; customer: string }>();

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    this.createCalls++;
    if (this.fail.create) throw new Error('stripe is down');
    const known = this.byKey.get(req.idempotencyKey);
    if (known) return this.sessions.get(known)!;
    const id = `cs_test_${randomBytes(8).toString('hex')}`;
    const s = {
      id,
      url: `https://checkout.example/pay/${id}`,
      status: 'open' as const,
      paymentStatus: 'unpaid' as const,
      amountTotal: req.amountCents,
      currency: req.currency,
      paymentIntent: null,
      customer: null,
      metadata: req.metadata,
      req,
    };
    this.sessions.set(id, s);
    this.byKey.set(req.idempotencyKey, id);
    return s;
  }

  async retrieveSession(id: string): Promise<CheckoutSession> {
    if (this.fail.retrieve) throw new Error('stripe is down');
    const s = this.sessions.get(id);
    if (!s) throw new Error('no such session');
    return s;
  }

  async refund(intent: string, key: string): Promise<void> {
    if (this.fail.refund) throw new Error('stripe is down');
    this.refundCalls.push({ intent, key });
    this.states.set(intent, { ...this.state(intent), fullyRefunded: true });
  }

  async paymentState(intent: string): Promise<PaymentState> {
    if (this.fail.state) throw new Error('stripe is down');
    return this.state(intent);
  }

  private state(intent: string): PaymentState {
    return (
      this.states.get(intent) ?? {
        fullyRefunded: false,
        disputed: false,
        receiptUrl: `https://pay.example/receipts/${intent}`,
      }
    );
  }

  /** The buyer pays on the hosted page: the session becomes complete. Returns the payment's ids. */
  pay(sessionId: string, opts: { amount?: number } = {}): { intent: string; customer: string } {
    const s = this.sessions.get(sessionId)!;
    const intent = `pi_${randomBytes(8).toString('hex')}`;
    const customer = `cus_${randomBytes(6).toString('hex')}`;
    s.status = 'complete';
    s.paymentStatus = 'paid';
    s.paymentIntent = intent;
    s.customer = customer;
    this.paid.set(sessionId, { amount: opts.amount ?? s.req.amountCents, intent, customer });
    return { intent, customer };
  }

  expire(sessionId: string): void {
    this.sessions.get(sessionId)!.status = 'expired';
  }

  /** A signed webhook request body and header for an event. */
  signed(
    type: string,
    object: Record<string, unknown>,
    opts: { id?: string; at?: number; secret?: string } = {},
  ): { body: string; header: string; id: string } {
    const id = opts.id ?? `evt_${randomBytes(8).toString('hex')}`;
    const body = JSON.stringify({
      id,
      object: 'event',
      type,
      data: { object: { object: type.split('.')[0], ...object } },
    });
    const at = opts.at ?? Math.floor(Date.now() / 1000);
    return { body, header: signStripePayload(body, opts.secret ?? this.webhookSecret, at), id };
  }

  /** The `checkout.session.completed` event for a paid session. Fields can be overridden to test bad ones. */
  completed(
    sessionId: string,
    over: Record<string, unknown> = {},
    opts: { id?: string; at?: number } = {},
  ): { body: string; header: string; id: string } {
    const s = this.sessions.get(sessionId)!;
    const p = this.paid.get(sessionId)!;
    return this.signed(
      'checkout.session.completed',
      {
        id: s.id,
        amount_total: p.amount,
        currency: s.currency,
        payment_status: 'paid',
        payment_intent: p.intent,
        customer: p.customer,
        metadata: s.metadata,
        // Real events carry the buyer's details. They must never be stored or logged.
        customer_details: { email: 'buyer.secret@example.test', name: 'Buyer Secret' },
        ...over,
      },
      opts,
    );
  }

  refunded(intent: string, opts: { id?: string; full?: boolean } = {}) {
    return this.signed(
      'charge.refunded',
      {
        id: 'ch_testcharge',
        payment_intent: intent,
        amount: 3000,
        amount_refunded: opts.full === false ? 500 : 3000,
        refunded: opts.full !== false,
      },
      opts,
    );
  }

  dispute(
    intent: string,
    type: 'charge.dispute.created' | 'charge.dispute.closed',
    status: string,
  ) {
    return this.signed(type, { id: 'dp_testdispute', payment_intent: intent, status });
  }

  /** `this.n` is only here so two fakes in one test never share ids. */
  get counter(): number {
    return ++this.n;
  }
}
