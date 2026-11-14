/**
 * The sheep actions (milestone 2.4, engine half): what a sheep mob is fed,
 * its joining, shearing and crutching days, and buying and selling sheep.
 * Feeding and the dates are decisions: they take none of the player's day.
 * Each works on the farm it is given (a working copy) and returns a
 * refusal, or null with its events pushed.
 */

import type { Action, ActionRefusal, ActionRefusalReason } from '../actions/types';
import { SHEEP_FEEDS, SRW, sheepDistrict, type SheepBreed } from '../data/sheep';

const srwOf = (b: SheepBreed): number => (b === 'xb' ? SRW.xb : SRW.merino);
import { MAX_SHEEP_BUY, SHEEP_TRADE } from '../data/sheepMarket';
import { spend } from '../money/worth';
import { saleDayOn, surveyOf, type SourceEnv } from '../sim/derived';
import type { FarmEvent } from '../sim/events';
import type { FarmState } from '../sim/state';
import { sheepClassOf } from './energy';
import { addSheepMob, groupRecord, sheepAreas, sheepMobsOf, type SheepGroupSpec } from './farm';
import {
  SHEEP_BUY_CLASSES,
  boughtKg,
  sheepBuyPrice,
  sheepNetSaleValue,
  type SheepBuyClass,
  type SheepBuyClassId,
} from './market';
import { headOf, lambsByDam } from './simFlock';
import type { Sheep, SheepClass, SheepMob } from './types';

const refuse = (reason: ActionRefusalReason, message: string): ActionRefusal => ({
  ok: false,
  reason,
  message,
});

type Out = ActionRefusal | null;

const isDayMonth = (v: unknown): v is { month: number; date: number } =>
  v !== null &&
  typeof v === 'object' &&
  Number.isInteger((v as { month: unknown }).month) &&
  Number.isInteger((v as { date: unknown }).date) &&
  (v as { month: number }).month >= 0 &&
  (v as { month: number }).month <= 11 &&
  (v as { date: number }).date >= 1 &&
  // No 29 February: it would not come every year.
  (v as { date: number }).date <=
    new Date(Date.UTC(2021, (v as { month: number }).month + 1, 0)).getUTCDate();

const sheepMob = (farm: FarmState, id: number): SheepMob | undefined =>
  sheepMobsOf(farm).find((m) => m.id === id);

/** Set what a sheep mob is fed: none, lick, grain or hay. Charged each day it is fed. */
export function setSheepFeed(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'setSheepFeed' }>,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  if (!SHEEP_FEEDS.includes(a.feed)) return refuse('bad-request', 'Pick none, lick, grain or hay.');
  m.feed = a.feed;
  events.push({ type: 'sheep-feed-set', mob: m.id, mobName: m.name, feed: a.feed });
  return null;
}

/** Move a sheep mob's joining, shearing or crutching day (null cancels shearing or crutching). */
export function setSheepDates(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'setSheepDates' }>,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  if (a.join !== undefined && !isDayMonth(a.join))
    return refuse('bad-request', 'That is not a day of the year.');
  for (const v of [a.shear, a.crutch]) {
    if (v !== undefined && v !== null && !isDayMonth(v)) {
      return refuse('bad-request', 'That is not a day of the year.');
    }
  }
  if (a.join) m.joinOn = { ...a.join };
  if (a.shear !== undefined) m.shearOn = a.shear ? { ...a.shear } : null;
  if (a.crutch !== undefined) m.crutchOn = a.crutch ? { ...a.crutch } : null;
  events.push({
    type: 'sheep-dates-set',
    mob: m.id,
    mobName: m.name,
    joinOn: m.joinOn,
    shearOn: m.shearOn,
    crutchOn: m.crutchOn,
  });
  return null;
}

/** On the farm clock, sheep are traded only on a sale day (the district's sale calendar). */
function notSaleDay(farm: FarmState, env: SourceEnv, clocked: boolean): Out {
  if (!clocked || saleDayOn(farm, env)) return null;
  return refuse('not-a-sale-day', 'Sheep are bought and sold on a sale day, and today is not one.');
}

/**
 * Buy sheep of a class into a paddock (a new sheep mob, or joined to the
 * sheep there). Refused in Central Queensland, and where cattle graze.
 */
export function buySheep(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'buySheep' }>,
  env: SourceEnv,
  clocked: boolean,
): Out {
  if (!sheepDistrict(farm.district)) {
    return refuse('bad-request', 'Sheep are not run in this district.');
  }
  if (!Object.hasOwn(SHEEP_BUY_CLASSES, a.cls)) {
    return refuse('bad-request', 'That class of sheep is not sold.');
  }
  if (!Number.isInteger(a.qty) || a.qty < 1 || a.qty > MAX_SHEEP_BUY) {
    return refuse('bad-request', `Buy between 1 and ${MAX_SHEEP_BUY} sheep at a time.`);
  }
  const no = notSaleDay(farm, env, clocked);
  if (no) return no;
  const s = surveyOf(farm);
  const areaId = s.topology.areaOf[a.to?.cell ?? -1];
  if (areaId === undefined || areaId < 0)
    return refuse('bad-request', 'That square is off the farm.');
  const cattleThere = farm.mobs.some(
    (m) =>
      m.where.kind === 'paddock' &&
      m.animals.length &&
      s.topology.areaOf[m.where.anchor] === areaId,
  );
  if (cattleThere) {
    return refuse(
      'sheep-there',
      'Cattle are grazing there. Cattle and sheep run in separate paddocks.',
    );
  }
  const c: SheepBuyClass = SHEEP_BUY_CLASSES[a.cls as SheepBuyClassId];
  const each = sheepBuyPrice(a.cls as SheepBuyClassId) + SHEEP_TRADE.headFee;
  const total = each * a.qty;
  if (!spend(farm, total)) {
    return refuse('bank-limit', "The bank won't lend that much for sheep.");
  }
  // Into the sheep already there, or a new mob.
  const there = sheepAreas(farm, s).has(areaId)
    ? sheepMobsOf(farm).find(
        (m) => m.where.kind === 'paddock' && s.topology.areaOf[m.where.anchor] === areaId,
      )
    : undefined;
  const cls =
    c.sex === 'M'
      ? 'ram'
      : c.age < 365
        ? 'weaner'
        : c.sex === 'W'
          ? 'wether'
          : c.age < 730
            ? 'hogget'
            : 'ewe';
  const spec = {
    cell: a.to.cell,
    breed: c.breed,
    groups: [{ cls, head: a.qty, sex: c.sex, ageDays: c.age, wt: boughtKg(c) }] as [SheepGroupSpec],
  };
  let mob: SheepMob;
  if (there) {
    const x = groupRecord(farm.animalIds, c.breed, srwOf(c.breed), spec.groups[0]);
    x.paid = each;
    x.cost = each;
    there.sheep.push(x);
    mob = there;
  } else {
    const r = addSheepMob(farm, s, { ...spec, groups: [...spec.groups] });
    if (!r.ok) return refuse('bad-request', 'Those sheep could not be put there.');
    for (const x of r.mob.sheep) {
      x.paid = each;
      x.cost = each;
    }
    mob = r.mob;
  }
  farm.year.buys += total;
  events.push({
    type: 'sheep-bought',
    cls: a.cls,
    qty: a.qty,
    total,
    mob: mob.id,
    mobName: mob.name,
  });
  return null;
}

/** The order sheep are sold in from a mob: the lightest last, the oldest first. */
const sellOrder = (x: Sheep, y: Sheep): number => y.age - x.age || x.cond - y.cond;

/**
 * Sell sheep of a class from a mob, today. Ewes with lambs at foot go with
 * their share of the lambs. Lambs at foot are not sold apart from their ewes.
 */
export function sellSheep(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'sellSheep' }>,
  env: SourceEnv,
  clocked: boolean,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  if (!Number.isInteger(a.qty) || a.qty < 1) return refuse('bad-request', 'Pick how many to sell.');
  if (a.cls === 'lamb') {
    return refuse('bad-request', 'Lambs at foot go with their ewes. Wean them to sell them.');
  }
  const no = notSaleDay(farm, env, clocked);
  if (no) return no;
  const lambsOf = lambsByDam(m.sheep);
  const pool = m.sheep
    .filter((s) => s.weaned && !s.dead && s.n > 0 && sheepClassOf(s) === (a.cls as SheepClass))
    .sort(sellOrder);
  if (!pool.length)
    return refuse('nothing-to-sell', 'There are no sheep of that class in the mob.');
  let left = a.qty;
  let head = 0;
  let atFoot = 0;
  let net = 0;
  let kg = 0;
  const sold = new Set<Sheep>();
  for (const s of pool) {
    if (left <= 0) break;
    const k = Math.min(left, s.n);
    left -= k;
    head += k;
    net += sheepNetSaleValue(s) * k;
    kg += s.wt * k;
    // The ewes' share of their lambs at foot goes with them.
    if (lambsOf.has(s.id)) {
      for (const l of m.sheep) {
        if (l.weaned || l.dam !== s.id || l.n <= 0) continue;
        const c = k >= s.n ? l.n : Math.round((l.n * k) / s.n);
        if (c <= 0) continue;
        net += sheepNetSaleValue(l) * c;
        atFoot += c;
        l.n -= c;
      }
    }
    s.n -= k;
    sold.add(s);
  }
  m.sheep = m.sheep.filter((s) => s.n > 0);
  const st = farm.sheep!;
  st.mobs = st.mobs.filter((x) => headOf(x.sheep) > 0);
  farm.cash += net;
  farm.year.sales += net;
  events.push({
    type: 'sheep-sold',
    mob: m.id,
    mobName: m.name,
    head,
    lambsAtFoot: atFoot,
    avgKg: head ? Math.round(kg / head) : 0,
    net,
  });
  return null;
}
