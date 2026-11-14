import type {
  PaddockWire,
  PlanFormWire,
  PlanTriggerWire,
  PlanWire,
  SimpleAction,
  Snapshot,
} from './types';

/**
 * The pure parts of the plan form: what the player has picked so far, the
 * job it makes, and what is still missing. No React here, and no rule of
 * the game: the server checks the plan and says what it will do.
 */

export type RuleKind = 'days' | 'times' | 'kg';

export interface PlanDraft {
  /** The mob the plan is for, or null while the player picks one. */
  mobId: number | null;
  /** Set when an existing plan is being changed. */
  planId: number | null;
  /** The paddocks, in the order the mob will visit them. */
  stops: number[];
  kind: RuleKind;
  /** Move every this many days. */
  every: number;
  /** Move this many times a day. */
  times: number;
  /** Move when feed is down to this, kg DM/ha. */
  kg: number;
  /** Or after this many days. 0 is no limit. */
  maxDays: number;
  /** Rounds to do. Ignored when `keepGoing`. */
  rounds: number;
  keepGoing: boolean;
  after: 'repeat' | 'stay';
  /** The step to start from, counted from 0. */
  step: number;
}

/** A new form with the server's defaults. */
export function newDraft(form: PlanFormWire, mobId: number | null = null): PlanDraft {
  return {
    mobId,
    planId: null,
    stops: [],
    kind: 'days',
    every: form.defaultEvery,
    times: 2,
    kg: form.defaultKg,
    maxDays: 0,
    rounds: form.defaultRounds,
    keepGoing: true,
    after: 'repeat',
    step: 0,
  };
}

/** The form filled in from a plan that exists, so it can be changed. */
export function draftFromPlan(
  form: PlanFormWire,
  plan: PlanWire,
  mobId: number | null,
  paddocks: readonly PaddockWire[],
): PlanDraft {
  const leg = plan.legs[0];
  const base = newDraft(form, mobId);
  if (!leg) return base;
  const stops = leg.stops
    .map((s) => s.paddock ?? paddocks.find((p) => p.cell === s.cell)?.id ?? null)
    .filter((id): id is number => id !== null);
  const t = leg.trigger;
  const mob = plan.mobs.find((m) => m.mob === mobId);
  return {
    ...base,
    planId: plan.id,
    stops,
    kind: t.mode === 'kg' ? 'kg' : t.every < 1 ? 'times' : 'days',
    every: t.mode === 'days' && t.every >= 1 ? t.every : base.every,
    times: t.mode === 'days' && t.every < 1 ? Math.round(1 / t.every) : base.times,
    kg: t.mode === 'kg' ? t.kg : base.kg,
    maxDays: t.mode === 'kg' ? t.maxDays : 0,
    rounds: leg.rounds > 0 ? leg.rounds : base.rounds,
    keepGoing: leg.rounds === 0,
    after: plan.after,
    step: mob ? Math.min(mob.step, Math.max(0, stops.length - 1)) : 0,
  };
}

/** Add a paddock to the end of the order, or take it out if it is already there. */
export function toggleStop(stops: readonly number[], paddock: number): number[] {
  return stops.includes(paddock) ? stops.filter((id) => id !== paddock) : [...stops, paddock];
}

/** Move a stop one place earlier or later. */
export function moveStop(stops: readonly number[], index: number, by: -1 | 1): number[] {
  const to = index + by;
  if (index < 0 || index >= stops.length || to < 0 || to >= stops.length) return [...stops];
  const out = [...stops];
  [out[index], out[to]] = [out[to]!, out[index]!];
  return out;
}

/** The rule the form has, as the server takes it. */
export function triggerOf(d: PlanDraft): PlanTriggerWire {
  if (d.kind === 'kg') return { mode: 'kg', kg: d.kg, maxDays: d.maxDays };
  if (d.kind === 'times') return { mode: 'days', every: 1 / d.times };
  return { mode: 'days', every: d.every };
}

/** What is missing before the plan can be checked, or null when it is ready. */
export function draftProblem(d: PlanDraft, form: PlanFormWire): string | null {
  if (d.mobId === null) return 'Pick the mob first.';
  if (d.stops.length === 0) return 'Pick at least one paddock.';
  if (d.kind === 'times' && d.stops.length < 2) {
    return 'A plan that moves several times a day needs at least two paddocks.';
  }
  if (d.kind === 'days' && !(d.every >= 1 && d.every <= form.everyMax)) {
    return `Move every 1 to ${form.everyMax} days.`;
  }
  if (d.kind === 'kg' && !(d.kg >= form.kgMin && d.kg <= form.kgMax)) {
    return `Pick a feed figure from ${form.kgMin} to ${form.kgMax} kg DM/ha.`;
  }
  if (
    d.kind === 'kg' &&
    !(Number.isInteger(d.maxDays) && d.maxDays >= 0 && d.maxDays <= form.maxDaysMax)
  ) {
    return `The day limit is 0 (none) to ${form.maxDaysMax} days.`;
  }
  if (
    !d.keepGoing &&
    !(Number.isInteger(d.rounds) && d.rounds >= 1 && d.rounds <= form.roundsMax)
  ) {
    return `Rounds are 1 to ${form.roundsMax}.`;
  }
  return null;
}

/** The job the form makes, or null while something is missing. */
export function draftAction(
  d: PlanDraft,
  paddocks: readonly PaddockWire[],
  form: PlanFormWire,
): SimpleAction | null {
  if (draftProblem(d, form) !== null || d.mobId === null) return null;
  const cells = d.stops.map((id) => paddocks.find((p) => p.id === id)?.cell);
  if (cells.some((c) => c === undefined)) return null;
  return {
    type: 'setPlan',
    mob: d.mobId,
    stops: cells as number[],
    trigger: triggerOf(d),
    rounds: d.keepGoing ? 0 : d.rounds,
    after: d.keepGoing ? 'repeat' : d.after,
    step: Math.min(d.step, d.stops.length - 1),
    ...(d.planId === null ? {} : { planId: d.planId }),
  };
}

/** The numbers shown on the map: the paddock, and its place in the order. */
export function mapBadges(
  d: PlanDraft | null,
  paddocks: readonly PaddockWire[],
): { cell: number; text: string }[] {
  if (!d) return [];
  const out: { cell: number; text: string }[] = [];
  d.stops.forEach((id, i) => {
    const p = paddocks.find((x) => x.id === id);
    if (p) out.push({ cell: p.cell, text: String(i + 1) });
  });
  return out;
}

/** The mobs a plan can be made for: every mob on the farm, with where it is. */
export function planMobs(snapshot: Snapshot): Snapshot['mobs'] {
  return [...snapshot.mobs].sort((a, b) =>
    a.name.localeCompare(b.name, 'en-AU', { numeric: true }),
  );
}

/** The mobs on no plan. */
export function mobsWithoutPlan(snapshot: Snapshot): Snapshot['mobs'] {
  const on = new Set(snapshot.plans.flatMap((p) => p.mobs.map((m) => m.mob)));
  return planMobs(snapshot).filter((m) => !on.has(m.id));
}
