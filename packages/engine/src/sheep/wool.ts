/**
 * Wool (docs/MODEL.md, the sheep section). Clean wool grows with what the
 * sheep eats, slower in late pregnancy and for a milking ewe a kg of feed,
 * faster when it is gaining. Micron follows how fast the wool grows: a sheep
 * growing more than its reference fleece grows coarser wool, less, finer.
 * Shearing takes the fleece off and resets the count; shearing or crutching
 * gives 6 weeks of cover from flystrike.
 *
 * Selling wool and the shearing job belong to milestone 2.4. These are the
 * engine functions it will call.
 */

import { CLEAN_YIELD, FLYSTRIKE, LATE_PREGNANCY_DAY, MICRON, WOOL } from '../data/sheep';
import { clamp } from '../num';
import type { Sheep, SheepMob } from './types';

/** The reference fleece, kg clean a year, for the sheep's breed and sex. */
export function refFleeceKg(s: Pick<Sheep, 'breed' | 'sex'>): number {
  if (s.breed === 'xb') return MICRON.refKg.xb;
  return s.sex === 'F' ? MICRON.refKg.merinoF : MICRON.refKg.merinoM;
}

/**
 * Clean wool grown today, g. `dmiKg` is what it ate (for a lamb, milk counts
 * at `WOOL.milkKgPerMj` kg DM a MJ), `gain` today's weight change, kg.
 */
export function woolGrowthG(
  s: Pick<Sheep, 'breed' | 'age' | 'preg' | 'litter' | 'lact'>,
  dmiKg: number,
  gain: number,
  milking: boolean,
): number {
  let g = WOOL.gPerKgDm * Math.max(0, dmiKg);
  if (s.breed === 'xb') g *= WOOL.xbFactor;
  if (milking) g *= WOOL.lactating;
  else if (s.preg >= LATE_PREGNANCY_DAY && s.litter > 0) g *= WOOL.latePregnancy;
  g *= WOOL.ageFrom + (1 - WOOL.ageFrom) * Math.min(1, s.age / WOOL.ageDays);
  g *= clamp(1 + WOOL.gainK * gain, WOOL.min, WOOL.max);
  return g;
}

/** Micron of wool grown at `gPerDay` today. */
export function micronAt(s: Pick<Sheep, 'breed' | 'sex'>, gPerDay: number): number {
  const base = MICRON[s.breed][s.sex];
  return clamp(
    base + MICRON.perKg * ((gPerDay * 365) / 1000 - refFleeceKg(s)),
    MICRON.min,
    MICRON.max,
  );
}

/** Add today's wool to the fleece. */
export function growWool(s: Sheep, gPerDay: number): void {
  const kg = gPerDay / 1000;
  s.fleece += kg;
  s.micronKg += kg * micronAt(s, gPerDay);
  s.woolDays++;
}

/** The fleece's average micron, or 0 with no wool. */
export const fleeceMicron = (s: Pick<Sheep, 'fleece' | 'micronKg'>): number =>
  s.fleece > 0 ? s.micronKg / s.fleece : 0;

/** Greasy weight of a clean fleece, at the national yield (call C15). */
export const greasyKg = (cleanKg: number): number => cleanKg / CLEAN_YIELD;

/** What came off at a shearing, for the woolshed and the wool sale. */
export interface ShearResult {
  /** Sheep shorn (lambs at foot are not shorn). */
  head: number;
  /** Clean wool, kg, all fleeces. */
  cleanKg: number;
  /** Greasy wool, kg, at the national yield. */
  greasyKg: number;
  /** Micron, averaged by weight. */
  micron: number;
  /** Months of wool, averaged by head. */
  months: number;
}

/**
 * Shear a mob: every weaned sheep's fleece comes off and its count starts
 * again, and each has 6 weeks of cover from flystrike. Lambs at foot are
 * left. Changes the mob in place. Milestone 2.4 adds the job, its cost and
 * the sale.
 */
export function shearMob(m: SheepMob, day: number): ShearResult {
  let head = 0;
  let clean = 0;
  let mk = 0;
  let days = 0;
  for (const s of m.sheep) {
    if (s.dead || !s.weaned) continue;
    head += s.n;
    clean += s.fleece * s.n;
    mk += s.micronKg * s.n;
    days += s.woolDays * s.n;
    s.fleece = 0;
    s.micronKg = 0;
    s.woolDays = 0;
    s.flyCover = FLYSTRIKE.protectDays;
  }
  m.shorn = day;
  return {
    head,
    cleanKg: clean,
    greasyKg: greasyKg(clean),
    micron: clean > 0 ? mk / clean : 0,
    months: head ? days / head / (365 / 12) : 0,
  };
}

/** Crutch a mob: 6 weeks of cover from flystrike for every weaned sheep. The crutchings are not weighed. */
export function crutchMob(m: SheepMob, day: number): number {
  let head = 0;
  for (const s of m.sheep) {
    if (s.dead || !s.weaned) continue;
    head += s.n;
    s.flyCover = FLYSTRIKE.protectDays;
  }
  m.crutched = day;
  return head;
}
