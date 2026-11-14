import 'server-only';
import { logFailure } from '../logging';
import type { AuthDeps } from '../auth/accounts';
import { GameError } from '../game/game';
import type { PaymentsProvider } from './payments';
import {
  MIN_PURCHASE_AGE,
  OPEN_PRICE_PRODUCTS,
  accountOwns,
  getProduct,
  givesWords,
  ownedRefusal,
} from './products';
import { isUuid } from '../admin/store';
import { rescueFarm, rescueProductId, rescueReady } from './rescue';

/** An open checkout older than this is treated as finished (Stripe's own session lasts 31 minutes). */
const OPEN_MINUTES = 31;

export type Standing = 'ok' | 'no_account' | 'banned' | 'suspended' | 'too_young';

/** Is this account in good standing, and old enough to buy? Read from the database, never from the browser. */
export async function buyerStanding(sql: AuthDeps['sql'], userId: string): Promise<Standing> {
  const r = await sql.query<{ banned: boolean; suspended: boolean; age: number }>(
    `select s.banned_at is not null as banned,
            (s.suspended_until is not null and s.suspended_until > now()) as suspended,
            app.age_on(a.date_of_birth, app.today_sydney()) as age
       from public.profiles p
       join public.account_private a on a.user_id = p.user_id
       join public.account_status s on s.user_id = p.user_id
      where p.user_id = $1`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return 'no_account';
  if (row.banned) return 'banned';
  if (row.suspended) return 'suspended';
  if (row.age < MIN_PURCHASE_AGE) return 'too_young';
  return 'ok';
}

const STANDING_WORDS: Record<Exclude<Standing, 'ok'>, string> = {
  no_account: 'Finish setting up your account before you buy.',
  banned: 'This account can not buy anything.',
  suspended: 'This account can not buy anything while it is suspended.',
  too_young: `Buying is for accounts of ${MIN_PURCHASE_AGE} and over.`,
};

export interface CheckoutStart {
  url: string;
  purchaseId: string;
  /** True when an open checkout was found and sent again, instead of a second one made. */
  reused: boolean;
}

interface Pending {
  id: string;
  sessionId: string | null;
  fresh: boolean;
}

/**
 * Start a Checkout for one product. The charge always comes from the product table. A double click
 * or a retried request finds the open checkout instead of making another (a partial unique index
 * allows one open checkout per account, product and farm), and Stripe is given the purchase id as
 * its idempotency key, so even a repeated call to Stripe returns the same session.
 */
export async function startCheckout(
  deps: AuthDeps,
  payments: PaymentsProvider,
  input: { userId: string; productId: unknown; farmId?: unknown; origin: string },
): Promise<CheckoutStart> {
  const { userId, origin } = input;
  const standing = await buyerStanding(deps.sql, userId);
  if (standing !== 'ok') throw new GameError(403, STANDING_WORDS[standing]);

  if (typeof input.productId !== 'string') throw new GameError(400, 'Choose what to buy.');
  const product = await getProduct(deps.sql, input.productId);
  if (!product || !product.active || OPEN_PRICE_PRODUCTS.includes(product.id)) {
    throw new GameError(404, 'That is not for sale.');
  }

  let farmId: string | null = null;
  if (product.kind === 'keep_going') {
    if (!rescueReady()) throw new GameError(404, 'That is not for sale.');
    if (!isUuid(input.farmId)) throw new GameError(400, 'Choose the farm.');
    const farm = await rescueFarm(deps.sql, input.farmId, userId);
    if (!farm || !farm.over)
      throw new GameError(409, 'That farm is not over, so there is nothing to keep going.');
    if (rescueProductId(farm) !== product.id) {
      throw new GameError(
        409,
        'That is not the offer for this farm. Open the farm to see its offer.',
      );
    }
    farmId = farm.id;
  } else {
    const owned = await accountOwns(deps.sql, userId);
    const refusal = ownedRefusal(product, owned);
    if (refusal) throw new GameError(409, refusal);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const pending = await deps.sql.transaction<Pending>(async (tx) => {
      await tx.query(
        `update public.purchases set status = 'failed'
          where user_id = $1 and status = 'pending'
            and created_at < now() - make_interval(mins => $2)`,
        [userId, OPEN_MINUTES],
      );
      const ins = await tx.query<{ id: string }>(
        `insert into public.purchases (user_id, product_id, farm_id, amount_cents, currency)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id, product_id, (coalesce(farm_id, '00000000-0000-0000-0000-000000000000'::uuid)))
           where status = 'pending' do nothing
         returning id`,
        [userId, product.id, farmId, product.priceCents, product.currency],
      );
      if (ins.rows[0]) return { id: ins.rows[0].id, sessionId: null, fresh: true };
      const open = await tx.query<{ id: string; stripe_checkout_session_id: string | null }>(
        `select id, stripe_checkout_session_id from public.purchases
          where user_id = $1 and product_id = $2 and status = 'pending'
            and coalesce(farm_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = coalesce($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
        [userId, product.id, farmId],
      );
      const row = open.rows[0];
      if (!row) throw new GameError(409, 'Another purchase is being made. Try again in a moment.');
      return { id: row.id, sessionId: row.stripe_checkout_session_id, fresh: false };
    });

    try {
      if (pending.sessionId) {
        const s = await payments.retrieveSession(pending.sessionId);
        if (s.status === 'open' && s.url) {
          return { url: s.url, purchaseId: pending.id, reused: true };
        }
        if (s.status === 'complete') {
          // Paid already: the webhook is on its way. Show the page that waits for it.
          return {
            url: `${origin}/purchase/success?purchase=${pending.id}`,
            purchaseId: pending.id,
            reused: true,
          };
        }
        // Expired: finish it and make a new one.
        await deps.sql.query(
          `update public.purchases set status = 'failed' where id = $1 and status = 'pending'`,
          [pending.id],
        );
        continue;
      }
      const customer = await deps.sql.query<{ stripe_customer_id: string }>(
        'select stripe_customer_id from public.stripe_customers where user_id = $1',
        [userId],
      );
      const session = await payments.createCheckout({
        purchaseId: pending.id,
        productName: product.name,
        description:
          product.kind === 'keep_going'
            ? 'Pays to keep one finished farm going.'
            : givesWords(product).join('. '),
        amountCents: product.priceCents,
        currency: product.currency,
        successUrl: `${origin}/purchase/success?purchase=${pending.id}`,
        cancelUrl: `${origin}/purchase/cancelled?purchase=${pending.id}`,
        customerId: customer.rows[0]?.stripe_customer_id ?? null,
        metadata: { purchase_id: pending.id, product_id: product.id },
        idempotencyKey: `purchase-${pending.id}`,
      });
      if (!session.url) throw new Error('no_checkout_url');
      await deps.sql.query(
        `update public.purchases set stripe_checkout_session_id = $2
          where id = $1 and stripe_checkout_session_id is null`,
        [pending.id, session.id],
      );
      return { url: session.url, purchaseId: pending.id, reused: !pending.fresh };
    } catch (e) {
      if (e instanceof GameError) throw e;
      logFailure({ route: 'billing-checkout', reason: 'checkout_failed' }, e);
      throw new GameError(
        503,
        'Checkout is not available just now. Nothing was charged. Try again in a moment.',
      );
    }
  }
  throw new GameError(
    503,
    'Checkout is not available just now. Nothing was charged. Try again in a moment.',
  );
}
