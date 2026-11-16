/**
 * What a sheep needs and how much it can eat (docs/MODEL.md, the sheep
 * section). Energy drives everything: maintenance, walking, pregnancy,
 * milk and growth, in MJ ME a day. A sheep's DSE is worked out from it.
 */

import {
  APPETITE,
  BIRTH_KG,
  DSE_MJ,
  LAMBING_TIMES,
  START_FLOCK,
  DSE_PER_AE,
  GAIN_MJ,
  KG_PER_CS_SHARE,
  LAMB_GRAZING,
  MAINT_K,
  MILK,
  PREGNANCY,
  RAM,
  REF_WALK,
  YOUNG_MAINT,
} from '../data/sheep';
import { clamp } from '../num';
import type { Sheep, SheepClass } from './types';

/** A ram: an entire male, weaned, a year old or more. */
export const isAdultRam = (s: Pick<Sheep, 'sex' | 'weaned' | 'age'>): boolean =>
  s.sex === 'M' && s.weaned && s.age >= 365;

/** A sheep's class (see `SheepClass`). This is what the screens may show. */
export function sheepClassOf(s: Pick<Sheep, 'sex' | 'weaned' | 'age' | 'parity'>): SheepClass {
  if (!s.weaned) return 'lamb';
  if (s.age < 365) return 'weaner';
  if (s.sex === 'F') return s.parity > 0 || s.age >= 730 ? 'ewe' : 'hogget';
  if (s.age < 730) return 'hogget';
  return s.sex === 'M' ? 'ram' : 'wether';
}

/**
 * A sheep's mature weight at CS 3, kg: its SRW, or for an entire male the
 * SRW × `RAM.srwFactor` (a ram's `srw` is his breed's ewe figure).
 */
export const matureKg = (s: Pick<Sheep, 'srw' | 'sex'>): number =>
  s.sex === 'M' ? s.srw * RAM.srwFactor : s.srw;

/**
 * A young sheep's normal weight at an age, kg: a single's birth weight, then
 * the lamb growth figure to weaning, then the weaner growth figure
 * (START_FLOCK), up to 95% of SRW. The start flock is built on it. The
 * starved rule (`STARVED`) reads it from a triplet's birth weight, the
 * lightest normal start.
 */
export function normalKg(srw: number, age: number, birthKg: number = BIRTH_KG.single): number {
  const F = START_FLOCK;
  const atWean = birthKg + F.lambGrowthKg * Math.min(age, LAMBING_TIMES.weanDays);
  const after = Math.max(0, age - LAMBING_TIMES.weanDays) * F.weanerGrowthKg;
  return Math.min(0.95 * srw, atWean + after);
}

/** Kilograms in one condition score: 0.19 × mature weight (S27, call C28). */
export const kgPerCs = (s: Pick<Sheep, 'srw' | 'sex'>): number => KG_PER_CS_SHARE * matureKg(s);

/** Walking to water as the cattle model reads it: 0.05 + 0.12 × min(1, metres ÷ 3000). */
export const walkFactor = (distM: number): number => 0.05 + 0.12 * Math.min(1, distM / 3000);

/** Maintenance, MJ ME a day, at the given walk factor. */
export function maintMJ(s: Pick<Sheep, 'wt' | 'age' | 'sex' | 'weaned'>, walk: number): number {
  const young = 1 + YOUNG_MAINT.lift * Math.max(0, 1 - s.age / YOUNG_MAINT.days);
  const ram = isAdultRam(s) ? RAM.maintFactor : 1;
  return MAINT_K * Math.pow(s.wt, 0.75) * young * ram * (1 + walk);
}

/** Pregnancy, MJ ME a day on top of maintenance, by day of pregnancy and lambs carried. */
export function pregnancyMJ(preg: number, litter: number): number {
  if (preg < PREGNANCY.fromDay || litter <= 0) return 0;
  const P = PREGNANCY;
  const shape =
    preg <= P.fullDay
      ? (preg - P.fromDay) / (P.fullDay - P.fromDay)
      : 1 + P.lateRise * (preg - P.fullDay);
  const lit = litter >= 3 ? P.tripletFactor : litter === 2 ? P.twinFactor : 1;
  return P.single * shape * lit;
}

/** The lactation curve: 1 to `peakDays`, falling to `lateShare` by `lateDays`, then level. */
export function lactationShape(lact: number): number {
  if (lact < 0) return 0;
  if (lact <= MILK.peakDays) return 1;
  if (lact >= MILK.lateDays) return MILK.lateShare;
  return 1 - ((1 - MILK.lateShare) * (lact - MILK.peakDays)) / (MILK.lateDays - MILK.peakDays);
}

/**
 * ME a milking ewe would spend on milk today with full feed at CS 3, MJ:
 * the top of lactation for her lambs at foot, on the lactation curve.
 */
export function milkPotentialMJ(s: Pick<Sheep, 'lact' | 'reared' | 'srw'>, lambs: number): number {
  if (s.lact < 0 || lambs <= 0) return 0;
  // `lambs` is lambs a ewe on the record, so it can be part of a lamb.
  const top =
    MILK.single * Math.min(1, lambs) +
    ((MILK.secondLamb * s.srw) / 50) * clamp(lambs - 1, 0, 1) +
    MILK.thirdLamb * clamp(lambs - 2, 0, 1);
  return top * lactationShape(s.lact);
}

/**
 * ME a ewe spends on milk today, MJ. The cattle shape for condition and feed
 * energy (MODEL.md, section 3), and less milk when she can't eat what she
 * needs: × clamp(ME eaten ÷ ME needed at full milk, `feedFloor`, 1).
 */
export function milkSpendMJ(
  potential: number,
  cond: number,
  me: number,
  eatenMJ: number,
  otherNeedsMJ: number,
): number {
  if (potential <= 0) return 0;
  const supply = Math.pow(
    clamp(eatenMJ / Math.max(0.01, otherNeedsMJ + potential), MILK.feedFloor, 1),
    MILK.feedPower,
  );
  return potential * clamp(0.55 + 0.15 * cond, 0.6, 1.2) * clamp((me - 6) / 3, 0.45, 1) * supply;
}

/** MJ ME in a kg of gain: more for heavier, more mature sheep (fatter gain). */
export const gainMJPerKg = (s: Pick<Sheep, 'wt' | 'srw' | 'sex'>): number =>
  GAIN_MJ.base + (GAIN_MJ.perShare * s.wt) / matureKg(s);

/**
 * Appetite as a share of live weight, before feed quality and short feed:
 * adults 2.6%, young sheep 4% (falling to the adult rate as they near
 * SRW), milking ewes 4.2% plus 0.4% a lamb after the first. Lambs at foot
 * start grazing from 2 weeks. Fat sheep eat less (the cattle rule over CS 3.5).
 */
export function appetiteShare(
  s: Pick<Sheep, 'wt' | 'srw' | 'sex' | 'age' | 'weaned' | 'lact' | 'cond'>,
  lambsAtFoot: number,
): number {
  let k: number;
  const share = s.wt / matureKg(s);
  const A = APPETITE;
  const youngK =
    share <= A.youngToShare
      ? A.young
      : share >= 1
        ? A.adult
        : A.young - ((A.young - A.adult) * (share - A.youngToShare)) / (1 - A.youngToShare);
  if (!s.weaned) {
    k =
      youngK *
      clamp(
        (s.age - LAMB_GRAZING.fromDays) / (LAMB_GRAZING.fullDays - LAMB_GRAZING.fromDays),
        0,
        1,
      );
  } else if (s.lact >= 0 && lambsAtFoot > 0) {
    // Lambs a ewe on the record: under 1, that share of the ewes is milking.
    const milkingShare = Math.min(1, lambsAtFoot);
    k =
      youngK +
      (A.lactating - youngK) * milkingShare +
      A.perExtraLamb * Math.max(0, lambsAtFoot - 1);
  } else {
    k = youngK;
  }
  if (s.cond > 3.5) k *= Math.max(0.55, 1 - (s.cond - 3.5) * 0.4);
  return k;
}

/** The quality factor on intake, as for cattle: clamp(0.62 + (DMD − 0.5) × 2, 0.5, 1.05). */
export const qualityFactor = (dmd: number): number => clamp(0.62 + (dmd - 0.5) * 2, 0.5, 1.05);

/**
 * ME a sheep needs today to do what it is doing at CS 3 on full feed: its
 * maintenance at the reference walk, pregnancy, full milk, and growth at
 * `growth` kg a day (young sheep only). Lambs at foot count nothing: they
 * are inside their ewe's figure (call C25).
 */
export function needsMJ(
  s: Pick<Sheep, 'wt' | 'age' | 'sex' | 'weaned' | 'preg' | 'litter' | 'lact' | 'reared' | 'srw'>,
  lambsAtFoot: number,
  growth = 0,
  walk = REF_WALK,
): number {
  if (!s.weaned) return 0;
  let req = maintMJ(s, walk) + pregnancyMJ(s.preg, s.litter) + milkPotentialMJ(s, lambsAtFoot);
  if (growth > 0 && s.age < 730) req += growth * gainMJPerKg(s);
  return req;
}

/**
 * A sheep's DSE: the energy it needs (`needsMJ`, growing at its recent
 * rate) over a dry 50 kg wether's 8.3 MJ. Lambs at foot are 0.
 */
export function dseOf(
  s: Pick<
    Sheep,
    'wt' | 'age' | 'sex' | 'weaned' | 'preg' | 'litter' | 'lact' | 'reared' | 'srw' | 'adg'
  >,
  lambsAtFoot: number,
): number {
  return needsMJ(s, lambsAtFoot, Math.max(0, s.adg)) / DSE_MJ;
}

/** DSE as AE: ÷ 8.4 (call C3). */
export const aeFromDse = (dse: number): number => dse / DSE_PER_AE;
