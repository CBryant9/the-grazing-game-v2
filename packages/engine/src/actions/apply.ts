/**
 * What each action does to a farm, with no clock: the rules and the money.
 *
 * `tryAction` never changes the farm it is given. It works on a copy and
 * returns that copy with the events, or a refusal with a plain reason and
 * nothing changed. So a server can check every action before it saves.
 *
 * This file knows nothing about time. The working day (../day) decides
 * whether a job fits in today's light and how much of a line fits, and
 * calls `tryAction` for what the work does. The player's way in is
 * `applyAction` in ../day/act.ts. `applyInstant` here does a whole action
 * at once without the clock: it is for calibration and tests only, and is
 * not part of the engine's public API.
 *
 * The rules and prices are the MVP's (buyCattle, sellAnimals, sellGroup,
 * sellClass, movePicked, moveMob, toLot, weanMob, markCalves, and the cost
 * lines of its build functions), with the MVP's faults fixed
 * (BUILD_PLAN 2.4):
 *
 *   - the energiser is charged once, for electric fence only;
 *   - the $10 tape fee is charged for rolling tape up and for running out
 *     tape that was on the roll, never on all-new tape;
 *   - every dollar spent on infrastructure is recorded against the thing it
 *     bought, and comes off net worth when that thing is removed;
 *   - sowing, removing troughs, hubs and portable troughs, and changing a
 *     supplement are actions here, not screen code;
 *   - a fence that divides a mob's area shares the mob out by a seeded rule,
 *     not by where cattle were drawn.
 */

import { classOf, groupKey, makeSaleBatch, marketClass } from '../cattle/animal';
import { markCalves, weanMob, WEAN_MIN_AGE } from '../cattle/breeding';
import { animalLookup, type Animal } from '../cattle/types';
import { cropRisks, fieldById, harvestField, sow } from '../crops/fields';
import {
  CLASS_LABELS,
  GROUPS,
  MARKET_CLASSES,
  SALE_CLASSES,
  type SaleClassId,
} from '../data/cattle';
import { SUPPLEMENTS } from '../data/feed';
import { MIN_EVERY_DAYS, PLAN_FIGURES } from '../data/plans';
import { SPECIES } from '../data/species';
import {
  buildFence,
  fixFence,
  layPipe,
  movePortable,
  moveTrough,
  placeFenceHub,
  placeGate,
  placePortable,
  placeSquareHub,
  placeTrough,
  refillPortable,
  removeFence,
  removeGate,
  removeHub,
  removePortable,
  removeTrough,
  setGate,
  tapeRun,
  type FenceEffect,
  type Survey,
} from '../farm/layout';
import {
  EDGE,
  edgeOnFarm,
  getEdge,
  hEdge,
  vEdge,
  type EdgeRef,
  type FenceType,
} from '../farm/topology';
import { GRID_N, GRID_W } from '../grid';
import {
  COSTS,
  COW_CALF_FREIGHT,
  HEAD_FEE,
  PASTURE_ASSET_SHARE,
  portableResale,
  reusedSegmentCost,
  segmentCost,
} from '../money/costs';
import { spend } from '../money/worth';
import { buyPrice, netSaleValue } from '../market/prices';
import { rngFromState } from '../rng';
import {
  areaIdOf,
  cropContextOf,
  dateOn,
  keepSources,
  keepSurvey,
  nextSaleDay,
  placeAnchor,
  plantingsNow,
  pricesOf,
  realSourcesOf,
  saleDayOn,
  saleDayText,
  seasonsOf,
  surveyOf,
  type FarmSaleDay,
  type SourceEnv,
} from '../sim/derived';
import type { FarmEvent } from '../sim/events';
import { autoWeanDest, mergeShared, newMob, splitMobs } from '../sim/mobs';
import { newRun, positionOf, reportOf, stepOf, stepsIn, templateOf } from '../sim/plans';
import {
  cloneFarm,
  deepCopy,
  toInbox,
  type ClockSpan,
  type FarmMob,
  type FarmState,
  type LoggedAction,
  type MobWhere,
  type PlanLeg,
  type PlanTemplate,
} from '../sim/state';
import type {
  Action,
  ActionRefusal,
  ActionRefusalReason,
  ActionResult,
  FenceKind,
  MoveTarget,
  PlanSpec,
} from './types';

/** The most cattle that can be bought in one go. */
export const MAX_BUY = 5000;

const FENCE_CODE: Record<FenceKind, FenceType> = {
  permanent: EDGE.permanent,
  electric: EDGE.electric,
  tape: EDGE.tape,
};

const refuse = (reason: ActionRefusalReason, message: string): ActionRefusal => ({
  ok: false,
  reason,
  message,
});

/** Whole dollars with thousands separators, for refusal messages. */
function dollars(v: number): string {
  const n = Math.round(Math.abs(v)).toString();
  return (v < 0 ? '-$' : '$') + n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const isCell = (i: unknown): i is number =>
  typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < GRID_N;
const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1;
const edgeKey = (e: EdgeRef): string => e.line + e.index;

/**
 * What an action can be given in place of the farm's own sources. There
 * is no switch in here for the farm clock: nothing a caller passes can
 * turn it off.
 */
export type ActionEnv = SourceEnv;

/** What the part of a line that fits today tells the rules about the job it belongs to. */
export interface PartOptions {
  /** The job name to report, when the part is done by another action (rolling up part of a run of tape). */
  label?: string;
  /**
   * True for a job done on the farm clock (`applyAction`): cattle are bought
   * only on a sale day and arrive in the yards, and stock sold on a day
   * with no sale is booked onto the next one. Left out for the instant
   * path (calibration and tests), where both happen at once.
   */
  clocked?: boolean;
}

/** The work of one action, on a farm that may be changed freely. */
class Job {
  readonly events: FarmEvent[] = [];
  constructor(
    readonly farm: FarmState,
    readonly env: ActionEnv,
    readonly part: PartOptions = {},
  ) {}

  get survey(): Survey {
    return surveyOf(this.farm);
  }

  bankSays(amount: number, what: string): ActionRefusal | null {
    if (spend(this.farm, amount)) return null;
    return refuse(
      'bank-limit',
      `The bank won't lend that much for ${what}. It costs ${dollars(amount)} and the overdraft limit is ${dollars(this.farm.overdraft)}.`,
    );
  }

  mob(id: number): FarmMob | undefined {
    return this.farm.mobs.find((m) => m.id === id);
  }

  /** The mob an animal is in now. */
  mobOf(animalId: number): FarmMob | undefined {
    return this.farm.mobs.find((m) => m.animals.some((a) => a.id === animalId));
  }

  /** Where a target puts cattle, or a refusal. */
  whereFor(to: MoveTarget): MobWhere | ActionRefusal {
    if (to === 'lot') return { kind: 'lot' };
    if (!to || !isCell(to.cell)) return refuse('bad-request', 'That square is off the farm.');
    const s = this.survey;
    return { kind: 'paddock', anchor: placeAnchor(s, s.topology.areaOf[to.cell]!) };
  }

  /** Say where cattle ended up, and warn about no water and about crops there. */
  arrived(m: FarmMob, head: number): void {
    const s = this.survey;
    const id = areaIdOf(s, m);
    const area = id < 0 ? null : s.topology.areas[id]!;
    this.events.push({
      type: 'mob-moved',
      mob: m.id,
      mobName: m.name,
      head,
      where: m.where,
      area: area ? area.name : null,
    });
    if (!area) return;
    if (!s.points.areaTroughs[id]!.length) {
      this.events.push({ type: 'no-water', mob: m.id, mobName: m.name, area: area.name });
    }
    const risks = cropRisks(
      this.farm.crops,
      this.farm.pasture,
      cropContextOf(this.farm),
      area.cells,
      this.farm.day,
    );
    if (risks.length) {
      this.events.push({ type: 'crop-risks', mob: m.id, mobName: m.name, area: area.name, risks });
    }
  }

  /** After a change to fences or gates: share out divided mobs, then join mobs that share an area. */
  fencesChanged(before: Survey, effect: FenceEffect): void {
    const farm = this.farm;
    const after = this.survey;
    if (effect.areas.splits.length) {
      const rng = rngFromState(farm.rng.strays);
      splitMobs(farm, before, after, effect.areas, rng, this.events);
      farm.rng.strays = rng.state();
    }
    mergeShared(farm, after, this.events);
  }
}

type Out = ActionRefusal | null;

// ---------------------------------------------------------------------------
// Cattle
// ---------------------------------------------------------------------------

/**
 * The refusal for something that can only be done on a sale day, when
 * today is not one. It names the next sale. Null on a sale day.
 */
function notSaleDay(j: Job, what: string): ActionRefusal | null {
  const { farm, env } = j;
  if (saleDayOn(farm, env)) return null;
  const next = nextSaleDay(farm, env);
  if (!next) {
    return refuse('not-a-sale-day', `${what} There is no cattle sale in the next few months.`);
  }
  return refuse('not-a-sale-day', `${what} The next cattle sale is on ${saleDayText(farm, next)}.`);
}

function buyCattle(j: Job, a: Extract<Action, { type: 'buyCattle' }>): Out {
  const { farm } = j;
  const clocked = j.part.clocked === true;
  if (!Object.hasOwn(SALE_CLASSES, a.cls)) {
    return refuse('bad-request', 'That class is not sold at the saleyards.');
  }
  if (!isCount(a.qty) || a.qty > MAX_BUY) {
    return refuse('bad-request', `Buy between 1 and ${MAX_BUY} head at a time.`);
  }
  if (clocked) {
    const no = notSaleDay(j, 'Cattle can only be bought on a sale day.');
    if (no) return no;
  } else if (!a.to || typeof a.to !== 'object') {
    return refuse('bad-request', 'Say which paddock or mob the cattle are going to.');
  }
  const s = j.survey;
  let m: FarmMob | undefined;
  let where: MobWhere | null = null;
  if (!clocked) {
    const to = a.to!;
    if ('mob' in to) {
      m = j.mob(to.mob);
      if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
    } else {
      if (!isCell(to.cell)) return refuse('bad-request', 'That square is off the farm.');
      where = { kind: 'paddock', anchor: placeAnchor(s, s.topology.areaOf[to.cell]!) };
    }
  }
  const rng = rngFromState(farm.rng.buying);
  const list = makeSaleBatch(farm.animalIds, rng, a.cls as SaleClassId, a.qty);
  farm.rng.buying = rng.state();
  const prices = pricesOf(farm);
  const unitFreight = 'calf' in SALE_CLASSES[a.cls] ? COW_CALF_FREIGHT : 0;
  let price = 0;
  let units = 0;
  for (const b of list) {
    const pr = buyPrice(b, prices);
    b.paid = pr + (b.kind === 'calf' ? 0 : HEAD_FEE + unitFreight);
    b.cost = b.paid;
    price += pr;
    if (b.kind !== 'calf') units++;
  }
  const total = price + units * HEAD_FEE + (unitFreight ? units * unitFreight : 0);
  const no = j.bankSays(total, 'cattle');
  if (no) return no;
  if (clocked) {
    // Paid for now, in the yards at first light tomorrow. Not on any ground until then.
    const arriveDay = farm.day + 1;
    farm.arrivals.push({ arriveDay, cls: a.cls as SaleClassId, cost: total, animals: list });
    farm.year.buys += total;
    j.events.push({
      type: 'cattle-on-the-way',
      cls: a.cls as SaleClassId,
      qty: a.qty,
      total,
      indicator: prices.indicator,
      arriveDay,
      arriveDate: dateOn(farm, arriveDay),
    });
    return null;
  }
  if (!m) m = newMob(farm, where!);
  for (const b of list) m.animals.push(b);
  farm.year.buys += total;
  mergeShared(farm, s, j.events);
  const now = j.mobOf(list[0]!.id)!;
  j.events.push({
    type: 'cattle-bought',
    cls: a.cls,
    qty: a.qty,
    total,
    indicator: prices.indicator,
    mob: now.id,
    mobName: now.name,
  });
  const area = areaIdOf(s, now);
  if (area >= 0 && !s.points.areaTroughs[area]!.length) {
    j.events.push({
      type: 'no-water',
      mob: now.id,
      mobName: now.name,
      area: s.topology.areas[area]!.name,
    });
  }
  return null;
}

/**
 * Sell a list of animals at today's price, on a farm that may be changed
 * freely. Calves at foot go with their mothers. Reports the sale in
 * `events`. The list must not be empty.
 */
export function sellList(
  farm: FarmState,
  list: readonly Animal[],
  events: FarmEvent[],
  booked = false,
): void {
  const prices = pricesOf(farm);
  const all = animalLookup(farm.mobs);
  const gone = new Set<number>();
  let net = 0;
  let kg = 0;
  let profit = 0;
  let n = 0;
  let atFoot = 0;
  for (const a of list) {
    if (gone.has(a.id)) continue;
    gone.add(a.id);
    const v = netSaleValue(a, prices);
    net += v;
    profit += v - (a.cost || 0);
    kg += a.wt;
    n++;
    const c = a.calf ? all.get(a.calf) : undefined;
    if (c && !gone.has(c.id)) {
      gone.add(c.id);
      const cv = netSaleValue(c, prices);
      net += cv;
      profit += cv - (c.cost || 0);
      atFoot++;
    }
  }
  for (const m of farm.mobs) {
    m.animals = m.animals.filter((x) => !gone.has(x.id));
    for (const x of m.animals) {
      if (gone.has(x.dam)) x.dam = 0;
      if (gone.has(x.calf)) {
        x.calf = 0;
        x.lact = -1;
      }
    }
  }
  farm.cash += net;
  farm.year.sales += net;
  farm.mobs = farm.mobs.filter((m) => m.animals.length);
  events.push({
    type: 'cattle-sold',
    ...(booked ? { booked: true as const } : {}),
    head: n,
    calvesAtFoot: atFoot,
    avgKg: Math.round(kg / n),
    net,
    profit,
  });
}

/** What selling does today: sell now, or book onto the next sale. */
type SalePlan = { kind: 'sell' } | { kind: 'book'; sale: FarmSaleDay };

/**
 * On the farm clock, stock is sold today if today is a sale day and
 * booked onto the next sale if it is not. Without the clock it is always
 * sold at once.
 */
function salePlan(j: Job): SalePlan | ActionRefusal {
  if (!j.part.clocked || saleDayOn(j.farm, j.env)) return { kind: 'sell' };
  const sale = nextSaleDay(j.farm, j.env);
  if (!sale) {
    return refuse(
      'not-a-sale-day',
      'There is no cattle sale in the next few months to book these cattle onto.',
    );
  }
  return { kind: 'book', sale };
}

/** Tag numbers already booked onto a sale. */
function bookedIds(farm: Pick<FarmState, 'saleBookings'>): Set<number> {
  const out = new Set<number>();
  for (const b of farm.saleBookings) for (const id of b.animalIds) out.add(id);
  return out;
}

/** What is done with a list of animals: sold, or booked onto the next sale. */
function settle(j: Job, plan: SalePlan, list: readonly Animal[]): Out {
  if (plan.kind === 'sell') return sell(j, list);
  return book(j, plan.sale, list);
}

/** Book animals onto a sale. Nothing is paid and the stock stay where they are. */
function book(j: Job, sale: FarmSaleDay, list: readonly Animal[]): Out {
  const { farm } = j;
  if (!list.length) return refuse('nothing-to-sell', 'There are no cattle there to sell.');
  const already = bookedIds(farm);
  const fresh = list.filter((a) => !already.has(a.id));
  if (!fresh.length) {
    return refuse(
      'nothing-to-sell',
      `Those cattle are already booked onto the sale on ${saleDayText(farm, sale)}.`,
    );
  }
  const all = animalLookup(farm.mobs);
  const seen = new Set<number>();
  let head = 0;
  let atFoot = 0;
  for (const a of fresh) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    head++;
    const c = a.calf ? all.get(a.calf) : undefined;
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      atFoot++;
    }
  }
  const mine = farm.saleBookings.find((b) => b.saleDay === sale.day);
  const ids = new Set<number>(mine ? mine.animalIds : []);
  for (const a of fresh) ids.add(a.id);
  const animalIds = Int32Array.from([...ids].sort((x, y) => x - y));
  if (mine) mine.animalIds = animalIds;
  else farm.saleBookings.push({ saleDay: sale.day, animalIds });
  j.events.push({
    type: 'sale-booked',
    head,
    calvesAtFoot: atFoot,
    saleDay: sale.day,
    saleDate: sale.date,
    daysAway: sale.day - farm.day,
  });
  return null;
}

/** Sell a list of animals. Calves at foot go with their mothers. */
function sell(j: Job, list: readonly Animal[]): Out {
  if (!list.length) return refuse('nothing-to-sell', 'There are no cattle there to sell.');
  sellList(j.farm, list, j.events);
  return null;
}

function cancelSale(j: Job, a: Extract<Action, { type: 'cancelSale' }>): Out {
  const { farm } = j;
  if (a.ids !== undefined && !Array.isArray(a.ids)) {
    return refuse('bad-request', 'No cattle were picked.');
  }
  const pick = a.ids === undefined ? null : new Set<number>(a.ids);
  // Only animals still on the farm count, as `marketView` counts them. A tag
  // that has since died or been sold comes off the booking but is not counted
  // as stock taken off the sale.
  const onFarm = animalLookup(farm.mobs);
  let head = 0;
  let saleDay = -1;
  for (const b of farm.saleBookings) {
    const keep: number[] = [];
    for (const id of b.animalIds) {
      if (pick === null || pick.has(id)) {
        if (onFarm.has(id)) {
          head++;
          if (saleDay < 0) saleDay = b.saleDay;
        }
      } else keep.push(id);
    }
    b.animalIds = Int32Array.from(keep);
  }
  if (!head) {
    return refuse(
      'nothing-booked',
      'None of those cattle are still booked onto a sale. They may have been sold, or died, since they were booked.',
    );
  }
  farm.saleBookings = farm.saleBookings.filter((b) => b.animalIds.length > 0);
  j.events.push({ type: 'sale-cancelled', head, saleDay, saleDate: dateOn(farm, saleDay) });
  return null;
}

/** Steers and heifers go heaviest first. Cows and bulls go lowest condition first, then oldest. */
const byCondThenAge = (x: Animal, y: Animal): number => x.cond - y.cond || y.age - x.age;
const byWeight = (x: Animal, y: Animal): number => y.wt - x.wt;

function sellAnimals(j: Job, a: Extract<Action, { type: 'sellAnimals' }>): Out {
  if (!Array.isArray(a.ids)) return refuse('bad-request', 'No cattle were picked.');
  const all = animalLookup(j.farm.mobs);
  const list: Animal[] = [];
  for (const id of a.ids) {
    const x = all.get(id);
    if (!x) return refuse('no-such-animal', `Tag ${String(id)} is not on the farm.`);
    list.push(x);
  }
  const plan = salePlan(j);
  if ('ok' in plan) return plan;
  return settle(j, plan, list);
}

function sellGroup(j: Job, a: Extract<Action, { type: 'sellGroup' }>): Out {
  const m = j.mob(a.mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  if (!Object.hasOwn(GROUPS, a.group) || !isCount(a.qty)) {
    return refuse('bad-request', 'Pick a class and how many to sell.');
  }
  const plan = salePlan(j);
  if ('ok' in plan) return plan;
  const taken = plan.kind === 'book' ? bookedIds(j.farm) : new Set<number>();
  const pool = m.animals.filter(
    (x) => x.kind !== 'calf' && groupKey(x) === a.group && !taken.has(x.id),
  );
  if (a.group === 'steer' || a.group === 'heifer' || a.group === 'heiferP') pool.sort(byWeight);
  else pool.sort(byCondThenAge);
  return settle(j, plan, pool.slice(0, a.qty));
}

function sellClass(j: Job, a: Extract<Action, { type: 'sellClass' }>): Out {
  if (!Object.hasOwn(MARKET_CLASSES, a.cls) || !isCount(a.qty)) {
    return refuse('bad-request', 'Pick a class and how many to sell.');
  }
  const plan = salePlan(j);
  if ('ok' in plan) return plan;
  const taken = plan.kind === 'book' ? bookedIds(j.farm) : new Set<number>();
  const pool: Animal[] = [];
  for (const m of j.farm.mobs) {
    for (const x of m.animals) {
      if (x.kind !== 'calf' && marketClass(x) === a.cls && !taken.has(x.id)) pool.push(x);
    }
  }
  if (a.cls === 'cow' || a.cls === 'bull') pool.sort(byCondThenAge);
  else pool.sort(byWeight);
  return settle(j, plan, pool.slice(0, a.qty));
}

/** True if a mob is already where `where` would put it. */
function alreadyAt(s: Survey, m: FarmMob, where: MobWhere): boolean {
  if (where.kind !== 'paddock') return m.where.kind === where.kind;
  return m.where.kind === 'paddock' && areaIdOf(s, m) === s.topology.areaOf[where.anchor];
}

function moveMob(j: Job, a: Extract<Action, { type: 'moveMob' }>): Out {
  const m = j.mob(a.mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  const where = j.whereFor(a.to);
  if ('ok' in where) return where;
  if (alreadyAt(j.survey, m, where)) {
    return refuse('already-there', `${m.name} is already there.`);
  }
  m.where = where;
  const first = m.animals[0]!.id;
  const head = m.animals.length;
  // Moving a mob by hand breaks its plan: it pauses (the feedlot ends it, as in
  // the old game). The player resumes it from a step, or clears it.
  const run = m.plan;
  if (run && where.kind === 'lot') {
    delete m.plan;
    j.events.push({
      type: 'plan-cleared',
      mob: m.id,
      mobName: m.name,
      template: run.template,
      because: 'to-lot',
      report: reportOf(j.farm, run),
    });
  } else if (run && !run.paused) {
    run.paused = true;
    run.waiting = null;
    j.events.push({
      type: 'plan-paused',
      mob: m.id,
      mobName: m.name,
      template: run.template,
      step: stepOf(templateOf(j.farm, run)!, run.leg, run.idx),
      because: 'manual-move',
    });
  }
  mergeShared(j.farm, j.survey, j.events);
  j.arrived(j.mobOf(first)!, head);
  return null;
}

function moveCattle(j: Job, a: Extract<Action, { type: 'moveCattle' }>): Out {
  const { farm } = j;
  if (!Array.isArray(a.picks)) return refuse('bad-request', 'No cattle were picked.');
  const where = j.whereFor(a.to);
  if ('ok' in where) return where;
  const s = j.survey;
  const picked: Animal[] = [];
  for (const p of a.picks) {
    if (!p || typeof p !== 'object') {
      return refuse('bad-request', 'Pick a class and how many to move.');
    }
    const m = j.mob(p.mob);
    if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
    if (!Object.hasOwn(CLASS_LABELS, p.cls) || !isCount(p.qty)) {
      return refuse('bad-request', 'Pick a class and how many to move.');
    }
    if (alreadyAt(s, m, where)) return refuse('already-there', `${m.name} is already there.`);
    const g = m.animals.filter((x) => x.kind !== 'calf' && classOf(x) === p.cls);
    if (!g.length) continue;
    if (g[0]!.kind === 'cow' || g[0]!.kind === 'bull') g.sort((x, y) => x.cond - y.cond);
    else g.sort(byWeight);
    for (const x of g.slice(0, p.qty)) picked.push(x);
  }
  if (!picked.length) return refuse('nothing-to-move', 'None of those cattle are there to move.');
  const ids = new Set(picked.map((x) => x.id));
  // Calves go with their mothers.
  for (const m of farm.mobs) {
    for (const x of m.animals) if (x.kind === 'calf' && ids.has(x.dam)) ids.add(x.id);
  }
  const moving: Animal[] = [];
  let from: FarmMob | null = null;
  for (const m of farm.mobs) {
    const out = m.animals.filter((x) => ids.has(x.id));
    if (out.length && !from) from = m;
    for (const x of out) moving.push(x);
    m.animals = m.animals.filter((x) => !ids.has(x.id));
  }
  const t = newMob(farm, where, undefined, from?.supp);
  t.animals = moving;
  farm.mobs = farm.mobs.filter((m) => m.animals.length);
  mergeShared(farm, s, j.events);
  j.arrived(j.mobOf(moving[0]!.id)!, moving.length);
  return null;
}

function setSupplement(j: Job, a: Extract<Action, { type: 'setSupplement' }>): Out {
  const m = j.mob(a.mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  if (!SUPPLEMENTS.includes(a.supp)) return refuse('bad-request', 'That is not a supplement.');
  m.supp = a.supp;
  j.events.push({ type: 'supplement-set', mob: m.id, mobName: m.name, supp: m.supp });
  return null;
}

// ---------------------------------------------------------------------------
// Grazing plans
// ---------------------------------------------------------------------------

/** A plan as asked for, checked and made plain. A refusal says what is wrong. */
function checkedLegs(spec: PlanSpec): PlanLeg[] | ActionRefusal {
  const F = PLAN_FIGURES;
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.legs) || !spec.legs.length) {
    return refuse('bad-request', 'A plan needs at least one leg with paddocks in it.');
  }
  if (spec.legs.length > F.maxLegs.value) {
    return refuse('bad-request', `A plan can have up to ${F.maxLegs.value} legs.`);
  }
  if (spec.after !== 'repeat' && spec.after !== 'stay') {
    return refuse(
      'bad-request',
      'Say what the plan does when the last leg is done: repeat or stay.',
    );
  }
  const out: PlanLeg[] = [];
  for (const [n, leg] of spec.legs.entries()) {
    const who = spec.legs.length > 1 ? `Leg ${n + 1}: ` : '';
    if (!leg || !Array.isArray(leg.stops) || !leg.stops.length) {
      return refuse('bad-request', `${who}Pick at least one paddock.`);
    }
    if (leg.stops.length > F.maxStops.value) {
      return refuse('bad-request', `${who}A leg can have up to ${F.maxStops.value} stops.`);
    }
    if (!leg.stops.every(isCell)) return refuse('bad-request', `${who}A stop is off the farm.`);
    const rounds = leg.rounds ?? 0;
    if (!Number.isInteger(rounds) || rounds < 0 || rounds > F.maxRounds.value) {
      return refuse(
        'bad-request',
        `${who}Rounds is a whole number from 0 (keep going) to ${F.maxRounds.value}.`,
      );
    }
    const r = leg.rule;
    if (r && r.mode === 'days') {
      if (
        typeof r.every !== 'number' ||
        !Number.isFinite(r.every) ||
        r.every < MIN_EVERY_DAYS ||
        r.every > F.maxEveryDays.value
      ) {
        return refuse(
          'bad-request',
          `${who}Move every ${MIN_EVERY_DAYS} to ${F.maxEveryDays.value} days. The lowest is ${F.maxMovesADay.value} moves a day.`,
        );
      }
      if (r.every < 1 && leg.stops.length < 2) {
        return refuse(
          'bad-request',
          `${who}A plan that moves several times a day needs at least two paddocks.`,
        );
      }
      out.push({ stops: leg.stops.slice(), rule: { mode: 'days', every: r.every }, rounds });
    } else if (r && r.mode === 'kg') {
      const maxDays = r.maxDays ?? 0;
      if (
        typeof r.kg !== 'number' ||
        !Number.isFinite(r.kg) ||
        r.kg < F.minKg.value ||
        r.kg > F.maxKg.value
      ) {
        return refuse(
          'bad-request',
          `${who}Move when grazed down to between ${F.minKg.value} and ${F.maxKg.value} kg DM/ha.`,
        );
      }
      if (!Number.isInteger(maxDays) || maxDays < 0 || maxDays > F.maxDaysLimit.value) {
        return refuse(
          'bad-request',
          `${who}The day limit is a whole number of days from 0 (none) to ${F.maxDaysLimit.value}.`,
        );
      }
      out.push({ stops: leg.stops.slice(), rule: { mode: 'kg', kg: r.kg, maxDays }, rounds });
    } else
      return refuse(
        'bad-request',
        `${who}Pick a rule: move every so many days, or when grazed down.`,
      );
  }
  return out;
}

/** The area a plan's stop is in, as the stop's own square. */
function stopAreaId(j: Job, cell: number): number {
  return j.survey.topology.areaOf[cell]!;
}

/**
 * Put a mob in the area of a plan's stop, at once, unless it is already
 * there. If another mob is in the area the two join, as when a mob is moved
 * by hand (and as the old game's plan did).
 */
function putOnStop(j: Job, m: FarmMob, cell: number): void {
  const s = j.survey;
  const here =
    m.where.kind === 'paddock' && s.topology.areaOf[m.where.anchor] === stopAreaId(j, cell);
  if (here) return;
  m.where = { kind: 'paddock', anchor: cell };
  const first = m.animals[0]?.id;
  const head = m.animals.length;
  mergeShared(j.farm, j.survey, j.events);
  const now = first === undefined ? undefined : j.mobOf(first);
  if (now) j.arrived(now, head);
}

/** The stops of a template that hold another mob now, one for each area: the area, and that mob's name and head. */
function joinsOf(
  j: Job,
  m: FarmMob,
  tpl: PlanTemplate,
): { area: string; mob: number; mobName: string; head: number }[] {
  const s = j.survey;
  const out: { area: string; mob: number; mobName: string; head: number }[] = [];
  const seen = new Set<number>();
  for (const l of tpl.legs) {
    for (const c of l.stops) {
      const id = s.topology.areaOf[c]!;
      if (seen.has(id)) continue;
      seen.add(id);
      const other = j.farm.mobs.find(
        (o) =>
          o !== m &&
          o.animals.length > 0 &&
          o.where.kind === 'paddock' &&
          s.topology.areaOf[o.where.anchor] === id,
      );
      if (other) {
        out.push({
          area: s.topology.areas[id]!.name,
          mob: other.id,
          mobName: other.name,
          head: other.animals.length,
        });
      }
    }
  }
  return out;
}

/** The squares of a template whose area has no water, as area names, each once. */
function dryAreasOf(j: Job, tpl: PlanTemplate): string[] {
  const s = j.survey;
  const names = new Set<string>();
  for (const l of tpl.legs) {
    for (const c of l.stops) {
      const id = s.topology.areaOf[c]!;
      if (!s.points.areaTroughs[id]!.length) names.add(s.topology.areas[id]!.name);
    }
  }
  return [...names];
}

function setPlan(j: Job, a: Extract<Action, { type: 'setPlan' }>): Out {
  const { farm } = j;
  const m = j.mob(a.mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  if (!a.plan || typeof a.plan !== 'object') return refuse('bad-request', 'Say which plan.');
  let tpl: PlanTemplate;
  let changed = false;
  if ('template' in a.plan) {
    const found = farm.plans.find((t) => t.id === (a.plan as { template: number }).template);
    if (!found) return refuse('no-such-plan', 'There is no such plan.');
    tpl = found;
  } else {
    const spec = a.plan;
    const legs = checkedLegs(spec);
    if ('ok' in legs) return legs;
    if (spec.id !== undefined) {
      const found = farm.plans.find((t) => t.id === spec.id);
      if (!found) return refuse('no-such-plan', 'There is no such plan to change.');
      tpl = found;
      changed = true;
    } else {
      if (farm.plans.length >= PLAN_FIGURES.maxTemplates.value) {
        return refuse(
          'bad-request',
          `A farm can keep up to ${PLAN_FIGURES.maxTemplates.value} plans. Change one of them.`,
        );
      }
      const id = farm.nextPlanId;
      tpl = { id, name: '', legs, after: spec.after };
      farm.plans.push(tpl);
      farm.nextPlanId = id + 1;
    }
    if (spec.name !== undefined && typeof spec.name !== 'string') {
      return refuse('bad-request', 'A plan name is text.');
    }
    tpl.name = (spec.name ?? '').trim() || tpl.name || 'Plan ' + tpl.id;
    tpl.legs = legs;
    tpl.after = spec.after;
  }
  const step = a.step ?? 0;
  const pos = positionOf(tpl, step);
  if (!pos) {
    return refuse(
      'bad-request',
      `That plan has ${stepsIn(tpl)} stops, so step ${String(step)} is not on it.`,
    );
  }
  // Mobs already running a changed template keep their place where it still exists.
  if (changed) {
    for (const o of farm.mobs) {
      const r = o.plan;
      if (!r || r.template !== tpl.id || o === m) continue;
      if (r.leg >= tpl.legs.length || r.idx >= tpl.legs[r.leg]!.stops.length) {
        r.leg = 0;
        r.idx = 0;
      }
      r.round = 0;
      r.waiting = null;
    }
  }
  const joins = joinsOf(j, m, tpl);
  const dryAreas = dryAreasOf(j, tpl);
  // The plan is on the mob before it is put on the stop, so a join keeps it as the old game's did.
  m.plan = newRun(farm, tpl, pos.leg, pos.idx);
  putOnStop(j, m, tpl.legs[pos.leg]!.stops[pos.idx]!);
  j.events.push({
    type: 'plan-set',
    mob: m.id,
    mobName: m.name,
    template: tpl.id,
    templateName: tpl.name,
    changed,
    step,
    steps: stepsIn(tpl),
    area: j.survey.topology.areas[stopAreaId(j, tpl.legs[pos.leg]!.stops[pos.idx]!)]!.name,
    dryAreas,
    joins,
  });
  return null;
}

function pausePlan(j: Job, a: Extract<Action, { type: 'pausePlan' }>): Out {
  const m = j.mob(a.mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  const run = m.plan;
  if (!run) return refuse('no-plan', `${m.name} has no grazing plan.`);
  if (run.paused) return refuse('already-paused', `${m.name}'s plan is already paused.`);
  run.paused = true;
  run.waiting = null;
  j.events.push({
    type: 'plan-paused',
    mob: m.id,
    mobName: m.name,
    template: run.template,
    step: stepOf(templateOf(j.farm, run)!, run.leg, run.idx),
    because: 'asked',
  });
  return null;
}

function resumePlan(j: Job, a: Extract<Action, { type: 'resumePlan' }>): Out {
  const m = j.mob(a.mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  const run = m.plan;
  if (!run) return refuse('no-plan', `${m.name} has no grazing plan to resume. Set one.`);
  const tpl = templateOf(j.farm, run)!;
  const step = a.step ?? stepOf(tpl, run.leg, run.idx);
  const pos = positionOf(tpl, step);
  if (!pos) {
    return refuse(
      'bad-request',
      `That plan has ${stepsIn(tpl)} stops, so step ${String(step)} is not on it.`,
    );
  }
  const cell = tpl.legs[pos.leg]!.stops[pos.idx]!;
  const joins = joinsOf(j, m, tpl);
  // The counts so far are kept. The place, the round and the days on the stop start again.
  run.leg = pos.leg;
  run.idx = pos.idx;
  run.round = 0;
  run.moved = j.farm.day;
  run.noted = 0;
  run.waiting = null;
  run.paused = false;
  putOnStop(j, m, cell);
  const id = stopAreaId(j, cell);
  j.events.push({
    type: 'plan-resumed',
    mob: m.id,
    mobName: m.name,
    template: tpl.id,
    step,
    area: j.survey.topology.areas[id]!.name,
    joins,
  });
  return null;
}

function clearPlan(j: Job, a: Extract<Action, { type: 'clearPlan' }>): Out {
  const m = j.mob(a.mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  const run = m.plan;
  if (!run) return refuse('no-plan', `${m.name} has no grazing plan.`);
  delete m.plan;
  j.events.push({
    type: 'plan-cleared',
    mob: m.id,
    mobName: m.name,
    template: run.template,
    because: 'asked',
    report: reportOf(j.farm, run),
  });
  return null;
}

function wean(j: Job, a: Extract<Action, { type: 'wean' }>): Out {
  const { farm } = j;
  const m = j.mob(a.mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  if (!m.animals.some((x) => x.kind === 'calf' && x.age >= WEAN_MIN_AGE)) {
    return refuse(
      'no-calves-to-wean',
      `No calves in ${m.name} are old enough to wean (${WEAN_MIN_AGE} days or more).`,
    );
  }
  const s = j.survey;
  let where: MobWhere | null;
  if (a.to === undefined) {
    const dest = autoWeanDest(farm, s, plantingsNow(farm, j.env), m);
    where = dest === null ? null : { kind: 'paddock', anchor: dest };
  } else {
    const w = j.whereFor(a.to);
    if ('ok' in w) return w;
    if (alreadyAt(s, m, w)) {
      return refuse('already-there', 'Weaners need their own paddock, away from the cows.');
    }
    where = w;
  }
  const calves = weanMob(m, animalLookup(farm.mobs));
  const avgKg = Math.round(calves.reduce((t, c) => t + c.wt, 0) / calves.length);
  if (!where) {
    j.events.push({
      type: 'weaned',
      mob: m.id,
      mobName: m.name,
      count: calves.length,
      avgKg,
      into: null,
    });
    return null;
  }
  const gone = new Set(calves.map((c) => c.id));
  m.animals = m.animals.filter((x) => !gone.has(x.id));
  const t = newMob(farm, where, 'Weaners ' + farm.nextMobId, m.supp);
  t.animals = calves;
  mergeShared(farm, s, j.events);
  const now = j.mobOf(calves[0]!.id)!;
  const area = areaIdOf(s, now);
  j.events.push({
    type: 'weaned',
    mob: m.id,
    mobName: m.name,
    count: calves.length,
    avgKg,
    into: {
      mob: now.id,
      mobName: now.name,
      where: now.where,
      area: area < 0 ? null : s.topology.areas[area]!.name,
    },
  });
  if (area >= 0 && !s.points.areaTroughs[area]!.length) {
    j.events.push({
      type: 'no-water',
      mob: now.id,
      mobName: now.name,
      area: s.topology.areas[area]!.name,
    });
  }
  return null;
}

function mark(j: Job, a: Extract<Action, { type: 'markCalves' }>): Out {
  const m = j.mob(a.mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  const r = markCalves(m);
  if (!r.marked) return refuse('nothing-to-mark', `There are no bull calves to mark in ${m.name}.`);
  j.farm.cash -= r.cost;
  j.farm.year.running += r.cost;
  j.events.push({
    type: 'calves-marked',
    mob: m.id,
    mobName: m.name,
    count: r.marked,
    cost: r.cost,
  });
  return null;
}

// ---------------------------------------------------------------------------
// Fences, gates and water
// ---------------------------------------------------------------------------

const edgesOk = (edges: unknown): edges is EdgeRef[] =>
  Array.isArray(edges) &&
  edges.every((e) => e && (e.line === 'h' || e.line === 'v') && edgeOnFarm(e));

const offFarm = (): ActionRefusal => refuse('off-the-farm', 'That line runs off the farm.');

function doBuildFence(j: Job, a: Extract<Action, { type: 'buildFence' }>): Out {
  const { farm } = j;
  if (!edgesOk(a.edges)) return offFarm();
  if (!Object.hasOwn(FENCE_CODE, a.fence)) {
    return refuse('bad-request', 'That is not a kind of fence.');
  }
  const type = FENCE_CODE[a.fence];
  const before = j.survey;
  const was = farm.layout.fences;
  const out = buildFence(farm.layout, a.edges, type);
  if (!out.ok) return out;
  const side = farm.layout.scale.sideM;
  const each = segmentCost(a.fence, side);
  // A segment built from materials on hand (kept from fence taken down) is half price.
  const reused = a.fence === 'tape' ? each : reusedSegmentCost(a.fence, side);
  const fromStock = new Set(out.fromStockEdges.map(edgeKey));
  const fenceCost = (out.segments - out.fromStock) * each + out.fromStock * reused;
  let cost: number;
  let fee = 0;
  let energiser = false;
  if (a.fence === 'tape') {
    // New tape by the metre. Running out tape that was on the roll costs a small fee.
    fee = out.tapeFromRoll > 0 ? COSTS.tapeRoll : 0;
    cost = out.tapeNew * each + fee;
  } else {
    cost = fenceCost;
    // The energiser is bought once, with the first electric fence.
    if (a.fence === 'electric' && !farm.energiser) {
      energiser = true;
      cost += COSTS.energiser;
    }
  }
  const no = j.bankSays(cost, 'fencing');
  if (no) return no;
  if (energiser) {
    farm.energiser = true;
    farm.ledger.energiser += COSTS.energiser;
  }
  for (const e of a.edges) {
    if (getEdge(was, e) === getEdge(out.layout.fences, e)) continue;
    const key = edgeKey(e);
    if (a.fence === 'tape') delete farm.ledger.edges[key];
    // The ledger records what was spent on what is standing: half for a segment from materials on hand.
    else farm.ledger.edges[key] = fromStock.has(key) ? reused : each;
  }
  if (a.fence === 'tape') {
    farm.year.infra += out.tapeNew * each;
    farm.year.running += fee;
  } else farm.year.infra += fenceCost;
  farm.layout = out.layout;
  const onHand = a.fence === 'tape' ? 0 : farm.layout.fenceOnHand[a.fence];
  j.events.push({
    type: 'layout-job',
    job: 'buildFence',
    cost,
    detail: {
      fence: a.fence,
      segments: out.segments,
      metres: out.metres,
      tapeFromRollM: out.tapeFromRollM,
      tapeNewM: out.tapeNewM,
      // Permanent and electric: metres from materials on hand, what that saved, and what is left on hand.
      fromStockM: out.fromStockM,
      stockSaving: out.fromStock * (each - reused),
      onHandM: onHand * side,
      energiserBought: energiser,
      paddocksBefore: out.paddocksBefore,
      paddocksAfter: out.paddocksAfter,
    },
  });
  j.fencesChanged(before, out);
  return null;
}

function doRemoveFence(j: Job, edges: readonly EdgeRef[], job: string): Out {
  const { farm } = j;
  const before = j.survey;
  const out = removeFence(farm.layout, edges);
  if (!out.ok) return out;
  let cost = 0;
  if (out.tapeToRoll > 0) {
    // Rolling tape up costs a small fee. It comes straight off the account.
    cost = COSTS.tapeRoll;
    farm.cash -= cost;
    farm.year.running += cost;
  }
  for (const e of edges) {
    if (getEdge(out.layout.fences, e) === EDGE.none) delete farm.ledger.edges[edgeKey(e)];
  }
  farm.layout = out.layout;
  const side = farm.layout.scale.sideM;
  j.events.push({
    type: 'layout-job',
    job: j.part.label ?? job,
    cost,
    detail: {
      segments: out.segments,
      metres: out.metres,
      tapeToRollM: out.tapeToRollM,
      tapeOnRollM: farm.layout.tapeOnRoll * side,
      // Fence materials kept to use again, and what is now on hand of each kind.
      keptPermanentM: out.kept.permanent * side,
      keptElectricM: out.kept.electric * side,
      permanentOnHandM: farm.layout.fenceOnHand.permanent * side,
      electricOnHandM: farm.layout.fenceOnHand.electric * side,
      paddocksBefore: out.paddocksBefore,
      paddocksAfter: out.paddocksAfter,
    },
  });
  j.fencesChanged(before, out);
  return null;
}

function doRollUpTape(j: Job, a: Extract<Action, { type: 'rollUpTape' }>): Out {
  if (!edgesOk([a.edge])) return offFarm();
  const c = getEdge(j.farm.layout.fences, a.edge);
  if (c !== EDGE.tape && c !== EDGE.tapeDown) {
    return refuse('not-tape', 'There is no tape there to roll up.');
  }
  return doRemoveFence(j, tapeRun(j.farm.layout.fences, a.edge), 'rollUpTape');
}

/** A layout job that changes fences or gates: apply the result and settle the mobs. */
function fenceJob(
  j: Job,
  job: string,
  before: Survey,
  out: FenceEffect & { layout: FarmState['layout'] },
  cost: number,
  detail: Record<string, number | boolean | string> = {},
): void {
  j.farm.layout = out.layout;
  j.events.push({
    type: 'layout-job',
    job,
    cost,
    detail: { ...detail, paddocksBefore: out.paddocksBefore, paddocksAfter: out.paddocksAfter },
  });
  j.fencesChanged(before, out);
}

function doPlaceGate(j: Job, a: Extract<Action, { type: 'placeGate' }>): Out {
  const { farm } = j;
  if (!edgesOk([a.edge])) return offFarm();
  const before = j.survey;
  const out = placeGate(farm.layout, a.edge);
  if (!out.ok) return out;
  const no = j.bankSays(COSTS.gate, 'a gate');
  if (no) return no;
  // The gate takes the place of one fence segment.
  farm.ledger.edges[edgeKey(a.edge)] = COSTS.gate;
  farm.year.infra += COSTS.gate;
  fenceJob(j, 'placeGate', before, out, COSTS.gate);
  return null;
}

function doRemoveGate(j: Job, a: Extract<Action, { type: 'removeGate' }>): Out {
  if (!edgesOk([a.edge])) return offFarm();
  const before = j.survey;
  const out = removeGate(j.farm.layout, a.edge);
  if (!out.ok) return out;
  delete j.farm.ledger.edges[edgeKey(a.edge)];
  fenceJob(j, 'removeGate', before, out, 0);
  return null;
}

function doSetGate(j: Job, a: Extract<Action, { type: 'setGate' }>): Out {
  if (!edgesOk([a.edge])) return offFarm();
  const before = j.survey;
  const out = setGate(j.farm.layout, a.edge, !!a.open);
  if (!out.ok) return out;
  fenceJob(j, 'setGate', before, out, 0, { open: out.open });
  return null;
}

function doFixFence(j: Job, a: Extract<Action, { type: 'fixFence' }>): Out {
  if (!edgesOk([a.edge])) return offFarm();
  const before = j.survey;
  const out = fixFence(j.farm.layout, a.edge);
  if (!out.ok) return out;
  const no = j.bankSays(COSTS.fixFence, 'fence repairs');
  if (no) return no;
  j.farm.year.running += COSTS.fixFence;
  fenceJob(j, 'fixFence', before, out, COSTS.fixFence);
  return null;
}

/** A layout job that changes water only: apply the result. */
function waterJob(
  j: Job,
  job: string,
  layout: FarmState['layout'],
  cost: number,
  detail: Record<string, number | boolean | string> = {},
): void {
  j.farm.layout = layout;
  j.events.push({ type: 'layout-job', job, cost, detail });
}

function doLayPipe(j: Job, a: Extract<Action, { type: 'layPipe' }>): Out {
  const { farm } = j;
  if (!Array.isArray(a.cells)) return refuse('bad-request', 'No squares were picked for the pipe.');
  const out = layPipe(farm.layout, a.cells);
  if (!out.ok) return out;
  const cost = out.segments * segmentCost('pipe', farm.layout.scale.sideM);
  const no = j.bankSays(cost, 'poly pipe');
  if (no) return no;
  farm.ledger.pipe += cost;
  farm.year.infra += cost;
  waterJob(j, 'layPipe', out.layout, cost, {
    segments: out.segments,
    metres: out.metres,
    connected: out.connected,
  });
  return null;
}

function doPlaceTrough(j: Job, a: Extract<Action, { type: 'placeTrough' }>): Out {
  const { farm } = j;
  const out = placeTrough(farm.layout, a.cell);
  if (!out.ok) return out;
  const no = j.bankSays(COSTS.trough, 'a trough');
  if (no) return no;
  farm.ledger.troughs[a.cell] = COSTS.trough;
  farm.year.infra += COSTS.trough;
  waterJob(j, 'placeTrough', out.layout, COSTS.trough, { cell: a.cell });
  return null;
}

function doMoveTrough(j: Job, a: Extract<Action, { type: 'moveTrough' }>): Out {
  const { farm } = j;
  const out = moveTrough(farm.layout, a.from, a.to);
  if (!out.ok) return out;
  const no = j.bankSays(COSTS.moveTrough, 'moving a trough');
  if (no) return no;
  farm.year.running += COSTS.moveTrough;
  const paid = farm.ledger.troughs[a.from];
  delete farm.ledger.troughs[a.from];
  if (paid) farm.ledger.troughs[a.to] = paid;
  waterJob(j, 'moveTrough', out.layout, COSTS.moveTrough, { from: a.from, to: a.to });
  return null;
}

function doRemoveTrough(j: Job, a: Extract<Action, { type: 'removeTrough' }>): Out {
  const out = removeTrough(j.farm.layout, a.cell);
  if (!out.ok) return out;
  // No refund. What was spent on it comes off net worth.
  delete j.farm.ledger.troughs[a.cell];
  waterJob(j, 'removeTrough', out.layout, 0, { cell: a.cell });
  return null;
}

function doPlaceFenceHub(j: Job, a: Extract<Action, { type: 'placeFenceHub' }>): Out {
  const { farm } = j;
  const out = placeFenceHub(farm.layout, a.vertex);
  if (!out.ok) return out;
  const cost = COSTS.trough + COSTS.fenceHubExtra;
  const no = j.bankSays(cost, 'a water hub');
  if (no) return no;
  farm.ledger.hubs[a.vertex] = cost;
  farm.year.infra += cost;
  waterJob(j, 'placeFenceHub', out.layout, cost, {
    vertex: a.vertex,
    paddocksWatered: out.paddocks.length,
  });
  return null;
}

function doRemoveHub(j: Job, a: Extract<Action, { type: 'removeHub' }>): Out {
  const out = removeHub(j.farm.layout, a.vertex);
  if (!out.ok) return out;
  delete j.farm.ledger.hubs[a.vertex];
  waterJob(j, 'removeHub', out.layout, 0, { vertex: a.vertex });
  return null;
}

function doPlaceSquareHub(j: Job, a: Extract<Action, { type: 'placeSquareHub' }>): Out {
  const { farm } = j;
  const before = j.survey;
  const was = farm.layout.fences;
  const out = placeSquareHub(farm.layout, a.cell);
  if (!out.ok) return out;
  const cost = (out.troughAdded ? COSTS.trough : 0) + out.gates * COSTS.gate;
  const no = j.bankSays(cost, 'a water hub');
  if (no) return no;
  if (out.troughAdded) farm.ledger.troughs[a.cell] = COSTS.trough;
  // Each side that became a gate. The fence it took the place of is gone.
  const x = a.cell % GRID_W;
  const y = (a.cell / GRID_W) | 0;
  const sides: EdgeRef[] = [hEdge(y, x), hEdge(y + 1, x), vEdge(y, x), vEdge(y, x + 1)];
  for (const e of sides) {
    if (getEdge(was, e) !== getEdge(out.layout.fences, e)) {
      farm.ledger.edges[edgeKey(e)] = COSTS.gate;
    }
  }
  farm.year.infra += cost;
  fenceJob(j, 'placeSquareHub', before, out, cost, {
    cell: a.cell,
    troughAdded: out.troughAdded,
    gates: out.gates,
  });
  return null;
}

function doPlacePortable(j: Job, a: Extract<Action, { type: 'placePortable' }>): Out {
  const { farm } = j;
  const out = placePortable(farm.layout, a.cell);
  if (!out.ok) return out;
  const no = j.bankSays(COSTS.portable, 'a portable trough');
  if (no) return no;
  // The first fill of water is not infrastructure.
  farm.ledger.ports[out.port.id] = COSTS.portable - COSTS.portableFill;
  farm.year.infra += COSTS.portable;
  waterJob(j, 'placePortable', out.layout, COSTS.portable, { port: out.port.id, cell: a.cell });
  return null;
}

function doMovePortable(j: Job, a: Extract<Action, { type: 'movePortable' }>): Out {
  const out = movePortable(j.farm.layout, a.port, a.cell);
  if (!out.ok) return out;
  const no = j.bankSays(COSTS.portableMove, 'moving the trough');
  if (no) return no;
  j.farm.year.running += COSTS.portableMove;
  waterJob(j, 'movePortable', out.layout, COSTS.portableMove, {
    port: a.port,
    from: out.from,
    to: out.to,
  });
  return null;
}

function doRefillPortable(j: Job, a: Extract<Action, { type: 'refillPortable' }>): Out {
  const out = refillPortable(j.farm.layout, a.port);
  if (!out.ok) return out;
  const no = j.bankSays(COSTS.portableFill, 'carting water');
  if (no) return no;
  j.farm.year.running += COSTS.portableFill;
  waterJob(j, 'refillPortable', out.layout, COSTS.portableFill, {
    port: a.port,
    litres: out.litres,
    wasEmpty: out.wasEmpty,
  });
  return null;
}

function doRemovePortable(j: Job, a: Extract<Action, { type: 'removePortable' }>): Out {
  const out = removePortable(j.farm.layout, a.port);
  if (!out.ok) return out;
  const back = portableResale();
  j.farm.cash += back;
  delete j.farm.ledger.ports[a.port];
  waterJob(j, 'removePortable', out.layout, -back, { port: a.port });
  return null;
}

// ---------------------------------------------------------------------------
// Crops and pastures
// ---------------------------------------------------------------------------

function doSow(j: Job, a: Extract<Action, { type: 'sow' }>): Out {
  const { farm } = j;
  if (!Object.hasOwn(SPECIES, a.species) || !Array.isArray(a.cells)) {
    return refuse('not-grown-here', 'That is not grown in this district.');
  }
  const ctx = cropContextOf(farm);
  const out = sow(farm.crops, farm.pasture, ctx, a.species, a.cells, farm.day);
  if (!out.ok) return out;
  const no = j.bankSays(out.cost, 'sowing');
  if (no) return no;
  if (out.crop) farm.year.crops += out.cost;
  else {
    // Half the cost of a sown pasture counts as infrastructure, for as long as it is in the ground.
    farm.ledger.pasture[out.field.id] = (out.cost * PASTURE_ASSET_SHARE) / out.field.cells.length;
    farm.year.infra += out.cost;
  }
  // Plantings that were sown over are gone.
  for (const id of Object.keys(farm.ledger.pasture)) {
    if (!fieldById(farm.crops, +id)) delete farm.ledger.pasture[id];
  }
  j.events.push({
    type: 'sown',
    sp: a.species,
    fieldId: out.field.id,
    ha: out.ha,
    convHa: out.convHa,
    cost: out.cost,
    skipped: out.skipped,
  });
  return null;
}

function doHarvest(j: Job, a: Extract<Action, { type: 'harvest' }>): Out {
  const { farm } = j;
  const ctx = cropContextOf(farm);
  // The season is the one the last daily tick ran on.
  const seasonF = seasonsOf(farm, j.env).factorsOn(farm.day > 0 ? farm.day - 1 : 0).seasonF;
  const out = harvestField(farm.crops, farm.pasture, ctx, a.field, farm.day, seasonF);
  if (!out.ok) return out;
  const no = j.bankSays(out.cost, 'harvesting');
  if (no) return no;
  farm.cash += out.value;
  farm.year.grain += out.value;
  farm.year.crops += out.cost;
  j.events.push({
    type: 'harvested',
    sp: out.sp,
    fieldId: out.fieldId,
    t: out.t,
    tha: out.tha,
    value: out.value,
    cost: out.cost,
  });
  return null;
}

function run(j: Job, a: Action): Out {
  switch (a.type) {
    case 'buyCattle':
      return buyCattle(j, a);
    case 'sellAnimals':
      return sellAnimals(j, a);
    case 'sellGroup':
      return sellGroup(j, a);
    case 'sellClass':
      return sellClass(j, a);
    case 'cancelSale':
      return cancelSale(j, a);
    case 'moveMob':
      return moveMob(j, a);
    case 'moveCattle':
      return moveCattle(j, a);
    case 'setSupplement':
      return setSupplement(j, a);
    case 'setPlan':
      return setPlan(j, a);
    case 'pausePlan':
      return pausePlan(j, a);
    case 'resumePlan':
      return resumePlan(j, a);
    case 'clearPlan':
      return clearPlan(j, a);
    case 'wean':
      return wean(j, a);
    case 'markCalves':
      return mark(j, a);
    case 'buildFence':
      return doBuildFence(j, a);
    case 'removeFence':
      return edgesOk(a.edges) ? doRemoveFence(j, a.edges, 'removeFence') : offFarm();
    case 'rollUpTape':
      return doRollUpTape(j, a);
    case 'placeGate':
      return doPlaceGate(j, a);
    case 'removeGate':
      return doRemoveGate(j, a);
    case 'setGate':
      return doSetGate(j, a);
    case 'fixFence':
      return doFixFence(j, a);
    case 'layPipe':
      return doLayPipe(j, a);
    case 'placeTrough':
      return doPlaceTrough(j, a);
    case 'moveTrough':
      return doMoveTrough(j, a);
    case 'removeTrough':
      return doRemoveTrough(j, a);
    case 'placeFenceHub':
      return doPlaceFenceHub(j, a);
    case 'removeHub':
      return doRemoveHub(j, a);
    case 'placeSquareHub':
      return doPlaceSquareHub(j, a);
    case 'placePortable':
      return doPlacePortable(j, a);
    case 'movePortable':
      return doMovePortable(j, a);
    case 'refillPortable':
      return doRefillPortable(j, a);
    case 'removePortable':
      return doRemovePortable(j, a);
    case 'sow':
      return doSow(j, a);
    case 'harvest':
      return doHarvest(j, a);
    default:
      return refuse('bad-request', 'That is not something that can be done on a farm.');
  }
}

/** A copy of a farm that keeps what has been worked out for it: its paddocks, water, seasons and real years. */
export function workingCopy(farm: FarmState): FarmState {
  const next = cloneFarm(farm);
  // The paddocks and water are the same until an action changes the layout.
  keepSurvey(next.layout, surveyOf(farm));
  // So are the farm's seasons and, on a real-year farm, its real years.
  keepSources(next, farm);
  return next;
}

/** The checks every action meets first, whatever it is. Null when it can go ahead. */
export function refusedOutright(
  farm: FarmState,
  action: Action,
  env: ActionEnv,
): ActionRefusal | null {
  // A real-year farm needs its real data for any action, whether or not
  // this one reads it. Without it this stops with an error.
  realSourcesOf(farm, env);
  if (farm.over) return refuse('game-over', 'The game is over on this farm.');
  if (!action || typeof action !== 'object') {
    return refuse('bad-request', 'That is not something that can be done on a farm.');
  }
  return null;
}

/**
 * What an action does, all at once, with no clock. Returns a copy of the
 * farm with the action done and what happened, or a refusal with the
 * reason. The farm passed in is never changed. Nothing is added to the
 * action log or the inbox: the caller records it (`recordAction`), with
 * the time of day when there is one.
 */
export function tryAction(
  farm: FarmState,
  action: Action,
  env: ActionEnv = {},
  part: PartOptions = {},
): ActionResult {
  const no0 = refusedOutright(farm, action, env);
  if (no0) return no0;
  const next = workingCopy(farm);
  const job = new Job(next, env, part);
  const no = run(job, action);
  if (no) return no;
  return { ok: true, farm: next, events: job.events };
}

/** Put an action in the farm's action log and its events in the inbox. */
export function recordAction(
  farm: FarmState,
  action: Action,
  events: readonly FarmEvent[],
  when?: { at: ClockSpan },
): void {
  const entry: LoggedAction = { day: farm.day, action: deepCopy(action) };
  if (when) entry.at = { start: when.at.start, end: when.at.end };
  farm.actionLog.push(entry);
  toInbox(farm, farm.day, events, when?.at.end);
}

/**
 * FOR CALIBRATION AND TESTS ONLY. Do a whole action at once with no farm
 * clock: no job time and no daylight limit. The calibration suites and
 * the MVP comparisons drive farms this way so their figures stay what they
 * were before jobs took time (docs/MODEL.md, section 9).
 *
 * Nothing a player can reach calls this. The engine's index does not
 * export it, engine code is forbidden to import it by lint, and
 * `applyAction` has no switch that leads here. Test support reaches it by
 * importing this file directly. The farm passed in is never changed.
 */
export function applyInstant(farm: FarmState, action: Action, env: ActionEnv = {}): ActionResult {
  const done = tryAction(farm, action, env);
  if (done.ok) recordAction(done.farm, action, done.events);
  return done;
}
