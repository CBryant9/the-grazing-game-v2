/**
 * What sheep are worth and cost (milestone 2.4, engine half): carcase
 * weight from the dressing percentages (call C31), MLA's indicators by
 * class (data/sheepMarket.ts), the classes sold to buy, and wool by the
 * micron. Pure: no farm state is changed here.
 */

import { DRESSING, SRW, type SheepBreed } from '../data/sheep';
import {
  SHEEP_HEAD_PRICES,
  SHEEP_INDICATORS_C_KG,
  SHEEP_TRADE,
  lambIndicator,
  woolPriceCKg,
} from '../data/sheepMarket';
import { matureKg } from './energy';
import type { Sheep, SheepSex } from './types';

/**
 * Dressing percentage (call C31): lambs 47.5% (crossbred) or 45% (Merino),
 * adults by fat score (taken as CS rounded).
 */
export function dressingShare(s: Pick<Sheep, 'sex' | 'breed' | 'cond' | 'age'>): number {
  if (s.age < 365) return DRESSING.lambXb - (s.breed === 'merino' ? DRESSING.merinoLambLess : 0);
  const fs = Math.min(5, Math.max(1, Math.round(s.cond)));
  return DRESSING.mutton[s.sex === 'F' ? 'F' : 'W'][fs - 1]!;
}

/** Hot standard carcase weight, kg: live weight × dressing percentage. */
export const carcaseKg = (s: Pick<Sheep, 'sex' | 'breed' | 'cond' | 'age' | 'wt'>): number =>
  s.wt * dressingShare(s);

/**
 * What one sheep of a record fetches at the yards before selling costs,
 * dollars: lambs and weaners by the lamb indicator for their carcase weight
 * and breed, adults by the mutton indicator.
 */
export function sheepSaleValue(s: Pick<Sheep, 'sex' | 'breed' | 'cond' | 'age' | 'wt'>): number {
  const kg = carcaseKg(s);
  const ind = s.age < 365 ? lambIndicator(kg, s.breed) : 'mutton';
  return (kg * SHEEP_INDICATORS_C_KG[ind]) / 100;
}

/** What one sheep puts in the bank when sold: its value less commission and the head fee. */
export const sheepNetSaleValue = (
  s: Pick<Sheep, 'sex' | 'breed' | 'cond' | 'age' | 'wt'>,
): number => sheepSaleValue(s) * (1 - SHEEP_TRADE.commission) - SHEEP_TRADE.headFee;

/** The sheep sold to buy: what each is, and how it is priced. */
export interface SheepBuyClass {
  name: string;
  breed: SheepBreed;
  sex: SheepSex;
  /** Age in days. */
  age: number;
  /** Live weight as a share of mature weight. */
  wtShare: number;
  /** How it is priced: per head, or by an indicator on its carcase. */
  price: 'xbEwe' | 'breeding' | 'ram' | 'store';
}

/**
 * The sheep classes to buy. Weights and ages are STAND-INS (bought at CS 3);
 * prices in data/sheepMarket.ts.
 */
export const SHEEP_BUY_CLASSES = {
  merinoEwes: {
    name: 'Merino ewes',
    breed: 'merino',
    sex: 'F',
    age: 1095,
    wtShare: 1,
    price: 'breeding',
  },
  xbEwes: {
    name: 'First-cross ewes (1.5 years)',
    breed: 'xb',
    sex: 'F',
    age: 548,
    wtShare: 0.95,
    price: 'xbEwe',
  },
  merinoWethers: {
    name: 'Merino wethers',
    breed: 'merino',
    sex: 'W',
    age: 1095,
    wtShare: 1,
    price: 'breeding',
  },
  merinoRams: {
    name: 'Merino rams',
    breed: 'merino',
    sex: 'M',
    age: 1095,
    wtShare: 1,
    price: 'ram',
  },
  terminalRams: {
    name: 'Terminal rams',
    breed: 'xb',
    sex: 'M',
    age: 1095,
    wtShare: 1,
    price: 'ram',
  },
  merinoWeaners: {
    name: 'Merino weaners (store)',
    breed: 'merino',
    sex: 'W',
    age: 150,
    wtShare: 0.55,
    price: 'store',
  },
  xbLambs: {
    name: 'Crossbred store lambs',
    breed: 'xb',
    sex: 'W',
    age: 150,
    wtShare: 0.55,
    price: 'store',
  },
} as const satisfies Record<string, SheepBuyClass>;
export type SheepBuyClassId = keyof typeof SHEEP_BUY_CLASSES;

/** The live weight of a bought sheep, kg. */
export function boughtKg(c: SheepBuyClass): number {
  const srw = c.breed === 'xb' ? SRW.xb : SRW.merino;
  return matureKg({ srw, sex: c.sex }) * c.wtShare;
}

/** The price of one sheep of a class, before the head fee, dollars. */
export function sheepBuyPrice(id: SheepBuyClassId): number {
  const c: SheepBuyClass = SHEEP_BUY_CLASSES[id];
  const s = { sex: c.sex, breed: c.breed, cond: 3, age: c.age, wt: boughtKg(c) };
  switch (c.price) {
    case 'xbEwe':
      return SHEEP_HEAD_PRICES.xbEwe;
    case 'ram':
      return SHEEP_HEAD_PRICES.ramHead;
    case 'store':
      return (carcaseKg(s) * SHEEP_INDICATORS_C_KG.restockerLamb) / 100;
    case 'breeding':
      return sheepSaleValue({ ...s, age: 1095 }) * SHEEP_HEAD_PRICES.breedingPremium;
  }
}

/** What the sheep on a farm would put in the bank if sold today, dollars (net worth). */
export function sheepWorth(mobs: readonly { sheep: readonly Sheep[] }[]): number {
  let v = 0;
  for (const m of mobs) {
    for (const s of m.sheep) if (!s.dead && s.n > 0) v += Math.max(0, sheepNetSaleValue(s)) * s.n;
  }
  return v;
}

/** What a fleece of `cleanKg` at `micron` fetches, dollars (call C20, the dated stand-in). */
export const woolValue = (cleanKg: number, micron: number): number =>
  (cleanKg * woolPriceCKg(micron)) / 100;
