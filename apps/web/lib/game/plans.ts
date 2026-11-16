import type {
  PaddockWire,
  PlanFormWire,
  PlanLegRequestWire,
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
  /** The step to start from, counted from 0 across every leg's paddocks. */
  step: number;
  /** Legs 2 and on. The fields above are leg 1. Empty for a plan of one leg. */
  more: LegDraft[];
  /** The leg that taps on the map add paddocks to: 0 is leg 1. */
  leg: number;
}

/** One leg of a plan: its paddocks in order, its rule and its rounds. */
export type LegDraft = Pick<
  PlanDraft,
  'stops' | 'kind' | 'every' | 'times' | 'kg' | 'maxDays' | 'rounds' | 'keepGoing'
>;

/** Legs a plan may have (the server takes up to this many). */
export const MAX_LEGS = 8;

/** Leg `i` of the draft: leg 1 is the draft's own fields. */
export function legOf(d: PlanDraft, i: number): LegDraft {
  if (i <= 0) {
    const { stops, kind, every, times, kg, maxDays, rounds, keepGoing } = d;
    return { stops, kind, every, times, kg, maxDays, rounds, keepGoing };
  }
  return d.more[i - 1] ?? legOf(d, 0);
}

/** Every leg, leg 1 first. */
export function legsOf(d: PlanDraft): LegDraft[] {
  return [legOf(d, 0), ...d.more];
}

/** The change to make to the draft for a change to leg `i`. */
export function withLeg(d: PlanDraft, i: number, patch: Partial<LegDraft>): Partial<PlanDraft> {
  if (i <= 0) return patch;
  return { more: d.more.map((l, k) => (k === i - 1 ? { ...l, ...patch } : l)) };
}

/** A new leg with the server's defaults, and a set number of rounds so the plan goes on to it. */
export function newLeg(form: PlanFormWire): LegDraft {
  return {
    stops: [],
    kind: 'days',
    every: form.defaultEvery,
    times: 2,
    kg: form.defaultKg,
    maxDays: 0,
    rounds: Math.max(1, form.defaultRounds),
    keepGoing: false,
  };
}

/** Every leg's paddocks in order, as one list (what `step` counts through). */
export function allStops(d: PlanDraft): number[] {
  return legsOf(d).flatMap((l) => l.stops);
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
    more: [],
    leg: 0,
  };
}

/** The form filled in from a plan that exists, so it can be changed. */
export function draftFromPlan(
  form: PlanFormWire,
  plan: PlanWire,
  mobId: number | null,
  paddocks: readonly PaddockWire[],
): PlanDraft {
  const base = newDraft(form, mobId);
  if (plan.legs.length === 0) return base;
  const legs: LegDraft[] = plan.legs.map((leg) => {
    const stops = leg.stops
      .map((s) => s.paddock ?? paddocks.find((p) => p.cell === s.cell)?.id ?? null)
      .filter((id): id is number => id !== null);
    const t = leg.trigger;
    return {
      stops,
      kind: t.mode === 'kg' ? 'kg' : t.every < 1 ? 'times' : 'days',
      every: t.mode === 'days' && t.every >= 1 ? t.every : base.every,
      times: t.mode === 'days' && t.every < 1 ? Math.round(1 / t.every) : base.times,
      kg: t.mode === 'kg' ? t.kg : base.kg,
      maxDays: t.mode === 'kg' ? t.maxDays : 0,
      rounds: leg.rounds > 0 ? leg.rounds : base.rounds,
      keepGoing: leg.rounds === 0,
    };
  });
  const mob = plan.mobs.find((m) => m.mob === mobId);
  const total = legs.reduce((n, l) => n + l.stops.length, 0);
  return {
    ...base,
    ...legs[0]!,
    planId: plan.id,
    after: plan.after,
    more: legs.slice(1),
    step: mob ? Math.min(mob.step, Math.max(0, total - 1)) : 0,
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
export function triggerOf(d: LegDraft): PlanTriggerWire {
  if (d.kind === 'kg') return { mode: 'kg', kg: d.kg, maxDays: d.maxDays };
  if (d.kind === 'times') return { mode: 'days', every: 1 / d.times };
  return { mode: 'days', every: d.every };
}

/** What is missing before the plan can be checked, or null when it is ready. */
export function draftProblem(d: PlanDraft, form: PlanFormWire): string | null {
  if (d.mobId === null) return 'Pick the mob first.';
  const legs = legsOf(d);
  for (let i = 0; i < legs.length; i++) {
    const problem = legProblem(legs[i]!, form);
    if (problem) return legs.length > 1 ? `Leg ${i + 1}: ${problem}` : problem;
    if (i < legs.length - 1 && legs[i]!.keepGoing) {
      return `Leg ${i + 1} keeps going, so the next leg never starts. Give it a number of rounds.`;
    }
  }
  return null;
}

/** What is missing in one leg, or null. */
function legProblem(d: LegDraft, form: PlanFormWire): string | null {
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
  const legs = legsOf(d);
  const cellsOf = (stops: number[]): number[] | null => {
    const cells = stops.map((id) => paddocks.find((p) => p.id === id)?.cell);
    return cells.some((c) => c === undefined) ? null : (cells as number[]);
  };
  const first = cellsOf(d.stops);
  if (!first) return null;
  const moreLegs: PlanLegRequestWire[] = [];
  for (const leg of d.more) {
    const cells = cellsOf(leg.stops);
    if (!cells) return null;
    moreLegs.push({
      stops: cells,
      trigger: triggerOf(leg),
      rounds: leg.keepGoing ? 0 : leg.rounds,
    });
  }
  const last = legs[legs.length - 1]!;
  return {
    type: 'setPlan',
    mob: d.mobId,
    stops: first,
    trigger: triggerOf(d),
    rounds: d.keepGoing ? 0 : d.rounds,
    after: last.keepGoing ? 'repeat' : d.after,
    step: Math.min(d.step, allStops(d).length - 1),
    ...(d.planId === null ? {} : { planId: d.planId }),
    ...(moreLegs.length > 0 ? { moreLegs } : {}),
  };
}

/** The numbers shown on the map: the paddock, and its place in the order. */
export function mapBadges(
  d: PlanDraft | null,
  paddocks: readonly PaddockWire[],
): { cell: number; text: string }[] {
  if (!d) return [];
  const out: { cell: number; text: string }[] = [];
  const legs = legsOf(d);
  legs.forEach((leg, l) =>
    leg.stops.forEach((id, i) => {
      const p = paddocks.find((x) => x.id === id);
      // One leg: 1, 2, 3. More: leg and place, 1.1, 1.2, 2.1.
      if (p)
        out.push({ cell: p.cell, text: legs.length > 1 ? `${l + 1}.${i + 1}` : String(i + 1) });
    }),
  );
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
