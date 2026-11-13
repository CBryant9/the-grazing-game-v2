/**
 * Breeding: cycling, conception, calving, weaning, marking, and the notes a
 * joining produces.
 *
 * These are the MVP's condConc, anoDays, cycling, expectedRate, calve,
 * weanOne, weanMob, markCalves, breedingNotes and joinReport, matched number
 * for number (docs/MODEL.md, section 3, Breeding). Where the MVP wrote a
 * line to the diary, these return a note as data. One MVP fault is fixed
 * here: weaning dries off the dam wherever she is on the farm.
 */

import { MARKING } from '../data/cattle';
import { lerp } from '../num';
import type { Rng } from '../rng';
import { makeAnimal } from './animal';
import type { CattleNote } from './notes';
import type { Animal, AnimalIds, AnimalLookup, CattleMob, CattleTotals } from './types';

/** Conception per 21-day cycle by condition score: [CS, rate]. */
const CONCEPTION: readonly (readonly [number, number])[] = [
  [1, 0.05],
  [1.5, 0.12],
  [2, 0.25],
  [2.5, 0.38],
  [3, 0.5],
  [3.5, 0.6],
  [4, 0.65],
  [5, 0.55],
];

/** Days in an oestrous cycle. The daily chance is the cycle rate over this. */
export const CYCLE_DAYS = 21;
/** A cow with a calf on her conceives at this share of the dry rate. */
export const LACTATING_CONCEPTION = 0.85;
/** Days from conception to calving. */
export const GESTATION_DAYS = 283;
/** A heifer starts cycling at this age in days and this weight in kg. */
export const PUBERTY = { age: 400, wt: 270 } as const;
/** One adult bull covers this many open females. */
export const FEMALES_PER_BULL = 40;
/** An unmarked young bull does this share of an adult bull's work. */
export const YOUNG_BULL_SHARE = 0.6;
/** Calves this old, in days, are weaned when the drop is weaned. */
export const WEAN_MIN_AGE = 90;
/** The drop is weaned once a calf reaches this age in days. */
export const WEAN_TRIGGER_AGE = 280;

/** Chance of conceiving in one cycle, by condition score. */
export function condConc(c: number): number {
  const pts = CONCEPTION;
  for (let k = 1; k < pts.length; k++) {
    if (c <= pts[k]![0]) {
      const [x0, y0] = pts[k - 1]!;
      const [x1, y1] = pts[k]!;
      return lerp(y0, y1, (c - x0) / (x1 - x0));
    }
  }
  return 0.55;
}

/**
 * Days after calving before a cow cycles again: 45 in good condition,
 * longer when she is poor (about 85 at CS 2).
 */
export const anoDays = (a: Animal): number => 45 + Math.max(0, 3 - a.cond) * 40;

/** Is this female cycling? Heifers need about 13 months and 270 kg. */
export function cycling(a: Animal): boolean {
  if (a.age < PUBERTY.age || a.wt < PUBERTY.wt) return false;
  if (a.lact < 0) return true;
  return a.lact > anoDays(a);
}

/**
 * The share expected in calf after 3 cycles (9 weeks) at a condition score.
 * About 4% never get in calf.
 */
export function expectedRate(cs: number, lact: boolean): number {
  const p = condConc(cs) * (lact ? LACTATING_CONCEPTION : 1);
  return 0.96 * (1 - Math.pow(1 - p, 3));
}

/**
 * How much of the bulls' work gets done, 0 to 1: bulls times 40 over the
 * open females. Unmarked young bulls count 0.6 each.
 */
export function bullCover(adultBulls: number, youngBulls: number, openFemales: number): number {
  const bullsEff = adultBulls + YOUNG_BULL_SHARE * youngBulls;
  return bullsEff ? Math.min(1, (bullsEff * FEMALES_PER_BULL) / Math.max(1, openFemales)) : 0;
}

export interface CalveInputs {
  ids: AnimalIds;
  /** The breeding stream. */
  rng: Rng;
  day: number;
  totals: CattleTotals;
  notes: CattleNote[];
  /** Calves born are added to this list. */
  births: Animal[];
}

/**
 * A cow or heifer calves. She may lose the calf at birth: 7% for a first
 * calf, 2.5% otherwise, and 6% more if she is under CS 1.8. A live calf
 * joins the mob. Bull calves stay entire until they are marked.
 */
export function calve(a: Animal, m: CattleMob, inp: CalveInputs): void {
  a.preg = -1;
  const first = a.kind === 'heifer' || a.parity === 0;
  a.kind = 'cow';
  a.parity++;
  let loss = first ? 0.07 : 0.025;
  if (a.cond < 1.8) loss += 0.06;
  if (inp.rng.chance(loss)) {
    inp.notes.push({ type: 'calfLostAtBirth', first });
    return;
  }
  const sex = inp.rng.chance(0.5) ? 'M' : 'F';
  const c = makeAnimal(inp.ids, inp.rng, 'calf', sex, first ? 32 : 36, 0, 3);
  c.dam = a.id;
  a.calf = c.id;
  a.lact = 0;
  m.animals.push(c);
  inp.births.push(c);
  inp.totals.births++;
  inp.totals.gain += c.wt;
  if ((m.calvNote ?? -999) < inp.day - 150) {
    m.calvNote = inp.day;
    inp.notes.push({ type: 'calvingStarted' });
  }
}

/**
 * Wean one calf. Its dam is dried off wherever she is on the farm, so
 * `byId` must hold every animal on the farm. A male weaned without being
 * marked is a young bull.
 */
export function weanOne(c: Animal, byId: AnimalLookup): void {
  const dam = byId.get(c.dam);
  if (dam) {
    dam.calf = 0;
    dam.lact = -1;
  }
  c.kind = c.sex === 'F' ? 'heifer' : c.sex === 'M' ? 'bull' : 'steer';
  c.dam = 0;
  if (c.sex === 'M') c.young = true;
}

/**
 * True when the mob's drop is due to be weaned: a calf has reached about
 * 9 months and its dam is still on the farm.
 */
export function weaningDue(m: CattleMob, byId: AnimalLookup): boolean {
  return m.animals.some((a) => a.kind === 'calf' && a.age >= WEAN_TRIGGER_AGE && byId.has(a.dam));
}

/**
 * Wean every calf in the mob that is 90 days or older. Returns the weaners,
 * which are still in the mob: the farm decides whether to move them to
 * another paddock with water. An empty list means none were old enough.
 *
 * `byId` must hold every animal on the farm, so a dam in another mob is
 * dried off too. (The MVP only looked in the calf's own mob.)
 */
export function weanMob(m: CattleMob, byId: AnimalLookup): Animal[] {
  const calves = m.animals.filter((a) => a.kind === 'calf' && a.age >= WEAN_MIN_AGE);
  for (const c of calves) weanOne(c, byId);
  return calves;
}

/** What marking a mob did. */
export interface MarkResult {
  /** Animals marked. 0 means there were no bull calves or young bulls. */
  marked: number;
  /** Dollars. It comes off cash and goes to the year's running costs. */
  cost: number;
}

/**
 * Mark every bull calf and unmarked young bull in the mob: castrate, ear
 * tag and vaccinate. An older bull becomes a steer and loses 3% of its
 * weight.
 */
export function markCalves(m: CattleMob): MarkResult {
  const list = m.animals.filter((a) => a.sex === 'M' && (a.kind === 'calf' || a.young));
  let cost = 0;
  for (const a of list) {
    const old = a.kind !== 'calf';
    cost += old ? MARKING.olderBull : MARKING.calf;
    a.sex = 'S';
    if (old) {
      a.kind = 'steer';
      a.young = false;
      a.wt *= MARKING.olderBullWeight;
    }
    a.cost = a.cost + (old ? MARKING.olderBull : MARKING.calf);
  }
  return { marked: list.length, cost };
}

/**
 * The preg test at the end of a joining. It counts the females in calf plus
 * the ones that had the full 9 weeks with the bull and did not take. Cows
 * still recovering from calving are left out as too soon to tell.
 */
export function joinReport(fem0: readonly Animal[], preg: number): CattleNote {
  const fem = fem0.filter(
    (a) => a.preg >= 0 || (cycling(a) && (a.lact < 0 || a.lact >= anoDays(a) + 63)),
  );
  const soon = fem0.length - fem.length;
  const cs = fem.reduce((s, a) => s + a.cond, 0) / Math.max(1, fem.length);
  const lact = fem.filter((a) => a.lact >= 0).length > fem.length / 2;
  const exp = expectedRate(cs, lact);
  const rate = preg / Math.max(1, fem.length);
  const dry = fem.length - preg;
  return {
    type: 'pregTest',
    inCalf: preg,
    females: fem.length,
    rate,
    dry,
    cs,
    expected: exp,
    tooSoon: soon,
  };
}

/**
 * The breeding notes for a mob's day: bull calves due for marking, young
 * bulls now fertile, the start and progress of a joining, the preg test,
 * and cows ready with no bull. Keeps the mob's joining record up to date.
 */
export function breedingNotes(
  m: CattleMob,
  adultBulls: number,
  youngBulls: number,
  bullF: number,
  lot: boolean,
  day: number,
  notes: CattleNote[],
): void {
  const fem = m.animals.filter(
    (a) => (a.kind === 'cow' || a.kind === 'heifer') && a.age >= PUBERTY.age && a.wt >= PUBERTY.wt,
  );
  const preg = fem.filter((a) => a.preg >= 0).length;
  const ready = fem.filter((a) => a.preg < 0 && !a.barren && cycling(a));
  // Bull calves due for marking.
  const toMark = m.animals.filter((a) => a.sex === 'M' && a.kind === 'calf' && a.age >= 60).length;
  if (toMark && (m.markNote ?? -999) < day - 45) {
    m.markNote = day;
    notes.push({ type: 'toMark', count: toMark });
  }
  if (youngBulls && !m.youngNote) {
    m.youngNote = day;
    notes.push({ type: 'youngBullsFertile' });
  }
  if (!youngBulls) m.youngNote = 0;
  // Joining.
  if (bullF > 0 && fem.length) {
    if (!m.join) {
      m.join = { start: day, conc: 0, last: 0, elig: ready.length };
      notes.push({
        type: 'joiningStarted',
        adultBulls,
        ready: ready.length,
        femalesPerBull: Math.round(
          fem.length / Math.max(1, adultBulls + YOUNG_BULL_SHARE * youngBulls),
        ),
      });
    }
    const days = day - m.join.start;
    if (days > 0 && days % 21 === 0 && days < 63 && m.join.conc > m.join.last) {
      notes.push({
        type: 'joiningProgress',
        weeks: days / 7,
        conceived: m.join.conc - m.join.last,
        inCalf: preg,
        females: fem.length,
      });
      m.join.last = m.join.conc;
    }
    if (days > 0 && days % 63 === 0) {
      if (m.join.elig > 0 || m.join.conc > 0) notes.push(joinReport(fem, preg));
      m.join = { start: day, conc: 0, last: 0, elig: ready.length };
    }
  } else if (m.join) {
    if (day - m.join.start >= 21 && (m.join.elig > 0 || m.join.conc > 0)) {
      notes.push(joinReport(fem, preg));
    }
    m.join = null;
  }
  // No bull: cows ready to go back in calf.
  if (!bullF && !lot && ready.length >= 3 && (m.openNote ?? -999) < day - 60) {
    m.openNote = day;
    notes.push({ type: 'noBull', ready: ready.length });
  }
}
