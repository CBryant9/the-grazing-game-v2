import { describe, expect, it, vi } from 'vitest';
import { PLENTY, openFarm } from '../../test-support/wholeFarm';
import {
  across,
  busyFarm,
  cell,
  down,
  farmWithCropReady,
  setUp,
  turnedDown,
  withLightLeft,
  work,
} from '../../test-support/workingDay';
import type { Action, ActionType } from '../actions/types';
import { EDGE, getEdge } from '../farm/topology';
import { GRID_N } from '../grid';
import { LAND } from '../pasture/state';
import { farmHash } from '../save/save';
import { createFarm } from '../sim/create';
import { surveyOf } from '../sim/derived';
import { cloneFarm, type FarmState } from '../sim/state';
import { applyAction, previewAction } from './act';
import { endDay } from './days';
import { jobsInProgress } from './look';

/*
 * Jobs too big for today (PRD 5.1): the part that fits is built now, the
 * rest is a job in progress that carries on when the player next spends
 * daylight on it, and it can be given up.
 */

vi.setConfig({ testTimeout: 600_000 });

const NO_TRAVEL = { work: { travel: false } } as const;

/** Carry a job on every day until it is finished. Returns the farm, and the metres built each day. */
function carryOnUntilDone(start: FarmState, job: number): { farm: FarmState; metres: number[] } {
  let farm = start;
  const metres: number[] = [];
  for (let d = 0; d < 60; d++) {
    farm = endDay(farm).farm;
    const done = work(farm, { type: 'continueJob', job });
    farm = done.farm;
    metres.push(done.job.line!.metresToday);
    if (done.job.outcome === 'done') return { farm, metres };
  }
  throw new Error('the job never finished');
}

/** The fence codes along a run. */
const codes = (farm: FarmState, edges: readonly { line: 'h' | 'v'; index: number }[]): number[] =>
  edges.map((e) => getEdge(farm.layout.fences, e));

describe('a long permanent fence', () => {
  // 36 squares of 50 m: 1,800 m. At 500 m a day that is 500, 500, 500 and 300.
  const line = across(12, 2, 37);
  const build: Action = { type: 'buildFence', edges: line, fence: 'permanent' };

  it('takes four days at 500 m a day, and stops each day where the light ran out', () => {
    const farm = openFarm('nsw', NO_TRAVEL);
    const day1 = work(farm, build);
    expect(day1.job.outcome).toBe('part');
    expect(day1.job.fitsToday).toBe(false);
    expect(day1.job.line!.metresToday).toBeCloseTo(500, 6);
    expect(day1.job.moreDays).toBe(3);
    expect(day1.job.leftAfterMin).toBeCloseTo(0, 6);
    // The first 10 squares stand, in the order drawn. The rest are not there yet.
    expect(codes(day1.farm, line.slice(0, 10))).toEqual(Array(10).fill(EDGE.permanent));
    expect(codes(day1.farm, line.slice(10))).toEqual(Array(26).fill(EDGE.none));

    const rest = carryOnUntilDone(day1.farm, day1.job.jobId!);
    expect(rest.metres.length).toBe(3);
    expect(rest.metres[0]).toBeCloseTo(500, 6);
    expect(rest.metres[1]).toBeCloseTo(500, 6);
    expect(rest.metres[2]).toBeCloseTo(300, 6);
    expect(rest.farm.day).toBe(3);
    expect(rest.farm.jobs).toEqual([]);
    expect(codes(rest.farm, line)).toEqual(Array(36).fill(EDGE.permanent));
  });

  it('with the drive counted, each day builds a little under 500 m', () => {
    const farm = openFarm('nsw');
    const day1 = work(farm, build);
    expect(day1.job.travelMin).toBeGreaterThan(0);
    expect(day1.job.homeMin).toBeGreaterThan(0);
    expect(day1.job.line!.metresToday).toBeLessThan(500);
    expect(day1.job.line!.metresToday).toBeGreaterThan(480);
    // The share of the day on the fence is the share of 500 m built.
    expect(day1.job.line!.metresToday).toBeCloseTo((500 * day1.job.workMin) / day1.job.dayMin, 6);
    const rest = carryOnUntilDone(day1.farm, day1.job.jobId!);
    expect(rest.metres.length).toBe(3);
    expect(day1.job.line!.metresToday + rest.metres.reduce((a, b) => a + b, 0)).toBeCloseTo(
      1800,
      6,
    );
  });

  it('ends up the same fence as if it were built at once', () => {
    const farm = openFarm('nsw');
    const atOnce = setUp(farm, build);
    const day1 = work(farm, build);
    const over4 = carryOnUntilDone(day1.farm, day1.job.jobId!).farm;
    expect(Array.from(over4.layout.fences.hE)).toEqual(Array.from(atOnce.layout.fences.hE));
    expect(Array.from(over4.layout.fences.vE)).toEqual(Array.from(atOnce.layout.fences.vE));
    expect(over4.ledger).toEqual(atOnce.ledger);
    expect(over4.year.infra).toBe(atOnce.year.infra);
    // 36 squares at $350 each.
    expect(over4.year.infra).toBe(12600);
    expect(surveyOf(over4).topology.paddocks.length).toBe(
      surveyOf(atOnce).topology.paddocks.length,
    );
  });

  it('tape and electric fence go up far faster: the same line is up in under two hours', () => {
    const farm = openFarm('nsw', NO_TRAVEL);
    const tape = work(farm, { type: 'buildFence', edges: line, fence: 'tape' });
    const electric = work(farm, { type: 'buildFence', edges: line, fence: 'electric' });
    // 1,800 m: 36 minutes of tape at 3 km an hour, 1 h 48 m of electric at 1 km an hour.
    expect(tape.job.outcome).toBe('done');
    expect(tape.job.workMin).toBeCloseTo(36, 9);
    expect(electric.job.outcome).toBe('done');
    expect(electric.job.workMin).toBeCloseTo(108, 9);
    expect(codes(tape.farm, line)).toEqual(Array(36).fill(EDGE.tape));
    // The permanent fence takes more than 24 times as long as the electric.
    const permanent = work(farm, build);
    expect(permanent.job.totalWorkMin / electric.job.workMin).toBeGreaterThan(24);
  });

  it('the day stops part-way along a square, and the map is told how far', () => {
    // A line of 100 m squares (1,040 ha): 500 m is 5 squares, so with the
    // drive counted the day ends part-way along the fifth.
    const farm = openFarm('nsw', { size: 1040 });
    const day1 = work(farm, { type: 'buildFence', edges: across(12, 2, 20), fence: 'permanent' });
    expect(day1.job.line!.piecesToday).toBe(4);
    const [view] = jobsInProgress(day1.farm);
    expect(view!.line!.piecesDone).toBe(4);
    expect(view!.line!.pieces).toBe(19);
    // Pegs for the 15 squares still to do, in the order drawn.
    expect(view!.line!.pegs).toEqual(across(12, 6, 20).map((edge) => ({ edge })));
    const half = view!.line!.half!;
    expect(half.piece).toEqual({ edge: across(12, 6, 6)[0] });
    expect(half.share).toBeGreaterThan(0.8);
    expect(half.share).toBeLessThan(1);
    // The built part of that square runs from its left end, where the line had got to.
    expect(half.from).toEqual({ x: 6, y: 12 });
    expect(half.to.y).toBe(12);
    expect(half.to.x).toBeCloseTo(6 + half.share, 12);
    // The player is standing where the line stopped.
    expect(day1.farm.clock.at).toEqual(half.to);
    expect(view!.doneShare).toBeCloseTo((4 + half.share) / 19, 12);
    // The half-built square is not a fence yet.
    expect(getEdge(day1.farm.layout.fences, across(12, 6, 6)[0]!)).toBe(EDGE.none);
    // The next day carries on from part-way along it.
    const next = work(endDay(day1.farm).farm, { type: 'continueJob', job: view!.id });
    expect(next.job.line!.metres).toBeCloseTo((15 - half.share) * 100, 6);
  });

  it('a line drawn right to left is built right to left', () => {
    const farm = openFarm('nsw', NO_TRAVEL);
    const backwards = [...line].reverse();
    const day1 = work(farm, { type: 'buildFence', edges: backwards, fence: 'permanent' });
    expect(codes(day1.farm, line.slice(26))).toEqual(Array(10).fill(EDGE.permanent));
    expect(codes(day1.farm, line.slice(0, 26))).toEqual(Array(26).fill(EDGE.none));
  });
});

describe('money on a job in progress', () => {
  const line = across(12, 2, 37);
  const build: Action = { type: 'buildFence', edges: line, fence: 'permanent' };

  it('is charged as the fence is built: each day pays for the squares that went up', () => {
    const farm = openFarm('nsw', NO_TRAVEL);
    const day1 = work(farm, build);
    // 10 squares at $350.
    expect(day1.job.costToday).toBe(3500);
    expect(day1.job.cost).toBe(12600);
    expect(farm.cash - day1.farm.cash).toBe(3500);
    expect(day1.farm.jobs[0]!.spent).toBe(3500);
    expect(day1.farm.year.infra).toBe(3500);
    const day2 = work(endDay(day1.farm).farm, { type: 'continueJob', job: 1 });
    expect(day2.job.costToday).toBe(3500);
    // What is left to pay when the day starts.
    expect(day2.job.cost).toBe(9100);
    expect(day2.farm.jobs[0]!.spent).toBe(7000);
  });

  it('giving the job up keeps what was built and what was spent, and charges nothing more', () => {
    const farm = openFarm('nsw', NO_TRAVEL);
    const day1 = work(farm, build);
    const gone = work(day1.farm, { type: 'cancelJob', job: 1 });
    expect(gone.job.outcome).toBe('free');
    expect(gone.farm.jobs).toEqual([]);
    expect(gone.farm.cash).toBe(day1.farm.cash);
    expect(codes(gone.farm, line.slice(0, 10))).toEqual(Array(10).fill(EDGE.permanent));
    expect(gone.events).toEqual([
      { type: 'job-stopped', jobId: 1, action: 'buildFence', why: 'cancelled', spent: 3500 },
    ]);
    // It takes no time, and it can't be carried on or given up twice.
    expect(gone.farm.clock.used).toBe(day1.farm.clock.used);
    expect(turnedDown(gone.farm, { type: 'continueJob', job: 1 }).reason).toBe('no-such-job');
    expect(turnedDown(gone.farm, { type: 'cancelJob', job: 1 }).reason).toBe('no-such-job');
    // Days later the money has not moved for the job.
    const later = endDay(endDay(gone.farm).farm).farm;
    expect(later.year.infra).toBe(3500);
  });

  it('the bank must cover the whole line before it starts', () => {
    const farm = openFarm('nsw', NO_TRAVEL);
    const tight = cloneFarm(farm);
    // $12,600 is needed. $12,599 of room is not enough, though the first day's $3,500 is.
    tight.cash = tight.overdraft + 12599;
    const no = turnedDown(tight, build);
    expect(no.reason).toBe('bank-limit');
    expect(no.message).toMatch(/The bank won't lend that much for fencing\. It costs \$12,600/);
    tight.cash = tight.overdraft + 12600;
    expect(work(tight, build).job.outcome).toBe('part');
  });

  it('a job waits, with the reason, when the bank will not cover what is left', () => {
    const farm = openFarm('nsw', NO_TRAVEL);
    const day1 = work(farm, build);
    const next = endDay(day1.farm).farm;
    // $9,100 is left to pay. Leave $9,099 of room.
    next.cash = next.overdraft + 9099;
    const no = turnedDown(next, { type: 'continueJob', job: 1 });
    expect(no.reason).toBe('bank-limit');
    expect(no.message).toMatch(/It costs \$9,100/);
    expect(jobsInProgress(next)[0]!.carryOn).toEqual(no);
    // The job is still there, and carries on when the money is.
    next.cash = next.overdraft + 9100;
    expect(work(next, { type: 'continueJob', job: 1 }).job.costToday).toBe(3500);
  });

  it('the energiser is bought once, with the first electric fence built', () => {
    // 200 m squares (4,160 ha): the line is 7.2 km, more than a day of electric fence.
    const farm = openFarm('nsw', { size: 4160, ...NO_TRAVEL });
    const each = Math.round(3.6 * 200);
    const day1 = work(withLightLeft(farm, 120), {
      type: 'buildFence',
      edges: line,
      fence: 'electric',
    });
    // 2 hours at 1 km an hour: 2,000 m, 10 squares, and the $900 energiser.
    expect(day1.job.line!.piecesToday).toBe(10);
    expect(day1.job.costToday).toBe(10 * each + 900);
    expect(day1.farm.energiser).toBe(true);
    const day2 = work(endDay(day1.farm).farm, { type: 'continueJob', job: 1 });
    expect(day2.job.outcome).toBe('done');
    expect(day2.job.costToday).toBe(26 * each);
    expect(day2.farm.ledger.energiser).toBe(900);
  });

  it('the $10 for running tape off the roll, or rolling it up, is paid once for the job', () => {
    const farm = openFarm('nsw', { size: 4160, ...NO_TRAVEL });
    const each = Math.round(0.9 * 200);
    // Put out 36 squares of new tape, then roll it all up over two days.
    let f = setUp(farm, { type: 'buildFence', edges: line, fence: 'tape' });
    const roll1 = work(withLightLeft(f, 60), { type: 'rollUpTape', edge: line[0]! });
    // An hour at 3 km an hour: 3,000 m, 15 squares.
    expect(roll1.job.line!.piecesToday).toBe(15);
    expect(roll1.job.costToday).toBe(10);
    expect(roll1.farm.layout.tapeOnRoll).toBe(15);
    const roll2 = work(endDay(roll1.farm).farm, { type: 'continueJob', job: roll1.job.jobId! });
    expect(roll2.job.outcome).toBe('done');
    expect(roll2.job.costToday).toBe(0);
    expect(roll2.farm.layout.tapeOnRoll).toBe(36);
    expect(roll2.events.find((e) => e.type === 'layout-job')).toMatchObject({ job: 'rollUpTape' });

    // Run 20 squares back out over two days: off the roll, $10 once.
    f = roll2.farm;
    const out1 = work(withLightLeft(f, 40), {
      type: 'buildFence',
      edges: across(14, 2, 21),
      fence: 'tape',
    });
    expect(out1.job.line!.piecesToday).toBe(10);
    expect(out1.job.costToday).toBe(10);
    const out2 = work(endDay(out1.farm).farm, { type: 'continueJob', job: out1.job.jobId! });
    expect(out2.job.costToday).toBe(0);
    expect(out2.farm.layout.tapeOnRoll).toBe(16);
    // And a run longer than the roll pays for the new tape as it goes out.
    const long = work(withLightLeft(out2.farm, 40), {
      type: 'buildFence',
      edges: across(16, 2, 25),
      fence: 'tape',
    });
    expect(long.job.costToday).toBe(10);
    const long2 = work(endDay(long.farm).farm, { type: 'continueJob', job: long.job.jobId! });
    // 24 squares: 16 off the roll, 8 new. The first day used 10 off the roll.
    expect(long2.job.costToday).toBe(8 * each);
  });
});

describe('jobs that take effect when they are finished', () => {
  it('a trough started with an hour of light left is there the next day, and paid for then', () => {
    const b = busyFarm({ work: { travel: false } });
    const late = withLightLeft(b.farm, 60);
    const day1 = work(late, { type: 'placeTrough', cell: b.pipedCell });
    expect(day1.job.outcome).toBe('part');
    expect(day1.job.workMin).toBeCloseTo(60, 9);
    expect(day1.job.totalWorkMin).toBe(180);
    expect(day1.job.doneShare).toBeCloseTo(1 / 3, 9);
    expect(day1.job.moreDays).toBe(1);
    // Quoted in full, charged when it is built.
    expect(day1.job.cost).toBe(1500);
    expect(day1.job.costToday).toBe(0);
    expect(day1.farm.cash).toBe(late.cash);
    expect(day1.farm.layout.water.troughs).toEqual(late.layout.water.troughs);
    expect(day1.events.map((e) => e.type)).toEqual(['job-worked']);
    expect(day1.events[0]).toMatchObject({ jobId: 1, finished: false });

    const day2 = work(endDay(day1.farm).farm, { type: 'continueJob', job: 1 });
    expect(day2.job.outcome).toBe('done');
    expect(day2.job.workMin).toBeCloseTo(120, 9);
    expect(day2.job.costToday).toBe(1500);
    expect(day2.farm.layout.water.troughs).toContain(b.pipedCell);
    expect(day2.farm.jobs).toEqual([]);
    expect(day2.events.map((e) => e.type)).toEqual(['job-worked', 'layout-job']);
  });

  it('given up before it is finished, nothing was built and nothing is charged', () => {
    const b = busyFarm({ work: { travel: false } });
    const late = withLightLeft(b.farm, 60);
    const day1 = work(late, { type: 'placeTrough', cell: b.pipedCell });
    const gone = work(day1.farm, { type: 'cancelJob', job: 1 });
    expect(gone.farm.cash).toBe(late.cash);
    expect(gone.farm.layout.water.troughs).toEqual(late.layout.water.troughs);
    expect(gone.events[0]).toMatchObject({ type: 'job-stopped', why: 'cancelled', spent: 0 });
  });

  it('a mob moves when the move is finished, and the move says what time that was', () => {
    const b = busyFarm({ work: { travel: false } });
    const late = withLightLeft(b.farm, 10);
    const day1 = work(late, { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } });
    expect(day1.job.outcome).toBe('part');
    const where = (f: FarmState): number =>
      surveyOf(f).topology.areaOf[
        (f.mobs.find((m) => m.id === b.steers)!.where as { anchor: number }).anchor
      ]!;
    expect(where(day1.farm)).toBe(where(b.farm));
    const day2 = work(endDay(day1.farm).farm, { type: 'continueJob', job: 1 });
    expect(day2.job.outcome).toBe('done');
    // 15.4 minutes in all, 10 of them yesterday.
    expect(day2.job.workMin).toBeCloseTo(5.4, 6);
    expect(where(day2.farm)).toBe(surveyOf(day2.farm).topology.areaOf[b.emptyCell]);
    const moved = day2.events.find((e) => e.type === 'mob-moved');
    expect(moved).toMatchObject({ at: day2.job.endsAt });
  });

  it('a job that can no longer be done ends, with the reason', () => {
    const b = busyFarm({ work: { travel: false } });
    const late = withLightLeft(b.farm, 10);
    const day1 = work(late, { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } });
    // The whole mob is sold before the move is finished.
    const next = endDay(day1.farm).farm;
    const sold = setUp(next, { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 40 });
    const tried = work(sold, { type: 'continueJob', job: 1 });
    expect(tried.farm.jobs).toEqual([]);
    expect(tried.events).toEqual([
      {
        type: 'job-stopped',
        jobId: 1,
        action: 'moveMob',
        why: 'cannot-carry-on',
        reason: 'no-such-mob',
        message: 'That mob is not on the farm.',
        spent: 0,
      },
    ]);
    expect(tried.farm.clock.used).toBe(0);
  });
});

describe('several jobs in progress', () => {
  it('each keeps its own place, and each carries on when it is asked to', () => {
    const farm = openFarm('nsw', { work: { travel: false } });
    const a = work(farm, { type: 'buildFence', edges: across(8, 2, 21), fence: 'permanent' });
    // The light is gone, so the second job is started the next day.
    expect(
      turnedDown(a.farm, { type: 'buildFence', edges: across(16, 2, 21), fence: 'permanent' })
        .reason,
    ).toBe('no-daylight');
    let f = endDay(a.farm).farm;
    const b = work(f, { type: 'buildFence', edges: across(16, 2, 21), fence: 'permanent' });
    expect(b.job.jobId).toBe(2);
    expect(b.farm.jobs.map((j) => j.id)).toEqual([1, 2]);
    expect(b.farm.jobs.map((j) => j.piecesDone)).toEqual([10, 10]);
    f = endDay(b.farm).farm;
    // Half a day each: 250 m on the second, then what is left of the day on the first.
    const half = withLightLeft(f, (f.clock.lastLight - f.clock.firstLight) / 2);
    const b2 = work(half, { type: 'continueJob', job: 2 });
    expect(b2.job.line!.metresToday).toBeCloseTo(250, 6);
    expect(b2.farm.jobs.map((j) => j.piecesDone)).toEqual([10, 15]);
    const full = work(f, { type: 'continueJob', job: 1 });
    expect(full.job.outcome).toBe('done');
    expect(full.farm.jobs.map((j) => j.id)).toEqual([2]);
    // Ids are never reused.
    const c = work(endDay(full.farm).farm, {
      type: 'buildFence',
      edges: across(20, 2, 37),
      fence: 'permanent',
    });
    expect(c.job.jobId).toBe(3);
  });

  it('squares someone else has built since are not built twice', () => {
    const farm = openFarm('nsw', { work: { travel: false } });
    const line = across(12, 2, 37);
    const day1 = work(farm, { type: 'buildFence', edges: line, fence: 'permanent' });
    let f = endDay(day1.farm).farm;
    // Squares 17 to 32 go up some other way.
    f = setUp(f, { type: 'buildFence', edges: across(12, 17, 32), fence: 'permanent' });
    const day2 = work(f, { type: 'continueJob', job: 1 });
    // What is left: squares 12 to 16 and 33 to 37. 10 squares, 500 m: the whole day.
    expect(day2.job.line!.pieces).toBe(10);
    expect(day2.job.outcome).toBe('done');
    expect(codes(day2.farm, line)).toEqual(Array(36).fill(EDGE.permanent));
    // And if everything left is already there, the job is finished without a minute spent.
    let g = endDay(day1.farm).farm;
    g = setUp(g, { type: 'buildFence', edges: line, fence: 'permanent' });
    const none = work(g, { type: 'continueJob', job: 1 });
    expect(none.farm.jobs).toEqual([]);
    expect(none.farm.clock.used).toBe(0);
    expect(none.events[0]).toMatchObject({ type: 'job-worked', finished: true, workMin: 0 });
  });
});

describe('a fence that closes on a later day', () => {
  it('divides the mob on the day the last square goes up, not before', () => {
    const farm = openFarm('nsw', { work: { travel: false } });
    const bore = farm.layout.water.bore;
    const stocked = setUp(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 60,
      to: { cell: bore },
    });
    // A fence from one side of the farm to the other, 26 squares: three days.
    const wall = down(20, 0, 25);
    const day1 = work(stocked, { type: 'buildFence', edges: wall, fence: 'permanent' });
    expect(day1.farm.mobs.length).toBe(1);
    expect(day1.events.some((e) => e.type === 'mob-split')).toBe(false);
    const day2 = work(endDay(day1.farm).farm, { type: 'continueJob', job: 1 });
    expect(day2.farm.mobs.length).toBe(1);
    const day3 = work(endDay(day2.farm).farm, { type: 'continueJob', job: 1 });
    expect(day3.job.outcome).toBe('done');
    expect(surveyOf(day3.farm).topology.paddocks.length).toBe(2);
    expect(day3.events.some((e) => e.type === 'mob-split')).toBe(true);
    expect(day3.farm.mobs.length).toBe(2);
  });
});

describe('the job card and the job agree, for every kind of action', () => {
  /** A mixed farm in Central West, starting in June when barley can be sown. */
  const mixedFarm = (): FarmState =>
    createFarm({
      seed: 4,
      district: 'cw',
      size: 'small',
      start: { year: 2022, month: 5 },
      startType: 'scratch',
      mixed: { arablePct: 40, croppedPct: 50 },
      difficulty: 'easy',
      money: { ...PLENTY },
    });

  /** A farm with a job in progress and a booking, for the three actions that act on those. */
  function withJobAndBooking(): { farm: FarmState; job: number; booking: number; field: number } {
    const ready = farmWithCropReady(mixedFarm);
    const fenced = work(ready.farm, {
      type: 'buildFence',
      edges: across(13, 2, 37),
      fence: 'permanent',
    });
    const booked = work(fenced.farm, { type: 'harvest', field: ready.field });
    return {
      farm: booked.farm,
      job: fenced.job.jobId!,
      booking: booked.job.bookingId!,
      field: ready.field,
    };
  }

  it('the card is what happens, to the last figure', () => {
    const b = busyFarm();
    const m = withJobAndBooking();
    const june = mixedFarm();
    const fallow: number[] = [];
    for (let i = 0; i < GRID_N; i++) if (june.pasture.land[i] === LAND.fallow) fallow.push(i);
    expect(fallow.length).toBeGreaterThan(4);

    // Every kind of action, each on a farm where it can be done.
    const cases: Record<ActionType, { farm: FarmState; action: Action }[]> = {
      buyCattle: [
        {
          farm: b.farm,
          action: { type: 'buyCattle', cls: 'yearSteer', qty: 5, to: { cell: b.emptyCell } },
        },
      ],
      sellAnimals: [
        {
          farm: b.farm,
          action: {
            type: 'sellAnimals',
            ids: b.farm.mobs[0]!.animals.slice(0, 3).map((a) => a.id),
          },
        },
      ],
      sellGroup: [
        { farm: b.farm, action: { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 10 } },
      ],
      sellClass: [{ farm: b.farm, action: { type: 'sellClass', cls: 'cow', qty: 3 } }],
      moveMob: [
        { farm: b.farm, action: { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } } },
        { farm: b.farm, action: { type: 'moveMob', mob: b.steers, to: 'lot' } },
        // With 12 minutes of light left it does not fit today.
        {
          farm: withLightLeft(b.farm, 12),
          action: { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } },
        },
      ],
      moveCattle: [
        {
          farm: b.farm,
          action: {
            type: 'moveCattle',
            picks: [{ mob: b.steers, cls: 'yearlingSteer', qty: 15 }],
            to: { cell: b.emptyCell },
          },
        },
      ],
      setSupplement: [
        { farm: b.farm, action: { type: 'setSupplement', mob: b.steers, supp: 'hay' } },
        { farm: b.farm, action: { type: 'setSupplement', mob: b.steers, supp: 'none' } },
      ],
      wean: [{ farm: b.farm, action: { type: 'wean', mob: b.cows } }],
      markCalves: [{ farm: b.farm, action: { type: 'markCalves', mob: b.cows } }],
      buildFence: [
        {
          farm: b.farm,
          action: { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' },
        },
        {
          farm: b.farm,
          action: { type: 'buildFence', edges: across(12, 2, 37), fence: 'electric' },
        },
        { farm: b.farm, action: { type: 'buildFence', edges: across(12, 2, 37), fence: 'tape' } },
      ],
      removeFence: [{ farm: b.farm, action: { type: 'removeFence', edges: b.fenceRun } }],
      rollUpTape: [{ farm: b.farm, action: { type: 'rollUpTape', edge: b.tape } }],
      placeGate: [{ farm: b.farm, action: { type: 'placeGate', edge: b.tape } }],
      removeGate: [{ farm: b.farm, action: { type: 'removeGate', edge: b.gate } }],
      setGate: [{ farm: b.farm, action: { type: 'setGate', edge: b.gate, open: true } }],
      fixFence: [{ farm: b.farm, action: { type: 'fixFence', edge: b.downed } }],
      layPipe: [{ farm: b.farm, action: { type: 'layPipe', cells: [cell(33, 10), cell(34, 10)] } }],
      placeTrough: [{ farm: b.farm, action: { type: 'placeTrough', cell: b.pipedCell } }],
      moveTrough: [
        { farm: b.farm, action: { type: 'moveTrough', from: b.trough, to: b.pipedCell } },
      ],
      removeTrough: [{ farm: b.farm, action: { type: 'removeTrough', cell: b.trough } }],
      placeFenceHub: [
        {
          farm: setUp(b.farm, { type: 'removeHub', vertex: b.hub }),
          action: { type: 'placeFenceHub', vertex: b.hub },
        },
      ],
      removeHub: [{ farm: b.farm, action: { type: 'removeHub', vertex: b.hub } }],
      placeSquareHub: [{ farm: b.farm, action: { type: 'placeSquareHub', cell: b.pipedCell } }],
      placePortable: [{ farm: b.farm, action: { type: 'placePortable', cell: b.openCell } }],
      movePortable: [
        { farm: b.farm, action: { type: 'movePortable', port: b.port, cell: b.openCell } },
      ],
      refillPortable: [{ farm: b.farm, action: { type: 'refillPortable', port: b.port } }],
      removePortable: [{ farm: b.farm, action: { type: 'removePortable', port: b.port } }],
      sow: [{ farm: june, action: { type: 'sow', species: 'barley', cells: fallow } }],
      harvest: [
        {
          farm: work(m.farm, { type: 'cancelBooking', booking: m.booking }).farm,
          action: { type: 'harvest', field: m.field },
        },
      ],
      continueJob: [
        { farm: endDay(m.farm).farm, action: { type: 'continueJob', job: m.job } },
        // The same day it was started, the light is gone.
        { farm: m.farm, action: { type: 'continueJob', job: m.job } },
      ],
      cancelJob: [{ farm: m.farm, action: { type: 'cancelJob', job: m.job } }],
      cancelBooking: [{ farm: m.farm, action: { type: 'cancelBooking', booking: m.booking } }],
    };

    const outcomes = new Set<string>();
    let refusals = 0;
    for (const [type, list] of Object.entries(cases)) {
      for (const { farm, action } of list) {
        expect(action.type).toBe(type);
        const before = farmHash(farm);
        const card = previewAction(farm, action);
        expect(farmHash(farm), `${type}: the card changed the farm`).toBe(before);
        const done = applyAction(farm, action);
        expect(farmHash(farm), `${type}: the job changed the farm it was given`).toBe(before);
        if (!done.ok) {
          // Refused: the card gives the same reason.
          expect(card, type).toEqual(done);
          refusals++;
          continue;
        }
        expect(card, type).toEqual({ ok: true, card: done.job });
        const c = done.job!;
        outcomes.add(c.outcome);
        // The farm did what the card said: the clock, the money, the job in progress.
        expect(done.farm.clock.used, type).toBeCloseTo(
          c.usedBeforeMin + c.travelMin + c.workMin,
          6,
        );
        expect(c.leftAfterMin, type).toBeCloseTo(c.dayMin - done.farm.clock.used, 6);
        expect(farm.cash - done.farm.cash, type).toBeCloseTo(c.costToday, 6);
        expect(c.endsAt - c.startsAt, type).toBeCloseTo(c.travelMin + c.workMin, 6);
        expect(c.fitsToday, type).toBe(c.outcome !== 'part');
        if (c.outcome === 'part') {
          expect(
            done.farm.jobs.some((j) => j.id === c.jobId),
            type,
          ).toBe(true);
          expect(c.moreDays, type).toBeGreaterThan(0);
        }
        if (c.outcome === 'done') expect(c.cost, type).toBeCloseTo(c.costToday, 6);
        if (c.outcome === 'booked') {
          expect(
            done.farm.bookings.some((x) => x.id === c.bookingId),
            type,
          ).toBe(true);
          expect(c.costToday).toBe(0);
        }
        // The last entry in the action log is this job, with its times.
        const logged = done.farm.actionLog.at(-1)!;
        expect(logged.action.type, type).toBe(type);
        expect(logged.at, type).toEqual({ start: c.startsAt, end: c.endsAt });
      }
    }
    // Every way a job can come out was seen, and one refusal.
    expect([...outcomes].sort()).toEqual(['booked', 'done', 'free', 'part']);
    expect(refusals).toBe(1);
  });
});
