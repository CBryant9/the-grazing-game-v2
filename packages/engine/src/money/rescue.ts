/**
 * Paying to keep going (PRD 10.3, m6): the rescue of a farm whose game is over.
 *
 * What PRD 10.3 says a rescue does: it clears the debt and puts the farm back to modest funds.
 * "Stock are sold to clear the debt first. Cash is then set to the hard-difficulty starting cash
 * for that farm." The smallest rule that does that, and nothing else:
 *
 *  1. Every head of stock on the farm is sold at what a normal sale would pay today: the cattle at
 *     their net sale value (never below 0 for a beast, as net worth counts them) and the sheep at
 *     the sale action's own figure, which pays nothing for the wool on their backs (m7.1). It sells
 *     on any day, sale day or not (a recorded call). Stock already bought and on the way is not
 *     sold and not counted: it still arrives. Anything booked for a sale day is sold here instead,
 *     so its booking goes.
 *  2. The sale pays the debt. Cash is then the hard-difficulty starting cash for this farm (its
 *     district and size, a farm with no herd: the stock has just been sold), or what the sale left
 *     after the debt if that is more. The "or more" is a stand-in where PRD 10.3 is silent: a
 *     rescue never takes away cash the sale itself raised (listed for Claudia). The sale goes in
 *     the year's cattle and sheep sales. The cash added on top of the sale is its own line in the
 *     year's money, "Paid to keep going" (`YearTotals.keepGoing`), and the year's profit and score
 *     leave it out (m7.1).
 *  3. The farm opens again on the day it ended: game over is cleared and the eaten-out count goes
 *     back to 0. Paddocks, fences, water, crops, plans, hands and the clock are as they were.
 *  4. The rescue is recorded on the farm (`rescues`, save format 13), keyed on the purchase id: a
 *     second call with the same id changes nothing and gives the same terms.
 *
 * `rescueTerms` is the read the offer card is built from, and `rescueFarm` applies exactly those
 * terms, so a rescue does what the card said. Nothing here reads the clock or a random stream.
 */

import { startMoney } from './costs';
import { netSaleValue } from '../market/prices';
import { flockSaleValue, sheepIndicatorsOf } from '../sheep/market';
import { pricesOf } from '../sim/derived';
import { cloneFarm, type FarmState } from '../sim/state';

/** What a rescue does to a farm, in whole dollars and head. */
export interface RescueTerms {
  /** Head of cattle and sheep sold. */
  cattleSold: number;
  sheepSold: number;
  /** What the stock fetched, dollars. */
  stockValue: number;
  /** The debt before the rescue (0 when cash was not below 0), dollars. */
  debt: number;
  /** The hard-difficulty starting cash for this farm with no herd, dollars. */
  hardStartCash: number;
  /** Cash after the rescue, dollars. */
  cashAfter: number;
  /**
   * The cash the rescue added on top of the stock sale, dollars (0 when the sale left more than
   * the hard starting cash). Left out on a rescue recorded before engine 0.19.0.
   */
  paidIn?: number;
}

/** A rescue the farm has had (save format 13). */
export interface RescueRecord {
  purchaseId: string;
  /** The farm day it was applied on (the day the game ended). */
  day: number;
  terms: RescueTerms;
}

export type RescueRefusal = 'not-over' | 'bad-purchase';

export type RescueResult =
  | { ok: true; farm: FarmState; terms: RescueTerms; already: boolean }
  | { ok: false; reason: RescueRefusal; message: string };

/** What the stock sale pays, cattle and sheep apart, dollars. */
function saleOf(farm: FarmState): { cattleValue: number; sheepValue: number } {
  const prices = pricesOf(farm);
  let cattleValue = 0;
  for (const m of farm.mobs)
    for (const a of m.animals) cattleValue += Math.max(0, netSaleValue(a, prices));
  const sheepValue = farm.sheep ? flockSaleValue(farm.sheep.mobs, sheepIndicatorsOf(farm)) : 0;
  return { cattleValue, sheepValue };
}

/** What a rescue would do to this farm today. Reads only. */
export function rescueTerms(farm: FarmState): RescueTerms {
  let cattleSold = 0;
  for (const m of farm.mobs) cattleSold += m.animals.length;
  let sheepSold = 0;
  for (const m of farm.sheep?.mobs ?? []) {
    for (const s of m.sheep) if (!s.dead && s.n > 0) sheepSold += s.n;
  }
  const { cattleValue, sheepValue } = saleOf(farm);
  const stockValue = Math.round(cattleValue + sheepValue);
  const cash = Math.round(farm.cash);
  const hardStartCash = startMoney(farm.district, farm.layout.scale.farmHa, 'hard', false).cash;
  const cashAfter = Math.max(hardStartCash, cash + stockValue);
  return {
    cattleSold,
    sheepSold,
    stockValue,
    debt: Math.max(0, -cash),
    hardStartCash,
    cashAfter,
    paidIn: cashAfter - (cash + stockValue),
  };
}

/**
 * Apply a paid rescue. The farm passed in is not changed. Idempotent on `purchaseId`: a farm that
 * already had this rescue comes back as it is, with the terms it was given then.
 */
export function rescueFarm(farm: FarmState, o: { purchaseId: string }): RescueResult {
  if (typeof o.purchaseId !== 'string' || o.purchaseId.length === 0 || o.purchaseId.length > 100) {
    return { ok: false, reason: 'bad-purchase', message: 'A rescue needs its purchase.' };
  }
  const done = farm.rescues?.find((r) => r.purchaseId === o.purchaseId);
  if (done) return { ok: true, farm: cloneFarm(farm), terms: done.terms, already: true };
  if (!farm.over) {
    return { ok: false, reason: 'not-over', message: 'The game is not over on this farm.' };
  }
  const terms = rescueTerms(farm);
  const sale = saleOf(farm);
  const next = cloneFarm(farm);
  const day = next.over!.day;
  // The sale is the year's sales; the cash added on top is its own line, out of the year's profit.
  next.year.sales += sale.cattleValue;
  if (sale.sheepValue !== 0) next.year.sheepSales = (next.year.sheepSales ?? 0) + sale.sheepValue;
  if (terms.paidIn) next.year.keepGoing = (next.year.keepGoing ?? 0) + terms.paidIn;
  next.mobs = [];
  if (next.sheep) next.sheep.mobs = [];
  next.saleBookings = [];
  next.cash = terms.cashAfter;
  next.noFeedDays = 0;
  next.over = null;
  next.rescues = [...(next.rescues ?? []), { purchaseId: o.purchaseId, day, terms }];
  return { ok: true, farm: next, terms, already: false };
}
