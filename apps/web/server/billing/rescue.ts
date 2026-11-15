import 'server-only';
import type { SqlRunner } from '../db/sql';
import { dollars, getProduct, type ProductRow } from './products';

/**
 * Paying to keep going (PRD 10.3). Offered only at game over. It clears the debt and puts the farm
 * back to modest funds. This file builds everything up to the engine: which product a finished
 * farm is offered, what the card says, and the once-only application of a paid rescue.
 *
 * THE ENGINE FUNCTION THIS NEEDS DOES NOT EXIST YET. It is a port here (`RescueEngine`), with no
 * implementation registered, so `rescueReady()` is false, the keep-going products can not be
 * switched on, and no offer is ever shown. When the engine has the function (see the m5.2 log
 * entry for its name and what it must change), the game server registers an implementation with
 * `setRescueEngine` and the rest already works.
 */

export interface RescueFarm {
  id: string;
  ownerId: string;
  name: string;
  mode: 'daily' | 'fast';
  /** Game days the farm ran (`farms.current_day`). */
  daysRun: number;
  over: boolean;
}

/** What the engine tells the offer card the rescue will do on this farm. */
export interface RescuePreview {
  /** Cash the farm restarts with, in whole dollars (the hard-difficulty starting cash for this farm). */
  cashAfter: number;
}

export interface RescueEngine {
  /** What the rescue would do to this farm. Reads only. */
  preview(farm: RescueFarm): Promise<RescuePreview>;
  /**
   * Do the rescue, once, for this purchase: sell the stock to clear the debt, set cash to the
   * hard-difficulty starting cash, reopen the farm, mark it continued, add one diary line stating
   * the fact. `purchaseId` is the idempotency key: a second call with the same id must change
   * nothing and return the same answer.
   */
  apply(input: { purchaseId: string; farm: RescueFarm }): Promise<{ diary: string }>;
}

let engine: RescueEngine | null = null;

/** The game server registers the engine's rescue here. Tests register a fake. */
export function setRescueEngine(e: RescueEngine | null): void {
  engine = e;
}
export const rescueEngine = (): RescueEngine | null => engine;
export const rescueReady = (): boolean => engine !== null;

/** Days a Daily Farm has run, by price tier. The call made where PRD 10.3 gives only three points. */
export const DAILY_TIERS = [
  { id: 'keep_going_daily_under_6m', from: 0, label: 'under 6 months' },
  { id: 'keep_going_daily_6m', from: 183, label: '6 months or more' },
  { id: 'keep_going_daily_1y', from: 365, label: '1 year or more' },
  { id: 'keep_going_daily_2y', from: 730, label: 'over 2 years' },
] as const;

/** The product a finished farm is offered. The server decides: the browser never names the tier. */
export function rescueProductId(farm: Pick<RescueFarm, 'mode' | 'daysRun'>): string {
  if (farm.mode === 'fast') return 'keep_going_fast';
  let id: string = DAILY_TIERS[0].id;
  for (const t of DAILY_TIERS) if (farm.daysRun >= t.from) id = t.id;
  return id;
}

export async function rescueFarm(
  sql: SqlRunner,
  farmId: string,
  ownerId: string,
): Promise<RescueFarm | null> {
  const r = await sql.query<{
    id: string;
    owner_id: string;
    name: string;
    mode: 'daily' | 'fast';
    current_day: number;
    status: string;
  }>(
    `select id, owner_id, name, mode, current_day, status
       from public.farms where id = $1 and owner_id = $2`,
    [farmId, ownerId],
  );
  const f = r.rows[0];
  return f
    ? {
        id: f.id,
        ownerId: f.owner_id,
        name: f.name,
        mode: f.mode,
        daysRun: f.current_day,
        over: f.status === 'ended',
      }
    : null;
}

export interface Offer {
  productId: string;
  farmId: string;
  farmName: string;
  /** The charge, from the product table. */
  priceCents: number;
  priceText: string;
  /** What the card says, line by line. These are the facts the rescue acts on. */
  does: string[];
  cashAfter: number;
}

/**
 * The offer card for a finished farm, or null when there is none: no engine, the product is off,
 * the farm is not the player's or not over. Reads only.
 */
export async function offerFor(
  sql: SqlRunner,
  farmId: string,
  ownerId: string,
): Promise<{ offer: Offer; product: ProductRow } | null> {
  const eng = engine;
  if (!eng) return null;
  const farm = await rescueFarm(sql, farmId, ownerId);
  if (!farm || !farm.over) return null;
  const product = await getProduct(sql, rescueProductId(farm));
  if (!product || !product.active || product.kind !== 'keep_going') return null;
  const preview = await eng.preview(farm);
  return {
    product,
    offer: {
      productId: product.id,
      farmId: farm.id,
      farmName: farm.name,
      priceCents: product.priceCents,
      priceText: `${dollars(product.priceCents)}, GST included`,
      cashAfter: preview.cashAfter,
      does: [
        'Your stock is sold first to pay the debt.',
        `Your cash is then set to the hard-difficulty starting cash for this farm, ${dollars(
          preview.cashAfter * 100,
        )}.`,
        'The farm opens again on the day it ended, with its paddocks and buildings as they are.',
        'Its leaderboard score stays where it stopped, and the farm shows a "continued" mark.',
        'Nothing else changes.',
      ],
    },
  };
}

/**
 * Apply a paid rescue to its farm, once. The purchase row is locked for the whole step, so two
 * callers (a replayed event, a reconcile, a second try) take turns, and the second finds
 * `applied_at` set and does nothing. If the engine throws, the transaction rolls back, nothing is
 * marked applied, and a later try (reconcile, or the webhook sent again) does it. The engine call
 * is itself keyed on the purchase id, so a crash between its work and our mark changes nothing twice.
 */
export async function applyRescue(
  deps: { sql: { transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T> } },
  purchaseId: string,
): Promise<'applied' | 'already' | 'not_ready' | 'not_applicable'> {
  const eng = engine;
  if (!eng) return 'not_ready';
  return deps.sql.transaction(async (tx) => {
    const r = await tx.query<{
      id: string;
      user_id: string | null;
      farm_id: string | null;
      status: string;
      applied_at: string | null;
      kind: string;
    }>(
      `select p.id, p.user_id, p.farm_id, p.status, p.applied_at, pr.kind
         from public.purchases p join public.products pr on pr.id = p.product_id
        where p.id = $1 for update of p`,
      [purchaseId],
    );
    const p = r.rows[0];
    if (!p || p.kind !== 'keep_going' || p.status !== 'paid' || !p.user_id || !p.farm_id) {
      return 'not_applicable';
    }
    if (p.applied_at) return 'already';
    const farm = await rescueFarm(tx, p.farm_id, p.user_id);
    if (!farm || !farm.over) return 'not_applicable';
    await eng.apply({ purchaseId: p.id, farm });
    await tx.query(
      `update public.purchases set applied_at = now() where id = $1 and applied_at is null`,
      [p.id],
    );
    return 'applied';
  });
}
