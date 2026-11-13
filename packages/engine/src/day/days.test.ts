import { describe, expect, it, vi } from 'vitest';
import { PLENTY, openFarm, twoPaddockFarm } from '../../test-support/wholeFarm';
import {
  across,
  atLastLight,
  busyFarm,
  setUp,
  turnedDown,
  withLightLeft,
  work,
} from '../../test-support/workingDay';
import { SPECIES } from '../data/species';
import { GRID_N } from '../grid';
import { LAND } from '../pasture/state';
import { farmHash } from '../save/save';
import { createFarm } from '../sim/create';
import { lightOn } from '../sim/clock';
import { dateOn, surveyOf } from '../sim/derived';
import { cloneFarm, type FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { endDay, skipDays, stopsIn, waterCheck } from './days';
import { bookingsView, clockView, jobsInProgress } from './look';

/*
 * Next day and skips (PRD 5.3): each day has its own light, jobs in
 * progress carry on in turn, and a skip stops early for everything the
 * MVP stopped its clock for.
 */

vi.setConfig({ testTimeout: 600_000 });

const NO_TRAVEL = { work: { travel: false } } as const;

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

const fallowOf = (farm: FarmState): number[] => {
  const out: number[] = [];
  for (let i = 0; i < GRID_N; i++) if (farm.pasture.land[i] === LAND.fallow) out.push(i);
  return out;
};

/** A farm with steers in a paddock that has no water. */
function dryMob(): { farm: FarmState; mob: number; area: string } {
  const farm = twoPaddockFarm('nsw');
  const s = surveyOf(farm);
  const dry = s.topology.areas.find((a) => !s.points.areaTroughs[a.id]!.length)!;
  const stocked = setUp(farm, {
    type: 'buyCattle',
    cls: 'yearSteer',
    qty: 30,
    to: { cell: dry.cells[0]! },
  });
  return { farm: stocked, mob: stocked.mobs[0]!.id, area: dry.name };
}

describe('Next day', () => {
  it('runs the daily tick and starts a new day at first light, with the player at the homestead', () => {
    const b = busyFarm();
    const out = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    const next = endDay(out);
    expect(next.farm.day).toBe(1);
    expect(next.day.day).toBe(0);
    expect(next.day.ran).toBe(true);
    expect(next.farm.clock.used).toBe(0);
    expect(next.farm.clock.at).toEqual(clockView(b.farm).at);
    // The new day has its own first light.
    expect(next.farm.clock.firstLight).not.toBe(out.clock.firstLight);
    expect(dateOn(next.farm)).toEqual({ year: 2023, month: 8, date: 2 });
    // The farm passed in is not changed.
    expect(out.day).toBe(0);
  });

  it('is exactly the daily tick: the same farm as stepping the day directly', () => {
    const b = busyFarm();
    const out = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    const stepped = cloneFarm(out);
    const result = stepDay(stepped);
    const next = endDay(out);
    expect(farmHash(next.farm)).toBe(farmHash(stepped));
    expect(next.day.events).toEqual(result.events);
  });

  it('reports the light left unused and the drive home', () => {
    const b = busyFarm();
    const out = work(b.farm, { type: 'refillPortable', port: b.port });
    const next = endDay(out.farm);
    expect(next.lightLeftMin).toBeCloseTo(out.job.leftAfterMin, 9);
    expect(next.homeMin).toBeCloseTo(out.job.homeMin, 9);
    expect(next.homeMin).toBeGreaterThan(0);
  });

  it('does not work jobs in progress: they wait for the player, or a skip', () => {
    const farm = openFarm('nsw', NO_TRAVEL);
    const day1 = work(farm, { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' });
    const next = endDay(endDay(day1.farm).farm).farm;
    expect(next.jobs[0]!.piecesDone).toBe(10);
    expect(jobsInProgress(next)[0]!.doneShare).toBeCloseTo(10 / 36, 9);
  });

  it('sums the day up as facts and figures', () => {
    const b = busyFarm();
    const next = endDay(b.farm);
    const s = next.summary;
    expect(s.daysRun).toBe(1);
    expect(s.fromDay).toBe(0);
    expect(s.toDay).toBe(1);
    expect(s.fromDate).toEqual({ year: 2023, month: 8, date: 1 });
    expect(s.toDate).toEqual({ year: 2023, month: 8, date: 2 });
    // 12 cows and 40 steers, and 12 calves.
    expect(s.head).toEqual({ before: 52, after: 52 });
    expect(s.calves).toEqual({ before: 12, after: 12 });
    expect(s.cash.after).toBe(next.farm.cash);
    expect(s.cash.before).toBe(b.farm.cash);
    expect(s.money.running).toBeCloseTo(next.farm.year.running - b.farm.year.running, 9);
    expect(s.eatenKg).toBeGreaterThan(0);
    expect(s.eatenKg).toBeCloseTo(next.farm.year.eaten - b.farm.year.eaten, 6);
    expect(s.gainKg).toBeCloseTo(next.farm.year.gain - b.farm.year.gain, 6);
    expect(s.liveWeightKg.after - s.liveWeightKg.before).toBeCloseTo(s.gainKg, 6);
    expect(s.mobs.map((m) => m.id).sort()).toEqual([b.cows, b.steers].sort());
    // Every mob has its day's figures: weight, gain, diet ME and CP.
    for (const m of s.mobs) expect(m.day).not.toBeNull();
    let events = 0;
    for (const n of Object.values(s.events)) events += n;
    expect(events).toBe(next.day.events.length);
  });
});

describe('skips', () => {
  it('a week is 7 days, a month is 30, and any whole number of days can be asked for', () => {
    const farm = openFarm('nsw');
    const week = skipDays(farm, 'week');
    expect(week.asked).toBe(7);
    expect(week.daysRun).toBe(7);
    expect(week.farm.day).toBe(7);
    expect(week.stops).toEqual([]);
    expect(week.days.map((d) => d.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const month = skipDays(farm, 'month');
    expect(month.asked).toBe(30);
    expect(month.farm.day).toBe(30);
    expect(skipDays(farm, 12).farm.day).toBe(12);
    expect(() => skipDays(farm, 0)).toThrow(/whole number of days/);
    expect(() => skipDays(farm, 2.5)).toThrow(/whole number of days/);
    // The farm passed in is not changed.
    expect(farm.day).toBe(0);
  });

  it('is the same as Next day that many times, on a farm with no jobs in progress', () => {
    const b = busyFarm();
    let byDay = b.farm;
    for (let i = 0; i < 7; i++) byDay = endDay(byDay).farm;
    expect(farmHash(skipDays(b.farm, 'week').farm)).toBe(farmHash(byDay));
  });

  it('a year is 365 days, and ends with the year closing', () => {
    const farm = openFarm('nsw');
    const year = skipDays(farm, 'year');
    expect(year.asked).toBe(365);
    expect(year.daysRun).toBe(365);
    expect(year.farm.years.length).toBe(1);
    expect(year.stops).toEqual([{ type: 'year-end', year: 1 }]);
  });

  it('each day still has its own light', () => {
    const farm = openFarm('wv', { size: 260, start: { year: 2023, month: 8 }, ...NO_TRAVEL });
    // 3,000 m of permanent fence: six days. Each day's work starts at that day's first light.
    const edges = [...across(8, 5, 34), ...across(14, 5, 34)];
    const day1 = work(farm, { type: 'buildFence', edges, fence: 'permanent' });
    const week = skipDays(day1.farm, 'week');
    const worked = week.farm.inbox.filter((m) => m.event.type === 'job-worked').slice(1);
    expect(worked.length).toBe(5);
    const starts = worked.map((m) => (m.event.type === 'job-worked' ? m.event.start : 0));
    // September in Western Victoria: first light is earlier each day.
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeLessThan(starts[i - 1]!);
    // Each day's work starts at that day's first light and runs the whole of its light.
    for (const m of worked) {
      if (m.event.type !== 'job-worked') continue;
      const light = lightOn(farm, m.day);
      expect(m.event.start).toBe(light.firstLight);
      expect(m.event.workMin).toBeCloseTo(light.minutes, 6);
      expect(m.at).toBe(m.event.end);
    }
  });
});

describe('jobs in progress during a skip', () => {
  it('finish over the right number of days', () => {
    // 1,800 m of permanent fence: 500 m on the first day, then three more days.
    const farm = openFarm('nsw', NO_TRAVEL);
    const day1 = work(farm, { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' });
    expect(day1.job.moreDays).toBe(3);
    // Two more days are not enough.
    const two = skipDays(day1.farm, 2);
    expect(two.farm.jobs.length).toBe(1);
    expect(two.farm.jobs[0]!.piecesDone).toBe(20);
    expect(two.summary.jobs).toEqual([
      expect.objectContaining({ jobId: 1, action: 'buildFence', finished: false }),
    ]);
    // The first day's part was done before the skip. The skip's first day is the day
    // it was started on, when the light is already gone.
    expect(two.summary.jobs[0]!.doneShare.before).toBeCloseTo(10 / 36, 9);
    expect(two.summary.jobs[0]!.doneShare.after).toBeCloseTo(20 / 36, 9);
    // Four days from the start of day 0 finish it: days 1, 2 and 3.
    const four = skipDays(day1.farm, 4);
    expect(four.farm.jobs).toEqual([]);
    expect(four.summary.jobs[0]).toMatchObject({ finished: true, doneShare: { after: 1 } });
    // The work is in the log as the days it was done on.
    const days = four.farm.actionLog
      .filter((a) => a.action.type === 'continueJob')
      .map((a) => a.day);
    expect(days).toEqual([1, 2, 3]);
    // And the cost came off as it was built: 36 squares at $350.
    expect(four.summary.money.infra).toBe(26 * 350);
  });

  it('carry on oldest first, each using what is left of the day in turn', () => {
    const farm = openFarm('nsw', NO_TRAVEL);
    // Job 1: 750 m. Job 2: 1,000 m. Both started, 500 m of the first built.
    const a = work(farm, { type: 'buildFence', edges: across(8, 2, 16), fence: 'permanent' });
    let f = endDay(a.farm).farm;
    const b = work(withLightLeft(f, 1), {
      type: 'buildFence',
      edges: across(16, 2, 21),
      fence: 'permanent',
    });
    f = b.farm;
    expect(f.jobs.map((j) => j.id)).toEqual([1, 2]);
    // One day of the skip: job 1 takes the half day it needs (250 m), job 2 gets the other half.
    const one = skipDays(endDay(f).farm, 1);
    expect(one.farm.jobs.map((j) => j.id)).toEqual([2]);
    const p1 = one.summary.jobs.find((j) => j.jobId === 1)!;
    const p2 = one.summary.jobs.find((j) => j.jobId === 2)!;
    expect(p1.finished).toBe(true);
    expect(p2.finished).toBe(false);
    // Job 2 got half a day: 250 m of its 1,000 m, on top of the sliver from its first minute.
    expect(p2.doneShare.after - p2.doneShare.before).toBeCloseTo(0.25, 6);
    // In the log, job 1 was worked before job 2 that day.
    const order = one.farm.actionLog
      .filter((x) => x.day === 2 && x.action.type === 'continueJob')
      .map((x) => (x.action.type === 'continueJob' ? x.action.job : 0));
    expect(order).toEqual([1, 2]);
  });

  it('a job the bank will not cover waits, and the summary says why', () => {
    const farm = openFarm('nsw', NO_TRAVEL);
    const day1 = work(farm, { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' });
    const poor = cloneFarm(day1.farm);
    poor.cash = poor.overdraft + 5000;
    const week = skipDays(poor, 'week');
    expect(week.daysRun).toBe(7);
    expect(week.farm.jobs[0]!.piecesDone).toBe(10);
    expect(week.summary.jobs).toEqual([]);
    expect(week.summary.jobsWaiting).toEqual([
      {
        jobId: 1,
        action: 'buildFence',
        reason: 'bank-limit',
        message: expect.stringMatching(/^The bank won't lend that much for fencing\./),
      },
    ]);
  });
});

describe('what stops a skip', () => {
  it('a mob with no water: the skip does not start, and says which mob', () => {
    const { farm, mob, area } = dryMob();
    expect(waterCheck(farm)).toEqual([
      { type: 'no-water', when: 'before', mob, mobName: 'Mob 1', area },
    ]);
    const week = skipDays(farm, 'week');
    expect(week.daysRun).toBe(0);
    expect(week.farm).toBe(farm);
    expect(week.stops).toEqual([{ type: 'no-water', when: 'before', mob, mobName: 'Mob 1', area }]);
    expect(week.summary.daysRun).toBe(0);
    // Next day is not checked: it runs.
    expect(endDay(farm).farm.day).toBe(1);
  });

  it('run anyway, it stops after the first day without water', () => {
    const { farm, mob, area } = dryMob();
    const week = skipDays(farm, 'week', {}, { anyway: true });
    expect(week.daysRun).toBe(1);
    expect(week.stops).toEqual([{ type: 'no-water', when: 'during', mob, mobName: 'Mob 1', area }]);
    expect(endDay(farm).stops).toEqual(week.stops);
    // Run anyway again and it goes on to day 4, when everything dies.
    const on = skipDays(week.farm, 'week', {}, { anyway: true });
    expect(on.daysRun).toBe(7);
    expect(on.summary.deathsByCause).toEqual({ noWater: 30 });
    expect(on.summary.head).toEqual({ before: 30, after: 0 });
  });

  it('a portable trough with under 3 days of water: the skip does not start', () => {
    const { farm } = dryMob();
    const s = surveyOf(farm);
    const dry = s.topology.areas.find((a) => !s.points.areaTroughs[a.id]!.length)!;
    let f = setUp(farm, { type: 'placePortable', cell: dry.cells[0]! });
    expect(waterCheck(f)).toEqual([]);
    // 30 steers drink about 1,000 L a day from a 6,000 L trough. After 4 days it has under 3 left.
    const four = skipDays(f, 4);
    expect(four.daysRun).toBe(4);
    f = four.farm;
    const pt = f.layout.water.ports[0]!;
    expect(pt.level / pt.lastUse).toBeLessThan(3);
    expect(pt.level / pt.lastUse).toBeGreaterThan(1);
    const stopped = skipDays(f, 'week');
    expect(stopped.daysRun).toBe(0);
    expect(stopped.stops).toEqual([
      {
        type: 'trough-low',
        when: 'before',
        portId: pt.id,
        cell: pt.cell,
        daysLeft: Math.floor(pt.level / pt.lastUse),
      },
    ]);
    // With 3 days or more in it, the skip runs.
    const fuller = cloneFarm(f);
    fuller.layout.water.ports[0]!.level = pt.lastUse * 3;
    expect(skipDays(fuller, 1).daysRun).toBe(1);
    const lower = cloneFarm(f);
    lower.layout.water.ports[0]!.level = pt.lastUse * 2.999;
    expect(skipDays(lower, 1).daysRun).toBe(0);
  });

  it('a portable trough running dry stops the skip that day', () => {
    const { farm } = dryMob();
    const s = surveyOf(farm);
    const dry = s.topology.areas.find((a) => !s.points.areaTroughs[a.id]!.length)!;
    const f = setUp(farm, { type: 'placePortable', cell: dry.cells[0]! });
    const run = skipDays(f, 'month', {}, { anyway: true });
    expect(run.daysRun).toBeLessThan(10);
    expect(run.stops.map((x) => x.type)).toEqual(['trough-empty']);
    expect(run.stops[0]).toMatchObject({ portId: f.layout.water.ports[0]!.id, paddock: dry.name });
    expect(run.farm.layout.water.ports[0]!.level).toBe(0);
  });

  it('a crop ready to harvest', () => {
    const farm = mixedFarm();
    const run = skipDays(farm, 'year');
    expect(run.daysRun).toBeLessThan(365);
    expect(run.stops.length).toBeGreaterThan(0);
    for (const stop of run.stops) expect(stop.type).toBe('harvest-ready');
    const stop = run.stops[0]!;
    if (stop.type !== 'harvest-ready') throw new Error('expected a harvest');
    expect(run.farm.crops.fields.some((f) => f.id === stop.fieldId)).toBe(true);
    expect(stop.estimate.t).toBeGreaterThan(0);
    // Nothing earlier in the skip was a reason to stop.
    for (const day of run.days.slice(0, -1)) expect(stopsIn(day)).toEqual([]);
  });

  it('the end of a year, wherever in the skip it falls', () => {
    const farm = openFarm('nsw');
    const near = skipDays(farm, 360).farm;
    const run = skipDays(near, 'month');
    expect(run.daysRun).toBe(5);
    expect(run.farm.day).toBe(365);
    expect(run.stops).toEqual([{ type: 'year-end', year: 1 }]);
  });

  it('game over at the bank, and nothing runs after it', () => {
    const farm = openFarm('nsw');
    const broke = cloneFarm(farm);
    broke.cash = broke.broke + 1;
    const run = skipDays(broke, 'week');
    expect(run.daysRun).toBe(1);
    expect(run.stops).toEqual([{ type: 'game-over', reason: 'bank' }]);
    expect(run.farm.over).toEqual({ reason: 'bank', day: 1 });
    const again = skipDays(run.farm, 'week');
    expect(again.daysRun).toBe(0);
    expect(again.farm).toBe(run.farm);
    expect(again.stops).toEqual([{ type: 'game-over', reason: 'bank' }]);
    const next = endDay(run.farm);
    expect(next.day.ran).toBe(false);
    expect(next.farm.day).toBe(1);
    expect(next.stops).toEqual([{ type: 'game-over', reason: 'bank' }]);
    expect(turnedDown(run.farm, { type: 'placePortable', cell: 5 }).reason).toBe('game-over');
  });

  it('game over when the whole farm is eaten out for 10 days', () => {
    const farm = openFarm('nsw');
    let f = setUp(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 400,
      to: { cell: farm.layout.water.bore },
    });
    f = cloneFarm(f);
    f.pasture.G.fill(0);
    f.pasture.D.fill(0);
    const run = skipDays(f, 'month');
    expect(run.daysRun).toBe(10);
    expect(run.stops).toEqual([{ type: 'game-over', reason: 'feed' }]);
  });

  it('nothing else stops it: deaths, breakouts, weaning and notes are reported, not stops', () => {
    const b = busyFarm();
    const month = skipDays(b.farm, 'month');
    expect(month.daysRun).toBe(30);
    expect(month.stops).toEqual([]);
    expect(Object.keys(month.summary.events).length).toBeGreaterThan(0);
  });
});

describe('contractors: sowing and harvest', () => {
  it('sowing is booked: no time from the player, done at first light three days on, and paid for then', () => {
    const farm = mixedFarm();
    const fallow = fallowOf(farm);
    const cost = fallow.length * farm.layout.scale.haPerSquare * SPECIES.barley.cost;
    const booked = work(farm, { type: 'sow', species: 'barley', cells: fallow });
    expect(booked.job.outcome).toBe('booked');
    expect(booked.job.workMin).toBe(0);
    expect(booked.job.travelMin).toBe(0);
    expect(booked.job.dueDay).toBe(3);
    expect(booked.job.cost).toBeCloseTo(cost, 6);
    expect(booked.job.costToday).toBe(0);
    // Nothing is sown, nothing is paid, and the clock has not moved.
    expect(booked.farm.cash).toBe(farm.cash);
    expect(booked.farm.clock.used).toBe(0);
    expect(booked.farm.crops.fields.length).toBe(farm.crops.fields.length);
    expect(booked.events).toEqual([
      { type: 'booking-made', bookingId: 1, action: 'sow', dueDay: 3, quote: booked.job.cost },
    ]);
    expect(bookingsView(booked.farm)).toEqual([
      expect.objectContaining({ id: 1, type: 'sow', bookedDay: 0, dueDay: 3, daysToGo: 3 }),
    ]);

    // Two days on, still nothing.
    const two = skipDays(booked.farm, 2);
    expect(two.farm.crops.fields.length).toBe(farm.crops.fields.length);
    expect(two.dawn).toEqual([]);
    expect(bookingsView(two.farm)[0]!.daysToGo).toBe(1);
    // The third day's first light: sown, and charged.
    const third = endDay(two.farm);
    expect(third.farm.day).toBe(3);
    expect(third.dawn.map((e) => e.type)).toEqual(['booking-done', 'sown']);
    expect(third.farm.crops.fields.length).toBe(farm.crops.fields.length + 1);
    expect(third.farm.bookings).toEqual([]);
    expect(third.farm.year.crops - two.farm.year.crops).toBeCloseTo(cost, 6);
    expect(third.summary.bookingsDone).toBe(1);
    // The clock is still at first light: it took none of the player's day.
    expect(third.farm.clock.used).toBe(0);
    // The message is in the inbox, at first light on the day it was done.
    const msg = third.farm.inbox.find((m) => m.event.type === 'sown')!;
    expect(msg.day).toBe(3);
    expect(msg.at).toBe(third.farm.clock.firstLight);
  });

  it('a contractor can be booked after last light, and called off before the work is done', () => {
    const farm = atLastLight(mixedFarm());
    const booked = work(farm, { type: 'sow', species: 'barley', cells: fallowOf(farm) });
    expect(booked.job.outcome).toBe('booked');
    const off = work(booked.farm, { type: 'cancelBooking', booking: 1 });
    expect(off.farm.bookings).toEqual([]);
    expect(off.events).toEqual([{ type: 'booking-cancelled', bookingId: 1, action: 'sow' }]);
    expect(turnedDown(off.farm, { type: 'cancelBooking', booking: 1 }).reason).toBe(
      'no-such-booking',
    );
    const later = skipDays(off.farm, 5);
    expect(later.farm.crops.fields.length).toBe(farm.crops.fields.length);
    expect(later.farm.cash).toBeGreaterThan(farm.cash - 1000);
  });

  it('a booking is refused on the spot for the reasons sowing is refused', () => {
    const farm = mixedFarm();
    const before = farmHash(farm);
    // With no squares picked, or without the money, it is refused when it is asked for.
    const no = turnedDown(farm, { type: 'sow', species: 'barley', cells: [] });
    expect(no.message.length).toBeGreaterThan(10);
    const poor = cloneFarm(farm);
    poor.cash = poor.overdraft + 10;
    expect(turnedDown(poor, { type: 'sow', species: 'barley', cells: fallowOf(farm) }).reason).toBe(
      'bank-limit',
    );
    expect(farmHash(farm)).toBe(before);
  });

  it('if the bank will not lend on the day, the work is not done and the reason is given', () => {
    const farm = mixedFarm();
    const booked = work(farm, { type: 'sow', species: 'barley', cells: fallowOf(farm) }).farm;
    const poor = cloneFarm(booked);
    poor.cash = poor.overdraft + 10;
    const run = skipDays(poor, 3);
    expect(run.dawn).toEqual([
      {
        day: 3,
        events: [
          {
            type: 'booking-failed',
            bookingId: 1,
            action: 'sow',
            reason: 'bank-limit',
            message: expect.stringMatching(/^The bank won't lend that much for sowing\./),
          },
        ],
      },
    ]);
    expect(run.farm.bookings).toEqual([]);
    expect(run.farm.crops.fields.length).toBe(farm.crops.fields.length);
    expect(run.summary.bookingsFailed).toBe(1);
  });

  it('harvest is booked the same way: the grain is banked three days on', () => {
    const start = mixedFarm();
    const ready = skipDays(start, 'year');
    const stop = ready.stops[0]!;
    if (stop.type !== 'harvest-ready') throw new Error('expected a crop to come ready');
    const booked = work(ready.farm, { type: 'harvest', field: stop.fieldId });
    expect(booked.job.outcome).toBe('booked');
    expect(booked.job.dueDay).toBe(ready.farm.day + 3);
    // The quote is harvest costs less the grain: money in, so it is negative.
    expect(booked.job.cost).toBeLessThan(0);
    expect(booked.farm.year.grain).toBe(ready.farm.year.grain);
    /** Three Next days, with what happened at each first light. */
    const threeDays = (from: FarmState): { farm: FarmState; dawn: string[] } => {
      let farm = from;
      const dawn: string[] = [];
      for (let i = 0; i < 3; i++) {
        const next = endDay(farm);
        farm = next.farm;
        dawn.push(...next.dawn.map((e) => e.type));
      }
      return { farm, dawn };
    };
    const done = threeDays(booked.farm);
    expect(done.dawn).toEqual(['booking-done', 'harvested']);
    expect(done.farm.year.grain).toBeGreaterThan(ready.farm.year.grain);
    expect(done.farm.bookings).toEqual([]);
    // A crop can't be harvested twice: a second booking for it fails on the day.
    const twice = work(booked.farm, { type: 'harvest', field: stop.fieldId });
    expect(threeDays(twice.farm).dawn).toEqual(['booking-done', 'harvested', 'booking-failed']);
  });
});
