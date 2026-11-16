import { describe, expect, it, vi } from 'vitest';
import { planFarm } from '../../test-support/plans';
import { setUp, turnedDown, work } from '../../test-support/workingDay';
import type { PlanSpec } from '../actions/types';
import { surveyOf } from './derived';
import type { FarmMob, FarmState } from './state';

/*
 * `planMove` (milestone 3.3): the plan's next move, made by hand on a Daily Farm when no hand
 * is there to make it. It is the tick's own move, so rounds, legs and the end of a plan are
 * counted as the tick counts them. `resumePlan` is not that: it starts the round again, by design
 * (MODEL.md, section 10, and the comparison with the old game), so a plan card built on it would
 * never reach the end of a plan with rounds.
 */

vi.setConfig({ testTimeout: 600_000 });

const mobOf = (farm: FarmState, id: number): FarmMob => farm.mobs.find((m) => m.id === id)!;
const areaOf = (farm: FarmState, id: number): number => {
  const m = mobOf(farm, id);
  return m.where.kind === 'paddock' ? surveyOf(farm).topology.areaOf[m.where.anchor]! : -1;
};

function planned(spec: (stops: number[]) => PlanSpec, over: { dry?: number[] } = {}) {
  const pf = planFarm('nsw', { seed: 11, dry: over.dry });
  const stocked = setUp(pf.farm, {
    type: 'buyCattle',
    cls: 'yearSteer',
    qty: 12,
    to: { cell: pf.stops[0]! },
  });
  const mob = stocked.mobs[0]!.id;
  const farm = work(stocked, { type: 'setPlan', mob, plan: spec(pf.stops), step: 0 }).farm;
  return { pf, farm, mob };
}

const oneLeg = (stops: number[], rounds: number, after: 'repeat' | 'stay'): PlanSpec => ({
  legs: [{ stops: [stops[0]!, stops[1]!], rule: { mode: 'days', every: 1 }, rounds }],
  after,
});

describe('the plan move made by hand', () => {
  it('goes to the next stop, takes the ordinary move time, and counts the move as the tick does', () => {
    const { pf, farm, mob } = planned((s) => oneLeg(s, 2, 'stay'));
    const done = work(farm, { type: 'planMove', mob });
    expect(done.job.outcome).toBe('done');
    expect(done.job.workMin).toBeGreaterThan(0);
    expect(areaOf(done.farm, mob)).toBe(surveyOf(done.farm).topology.areaOf[pf.stops[1]!]);
    expect(mobOf(done.farm, mob).plan).toMatchObject({ idx: 1, round: 0, moves: 1, rounds: 0 });
    // It is tonight's move taken early: the days on the stop start from tomorrow, as after the tick's move.
    expect(mobOf(done.farm, mob).plan!.moved).toBe(done.farm.day + 1);
    expect(done.events.some((e) => e.type === 'plan-moved')).toBe(true);
  });

  it('a plan of 2 rounds on 2 stops ends after 2 rounds and stays put when it says stay', () => {
    const { farm: first, mob } = planned((s) => oneLeg(s, 2, 'stay'));
    let farm = first;
    const rounds: number[] = [];
    for (let move = 1; move <= 3; move++) {
      farm = work(farm, { type: 'planMove', mob }).farm;
      rounds.push(mobOf(farm, mob).plan!.rounds);
    }
    // Moves 1 to 3: 0 rounds, 1 round (the second stop to the first), 1 round.
    expect(rounds).toEqual([0, 1, 1]);
    const where = areaOf(farm, mob);
    const last = work(farm, { type: 'planMove', mob });
    // The fourth move closes the second round: the plan is done and the mob stays where it is.
    expect(mobOf(last.farm, mob).plan).toBeUndefined();
    expect(areaOf(last.farm, mob)).toBe(where);
    expect(last.events.some((e) => e.type === 'plan-finished')).toBe(true);
  });

  it('with two legs, the second leg starts after the first has done its rounds', () => {
    const { farm: first, mob } = planned((s) => ({
      legs: [
        { stops: [s[0]!, s[1]!], rule: { mode: 'days', every: 1 }, rounds: 1 },
        { stops: [s[2]!, s[3]!], rule: { mode: 'days', every: 2 }, rounds: 0 },
      ],
      after: 'repeat',
    }));
    let farm = first;
    farm = work(farm, { type: 'planMove', mob }).farm;
    expect(mobOf(farm, mob).plan).toMatchObject({ leg: 0, idx: 1 });
    farm = work(farm, { type: 'planMove', mob }).farm;
    // The one round of the first leg is done: the second leg's first stop.
    expect(mobOf(farm, mob).plan).toMatchObject({ leg: 1, idx: 0, round: 0 });
  });

  it('resumePlan, by design, starts the round again, so it would never end a plan with rounds', () => {
    const { farm: first, mob } = planned((s) => oneLeg(s, 2, 'stay'));
    let farm = first;
    for (let i = 0; i < 6; i++) {
      const run = mobOf(farm, mob).plan!;
      farm = work(farm, { type: 'resumePlan', mob, step: run.idx === 0 ? 1 : 0 }).farm;
    }
    expect(mobOf(farm, mob).plan).toBeDefined();
    expect(mobOf(farm, mob).plan!.rounds).toBe(0);
  });

  it('is turned down with a plain reason: no plan, paused, or the next area has no water', () => {
    const none = setUp(planFarm('nsw', { seed: 11 }).farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 12,
      to: { cell: planFarm('nsw', { seed: 11 }).stops[0]! },
    });
    expect(turnedDown(none, { type: 'planMove', mob: none.mobs[0]!.id }).reason).toBe('no-plan');
    const { farm, mob } = planned((s) => oneLeg(s, 0, 'repeat'));
    const paused = work(farm, { type: 'pausePlan', mob }).farm;
    expect(turnedDown(paused, { type: 'planMove', mob }).reason).toBe('already-paused');
    const dry = planned((s) => oneLeg(s, 0, 'repeat'), { dry: [1] });
    expect(turnedDown(dry.farm, { type: 'planMove', mob: dry.mob }).reason).toBe('plan-waiting');
  });
});
