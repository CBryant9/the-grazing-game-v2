/**
 * Cattle classes and per-head costs.
 *
 * Copied from the MVP's BUYS, GROUPS, GNAME and MCLS tables and its health
 * and marking costs. Prices are not here: they come from the market model.
 * A change to any figure is a model change: record it in docs/DATA.md.
 */

import type { DistrictId } from '@gg/shared';

/** A range to draw from: lowest and highest. */
export type Range = readonly [number, number];

/** A class of cattle on offer at the saleyards. */
export interface SaleClass {
  /** One of them, for a sentence: "1 weaner steer". */
  one: string;
  /** The class name, plural. */
  label: string;
  kind: 'steer' | 'heifer' | 'cow' | 'bull';
  /** F female, M entire male, S steer. */
  sex: 'F' | 'M' | 'S';
  /** Live weight, kg. */
  wt: Range;
  /** Age, days. Whole days, both ends included. */
  age: Range;
  /** Condition score, 1 to 5. */
  cond: Range;
  /** Days pregnant, for cows sold in calf. Both ends included. */
  preg?: Range;
  /** Age in days of the calf at foot, for cow and calf units. Both ends included. */
  calf?: Range;
}

export const SALE_CLASSES = {
  weanerSteer: {
    one: 'weaner steer',
    label: 'Weaner steers',
    kind: 'steer',
    sex: 'S',
    wt: [190, 235],
    age: [220, 270],
    cond: [2.4, 3.2],
  },
  yearSteer: {
    one: 'yearling steer',
    label: 'Yearling steers',
    kind: 'steer',
    sex: 'S',
    wt: [300, 360],
    age: [420, 500],
    cond: [2.6, 3.3],
  },
  weanerHeifer: {
    one: 'weaner heifer',
    label: 'Weaner heifers',
    kind: 'heifer',
    sex: 'F',
    wt: [180, 225],
    age: [220, 270],
    cond: [2.4, 3.2],
  },
  joinHeifer: {
    one: 'joining heifer',
    label: 'Joining heifers (15 mo)',
    kind: 'heifer',
    sex: 'F',
    wt: [300, 345],
    age: [430, 480],
    cond: [2.8, 3.4],
  },
  dryCow: {
    one: 'dry cow',
    label: 'Dry cows (empty)',
    kind: 'cow',
    sex: 'F',
    wt: [410, 470],
    age: [1500, 2400],
    cond: [2.3, 3.0],
  },
  ptic: {
    one: 'PTIC cow',
    label: 'PTIC cows (in calf)',
    kind: 'cow',
    sex: 'F',
    wt: [450, 520],
    age: [1500, 2400],
    cond: [2.8, 3.4],
    preg: [100, 210],
  },
  cowCalf: {
    one: 'cow & calf unit',
    label: 'Cow & calf units',
    kind: 'cow',
    sex: 'F',
    wt: [430, 490],
    age: [1500, 2400],
    cond: [2.6, 3.2],
    calf: [60, 140],
  },
  bull: {
    one: 'bull',
    label: 'Bulls',
    kind: 'bull',
    sex: 'M',
    wt: [700, 820],
    age: [1000, 1500],
    cond: [3, 3.6],
  },
} as const satisfies Record<string, SaleClass>;
export type SaleClassId = keyof typeof SALE_CLASSES;

/** Chance a female is barren: she never gets in calf. */
export const BARREN_CHANCE = 0.04;

/** A calf at foot bought with its dam weighs this at birth, plus the gain a day below. */
export const BOUGHT_CALF = { birthKg: 36, kgPerDay: 0.8 } as const;

/**
 * What each animal is called in the herd list and the stock book. The class
 * follows the animal's kind, weight, pregnancy and calf (see classOf).
 */
export const CLASS_LABELS = {
  weanerSteer: 'Weaner steer',
  yearlingSteer: 'Yearling steer',
  bullock: 'Bullock',
  pticHeifer: 'PTIC heifer',
  weanerHeifer: 'Weaner heifer',
  heifer: 'Heifer',
  pticCowWithCalf: 'PTIC cow with calf',
  pticCow: 'PTIC cow',
  cowWithCalf: 'Cow with calf',
  dryCow: 'Dry cow',
  youngBull: 'Young bull (unmarked)',
  bull: 'Bull',
  heiferCalf: 'Heifer calf',
  bullCalf: 'Bull calf (unmarked)',
  steerCalf: 'Steer calf',
} as const;
export type CattleClassId = keyof typeof CLASS_LABELS;

/**
 * Groups for drafting and counting a mob: the name of the group, then one
 * animal and several animals for a sentence.
 */
export const GROUPS = {
  steer: { name: 'Steers', one: 'steer', many: 'steers' },
  heifer: { name: 'Heifers (empty)', one: 'empty heifer', many: 'empty heifers' },
  heiferP: { name: 'Heifers (PTIC)', one: 'PTIC heifer', many: 'PTIC heifers' },
  cowP: { name: 'Cows (PTIC)', one: 'PTIC cow', many: 'PTIC cows' },
  cowE: { name: 'Cows (not in calf)', one: 'cow not in calf', many: 'cows not in calf' },
  bull: { name: 'Bulls', one: 'bull', many: 'bulls' },
  calf: { name: 'Calves', one: 'calf', many: 'calves' },
} as const;
export type GroupId = keyof typeof GROUPS;

/** The classes cattle are sold in. Each has its own market. */
export const MARKET_CLASSES = {
  wean: 'Weaner steers',
  feed: 'Yearling steers',
  heavy: 'Heavy steers (bullocks)',
  wheif: 'Weaner heifers',
  heifer: 'Heifers',
  cow: 'Cows',
  bull: 'Bulls',
  calf: 'Calves',
} as const;
export type MarketClassId = keyof typeof MARKET_CLASSES;

/** Vaccines, drench and tags, dollars a head a year. */
export const HEALTH_COST_PER_HEAD_YEAR: Record<DistrictId, number> = {
  cq: 20,
  nsw: 30,
  cw: 30,
  wv: 30,
};

/** Marking: castrating, ear tagging and vaccinating. */
export const MARKING = {
  /** Dollars for a bull calf. */
  calf: 8,
  /** Dollars for an older unmarked bull. */
  olderBull: 25,
  /** Castrating an older bull sets it back: its weight is multiplied by this. */
  olderBullWeight: 0.97,
} as const;
