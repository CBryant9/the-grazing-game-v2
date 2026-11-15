import 'server-only';
import { GameError } from '../game/game';
import { readJson } from '../game/http';
import { requireUser } from '../auth/route';
import { trackServer } from '../analytics/collect';
import { STANDING_WORDS, buyerStanding, startCheckout } from './checkout';
import { myPurchases, purchaseStatus, receiptFor } from './mine';
import { accountOwns, dollars, forSale, givesWords, listProducts, type Owned } from './products';
import { offerFor, type Offer } from './rescue';
import { NOT_FOR_SALE } from './state';
import type { BillingContext } from './route';

/** A farm id as the browser holds it (32 hex) or as a uuid, as a uuid. Anything else is null. */
export function farmUuid(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (/^[0-9a-f]{32}$/i.test(v)) {
    return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`.toLowerCase();
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v.toLowerCase()
    : null;
}

/** The work of each billing route, kept out of the route files so the tests can call it directly. */

export interface StoreItem {
  id: string;
  name: string;
  priceCents: number;
  priceText: string;
  gives: string[];
  /** What the confirm says before leaving for Checkout. */
  confirm: string;
}

export interface StoreAnswer {
  selling: boolean;
  signedIn: boolean;
  /** Null when the player can buy. Otherwise why not, in plain words. */
  cannotBuy: string | null;
  owned: Owned | null;
  items: StoreItem[];
}

const EMPTY: StoreAnswer = {
  selling: false,
  signedIn: false,
  cannotBuy: null,
  owned: null,
  items: [],
};

export async function storeHandler(ctx: BillingContext): Promise<StoreAnswer> {
  const { billing } = ctx;
  if (!billing.selling || !billing.deps) return EMPTY;
  const { deps } = billing;
  const user = await deps.provider.user(ctx.jar).catch(() => null);
  const signedIn = Boolean(user && !user.anonymous);
  const owned = signedIn && user ? await accountOwns(deps.sql, user.id) : null;
  let cannotBuy: string | null = signedIn ? null : 'Sign in to buy.';
  if (signedIn && user) {
    const s = await buyerStanding(deps.sql, user.id);
    if (s !== 'ok') cannotBuy = STANDING_WORDS[s] ?? 'This account can not buy right now.';
  }
  const products = forSale(await listProducts(deps.sql), owned);
  return {
    selling: true,
    signedIn,
    cannotBuy,
    owned,
    items: products.map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      priceText: `${dollars(p.priceCents)}, GST included`,
      gives: givesWords(p),
      confirm: `Buy ${p.name} for ${dollars(p.priceCents)}, GST included? You will go to Stripe's page to pay. Your card details go to Stripe, never to this game. It is a one-off payment, not a subscription.`,
    })),
  };
}

function needSelling(ctx: BillingContext) {
  const { deps, payments, selling } = ctx.billing;
  if (!selling || !deps || !payments) throw new GameError(404, NOT_FOR_SALE);
  return { deps, payments };
}

export async function checkoutHandler(
  ctx: BillingContext,
): Promise<{ url: string; reused: boolean }> {
  const { deps, payments } = needSelling(ctx);
  const { user } = await requireUser(ctx);
  const body = await readJson(ctx.req, 1024);
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const out = await startCheckout(deps, payments, {
    userId: user.id,
    productId: b.product,
    farmId: b.farm === undefined ? undefined : (farmUuid(b.farm) ?? 'x'),
    origin: ctx.origin,
  });
  // Analytics (m7 join): counted only with consent and the switch on; never fails the request.
  await trackServer(ctx.req, user.id, 'checkout_started');
  return { url: out.url, reused: out.reused };
}

export async function statusHandler(ctx: BillingContext) {
  if (!ctx.billing.deps) throw new GameError(404, NOT_FOR_SALE);
  const { deps, user } = await requireUser(ctx);
  const id = new URL(ctx.req.url).searchParams.get('purchase');
  const s = await purchaseStatus(deps.sql, user.id, id);
  if (!s) throw new GameError(404, 'That purchase was not found.');
  return { ...s, owned: await accountOwns(deps.sql, user.id) };
}

export async function mineHandler(ctx: BillingContext) {
  const { deps } = ctx.billing;
  if (!deps) return { available: false, signedIn: false, purchases: [], owned: null };
  const user = await deps.provider.user(ctx.jar).catch(() => null);
  if (!user || user.anonymous) {
    return { available: true, signedIn: false, purchases: [], owned: null };
  }
  return {
    available: true,
    signedIn: true,
    purchases: await myPurchases(deps.sql, user.id),
    owned: await accountOwns(deps.sql, user.id),
  };
}

export async function receiptHandler(ctx: BillingContext): Promise<{ url: string | null }> {
  const { deps, payments } = ctx.billing;
  if (!deps || !payments) throw new GameError(404, NOT_FOR_SALE);
  const { user } = await requireUser(ctx);
  const id = new URL(ctx.req.url).searchParams.get('purchase');
  try {
    return { url: await receiptFor(deps.sql, payments, user.id, id) };
  } catch {
    return { url: null };
  }
}

export async function offerHandler(ctx: BillingContext): Promise<{ offer: Offer | null }> {
  const { deps, selling } = ctx.billing;
  if (!selling || !deps) return { offer: null };
  const { user } = await requireUser(ctx);
  const farm = farmUuid(new URL(ctx.req.url).searchParams.get('farm'));
  if (!farm) return { offer: null };
  const found = await offerFor(deps.sql, farm, user.id);
  return { offer: found?.offer ?? null };
}
