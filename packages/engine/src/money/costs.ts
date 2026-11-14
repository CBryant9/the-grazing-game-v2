/**
 * What things cost, and the money a farm starts with.
 *
 * Copied from the MVP's COST, PER_M, SELL_COMM, HEAD_FEE, DIFF, ccAEfor,
 * cashBase, diffMoney, overheads and the cost lines inside its build
 * functions (docs/DATA.md, Infrastructure and running costs; Money and
 * difficulty). A change to any figure is a change to the game: record it in
 * docs/DATA.md.
 */

import type { DistrictId } from '@gg/shared';
import { DISTRICTS } from '../data/districts';

/** Fence and pipe, dollars a metre. A segment is one side of a square. */
export const COST_PER_M = {
  permanent: 7,
  electric: 3.6,
  tape: 0.9,
  pipe: 4.8,
} as const;
export type PerMetreItem = keyof typeof COST_PER_M;

/**
 * What one segment of fence or pipe costs on a farm: the price a metre
 * times the side of a square, rounded to a whole dollar as the MVP did.
 */
export const segmentCost = (item: PerMetreItem, sideM: number): number =>
  Math.round(COST_PER_M[item] * sideM);

/** One-off prices, dollars. */
export const COSTS = {
  /** A solar energiser, bought once with the first electric fence. */
  energiser: 900,
  trough: 1500,
  moveTrough: 300,
  gate: 450,
  /** A water hub on a fence line or corner costs a trough plus this. */
  fenceHubExtra: 500,
  /** Putting a knocked-down fence back up. */
  fixFence: 25,
  /** Rolling tape up, or running out tape that was on the roll. */
  tapeRoll: 10,
  /** A portable trough, full. */
  portable: 600,
  /** Carting water to refill a portable trough. */
  portableFill: 45,
  portableMove: 10,
} as const;

/** A portable trough sells back for this share of its price. */
export const PORTABLE_RESALE_SHARE = 0.5;

/** Dollars a portable trough gives back when it is taken off the farm (sold back). */
export const portableResale = (): number => COSTS.portable * PORTABLE_RESALE_SHARE;

/**
 * A metre of permanent or electric fence built from materials on hand (kept
 * from fence taken down) costs this share of a new metre. Claudia's figure,
 * 14 Nov 2026: "half price is fine" (docs/DATA.md).
 */
export const REUSED_FENCE_SHARE = 0.5;

/** What one segment of permanent or electric fence costs when it is built from materials on hand. */
export const reusedSegmentCost = (item: 'permanent' | 'electric', sideM: number): number =>
  segmentCost(item, sideM) * REUSED_FENCE_SHARE;

/** Selling: the agent's commission, as a share of the sale value. */
export const SELL_COMMISSION = 0.05;
/** Freight and yard dues, dollars a head, on selling and on buying. */
export const HEAD_FEE = 30;
/** Extra freight on buying, dollars for each cow and calf unit. */
export const COW_CALF_FREIGHT = 100;

/** Rates, fuel, repairs and insurance: dollars a year, plus dollars a hectare a year. */
export const OVERHEADS = { perYear: 4000, perHaYear: 0.6 } as const;

/** A farm's overheads, dollars a year. */
export const overheadsPerYear = (farmHa: number): number =>
  OVERHEADS.perYear + OVERHEADS.perHaYear * farmHa;

/** Interest a year: charged on an overdraft, earned on money in the bank. */
export const INTEREST = { overdraft: 0.095, credit: 0.03 } as const;

/** Net worth counts this share of what was spent on infrastructure that is still in place. */
export const INFRA_WORTH_SHARE = 0.8;
/** Half the cost of sowing a perennial pasture counts as infrastructure. */
export const PASTURE_ASSET_SHARE = 0.5;

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Multiples of the farm's cash base: money in the bank, the overdraft, and where the bank takes the farm. */
export const DIFFICULTY: Readonly<Record<Difficulty, { cash: number; od: number; broke: number }>> =
  {
    easy: { cash: 2, od: 1, broke: 1.3 },
    medium: { cash: 1, od: 0.6, broke: 0.8 },
    hard: { cash: 0.45, od: 0.3, broke: 0.4 },
  };

/** Taking over a farm with a herd gives this share of the cash. The herd is the capital. */
export const HERD_CASH_SHARE = 0.25;

/** Long-term carrying capacity of a farm, AE: yearly growth x 0.65 x safe utilisation / 3,285 kg. */
export function carryingCapacityAE(district: DistrictId, farmHa: number): number {
  const R = DISTRICTS[district];
  return (farmHa * R.annual * 0.65 * R.util) / 3285;
}

/** The cash a farm's money is scaled from: at least $50,000, rounded to $10,000. */
export function cashBase(district: DistrictId, farmHa: number): number {
  return Math.max(
    50000,
    Math.round((carryingCapacityAE(district, farmHa) * 0.5 * 950) / 10000) * 10000,
  );
}

export interface StartMoney {
  /** Dollars in the bank on day 0. */
  cash: number;
  /** How far the bank will lend. A negative number. */
  overdraft: number;
  /** The bank takes the farm when cash reaches this. A negative number. */
  broke: number;
}

/** The money a farm starts with, by district, size and difficulty. */
export function startMoney(
  district: DistrictId,
  farmHa: number,
  difficulty: Difficulty,
  withHerd: boolean,
): StartMoney {
  const base = cashBase(district, farmHa);
  const d = DIFFICULTY[difficulty];
  const r = (v: number): number => Math.round(v / 1000) * 1000;
  return {
    cash: r(base * d.cash * (withHerd ? HERD_CASH_SHARE : 1)),
    overdraft: -r(base * d.od),
    broke: -r(base * d.broke),
  };
}
