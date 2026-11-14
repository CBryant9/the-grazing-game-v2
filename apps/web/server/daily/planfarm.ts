import {
  applyAction,
  areaIdOf,
  areaWatered,
  createFarm,
  jobSeekers,
  surveyOf,
  type FarmState,
  type SourceEnv,
} from '@gg/engine';
import { loadRealData } from '@gg/engine/server';

/** For tests: a real-year farm with the data it needs. */
export const planEnv: SourceEnv = { data: loadRealData() };

/** For tests: a running farm in Central West with one mob on a plan that moves it between two watered paddocks every day. */
export function farmWithPlan(): { farm: FarmState; mob: number } {
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
  const set = applyAction(
    farm,
    {
      type: 'setPlan',
      mob: mob.id,
      plan: {
        legs: [
          { stops: [mine.cells[0]!, other.cells[0]!], rule: { mode: 'days', every: 1 }, rounds: 0 },
        ],
        after: 'repeat',
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
