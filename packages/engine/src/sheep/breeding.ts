/**
 * Sheep breeding (docs/MODEL.md, the sheep section): joining on a 17-day
 * cycle for 5 weeks, conception and litter size by CS and breed, lambing
 * at 147 days, birth weight, and lamb survival by litter, breed and the
 * ewe's CS at lambing.
 */

import type { AnimalIds } from '../cattle/types';
import {
  BIRTH_KG,
  CYCLE_DAYS,
  JOIN_DAYS,
  JOIN_MIN_AGE,
  JOIN_MIN_SHARE,
  LAMBING_RISK,
  LAMBING_THIN,
  LAMB_EARLY_SHARE,
  LAMB_SURVIVAL,
  MARK_DAYS,
  PREGNANT_5WK,
  RAM_RATIO,
  SCANNING,
  SURVIVAL_PER_CS,
  TRIPLET_SHARE,
  type SheepBreed,
} from '../data/sheep';
import { clamp } from '../num';
import type { Rng } from '../rng';
import type { Sheep } from './types';

/** Rams a joining needs: 1% of the ewes plus one (call C13). */
export const ramsNeeded = (ewes: number): number =>
  ewes > 0 ? Math.ceil(ewes * RAM_RATIO.share + RAM_RATIO.plus) : 0;

/** How well the rams cover the ewes, 0 to 1. */
export const ramCover = (rams: number, ewes: number): number =>
  ewes <= 0 ? 1 : Math.min(1, rams / (ewes * RAM_RATIO.share + RAM_RATIO.plus));

/** A ewe that can join: old and heavy enough, not pregnant, and with no lambs at foot. */
export function canJoin(s: Sheep, lambsAtFoot: number): boolean {
  return (
    s.sex === 'F' &&
    s.weaned &&
    !s.dead &&
    s.preg < 0 &&
    lambsAtFoot === 0 &&
    s.age >= JOIN_MIN_AGE &&
    s.wt >= JOIN_MIN_SHARE * s.srw
  );
}

/** Ewes pregnant after a full 5-week joining with enough rams, 0 to 1. */
export function pregnantShare(cs: number, breed: SheepBreed): number {
  const P = PREGNANT_5WK;
  return clamp(P[breed] + P.perCs * (cs - 3), P.min, P.max);
}

/** Foetuses per ewe joined, by CS at joining: a straight line from CS 1.5 to 4.5 (SB-32). */
export function foetusesPerEwe(cs: number, breed: SheepBreed): number {
  const S = SCANNING;
  return Math.max(0, S[breed] + S.perCs * (clamp(cs, S.csLo, S.csHi) - 3));
}

/** Average lambs carried by a ewe that is pregnant. */
export const litterMean = (cs: number, breed: SheepBreed): number =>
  Math.max(1, foetusesPerEwe(cs, breed) / pregnantShare(cs, breed));

/** The shares of single, twin and triplet pregnancies for an average litter. */
export function litterShares(mean: number): { 1: number; 2: number; 3: number } {
  const t = clamp(TRIPLET_SHARE.per * (mean - TRIPLET_SHARE.above), 0, TRIPLET_SHARE.max);
  const tw = clamp(mean - 1 - 2 * t, 0, 1 - t);
  return { 1: Math.max(0, 1 - tw - t), 2: tw, 3: t };
}

/** The chance a ewe gets in lamb when she comes on heat, with full ram cover. */
export function cycleConception(cs: number, breed: SheepBreed): number {
  // Two cycles and a day in 5 weeks: (1 − p)^(35/17) left empty.
  return 1 - Math.pow(1 - pregnantShare(cs, breed), CYCLE_DAYS / JOIN_DAYS);
}

/** True on the days a joining ewe is on heat: her offset, then every 17 days. */
export const onHeat = (daysIntoJoining: number, oes: number): boolean =>
  oes >= 0 && daysIntoJoining >= oes && (daysIntoJoining - oes) % CYCLE_DAYS === 0;

/** Lambs carried, drawn for her CS at joining and breed. One draw. */
export function drawLitter(cs: number, breed: SheepBreed, rng: Rng): number {
  const sh = litterShares(litterMean(cs, breed));
  const u = rng.next();
  return u < sh[3] ? 3 : u < sh[3] + sh[2] ? 2 : 1;
}

/** Birth weight, kg, for the litter, the lamb's SRW and the CS the ewe lost from joining to day 100. */
export function birthKg(litter: number, srw: number, csLost: number): number {
  const base = litter >= 3 ? BIRTH_KG.triplet : litter === 2 ? BIRTH_KG.twin : BIRTH_KG.single;
  return Math.max(1.5, (base * srw) / 50 - BIRTH_KG.perCsLost * Math.max(0, csLost));
}

/** Lamb survival to marking, by the ewe's CS at lambing, the litter and the ewe's breed. */
export function lambSurvival(cs: number, litter: number, breed: SheepBreed): number {
  const lit = (litter >= 3 ? 3 : litter === 2 ? 2 : 1) as 1 | 2 | 3;
  const base = LAMB_SURVIVAL[breed][lit];
  const slope = lit === 1 ? SURVIVAL_PER_CS.single : SURVIVAL_PER_CS.twin;
  const d = cs - 3;
  const change = d < 0 ? d * slope.below : d * slope.above;
  return clamp(base + change, SURVIVAL_PER_CS.min, SURVIVAL_PER_CS.max);
}

/**
 * A ewe's risk of dying at lambing: by litter and breed, more for a thin
 * ewe (twice at CS 1.5), plus pregnancy toxaemia for condition lost since
 * scanning.
 */
export function lambingRisk(
  cs: number,
  litter: number,
  breed: SheepBreed,
  csLostSinceScan: number,
): number {
  const lit = (litter >= 3 ? 3 : litter === 2 ? 2 : 1) as 1 | 2 | 3;
  const base = LAMBING_RISK[lit] * (breed === 'xb' ? LAMBING_RISK.xbFactor : 1);
  const thin = 1 + Math.max(0, LAMBING_THIN.from - cs);
  const tox = (LAMBING_THIN.toxaemiaPerCs * Math.max(0, csLostSinceScan) * lit) / 3;
  return clamp(base * thin + tox, 0, 1);
}

/**
 * A newborn lamb's fate, drawn at birth (one draw). Of the lambs that die
 * before marking, `LAMB_EARLY_SHARE` die in the first 3 days: `doomed` is
 * the days it has left after its first (0 or 1), or -1. The rest die at a daily `risk` from
 * 3 days to `MARK_DAYS` old.
 */
export function lambFate(survival: number, rng: Rng): { doomed: number; risk: number } {
  const loss = 1 - survival;
  const early = loss * LAMB_EARLY_SHARE;
  const u = rng.next();
  // The day of an early death comes from the same draw, so it costs nothing extra.
  // `doomed` 0 dies on its first day after birth, 1 on its second: inside its first 3 days.
  if (u < early) return { doomed: Math.min(1, Math.floor((u / early) * 2)), risk: 0 };
  const late = (loss - early) / Math.max(1e-9, 1 - early);
  return { doomed: -1, risk: 1 - Math.pow(1 - late, 1 / (MARK_DAYS - 3)) };
}

/** A new lamb. Ram lambs are entire until the marking count. */
export function newLamb(
  ids: AnimalIds,
  dam: Sheep,
  sire: { breed: SheepBreed; srw: number },
  litter: number,
  female: boolean,
): Sheep {
  const breed: SheepBreed = dam.breed === 'merino' && sire.breed === 'merino' ? 'merino' : 'xb';
  const srw = (dam.srw + sire.srw) / 2;
  // Condition lost in early to mid pregnancy: from joining to scanning.
  const csLost = dam.csJoin > 0 && dam.csScan > 0 ? dam.csJoin - dam.csScan : 0;
  return {
    id: ids.next++,
    sex: female ? 'F' : 'M',
    breed,
    srw,
    wt: birthKg(litter, srw, csLost),
    age: 0,
    cond: 3,
    weaned: false,
    dam: dam.id,
    preg: -1,
    litter: 0,
    lact: -1,
    reared: 0,
    parity: 0,
    oes: -1,
    csJoin: 0,
    csScan: 0,
    milk: 0,
    adg: 0,
    wwt: 0,
    wage: 0,
    fleece: 0,
    micronKg: 0,
    woolDays: 0,
    flyCover: 0,
    struck: -1,
    doomed: -1,
    lambRisk: 0,
    paid: 0,
    cost: 0,
    dead: false,
    di: undefined,
  };
}
