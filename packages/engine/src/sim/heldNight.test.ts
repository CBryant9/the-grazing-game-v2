import { describe, expect, it, vi } from 'vitest';
import { planFarm } from '../../test-support/plans';
import { setUp, turnedDown, work } from '../../test-support/workingDay';
import type { PlanSpec } from '../actions/types';
import { endDay } from '../day/days';
import { addSheepMob, sheepMobsOf } from '../sheep/farm';
import { sheepPlansDue } from '../sheep/moves';
import { createFarm } from './create';
import { areaIdOf, surveyOf } from './derived';
import { planDueTonight, plansView, stopsToday } from './plans';
import { cloneFarm, type FarmMob, type FarmState } from './state';

/*
 * A night with grazing plan moves left to the player (m7.1): a Daily Farm with no hand at work.
 * The engine's own way to run it (`plansByHand`), in place of the player-facing "paused" state:
 * the plan stays live, the tick moves no mob, and the plan's report counts what really happened.
 */

vi.setConfig({ testTimeout: 600_000 });

const byHand = { plansByHand: true } as const;
const mobOf = (farm: FarmState, id: number): FarmMob => farm.mobs.find((m) => m.id === id)!;
const areaOf = (farm: FarmState, id: number): number => areaIdOf(surveyOf(farm), mobOf(farm, id));

function planned(spec: (stops: number[]) => PlanSpec, head = 12) {
  const pf = planFarm('nsw', { seed: 11 });
  const stocked = setUp(pf.farm, {
    type: 'buyCattle',
    cls: 'yearSteer',
    qty: head,
    to: { cell: pf.stops[0]! },
  });
  const mob = stocked.mobs[0]!.id;
  const farm = work(stocked, { type: 'setPlan', mob, plan: spec(pf.stops), step: 0 }).farm;
  return { pf, farm, mob };
}

const daily = (stops: number[]): PlanSpec => ({
  legs: [{ stops: [stops[0]!, stops[1]!], rule: { mode: 'days', every: 1 }, rounds: 0 }],
  after: 'repeat',
});

/** Feed on an area, kg DM in all. */
function feedIn(farm: FarmState, cell: number): number {
  const s = surveyOf(farm);
  const area = s.topology.areas[s.topology.areaOf[cell]!]!;
  let t = 0;
  for (const i of area.cells) t += farm.pasture.G[i]! + farm.pasture.D[i]!;
  return t * farm.layout.scale.haPerSquare;
}

describe('a night with plan moves left to the player', () => {
  it('moves no mob, keeps the plan live, and counts the night in the report: feed, head-days, weight', () => {
    const { farm: first, mob } = planned(daily);
    let farm = first;
    let eaten = 0;
    let headDays = 0;
    let gain = 0;
    for (let night = 0; night < 4; night++) {
      // On even mornings the player makes the plan's move; on odd ones nobody does.
      if (night % 2 === 0) farm = work(farm, { type: 'planMove', mob }).farm;
      const where = areaOf(farm, mob);
      const before = new Map(mobOf(farm, mob).animals.map((a) => [a.id, a.wt]));
      const end = endDay(farm, byHand);
      const m = mobOf(end.farm, mob);
      // No mob moved, and the plan is live, not paused.
      expect(areaOf(end.farm, mob)).toBe(where);
      expect(m.plan!.paused).toBe(false);
      eaten += m.st!.demand * m.st!.f;
      headDays += m.st!.n;
      for (const a of m.animals) gain += a.wt - before.get(a.id)!;
      farm = end.farm;
    }
    const run = mobOf(farm, mob).plan!;
    expect(run.moves).toBe(2);
    expect(run.eatenKg).toBeCloseTo(eaten, 6);
    expect(run.headDays).toBe(headDays);
    expect(run.gainKg).toBeCloseTo(gain, 6);
    expect(eaten).toBeGreaterThan(0);
    expect(headDays).toBe(4 * 12);
  });

  it('without it the tick moves the mob as always', () => {
    const { farm, mob } = planned(daily);
    const where = areaOf(farm, mob);
    expect(areaOf(endDay(farm).farm, mob)).not.toBe(where);
    expect(areaOf(endDay(farm, byHand).farm, mob)).toBe(where);
  });

  it('a plan due tonight whose next area has sheep in it waits for the right reason, and stops waiting when they leave', () => {
    const { pf, farm: f0, mob } = planned(daily);
    const farm = cloneFarm(f0);
    const r = addSheepMob(farm, surveyOf(farm), {
      cell: pf.stops[1]!,
      breed: 'merino',
      groups: [{ cls: 'ewe', head: 50 }],
    });
    if (!r.ok) throw new Error(r.reason);
    const end = endDay(farm, byHand);
    const wait = end.day.events.find((e) => e.type === 'plan-waiting');
    expect(wait?.type === 'plan-waiting' && wait.why).toBe('sheep-there');
    expect(mobOf(end.farm, mob).plan!.waiting?.why).toBe('sheep-there');
    // The hand move says why too: sheep, not water.
    const no = turnedDown(end.farm, { type: 'planMove', mob });
    expect(no.message).toMatch(/sheep are grazing in the next area/);
    expect(no.message).not.toMatch(/water/);
    // The sheep go; the next held night clears the wait.
    const gone = cloneFarm(end.farm);
    gone.sheep!.mobs = [];
    expect(mobOf(endDay(gone, byHand).farm, mob).plan!.waiting).toBeNull();
  });
});

describe('a plan of several moves a day, moved by hand', () => {
  const twice = (stops: number[]): PlanSpec => ({
    legs: [
      { stops: [stops[0]!, stops[1]!, stops[2]!], rule: { mode: 'days', every: 0.5 }, rounds: 0 },
    ],
    after: 'repeat',
  });

  it('makes at most its own moves a day, records where the mob stood, and clears the record at the night', () => {
    const { pf, farm: f0, mob } = planned(twice, 30);
    expect(planDueTonight(f0, surveyOf(f0), mobOf(f0, mob))).toBe(true);
    const one = work(f0, { type: 'planMove', mob }).farm;
    expect(plansView(one)[0]!.mobs[0]!).toMatchObject({ due: true, movesToday: 1 });
    const two = work(one, { type: 'planMove', mob }).farm;
    expect(plansView(two)[0]!.mobs[0]!).toMatchObject({ due: false, movesToday: 2 });
    expect(turnedDown(two, { type: 'planMove', mob }).message).toMatch(
      /made its 2 moves for today\. The next move is due tomorrow\./,
    );
    const m = mobOf(two, mob);
    const s = surveyOf(two);
    expect(stopsToday(two, m, true)!.map((c) => s.topology.areaOf[c])).toEqual(
      [pf.stops[0]!, pf.stops[1]!, pf.stops[2]!].map((c) => s.topology.areaOf[c]),
    );
    const night = endDay(two, byHand).farm;
    expect(mobOf(night, mob).plan!.handStops).toBeUndefined();
    expect(planDueTonight(night, surveyOf(night), mobOf(night, mob))).toBe(true);
  });

  it('grazes the day across the areas the mob was moved through; with no hand move, where it is', () => {
    const { pf, farm: f0, mob } = planned(twice, 60);
    const moved = work(work(f0, { type: 'planMove', mob }).farm, { type: 'planMove', mob }).farm;
    // The same farm, with the record of where it stood taken away: it grazes only where it is.
    const still = cloneFarm(moved);
    delete mobOf(still, mob).plan!.handStops;
    expect(stopsToday(still, mobOf(still, mob), true)).toBeNull();
    const a = endDay(moved, byHand).farm;
    const b = endDay(still, byHand).farm;
    // The areas it left were grazed on the hand night, and the one it ended in less.
    expect(feedIn(a, pf.stops[0]!)).toBeLessThan(feedIn(b, pf.stops[0]!) - 1);
    expect(feedIn(a, pf.stops[1]!)).toBeLessThan(feedIn(b, pf.stops[1]!) - 1);
    expect(feedIn(a, pf.stops[2]!)).toBeGreaterThan(feedIn(b, pf.stops[2]!) + 1);
  });
});

describe('a "grazed down to" plan moved by hand', () => {
  const kg =
    (rounds: number) =>
    (stops: number[]): PlanSpec => ({
      // The top figure: every area here is under it, so the plan moves as soon as its rule lets it.
      legs: [{ stops: [stops[0]!, stops[1]!], rule: { mode: 'kg', kg: 5000, maxDays: 0 }, rounds }],
      after: 'stay',
    });

  it('waits a day after a hand move into an area already under its figure, as the tick does', () => {
    const { farm: f0, mob } = planned(kg(0));
    const moved = work(f0, { type: 'planMove', mob }).farm;
    expect(planDueTonight(moved, surveyOf(moved), mobOf(moved, mob))).toBe(false);
    const next = endDay(moved, byHand).farm;
    expect(planDueTonight(next, surveyOf(next), mobOf(next, mob))).toBe(true);
  });

  it('offers the move that ends the plan, so a plan with rounds can end', () => {
    const { farm: f0, mob } = planned(kg(1));
    let farm = work(f0, { type: 'planMove', mob }).farm;
    farm = endDay(farm, byHand).farm;
    const v = plansView(farm)[0]!.mobs[0]!;
    expect(v.next).toEqual({ kind: 'finish' });
    expect(v.due).toBe(true);
    const done = work(farm, { type: 'planMove', mob });
    expect(mobOf(done.farm, mob).plan).toBeUndefined();
    expect(done.events.some((e) => e.type === 'plan-finished')).toBe(true);
  });
});

describe('sheep plans on a night with plan moves left to the player', () => {
  function sheepPlanned() {
    const pf = planFarm('nsw', { seed: 11 });
    const farm = cloneFarm(pf.farm);
    const r = addSheepMob(farm, surveyOf(farm), {
      cell: pf.stops[2]!,
      breed: 'merino',
      groups: [{ cls: 'ewe', head: 120 }],
    });
    if (!r.ok) throw new Error(r.reason);
    farm.plans.push({
      id: 70,
      name: 'Sheep two',
      legs: [{ stops: [pf.stops[2]!, pf.stops[3]!], rule: { mode: 'days', every: 1 }, rounds: 0 }],
      after: 'repeat',
    });
    const set = work(farm, { type: 'setSheepPlan', mob: r.mob.id, template: 70 }).farm;
    return { pf, farm: set, mob: r.mob.id };
  }
  const sheepArea = (farm: FarmState, id: number): number =>
    areaIdOf(
      surveyOf(farm),
      sheepMobsOf(farm).find((m) => m.id === id)!,
    );

  it('are held, listed as due, and moved by hand with planMove, by the sheep tick own move', () => {
    const { pf, farm, mob } = sheepPlanned();
    const where = sheepArea(farm, mob);
    // Held: the night moves nothing, and the plan is live.
    const held = endDay(farm, byHand).farm;
    expect(sheepArea(held, mob)).toBe(where);
    expect(sheepMobsOf(held).find((m) => m.id === mob)!.plan!.paused).toBe(false);
    // Without the hold the sheep tick moves them.
    expect(sheepArea(endDay(farm).farm, mob)).not.toBe(where);
    // Due, and moved by hand.
    expect(sheepPlansDue(held).map((d) => d.mob)).toEqual([mob]);
    const done = work(held, { type: 'planMove', mob });
    expect(done.job.workMin).toBeGreaterThan(0);
    const s = surveyOf(done.farm);
    expect(sheepArea(done.farm, mob)).toBe(s.topology.areaOf[pf.stops[3]!]);
    expect(sheepMobsOf(done.farm).find((m) => m.id === mob)!.plan!.moves).toBe(1);
    // Taken early, it is not due again today.
    expect(sheepPlansDue(done.farm)).toEqual([]);
  });

  it('never go in with cattle: the hand move is refused with that reason', () => {
    const { pf, farm, mob } = sheepPlanned();
    const withCattle = setUp(endDay(farm, byHand).farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 5,
      to: { cell: pf.stops[3]! },
    });
    expect(sheepPlansDue(withCattle)[0]!.blocked).toBe('cattle-there');
    expect(turnedDown(withCattle, { type: 'planMove', mob }).message).toMatch(
      /cattle are grazing in the next area/,
    );
  });
});

describe('the start date of a farm', () => {
  const base = {
    seed: 5,
    district: 'cq' as const,
    size: 'small' as const,
    startType: 'scratch' as const,
    difficulty: 'medium' as const,
  };

  it('is refused unless it is a whole number from 1 to the last day of that month', () => {
    for (const date of [0, 32, 1.5, -1, Number.NaN]) {
      expect(() => createFarm({ ...base, start: { year: 2025, month: 0, date } })).toThrow(
        RangeError,
      );
    }
    // 30 June is a day; 31 June is not. February has 28 days in 2025 and 29 in 2024.
    expect(() => createFarm({ ...base, start: { year: 2025, month: 5, date: 31 } })).toThrow();
    expect(createFarm({ ...base, start: { year: 2025, month: 5, date: 30 } }).start.date).toBe(30);
    expect(() => createFarm({ ...base, start: { year: 2025, month: 1, date: 29 } })).toThrow();
    expect(createFarm({ ...base, start: { year: 2024, month: 1, date: 29 } }).start.date).toBe(29);
  });
});
