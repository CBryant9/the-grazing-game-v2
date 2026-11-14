import { describe, expect, it, vi } from 'vitest';
import { planFarm, type PlanFarm } from '../../test-support/plans';
import { atLastLight, setUp, turnedDown, withLightLeft, work } from '../../test-support/workingDay';
import type { Action, PlanSpec } from '../actions/types';
import { applyAction } from '../day/act';
import { endDay, skipDays } from '../day/days';
import { plansView as view, thingsToDo } from '../index';
import { JOB_TIMES } from '../data/jobTimes';
import { farmHash, loadFarm, saveFarm } from '../save/save';
import { surveyOf } from './derived';
import { cloneFarm, type FarmMob, type FarmState } from './state';
import { perDay, stopsToday } from './plans';
import { stepDay } from './tick';

/*
 * Grazing plans on their own (docs/MODEL.md, section 10): the actions, the
 * moves a plan makes by itself, the reasons it can not, the light a move
 * takes, what the screens read, and saves. The comparison with the old
 * game's code is in plans.mvp.test.ts.
 */

vi.setConfig({ testTimeout: 600_000 });

const days = (farm: FarmState, n: number): FarmState => {
  let f = farm;
  for (let i = 0; i < n; i++) f = endDay(f).farm;
  return f;
};

const rotation = (stops: number[], every = 3, rounds = 0): PlanSpec => ({
  legs: [{ stops, rule: { mode: 'days', every }, rounds }],
  after: 'repeat',
});

interface Set {
  pf: PlanFarm;
  farm: FarmState;
  mob: number;
}

/** Four watered paddocks and 12 steers in the first. */
function stocked(over: { dry?: number[]; head?: number } = {}): Set {
  const pf = planFarm('nsw', { seed: 11, dry: over.dry });
  const farm = setUp(pf.farm, {
    type: 'buyCattle',
    cls: 'yearSteer',
    qty: over.head ?? 12,
    to: { cell: pf.stops[0]! },
  });
  return { pf, farm, mob: farm.mobs[0]!.id };
}

const mobOf = (farm: FarmState, id: number): FarmMob => farm.mobs.find((m) => m.id === id)!;
const areaOf = (farm: FarmState, id: number): number => {
  const m = mobOf(farm, id);
  return m.where.kind === 'paddock' ? surveyOf(farm).topology.areaOf[m.where.anchor]! : -1;
};
const areaAt = (farm: FarmState, cell: number): number => surveyOf(farm).topology.areaOf[cell]!;

describe('setting a plan', () => {
  it('makes a template, puts the mob on its first stop and takes none of the day', () => {
    const { pf, farm, mob } = stocked();
    const done = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops), step: 2 });
    expect(done.job.outcome).toBe('free');
    expect(done.job.workMin).toBe(0);
    expect(done.farm.clock.used).toBe(0);
    expect(done.farm.plans).toHaveLength(1);
    expect(done.farm.plans[0]).toMatchObject({ id: 1, name: 'Plan 1', after: 'repeat' });
    expect(done.farm.nextPlanId).toBe(2);
    // Step 2 is the third paddock: the mob is put there at once.
    expect(areaOf(done.farm, mob)).toBe(areaAt(done.farm, pf.stops[2]!));
    expect(mobOf(done.farm, mob).plan).toMatchObject({
      template: 1,
      leg: 0,
      idx: 2,
      round: 0,
      paused: false,
      moves: 0,
      rounds: 0,
    });
    expect(done.events.map((e) => e.type)).toEqual(['mob-moved', 'plan-set']);
    expect(done.events.at(-1)).toMatchObject({
      type: 'plan-set',
      template: 1,
      changed: false,
      step: 2,
      steps: 4,
      dryAreas: [],
    });
    // The mob stays where it is when it is already on the stop's area.
    const same = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops) });
    expect(same.events.map((e) => e.type)).toEqual(['plan-set']);
  });

  it('says which areas in the plan have no water', () => {
    const { pf, farm, mob } = stocked({ dry: [2] });
    const done = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops) });
    const set = done.events.find((e) => e.type === 'plan-set');
    expect(set).toMatchObject({ type: 'plan-set' });
    expect(set && 'dryAreas' in set && set.dryAreas.length).toBe(1);
  });

  it('a template can be changed, and another mob can run it', () => {
    const { pf, farm, mob } = stocked();
    const first = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops) }).farm;
    // A second mob in the second paddock runs the same template from its own step.
    const two = setUp(first, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 6,
      to: { cell: pf.stops[1]! },
    });
    const mob2 = two.mobs.find((m) => m.id !== mob)!.id;
    const both = work(two, { type: 'setPlan', mob: mob2, plan: { template: 1 }, step: 3 }).farm;
    expect(both.plans).toHaveLength(1);
    expect(mobOf(both, mob2).plan).toMatchObject({ template: 1, idx: 3 });
    expect(view(both)[0]!.mobs.map((m) => m.step)).toEqual([0, 3]);
    // Change the template to two paddocks every 5 days. The mob on a step that is gone goes back to the start.
    const changed = work(both, {
      type: 'setPlan',
      mob,
      plan: { id: 1, name: 'Two', ...rotation([pf.stops[0]!, pf.stops[1]!], 5) },
    });
    expect(changed.farm.plans[0]).toMatchObject({ id: 1, name: 'Two' });
    expect(changed.farm.plans).toHaveLength(1);
    expect(changed.events.at(-1)).toMatchObject({ type: 'plan-set', changed: true });
    expect(mobOf(changed.farm, mob2).plan).toMatchObject({ template: 1, leg: 0, idx: 0 });
  });

  it('is refused with a reason for each thing that is wrong, and nothing changes', () => {
    const { pf, farm, mob } = stocked();
    const before = farmHash(farm);
    const ask = (action: Action): ReturnType<typeof turnedDown> => turnedDown(farm, action);
    const leg = (over: Partial<PlanSpec['legs'][number]>): PlanSpec => ({
      legs: [
        {
          stops: [pf.stops[0]!, pf.stops[1]!],
          rule: { mode: 'days', every: 3 },
          rounds: 0,
          ...over,
        },
      ],
      after: 'repeat',
    });
    expect(ask({ type: 'setPlan', mob: 99, plan: rotation(pf.stops) }).reason).toBe('no-such-mob');
    expect(ask({ type: 'setPlan', mob, plan: { template: 4 } }).reason).toBe('no-such-plan');
    expect(ask({ type: 'setPlan', mob, plan: { id: 4, ...rotation(pf.stops) } }).reason).toBe(
      'no-such-plan',
    );
    expect(ask({ type: 'setPlan', mob, plan: { legs: [], after: 'stay' } }).reason).toBe(
      'bad-request',
    );
    expect(ask({ type: 'setPlan', mob, plan: leg({ stops: [] }) }).message).toMatch(
      /at least one paddock/,
    );
    expect(ask({ type: 'setPlan', mob, plan: leg({ stops: [-1, 5] }) }).message).toMatch(
      /off the farm/,
    );
    expect(
      ask({ type: 'setPlan', mob, plan: leg({ rule: { mode: 'days', every: 0.2 } }) }).message,
    ).toMatch(/4 moves a day/);
    expect(
      ask({
        type: 'setPlan',
        mob,
        plan: leg({ stops: [pf.stops[0]!], rule: { mode: 'days', every: 0.5 } }),
      }).message,
    ).toMatch(/at least two paddocks/);
    expect(
      ask({ type: 'setPlan', mob, plan: leg({ rule: { mode: 'kg', kg: 200, maxDays: 0 } }) })
        .message,
    ).toMatch(/between 300 and 5000/);
    expect(ask({ type: 'setPlan', mob, plan: leg({ rounds: 1.5 }) }).message).toMatch(/Rounds/);
    expect(
      ask({ type: 'setPlan', mob, plan: leg({ rule: { mode: 'kg', kg: 900, maxDays: -1 } }) })
        .message,
    ).toMatch(/day limit/);
    expect(ask({ type: 'setPlan', mob, plan: rotation(pf.stops), step: 4 }).message).toMatch(
      /4 stops, so step 4/,
    );
    expect(ask({ type: 'pausePlan', mob }).reason).toBe('no-plan');
    expect(ask({ type: 'resumePlan', mob }).reason).toBe('no-plan');
    expect(ask({ type: 'clearPlan', mob }).reason).toBe('no-plan');
    expect(farmHash(farm)).toBe(before);
    // Pausing twice.
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops) }).farm;
    const paused = work(planned, { type: 'pausePlan', mob }).farm;
    expect(turnedDown(paused, { type: 'pausePlan', mob }).reason).toBe('already-paused');
  });

  it('is refused when another mob is in the paddock the plan would put the mob in', () => {
    const { pf, farm, mob } = stocked();
    const two = setUp(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 6,
      to: { cell: pf.stops[2]! },
    });
    const no = turnedDown(two, { type: 'setPlan', mob, plan: rotation(pf.stops), step: 2 });
    expect(no.reason).toBe('area-occupied');
    expect(no.message).toMatch(/One mob to a paddock/);
  });
});

describe('a manual move pauses the plan', () => {
  it('pauses on a move by hand, and the move is the ordinary job', () => {
    const { pf, farm, mob } = stocked();
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops) }).farm;
    const moved = work(planned, { type: 'moveMob', mob, to: { cell: pf.open } });
    expect(moved.job.outcome).toBe('done');
    expect(moved.job.workMin).toBeCloseTo(15 + 0.12, 6);
    expect(moved.events.map((e) => e.type)).toContain('plan-paused');
    expect(moved.events.find((e) => e.type === 'plan-paused')).toMatchObject({
      because: 'manual-move',
      step: 0,
    });
    expect(mobOf(moved.farm, mob).plan).toMatchObject({ paused: true, idx: 0 });
    // Paused: days pass and nothing moves it.
    const later = days(moved.farm, 10);
    expect(areaOf(later, mob)).toBe(areaAt(later, pf.open));
    expect(mobOf(later, mob).plan).toMatchObject({ paused: true, moves: 0 });
    expect(stopsToday(later, mobOf(later, mob))).toBeNull();
  });

  it('is resumed from any step, or cleared, and a move to the feedlot ends the plan', () => {
    const { pf, farm, mob } = stocked();
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops) }).farm;
    const moved = work(planned, { type: 'moveMob', mob, to: { cell: pf.open } }).farm;
    const resumed = work(days(moved, 4), { type: 'resumePlan', mob, step: 3 });
    expect(resumed.job.outcome).toBe('free');
    expect(resumed.events.map((e) => e.type)).toEqual(['mob-moved', 'plan-resumed']);
    expect(areaOf(resumed.farm, mob)).toBe(areaAt(resumed.farm, pf.stops[3]!));
    expect(mobOf(resumed.farm, mob).plan).toMatchObject({
      paused: false,
      idx: 3,
      moved: resumed.farm.day,
    });
    // Running again, it goes on to the stop after (the first, round the rotation).
    const next = days(resumed.farm, 3);
    expect(areaOf(next, mob)).toBe(areaAt(next, pf.stops[0]!));
    expect(mobOf(next, mob).plan).toMatchObject({ moves: 1, rounds: 1, idx: 0 });
    // Resume with no step carries on from where it was.
    const again = work(work(planned, { type: 'pausePlan', mob }).farm, { type: 'resumePlan', mob });
    expect(mobOf(again.farm, mob).plan).toMatchObject({ paused: false, idx: 0 });
    expect(turnedDown(planned, { type: 'resumePlan', mob, step: 9 }).reason).toBe('bad-request');
    // Cleared: the template stays, the mob has no plan, and the event carries a report.
    const cleared = work(next, { type: 'clearPlan', mob });
    expect(mobOf(cleared.farm, mob).plan).toBeUndefined();
    expect(cleared.farm.plans).toHaveLength(1);
    expect(cleared.events.at(-1)).toMatchObject({
      type: 'plan-cleared',
      because: 'asked',
      report: { moves: 1, rounds: 1 },
    });
    // To the feedlot ends it, as in the old game.
    const lot = work(planned, { type: 'moveMob', mob, to: 'lot' });
    expect(mobOf(lot.farm, mob).plan).toBeUndefined();
    expect(lot.events.find((e) => e.type === 'plan-cleared')).toMatchObject({ because: 'to-lot' });
  });

  it('moving part of a mob does not pause the plan', () => {
    const { pf, farm, mob } = stocked();
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops) }).farm;
    const part = work(planned, {
      type: 'moveCattle',
      picks: [{ mob, cls: 'yearlingSteer', qty: 4 }],
      to: { cell: pf.open },
    }).farm;
    expect(mobOf(part, mob).plan).toMatchObject({ paused: false });
    expect(mobOf(part, mob).animals.length).toBe(8);
  });
});

describe('a plan moves the mob by itself', () => {
  it('on Next day and in a skip, the same', () => {
    const { pf, farm, mob } = stocked();
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops, 2) }).farm;
    // 2 days on a stop: it moves at the end of the second day.
    const one = endDay(planned);
    expect(one.day.events.some((e) => e.type === 'plan-moved')).toBe(false);
    const two = endDay(one.farm);
    const moved = two.day.events.find((e) => e.type === 'plan-moved');
    expect(moved).toMatchObject({
      type: 'plan-moved',
      template: 1,
      leg: 0,
      stop: 1,
      step: 1,
      because: 'days',
      movesADay: 1,
      roundDone: false,
      head: 12,
      moves: 1,
    });
    expect(areaOf(two.farm, mob)).toBe(areaAt(two.farm, pf.stops[1]!));
    // The moves are in the inbox, with the day.
    expect(two.farm.inbox.some((m) => m.event.type === 'plan-moved')).toBe(true);
    expect(two.summary.events['plan-moved']).toBe(1);
    // A skip is Next day that many times: the same farm.
    const skipped = skipDays(planned, 9);
    expect(skipped.daysRun).toBe(9);
    expect(farmHash(skipped.farm)).toBe(farmHash(days(planned, 9)));
    expect(mobOf(skipped.farm, mob).plan).toMatchObject({ moves: 4, rounds: 1, idx: 0 });
    // A farm with the same mob and no plan did not move.
    const none = days(farm, 9);
    expect(areaOf(none, mob)).toBe(areaAt(none, pf.stops[0]!));
  });

  it('several moves a day: the day is shared between the stops, and each move is an event', () => {
    const { pf, farm, mob } = stocked();
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops, 0.25) }).farm;
    expect(perDay({ mode: 'days', every: 0.25 })).toBe(4);
    expect(perDay({ mode: 'days', every: 0.5 })).toBe(2);
    expect(perDay({ mode: 'days', every: 1 })).toBe(1);
    expect(perDay({ mode: 'kg', kg: 900, maxDays: 0 })).toBe(1);
    expect(stopsToday(planned, mobOf(planned, mob))).toEqual(pf.stops);
    const res = endDay(planned);
    const moves = res.day.events.filter((e) => e.type === 'plan-moved');
    expect(moves.map((e) => e.type === 'plan-moved' && e.step)).toEqual([1, 2, 3, 0]);
    expect(moves.every((e) => e.type === 'plan-moved' && e.movesADay === 4)).toBe(true);
    expect(moves.at(-1)).toMatchObject({ roundDone: true, rounds: 1, moves: 4 });
    // The mob grazed all four paddocks that day, not just the first.
    const usedBefore = mobOf(planned, mob);
    const after = mobOf(res.farm, mob);
    expect(after.st!.mass).not.toBe(usedBefore.st?.mass);
    // It started the next day back on the first stop, so it ends up there with the stops in order again.
    expect(stopsToday(res.farm, after)).toEqual(pf.stops);
  });
});

describe('the light a plan move takes', () => {
  it('takes the ordinary move time off the day it happens on', () => {
    const { pf, farm, mob } = stocked();
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops, 1) }).farm;
    const res = endDay(planned);
    const m = res.day.events.find((e) => e.type === 'plan-moved')!;
    expect(m).toMatchObject({ type: 'plan-moved' });
    if (m.type !== 'plan-moved') throw new Error('no move');
    // 15 minutes and 1 minute for each 100 head: the ordinary move.
    const want =
      JOB_TIMES.moveMobSettleMin.value + (12 / 100) * JOB_TIMES.moveMobMinPer100Head.value;
    expect(m.time.workMin).toBeCloseTo(want, 9);
    expect(m.time.lightUsedMin).toBeCloseTo(want, 9);
    expect(m.time.startsAt).toBe(planned.clock.firstLight);
    expect(m.time.endsAt - m.time.startsAt).toBeCloseTo(want, 9);
    expect(res.lightLeftMin).toBeCloseTo(
      planned.clock.lastLight - planned.clock.firstLight - want,
      6,
    );
    // It is the same time the player would spend moving the mob by hand.
    const hand = work(farm, { type: 'moveMob', mob, to: { cell: pf.stops[1]! } });
    expect(hand.job.workMin).toBeCloseTo(want, 9);
  });

  it('never takes the light below zero and never stops the move', () => {
    const { pf, farm, mob } = stocked();
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops, 1) }).farm;
    // 5 minutes of light left: the move takes the 5, and happens.
    const late = endDay(withLightLeft(planned, 5));
    const m = late.day.events.find((e) => e.type === 'plan-moved')!;
    expect(m).toMatchObject({ type: 'plan-moved', time: { lightUsedMin: 5 } });
    expect(m.type === 'plan-moved' && m.time.workMin).toBeGreaterThan(15);
    expect(late.lightLeftMin).toBe(0);
    expect(areaOf(late.farm, mob)).toBe(areaAt(late.farm, pf.stops[1]!));
    // No light at all: still moves, takes nothing.
    const dark = endDay(atLastLight(planned));
    expect(dark.day.events.find((e) => e.type === 'plan-moved')).toMatchObject({
      time: { lightUsedMin: 0 },
    });
    expect(areaOf(dark.farm, mob)).toBe(areaAt(dark.farm, pf.stops[1]!));
    // Four moves in a day on a short day: the light used is never more than the day has.
    const four = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops, 0.25) }).farm;
    const ran = endDay(withLightLeft(four, 20));
    const used = ran.day.events.flatMap((e) =>
      e.type === 'plan-moved' ? [e.time.lightUsedMin] : [],
    );
    expect(used).toHaveLength(4);
    expect(used.reduce((a, b) => a + b, 0)).toBeCloseTo(20, 9);
    expect(used[0]).toBeCloseTo(15.12, 9);
    expect(used[1]).toBeCloseTo(4.88, 9);
    expect(used.slice(2)).toEqual([0, 0]);
  });

  it('a new day starts with all of its light', () => {
    const { pf, farm, mob } = stocked();
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops, 1) }).farm;
    const next = endDay(planned).farm;
    expect(next.clock.used).toBe(0);
  });
});

describe('when a plan can not move a mob', () => {
  it('says why once, shows it in things to do, and counts nothing', () => {
    // Paddock 3 has no water. A plan round the four stops reaches it on step 3.
    const { pf, farm, mob } = stocked({ dry: [3] });
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops, 1) }).farm;
    const two = days(planned, 2);
    expect(mobOf(two, mob).plan).toMatchObject({ idx: 2, moves: 2, waiting: null });
    const wait = endDay(two);
    const event = wait.day.events.find((e) => e.type === 'plan-waiting');
    expect(event).toMatchObject({
      type: 'plan-waiting',
      why: 'no-water',
      cell: pf.stops[3],
      step: 3,
      mob,
    });
    // It waits, and says nothing more on the days after.
    const more = endDay(wait.farm);
    expect(more.day.events.some((e) => e.type === 'plan-waiting')).toBe(false);
    const waiting = days(wait.farm, 30);
    expect(mobOf(waiting, mob).plan).toMatchObject({
      idx: 2,
      moves: 2,
      rounds: 0,
      round: 0,
      waiting: { target: pf.stops[3], why: 'no-water' },
    });
    expect(areaOf(waiting, mob)).toBe(areaAt(waiting, pf.stops[2]!));
    // Things to do lists it, with the reason, and the action that pauses it.
    const todo = thingsToDo(waiting).find((t) => t.type === 'plan-waiting');
    expect(todo).toMatchObject({
      type: 'plan-waiting',
      mob,
      why: 'no-water',
      step: 2,
      count: 12,
      does: 'pausePlan',
      action: { type: 'pausePlan', mob },
    });
    // The view says the same.
    const v = view(waiting)[0]!.mobs[0]!;
    expect(v.waiting).toMatchObject({ why: 'no-water', cell: pf.stops[3] });
    expect(v.next).toMatchObject({ kind: 'waiting', why: 'no-water' });
    expect(v.roundsDone).toBe(0);
    // Water goes in and it moves on the next day, and the item goes.
    const wet = work(waiting, { type: 'placeTrough', cell: pf.troughs[3]! }).farm;
    const moved = endDay(wet).farm;
    expect(areaOf(moved, mob)).toBe(areaAt(moved, pf.stops[3]!));
    expect(mobOf(moved, mob).plan).toMatchObject({ waiting: null, moves: 3 });
    expect(thingsToDo(moved).some((t) => t.type === 'plan-waiting')).toBe(false);
    // Paused, it is not waiting.
    const paused = work(waiting, { type: 'pausePlan', mob }).farm;
    expect(thingsToDo(paused).some((t) => t.type === 'plan-waiting')).toBe(false);
  });

  it('a skip stops for it, once, and not again for the same stop', () => {
    const { pf, farm, mob } = stocked({ dry: [1] });
    const planned = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops, 2) }).farm;
    const skip = skipDays(planned, 30);
    expect(skip.daysRun).toBe(2);
    expect(skip.stops).toEqual([
      {
        type: 'plan-waiting',
        mob,
        mobName: mobOf(planned, mob).name,
        area: expect.any(String),
        step: 1,
      },
    ]);
    // Skipping on: it is still waiting for the same stop, so there is nothing new to stop for.
    const on = skipDays(skip.farm, 30);
    expect(on.daysRun).toBe(30);
    expect(on.stops).toEqual([]);
  });

  it('waits when another mob is in the next paddock, and says so, without stopping a skip', () => {
    const { pf, farm, mob } = stocked();
    const two = setUp(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 6,
      to: { cell: pf.stops[1]! },
    });
    const other = two.mobs.find((m) => m.id !== mob)!.id;
    const planned = work(two, { type: 'setPlan', mob, plan: rotation(pf.stops, 2) }).farm;
    const skip = skipDays(planned, 6);
    expect(skip.daysRun).toBe(6);
    expect(skip.stops).toEqual([]);
    const waits = skip.days.flatMap((d) => d.events.filter((e) => e.type === 'plan-waiting'));
    expect(waits).toHaveLength(1);
    expect(waits[0]).toMatchObject({ why: 'occupied', cell: pf.stops[1], step: 1 });
    expect(skip.farm.mobs).toHaveLength(2);
    expect(thingsToDo(skip.farm).find((t) => t.type === 'plan-waiting')).toMatchObject({
      why: 'occupied',
    });
    // The other mob is moved out. The plan moves in on the next day.
    const clear = work(skip.farm, { type: 'moveMob', mob: other, to: { cell: pf.open } }).farm;
    const moved = endDay(clear).farm;
    expect(areaOf(moved, mob)).toBe(areaAt(moved, pf.stops[1]!));
  });
});

describe('a plan that finishes', () => {
  it('says so, with a report, and the mob stays where it is', () => {
    const { pf, farm, mob } = stocked();
    const spec: PlanSpec = {
      legs: [{ stops: [pf.stops[0]!, pf.stops[1]!], rule: { mode: 'days', every: 2 }, rounds: 2 }],
      after: 'stay',
    };
    const planned = work(farm, { type: 'setPlan', mob, plan: spec }).farm;
    // 2 rounds of 2 stops at 2 days each: the last move is at the end of day 8.
    const skip = skipDays(planned, 12);
    const fin = skip.days.flatMap((d) => d.events.filter((e) => e.type === 'plan-finished'));
    expect(fin).toHaveLength(1);
    expect(fin[0]).toMatchObject({
      type: 'plan-finished',
      mob,
      report: { moves: 3, rounds: 2 },
    });
    expect(mobOf(skip.farm, mob).plan).toBeUndefined();
    expect(skip.farm.plans).toHaveLength(1);
    // It stayed in the last paddock it was in.
    expect(areaOf(skip.farm, mob)).toBe(areaAt(skip.farm, pf.stops[1]!));
    expect(view(skip.farm)[0]!.mobs).toEqual([]);
  });
});

describe('reading plans', () => {
  it('gives each plan, its paddocks in order, its rule, and what each mob will do next', () => {
    const { pf, farm, mob } = stocked({ dry: [2] });
    const spec: PlanSpec = {
      name: 'Round the four',
      legs: [
        { stops: [pf.stops[0]!, pf.stops[1]!], rule: { mode: 'days', every: 4 }, rounds: 1 },
        {
          stops: [pf.stops[2]!, pf.stops[3]!],
          rule: { mode: 'kg', kg: 1500, maxDays: 9 },
          rounds: 0,
        },
      ],
      after: 'stay',
    };
    const planned = work(farm, { type: 'setPlan', mob, plan: spec }).farm;
    const [p] = view(planned);
    expect(p).toMatchObject({ id: 1, name: 'Round the four', steps: 4, after: 'stay' });
    expect(p!.legs.map((l) => l.stops.length)).toEqual([2, 2]);
    expect(p!.legs[0]!.rule).toEqual({ mode: 'days', every: 4 });
    expect(p!.legs[1]!.stops.map((s) => s.hasWater)).toEqual([false, true]);
    expect(p!.legs[0]!.stops[0]).toMatchObject({ cell: pf.stops[0], hasWater: true });
    const v = p!.mobs[0]!;
    expect(v).toMatchObject({
      mob,
      head: 12,
      onPasture: true,
      step: 0,
      leg: 0,
      stop: 0,
      roundsDone: 0,
      roundInLeg: 0,
      moves: 0,
      paused: false,
      waiting: null,
      daysOnStop: 1,
    });
    expect(v.next).toMatchObject({ kind: 'move', rule: 'days', onDay: 3, cell: pf.stops[1] });
    // Three days on, one more move to make; the day it falls on is the end of day 3.
    const d2 = days(planned, 2);
    expect(view(d2)[0]!.mobs[0]!.next).toMatchObject({ kind: 'move', onDay: 3 });
    // At the end of leg 1, the first stop of leg 2 has no water: the plan waits there, and the mob is still on leg 1.
    const leg2 = days(planned, 8);
    const v2 = view(leg2)[0]!.mobs[0]!;
    expect(v2).toMatchObject({ leg: 0, stop: 1, step: 1, roundsDone: 0, moves: 1 });
    expect(v2.next).toMatchObject({ kind: 'waiting', why: 'no-water' });
    // A paused plan says so.
    const paused = work(planned, { type: 'pausePlan', mob }).farm;
    expect(view(paused)[0]!.mobs[0]!).toMatchObject({ paused: true, next: { kind: 'paused' } });
    // The last stop, with the rounds done: the next move ends the plan.
    const end: PlanSpec = {
      legs: [{ stops: [pf.stops[0]!, pf.stops[1]!], rule: { mode: 'days', every: 1 }, rounds: 1 }],
      after: 'stay',
    };
    const last = days(work(farm, { type: 'setPlan', mob, plan: end }).farm, 1);
    expect(view(last)[0]!.mobs[0]!.next).toEqual({ kind: 'finish' });
    // Reading changes nothing.
    const h = farmHash(planned);
    view(planned);
    expect(farmHash(planned)).toBe(h);
  });

  it('a "grazed down to" plan says where the feed is and when it moves at the latest', () => {
    const { pf, farm, mob } = stocked();
    const spec: PlanSpec = {
      legs: [{ stops: pf.stops, rule: { mode: 'kg', kg: 800, maxDays: 6 }, rounds: 0 }],
      after: 'repeat',
    };
    const planned = work(farm, { type: 'setPlan', mob, plan: spec }).farm;
    const n = view(days(planned, 2))[0]!.mobs[0]!.next;
    expect(n).toMatchObject({ kind: 'move', rule: 'kg', kg: 800, latestDay: 5, onDay: null });
    expect(n.kind === 'move' && n.massKgHa).toBeGreaterThan(0);
  });
});

describe('plans are saved with the farm', () => {
  it('save, load and carry on equals running straight through, part-way through a plan', () => {
    const { pf, farm, mob } = stocked();
    const spec: PlanSpec = {
      legs: [
        { stops: [pf.stops[0]!, pf.stops[1]!], rule: { mode: 'days', every: 2 }, rounds: 2 },
        {
          stops: [pf.stops[2]!, pf.stops[3]!],
          rule: { mode: 'kg', kg: 1200, maxDays: 5 },
          rounds: 0,
        },
      ],
      after: 'repeat',
    };
    let straight = work(farm, { type: 'setPlan', mob, plan: spec }).farm;
    straight = days(straight, 7);
    const saved = JSON.parse(JSON.stringify(saveFarm(straight)));
    let loaded = loadFarm(saved);
    expect(farmHash(loaded)).toBe(farmHash(straight));
    expect(loaded.plans).toEqual(straight.plans);
    expect(mobOf(loaded, mob).plan).toEqual(mobOf(straight, mob).plan);
    for (let i = 0; i < 25; i++) {
      straight = endDay(straight).farm;
      loaded = endDay(loaded).farm;
      expect(farmHash(loaded), `day ${i}`).toBe(farmHash(straight));
      if (i % 9 === 4) loaded = loadFarm(JSON.parse(JSON.stringify(saveFarm(loaded))));
    }
    expect(mobOf(straight, mob).plan!.moves).toBeGreaterThan(5);
  });

  it('a paused and a waiting plan survive a save', () => {
    const { pf, farm, mob } = stocked({ dry: [1] });
    const planned = days(work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops, 1) }).farm, 3);
    expect(mobOf(planned, mob).plan!.waiting).not.toBeNull();
    const back = loadFarm(JSON.parse(JSON.stringify(saveFarm(planned))));
    expect(mobOf(back, mob).plan).toEqual(mobOf(planned, mob).plan);
    const paused = work(planned, { type: 'pausePlan', mob }).farm;
    const back2 = loadFarm(JSON.parse(JSON.stringify(saveFarm(paused))));
    expect(farmHash(back2)).toBe(farmHash(paused));
  });

  it('a save from before plans loads with none', () => {
    const { farm } = stocked();
    const saved = JSON.parse(JSON.stringify(saveFarm(farm)));
    saved.saveFormat = 5;
    delete saved.plans;
    delete saved.nextPlanId;
    const old = loadFarm(saved);
    expect(old.plans).toEqual([]);
    expect(old.nextPlanId).toBe(1);
    expect(old.mobs.every((m) => m.plan === undefined)).toBe(true);
    // It carries on exactly as a farm with no plan.
    expect(farmHash(days(old, 5))).toBe(farmHash(days(farm, 5)));
  });

  it('is hashed: a different step is a different farm', () => {
    const { pf, farm, mob } = stocked();
    const a = work(farm, { type: 'setPlan', mob, plan: rotation(pf.stops) }).farm;
    const b = work(a, { type: 'pausePlan', mob }).farm;
    expect(farmHash(a)).not.toBe(farmHash(b));
    expect(farmHash(a)).not.toBe(farmHash(farm));
  });
});

describe('mobs that join, and other places a plan meets the farm', () => {
  it('a mob that joins another keeps its plan if the biggest has none', () => {
    const { pf, farm, mob } = stocked({ head: 6 });
    const two = setUp(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 20,
      to: { cell: pf.stops[1]! },
    });
    const big = two.mobs.find((m) => m.id !== mob)!.id;
    const planned = work(two, { type: 'setPlan', mob, plan: rotation(pf.stops) }).farm;
    // The small mob, on a plan, is moved by hand into the big mob's paddock: they join, big keeps the plan.
    const joined = work(planned, { type: 'moveMob', mob, to: { cell: pf.stops[1]! } }).farm;
    expect(joined.mobs).toHaveLength(1);
    expect(joined.mobs[0]!.id).toBe(big);
    expect(joined.mobs[0]!.plan).toMatchObject({ template: 1, paused: true });
  });

  it('a farm with no plan is not changed by any of it', () => {
    const { farm } = stocked();
    const a = cloneFarm(farm);
    stepDay(a);
    expect(a.plans).toEqual([]);
    expect(thingsToDo(a).some((t) => t.type === 'plan-waiting')).toBe(false);
    expect(view(a)).toEqual([]);
    expect(applyAction(farm, { type: 'clearPlan', mob: farm.mobs[0]!.id }).ok).toBe(false);
  });
});
