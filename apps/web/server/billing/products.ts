import 'server-only';
import type { SqlRunner } from '../db/sql';

/**
 * The product table is the single source of prices and of what each product gives (PRD 10.3).
 * The browser never names a price: it names a product id, and the server charges what this table
 * says. Nothing here is for sale until the `purchases` switch is on AND the product is switched
 * on in admin.
 */

/**
 * Buying is for accounts of this age and over. PRD 10.3 does not set an age for purchases, it
 * only says to check "purchases by under 18s" with a lawyer. Until the lawyer advises, the safe
 * default is 18 (the whole of "under 18s" is kept out). Every message that names the age is built
 * from this one number, so changing it here changes the words too.
 */
export const MIN_PURCHASE_AGE = 18;

/**
 * Products whose price the PRD marks Open. They can not be switched on, and no screen shows a
 * figure for them. PRD 10.3: "[Open] the price under 6 months (A$15 until set)."
 */
export const OPEN_PRICE_PRODUCTS: readonly string[] = ['keep_going_daily_under_6m'];

export type ProductKind = 'pack' | 'upgrade' | 'keep_going';
export type EntitlementKey = 'farm_pack' | 'no_ads' | 'supporter_badge' | 'full_diary';

export interface ProductRow {
  id: string;
  name: string;
  kind: ProductKind;
  priceCents: number;
  currency: 'aud';
  grants: string[];
  active: boolean;
}

interface DbProduct {
  id: string;
  name: string;
  kind: ProductKind;
  price_cents: number;
  currency: 'aud';
  grants: string[];
  active: boolean;
}

const fromDb = (r: DbProduct): ProductRow => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  priceCents: r.price_cents,
  currency: r.currency,
  grants: r.grants,
  active: r.active,
});

export async function listProducts(sql: SqlRunner): Promise<ProductRow[]> {
  const r = await sql.query<DbProduct>(
    `select id, name, kind, price_cents, currency, grants, active
       from public.products order by price_cents desc, id`,
  );
  return r.rows.map(fromDb);
}

export async function getProduct(sql: SqlRunner, id: string): Promise<ProductRow | null> {
  const r = await sql.query<DbProduct>(
    `select id, name, kind, price_cents, currency, grants, active
       from public.products where id = $1`,
    [id],
  );
  return r.rows[0] ? fromDb(r.rows[0]) : null;
}

/** "A$30" or "A$12.50". GST is included in every price (PRD 10.3), and the screens say so. */
export function dollars(cents: number): string {
  const d = cents / 100;
  return `A$${Number.isInteger(d) ? d : d.toFixed(2)}`;
}

/** What a product gives, in the words the confirm and the receipt use. */
export function givesWords(p: Pick<ProductRow, 'kind' | 'grants'>): string[] {
  if (p.kind === 'keep_going') return [];
  const g = new Set(p.grants);
  const out: string[] = [];
  if (g.has('farm_pack')) out.push('Up to 5 Daily Farms and 5 Fast Farms at once');
  if (g.has('no_ads')) out.push('No banners or videos');
  if (g.has('full_diary')) out.push('Full diary history');
  if (g.has('supporter_badge')) out.push('A supporter badge');
  return out;
}

export interface Owned {
  farmPack: boolean;
  noAds: boolean;
  supporterBadge: boolean;
  fullDiary: boolean;
  /** Farms at once, from the database's own farm limit (`public.farm_limit`). */
  farmSlots: { daily: number; fast: number };
}

/**
 * What this account owns, decided by the database from entitlement rows the webhook wrote. One
 * function, used by the farm limit screens, the ad slots (`noAds`) and the store. A revoked row
 * (a refund or a dispute) is not owned.
 */
export async function accountOwns(sql: SqlRunner, userId: string): Promise<Owned> {
  const r = await sql.query<{ entitlement: string }>(
    `select entitlement from public.account_entitlements
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
  const has = new Set(r.rows.map((x) => x.entitlement));
  const slots = await sql.query<{ daily: number; fast: number }>(
    `select public.farm_limit($1, null, 'daily') as daily,
            public.farm_limit($1, null, 'fast') as fast`,
    [userId],
  );
  return {
    farmPack: has.has('farm_pack'),
    noAds: has.has('no_ads'),
    supporterBadge: has.has('supporter_badge'),
    fullDiary: has.has('full_diary'),
    farmSlots: slots.rows[0] ?? { daily: 0, fast: 0 },
  };
}

/** True when this account sees no banners or videos. The ad slots ask this. */
export async function hasNoAds(sql: SqlRunner, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const r = await sql.query(
    `select 1 from public.account_entitlements
      where user_id = $1 and entitlement = 'no_ads' and revoked_at is null`,
    [userId],
  );
  return r.rows.length > 0;
}

/** Why this account can not buy this pack or upgrade right now, or null. Plain words. */
export function ownedRefusal(p: Pick<ProductRow, 'id' | 'kind'>, o: Owned): string | null {
  if (p.kind === 'keep_going') return null;
  if (p.id === 'upgrade_no_ads') {
    if (o.noAds) return 'You already have no ads.';
    if (!o.farmPack) return 'The upgrade is for accounts that already have the Farm pack.';
    return null;
  }
  if (o.farmPack) {
    return o.noAds
      ? 'You already have this pack.'
      : 'You already have the Farm pack. The upgrade to no ads is the one to buy.';
  }
  return null;
}

/** The products an account can buy now: active packs and upgrades it does not already own. */
export function forSale(products: ProductRow[], owned: Owned | null): ProductRow[] {
  return products.filter(
    (p) =>
      p.active &&
      p.kind !== 'keep_going' &&
      !OPEN_PRICE_PRODUCTS.includes(p.id) &&
      (owned === null || ownedRefusal(p, owned) === null),
  );
}
