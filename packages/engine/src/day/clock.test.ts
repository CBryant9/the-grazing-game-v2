import { describe, expect, it, vi } from 'vitest';
import { openFarm } from '../../test-support/wholeFarm';
import {
  across,
  atLastLight,
  busyFarm,
  cell,
  setUp,
  turnedDown,
  withLightLeft,
  work,
} from '../../test-support/workingDay';
import type { Action } from '../actions/types';
import { daylightFor } from '../daylight/daylight';
import { DISTRICT_PLACES } from '../daylight/places';
import { GRID_W } from '../grid';
import { farmHash, saveFarm } from '../save/save';
import { loadRealData } from '../server';
import { homesteadPoint, lightOn } from '../sim/clock';
import { createFarm } from '../sim/create';
import { dateOn, pricesOf, surveyOf } from '../sim/derived';
import { calibrationView, farmTotals, mobSummaries, paddockSummaries } from '../sim/summary';
import { stepDay } from '../sim/tick';
import { applyAction, previewAction } from './act';
import { endDay, skipDays, waterCheck } from './days';
import { bookingsView, clockView, jobsInProgress, jobsToday } from './look';

/*
 * The farm clock (PRD 5.1): every day runs from first light to last light,
 * looking is free, doing takes time, and when the light is gone no more
 * jobs can start.
 */

vi.setConfig({ testTimeout: 600_000 });

const DISTRICTS = ['cq', 'nsw', 'cw', 'wv'] as const;

describe('the day runs from first light to last light', () => {
  it('a new farm is at first light, with nothing used and the player at the homestead', () => {
    for (const district of DISTRICTS) {
      const farm = openFarm(district);
      const c = clockView(farm);
      expect(c.usedMin).toBe(0);
      expect(c.now).toBe(c.firstLight);
      expect(c.leftMin).toBe(c.dayMin);
      expect(c.dayMin).toBe(c.lastLight - c.firstLight);
      expect(c.canStartJobs).toBe(true);
      // The middle of the homestead's square.
      const h = farm.buildings.homestead;
      expect(c.at).toEqual({ x: (h % GRID_W) + 0.5, y: Math.floor(h / GRID_W) + 0.5 });
      expect(c.homeMin).toBe(0);
    }
  });

  it("first and last light are the district town's, on the date the game reports", () => {
    for (const district of DISTRICTS) {
      const farm = openFarm(district, { start: { year: 2021, month: 3 } });
      for (let d = 0; d < 3; d++) {
        const light = daylightFor(DISTRICT_PLACES[district], dateOn(farm));
        expect(farm.clock.firstLight).toBe(light.firstLight);
        expect(farm.clock.lastLight).toBe(light.lastLight);
        stepDay(farm);
      }
    }
  });

  it('a winter day in Western Victoria has less working light than a summer day in Central Queensland', () => {
    // 1 June at Hamilton and 1 December at Emerald. The figures were read
    // off the engine first: 10 h 42 m and 14 h 18 m.
    const wv = openFarm('wv', { size: 2000, start: { year: 2023, month: 5 } });
    const cq = openFarm('cq', { size: 2000, start: { year: 2023, month: 11 } });
    const short = clockView(wv).dayMin;
    const long = clockView(cq).dayMin;
    expect(short).toBeGreaterThan(638);
    expect(short).toBeLessThan(645);
    expect(long).toBeGreaterThan(855);
    expect(long).toBeLessThan(862);
    expect(long - short).toBeGreaterThan(210);
  });

  it('and a farm there fits less work into it', () => {
    // The same job on two farms of the same size: 76 squares of pipe,
    // along one row and back along the next. Pipe is laid at 400 m an hour.
    const cells: number[] = [];
    for (let x = 1; x <= 38; x++) cells.push(cell(x, 5));
    for (let x = 38; x >= 1; x--) cells.push(cell(x, 6));
    const job: Action = { type: 'layPipe', cells };
    const wv = openFarm('wv', { size: 2000, start: { year: 2023, month: 5 } });
    const cq = openFarm('cq', { size: 2000, start: { year: 2023, month: 11 } });
    const inWinter = work(wv, job).job;
    const inSummer = work(cq, job).job;
    expect(inWinter.outcome).toBe('part');
    expect(inSummer.outcome).toBe('part');
    // Under 10 h 42 m at 400 m an hour is under 4,280 m. Under 14 h 18 m is under 5,720 m.
    expect(inWinter.line!.metresToday).toBeGreaterThan(3600);
    expect(inWinter.line!.metresToday).toBeLessThan(4280);
    expect(inSummer.line!.metresToday).toBeGreaterThan(5000);
    expect(inSummer.line!.metresToday).toBeLessThan(5720);
    expect(inSummer.line!.metresToday - inWinter.line!.metresToday).toBeGreaterThan(1200);
    // Both worked until the light was used up, less the drive home: what
    // is spare is under a minute, not enough to start the next square.
    for (const c of [inWinter, inSummer]) {
      expect(c.leftAfterMin - c.homeMin).toBeGreaterThan(-1e-6);
      expect(c.leftAfterMin - c.homeMin).toBeLessThan(1);
    }
  });

  it('every day of a year has its own light, shortest in June and longest in December', () => {
    const farm = openFarm('wv', { start: { year: 2023, month: 0 } });
    let shortest = { day: -1, min: Infinity };
    let longest = { day: -1, min: 0 };
    for (let d = 0; d < 365; d++) {
      const min = lightOn(farm, d).minutes;
      if (min < shortest.min) shortest = { day: d, min };
      if (min > longest.min) longest = { day: d, min };
    }
    expect(dateOn(farm, shortest.day).month).toBe(5);
    expect(dateOn(farm, longest.day).month).toBe(11);
    // Looking ahead at other days leaves today alone.
    expect(farm.clock.firstLight).toBe(lightOn(farm, 0).firstLight);
  });
});

describe('the clock on a real-year farm', () => {
  const data = loadRealData();

  it('uses the real date, not the farm calendar', () => {
    // In order from 2025. After the newest year the game goes back to
    // 1997: farm day 365 is 1 January 2026 on the farm calendar and
    // 1 January 1997 in the game.
    let farm = createFarm(
      {
        seed: 7,
        district: 'cw',
        size: 'small',
        start: { year: 2025, month: 0 },
        years: { kind: 'real', order: 'in-order' },
        startType: 'scratch',
        difficulty: 'easy',
      },
      { data },
    );
    expect(dateOn(farm)).toEqual({ year: 2025, month: 0, date: 1 });
    const place = DISTRICT_PLACES.cw;
    expect(farm.clock.firstLight).toBe(
      daylightFor(place, { year: 2025, month: 0, date: 1 }).firstLight,
    );
    const skip = skipDays(farm, 365, { data });
    farm = skip.farm;
    expect(farm.day).toBe(365);
    expect(dateOn(farm)).toEqual({ year: 1997, month: 0, date: 1 });
    const real = daylightFor(place, { year: 1997, month: 0, date: 1 });
    const calendar = daylightFor(place, { year: 2026, month: 0, date: 1 });
    expect(real.firstLight).not.toBe(calendar.firstLight);
    expect(farm.clock.firstLight).toBe(real.firstLight);
    expect(farm.clock.lastLight).toBe(real.lastLight);
  });

  it('jobs, the job card, Next day and skips all work, and need the real data', () => {
    const farm = createFarm(
      {
        seed: 3,
        district: 'nsw',
        size: 'small',
        start: { year: 2006, month: 8 },
        years: { kind: 'real', order: 'random' },
        startType: 'scratch',
        difficulty: 'easy',
      },
      { data },
    );
    const job: Action = { type: 'buildFence', edges: across(12, 3, 30), fence: 'permanent' };
    expect(() => applyAction(farm, job)).toThrow(/real weather and price tables/);
    expect(() => previewAction(farm, job)).toThrow(/real weather and price tables/);
    expect(() => endDay(farm)).toThrow(/real weather and price tables/);
    expect(() => skipDays(farm, 'week')).toThrow(/real weather and price tables/);
    const card = previewAction(farm, job, { data });
    const done = work(farm, job, { data });
    expect(card).toEqual({ ok: true, card: done.job });
    expect(done.job.outcome).toBe('part');
    const next = endDay(done.farm, { data });
    expect(next.farm.day).toBe(1);
    expect(next.day.date).toEqual({ year: 2006, month: 8, date: 1 });
    const week = skipDays(next.farm, 'week', { data });
    expect(week.daysRun).toBe(7);
    expect(week.summary.jobs[0]!.doneShare.after).toBeGreaterThan(done.job.doneShare);
  });
});

describe('looking is free', () => {
  it('previews, summaries and every other read leave the farm exactly as it was', () => {
    // A farm with a job in progress, a booking, and a job done today.
    const b = busyFarm();
    let farm = work(b.farm, {
      type: 'buildFence',
      edges: across(12, 2, 37),
      fence: 'permanent',
    }).farm;
    farm = endDay(farm).farm;
    farm = work(farm, { type: 'refillPortable', port: b.port }).farm;
    expect(farm.jobs.length).toBe(1);
    const before = farmHash(farm);
    const saved = JSON.stringify(saveFarm(farm));

    const looks: Action[] = [
      { type: 'continueJob', job: farm.jobs[0]!.id },
      { type: 'cancelJob', job: farm.jobs[0]!.id },
      { type: 'buildFence', edges: across(13, 2, 37), fence: 'electric' },
      { type: 'buildFence', edges: across(13, 2, 37), fence: 'permanent' },
      { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } },
      { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 10 },
      { type: 'buyCattle', cls: 'yearSteer', qty: 5, to: { cell: b.emptyCell } },
      { type: 'wean', mob: b.cows },
      { type: 'markCalves', mob: b.cows },
      { type: 'placeTrough', cell: b.pipedCell },
      { type: 'rollUpTape', edge: b.tape },
      { type: 'setSupplement', mob: b.steers, supp: 'none' },
      { type: 'moveMob', mob: 999, to: 'lot' },
    ];
    for (const action of looks) previewAction(farm, action);
    clockView(farm);
    jobsInProgress(farm);
    bookingsView(farm);
    jobsToday(farm);
    waterCheck(farm);
    mobSummaries(farm);
    paddockSummaries(farm);
    farmTotals(farm);
    calibrationView(farm);
    surveyOf(farm);
    pricesOf(farm);
    dateOn(farm);
    lightOn(farm, farm.day + 40);
    homesteadPoint(farm);
    // Doing something returns a new farm and leaves this one alone, too.
    applyAction(farm, { type: 'continueJob', job: farm.jobs[0]!.id });
    endDay(farm);
    skipDays(farm, 'week', {}, { anyway: true });

    expect(farmHash(farm)).toBe(before);
    expect(JSON.stringify(saveFarm(farm))).toBe(saved);
  });

  it('if the player only looks, it stays first light', () => {
    const farm = openFarm('nsw');
    const first = farm.clock.firstLight;
    for (let i = 0; i < 20; i++) {
      previewAction(farm, { type: 'buildFence', edges: across(10, 2, 30), fence: 'permanent' });
      mobSummaries(farm);
      clockView(farm);
    }
    expect(clockView(farm).now).toBe(first);
    expect(clockView(farm).usedMin).toBe(0);
  });

  it('a job that is refused moves nothing', () => {
    const farm = openFarm('nsw');
    const before = farmHash(farm);
    expect(turnedDown(farm, { type: 'moveMob', mob: 4, to: 'lot' }).reason).toBe('no-such-mob');
    expect(turnedDown(farm, { type: 'placeTrough', cell: 5 }).reason).toBe('trough-needs-water');
    expect(farmHash(farm)).toBe(before);
  });
});

describe('doing takes time', () => {
  it('a job moves the clock on by its drive and its work, and nothing else does', () => {
    const farm = openFarm('nsw');
    const done = work(farm, { type: 'placePortable', cell: cell(20, 10) });
    const card = done.job;
    expect(card.startsAt).toBe(farm.clock.firstLight);
    expect(card.travelMin).toBeGreaterThan(0);
    // A portable trough takes 30 minutes to set up.
    expect(card.workMin).toBe(30);
    expect(card.endsAt).toBeCloseTo(card.startsAt + card.travelMin + 30, 9);
    expect(done.farm.clock.used).toBeCloseTo(card.travelMin + 30, 9);
    expect(clockView(done.farm).now).toBeCloseTo(card.endsAt, 9);
    expect(card.leftAfterMin).toBeCloseTo(card.dayMin - card.travelMin - 30, 9);
    expect(card.usedBeforeMin).toBe(0);
    // The farm that was passed in has not moved.
    expect(farm.clock.used).toBe(0);
  });

  it('the action log and the events carry the time the job started and finished', () => {
    const b = busyFarm();
    const first = work(b.farm, { type: 'refillPortable', port: b.port });
    const second = work(first.farm, { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } });
    const log = second.farm.actionLog.slice(-2);
    expect(log[0]!.action.type).toBe('refillPortable');
    expect(log[0]!.at).toEqual({ start: first.job.startsAt, end: first.job.endsAt });
    expect(log[1]!.at).toEqual({ start: second.job.startsAt, end: second.job.endsAt });
    // The second job starts when the first one finished.
    expect(log[1]!.at!.start).toBe(log[0]!.at!.end);
    expect(jobsToday(second.farm).map((e) => e.action.type)).toEqual(['refillPortable', 'moveMob']);

    const worked = second.events[0]!;
    expect(worked).toMatchObject({
      type: 'job-worked',
      action: 'moveMob',
      jobId: null,
      start: second.job.startsAt,
      end: second.job.endsAt,
      finished: true,
    });
    // The move says what time the mob arrived, for splitting its day of grazing later.
    const moved = second.events.find((e) => e.type === 'mob-moved');
    expect(moved).toMatchObject({ at: second.job.endsAt });
    // And the inbox keeps the time with each message.
    const last = second.farm.inbox.at(-1)!;
    expect(last.at).toBe(second.job.endsAt);
    // Nothing the daily tick reports has a time of day.
    const next = endDay(second.farm).farm;
    for (const m of next.inbox.filter((x) => x.day === 0 && x.event.type === 'cattle')) {
      expect(m.at).toBeUndefined();
    }
  });
});

describe('when the light is used up', () => {
  it('no job starts after last light, and the refusal says why in plain words', () => {
    const b = busyFarm();
    const farm = atLastLight(b.farm);
    expect(clockView(farm).canStartJobs).toBe(false);
    const jobs: Action[] = [
      { type: 'buildFence', edges: across(12, 2, 37), fence: 'tape' },
      { type: 'layPipe', cells: [cell(33, 10)] },
      { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } },
      { type: 'placeTrough', cell: b.pipedCell },
      { type: 'setGate', edge: b.gate, open: true },
      { type: 'refillPortable', port: b.port },
      { type: 'buyCattle', cls: 'yearSteer', qty: 5, to: { cell: b.emptyCell } },
      { type: 'markCalves', mob: b.cows },
      { type: 'setSupplement', mob: b.steers, supp: 'hay' },
    ];
    for (const job of jobs) {
      const no = turnedDown(farm, job);
      expect(no.reason, job.type).toBe('no-daylight');
      expect(no.message).toBe('It is last light. No more jobs can start today.');
      // The job card says the same.
      expect(previewAction(farm, job)).toEqual(no);
    }
  });

  it('a second before last light is still too late to start', () => {
    const b = busyFarm();
    const farm = withLightLeft(b.farm, 1e-7);
    expect(turnedDown(farm, { type: 'refillPortable', port: b.port }).reason).toBe('no-daylight');
  });

  it('looking, calling off a job and taking a mob off its supplement are still allowed', () => {
    const b = busyFarm();
    let farm = work(b.farm, {
      type: 'buildFence',
      edges: across(12, 2, 37),
      fence: 'permanent',
    }).farm;
    farm = atLastLight(farm);
    expect(previewAction(farm, { type: 'cancelJob', job: 1 }).ok).toBe(true);
    // Taking a mob off its supplement is a decision, not a job.
    const fed = setUp(farm, { type: 'setSupplement', mob: b.steers, supp: 'hay' });
    expect(work(fed, { type: 'setSupplement', mob: b.steers, supp: 'none' }).job.outcome).toBe(
      'free',
    );
    expect(work(farm, { type: 'cancelJob', job: 1 }).farm.jobs).toEqual([]);
    expect(mobSummaries(farm).length).toBe(2);
  });

  it('with light left but not enough to get there and home, the refusal gives the drive times', () => {
    const farm = withLightLeft(openFarm('nsw', { size: 6000 }), 20);
    // The corner of a 6,000 ha farm furthest from the homestead is over 15 minutes away.
    const h = farm.buildings.homestead;
    const far = cell(h % GRID_W < 20 ? 38 : 1, Math.floor(h / GRID_W) < 13 ? 24 : 1);
    const no = turnedDown(farm, { type: 'placePortable', cell: far });
    expect(no.reason).toBe('not-enough-daylight');
    expect(no.message).toMatch(/^There is not enough light left today to get to that job\./);
    expect(no.message).toMatch(/The drive out takes \d+ m and the drive home \d+ m\./);
    expect(no.message).toMatch(/There is 20 m of light left\.$/);
    // A job beside the homestead still fits.
    expect(work(farm, { type: 'placePortable', cell: h }).job.outcome).toBe('part');
  });

  it('the next day starts at first light again', () => {
    const farm = atLastLight(openFarm('nsw'));
    const next = endDay(farm).farm;
    expect(next.clock.used).toBe(0);
    expect(clockView(next).canStartJobs).toBe(true);
    expect(work(next, { type: 'placePortable', cell: cell(20, 10) }).job.outcome).toBe('done');
  });
});
