import 'server-only';
import {
  GRID_N,
  MIN_EVERY_DAYS,
  PLAN_FIGURES,
  areaIdOf,
  plansView,
  positionOf,
  stepOf,
  surveyOf,
  type Action,
  type FarmState,
  type JobCard,
  type PlanRule,
  type PlanView,
} from '@gg/engine';
import type {
  PlanFormWire,
  PlanLegWire,
  PlanMobWire,
  PlanStopWire,
  PlanWire,
} from '../../lib/game/types';
import {
  afterText,
  nextText,
  pausedText,
  reportLines,
  roundText,
  roundsText,
  ruleText,
  stepText,
  waitingText,
} from './planwords';

const round = (n: number, places = 0): number => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

/** The figures the plan form works within. They are the engine's own limits on a plan. */
export function planForm(): PlanFormWire {
  const F = PLAN_FIGURES;
  return {
    defaultEvery: F.defaultEvery.value,
    defaultKg: F.defaultKg.value,
    defaultRounds: F.defaultRounds.value,
    everyMax: F.maxEveryDays.value,
    kgMin: F.minKg.value,
    kgMax: F.maxKg.value,
    maxDaysMax: F.maxDaysLimit.value,
    roundsMax: F.maxRounds.value,
    maxStops: F.maxStops.value,
    timesADayMax: F.maxMovesADay.value,
  };
}

/** Why each paused mob is paused, from the farm's own messages: the newest "paused" for the mob. */
function pauseReasons(farm: FarmState): Map<number, 'asked' | 'manual-move'> {
  const out = new Map<number, 'asked' | 'manual-move'>();
  for (let i = farm.inbox.length - 1; i >= 0; i--) {
    const e = farm.inbox[i]!.event;
    if (e.type === 'plan-paused' && !out.has(e.mob)) out.set(e.mob, e.because);
    // A resume after a pause means the pause is over; the newest event for the mob wins.
    if (e.type === 'plan-resumed' && !out.has(e.mob)) out.set(e.mob, 'asked');
  }
  return out;
}

function mobWire(farm: FarmState, p: PlanView, reasons: Map<number, 'asked' | 'manual-move'>) {
  const stops = p.legs.flatMap((l) => l.stops);
  return (m: PlanView['mobs'][number]): PlanMobWire => {
    const here = stops[m.step]?.area ?? null;
    const movedByHand = m.area !== null && here !== null && m.area !== here;
    const leg = p.legs[m.leg];
    return {
      mob: m.mob,
      mobName: m.mobName,
      head: m.head,
      area: m.area,
      step: m.step,
      stepText: stepText(m.step, p.steps, here ?? 'a paddock'),
      roundText: roundText(m.roundInLeg, leg?.rounds ?? 0),
      paused: m.paused,
      pausedText: m.paused ? pausedText(reasons.get(m.mob) ?? null, movedByHand) : null,
      waitingText: m.waiting ? waitingText(m.waiting.area) : null,
      nextText: nextText(m.next, farm.day),
      report: reportLines(m),
    };
  };
}

/** The farm's grazing plans for the Plans tab, in words, with the mobs on each. */
export function plansWire(farm: FarmState): PlanWire[] {
  const view = plansView(farm);
  if (!view.length) return [];
  const topo = surveyOf(farm).topology;
  const reasons = pauseReasons(farm);
  return view.map((p) => {
    const legs: PlanLegWire[] = p.legs.map((l) => ({
      stops: l.stops.map((s): PlanStopWire => ({
        cell: s.cell,
        paddock: topo.paddockOf[s.cell] ?? null,
        name: s.area,
        hasWater: s.hasWater,
      })),
      trigger:
        // Rounded as everywhere else: days to two places (a plan can move more than once a day), kg DM/ha whole.
        l.rule.mode === 'days'
          ? { mode: 'days', every: round(l.rule.every, 2) }
          : { mode: 'kg', kg: round(l.rule.kg), maxDays: round(l.rule.maxDays) },
      ruleText: ruleText(l.rule),
      rounds: l.rounds,
      roundsText: roundsText(l.rounds),
    }));
    return {
      id: p.id,
      name: p.name,
      legs,
      after: p.after,
      afterText: afterText(p.after),
      editable: p.legs.length === 1,
      mobs: p.mobs.map(mobWire(farm, p, reasons)),
    };
  });
}

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;

/** Check the rule the plan form sends. The engine checks the figures again and says why in words. */
function parseTrigger(t: unknown): PlanRule | null {
  if (typeof t !== 'object' || t === null) return null;
  const r = t as Record<string, unknown>;
  const F = PLAN_FIGURES;
  if (r.mode === 'days') {
    const every = r.every;
    if (typeof every !== 'number' || !Number.isFinite(every)) return null;
    if (every < MIN_EVERY_DAYS || every > F.maxEveryDays.value) return null;
    return { mode: 'days', every };
  }
  if (r.mode === 'kg') {
    const kg = r.kg;
    if (typeof kg !== 'number' || !Number.isFinite(kg)) return null;
    if (kg < F.minKg.value || kg > F.maxKg.value) return null;
    const maxDays = int(r.maxDays, 0, F.maxDaysLimit.value);
    return maxDays === null ? null : { mode: 'kg', kg, maxDays };
  }
  return null;
}

/** Check a setPlan or resumePlan request. Whole numbers in range, a short list of squares, a known rule. */
export function parsePlanAction(a: Record<string, unknown>): Action | null {
  const mob = int(a.mob, 1, 1e6);
  if (mob === null) return null;
  if (a.type === 'resumePlan') {
    if (a.step === undefined) return { type: 'resumePlan', mob };
    const step = int(a.step, 0, PLAN_FIGURES.maxStops.value * PLAN_FIGURES.maxLegs.value);
    return step === null ? null : { type: 'resumePlan', mob, step };
  }
  if (a.type !== 'setPlan') return null;
  const F = PLAN_FIGURES;
  if (!Array.isArray(a.stops) || a.stops.length < 1 || a.stops.length > F.maxStops.value) {
    return null;
  }
  const stops: number[] = [];
  for (const c of a.stops as unknown[]) {
    const cell = int(c, 0, GRID_N - 1);
    if (cell === null) return null;
    stops.push(cell);
  }
  const rule = parseTrigger(a.trigger);
  const rounds = int(a.rounds, 0, F.maxRounds.value);
  const step = int(a.step, 0, stops.length - 1);
  if (!rule || rounds === null || step === null) return null;
  if (a.after !== 'repeat' && a.after !== 'stay') return null;
  const id = a.planId === undefined ? undefined : int(a.planId, 1, 1e6);
  if (id === null) return null;
  return {
    type: 'setPlan',
    mob,
    plan: {
      ...(id === undefined ? {} : { id }),
      legs: [{ stops, rule, rounds }],
      after: a.after,
    },
    step,
  };
}

/** The lines on the plan card: where the mob goes now, what the plan does after, and the time. */
export function planLines(farm: FarmState, action: Action, card: JobCard): string[] {
  if (action.type !== 'setPlan' && action.type !== 'resumePlan') return [];
  const m = farm.mobs.find((x) => x.id === action.mob);
  if (!m) return [];
  const survey = surveyOf(farm);
  const topo = survey.topology;
  const nameOf = (cell: number): string => topo.areas[topo.areaOf[cell]!]!.name;
  let cell: number | undefined;
  const lines: string[] = [];
  if (action.type === 'setPlan') {
    if (!('legs' in action.plan)) return [];
    const leg = action.plan.legs[0];
    cell = leg?.stops[action.step ?? 0];
    if (leg) {
      lines.push(ruleText(leg.rule));
      lines.push(`${roundsText(leg.rounds ?? 0)}. ${afterText(action.plan.after)}`);
    }
  } else if (m.plan) {
    const tpl = farm.plans.find((t) => t.id === m.plan!.template);
    if (tpl) {
      const step = action.step ?? stepOf(tpl, m.plan.leg, m.plan.idx);
      const pos = positionOf(tpl, step);
      if (pos) cell = tpl.legs[pos.leg]!.stops[pos.idx];
    }
  }
  const out: string[] = [];
  const notes: string[] = [];
  if (cell !== undefined) {
    const to = nameOf(cell);
    const at = m.where.kind === 'paddock' && areaIdOf(survey, m) === topo.areaOf[cell];
    out.push(
      at
        ? `${m.name} is already in ${to}, so it does not move now.`
        : `${m.name} moves into ${to} now.`,
    );
    out.push('Setting a plan takes none of the day.');
    // What the engine found in the plan: stops with no water, and stops that hold another mob.
    for (const area of card.plan?.dryAreas ?? []) {
      notes.push(`${area} has no water. The plan waits there until it has water.`);
    }
    for (const j of card.plan?.joins ?? []) {
      notes.push(
        j.area === to
          ? `${j.mobName} (${j.head} head) is in ${j.area}, so the two mobs join now.`
          : `${j.mobName} (${j.head} head) is in ${j.area}. The two mobs will join when the plan gets there.`,
      );
    }
  }
  return [...out, ...lines, ...notes];
}
