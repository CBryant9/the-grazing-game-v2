import {
  applyAction,
  areaIdOf,
  createFarm,
  endDay,
  sheepMobsOf,
  surveyOf,
  worksOn,
  type FarmState,
} from '@gg/engine';
import { describe, expect, it } from 'vitest';
import { handWorksToday, nightOf, plansDue } from './advance';
import { farmWithPlan, farmWithSheepPlan, planEnv, withHand } from './planfarm';

/*
 * The night on a Daily Farm and who moves a grazing plan (PRD 5.11, 5.15). On the engine alone,
 * so the rules are checked without a database: a hand works some days and not others, and a
 * mob on a plan moves on the nights a hand works and waits on the nights none does.
 */

const env = planEnv;

const areaOf = (farm: FarmState, mobId: number): number =>
  areaIdOf(
    surveyOf(farm),
    farm.mobs.find((m) => m.id === mobId)!,
  );

describe('a grazing plan on a Daily Farm night', () => {
  it('with no hand, the plan is held for the night and the move is offered on the plan card', () => {
    const { farm, mob } = farmWithPlan();
    expect(handWorksToday(farm)).toBe(false);
    // A move is due and no hand will make it, so the card has it.
    const due = plansDue(farm);
    expect(due).toHaveLength(1);
    expect(due[0]!.text).toMatch(/^Your grazing plan said today you would move .+ to .+\.$/);
    const before = areaOf(farm, mob);
    const { end, plansHeld } = nightOf(farm, env);
    expect(plansHeld).toBe(1);
    expect(areaOf(end.farm, mob)).toBe(before);
    // The plan is as it was, not paused, so the card offers the same move next morning.
    expect(end.farm.mobs.find((m) => m.id === mob)!.plan!.paused).toBe(false);
    expect(farm.mobs.find((m) => m.id === mob)!.plan!.paused).toBe(false);
    expect(plansDue(end.farm).map((d) => d.mob)).toEqual([mob]);
  });

  it('with a hand, the plan moves the mob on the nights the hand works, and no card is offered those days', () => {
    const { farm: first, mob } = farmWithPlan();
    let farm = withHand(first);
    const hand = farm.labour!.hands[0]!;
    let worked = 0;
    let rested = 0;
    for (let night = 0; night < 21; night++) {
      const works = farm.labour!.hands.some((h) => worksOn(farm, h, farm.day));
      expect(handWorksToday(farm)).toBe(works);
      if (works) expect(plansDue(farm)).toEqual([]);
      const before = areaOf(farm, mob);
      const { end, plansHeld } = nightOf(farm, env);
      const moved = areaOf(end.farm, mob) !== before;
      if (works) {
        worked++;
        expect(plansHeld).toBe(0);
        expect(moved).toBe(true);
      } else {
        rested++;
        expect(plansHeld).toBe(1);
        expect(moved).toBe(false);
      }
      farm = end.farm;
    }
    // A hand does not work every day (their own days), so both kinds of night were seen.
    expect(hand.days.length).toBeLessThan(7);
    expect(worked).toBeGreaterThan(0);
    expect(rested).toBeGreaterThan(0);
  });

  it('a farm with no plan is run exactly as the engine runs it', () => {
    const farm = createFarm(
      {
        seed: 4,
        district: 'wv',
        size: 'small',
        start: { month: 8 },
        years: { kind: 'real', order: 'in-order' },
        startType: 'running',
        difficulty: 'medium',
      },
      env,
    );
    expect(nightOf(farm, env).plansHeld).toBe(0);
    expect(plansDue(farm)).toEqual([]);
  });

  /** A player with no hand who says Yes to the plan card every morning, for a number of days. */
  function playCard(start: FarmState, mob: number, days: number) {
    let farm = start;
    const seen: { leg: number; idx: number; rounds: number; there: boolean }[] = [];
    for (let day = 0; day < days; day++) {
      for (const due of plansDue(farm)) {
        const done = applyAction(farm, { type: 'planMove', mob: due.mob }, env);
        if (!done.ok) throw new Error(done.message);
        farm = done.farm;
      }
      const run = farm.mobs.find((m) => m.id === mob)!.plan;
      seen.push({
        leg: run?.leg ?? -1,
        idx: run?.idx ?? -1,
        rounds: run?.rounds ?? -1,
        there: run !== undefined,
      });
      farm = nightOf(farm, env).end.farm;
    }
    return { farm, seen };
  }

  it('the plan card over several days: a plan of 2 rounds that stays ends, and is not offered again', () => {
    const { farm, mob } = farmWithPlan({ rounds: 2, after: 'stay' });
    const { farm: after, seen } = playCard(farm, mob, 8);
    // One move a morning: rounds go 0, 1, 1, then the plan is gone and stays gone.
    expect(seen.slice(0, 4).map((x) => x.rounds)).toEqual([0, 1, 1, -1]);
    expect(seen.slice(3).every((x) => !x.there)).toBe(true);
    expect(plansDue(after)).toEqual([]);
  });

  it('the plan card over several days: a plan of 2 rounds with a second leg reaches the second leg', () => {
    const { farm, mob } = farmWithPlan({ rounds: 2, legs: 2, after: 'stay' });
    const { seen } = playCard(farm, mob, 6);
    expect(seen.some((x) => x.leg === 1)).toBe(true);
    expect(seen.find((x) => x.leg === 1)!.rounds).toBe(2);
  });

  it('the card is offered once a day, not again after the move, and the night does not move the plan as well', () => {
    const { farm, mob } = farmWithPlan({ rounds: 0 });
    const once = applyAction(farm, { type: 'planMove', mob }, env);
    if (!once.ok) throw new Error(once.message);
    expect(plansDue(once.farm)).toEqual([]);
    const area = areaOf(once.farm, mob);
    expect(areaOf(nightOf(once.farm, env).end.farm, mob)).toBe(area);
  });
});

/*
 * m7.1: the night with no hand is the engine's own (`plansByHand`), not the player's "paused"
 * state, so the plan's report counts what really happened that night.
 */
describe('the plan report on a Daily Farm (m7.1)', () => {
  /** Each night's grazing by the mob, read from the engine after the night. */
  function playAndCount(start: FarmState, mob: number, nights: number, card: boolean) {
    let farm = start;
    const real = { eatenKg: 0, headDays: 0, gainKg: 0 };
    for (let n = 0; n < nights; n++) {
      if (card) {
        for (const due of plansDue(farm)) {
          const done = applyAction(farm, { type: 'planMove', mob: due.mob }, env);
          if (!done.ok) throw new Error(done.message);
          farm = done.farm;
        }
      }
      const was = new Map(farm.mobs.find((m) => m.id === mob)!.animals.map((a) => [a.id, a.wt]));
      farm = nightOf(farm, env).end.farm;
      const m = farm.mobs.find((x) => x.id === mob)!;
      real.eatenKg += m.st!.demand * m.st!.f;
      real.headDays += m.st!.n;
      for (const a of m.animals) if (was.has(a.id)) real.gainKg += a.wt - was.get(a.id)!;
    }
    return { farm, real, run: farm.mobs.find((m) => m.id === mob)!.plan! };
  }

  it('the review case: 6 nights with the card moved by hand, the report equals the grazing that happened', () => {
    const { farm, mob } = farmWithPlan();
    const { real, run } = playAndCount(farm, mob, 6, true);
    // Before m7.1 this read 6 moves, 0 kg DM, 0 head-days and 0 kg.
    expect(run.moves).toBe(6);
    expect(real.eatenKg).toBeGreaterThan(1000);
    expect(run.eatenKg).toBeCloseTo(real.eatenKg, 6);
    expect(run.headDays).toBe(real.headDays);
    expect(run.headDays).toBeGreaterThan(0);
    expect(run.gainKg).toBeCloseTo(real.gainKg, 6);
    expect(run.paused).toBe(false);
  });

  it('a part-time hand: the nights the hand works and the held nights both count', () => {
    const { farm: first, mob } = farmWithPlan();
    const { real, run } = playAndCount(withHand(first), mob, 14, true);
    expect(run.headDays).toBe(real.headDays);
    expect(run.eatenKg).toBeCloseTo(real.eatenKg, 6);
    expect(run.gainKg).toBeCloseTo(real.gainKg, 6);
  });
});

describe('a plan of two moves a day on a Daily Farm with no hand (m7.1)', () => {
  it('offers its moves one at a time, at most two a day, and the last says when the next is due', () => {
    const { farm, mob } = farmWithPlan({ every: 0.5 });
    const first = plansDue(farm);
    expect(first).toHaveLength(1);
    expect(first[0]!.text).toMatch(/That is move 1 of 2 today\.$/);
    const one = applyAction(farm, { type: 'planMove', mob }, env);
    if (!one.ok) throw new Error(one.message);
    const second = plansDue(one.farm);
    expect(second[0]!.text).toMatch(/That is move 2 of 2 today\. The next is due tomorrow\.$/);
    const two = applyAction(one.farm, { type: 'planMove', mob }, env);
    if (!two.ok) throw new Error(two.message);
    expect(plansDue(two.farm)).toEqual([]);
    // The night grazes where the mob was, and the next morning offers the first move again.
    const next = nightOf(two.farm, env).end.farm;
    expect(plansDue(next)[0]!.text).toMatch(/That is move 1 of 2 today\.$/);
  });
});

describe('sheep plans on a Daily Farm with no hand (m7.1)', () => {
  const sheepArea = (farm: FarmState, id: number): number =>
    areaIdOf(
      surveyOf(farm),
      sheepMobsOf(farm).find((m) => m.id === id)!,
    );

  it('are held for the night, offered on the card, and moved by the card', () => {
    const { farm, mob } = farmWithSheepPlan();
    expect(handWorksToday(farm)).toBe(false);
    const where = sheepArea(farm, mob);
    const { end, plansHeld } = nightOf(farm, env);
    expect(plansHeld).toBeGreaterThanOrEqual(1);
    expect(sheepArea(end.farm, mob)).toBe(where);
    // The engine's own night moves them, so the hold is the server's doing, not the plan's.
    expect(sheepArea(endDay(farm, env).farm, mob)).not.toBe(where);
    const due = plansDue(end.farm).filter((d) => d.mob === mob);
    expect(due).toHaveLength(1);
    expect(due[0]!.text).toMatch(/^Your grazing plan said today you would move .+ to .+\.$/);
    const moved = applyAction(end.farm, { type: 'planMove', mob }, env);
    if (!moved.ok) throw new Error(moved.message);
    expect(sheepArea(moved.farm, mob)).not.toBe(where);
    expect(plansDue(moved.farm).some((d) => d.mob === mob)).toBe(false);
  });
});
