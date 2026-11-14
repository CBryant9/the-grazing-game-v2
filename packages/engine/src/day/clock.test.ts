import { describe, expect, it, vi } from 'vitest';
import { openFarm } from '../../test-support/wholeFarm';
import {
  across,
  atLastLight,
  busyFarm,
  cell,
  toSaleDay,
  turnedDown,
  withLightLeft,
  work,
} from '../../test-support/workingDay';
import type { Action } from '../actions/types';
import { daylightFor } from '../daylight/daylight';
import { DISTRICT_PLACES } from '../daylight/places';
import * as engine from '../index';
import { farmHash, saveFarm } from '../save/save';
import { loadRealData } from '../server';
import { lightOn } from '../sim/clock';
import { createFarm } from '../sim/create';
import { dateOn } from '../sim/derived';
import type { FarmState } from '../sim/state';
import { mobSummaries } from '../sim/summary';
import { stepDay } from '../sim/tick';
import { applyAction, previewAction } from './act';
import { endDay, skipDays } from './days';
import { clockView, jobsToday } from './look';

/*
 * The farm clock (PRD 5.1): every day runs from first light to last light,
 * looking is free, doing takes time, and when the light is gone no more
 * jobs can start. A job's time is its work only: there is no driving.
 */

vi.setConfig({ testTimeout: 600_000 });

const DISTRICTS = ['cq', 'nsw', 'cw', 'wv'] as const;

describe('the day runs from first light to last light', () => {
  it('a new farm is at first light, with nothing used', () => {
    for (const district of DISTRICTS) {
      const farm = openFarm(district);
      const c = clockView(farm);
      expect(c.usedMin).toBe(0);
      expect(c.now).toBe(c.firstLight);
      expect(c.leftMin).toBe(c.dayMin);
      expect(c.dayMin).toBe(c.lastLight - c.firstLight);
      expect(c.canStartJobs).toBe(true);
      expect(c.evening).toBe(false);
      // The clock is the light and how much is used. There is no place the player has to be.
      expect(Object.keys(farm.clock).sort()).toEqual(['firstLight', 'lastLight', 'used']);
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
    // along one row and back along the next. Pipe is laid at 400 m an hour,
    // and a square on a 2,000 ha farm is 138.7 m.
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
    // 10 h 42 m at 400 m an hour is 4,277 m: 30 whole squares. 14 h 18 m is 5,722 m: 41 squares.
    expect(inWinter.line!.fits.pieces.length).toBe(30);
    expect(inSummer.line!.fits.pieces.length).toBe(41);
    expect(inWinter.line!.fits.metres).toBeCloseTo(30 * 138.675, 1);
    expect(inSummer.line!.fits.metres).toBeCloseTo(41 * 138.675, 1);
    expect(inSummer.line!.fits.metres - inWinter.line!.fits.metres).toBeGreaterThan(1500);
    // Each used all the light a whole square could use: under one square's worth is left.
    for (const c of [inWinter, inSummer]) expect(c.leftAfterMin).toBeLessThan(138.675 / (400 / 60));
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
  });
});

describe('looking is free', () => {
  it('every function the engine exports that takes a farm is known as a read or a change, and no read changes the farm', () => {
    // A job to ask about, and what each read needs besides the farm.
    const job: Action = { type: 'buildFence', edges: across(13, 2, 37), fence: 'permanent' };
    type Env = { data?: ReturnType<typeof loadRealData> };
    const READS: Record<string, (farm: FarmState, env: Env) => unknown> = {
      infraInPlace: (f) => engine.infraInPlace(f),
      liveYear: (f) => engine.liveYear(f),
      netWorth: (f) => engine.netWorth(f),
      netWorthParts: (f) => engine.netWorthParts(f),
      newYear: (f) => engine.newYear(f),
      stockWorth: (f) => engine.stockWorth(f, engine.pricesOf(f)),
      tapeOwned: (f) => engine.tapeOwned(f),
      cloneFarm: (f) => engine.cloneFarm(f),
      dateOn: (f) => engine.dateOn(f, f.day + 3),
      nextSaleDay: (f, env) => engine.nextSaleDay(f, env),
      saleDayOn: (f, env) => engine.saleDayOn(f, env),
      marketView: (f, env) => engine.marketView(f, env),
      plantingsNow: (f, env) => engine.plantingsNow(f, env),
      pricesOf: (f) => engine.pricesOf(f),
      realPlanOf: (f) => engine.realPlanOf(f),
      realSourcesOf: (f, env) => engine.realSourcesOf(f, env),
      seasonsOf: (f, env) => engine.seasonsOf(f, env),
      surveyOf: (f) => engine.surveyOf(f),
      autoWeanDest: (f, env) =>
        engine.autoWeanDest(f, engine.surveyOf(f), engine.plantingsNow(f, env), f.mobs[0]!),
      calibrationView: (f) => engine.calibrationView(f),
      farmTotals: (f, env) => engine.farmTotals(f, env),
      mobSummaries: (f) => engine.mobSummaries(f),
      materialsOnHand: (f) => engine.materialsOnHand(f),
      breedingReports: (f) => engine.breedingReports(f),
      // Reads the web server needs (14 Nov 2026).
      supplementCosts: (f, env) => engine.supplementCosts(f, env),
      husbandryNow: (f, env) => engine.husbandryNow(f, env),
      portableRefund: (f) => engine.portableRefund(f, f.layout.water.ports[0]?.id ?? 1),
      paddockSummaries: (f, env) => engine.paddockSummaries(f, env),
      farmHash: (f) => engine.farmHash(f),
      saveFarm: (f) => engine.saveFarm(f),
      dayMinutes: (f) => engine.dayMinutes(f),
      lightLeft: (f) => engine.lightLeft(f),
      lightOn: (f) => engine.lightOn(f, f.day + 30),
      timeNow: (f) => engine.timeNow(f),
      // Doing a job, ending the day and skipping return a new farm and leave this one alone.
      applyAction: (f, env) => engine.applyAction(f, job, env),
      previewAction: (f, env) => engine.previewAction(f, job, env),
      endDay: (f, env) => engine.endDay(f, env),
      skipDays: (f, env) => engine.skipDays(f, 3, env, { anyway: true }),
      waterCheck: (f) => engine.waterCheck(f),
      clockView: (f) => engine.clockView(f),
      jobsToday: (f) => engine.jobsToday(f),
      thingsToDo: (f) => engine.thingsToDo(f),
      // Grazing plans: the plans, and the stops a mob's plan gives it today.
      plansView: (f) => engine.plansView(f),
      stopsToday: (f) => engine.stopsToday(f, f.mobs[0]!),
      // The numbers the map is drawn from. Looking at the map is free.
      farmView: (f, env) => engine.farmView(f, env),
    };
    // These change the farm they are given. That is their job: the tick, and its helpers.
    const CHANGES = [
      'closeYear',
      'mergeShared',
      'newMob',
      'spend',
      'splitMobs',
      'startHerd',
      'stepDay',
    ];

    // Every exported function whose first parameter is the farm.
    const takesFarm = Object.entries(engine)
      .filter(
        ([, v]) =>
          typeof v === 'function' &&
          /^(?:async\s+)?(?:function\b[^(]*)?\(\s*farm\b/.test(Function.prototype.toString.call(v)),
      )
      .map(([name]) => name)
      .sort();
    expect(takesFarm.length).toBeGreaterThan(40);
    // A new one must be put in one list or the other before this passes.
    expect(takesFarm).toEqual([...Object.keys(READS), ...CHANGES].sort());

    // A farm with stock and a job done today, on random seasons and on real years.
    const b = busyFarm();
    const random = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    const data = loadRealData();
    let real = createFarm(
      {
        seed: 3,
        district: 'cw',
        size: 'small',
        start: { year: 2006, month: 5 },
        years: { kind: 'real', order: 'random' },
        startType: 'running',
        mixed: { arablePct: 40, croppedPct: 50 },
        difficulty: 'easy',
      },
      { data },
    );
    real = work(
      real,
      { type: 'buildFence', edges: across(12, 2, 37), fence: 'tape' },
      { data },
    ).farm;
    expect(real.mobs.length).toBeGreaterThan(0);

    const worked = new Set<string>();
    for (const [farm, env] of [
      [random, {}],
      [real, { data }],
    ] as [FarmState, Env][]) {
      const before = farmHash(farm);
      const saved = JSON.stringify(saveFarm(farm));
      for (const [name, look] of Object.entries(READS)) {
        try {
          look(farm, env);
          worked.add(name);
        } catch {
          // A read that does not serve this kind of farm (the sale calendar on random seasons).
        }
        expect(farmHash(farm), `${name} changed the farm`).toBe(before);
      }
      expect(JSON.stringify(saveFarm(farm))).toBe(saved);
    }
    // Every read ran on at least one of the two farms.
    expect([...worked].sort()).toEqual(Object.keys(READS).sort());
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
  it('a job moves the clock on by its work, and nothing else does', () => {
    const farm = openFarm('nsw');
    const done = work(farm, { type: 'placePortable', cell: cell(20, 10) });
    const card = done.job;
    expect(card.startsAt).toBe(farm.clock.firstLight);
    // A portable trough takes 30 minutes to set up, wherever it is on the farm.
    expect(card.workMin).toBe(30);
    expect(card.endsAt).toBe(card.startsAt + 30);
    expect(done.farm.clock.used).toBe(30);
    expect(clockView(done.farm).now).toBe(card.endsAt);
    expect(card.leftAfterMin).toBeCloseTo(card.dayMin - 30, 9);
    expect(card.usedBeforeMin).toBe(0);
    // The same job in the far corner takes the same time: there is no driving.
    expect(work(farm, { type: 'placePortable', cell: cell(38, 1) }).job.workMin).toBe(30);
    // The farm that was passed in has not moved.
    expect(farm.clock.used).toBe(0);
  });

  it('the action log and the events carry the time the job started and finished', () => {
    const b = busyFarm();
    const first = work(b.farm, { type: 'refillPortable', port: b.port });
    const second = work(first.farm, { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } });
    const log = second.farm.actionLog.slice(-2);
    expect(log[0]).toEqual({
      day: 0,
      action: { type: 'refillPortable', port: b.port },
      at: { start: first.job.startsAt, end: first.job.endsAt },
    });
    expect(log[1]!.at).toEqual({ start: second.job.startsAt, end: second.job.endsAt });
    // The second job starts when the first one finished.
    expect(log[1]!.at!.start).toBe(log[0]!.at!.end);
    expect(jobsToday(second.farm).map((e) => e.action.type)).toEqual(['refillPortable', 'moveMob']);

    expect(second.events[0]).toEqual({
      type: 'job-worked',
      action: 'moveMob',
      start: second.job.startsAt,
      end: second.job.endsAt,
      workMin: second.job.workMin,
      finished: true,
    });
    // The move says what time the mob arrived, for splitting its day of grazing later.
    const moved = second.events.find((e) => e.type === 'mob-moved');
    expect(moved).toMatchObject({ at: second.job.endsAt });
    // And the inbox keeps the time with each message.
    expect(second.farm.inbox.at(-1)!.at).toBe(second.job.endsAt);
    // Nothing the daily tick reports has a time of day, and the next day's list starts empty.
    const next = endDay(second.farm).farm;
    for (const m of next.inbox.filter((x) => x.day === 0 && x.event.type === 'cattle')) {
      expect(m.at).toBeUndefined();
    }
    expect(jobsToday(next)).toEqual([]);
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
      { type: 'markCalves', mob: b.cows },
    ];
    for (const job of jobs) {
      const no = turnedDown(farm, job);
      expect(no.reason, job.type).toBe('no-daylight');
      expect(no.message).toBe('It is last light. No more jobs can start today.');
      // The job card says the same.
      expect(previewAction(farm, job)).toEqual(no);
    }
  });

  it('a moment before last light is still too late to start', () => {
    const b = busyFarm();
    const farm = withLightLeft(b.farm, 1e-7);
    expect(turnedDown(farm, { type: 'setGate', edge: b.gate, open: true }).reason).toBe(
      'no-daylight',
    );
  });

  it('looking, and the things that take none of the day, are still allowed', () => {
    const b = busyFarm();
    const farm = atLastLight(b.farm);
    expect(mobSummaries(farm).length).toBe(2);
    expect(engine.thingsToDo(farm).length).toBeGreaterThan(0);
    // Switching a supplement on or off, and buying, are decisions, not jobs.
    const on = work(farm, { type: 'setSupplement', mob: b.steers, supp: 'hay' });
    expect(on.job.outcome).toBe('free');
    expect(on.job.workMin).toBe(0);
    const fed = on.farm;
    const off = work(fed, { type: 'setSupplement', mob: b.steers, supp: 'none' });
    expect(off.job.outcome).toBe('free');
    expect(off.job.workMin).toBe(0);
    // On a sale day, so cattle can be bought, even at last light.
    const market = atLastLight(toSaleDay(b.farm));
    const bought = work(market, { type: 'buyCattle', cls: 'yearSteer', qty: 5 });
    expect(bought.job.outcome).toBe('free');
    expect(bought.farm.clock.used).toBe(market.clock.used);
  });

  it('the next day starts at first light again', () => {
    const farm = atLastLight(openFarm('nsw'));
    const next = endDay(farm).farm;
    expect(next.clock.used).toBe(0);
    expect(clockView(next).canStartJobs).toBe(true);
    expect(work(next, { type: 'placePortable', cell: cell(20, 10) }).job.outcome).toBe('done');
  });
});

describe('evening', () => {
  it('the clock says when no more jobs fit today: less light is left than the shortest job needs', () => {
    const farm = openFarm('nsw');
    // The shortest job that takes time and is done in one go is moving a mob: 15 minutes.
    expect(clockView(farm).shortestJobMin).toBe(15);
    expect(clockView(withLightLeft(farm, 300)).evening).toBe(false);
    expect(clockView(withLightLeft(farm, 15)).evening).toBe(false);
    const dusk = clockView(withLightLeft(farm, 14.9));
    expect(dusk.evening).toBe(true);
    // There is still a little light: a gate can be opened. Looking is free.
    expect(dusk.canStartJobs).toBe(true);
    expect(dusk.leftMin).toBeCloseTo(14.9, 9);
    const dark = clockView(atLastLight(farm));
    expect(dark.evening).toBe(true);
    expect(dark.canStartJobs).toBe(false);
    expect(dark.leftMin).toBe(0);
    // Next day, it is morning again.
    expect(clockView(endDay(atLastLight(farm)).farm).evening).toBe(false);
  });

  it('with under 15 minutes left a mob can not be moved, and the reason is the light', () => {
    const b = busyFarm();
    const no = turnedDown(withLightLeft(b.farm, 14.9), {
      type: 'moveMob',
      mob: b.steers,
      to: { cell: b.emptyCell },
    });
    expect(no.reason).toBe('not-enough-daylight');
  });
});
