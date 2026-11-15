/**
 * The stock book: every head of cattle on the farm, with what it cost and
 * what it would fetch today (REQUIREMENTS, "Profit is shown per animal, and
 * you can see which cattle are making money").
 *
 * Each animal already carries its own money (`Animal.paid` and
 * `Animal.cost`): `paid` is the purchase price with the head fee and any
 * freight, its value on the day the farm was taken over, or 0 for a calf
 * bred on the farm; `cost` is `paid` plus everything spent on the animal
 * since (its supplement or feedlot ration, the district's health cost a day,
 * and marking). Profit is what it would put in the bank sold today
 * (`netSaleValue`: the class's c/kg on its weight, the in-calf premium from
 * PTIC, less 5% commission and the head fee) less `cost`. It is the same
 * sum the saleyard uses when cattle are sold (`sellList`), and the value is
 * the one net worth counts (never below 0). Reading it changes nothing.
 */

import type { CattleClassId } from '../data/cattle';
import { netSaleValue } from '../market/prices';
import { pricesOf } from './derived';
import type { FarmState } from './state';
import { onRecordPtic, recordClassOf } from './told';

/**
 * Where an animal came from, for the stock book's first money column.
 * `bought`: bought at a sale. `start`: on the farm when it was taken over.
 * `bred`: born on the farm. `boughtOrStart`: not bred on the farm, on a farm
 * saved before save format 16, which did not keep which it was.
 */
export type StockOrigin = 'bought' | 'start' | 'bred' | 'boughtOrStart';

export interface StockBookRow {
  /** The tag number. */
  id: number;
  mob: number;
  mobName: string;
  /** The class on the record (PTIC only from `PTIC_DAYS` in calf). */
  cls: CattleClassId;
  /** Age, days. */
  ageDays: number;
  /** Live weight, kg. */
  wt: number;
  /** Condition score, 1 to 5. */
  cs: number;
  /** True for a cow or heifer on the record as PTIC. */
  ptic: boolean;
  origin: StockOrigin;
  /** Purchase price with fees and freight, value when the farm was taken over, or 0 if bred here. Dollars. */
  paid: number;
  /** Spent on it since: feed, health and marking. Dollars. */
  spent: number;
  /** What it would put in the bank sold today, after selling costs. Dollars, never below 0. */
  value: number;
  /** `value` less `paid` and `spent`. Dollars. */
  profit: number;
  /** True when it is booked onto a sale. */
  booked: boolean;
}

/** Where an animal came from, by its tag and what was paid for it. */
export function originOf(
  farm: Pick<FarmState, 'startTags'>,
  id: number,
  paid: number,
): StockOrigin {
  if (paid <= 0) return 'bred';
  if (farm.startTags === undefined) return 'boughtOrStart';
  return id < farm.startTags ? 'start' : 'bought';
}

/**
 * Every head of cattle on the farm, mob by mob, calves included, with its
 * money at today's prices. Cattle bought and still on the truck are not on
 * the farm yet and are left out.
 */
export function stockBook(farm: FarmState): StockBookRow[] {
  const prices = pricesOf(farm);
  const booked = new Set<number>();
  for (const b of farm.saleBookings) for (const id of b.animalIds) booked.add(id);
  const rows: StockBookRow[] = [];
  for (const m of farm.mobs) {
    for (const a of m.animals) {
      if (a.dead) continue;
      const paid = a.paid || 0;
      const cost = a.cost || 0;
      const value = Math.max(0, netSaleValue(a, prices));
      rows.push({
        id: a.id,
        mob: m.id,
        mobName: m.name,
        cls: recordClassOf(a),
        ageDays: a.age,
        wt: a.wt,
        cs: a.cond,
        ptic: onRecordPtic(a),
        origin: originOf(farm, a.id, paid),
        paid,
        spent: cost - paid,
        value,
        profit: value - cost,
        booked: booked.has(a.id),
      });
    }
  }
  return rows;
}
