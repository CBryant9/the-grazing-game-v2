/**
 * Where the farm stands with the bank, as facts (engine 0.20.0).
 *
 * The bank takes the farm when cash reaches `farm.broke`. Before that the
 * player is told twice: when cash first goes below zero, and again when it
 * passes three quarters of the way to that limit. Each is one inbox fact,
 * one thing to do, and a reason for a skip to stop. Nothing here changes a
 * rule about money: it only reads where cash is.
 */

import { sheepMobsOf } from '../sheep/farm';
import type { FarmState } from '../sim/state';

/**
 * The share of the way to the bank's limit at which the second fact is
 * given. A stand-in, listed for Claudia (docs/CALLS_FOR_CLAUDIA.md).
 */
export const BANK_NEAR_SHARE = 0.75;

/** 0: cash at or above zero. 1: overdrawn. 2: past `BANK_NEAR_SHARE` of the way to the limit. */
export type BankLevel = 0 | 1 | 2;

/** Where cash stands against zero and the bank's limit. */
export function bankLevel(farm: Pick<FarmState, 'cash' | 'broke'>): BankLevel {
  if (farm.cash < 0 && farm.cash <= farm.broke * BANK_NEAR_SHARE) return 2;
  return farm.cash < 0 ? 1 : 0;
}

/**
 * Head on hand that could be sold: cattle that are not calves at foot and
 * not already booked onto a sale, and sheep. Calves go with their mothers.
 */
export function headToSell(farm: Pick<FarmState, 'mobs' | 'saleBookings' | 'sheep'>): number {
  const booked = new Set<number>();
  for (const b of farm.saleBookings) for (const id of b.animalIds) booked.add(id);
  let n = 0;
  for (const m of farm.mobs) {
    for (const a of m.animals) if (a.kind !== 'calf' && !booked.has(a.id)) n++;
  }
  for (const m of sheepMobsOf(farm)) {
    for (const s of m.sheep) if (!s.dead && s.n > 0) n += s.n;
  }
  return n;
}
