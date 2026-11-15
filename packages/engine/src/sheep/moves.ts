/**
 * Moving sheep (milestone 2.3, third pass): a whole mob or part of one to a
 * paddock, and grazing plans, through the same player actions as cattle,
 * with the species rules:
 *
 * - Sheep are never put where cattle graze (`cattle-there`), and cattle are
 *   never put where sheep graze (`sheep-there`, actions/apply.ts).
 * - Any paddock may take sheep. What holds them there is the fence: netting,
 *   gates and the boundary hold them; cattle fences (permanent, electric,
 *   tape) do not. Sheep leave through a cattle fence only for a reason, one
 *   fence at a time, as hungry cattle push through tape: when they are short
 *   of feed or water (`sheepBreakouts` in the tick).
 * - Sheep put with a sheep mob join it.
 * - A move costs the player's day as a cattle move does (day/spec.ts).
 */

import type { Action, ActionRefusal, ActionRefusalReason } from '../actions/types';
import type { GrazingLand } from '../cattle/types';
import type { Survey } from '../farm/layout';
import { areaIdOf, grazingArea, placeAnchor, surveyOf } from '../sim/derived';
import type { FarmEvent, TickEvent } from '../sim/events';
import { newRun, positionOf, stepOf, templateOf } from '../sim/plans';
import type { FarmState, PlanRun, PlanTemplate, PlanWaitReason } from '../sim/state';
import { sheepClassOf } from './energy';
import { createSheepMob, mergeSheepShared, sheepMobsOf } from './farm';
import { headOf, lambsByDam, splitOff } from './simFlock';
import type { SheepClass, SheepMob } from './types';

const refuse = (reason: ActionRefusalReason, message: string): ActionRefusal => ({
  ok: false,
  reason,
  message,
});

type Out = ActionRefusal | null;

const sheepMob = (farm: FarmState, id: number): SheepMob | undefined =>
  sheepMobsOf(farm).find((m) => m.id === id);

/** The grazing area a square is in, or a refusal; refused where cattle graze. */
function sheepTarget(farm: FarmState, s: Survey, cell: unknown): number | ActionRefusal {
  if (typeof cell !== 'number' || !Number.isInteger(cell)) {
    return refuse('bad-request', 'That square is off the farm.');
  }
  const areaId = s.topology.areaOf[cell];
  if (areaId === undefined || areaId < 0)
    return refuse('bad-request', 'That square is off the farm.');
  const cattle = farm.mobs.some(
    (m) =>
      m.where.kind === 'paddock' &&
      m.animals.length &&
      s.topology.areaOf[m.where.anchor] === areaId,
  );
  if (cattle) {
    return refuse(
      'cattle-there',
      'Cattle are grazing there. Cattle and sheep run in separate paddocks.',
    );
  }
  return areaId;
}

/** Say where sheep ended up, and warn when the area has no water. */
function arrived(s: Survey, m: SheepMob, head: number, events: FarmEvent[]): void {
  const id = areaIdOf(s, m);
  const area = s.topology.areas[id]!;
  events.push({ type: 'sheep-moved', mob: m.id, mobName: m.name, head, area: area.name });
  if (!s.points.areaTroughs[id]!.length) {
    events.push({ type: 'no-water', mob: m.id, mobName: m.name, area: area.name });
  }
}

/** Move a whole sheep mob to a paddock. It pauses the mob's plan, as a hand move of cattle does. */
export function moveSheep(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'moveSheep' }>,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  const s = surveyOf(farm);
  const to = sheepTarget(farm, s, a.to?.cell);
  if (typeof to !== 'number') return to;
  if (m.where.kind === 'paddock' && areaIdOf(s, m) === to) {
    return refuse('already-there', 'The mob is already in that paddock.');
  }
  m.where = { kind: 'paddock', anchor: placeAnchor(s, to) };
  if (m.plan) m.plan.paused = true;
  const head = headOf(m.sheep);
  mergeSheepShared(farm, s, events as TickEvent[]);
  const now = sheepMobsOf(farm).find((x) => x.sheep.some((y) => m.sheep.includes(y))) ?? m;
  arrived(s, now, head, events);
  return null;
}

/**
 * Move part of a sheep mob, by class and head, to a paddock: a new mob, or
 * joined to the sheep there. Ewes with lambs at foot take their share of
 * the lambs; lambs at foot do not go without their ewes.
 */
export function moveSheepPart(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'moveSheepPart' }>,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  if (!Number.isInteger(a.qty) || a.qty < 1) return refuse('bad-request', 'Pick how many to move.');
  if (a.cls === 'lamb') {
    return refuse('bad-request', 'Lambs at foot go with their ewes. Wean them to move them apart.');
  }
  const s = surveyOf(farm);
  const to = sheepTarget(farm, s, a.to?.cell);
  if (typeof to !== 'number') return to;
  if (m.where.kind === 'paddock' && areaIdOf(s, m) === to) {
    return refuse('already-there', 'Those sheep are already in that paddock.');
  }
  const pool = m.sheep.filter(
    (x) => x.weaned && x.n > 0 && sheepClassOf(x) === (a.cls as SheepClass),
  );
  if (!pool.length)
    return refuse('nothing-to-move', 'There are no sheep of that class in the mob.');
  const lambsOf = lambsByDam(m.sheep);
  const t = createSheepMob(
    farm.nextMobId++,
    '',
    { kind: 'paddock', anchor: placeAnchor(s, to) },
    farm.district,
  );
  t.name = m.name + ' part';
  t.joinOn = { ...m.joinOn };
  t.shearOn = m.shearOn ? { ...m.shearOn } : null;
  t.crutchOn = m.crutchOn ? { ...m.crutchOn } : null;
  t.feed = m.feed;
  let left = a.qty;
  let head = 0;
  for (const x of pool) {
    if (left <= 0) break;
    const k = Math.min(left, x.n);
    left -= k;
    head += k;
    const part = k >= x.n ? x : splitOff(x, k, farm.animalIds);
    if (part !== x) x.n -= k;
    t.sheep.push(part);
    // Their share of the lambs at foot goes with them, still with them.
    if (lambsOf.has(x.id)) {
      for (const l of m.sheep) {
        if (l.weaned || l.dam !== x.id || l.n <= 0) continue;
        const c = part === x ? l.n : Math.round((l.n * k) / (x.n + k));
        if (c <= 0) continue;
        const lp = c >= l.n ? l : splitOff(l, c, farm.animalIds);
        if (lp !== l) l.n -= c;
        lp.dam = part.id;
        t.sheep.push(lp);
      }
    }
  }
  const moved = new Set(t.sheep);
  m.sheep = m.sheep.filter((x) => !moved.has(x) && x.n > 0);
  const state = farm.sheep!;
  state.mobs.push(t);
  state.mobs = state.mobs.filter((x) => x.sheep.length);
  mergeSheepShared(farm, s, events as TickEvent[]);
  const now = sheepMobsOf(farm).find((x) => x.sheep.some((y) => moved.has(y))) ?? t;
  arrived(s, now, head, events);
  return null;
}

/** Put a sheep mob on a grazing plan template, from a step (the first if left out). */
export function setSheepPlan(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'setSheepPlan' }>,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  const tpl = farm.plans.find((p) => p.id === a.template);
  if (!tpl) return refuse('no-such-plan', 'There is no such plan.');
  const pos = positionOf(tpl, a.step ?? 0);
  if (!pos) return refuse('bad-request', 'That step is not in the plan.');
  const s = surveyOf(farm);
  const cell = tpl.legs[pos.leg]!.stops[pos.idx]!;
  const to = sheepTarget(farm, s, cell);
  if (typeof to !== 'number') return to;
  m.plan = newRun(farm, tpl, pos.leg, pos.idx);
  putSheepOnStop(farm, s, m, to, events);
  events.push({
    type: 'sheep-plan-set',
    mob: m.id,
    mobName: m.name,
    template: tpl.id,
    dryAreas: dryStops(s, tpl),
  });
  return null;
}

/**
 * Put a sheep mob on a plan's stop: a move (with its `sheep-moved` event, so
 * it takes the move's daylight, and the no-water warning) when the mob is
 * not already there; nothing when it is.
 */
function putSheepOnStop(
  farm: FarmState,
  s: Survey,
  m: SheepMob,
  to: number,
  events: FarmEvent[],
): void {
  if (m.where.kind === 'paddock' && areaIdOf(s, m) === to) return;
  m.where = { kind: 'paddock', anchor: placeAnchor(s, to) };
  const head = headOf(m.sheep);
  mergeSheepShared(farm, s, events as TickEvent[]);
  const now = sheepMobsOf(farm).find((x) => x.sheep.some((y) => m.sheep.includes(y))) ?? m;
  arrived(s, now, head, events);
}

/** The names of a plan's stops that have no water, each once (the cattle plan's `dryAreas`). */
function dryStops(s: Survey, tpl: PlanTemplate): string[] {
  const names = new Set<string>();
  for (const l of tpl.legs) {
    for (const c of l.stops) {
      const id = s.topology.areaOf[c]!;
      if (!s.points.areaTroughs[id]!.length) names.add(s.topology.areas[id]!.name);
    }
  }
  return [...names];
}

/** Pause a sheep mob's plan, as `pausePlan` does for cattle. */
export function pauseSheepPlan(farm: FarmState, events: FarmEvent[], mob: number): Out {
  const m = sheepMob(farm, mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  const run = m.plan;
  if (!run) return refuse('no-plan', `${m.name} has no grazing plan.`);
  if (run.paused) return refuse('already-paused', `${m.name}'s plan is already paused.`);
  run.paused = true;
  run.waiting = null;
  events.push({
    type: 'sheep-plan-paused',
    mob: m.id,
    mobName: m.name,
    template: run.template,
    step: stepOf(templateOf(farm, run)!, run.leg, run.idx),
  });
  return null;
}

/**
 * Resume a sheep mob's plan at a step (where it was if left out), as
 * `resumePlan` does for cattle: the mob goes to that stop (a move) and the
 * days on it start again.
 */
export function resumeSheepPlan(
  farm: FarmState,
  events: FarmEvent[],
  mob: number,
  step: number | undefined,
): Out {
  const m = sheepMob(farm, mob);
  if (!m) return refuse('no-such-mob', 'That mob is not on the farm.');
  const run = m.plan;
  if (!run) return refuse('no-plan', `${m.name} has no grazing plan to resume. Set one.`);
  const tpl = templateOf(farm, run);
  if (!tpl) return refuse('no-such-plan', 'There is no such plan.');
  const at = step ?? stepOf(tpl, run.leg, run.idx);
  const pos = positionOf(tpl, at);
  if (!pos) return refuse('bad-request', 'That step is not in the plan.');
  const s = surveyOf(farm);
  const to = sheepTarget(farm, s, tpl.legs[pos.leg]!.stops[pos.idx]!);
  if (typeof to !== 'number') return to;
  run.leg = pos.leg;
  run.idx = pos.idx;
  run.round = 0;
  run.moved = farm.day;
  run.noted = 0;
  run.waiting = null;
  run.paused = false;
  putSheepOnStop(farm, s, m, to, events);
  events.push({
    type: 'sheep-plan-resumed',
    mob: m.id,
    mobName: m.name,
    template: tpl.id,
    step: at,
    area: s.topology.areas[to]!.name,
  });
  return null;
}

/** Take a sheep mob off its plan. */
export function clearSheepPlan(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'clearSheepPlan' }>,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  if (!m.plan) return refuse('no-plan', 'The mob has no plan.');
  delete m.plan;
  events.push({ type: 'sheep-plan-cleared', mob: m.id, mobName: m.name });
  return null;
}

/** Feed on an area, kg DM/ha (green plus dead), as the cattle plans read it. */
function areaMass(farm: FarmState, cells: readonly number[]): number {
  const { G, D } = farm.pasture;
  let t = 0;
  for (const i of cells) t += G[i]! + D[i]!;
  return t / cells.length;
}

/**
 * Step 8b of the tick: sheep plans move sheep mobs, by the cattle plans'
 * rules (after N days on a stop, or when grazed down to a figure, or at a day
 * limit). A rule of several moves a day moves once a day for sheep (a
 * simplification). A stop with no water, or with cattle in it, waits, told
 * once a stop. A farm with no sheep plans skips this.
 */
export function runSheepPlans(
  farm: FarmState,
  survey: Survey,
  land: GrazingLand,
  events: TickEvent[],
): void {
  void land;
  for (const m of sheepMobsOf(farm)) {
    if (!sheepDueTonight(farm, survey, m)) continue;
    sheepPlanStep(farm, survey, m, templateOf(farm, m.plan!)!, events);
  }
  mergeSheepShared(farm, survey, events);
}

/** Where a sheep plan goes on its next move, or that it ends. Nothing is changed. */
function sheepNextOf(
  tpl: PlanTemplate,
  run: PlanRun,
): { finish: true } | { finish: false; li: number; ni: number; wraps: boolean; target: number } {
  const leg = tpl.legs[run.leg]!;
  let ni = run.idx + 1;
  let li = run.leg;
  let wraps = false;
  if (ni >= leg.stops.length) {
    ni = 0;
    wraps = true;
    // The rounds as the sheep tick has always counted them: a round counts as the plan wraps.
    if (leg.rounds > 0 && run.rounds + 1 >= leg.rounds) {
      li++;
      if (li >= tpl.legs.length) {
        if (tpl.after === 'repeat') li = 0;
        else return { finish: true };
      }
    }
  }
  return { finish: false, li, ni, wraps, target: tpl.legs[li]!.stops[ni]! };
}

/** Why sheep can not go into an area now, or null: cattle grazing it, or no water. */
function sheepBlockedBy(farm: FarmState, survey: Survey, to: number): PlanWaitReason | null {
  const cattle = farm.mobs.some(
    (x) =>
      x.where.kind === 'paddock' &&
      x.animals.length &&
      survey.topology.areaOf[x.where.anchor] === to,
  );
  if (cattle) return 'cattle-there';
  return grazingArea(survey, to).hasWater ? null : 'no-water';
}

/**
 * Whether a sheep plan's rule says the mob moves (or the plan ends) tonight, by the sheep tick's
 * rule: after N days on the stop (at least 1; a rule of several moves a day moves once a day for
 * sheep), or once grazed down to the figure or at the day limit, never on the day it came in.
 */
function sheepDueTonight(farm: FarmState, survey: Survey, m: SheepMob): boolean {
  const run = m.plan;
  if (!run || run.paused || m.where.kind !== 'paddock' || !m.sheep.length) return false;
  const leg = templateOf(farm, run)?.legs[run.leg];
  if (!leg) return false;
  const days = farm.day + 1 - run.moved;
  const rule = leg.rule;
  if (rule.mode === 'days') return days >= Math.max(1, rule.every);
  const area = survey.topology.areas[areaIdOf(survey, m)]!;
  return (
    days >= 1 &&
    (areaMass(farm, area.cells) <= rule.kg || (rule.maxDays > 0 && days >= rule.maxDays))
  );
}

/**
 * One move of a sheep plan, as the tick makes it: the plan ends if its rounds are done, waits if
 * the next area has cattle or no water (told once a stop), and otherwise moves the mob. Sheep put
 * with a sheep mob join it when the caller runs `mergeSheepShared`.
 */
function sheepPlanStep(
  farm: FarmState,
  survey: Survey,
  m: SheepMob,
  tpl: PlanTemplate,
  events: TickEvent[],
): 'moved' | 'blocked' | 'finished' {
  const run = m.plan!;
  const next = sheepNextOf(tpl, run);
  if (next.finish || next.wraps) run.rounds++;
  if (next.finish) {
    delete m.plan;
    events.push({ type: 'sheep-plan-finished', mob: m.id, mobName: m.name });
    return 'finished';
  }
  const { li, ni, target } = next;
  const to = survey.topology.areaOf[target]!;
  const why = sheepBlockedBy(farm, survey, to);
  if (why) {
    if (run.waiting?.target !== target) {
      run.waiting = { target, why };
      events.push({
        type: 'sheep-plan-waiting',
        mob: m.id,
        mobName: m.name,
        why,
        area: survey.topology.areas[to]!.name,
      });
    }
    return 'blocked';
  }
  const from = survey.topology.areas[areaIdOf(survey, m)]!.name;
  m.where = { kind: 'paddock', anchor: target };
  run.leg = li;
  run.idx = ni;
  run.waiting = null;
  run.moved = farm.day + 1;
  run.moves++;
  events.push({
    type: 'sheep-plan-moved',
    mob: m.id,
    mobName: m.name,
    from,
    to: survey.topology.areas[to]!.name,
  });
  return 'moved';
}

/**
 * Step 8b on a night when plan moves are left to the player (`TickEnv.plansByHand`): no sheep
 * mob is moved and every plan stays live. A plan whose move is due and whose next area is
 * blocked waits, told once a stop; one whose next area is free again stops waiting.
 */
export function holdSheepPlans(farm: FarmState, survey: Survey, events: TickEvent[]): void {
  for (const m of sheepMobsOf(farm)) {
    if (!sheepDueTonight(farm, survey, m)) continue;
    const run = m.plan!;
    const next = sheepNextOf(templateOf(farm, run)!, run);
    if (next.finish) continue;
    const to = survey.topology.areaOf[next.target]!;
    const why = sheepBlockedBy(farm, survey, to);
    if (!why) run.waiting = null;
    else if (run.waiting?.target !== next.target) {
      run.waiting = { target: next.target, why };
      events.push({
        type: 'sheep-plan-waiting',
        mob: m.id,
        mobName: m.name,
        why,
        area: survey.topology.areas[to]!.name,
      });
    }
  }
}

/** A sheep plan move due tonight, for the plan card on a night with no hand. */
export interface SheepPlanDue {
  mob: number;
  mobName: string;
  /** Where the mob is. */
  from: string | null;
  /** Where the plan moves it, or null when the move ends the plan and the mob stays. */
  to: string | null;
  /** Why the next area can not take the mob now, or null. */
  blocked: PlanWaitReason | null;
}

/** The sheep plan moves due tonight, by the sheep tick's own rule. Reads only. */
export function sheepPlansDue(farm: FarmState): SheepPlanDue[] {
  if (!farm.sheep) return [];
  const survey = surveyOf(farm);
  const out: SheepPlanDue[] = [];
  for (const m of sheepMobsOf(farm)) {
    if (!sheepDueTonight(farm, survey, m)) continue;
    const next = sheepNextOf(templateOf(farm, m.plan!)!, m.plan!);
    const here = areaIdOf(survey, m);
    const from = here < 0 ? null : survey.topology.areas[here]!.name;
    if (next.finish) {
      out.push({ mob: m.id, mobName: m.name, from, to: null, blocked: null });
      continue;
    }
    const to = survey.topology.areaOf[next.target]!;
    out.push({
      mob: m.id,
      mobName: m.name,
      from,
      to: survey.topology.areas[to]!.name,
      blocked: sheepBlockedBy(farm, survey, to),
    });
  }
  return out;
}

/**
 * A sheep plan's next move, made now by hand (the `planMove` action for a sheep mob, on a Daily
 * Farm with no hand at work). It is the sheep tick's own move, so rounds and the end of the plan
 * are counted as the tick counts them, and it is tonight's move taken early: the days on the
 * stop start from tomorrow. Sheep never go where cattle graze.
 */
export function sheepPlanMove(farm: FarmState, events: FarmEvent[], mob: number): Out {
  const m = sheepMob(farm, mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  const run = m.plan;
  if (!run) return refuse('no-plan', `${m.name} has no grazing plan.`);
  if (run.paused) return refuse('already-paused', `${m.name}'s plan is paused.`);
  if (m.where.kind !== 'paddock' || !m.sheep.length) {
    return refuse('not-on-pasture', `${m.name} is not on pasture, so its plan can not move it.`);
  }
  const tpl = templateOf(farm, run);
  if (!tpl) return refuse('no-such-plan', 'There is no such plan.');
  const s = surveyOf(farm);
  const next = sheepNextOf(tpl, run);
  const why = next.finish ? null : sheepBlockedBy(farm, s, s.topology.areaOf[next.target]!);
  if (why) {
    return refuse(
      'plan-waiting',
      why === 'cattle-there'
        ? `${m.name}'s plan can not move it: cattle are grazing in the next area. Cattle and sheep run in separate paddocks.`
        : `${m.name}'s plan can not move it: the next area has no water.`,
    );
  }
  sheepPlanStep(farm, s, m, tpl, events as TickEvent[]);
  mergeSheepShared(farm, s, events as TickEvent[]);
  return null;
}
