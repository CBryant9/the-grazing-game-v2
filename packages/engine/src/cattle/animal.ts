/**
 * Making animals, and what each one is called and counted as.
 *
 * These are the MVP's makeAnimal, makeBatch, label, groupKey, mclass and
 * aeOf, matched number for number, and the water need per head from its
 * waterUse. The MVP's makeAnimal also drew a random spot to draw the beast
 * at. The engine draws nothing, so that draw is not made here.
 */

import {
  BARREN_CHANCE,
  BOUGHT_CALF,
  CLASS_LABELS,
  SALE_CLASSES,
  type CattleClassId,
  type GroupId,
  type MarketClassId,
  type SaleClass,
  type SaleClassId,
} from '../data/cattle';
import type { Rng } from '../rng';
import type { Animal, AnimalIds, AnimalKind, CattleMob, Sex } from './types';

/**
 * A new animal. Takes the next tag number. Draws whether a female is
 * barren, and how many calves a cow has had (1 to 4), in that order.
 */
export function makeAnimal(
  ids: AnimalIds,
  rng: Rng,
  kind: AnimalKind,
  sex: Sex,
  wt: number,
  age: number,
  cond: number,
): Animal {
  const id = ids.next++;
  const barren = sex === 'F' && rng.chance(BARREN_CHANCE);
  const parity = kind === 'cow' ? rng.int(1, 4) : 0;
  return {
    id,
    kind,
    sex,
    wt,
    age,
    cond,
    barren,
    paid: 0,
    cost: 0,
    preg: -1,
    lact: -1,
    parity,
    dam: 0,
    calf: 0,
    milk: 0,
    adg: 0,
    young: false,
    dead: false,
    di: undefined,
  };
}

/**
 * A batch of one saleyard class, as bought. Cow and calf units come with
 * the calf straight after its dam in the list. Prices are set by the market
 * model, not here.
 */
export function makeSaleBatch(ids: AnimalIds, rng: Rng, key: SaleClassId, qty: number): Animal[] {
  const c: SaleClass = SALE_CLASSES[key];
  const list: Animal[] = [];
  for (let k = 0; k < qty; k++) {
    // Weight, age and condition are drawn first, in that order.
    const wt = rng.range(c.wt[0], c.wt[1]);
    const age = rng.int(c.age[0], c.age[1]);
    const cond = rng.range(c.cond[0], c.cond[1]);
    const a = makeAnimal(ids, rng, c.kind, c.sex, wt, age, cond);
    if (c.preg) a.preg = rng.int(c.preg[0], c.preg[1]);
    list.push(a);
    if (c.calf) {
      // A bought calf at foot is already marked: a steer calf or a heifer calf.
      const sex: Sex = rng.chance(0.5) ? 'S' : 'F';
      const calfAge = rng.int(c.calf[0], c.calf[1]);
      const ca = makeAnimal(ids, rng, 'calf', sex, 0, calfAge, 3);
      ca.wt = BOUGHT_CALF.birthKg + ca.age * BOUGHT_CALF.kgPerDay;
      ca.dam = a.id;
      a.calf = ca.id;
      a.lact = ca.age;
      list.push(ca);
    }
  }
  return list;
}

/** The class an animal is listed under in the herd list and the stock book. */
export function classOf(a: Animal): CattleClassId {
  switch (a.kind) {
    case 'steer':
      return a.wt < 280 ? 'weanerSteer' : a.wt < 450 ? 'yearlingSteer' : 'bullock';
    case 'heifer':
      return a.preg >= 0 ? 'pticHeifer' : a.wt < 280 ? 'weanerHeifer' : 'heifer';
    case 'cow':
      return a.preg >= 0
        ? a.calf
          ? 'pticCowWithCalf'
          : 'pticCow'
        : a.calf
          ? 'cowWithCalf'
          : 'dryCow';
    case 'bull':
      return a.young ? 'youngBull' : 'bull';
    default:
      return a.sex === 'F' ? 'heiferCalf' : a.sex === 'M' ? 'bullCalf' : 'steerCalf';
  }
}

/** The name of an animal's class, for example "Yearling steer". */
export const label = (a: Animal): string => CLASS_LABELS[classOf(a)];

/** The group an animal is drafted and counted in. */
export function groupKey(a: Animal): GroupId {
  if (a.kind === 'heifer') return a.preg >= 0 ? 'heiferP' : 'heifer';
  if (a.kind === 'cow') return a.preg >= 0 ? 'cowP' : 'cowE';
  return a.kind;
}

/** The class an animal is sold in. */
export function marketClass(a: Pick<Animal, 'kind' | 'wt'>): MarketClassId {
  switch (a.kind) {
    case 'steer':
      return a.wt < 280 ? 'wean' : a.wt < 450 ? 'feed' : 'heavy';
    case 'heifer':
      return a.wt < 280 ? 'wheif' : 'heifer';
    case 'cow':
      return 'cow';
    case 'bull':
      return 'bull';
    default:
      return 'calf';
  }
}

/**
 * Adult equivalents. 1 AE is a 450 kg dry beast at maintenance. A cow with
 * a calf on her counts 1.3 times, a late-pregnant one 1.1 times. A calf
 * counts nothing until 90 days, then half its weight's worth.
 */
export function aeOf(a: Animal): number {
  if (a.kind === 'calf') return a.age < 90 ? 0 : 0.5 * Math.pow(a.wt / 450, 0.75);
  let e = Math.pow(a.wt / 450, 0.75);
  if (a.lact >= 0 && a.calf) e *= 1.3;
  else if (a.preg > 190) e *= 1.1;
  return e;
}

/** Dry sheep equivalents in one adult equivalent. */
export const DSE_PER_AE = 8;

/**
 * The cattle figures a paddock summary needs, for the mobs on one grazing
 * area. `share` is the paddock's hectares divided by the area's hectares.
 * Mobs that have not had a day yet add nothing to the feed eaten.
 */
export function stockOn(
  mobs: readonly CattleMob[],
  share: number,
): { ae: number; head: number; eat: number } {
  let ae = 0;
  let head = 0;
  for (const m of mobs) {
    for (const a of m.animals) {
      ae += aeOf(a);
      if (a.kind !== 'calf') head++;
    }
  }
  ae *= share;
  head *= share;
  let eat = 0;
  for (const m of mobs) if (m.st) eat += m.st.demand * m.st.f * share;
  return { ae, head, eat };
}

/**
 * Water one animal drinks in a day, litres: about 10% of live weight, more
 * in summer (December to February) and less in winter (June to August).
 * `month` is 0 for January through 11 for December.
 */
export function waterNeed(a: Animal, month: number): number {
  const hot = month === 11 || month <= 1 ? 1.3 : month >= 5 && month <= 7 ? 0.8 : 1;
  return a.wt * 0.1 * hot;
}
