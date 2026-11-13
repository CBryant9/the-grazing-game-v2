import { describe, expect, it, vi } from 'vitest';
import { PLENTY, openFarm, twoPaddockFarm } from '../../test-support/wholeFarm';
import { across, busyFarm, setUp, turnedDown, work } from '../../test-support/workingDay';
import { farmHash } from '../save/save';
import { lightOn } from '../sim/clock';
import { createFarm } from '../sim/create';
import { dateOn, surveyOf } from '../sim/derived';
import { cloneFarm, type FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { endDay, skipDays, stopsIn, waterCheck } from './days';
import { clockView } from './look';

/*
 * Next day and skips (PRD 5.3): each day has its own light, nothing
 * carries over from one day to the next, and a skip stops early for
 * everything the MVP stopped its clock for.
 */

vi.setConfig({ testTimeout: 600_000 });

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
  it('runs the daily tick and starts a new day at first light', () => {
    const b = busyFarm();
    const out = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    expect(out.clock.used).toBe(30);
    const next = endDay(out);
    expect(next.farm.day).toBe(1);
    expect(next.day.day).toBe(0);
    expect(next.day.ran).toBe(true);
    expect(next.farm.clock.used).toBe(0);
    // The new day has its own first light.
    expect(next.farm.clock.firstLight).not.toBe(out.clock.firstLight);
    expect(next.farm.clock.firstLight).toBe(lightOn(out, 1).firstLight);
    expect(dateOn(next.farm)).toEqual({ year: 2023, month: 8, date: 2 });
    // The farm passed in is not changed.
    expect(out.day).toBe(0);
    expect(out.clock.used).toBe(30);
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

  it('reports the light left unused', () => {
    const b = busyFarm();
    const out = work(b.farm, { type: 'refillPortable', port: b.port });
    const next = endDay(out.farm);
    expect(next.lightLeftMin).toBe(out.job.leftAfterMin);
    expect(next.lightLeftMin).toBeCloseTo(out.job.dayMin - 30, 9);
  });

  it('builds nothing: the part of a line that did not fit yesterday is not carried on', () => {
    const farm = openFarm('nsw');
    const day1 = work(farm, { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' });
    expect(day1.job.line!.fits.metres).toBe(500);
    const next = endDay(endDay(day1.farm).farm).farm;
    expect(next.year.infra).toBe(day1.farm.year.infra);
    expect(Array.from(next.layout.fences.hE)).toEqual(Array.from(day1.farm.layout.fences.hE));
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

  it('is the same as Next day that many times', () => {
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

  it('each day still has its own light, and the day after a skip starts at first light', () => {
    const farm = openFarm('wv', { size: 260, start: { year: 2023, month: 8 } });
    const used = work(farm, { type: 'placePortable', cell: 5 }).farm;
    const week = skipDays(used, 'week');
    const c = clockView(week.farm);
    expect(c.usedMin).toBe(0);
    expect(c.firstLight).toBe(lightOn(farm, 7).firstLight);
    // September in Western Victoria: the days are getting longer.
    expect(c.dayMin).toBeGreaterThan(clockView(farm).dayMin + 10);
  });

  it('builds nothing: a line cut short before a skip is as it was after it', () => {
    const farm = openFarm('nsw');
    const day1 = work(farm, { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' });
    const week = skipDays(day1.farm, 'week');
    expect(week.daysRun).toBe(7);
    expect(week.summary.money.infra).toBe(0);
    expect(Array.from(week.farm.layout.fences.hE)).toEqual(Array.from(day1.farm.layout.fences.hE));
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
    expect(stopsIn(week.days[0]!)).toEqual(week.stops);
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
