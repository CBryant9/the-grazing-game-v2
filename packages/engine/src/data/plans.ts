/**
 * Grazing plan figures (PRD 5.15; docs/DATA.md, "Grazing plans").
 *
 * Each figure carries its source. `old game` is the MVP's own figure or
 * default (reference/mvp/grazing-game.html). `builder` is the builder's
 * choice, for Claudia to check. None is a looked-up real-world figure.
 */

export type PlanFigureSource = 'old game' | 'builder';

export interface PlanFigure {
  value: number;
  unit: string;
  source: PlanFigureSource;
  /** Where it comes from, or what the builder's rule is. */
  from: string;
}

const fig = (value: number, unit: string, source: PlanFigureSource, from: string): PlanFigure => ({
  value,
  unit,
  source,
  from,
});

export const PLAN_FIGURES = {
  /** The most moves a day a rule can make. The old game's plan dialog went down to this. */
  maxMovesADay: fig(
    4,
    'moves a day',
    'old game',
    'REQUIREMENTS: "move every N days (down to 4 moves a day)"',
  ),
  /** Defaults for a new leg: the old game's `newPlanFor`. */
  defaultEvery: fig(3, 'days', 'old game', 'newPlanFor: every: 3'),
  defaultKg: fig(1500, 'kg DM/ha', 'old game', 'newPlanFor: kg: 1500'),
  defaultRounds: fig(1, 'rounds', 'old game', 'newPlanFor: rounds: 1'),
  /** The lowest "grazed down to" figure. The old game clamped anything lower up to this. */
  minKg: fig(300, 'kg DM/ha', 'old game', 'commitPlan: Math.max(300, ...)'),
  /** The old game had no upper limits. These stop a request that can mean nothing. */
  maxKg: fig(5000, 'kg DM/ha', 'builder', 'Not in the old game'),
  maxEveryDays: fig(60, 'days', 'builder', 'Not in the old game'),
  maxDaysLimit: fig(365, 'days', 'builder', 'Not in the old game'),
  maxRounds: fig(99, 'rounds', 'builder', 'Not in the old game'),
  maxLegs: fig(8, 'legs', 'builder', 'Not in the old game'),
  maxStops: fig(30, 'stops in a leg', 'builder', 'Not in the old game'),
  maxTemplates: fig(20, 'plans', 'builder', 'Not in the old game'),
  /** How often a "grazed down to" plan says a mob is still in its area. The old game's figure. */
  stayingNoteDays: fig(7, 'days', 'old game', 'stepDay: stay>=7 && stay-(p.noted||0)>=7'),
  /** A mob must lose more than this, kg a day, in the new area for a plan move to say so. The old game's figure. */
  losingKgDay: fig(0.05, 'kg a day', 'old game', 'planStep: gain<-.05'),
} as const;

/** The lowest `every` a days rule can have: 4 moves a day. */
export const MIN_EVERY_DAYS = 1 / PLAN_FIGURES.maxMovesADay.value;
