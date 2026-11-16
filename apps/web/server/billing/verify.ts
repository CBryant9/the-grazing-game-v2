import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe's webhook signature check, written to Stripe's own description (docs.stripe.com/webhooks,
 * "Verify webhook signatures manually", read for this milestone):
 *
 * - The `Stripe-Signature` header holds comma-separated `key=value` entries: `t` (the time Stripe
 *   signed, in seconds) and one or more `v1` signatures. Other entries (`v0`, `secret`,
 *   `destination`, `payload`) are ignored: only `t` and `v1` are used.
 * - The signed text is the timestamp, a dot, then the raw body exactly as it arrived.
 * - The expected signature is HMAC-SHA256 of that text with the endpoint secret, in hex.
 * - Any one `v1` may match (more than one is sent while a secret is being rolled). The compare
 *   takes the same time whatever the answer.
 * - A valid signature older (or newer) than the tolerance is refused, so a captured request can
 *   not be sent again later. Stripe's libraries use 5 minutes.
 *
 * The body must be the raw text. A body that was parsed and written out again will not match.
 */

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureResult =
  { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'mismatch' | 'outside_tolerance' };

export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): SignatureResult {
  if (!header) return { ok: false, reason: 'missing' };
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key === 't' && timestamp === null) timestamp = value;
    else if (key === 'v1' && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  if (timestamp === null || !/^\d{1,12}$/.test(timestamp) || signatures.length === 0) {
    return { ok: false, reason: 'malformed' };
  }
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  let matched = false;
  for (const s of signatures) {
    const got = Buffer.from(s, 'hex');
    // Every signature is compared, with no early exit, so the time does not say which one matched.
    if (got.length === expected.length && timingSafeEqual(got, expected)) matched = true;
  }
  if (!matched) return { ok: false, reason: 'mismatch' };
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) {
    return { ok: false, reason: 'outside_tolerance' };
  }
  return { ok: true };
}

/** The header text Stripe would send for this body. Used by the tests' fake Stripe. */
export function signStripePayload(rawBody: string, secret: string, timestamp: number): string {
  const sig = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}
