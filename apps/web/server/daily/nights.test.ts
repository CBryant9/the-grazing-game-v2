import { areaIdOf, createFarm, surveyOf, worksOn, type FarmState } from '@gg/engine';
import { describe, expect, it } from 'vitest';
import { handWorksToday, nightOf, plansDue } from './advance';
import { farmWithPlan, planEnv, withHand } from './planfarm';

/*
 * The night on a Daily Farm and who moves a grazing plan (PRD 5.11, 5.15). On the engine alone,
 * so the rules are checked without a database: a hand works some days and not others, and a
 * mob on a plan moves on the nights a hand works and waits on the nights none does.
 */

const env = planEnv;

const areaOf = (farm: FarmState, mobId: number): number =>
  areaIdOf(surveyOf(farm), farm.mobs.find((m) => m.id === mobId)!);

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
});
