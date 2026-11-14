import 'server-only';
import type { CheckoutRequest, CheckoutSession, PaymentState, PaymentsProvider } from './payments';

/**
 * The real payments provider: Stripe's hosted Checkout, called over its REST API with `fetch`.
 * No Stripe library is used (so nothing new ships), and nothing here has been run against Stripe:
 * this milestone had no Stripe account. It is written to Stripe's docs read on 15 Nov 2026:
 *
 * - Create a Checkout Session: POST /v1/checkout/sessions, form encoded, `mode=payment`,
 *   `success_url`, `cancel_url`, `client_reference_id`, one line item with inline `price_data`
 *   (currency, unit_amount, product_data name), `metadata`, `expires_at`, `customer` when there is
 *   one or `customer_creation=always`, and an `Idempotency-Key` header.
 * - Retrieve it: GET /v1/checkout/sessions/{id}.
 * - Refund: POST /v1/refunds with `payment_intent`.
 * - Receipt link and refund or dispute state: GET /v1/payment_intents/{id} with
 *   `expand[]=latest_charge` (`refunded`, `disputed`, `amount_refunded`, `receipt_url`).
 *
 * A first run in Stripe's test mode (docs/DEVELOPMENT_LOG.md, "m5.2 Purchases") is what proves it.
 * Errors thrown here carry only a status and Stripe's error type, never a message body, so a log
 * line can not carry an email or a card detail.
 */

const API = 'https://api.stripe.com';
const TIMEOUT_MS = 15_000;

export class StripeError extends Error {
  readonly code: string;
  constructor(
    readonly status: number,
    code: string,
  ) {
    super(`stripe_${status}`);
    this.code = /^[a-z][a-z0-9_]{2,48}$/.test(code) ? code : 'stripe_error';
  }
}

type Form = Record<string, unknown>;

/** Stripe's form encoding: nested objects as `a[b]=c`, lists as `a[0]=c`. */
export function encodeForm(data: Form, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object' && item !== null)
          out.push(...encodeForm(item as Form, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === 'object') {
      out.push(...encodeForm(v as Form, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

interface RawSession {
  id: string;
  url?: string | null;
  status?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id: string } | null;
  customer?: string | { id: string } | null;
  metadata?: Record<string, string> | null;
}

const idOf = (v: string | { id: string } | null | undefined): string | null =>
  typeof v === 'string' ? v : (v?.id ?? null);

export function sessionFrom(raw: RawSession): CheckoutSession {
  const status = raw.status === 'complete' || raw.status === 'expired' ? raw.status : 'open';
  const pay = raw.payment_status;
  return {
    id: raw.id,
    url: raw.url ?? null,
    status,
    paymentStatus: pay === 'paid' || pay === 'no_payment_required' ? pay : 'unpaid',
    amountTotal: typeof raw.amount_total === 'number' ? raw.amount_total : null,
    currency: raw.currency ?? null,
    paymentIntent: idOf(raw.payment_intent),
    customer: idOf(raw.customer),
    metadata: raw.metadata ?? {},
  };
}

export class StripePayments implements PaymentsProvider {
  readonly mode: 'test' | 'live';

  constructor(
    private readonly secret: string,
    readonly webhookSecret: string,
  ) {
    this.mode = secret.includes('_live_') ? 'live' : 'test';
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    form?: Form,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.secret}` };
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: form ? encodeForm(form).join('&') : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as {
      error?: { code?: string; type?: string };
    } | null;
    if (!res.ok) {
      throw new StripeError(res.status, data?.error?.code ?? data?.error?.type ?? 'stripe_error');
    }
    return data as T;
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const raw = await this.call<RawSession>(
      'POST',
      '/v1/checkout/sessions',
      {
        mode: 'payment',
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        client_reference_id: req.purchaseId,
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: req.currency,
              unit_amount: req.amountCents,
              product_data: { name: req.productName, description: req.description },
            },
          },
        ],
        metadata: req.metadata,
        payment_intent_data: { metadata: req.metadata },
        customer: req.customerId ?? undefined,
        customer_creation: req.customerId ? undefined : 'always',
        // Stripe allows 30 minutes to 24 hours. The server treats an open checkout older than this as finished.
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      },
      req.idempotencyKey,
    );
    return sessionFrom(raw);
  }

  async retrieveSession(sessionId: string): Promise<CheckoutSession> {
    return sessionFrom(
      await this.call<RawSession>('GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`),
    );
  }

  async refund(paymentIntentId: string, idempotencyKey: string): Promise<void> {
    await this.call('POST', '/v1/refunds', { payment_intent: paymentIntentId }, idempotencyKey);
  }

  async paymentState(paymentIntentId: string): Promise<PaymentState> {
    const raw = await this.call<{
      latest_charge?: {
        amount?: number;
        amount_refunded?: number;
        refunded?: boolean;
        disputed?: boolean;
        receipt_url?: string | null;
      } | null;
    }>('GET', `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`);
    const c = raw.latest_charge;
    const full =
      c?.refunded === true ||
      (typeof c?.amount === 'number' &&
        typeof c.amount_refunded === 'number' &&
        c.amount > 0 &&
        c.amount_refunded >= c.amount);
    return {
      fullyRefunded: full,
      disputed: c?.disputed === true,
      receiptUrl:
        typeof c?.receipt_url === 'string' && c.receipt_url.startsWith('https://')
          ? c.receipt_url
          : null,
    };
  }
}
