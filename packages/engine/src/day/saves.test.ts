import { describe, expect, it, vi } from 'vitest';
import { PLENTY, openFarm } from '../../test-support/wholeFarm';
import { across, busyFarm, withLightLeft, work } from '../../test-support/workingDay';
import type { Action } from '../actions/types';
import { GRID_N } from '../grid';
import { LAND } from '../pasture/state';
import { farmHash, loadFarm, saveFarm, type SavedFarm } from '../save/save';
import { daylightFor } from '../daylight/daylight';
import { DISTRICT_PLACES } from '../daylight/places';
import { loadRealData } from '../server';
import { homesteadPoint, lightOn } from '../sim/clock';
import { dateOn } from '../sim/derived';
import { stepDay } from '../sim/tick';
import { createFarm } from '../sim/create';
import { cloneFarm, type FarmState } from '../sim/state';
import { ENGINE_VERSION, SAVE_FORMAT_VERSION } from '../version';
import { applyAction } from './act';
import { endDay, skipDays } from './days';
import { jobsInProgress } from './look';

/*
 * The clock, the player's place, jobs in progress and bookings are part
 * of the farm: saved, loaded and hashed. Save, load and carry on must be
 * the same as running straight through.
 */

vi.setConfig({ testTimeout: 600_000 });

/** Save a farm, send it through JSON as a server would, and load it. */
const reload = (farm: FarmState): FarmState =>
  loadFarm(JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm);

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

/**
 * A few days of play: fences and a trough part-built, stock moved, a
 * contractor booked, days ended and a skip. `between` is run on the farm
 * after every step, so a save and a load can be put anywhere.
 */
function play(between: (farm: FarmState) => FarmState): FarmState {
  let farm = between(mixedFarm());
  const fallow: number[] = [];
  for (let i = 0; i < GRID_N; i++) if (farm.pasture.land[i] === LAND.fallow) fallow.push(i);
  const steps: ((f: FarmState) => FarmState)[] = [
    (f) => work(f, { type: 'sow', species: 'barley', cells: fallow }).farm,
    (f) => work(f, { type: 'placePortable', cell: 300 }).farm,
    // Part-way through the day: a fence too long for what is left.
    (f) =>
      work(f, {
        type: 'buildFence',
        edges: [...across(13, 2, 37), ...across(15, 2, 37)],
        fence: 'permanent',
      }).farm,
    (f) => endDay(f).farm,
    // Part-way through the job: carry on, with the day half used.
    (f) => work(f, { type: 'refillPortable', port: 1 }).farm,
    (f) => work(f, { type: 'continueJob', job: 1 }).farm,
    (f) => endDay(f).farm,
    (f) => work(f, { type: 'buildFence', edges: across(18, 2, 37), fence: 'electric' }).farm,
    (f) => work(f, { type: 'movePortable', port: 1, cell: 640 }).farm,
    (f) => skipDays(f, 5).farm,
    (f) => work(f, { type: 'cancelJob', job: f.jobs[0]?.id ?? 1 }).farm,
    (f) => skipDays(f, 'week').farm,
  ];
  for (const step of steps) farm = between(step(farm));
  return farm;
}

describe('saving the working day', () => {
  it('a farm part-way through a day and part-way through a job comes back the same', () => {
    const b = busyFarm();
    let farm = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    farm = work(farm, { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' }).farm;
    expect(farm.clock.used).toBeGreaterThan(0);
    expect(farm.jobs.length).toBe(1);
    expect(farm.jobs[0]!.part).toBeGreaterThan(0);
    const back = reload(farm);
    expect(farmHash(back)).toBe(farmHash(farm));
    expect(back.clock).toEqual(farm.clock);
    expect(back.jobs).toEqual(farm.jobs);
    expect(back.workRules).toEqual(farm.workRules);
    expect(back.nextJobId).toBe(2);
    expect(jobsInProgress(back)).toEqual(jobsInProgress(farm));
    // The times in the action log come back too.
    expect(back.actionLog.at(-1)).toEqual(farm.actionLog.at(-1));
    expect(back.actionLog.at(-1)!.at!.end).toBeGreaterThan(back.actionLog.at(-1)!.at!.start);
  });

  it('save, load and carry on equals running straight through, at every step', () => {
    const straight = play((f) => f);
    const saved = play(reload);
    expect(farmHash(saved)).toBe(farmHash(straight));
    expect(straight.day).toBe(14);
    // The run did what it was meant to: a job was part-built and given up, and the sowing was done.
    expect(straight.actionLog.some((a) => a.action.type === 'cancelJob')).toBe(true);
    expect(straight.crops.fields.length).toBe(mixedFarm().crops.fields.length + 1);
    expect(straight.bookings).toEqual([]);
  });

  it('the same seed and the same actions give the same farm, bit for bit', () => {
    const a = play((f) => f);
    const b = play((f) => f);
    expect(farmHash(a)).toBe(farmHash(b));
    expect(JSON.stringify(saveFarm(a))).toBe(JSON.stringify(saveFarm(b)));
    // Another seed is another farm.
    const other = createFarm({
      seed: 5,
      district: 'cw',
      size: 'small',
      start: { year: 2022, month: 5 },
      startType: 'scratch',
      difficulty: 'easy',
    });
    expect(farmHash(other)).not.toBe(farmHash(mixedFarm()));
  });

  it('the hash covers the clock, the place, the switches, the jobs and the bookings', () => {
    const b = busyFarm();
    const farm = work(b.farm, {
      type: 'buildFence',
      edges: across(12, 2, 37),
      fence: 'permanent',
    }).farm;
    const base = farmHash(farm);
    const changed = (change: (f: FarmState) => void): string => {
      const f = cloneFarm(farm);
      change(f);
      return farmHash(f);
    };
    expect(changed((f) => (f.clock.used -= 1))).not.toBe(base);
    expect(changed((f) => (f.clock.at.x += 1))).not.toBe(base);
    expect(changed((f) => (f.clock.firstLight += 1))).not.toBe(base);
    expect(changed((f) => (f.workRules.travel = false))).not.toBe(base);
    expect(changed((f) => (f.workRules.driveHome = 'after-last-light'))).not.toBe(base);
    expect(changed((f) => (f.jobs[0]!.part += 0.01))).not.toBe(base);
    expect(changed((f) => f.jobs[0]!.left.pop())).not.toBe(base);
    expect(changed((f) => (f.jobs = []))).not.toBe(base);
    expect(changed((f) => f.nextJobId++)).not.toBe(base);
    expect(changed((f) => f.nextBookingId++)).not.toBe(base);
    expect(
      changed((f) =>
        f.bookings.push({
          id: 1,
          action: { type: 'harvest', field: 1 },
          bookedDay: 0,
          dueDay: 3,
          quote: 0,
        }),
      ),
    ).not.toBe(base);
    expect(changed((f) => (f.actionLog.at(-1)!.at!.end += 1))).not.toBe(base);
    expect(changed(() => undefined)).toBe(base);
  });
});

describe('saves from before the working day', () => {
  /** A save as format 2 wrote it: no clock, no switches, no jobs, no bookings. */
  function format2(farm: FarmState): SavedFarm {
    const old = JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm;
    for (const key of ['clock', 'workRules', 'jobs', 'nextJobId', 'bookings', 'nextBookingId']) {
      expect(key in old, key).toBe(true);
      delete old[key];
    }
    old.saveFormat = 2;
    old.engineVersion = '0.6.0';
    return old;
  }

  it('the save format is 3 and the engine is 0.7.0', () => {
    expect(SAVE_FORMAT_VERSION).toBe(3);
    expect(ENGINE_VERSION).toBe('0.7.0');
    expect(saveFarm(openFarm('nsw')).saveFormat).toBe(3);
  });

  it('load at first light with the player at the homestead, on the default switches', () => {
    const farm = skipDays(busyFarm().farm, 9).farm;
    const loaded = loadFarm(format2(farm));
    expect(loaded.saveFormat).toBe(3);
    expect(loaded.engineVersion).toBe('0.7.0');
    const light = lightOn(farm);
    expect(loaded.clock).toEqual({
      firstLight: light.firstLight,
      lastLight: light.lastLight,
      used: 0,
      at: homesteadPoint(farm),
    });
    expect(loaded.workRules).toEqual({ travel: true, driveHome: 'inside-daylight' });
    expect(loaded.jobs).toEqual([]);
    expect(loaded.nextJobId).toBe(1);
    expect(loaded.bookings).toEqual([]);
    expect(loaded.nextBookingId).toBe(1);
    // Nothing else is different: it is the farm that was saved, at first light.
    expect(farmHash(loaded)).toBe(farmHash(farm));
    // And it plays on.
    const job: Action = { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' };
    const a = applyAction(loaded, job);
    const b = applyAction(farm, job);
    expect(a.ok && b.ok && farmHash(a.farm) === farmHash(b.farm)).toBe(true);
  });

  it('a save made part-way through a day keeps its time of day', () => {
    const b = busyFarm();
    const farm = withLightLeft(b.farm, 200);
    const back = reload(farm);
    expect(back.clock.used).toBe(farm.clock.used);
    // Only a save with no clock at all is put back to first light.
    const old = format2(farm);
    expect(loadFarm(old).clock.used).toBe(0);
  });

  it("a real-year farm saved before the clock loads, gets its real date's light, and carries on", () => {
    const data = loadRealData();
    // In order from 2025, run past the newest year: day 400 is early February 1997 in the game.
    let farm = createFarm(
      {
        seed: 9,
        district: 'wv',
        size: 'small',
        start: { year: 2025, month: 0 },
        years: { kind: 'real', order: 'in-order' },
        startType: 'scratch',
        difficulty: 'easy',
      },
      { data },
    );
    for (let d = 0; d < 400; d++) stepDay(farm, { data });
    expect(dateOn(farm)).toEqual({ year: 1997, month: 1, date: 5 });
    const unsaved = farm;
    const old = format2(farm);
    expect(old.seasons).toMatchObject({ kind: 'real' });
    const loaded = loadFarm(old);
    // The clock is the real date's, not the farm calendar's (February 2026).
    const place = DISTRICT_PLACES.wv;
    const real = daylightFor(place, { year: 1997, month: 1, date: 5 });
    expect(real.firstLight).not.toBe(
      daylightFor(place, { year: 2026, month: 1, date: 5 }).firstLight,
    );
    expect(loaded.clock).toEqual({
      firstLight: real.firstLight,
      lastLight: real.lastLight,
      used: 0,
      at: homesteadPoint(farm),
    });
    expect(loaded.jobs).toEqual([]);
    expect(loaded.bookings).toEqual([]);
    expect(farmHash(loaded)).toBe(farmHash(farm));
    // It carries on: a job on the clock, the next day, and a skip, with the real data.
    const job: Action = { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' };
    const done = applyAction(loaded, job, { data });
    if (!done.ok) throw new Error(done.message);
    expect(done.job!.outcome).toBe('part');
    farm = endDay(done.farm, { data }).farm;
    expect(dateOn(farm)).toEqual({ year: 1997, month: 1, date: 6 });
    const week = skipDays(farm, 'week', { data });
    expect(week.daysRun).toBe(7);
    expect(week.summary.jobs[0]!.doneShare.after).toBeGreaterThan(done.job!.doneShare);
    // The same as the farm that was never saved.
    const straight = applyAction(unsaved, job, { data });
    expect(straight.ok && farmHash(straight.farm)).toBe(farmHash(done.farm));
  });
});
