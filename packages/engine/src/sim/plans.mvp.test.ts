import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import type { MvpFarm } from '../../test-support/mvpFarm';
import { WholeFarmRun, loadMvpWhole, type MvpPlan } from '../../test-support/mvpWhole';
import { mvpSetPlan, planFarm } from '../../test-support/plans';
import { setUp } from '../../test-support/workingDay';
import type { PlanSpec } from '../actions/types';
import { DISTRICT_IDS } from '@gg/shared';
import { newYear } from '../money/worth';
import { createFarm } from './create';
import type { FarmState } from './state';
import { stepDay } from './tick';

/*
 * Grazing plans, day by day, against the old game's own plan code
 * (docs/MODEL.md, section 10).
 *
 * The same farm is in the old game and in the engine. The same plan is set
 * on the same mob in both. Each day the old game's own `stepDay` runs (its
 * plan code is the one in `reference/mvp/grazing-game.html`, reached through
 * the in-memory hook in test-support), then the engine's, and afterwards
 * every pasture array, every animal, where each mob is, and the plan's
 * step, stay, rounds, moves and feed eaten must be equal with no tolerance.
 *
 * The one place the engine differs on purpose: a plan stuck at a stop with
 * no water kept counting rounds in the old game. In the engine rounds count
 * only when the mob moves (BUILD_PLAN 2.4). That test asserts the
 * difference, and leaves the round counts out of the comparison.
 */

// The old game runs slowly in its sandbox.
vi.setConfig({ testTimeout: 900_000 });

const loaded = loadMvpWhole();

const STARTS: Record<DistrictId, number> = { cq: 2, nsw: 9, cw: 4, wv: 7 };
const at = (id: DistrictId): number => DISTRICT_IDS.indexOf(id);

/** The four paddocks in a row, with some steers in paddock `into` (0 to 3). */
function begin(
  id: DistrictId,
  o: { dry?: number[]; into?: number; head?: number; seed?: number } = {},
): { run: WholeFarmRun; stops: number[]; troughs: number[]; open: number; mob: number } {
  const pf = planFarm(id, {
    seed: o.seed ?? 900 + at(id),
    start: { year: 2023, month: STARTS[id] },
    dry: o.dry,
  });
  const farm = setUp(pf.farm, {
    type: 'buyCattle',
    cls: 'yearSteer',
    qty: o.head ?? 12,
    to: { cell: pf.stops[o.into ?? 0]! },
  });
  // The year starts here: what was spent setting the farm up is not in this year's totals.
  farm.year = newYear(farm);
  const run = new WholeFarmRun(loaded, farm, 5000 + at(id));
  return { run, stops: pf.stops, troughs: pf.troughs, open: pf.open, mob: farm.mobs[0]!.id };
}

/** Set a plan in the engine and in the old game. */
function setPlan(run: WholeFarmRun, mob: number, spec: PlanSpec, step = 0): void {
  run.act({ type: 'setPlan', mob, plan: spec, step }, (mvp) => {
    mvpSetPlan(mvp, run.mvpMob(mob), spec, step);
  });
}

const days = (every: number, stops: number[], rounds = 0): PlanSpec['legs'][number] => ({
  stops,
  rule: { mode: 'days', every },
  rounds,
});

const planOf = (run: WholeFarmRun, mob: number) => run.farm.mobs.find((m) => m.id === mob)?.plan;

describe.each(['cq', 'wv'] as const)('%s: a rotation every few days beside the old game', (id) => {
  it('moves round four paddocks every 3 days for 120 days, equal every day', () => {
    const { run, stops, mob } = begin(id);
    setPlan(run, mob, { legs: [days(3, stops)], after: 'repeat' });
    run.days(120);
    expect(run.farm.day).toBe(120);
    const plan = planOf(run, mob)!;
    // 120 days on a 3-day plan: 40 moves, ten full rounds.
    expect(plan.moves).toBe(40);
    expect(plan.rounds).toBe(10);
    expect(run.seen).toContain('plan-moved');
    expect(plan.eatenKg).toBeGreaterThan(0);
    expect(plan.headDays).toBe(12 * 120);
  });
});

describe('the "grazed down to" rule beside the old game', () => {
  it.each(['nsw', 'cw'] as const)(
    '%s: moves at a residual, at the day limit, and says it is staying',
    (id) => {
      const { run, stops, mob } = begin(id);
      // A very low figure: the day limit does the moving, with a note after a week.
      setPlan(run, mob, {
        legs: [{ stops, rule: { mode: 'kg', kg: 300, maxDays: 10 }, rounds: 0 }],
        after: 'repeat',
      });
      run.days(70);
      const slow = planOf(run, mob)!;
      expect(slow.moves).toBe(7);
      expect(run.seen).toContain('plan-staying');
      // A high figure: the area is always grazed down to it, so it moves each day.
      setPlan(run, mob, {
        legs: [{ stops, rule: { mode: 'kg', kg: 5000, maxDays: 0 }, rounds: 0 }],
        after: 'repeat',
      });
      run.days(30);
      expect(planOf(run, mob)!.moves).toBe(30);
    },
  );
});

describe('several moves a day beside the old game', () => {
  it('4 and 2 moves a day, and 2 a day with a dry stop in the way, equal every day', () => {
    for (const [every, dry, id] of [
      [0.25, [], 'nsw'],
      [0.5, [], 'wv'],
      [0.5, [2], 'cw'],
    ] as const) {
      const { run, stops, mob } = begin(id, { dry: [...dry], seed: 920 + at(id) });
      setPlan(run, mob, { legs: [days(every, stops)], after: 'repeat' });
      run.days(40);
      const plan = planOf(run, mob)!;
      if (dry.length) {
        // The plan reaches the dry stop and waits there. Nothing is counted.
        expect(plan.waiting?.target).toBe(stops[2]);
        expect(plan.moves).toBe(1);
        expect(run.seen).toContain('plan-waiting');
      } else {
        expect(plan.moves).toBe(Math.round(1 / every) * 40);
      }
    }
  });
});

describe('a plan that runs out of rounds, beside the old game', () => {
  it('finishes its legs and stays, or starts again, equal every day', () => {
    for (const [after, id] of [
      ['stay', 'nsw'],
      ['repeat', 'cq'],
    ] as const) {
      const { run, stops, mob } = begin(id, { seed: 940 + at(id) });
      const spec: PlanSpec = {
        legs: [days(2, [stops[0]!, stops[1]!], 2), days(3, [stops[2]!, stops[3]!], 1)],
        after,
      };
      setPlan(run, mob, spec);
      run.days(60);
      if (after === 'stay') {
        // 2 rounds of 2 stops at 2 days, then 1 round of 2 stops at 3 days: 14 days, and the plan is done.
        expect(planOf(run, mob)).toBeUndefined();
        expect(run.seen).toContain('plan-finished');
        expect(run.mvpMob(mob).plan).toBeNull();
      } else {
        expect(planOf(run, mob)!.rounds).toBeGreaterThan(4);
        expect(run.seen).not.toContain('plan-finished');
      }
    }
  });
});

describe('a manual move and a resume, beside the old game', () => {
  it('a move by hand pauses the plan, and it is resumed from a step', () => {
    const { run, stops, open, mob } = begin('nsw', { seed: 960 });
    const spec: PlanSpec = { legs: [days(3, stops)], after: 'repeat' };
    setPlan(run, mob, spec);
    run.days(10);
    const before = planOf(run, mob)!;
    expect(before.moves).toBe(3);
    // The old game's screen broke the plan when a mob was moved by hand. Keep its report for the resume.
    const kept: MvpPlan['rep'] = structuredClone(run.mvpMob(mob).plan!.rep);
    run.act({ type: 'moveMob', mob, to: { cell: open } }, (mvp) => {
      const where = run.farm.mobs[0]!.where;
      mvp.moveMob(run.mvpMob(mob), where.kind === 'paddock' ? where.anchor : -1);
      run.mvpMob(mob).plan = null;
    });
    const paused = planOf(run, mob)!;
    expect(paused.paused).toBe(true);
    expect(paused.moves).toBe(3);
    run.days(6);
    // Paused: nothing moved it, and the report did not grow.
    expect(planOf(run, mob)!.moves).toBe(3);
    expect(planOf(run, mob)!.headDays).toBe(paused.headDays);
    // Resume from the third paddock (step 2).
    run.act({ type: 'resumePlan', mob, step: 2 }, (mvp) => {
      mvpSetPlan(mvp, run.mvpMob(mob), spec, 2, kept);
    });
    expect(planOf(run, mob)!.paused).toBe(false);
    run.days(30);
    expect(planOf(run, mob)!.moves).toBe(3 + 10);
    // Cleared by the player: the old game's "Stop plan".
    run.act({ type: 'clearPlan', mob }, () => {
      run.mvpMob(mob).plan = null;
    });
    run.days(5);
    expect(planOf(run, mob)).toBeUndefined();
  });
});

describe('no water at a stop, beside the old game', () => {
  it('the engine matches the old game except that rounds count only when the mob moves', () => {
    // Paddock 0 has no water. The plan is paddocks 0, 1 and 2, started at paddock 1.
    const { run, stops, troughs, mob } = begin('wv', { dry: [0], into: 1, seed: 980 });
    const spec: PlanSpec = { legs: [days(3, [stops[0]!, stops[1]!, stops[2]!])], after: 'repeat' };
    run.compare = { skipPlanRounds: true };
    setPlan(run, mob, spec, 1);
    run.days(40);
    const plan = planOf(run, mob)!;
    // Paddock 1, then 2, then the plan wants paddock 0 and waits at paddock 2.
    expect(plan.moves).toBe(1);
    expect(plan.waiting).toEqual({ target: stops[0], why: 'no-water' });
    const old = run.mvpMob(mob).plan!;
    expect(old.dryNote).toBe(stops[0]);
    expect(old.rep.moves).toBe(1);
    // The difference: the old game counted a round for every day it was stuck. The engine counted none.
    expect(plan.rounds).toBe(0);
    expect(old.rep.rounds).toBeGreaterThan(20);
    expect(plan.round).toBe(0);
    expect(old.round).toBe(old.rep.rounds);

    // Water goes in at paddock 0. Both move on, to paddock 0, and the plan carries on.
    run.act({ type: 'placeTrough', cell: troughs[0]! }, (mvp) => {
      (mvp as unknown as MvpFarm).placeTrough(troughs[0]!);
    });
    run.days(10);
    const after = planOf(run, mob)!;
    expect(after.waiting).toBeNull();
    expect(after.moves).toBeGreaterThan(1);
    // The old game kept counting rounds the whole time. The engine counts the rounds it made.
    expect(after.rounds).toBeLessThan(run.mvpMob(mob).plan!.rep.rounds);
  });
});

// The engine stands alone as well: a farm with no plan is untouched by any of it.
describe('a farm with no plan', () => {
  it('runs exactly as it did, day after day', () => {
    const a = createFarm({
      seed: 3,
      district: 'nsw',
      size: 'small',
      start: { year: 2023, month: 8 },
      startType: 'running',
      difficulty: 'medium',
    });
    const b: FarmState = structuredClone(a);
    for (let d = 0; d < 20; d++) {
      stepDay(a);
      stepDay(b);
    }
    expect(a.plans).toEqual([]);
    expect(a.mobs.every((m) => m.plan === undefined)).toBe(true);
    expect(a.cash).toBe(b.cash);
  });
});
