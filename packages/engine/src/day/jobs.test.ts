import { describe, expect, it, vi } from 'vitest';
import { PLENTY, openFarm } from '../../test-support/wholeFarm';
import {
  across,
  busyFarm,
  cell,
  down,
  farmWithCropReady,
  setUp,
  toSaleDay,
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

/*
 * What fits in today's light (Claudia, 14 Nov 2026). A job done in one go
 * is done if it fits and refused if it does not. A line of fence, tape or
 * pipe is built as far as its whole pieces fit, and the rest is not built
 * and not remembered: "draw it again tomorrow". Nothing carries over.
 */

vi.setConfig({ testTimeout: 600_000 });

const NOT_TODAY = "You don't have enough time to do this today.";

/** The fence codes along a run. */
const codes = (farm: FarmState, edges: readonly { line: 'h' | 'v'; index: number }[]): number[] =>
  edges.map((e) => getEdge(farm.layout.fences, e));

/** The grazing area a mob is on. */
const areaOf = (f: FarmState, mob: number): number =>
  surveyOf(f).topology.areaOf[
    (f.mobs.find((m) => m.id === mob)!.where as { anchor: number }).anchor
  ]!;

describe('a line too long for today', () => {
  // 36 squares of 50 m: 1,800 m of permanent fence. A day builds 500 m.
  const line = across(12, 2, 37);
  const build: Action = { type: 'buildFence', edges: line, fence: 'permanent' };

  it('the part that fits is built, in the order drawn, and the rest is not', () => {
    const farm = openFarm('nsw');
    const day1 = work(farm, build);
    const c = day1.job;
    expect(c.outcome).toBe('part');
    expect(c.fitsToday).toBe(false);
    // The first 10 squares stand. The other 26 are not there.
    expect(codes(day1.farm, line.slice(0, 10))).toEqual(Array(10).fill(EDGE.permanent));
    expect(codes(day1.farm, line.slice(10))).toEqual(Array(26).fill(EDGE.none));
    // The card gives the split, for the screen to draw one part in the fence's colour and the rest in red.
    expect(c.line).toEqual({
      fits: { pieces: line.slice(0, 10).map((edge) => ({ edge })), metres: 500 },
      doesNotFit: { pieces: line.slice(10).map((edge) => ({ edge })), metres: 1300 },
    });
    expect(c.notToday).toEqual({ reason: 'not-enough-daylight', message: NOT_TODAY });
    // "This would use up your full day."
    expect(c.usesRestOfDay).toBe(true);
    expect(c.workMin).toBeCloseTo(c.dayMin, 6);
    expect(c.leftAfterMin).toBeCloseTo(0, 6);
    // The whole line would take 3.6 days of light.
    expect(c.totalWorkMin).toBeCloseTo(3.6 * c.dayMin, 6);
    expect(day1.events[0]).toEqual({
      type: 'job-worked',
      action: 'buildFence',
      start: c.startsAt,
      end: c.endsAt,
      workMin: c.workMin,
      finished: false,
      pieces: { built: 10, notBuilt: 26 },
    });
    // The job card said all of that before the fence was built.
    expect(previewAction(farm, build)).toEqual({ ok: true, card: c });
  });

  it('the rest is not remembered: nothing carries on by itself, and it is drawn again another day', () => {
    const farm = openFarm('nsw');
    let f = work(farm, build).farm;
    // The farm keeps no job in progress.
    expect('jobs' in f).toBe(false);
    expect(JSON.stringify(f.actionLog.at(-1)!.action)).toBe(JSON.stringify(build));
    // Three days pass and nothing more is built.
    for (let d = 0; d < 3; d++) f = endDay(f).farm;
    expect(codes(f, line.slice(10))).toEqual(Array(26).fill(EDGE.none));
    expect(f.year.infra).toBe(3500);
    // Drawn again, the same line builds its next 500 m: the squares already up are not work.
    const again = work(f, build);
    expect(again.job.line!.fits.pieces).toEqual(line.slice(10, 20).map((edge) => ({ edge })));
    expect(again.job.line!.doesNotFit.metres).toBe(800);
    expect(codes(again.farm, line.slice(0, 20))).toEqual(Array(20).fill(EDGE.permanent));
  });

  it('drawn again each day it takes four days at 500 m a day, and ends up the same fence as built at once', () => {
    const farm = openFarm('nsw');
    const atOnce = setUp(farm, build);
    let f = farm;
    const metres: number[] = [];
    for (let d = 0; d < 10; d++) {
      const done = work(f, build);
      metres.push(done.job.line!.fits.metres);
      f = endDay(done.farm).farm;
      if (done.job.outcome === 'done') break;
    }
    expect(metres).toEqual([500, 500, 500, 300]);
    expect(Array.from(f.layout.fences.hE)).toEqual(Array.from(atOnce.layout.fences.hE));
    expect(Array.from(f.layout.fences.vE)).toEqual(Array.from(atOnce.layout.fences.vE));
    expect(f.ledger).toEqual(atOnce.ledger);
    expect(f.year.infra).toBe(atOnce.year.infra);
    // 36 squares at $350 each.
    expect(f.year.infra).toBe(12600);
    expect(surveyOf(f).topology.paddocks.length).toBe(surveyOf(atOnce).topology.paddocks.length);
  });

  it('tape and electric fence go up far faster: the same line is up in under two hours', () => {
    const farm = openFarm('nsw');
    const tape = work(farm, { type: 'buildFence', edges: line, fence: 'tape' });
    const electric = work(farm, { type: 'buildFence', edges: line, fence: 'electric' });
    // 1,800 m: 36 minutes of tape at 3 km an hour, 1 h 48 m of electric at 1 km an hour.
    expect(tape.job.outcome).toBe('done');
    expect(tape.job.workMin).toBeCloseTo(36, 9);
    expect(electric.job.outcome).toBe('done');
    expect(electric.job.workMin).toBeCloseTo(108, 9);
    expect(electric.job.usesRestOfDay).toBe(false);
    expect(codes(tape.farm, line)).toEqual(Array(36).fill(EDGE.tape));
    // The permanent fence takes more than 24 times as long as the electric.
    expect(work(farm, build).job.totalWorkMin / electric.job.workMin).toBeGreaterThan(24);
  });

  it('only whole squares are built: the light left over is less than the next square needs', () => {
    // 100 m squares (1,040 ha). Half a day is 250 m: two whole squares, and half a square's light to spare.
    const farm = openFarm('nsw', { size: 1040 });
    const half = withLightLeft(farm, (farm.clock.lastLight - farm.clock.firstLight) / 2);
    const done = work(half, { type: 'buildFence', edges: across(12, 2, 20), fence: 'permanent' });
    expect(done.job.line!.fits.metres).toBe(200);
    expect(done.job.line!.doesNotFit.metres).toBe(1700);
    // A fifth of the day goes on each square. Two fifths were used and a tenth is left.
    expect(done.job.workMin).toBeCloseTo(done.job.dayMin * 0.4, 6);
    expect(done.job.leftAfterMin).toBeCloseTo(done.job.dayMin * 0.1, 6);
    expect(done.job.usesRestOfDay).toBe(true);
    // The third square is not half built: it is not there at all.
    expect(getEdge(done.farm.layout.fences, across(12, 4, 4)[0]!)).toBe(EDGE.none);
    // The light left can still go on a job that fits in it.
    expect(work(done.farm, { type: 'placePortable', cell: cell(5, 5) }).job.outcome).toBe('done');
  });

  it('with no light for even one whole square, the line is refused with the reason', () => {
    const farm = openFarm('nsw', { size: 1040 });
    // A 100 m square of permanent fence is a fifth of the day. Leave a sixth.
    const late = withLightLeft(farm, (farm.clock.lastLight - farm.clock.firstLight) / 6);
    const before = farmHash(late);
    const no = turnedDown(late, {
      type: 'buildFence',
      edges: across(12, 2, 20),
      fence: 'permanent',
    });
    expect(no.reason).toBe('not-enough-daylight');
    expect(no.message).toMatch(
      /^You don't have enough time to do this today\. The first piece of the line takes 2 h \d+ m and there is 2 h \d+ m of light left\.$/,
    );
    expect(farmHash(late)).toBe(before);
    // A fifth of the day is enough for one square.
    const enough = withLightLeft(farm, (farm.clock.lastLight - farm.clock.firstLight) / 5);
    expect(
      work(enough, { type: 'buildFence', edges: across(12, 2, 20), fence: 'permanent' }).job.line!
        .fits.metres,
    ).toBe(100);
  });

  it('a line drawn right to left is built right to left', () => {
    const farm = openFarm('nsw');
    const backwards = [...line].reverse();
    const day1 = work(farm, { type: 'buildFence', edges: backwards, fence: 'permanent' });
    expect(codes(day1.farm, line.slice(26))).toEqual(Array(10).fill(EDGE.permanent));
    expect(codes(day1.farm, line.slice(0, 26))).toEqual(Array(26).fill(EDGE.none));
  });

  it('pipe and rolling up tape are cut short the same way', () => {
    // 200 m squares (4,160 ha). An hour lays 400 m of pipe: two squares.
    const farm = openFarm('nsw', { size: 4160 });
    const cells = [5, 6, 7, 8, 9].map((x) => cell(x, 4));
    const pipe = work(withLightLeft(farm, 60), { type: 'layPipe', cells });
    expect(pipe.job.outcome).toBe('part');
    expect(pipe.job.line).toEqual({
      fits: { pieces: [{ cell: cells[0] }, { cell: cells[1] }], metres: 400 },
      doesNotFit: { pieces: cells.slice(2).map((c) => ({ cell: c })), metres: 600 },
    });
    expect(Array.from(cells, (c) => pipe.farm.layout.water.pipe[c])).toEqual([1, 1, 0, 0, 0]);
    // An hour rolls up 3,000 m of tape: 15 of the 36 squares, from one end.
    const taped = setUp(farm, { type: 'buildFence', edges: line, fence: 'tape' });
    const roll = work(withLightLeft(taped, 60), { type: 'rollUpTape', edge: line[20]! });
    expect(roll.job.line!.fits.pieces.length).toBe(15);
    expect(roll.farm.layout.tapeOnRoll).toBe(15);
    expect(codes(roll.farm, line.slice(0, 15))).toEqual(Array(15).fill(EDGE.none));
    expect(codes(roll.farm, line.slice(15))).toEqual(Array(21).fill(EDGE.tape));
    expect(roll.events.find((e) => e.type === 'layout-job')).toMatchObject({ job: 'rollUpTape' });
  });
});

describe('money on a line cut short', () => {
  const line = across(12, 2, 37);
  const build: Action = { type: 'buildFence', edges: line, fence: 'permanent' };

  it('only what is built is charged', () => {
    const farm = openFarm('nsw');
    const day1 = work(farm, build);
    // 10 squares at $350. The whole line would be $12,600.
    expect(day1.job.costToday).toBe(3500);
    expect(day1.job.cost).toBe(12600);
    expect(farm.cash - day1.farm.cash).toBe(3500);
    expect(day1.farm.year.infra).toBe(3500);
    // Nothing more is owed for the part that was not built.
    const later = endDay(endDay(day1.farm).farm).farm;
    expect(later.year.infra).toBe(3500);
  });

  it("builder's rule: the bank must cover the whole line as drawn, though only part is built today", () => {
    const farm = openFarm('nsw');
    const tight = cloneFarm(farm);
    // $12,600 is needed. $12,599 of room is not enough, though today's $3,500 is.
    tight.cash = tight.overdraft + 12599;
    const no = turnedDown(tight, build);
    expect(no.reason).toBe('bank-limit');
    expect(no.message).toMatch(/The bank won't lend that much for fencing\. It costs \$12,600/);
    tight.cash = tight.overdraft + 12600;
    expect(work(tight, build).job.costToday).toBe(3500);
    // A shorter line the bank will cover can be drawn in its place.
    tight.cash = tight.overdraft + 3500;
    expect(
      work(tight, { type: 'buildFence', edges: line.slice(0, 10), fence: 'permanent' }).job.outcome,
    ).toBe('done');
  });

  it('the energiser is bought with the first electric fence built', () => {
    // 200 m squares (4,160 ha): the line is 7.2 km, more than two hours of electric fence.
    const farm = openFarm('nsw', { size: 4160 });
    const each = Math.round(3.6 * 200);
    const day1 = work(withLightLeft(farm, 120), {
      type: 'buildFence',
      edges: line,
      fence: 'electric',
    });
    // 2 hours at 1 km an hour: 2,000 m, 10 squares, and the $900 energiser.
    expect(day1.job.line!.fits.pieces.length).toBe(10);
    expect(day1.job.costToday).toBe(10 * each + 900);
    expect(day1.farm.energiser).toBe(true);
    // Drawn again the next day, the rest goes up and there is no second energiser.
    const day2 = work(endDay(day1.farm).farm, {
      type: 'buildFence',
      edges: line,
      fence: 'electric',
    });
    expect(day2.job.outcome).toBe('done');
    expect(day2.job.costToday).toBe(26 * each);
    expect(day2.farm.ledger.energiser).toBe(900);
  });

  it('each tape job pays its own $10 for the roll', () => {
    const farm = openFarm('nsw', { size: 4160 });
    const taped = setUp(farm, { type: 'buildFence', edges: line, fence: 'tape' });
    // An hour rolls up 15 squares for $10. The rest is another job on another day, and another $10.
    const roll1 = work(withLightLeft(taped, 60), { type: 'rollUpTape', edge: line[0]! });
    expect(roll1.job.costToday).toBe(10);
    const roll2 = work(endDay(roll1.farm).farm, { type: 'rollUpTape', edge: line[30]! });
    expect(roll2.job.outcome).toBe('done');
    expect(roll2.job.costToday).toBe(10);
    expect(roll2.farm.layout.tapeOnRoll).toBe(36);
  });
});

describe('a job done in one go fits today or it is refused', () => {
  it('a move with 21 minutes of light left fits, and the mob moves', () => {
    const b = busyFarm();
    const late = withLightLeft(b.farm, 21);
    const move: Action = { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } };
    const done = work(late, move);
    // 15.4 minutes of work, and that is all the job is: there is no drive out and no drive home.
    expect(done.job.outcome).toBe('done');
    expect(done.job.workMin).toBeCloseTo(15.4, 9);
    expect(done.job.totalWorkMin).toBeCloseTo(15.4, 9);
    expect(done.job.leftAfterMin).toBeCloseTo(5.6, 6);
    expect(done.job.notToday).toBeUndefined();
    expect(areaOf(done.farm, b.steers)).toBe(surveyOf(done.farm).topology.areaOf[b.emptyCell]);
    expect(previewAction(late, move)).toEqual({ ok: true, card: done.job });
  });

  it('with exactly the time it needs it fits, and with a little less it is refused and nothing happens', () => {
    const b = busyFarm();
    const move: Action = { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } };
    const just = work(withLightLeft(b.farm, 15.4), move);
    expect(just.job.outcome).toBe('done');
    expect(just.job.usesRestOfDay).toBe(true);
    expect(turnedDown(withLightLeft(b.farm, 15.3), move).reason).toBe('not-enough-daylight');
    const short = withLightLeft(b.farm, 12);
    const before = farmHash(short);
    const no = turnedDown(short, move);
    expect(no.reason).toBe('not-enough-daylight');
    expect(no.message).toBe(`${NOT_TODAY} It takes 15 m and there is 12 m of light left.`);
    expect(previewAction(short, move)).toEqual(no);
    // The card can not show a job worked and not done: there is no card, and nothing changed.
    expect(farmHash(short)).toBe(before);
    expect(areaOf(short, b.steers)).toBe(areaOf(b.farm, b.steers));
  });

  it('a trough with an hour of light left is refused, with how long it takes', () => {
    const b = busyFarm();
    const late = withLightLeft(b.farm, 60);
    const no = turnedDown(late, { type: 'placeTrough', cell: b.pipedCell });
    expect(no.reason).toBe('not-enough-daylight');
    expect(no.message).toBe(`${NOT_TODAY} It takes 3 h 0 m and there is 1 h 0 m of light left.`);
    // Nothing is built, nothing is charged and nothing waits for tomorrow.
    expect(late.layout.water.troughs).not.toContain(b.pipedCell);
    const next = endDay(late).farm;
    expect(next.layout.water.troughs).not.toContain(b.pipedCell);
    expect(next.year.infra).toBe(late.year.infra);
    // The next day it fits.
    const done = work(next, { type: 'placeTrough', cell: b.pipedCell });
    expect(done.job.outcome).toBe('done');
    expect(done.job.costToday).toBe(1500);
  });

  it('every job that is done has all its work done, and no job is left part-worked', () => {
    const b = busyFarm();
    const jobs: Action[] = [
      { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } },
      { type: 'wean', mob: b.cows },
      { type: 'markCalves', mob: b.cows },
      { type: 'placeTrough', cell: b.pipedCell },
      { type: 'movePortable', port: b.port, cell: b.openCell },
      { type: 'placeGate', edge: b.tape },
      { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 10 },
    ];
    let done = 0;
    let refused = 0;
    for (const action of jobs) {
      for (let left = 2; left <= 200; left += 3.5) {
        const farm = withLightLeft(b.farm, left);
        const out = applyAction(farm, action);
        if (!out.ok) {
          expect(out.reason, action.type).toBe('not-enough-daylight');
          expect(out.message.startsWith(NOT_TODAY), action.type).toBe(true);
          refused++;
          continue;
        }
        const c = out.job!;
        expect(c.outcome, action.type).toBe('done');
        expect(c.workMin, action.type).toBe(c.totalWorkMin);
        expect(c.workMin, action.type).toBeLessThanOrEqual(left + 1e-6);
        done++;
      }
    }
    expect(done).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(100);
  });
});

describe("builder's rule: a job longer than a day's light", () => {
  // A mob of 1,000 cows with 1,000 calves: weaning is 30 minutes and half a minute a head,
  // 30 + 0.5 x 2,000 = 1,030 minutes (17 h 10 m), more than any day's light.
  function bigPaddock(): { farm: FarmState; mob: number } {
    const farm = openFarm('nsw', { size: 4160 });
    const stocked = setUp(farm, {
      type: 'buyCattle',
      cls: 'cowCalf',
      qty: 1000,
      to: { cell: farm.layout.water.bore },
    });
    let k = 0;
    for (const a of stocked.mobs[0]!.animals) {
      if (a.kind !== 'calf') continue;
      a.age = 120;
      a.sex = k++ % 2 === 0 ? 'M' : 'F';
    }
    return { farm: stocked, mob: stocked.mobs[0]!.id };
  }

  it('can be done at first light, and takes the whole day', () => {
    const { farm, mob } = bigPaddock();
    const done = work(farm, { type: 'wean', mob });
    const c = done.job;
    expect(c.outcome).toBe('done');
    // The job is 17 h 10 m. The day is about 12 h 17 m.
    expect(c.totalWorkMin).toBeCloseTo(30 + 0.5 * 2000, 6);
    expect(c.totalWorkMin).toBeGreaterThan(c.dayMin);
    expect(c.workMin).toBe(c.dayMin);
    expect(c.leftAfterMin).toBe(0);
    expect(c.usesRestOfDay).toBe(true);
    expect(done.events.some((e) => e.type === 'weaned')).toBe(true);
    expect(turnedDown(done.farm, { type: 'placePortable', cell: 5 }).reason).toBe('no-daylight');
  });

  it('once anything else has been done that day it is refused, and the reason says to do it at first light', () => {
    const { farm, mob } = bigPaddock();
    const after = work(farm, { type: 'placePortable', cell: 5 }).farm;
    const no = turnedDown(after, { type: 'wean', mob });
    expect(no.reason).toBe('not-enough-daylight');
    expect(no.message).toBe(
      `${NOT_TODAY} It takes 17 h 10 m, which is more than a day's light. It can be done at first light, before anything else that day, and it takes the whole day.`,
    );
    // The next morning it can be done.
    expect(work(endDay(after).farm, { type: 'wean', mob }).job.outcome).toBe('done');
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

  it('the card is what happens, to the last figure', () => {
    const b = busyFarm();
    const ready = farmWithCropReady(mixedFarm);
    const june = mixedFarm();
    const fallow: number[] = [];
    for (let i = 0; i < GRID_N; i++) if (june.pasture.land[i] === LAND.fallow) fallow.push(i);
    expect(fallow.length).toBeGreaterThan(4);

    // Every kind of action, each on a farm where it can be done.
    // Cattle can be bought on a sale day only. Selling on a day with no sale books the stock onto the next.
    const saleDay = toSaleDay(b.farm);
    const booked = work(b.farm, { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 4 }).farm;
    const cases: Record<ActionType, { farm: FarmState; action: Action }[]> = {
      buyCattle: [{ farm: saleDay, action: { type: 'buyCattle', cls: 'yearSteer', qty: 5 } }],
      cancelSale: [{ farm: booked, action: { type: 'cancelSale' } }],
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
        // With 12 minutes of light left it does not fit today: refused.
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
      harvest: [{ farm: ready.farm, action: { type: 'harvest', field: ready.field } }],
    };
    // 30 kinds of action: everything a player can do.
    expect(Object.keys(cases).length).toBe(30);

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
        // The farm did what the card said: the clock and the money.
        expect(done.farm.clock.used, type).toBeCloseTo(c.usedBeforeMin + c.workMin, 6);
        expect(c.leftAfterMin, type).toBeCloseTo(c.dayMin - done.farm.clock.used, 6);
        expect(farm.cash - done.farm.cash, type).toBeCloseTo(c.costToday, 6);
        expect(c.endsAt - c.startsAt, type).toBeCloseTo(c.workMin, 6);
        expect(c.fitsToday, type).toBe(c.outcome !== 'part');
        if (c.outcome === 'part') {
          expect(c.line!.doesNotFit.pieces.length, type).toBeGreaterThan(0);
          expect(c.notToday!.message, type).toBe(NOT_TODAY);
          expect(c.workMin, type).toBeLessThan(c.totalWorkMin);
        } else {
          expect(c.cost, type).toBeCloseTo(c.costToday, 6);
          expect(c.notToday, type).toBeUndefined();
        }
        if (c.outcome === 'free') expect(c.workMin, type).toBe(0);
        // The last entry in the action log is this job, as asked, with its times.
        expect(done.farm.actionLog.at(-1), type).toEqual({
          day: farm.day,
          action,
          at: { start: c.startsAt, end: c.endsAt },
        });
      }
    }
    // Every way a job can come out was seen, and one refusal.
    expect([...outcomes].sort()).toEqual(['done', 'free', 'part']);
    expect(refusals).toBe(1);
  });
});

describe('a fence that closes a paddock', () => {
  it('divides the mob on the day its last square goes up, not before', () => {
    const farm = openFarm('nsw');
    const bore = farm.layout.water.bore;
    const stocked = setUp(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 60,
      to: { cell: bore },
    });
    // A fence from one side of the farm to the other, 26 squares: 1,300 m, three days.
    const wall: Action = { type: 'buildFence', edges: down(20, 0, 25), fence: 'permanent' };
    const day1 = work(stocked, wall);
    expect(day1.farm.mobs.length).toBe(1);
    expect(day1.events.some((e) => e.type === 'mob-split')).toBe(false);
    const day2 = work(endDay(day1.farm).farm, wall);
    expect(day2.farm.mobs.length).toBe(1);
    const day3 = work(endDay(day2.farm).farm, wall);
    expect(day3.job.outcome).toBe('done');
    expect(surveyOf(day3.farm).topology.paddocks.length).toBe(2);
    expect(day3.events.some((e) => e.type === 'mob-split')).toBe(true);
    expect(day3.farm.mobs.length).toBe(2);
  });
});
