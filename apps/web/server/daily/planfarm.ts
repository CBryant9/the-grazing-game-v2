import {
  applyAction,
  areaIdOf,
  areaWatered,
  cloneFarm,
  createFarm,
  jobSeekers,
  sheepMobsOf,
  surveyOf,
  type FarmState,
  type SourceEnv,
} from '@gg/engine';
import { loadRealData } from '@gg/engine/server';

/** For tests: a real-year farm with the data it needs. */
export const planEnv: SourceEnv = { data: loadRealData() };

/**
 * For tests: a running farm in Central West with one mob on a plan that moves it between two
 * watered paddocks every day (or `every` days: 0.5 is two moves a day, on three paddocks).
 */
export function farmWithPlan(
  plan: { rounds?: number; after?: 'repeat' | 'stay'; legs?: 1 | 2; every?: number } = {},
): { farm: FarmState; mob: number } {
  const farm = createFarm(
    {
      seed: 11,
      district: 'cw',
      size: 'medium',
      start: { month: 8 },
      years: { kind: 'real', order: 'in-order' },
      startType: 'running',
      difficulty: 'medium',
    },
    planEnv,
  );
  const survey = surveyOf(farm);
  const wet = survey.topology.areas.filter((a) => areaWatered(survey.points, a.id));
  const mob = farm.mobs.find((m) => m.where.kind === 'paddock')!;
  const here = areaIdOf(survey, mob);
  const other = wet.find((a) => a.id !== here)!;
  const mine = survey.topology.areas[here]!;
  const third = wet.find((a) => a.id !== here && a.id !== other.id);
  const set = applyAction(
    farm,
    {
      type: 'setPlan',
      mob: mob.id,
      plan: {
        legs: [
          {
            stops:
              (plan.every ?? 1) < 1
                ? [mine.cells[0]!, other.cells[0]!, third!.cells[0]!]
                : [mine.cells[0]!, other.cells[0]!],
            rule: { mode: 'days', every: plan.every ?? 1 },
            rounds: plan.rounds ?? 0,
          },
          ...(plan.legs === 2
            ? [
                {
                  stops: [third!.cells[0]!, other.cells[0]!],
                  rule: { mode: 'days' as const, every: 1 },
                  rounds: 0,
                },
              ]
            : []),
        ],
        after: plan.after ?? 'repeat',
      },
      step: 0,
    },
    planEnv,
  );
  if (!set.ok) throw new Error(set.message);
  return { farm: set.farm, mob: mob.id };
}

/** For tests: the same farm with its first job seeker hired. */
export function withHand(farm: FarmState): FarmState {
  const hired = applyAction(farm, { type: 'hireHand', person: jobSeekers(farm)[0]!.id }, planEnv);
  if (!hired.ok) throw new Error(hired.message);
  return hired.farm;
}

/**
 * For tests: a mixed running farm in Central West with its first sheep mob on a plan that moves it
 * between two watered paddocks no stock is in, every day. The cattle stay where they are.
 */
export function farmWithSheepPlan(): { farm: FarmState; mob: number } {
  const made = createFarm(
    {
      seed: 11,
      district: 'cw',
      size: 'medium',
      start: { month: 8 },
      years: { kind: 'real', order: 'in-order' },
      startType: 'running',
      difficulty: 'medium',
      stock: 'mix',
    },
    planEnv,
  );
  const farm = cloneFarm(made);
  const survey = surveyOf(farm);
  const taken = new Set<number>();
  for (const m of farm.mobs) if (m.where.kind === 'paddock') taken.add(areaIdOf(survey, m));
  const sheep = sheepMobsOf(farm).find((m) => m.where.kind === 'paddock')!;
  for (const m of sheepMobsOf(farm)) if (m.id !== sheep.id) taken.add(areaIdOf(survey, m));
  const here = areaIdOf(survey, sheep);
  const other = survey.topology.areas.find(
    (a) => a.id !== here && !taken.has(a.id) && areaWatered(survey.points, a.id),
  )!;
  const id = farm.nextPlanId++;
  farm.plans.push({
    id,
    name: 'Sheep rotation',
    legs: [
      {
        stops: [survey.topology.areas[here]!.cells[0]!, other.cells[0]!],
        rule: { mode: 'days', every: 1 },
        rounds: 0,
      },
    ],
    after: 'repeat',
  });
  const set = applyAction(farm, { type: 'setSheepPlan', mob: sheep.id, template: id }, planEnv);
  if (!set.ok) throw new Error(set.message);
  return { farm: set.farm, mob: sheep.id };
}
