/**
 * Grazing plans (PRD 5.15; docs/MODEL.md, section 10).
 *
 * A plan is a template: one or more legs, each with the paddocks to visit
 * in order, a rule for when to move on and a number of rounds. A mob runs a
 * template from a step. This is the old game's plan code (`normPlan`,
 * `perDayOf`, `planSubs`, `planStep` and the plan part of `stepDay`),
 * with one fault fixed (BUILD_PLAN 2.4): a plan that can not move a mob
 * does not count rounds. Rounds count only when the mob moves.
 *
 * Plans act in two places:
 *
 *   - `stopsToday` gives the cattle step the day's stops when a plan moves
 *     a mob more than once a day. It is read in step 4 of the tick, before
 *     the day's moves, as the old game's `planSubs` was.
 *   - `runPlans` is step 8 of the tick: the plan moves, in the farm's order
 *     of mobs. Each move takes the ordinary move time off the light of the
 *     day it happens on (builder's rule, docs/DATA.md).
 *
 * Nothing here reads a clock or draws a random number.
 */

import type { GrazingLand } from '../cattle/types';
import { predictGains } from '../cattle/gains';
import { PLAN_FIGURES } from '../data/plans';
import type { Survey } from '../farm/layout';
import { areaIdOf, grazingArea, surveyOf } from './derived';
import { mergeShared } from './mobs';
import type { TickEvent, PlanReport } from './events';
import type {
  FarmMob,
  FarmState,
  PlanLeg,
  PlanRule,
  PlanRun,
  PlanTemplate,
  PlanWaitReason,
} from './state';

/** How many moves a rule makes in a day: 1, or more for a days rule under 1. The old game's `perDayOf`. */
export const perDay = (rule: PlanRule): number =>
  rule.mode === 'days' && rule.every < 1 ? Math.round(1 / rule.every) : 1;

/** The template a mob is running, or undefined. */
export const templateOf = (
  farm: Pick<FarmState, 'plans'>,
  run: PlanRun,
): PlanTemplate | undefined => farm.plans.find((t) => t.id === run.template);

/** The stops in a template, counting every leg. */
export const stepsIn = (tpl: PlanTemplate): number =>
  tpl.legs.reduce((n, l) => n + l.stops.length, 0);

/** The leg and stop a step is. Steps count from the first stop of the first leg. Null off the end. */
export function positionOf(tpl: PlanTemplate, step: number): { leg: number; idx: number } | null {
  if (!Number.isInteger(step) || step < 0) return null;
  let left = step;
  for (let leg = 0; leg < tpl.legs.length; leg++) {
    const n = tpl.legs[leg]!.stops.length;
    if (left < n) return { leg, idx: left };
    left -= n;
  }
  return null;
}

/** The step for a leg and stop. */
export function stepOf(tpl: PlanTemplate, leg: number, idx: number): number {
  let step = idx;
  for (let l = 0; l < leg; l++) step += tpl.legs[l]!.stops.length;
  return step;
}

/**
 * Today's stops for a mob whose plan moves it more than once a day: one
 * square in each grazing area, in order, from the stop it is on. Null for a
 * mob that stays put all day: no plan, a paused plan, or a plan that moves
 * once a day or less. The cattle step keeps the stops that have water.
 */
export function stopsToday(farm: FarmState, mob: FarmMob): readonly number[] | null {
  const run = mob.plan;
  if (!run || run.paused || mob.where.kind !== 'paddock') return null;
  const tpl = templateOf(farm, run);
  const leg = tpl?.legs[run.leg];
  if (!leg) return null;
  const k = perDay(leg.rule);
  if (k <= 1) return null;
  const out: number[] = [];
  for (let j = 0; j < k; j++) out.push(leg.stops[(run.idx + j) % leg.stops.length]!);
  return out;
}

/** The plan's report so far. */
export function reportOf(farm: Pick<FarmState, 'day'>, run: PlanRun): PlanReport {
  return {
    days: Math.max(1, farm.day - run.start),
    moves: run.moves,
    rounds: run.rounds,
    eatenKg: run.eatenKg,
    headDays: run.headDays,
    gainKg: run.gainKg,
  };
}

/** A fresh run on a template at a leg and stop, with its counts at nothing. */
export function newRun(
  farm: Pick<FarmState, 'day'>,
  tpl: PlanTemplate,
  leg: number,
  idx: number,
): PlanRun {
  return {
    template: tpl.id,
    leg,
    idx,
    round: 0,
    moved: farm.day,
    noted: 0,
    waiting: null,
    paused: false,
    start: farm.day,
    moves: 0,
    rounds: 0,
    eatenKg: 0,
    headDays: 0,
    gainKg: 0,
  };
}

/** Feed on an area: average green plus dead feed over its squares, kg DM/ha. The old game's `regionStats(r).mass`. */
function areaMass(farm: FarmState, cells: readonly number[]): number {
  const { G, D } = farm.pasture;
  let g = 0;
  let d = 0;
  for (const i of cells) {
    g += G[i]!;
    d += D[i]!;
  }
  return (g + d) / cells.length;
}

type StepResult = 'moved' | 'blocked' | 'finished';

/**
 * One move of a plan: the old game's `planStep`. Works out where the plan
 * goes next. It finishes the plan if its rounds are done, waits if the next
 * area has no water, and otherwise moves the mob.
 *
 * The one fix: nothing about the rounds changes unless the mob moves (or
 * the plan finishes). A plan that is waiting looks at the same next stop
 * each day and counts nothing.
 */
function planStep(
  farm: FarmState,
  survey: Survey,
  land: GrazingLand,
  m: FarmMob,
  tpl: PlanTemplate,
  because: 'days' | 'kg' | 'max-days',
  massKgHa: number | null,
  events: TickEvent[],
): StepResult {
  const run = m.plan!;
  const old = tpl.legs[run.leg]!;
  let ni = run.idx + 1;
  let round = run.round;
  let leg = run.leg;
  let roundDone = false;
  let legStarted: number | null = null;
  let restarted = false;
  if (ni >= old.stops.length) {
    ni = 0;
    roundDone = true;
    round++;
    if (old.rounds > 0 && round >= old.rounds) {
      round = 0;
      leg++;
      if (leg >= tpl.legs.length) {
        if (tpl.after === 'repeat') {
          leg = 0;
          restarted = true;
        } else {
          // The plan is done. The last round counts, and the mob stays where it is.
          run.rounds++;
          events.push({
            type: 'plan-finished',
            mob: m.id,
            mobName: m.name,
            area: survey.topology.areas[areaIdOf(survey, m)]!.name,
            report: reportOf(farm, run),
          });
          delete m.plan;
          return 'finished';
        }
      } else legStarted = leg;
    }
  }
  const target = tpl.legs[leg]!.stops[ni]!;
  const areaId = survey.topology.areaOf[target]!;
  const area = grazingArea(survey, areaId);
  const step = stepOf(tpl, leg, ni);
  if (!area.hasWater) {
    // Said once for each stop, as the old game said it once for each stop.
    if (run.waiting?.target !== target) {
      run.waiting = { target, why: 'no-water' };
      events.push({
        type: 'plan-waiting',
        mob: m.id,
        mobName: m.name,
        template: tpl.id,
        why: 'no-water',
        area: survey.topology.areas[areaId]!.name,
        cell: target,
        step,
      });
    }
    return 'blocked';
  }

  // The move takes none of the day's light, as in the old game. If another mob
  // is in the area the two join, as in the old game (`mergeShared`: the bigger
  // keeps its name, and its own plan, or takes this one if it has none).
  const head = m.animals.length;
  const from = areaIdOf(survey, m);
  m.where = { kind: 'paddock', anchor: target };
  mergeShared(farm, survey, events);
  run.leg = leg;
  run.idx = ni;
  run.round = round;
  if (roundDone) run.rounds++;
  run.noted = 0;
  run.waiting = null;
  run.moved = farm.day + 1;
  run.moves++;
  const movesADay = perDay(tpl.legs[leg]!.rule);
  const losing =
    movesADay === 1
      ? predictGains(m, land, area).filter((g) => g.gain < -PLAN_FIGURES.losingKgDay.value)
      : [];
  events.push({
    type: 'plan-moved',
    mob: m.id,
    mobName: m.name,
    template: tpl.id,
    templateName: tpl.name,
    from: from < 0 ? null : survey.topology.areas[from]!.name,
    to: survey.topology.areas[areaId]!.name,
    cell: target,
    leg,
    stop: ni,
    step,
    because,
    massKgHa,
    movesADay,
    head,
    roundDone,
    legStarted,
    restarted,
    rounds: run.rounds,
    moves: run.moves,
    losing,
  });
  return 'moved';
}

/**
 * Step 8 of the tick: the plans move mobs. Each mob with a running plan
 * (not paused, on pasture, with cattle) is looked at in the farm's order of
 * mobs. A plan that moves several times a day makes all of today's moves.
 * Any other plan moves when its rule says so: after N days on the stop, or
 * when the area is grazed down to its figure, or at its day limit.
 */
export function runPlans(
  farm: FarmState,
  survey: Survey,
  land: GrazingLand,
  events: TickEvent[],
): void {
  for (const m of farm.mobs) {
    const run = m.plan;
    if (!run || run.paused || m.where.kind !== 'paddock' || !m.animals.length) continue;
    const tpl = templateOf(farm, run);
    const leg: PlanLeg | undefined = tpl?.legs[run.leg];
    if (!tpl || !leg) continue;
    const rule = leg.rule;
    const k = perDay(rule);
    if (k > 1) {
      // Several moves a day. The cattle step has already grazed the day's stops.
      for (let j = 0; j < k && m.plan; j++) {
        if (planStep(farm, survey, land, m, tpl, 'days', null, events) === 'blocked') break;
      }
      continue;
    }
    const stay = farm.day + 1 - run.moved;
    let go = false;
    let because: 'days' | 'kg' | 'max-days' = 'days';
    let mass: number | null = null;
    if (rule.mode === 'days') go = stay >= rule.every;
    else {
      const areaId = areaIdOf(survey, m);
      mass = areaMass(farm, survey.topology.areas[areaId]!.cells);
      because = 'kg';
      go = stay >= 1 && mass <= rule.kg;
      if (!go && rule.maxDays && stay >= rule.maxDays) {
        go = true;
        because = 'max-days';
      }
      const every = PLAN_FIGURES.stayingNoteDays.value;
      if (!go && stay >= every && stay - run.noted >= every) {
        run.noted = stay;
        events.push({
          type: 'plan-staying',
          mob: m.id,
          mobName: m.name,
          area: survey.topology.areas[areaId]!.name,
          days: stay,
          massKgHa: mass,
          moveAtKg: rule.kg,
        });
      }
    }
    if (go) planStep(farm, survey, land, m, tpl, because, mass, events);
  }
}

// ---------------------------------------------------------------------------
// Looking at plans
// ---------------------------------------------------------------------------

/** A square a plan visits, with the area it is in. */
export interface PlanStopView {
  cell: number;
  area: string;
  hasWater: boolean;
}

export interface PlanLegView {
  stops: PlanStopView[];
  rule: PlanRule;
  /** Rounds to do in this leg. 0 keeps going. */
  rounds: number;
}

/** What a plan will do next for a mob, as a fact. */
export type PlanNext =
  /** The plan is paused. It does nothing until it is resumed. */
  | { kind: 'paused' }
  /** The plan can not move the mob now. `why` is the reason. It tries again each day. */
  | { kind: 'waiting'; why: PlanWaitReason; area: string; cell: number }
  /** The plan's rounds are done: the next move ends the plan and the mob stays. */
  | { kind: 'finish' }
  /**
   * The next move is to `area`. For a days rule, `onDay` is the farm day at
   * the end of which the mob moves. For a "grazed down to" rule, it moves
   * once the area is at `kg` or less (it is at `massKgHa` now), and by the
   * end of farm day `latestDay` at the latest (null with no day limit).
   * `movesADay` is more than 1 for a rule under a day.
   */
  | {
      kind: 'move';
      area: string;
      cell: number;
      rule: 'days' | 'kg';
      onDay: number | null;
      kg: number | null;
      massKgHa: number | null;
      latestDay: number | null;
      movesADay: number;
    };

/** One mob on a plan. */
export interface PlanMobView {
  mob: number;
  mobName: string;
  head: number;
  /** The mob is on pasture (a plan moves nothing for a mob in the feedlot or the yards). */
  onPasture: boolean;
  /** Where the mob is now. */
  area: string | null;
  /** The step it is on, counted from the first stop of the first leg, and the leg and stop in it. */
  step: number;
  leg: number;
  stop: number;
  /** Full rounds made, rounds of the leg done so far, and moves made. */
  roundsDone: number;
  roundInLeg: number;
  moves: number;
  /** Days since the plan was set. */
  days: number;
  /** Days the mob has been on this stop, counting today. */
  daysOnStop: number;
  paused: boolean;
  /** Set when the plan can not move the mob: the area it wants and why not. */
  waiting: { why: PlanWaitReason; area: string; cell: number } | null;
  next: PlanNext;
  /** Feed the mob ate in the paddock while on the plan, kg DM, and head-days. */
  eatenKg: number;
  headDays: number;
  gainKg: number;
}

export interface PlanView {
  id: number;
  name: string;
  legs: PlanLegView[];
  /** The stops in all, counting every leg. */
  steps: number;
  after: 'repeat' | 'stay';
  /** Every mob on this plan. */
  mobs: PlanMobView[];
}

/**
 * Every plan on the farm for the screens: its paddocks in order, its rule,
 * the step each mob is on, rounds done, whether each is paused or waiting
 * and why, and what each will do next. Facts only. Looking is free:
 * nothing changes.
 */
export function plansView(farm: FarmState): PlanView[] {
  const survey = surveyOf(farm);
  const topo = survey.topology;
  const nameOf = (cell: number): string => topo.areas[topo.areaOf[cell]!]!.name;
  return farm.plans.map((tpl) => {
    const legs: PlanLegView[] = tpl.legs.map((l) => ({
      stops: l.stops.map((cell) => ({
        cell,
        area: nameOf(cell),
        hasWater: grazingArea(survey, topo.areaOf[cell]!).hasWater,
      })),
      rule: l.rule,
      rounds: l.rounds,
    }));
    const mobs: PlanMobView[] = [];
    for (const m of farm.mobs) {
      const run = m.plan;
      if (!run || run.template !== tpl.id) continue;
      const leg = tpl.legs[run.leg]!;
      const rule = leg.rule;
      const areaId = areaIdOf(survey, m);
      const waiting = run.waiting
        ? { why: run.waiting.why, area: nameOf(run.waiting.target), cell: run.waiting.target }
        : null;
      // Where the plan goes next, worked out as `planStep` does.
      let ni = run.idx + 1;
      let nl = run.leg;
      let finishes = false;
      if (ni >= leg.stops.length) {
        ni = 0;
        if (leg.rounds > 0 && run.round + 1 >= leg.rounds) {
          nl++;
          if (nl >= tpl.legs.length) {
            if (tpl.after === 'repeat') nl = 0;
            else finishes = true;
          }
        }
      }
      const cell = finishes ? -1 : tpl.legs[nl]!.stops[ni]!;
      let next: PlanNext;
      if (run.paused) next = { kind: 'paused' };
      else if (waiting) next = { kind: 'waiting', ...waiting };
      else if (finishes) next = { kind: 'finish' };
      else {
        const movesADay = perDay(rule);
        if (rule.mode === 'days') {
          next = {
            kind: 'move',
            area: nameOf(cell),
            cell,
            rule: 'days',
            onDay:
              movesADay > 1 ? farm.day : Math.max(farm.day, run.moved + Math.ceil(rule.every) - 1),
            kg: null,
            massKgHa: null,
            latestDay: null,
            movesADay,
          };
        } else {
          next = {
            kind: 'move',
            area: nameOf(cell),
            cell,
            rule: 'kg',
            onDay: null,
            kg: rule.kg,
            massKgHa: areaId < 0 ? null : areaMass(farm, topo.areas[areaId]!.cells),
            latestDay: rule.maxDays ? Math.max(farm.day, run.moved + rule.maxDays - 1) : null,
            movesADay,
          };
        }
      }
      mobs.push({
        mob: m.id,
        mobName: m.name,
        head: m.animals.length,
        onPasture: m.where.kind === 'paddock',
        area: areaId < 0 ? null : topo.areas[areaId]!.name,
        step: stepOf(tpl, run.leg, run.idx),
        leg: run.leg,
        stop: run.idx,
        roundsDone: run.rounds,
        roundInLeg: run.round,
        moves: run.moves,
        days: Math.max(0, farm.day - run.start),
        daysOnStop: Math.max(0, farm.day - run.moved + 1),
        paused: run.paused,
        waiting,
        next,
        eatenKg: run.eatenKg,
        headDays: run.headDays,
        gainKg: run.gainKg,
      });
    }
    return {
      id: tpl.id,
      name: tpl.name,
      legs,
      steps: stepsIn(tpl),
      after: tpl.after,
      mobs,
    };
  });
}
