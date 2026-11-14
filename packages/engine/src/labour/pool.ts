/**
 * The labour pool: the people in the district looking for work (PRD 5.11).
 *
 * The pool is worked out, never stored. Each week a few new people start
 * looking, drawn from the farm's seed and the week's number, and each stays
 * on the list for a few weeks before they take other work. So the same farm
 * on the same day always has the same list, and it changes over time.
 *
 * The farm's standing with workers changes what is offered: with a poor
 * standing the list is shorter (the most skilled go first) and everyone
 * asks more above the award.
 */

import {
  FAMILY_NAMES,
  FIRST_NAMES,
  LABOUR,
  casualDayRate,
  contractDayRate,
  type AwardLevel,
} from '../data/labour';
import { rngStream, type Rng } from '../rng';
import type { FarmState } from '../sim/state';
import type { HandKind, Person } from './types';

/** A person on the list, with the days they are listed. */
export interface Listed extends Person {
  /** The first farm day they are listed. */
  from: number;
  /** The last farm day they are listed. */
  until: number;
  /** The award rate for their level and kind, before any loading, dollars (a week or a day worked). */
  awardRate: number;
}

/** People drawn for one week, before standing is applied. */
function weekOf(seed: number, week: number): Listed[] {
  const rng: Rng = rngStream(seed, `labour:week:${week}`);
  const n = rng.int(LABOUR.newPerWeek.value.lo, LABOUR.newPerWeek.value.hi);
  const out: Listed[] = [];
  for (let k = 0; k < n; k++) {
    const r = rng.next();
    const kind: HandKind = r < 0.4 ? 'casual' : r < 0.7 ? 'contract' : 'salaried';
    const level = rng.int(1, 8) as AwardLevel;
    const base = 1 + Math.floor((level - 1) / 2);
    const skill = (): number => Math.min(5, Math.max(1, base + rng.int(-1, 1)));
    const skills = { fencing: skill(), stock: skill(), water: skill() };
    const dogs = rng.chance(0.15 + 0.08 * skills.stock);
    // Salaried hands work Monday to Friday; some long-term hands work a
    // 5-day week that takes in the weekend (Wednesday to Sunday).
    const weekends = kind === 'salaried' && rng.chance(0.3);
    const days = weekends ? [0, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    const from = week * 7 + rng.int(0, 6);
    const until = from + rng.int(LABOUR.listedDays.value.lo, LABOUR.listedDays.value.hi) - 1;
    // Salaried: the weekly rate. Contract (fixed term, not casual): the weekly rate over 5 days.
    // Casual: the casual day rate, with the 25% loading.
    const awardRate =
      kind === 'salaried'
        ? LABOUR.awardWeekly.value[level - 1]!
        : kind === 'contract'
          ? contractDayRate(level)
          : casualDayRate(level);
    out.push({
      id: week * 16 + k + 1_000_000,
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(FAMILY_NAMES)}`,
      kind,
      level,
      skills,
      dogs,
      days,
      rate: awardRate,
      awardRate,
      from,
      until,
    });
  }
  return out;
}

const skillSum = (p: Person): number =>
  p.skills.fencing + p.skills.stock + p.skills.water + (p.dogs ? 1 : 0);

/** Round to the cent. */
const cents = (v: number): number => Math.round(v * 100) / 100;

/** The farm's standing with workers, 0 to 100. */
export const standingOf = (farm: Pick<FarmState, 'labour'>): number =>
  farm.labour?.standing ?? LABOUR.standingStart.value;

/**
 * The people looking for work on a farm day (today if none is given), in
 * the order they started looking. People already hired are not listed.
 * The rates are what they ask from this farm today, before super.
 */
export function labourPool(farm: FarmState, day: number = farm.day): Listed[] {
  const longest = LABOUR.listedDays.value.hi + 7;
  const first = Math.floor((day - longest) / 7);
  const last = Math.floor(day / 7);
  const taken = new Set(farm.labour?.taken ?? []);
  const all: Listed[] = [];
  for (let w = first; w <= last; w++) {
    for (const p of weekOf(farm.seed, w)) {
      if (p.from <= day && day <= p.until && !taken.has(p.id)) all.push(p);
    }
  }
  all.sort((a, b) => a.from - b.from || a.id - b.id);
  const s = standingOf(farm) / 100;
  // With a poor standing the list is shorter: the most skilled are offered elsewhere first.
  const share = LABOUR.listShareAtZero.value + (1 - LABOUR.listShareAtZero.value) * s;
  const keep = Math.round(all.length * share);
  const dropped = new Set(
    [...all]
      .sort((a, b) => skillSum(b) - skillSum(a) || a.id - b.id)
      .slice(0, all.length - keep)
      .map((p) => p.id),
  );
  const loading = 1 + LABOUR.dearerAtZero.value * (1 - s);
  return all
    .filter((p) => !dropped.has(p.id))
    .map((p) => ({ ...p, rate: cents(p.awardRate * loading) }));
}
