/**
 * The stock book: every head of cattle on the farm, with what it cost and
 * what it would fetch today (REQUIREMENTS, "Profit is shown per animal, and
 * you can see which cattle are making money").
 *
 * Each animal already carries its own money (`Animal.paid` and
 * `Animal.cost`): `paid` is the purchase price with the head fee and any
 * freight, its value on the day the farm was taken over, or 0 for a calf
 * bred on the farm; the book counts a taken-over head in at what it would
 * have put in the bank sold that day (`costIn`, `FarmState.startNet`: net of
 * commission and the head fee, the same basis as value now, so the book
 * starts at $0 profit; engine 0.22.0); `cost` is `paid` plus everything spent on the animal
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
import type { Animal } from '../cattle/types';
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
  /** Purchase price with fees and freight, net value when the farm was taken over, or 0 if bred here. Dollars. */
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
  // A taken-over animal is known by its tag, so one worth $0 that day is still taken over.
  if (farm.startTags !== undefined && id < farm.startTags) return 'start';
  if (paid <= 0) return 'bred';
  if (farm.startTags === undefined) return 'boughtOrStart';
  return 'bought';
}

/**
 * What the stock book counts as an animal's cost in: what was paid for it, or for a head taken
 * over, what it would have put in the bank sold on the takeover day (`FarmState.startNet`, save
 * format 17), so the book starts at $0 profit. A farm saved before format 17 keeps the start
 * value the animal carries (`Animal.paid`).
 */
export function costIn(farm: Pick<FarmState, 'startTags' | 'startNet'>, a: Animal): number {
  const paid = a.paid || 0;
  const net = farm.startNet;
  if (net && farm.startTags !== undefined && a.id < farm.startTags && a.id - 1 < net.length) {
    return net[a.id - 1]!;
  }
  return paid;
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
      // Spent since is what the animal has run up beyond what it came in at.
      const spent = (a.cost || 0) - (a.paid || 0);
      const paid = costIn(farm, a);
      const cost = paid + spent;
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
        origin: originOf(farm, a.id, a.paid || 0),
        paid,
        spent,
        value,
        profit: value - cost,
        booked: booked.has(a.id),
      });
    }
  }
  return rows;
}
