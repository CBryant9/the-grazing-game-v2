import 'server-only';
import { logFailure } from '../logging';
import { authRoute, callerKey, type AuthContext } from '../auth/route';
import { authDeps } from '../auth/deps';
import { allow, fail, json } from '../game/http';
import { paymentsProvider } from './payments';
import { billingState, type BillingState } from './state';
import { handleWebhook } from './webhook';

/**
 * The two wrappers every billing route goes through. A test walks `app/api/billing` and fails any
 * route file that does not use one of them, so a new route can not skip the gate.
 *
 * `billingRoute`: for the player's own calls. It is `authRoute` (shared CSRF rule for a write,
 * a rate limit for each signed-in player, the sign-in cookie jar, no caching, plain errors and
 * no 5xx detail), plus what is for sale on this copy (`ctx.billing`). A handler decides what to
 * do when `billing.selling` is false; the buying routes answer a plain 404.
 *
 * `webhookRoute`: for Stripe. Stripe is not a browser, so the CSRF rule does not apply; the
 * signature is the gate. A light limit by address, a size cap, and nothing is read from the body
 * until the signature on the raw text has been checked.
 */

export interface BillingContext extends AuthContext {
  billing: BillingState;
}

export interface BillingRouteOptions {
  name: string;
  max: number;
  windowMs?: number;
  /** True for a POST: the shared CSRF rule applies. */
  write: boolean;
}

export function billingRoute(
  options: BillingRouteOptions,
  handler: (ctx: BillingContext) => Promise<unknown>,
): (req: Request) => Promise<Response> {
  return authRoute(
    {
      name: `billing-${options.name}`,
      max: options.max,
      windowMs: options.windowMs,
      write: options.write,
      by: 'session',
    },
    async (ctx) => handler({ ...ctx, billing: await billingState() }),
  );
}

/** The most bytes a Stripe event body may have. Real ones are a few KB. */
export const WEBHOOK_BODY_LIMIT = 256 * 1024;

export function webhookRoute(): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      if (!allow(`billing-webhook:${callerKey(req, 'address')}`, 600, 60_000)) {
        return fail(429, 'Too many requests.', { 'Retry-After': '60' });
      }
      const payments = paymentsProvider();
      const deps = authDeps();
      // No keys or no accounts: nothing here to receive. A plain 404, never a 5xx.
      if (!payments || !deps) return fail(404, 'Not found.');
      const said = req.headers.get('content-length');
      if (said !== null && Number(said) > WEBHOOK_BODY_LIMIT) return fail(400, 'That was too big.');
      const raw = await req.text();
      if (raw.length > WEBHOOK_BODY_LIMIT) return fail(400, 'That was too big.');
      const answer = await handleWebhook(deps, payments, raw, req.headers.get('stripe-signature'));
      return json(answer.body, answer.status);
    } catch (e) {
      logFailure({ route: 'billing-webhook', reason: 'webhook_route_failed' }, e);
      return fail(500, 'Something went wrong on the server.');
    }
  };
}
