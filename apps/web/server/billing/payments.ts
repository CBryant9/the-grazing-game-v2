import 'server-only';
import { StripePayments } from './stripe';

/**
 * The payments interface. The billing code talks only to this, never to Stripe directly, so it
 * runs the same on the real Stripe (stripe.ts: hosted Checkout, over fetch) and on a fake (used in
 * tests and by nothing else). Card details never touch this app: Stripe's own page takes them.
 *
 * With no keys set there is no provider at all (`null`), and nothing is for sale.
 */

export interface CheckoutRequest {
  /** Our own purchase row. Also the idempotency key, so a retried call gets the same session. */
  purchaseId: string;
  productName: string;
  description: string;
  /** From the product table, never from the browser. */
  amountCents: number;
  currency: 'aud';
  successUrl: string;
  cancelUrl: string;
  /** An existing Stripe customer for this account, if the server has one. */
  customerId: string | null;
  /** When the session ends, in epoch seconds, worked out from the purchase row so a repeat is identical. */
  expiresAt: number;
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export interface CheckoutSession {
  id: string;
  /** Where to send the buyer. Null once the session is complete or expired. */
  url: string | null;
  status: 'open' | 'complete' | 'expired';
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  amountTotal: number | null;
  currency: string | null;
  paymentIntent: string | null;
  customer: string | null;
  metadata: Record<string, string>;
}

export interface PaymentState {
  /** The whole amount has been refunded. A part refund is not this. */
  fullyRefunded: boolean;
  disputed: boolean;
  /** A page Stripe hosts with the receipt, when it has one. */
  receiptUrl: string | null;
}

export interface PaymentsProvider {
  /** `test` and `live` follow the key. `fake` is the test double. */
  readonly mode: 'test' | 'live' | 'fake';
  /** The signing secret for webhook events. Never leaves the server. */
  readonly webhookSecret: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  retrieveSession(sessionId: string): Promise<CheckoutSession>;
  /** Refund the whole payment. Safe to repeat with the same key. */
  refund(paymentIntentId: string, idempotencyKey: string): Promise<void>;
  paymentState(paymentIntentId: string): Promise<PaymentState>;
}

/** The variables that turn payments on. Both server only. */
export const STRIPE_SECRET_ENV = 'STRIPE_SECRET_KEY';
export const STRIPE_WEBHOOK_ENV = 'STRIPE_WEBHOOK_SECRET';

let override: PaymentsProvider | null | undefined;

/** For tests: use this provider, or `null` for no keys. `undefined` goes back to the environment. */
export function setPaymentsProvider(p: PaymentsProvider | null | undefined): void {
  override = p;
}

/**
 * The provider for this process: the fake a test set, the real Stripe when both keys are set and
 * look right, otherwise `null`. A key that is not a Stripe key is treated as not set.
 */
export function paymentsProvider(): PaymentsProvider | null {
  if (override !== undefined) return override;
  const secret = process.env[STRIPE_SECRET_ENV]?.trim();
  const hook = process.env[STRIPE_WEBHOOK_ENV]?.trim();
  if (!secret || !hook) return null;
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(secret) || !/^whsec_[A-Za-z0-9+/=_-]+$/.test(hook))
    return null;
  return new StripePayments(secret, hook);
}
