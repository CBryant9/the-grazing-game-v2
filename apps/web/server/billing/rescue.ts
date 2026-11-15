import 'server-only';
import type { SqlRunner } from '../db/sql';
import { rescueSaleWords } from '../game/rescuewords';
import { dollars, getProduct, type ProductRow } from './products';

/**
 * Paying to keep going (PRD 10.3). Offered only at game over. It clears the debt and puts the farm
 * back to modest funds. This file builds everything up to the engine: which product a finished
 * farm is offered, what the card says, and the once-only application of a paid rescue.
 *
 * The engine function is `rescueFarm` (packages/engine/src/money/rescue.ts, m6). The game server
 * registers it here through `setRescueEngine` (server/billing/rescueEngine.ts) when there is a
 * database; without one `rescueReady()` is false, the keep-going products can not be switched on
 * and no offer is shown. The Open-priced tier (under 6 months) is never offered or sold.
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
  /**
   * Cash the farm restarts with, in whole dollars: the hard-difficulty starting cash for this farm,
   * or what the stock sale left after the debt if that is more.
   */
  cashAfter: number;
  /** The hard-difficulty starting cash for this farm, whole dollars (the engine's terms). */
  hardStartCash?: number;
  /** Head of stock the rescue sells. */
  head?: number;
  /** What that stock fetches, whole dollars. */
  stockValue?: number;
  /** The debt the sale pays first, whole dollars (0 when cash was not below 0). */
  debt?: number;
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

/** Set by a test (a fake, or null for none). Left undefined, the game server's own is used. */
let override: RescueEngine | null | undefined;
/** The game server's rescue (m6), made when first asked for. Null where there is no database. */
let factory: (() => RescueEngine | null) | null = null;
let made: RescueEngine | null | undefined;

/** Tests register a fake here, or null for none; `undefined` goes back to the game server's. */
export function setRescueEngine(e: RescueEngine | null | undefined): void {
  override = e;
}
/** The game server registers how to make its rescue (server/game/game.ts). */
export function setRescueEngineFactory(f: (() => RescueEngine | null) | null): void {
  factory = f;
  made = undefined;
}
export const rescueEngine = (): RescueEngine | null => {
  if (override !== undefined) return override;
  if (made === undefined && factory) made = factory();
  return made ?? null;
};
export const rescueReady = (): boolean => rescueEngine() !== null;

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

/**
 * Is there a free slot for this farm to be going again? Its own row is ended, so it is not counted.
 * The offer card and the checkout both ask it, so nobody can pay for a rescue with no room.
 */
export async function roomFor(sql: SqlRunner, farm: RescueFarm): Promise<boolean> {
  const r = await sql.query<{ going: number; max: number | null }>(
    `select (select count(*)::int from public.farms f
              where f.owner_id = $1 and f.mode = $2 and f.status = 'active' and f.id <> $3) as going,
            public.farm_limit($1, null, $2) as max`,
    [farm.ownerId, farm.mode, farm.id],
  );
  const row = r.rows[0];
  return !!row && row.max !== null && row.going < row.max;
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
  const eng = rescueEngine();
  if (!eng) return null;
  const farm = await rescueFarm(sql, farmId, ownerId);
  if (!farm || !farm.over) return null;
  const product = await getProduct(sql, rescueProductId(farm));
  if (!product || !product.active || product.kind !== 'keep_going') return null;
  // A rescued farm is going again, so it needs a free slot of its kind: no offer without one
  // (m6), so nobody pays for a rescue the database would then refuse.
  if (!(await roomFor(sql, farm))) return null;
  const preview = await eng.preview(farm);
  const hard = preview.hardStartCash ?? preview.cashAfter;
  // What the stock fetches today, by the same case rule as the diary line: "to pay the debt" only
  // when there is a debt, "1 head" for one.
  const debt = preview.debt === undefined ? true : preview.debt > 0;
  const sold =
    preview.head === undefined || preview.stockValue === undefined
      ? debt
        ? 'Your stock is sold first to pay the debt.'
        : 'Your stock is sold first.'
      : rescueSaleWords(preview.head, preview.stockValue, debt, 'will be');
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
        sold,
        preview.cashAfter > hard
          ? `The sale leaves more than the hard-difficulty starting cash for this farm (${dollars(
              hard * 100,
            )})${debt ? ' after the debt' : ''}, so your cash is then ${dollars(preview.cashAfter * 100)}.`
          : `Your cash is then set to the hard-difficulty starting cash for this farm, ${dollars(
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
 * Apply a paid rescue to its farm, once. Three steps, none holding a transaction open across the
 * farm's save (m6: the engine's rescue saves the farm through the game server, which is another
 * connection; a lock held around it would wait on itself on a single-connection database and
 * keep a transaction open in production):
 *
 *  1. read the purchase: it must be a paid keep-going purchase for a farm of its buyer, and not
 *     marked applied;
 *  2. the engine applies it. The engine's rescue is keyed on the purchase id and recorded on the
 *     farm itself, so two callers at once (a replayed event, a reconcile) or a try after a crash
 *     between steps 2 and 3 never rescue twice: the second gets the same answer and changes nothing;
 *  3. mark it applied (only if not already).
 *
 * If the engine throws, nothing is marked, and a later try (reconcile, or the webhook sent again)
 * does it. A farm that is no longer over is passed to the engine too: if this purchase's rescue is
 * already on it, step 3 is finished; if not, the engine refuses and the answer is "not applicable".
 */
export async function applyRescue(
  deps: { sql: { transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T> } },
  purchaseId: string,
): Promise<'applied' | 'already' | 'not_ready' | 'not_applicable'> {
  const eng = rescueEngine();
  if (!eng) return 'not_ready';
  const found = await deps.sql.transaction(async (tx) => {
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
        where p.id = $1`,
      [purchaseId],
    );
    const p = r.rows[0];
    if (!p || p.kind !== 'keep_going' || p.status !== 'paid' || !p.user_id || !p.farm_id) {
      return 'not_applicable' as const;
    }
    if (p.applied_at) return 'already' as const;
    const farm = await rescueFarm(tx, p.farm_id, p.user_id);
    if (!farm) return 'not_applicable' as const;
    return { id: p.id, farm };
  });
  if (typeof found === 'string') return found;
  try {
    await eng.apply({ purchaseId: found.id, farm: found.farm });
  } catch (e) {
    // A farm that is playing and does not carry this rescue: the engine refused, nothing to do.
    if (!found.farm.over) return 'not_applicable';
    throw e;
  }
  const marked = await deps.sql.transaction((tx) =>
    tx.query(
      `update public.purchases set applied_at = now()
        where id = $1 and applied_at is null and status = 'paid'`,
      [found.id],
    ),
  );
  return marked.rowCount > 0 ? 'applied' : 'already';
}
