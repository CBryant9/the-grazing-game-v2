import { describe, expect, it, vi } from 'vitest';
import { PLENTY, openFarm } from '../../test-support/wholeFarm';
import { across, busyFarm, withLightLeft, work } from '../../test-support/workingDay';
import type { Action } from '../actions/types';
import { daylightFor } from '../daylight/daylight';
import { DISTRICT_PLACES } from '../daylight/places';
import { GRID_N } from '../grid';
import { LAND } from '../pasture/state';
import { farmHash, loadFarm, saveFarm, type SavedFarm } from '../save/save';
import { loadRealData } from '../server';
import { lightOn } from '../sim/clock';
import { createFarm } from '../sim/create';
import { dateOn } from '../sim/derived';
import { cloneFarm, type FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { ENGINE_VERSION, SAVE_FORMAT_VERSION } from '../version';
import { applyAction } from './act';
import { endDay, skipDays } from './days';

/*
 * The clock is part of the farm: saved, loaded and hashed. Save, load and
 * carry on must be the same as running straight through. Saves from
 * before the working day, and from its first cut, load.
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
 * A fortnight of play: a sowing, troughs, a fence too long for a day drawn
 * on two days, days ended and skips. `between` is run on the farm after
 * every step, so a save and a load can be put anywhere.
 */
function play(between: (farm: FarmState) => FarmState): FarmState {
  let farm = between(mixedFarm());
  const fallow: number[] = [];
  for (let i = 0; i < GRID_N; i++) if (farm.pasture.land[i] === LAND.fallow) fallow.push(i);
  const fence: Action = {
    type: 'buildFence',
    edges: [...across(13, 2, 37), ...across(15, 2, 37)],
    fence: 'permanent',
  };
  const steps: ((f: FarmState) => FarmState)[] = [
    (f) => work(f, { type: 'sow', species: 'barley', cells: fallow }).farm,
    (f) => work(f, { type: 'placePortable', cell: 300 }).farm,
    // Part-way through the day: a fence too long for what is left.
    (f) => work(f, fence).farm,
    (f) => endDay(f).farm,
    (f) => work(f, { type: 'refillPortable', port: 1 }).farm,
    // The same line drawn again builds the next part.
    (f) => work(f, fence).farm,
    (f) => endDay(f).farm,
    (f) => work(f, { type: 'buildFence', edges: across(18, 2, 37), fence: 'electric' }).farm,
    (f) => work(f, { type: 'movePortable', port: 1, cell: 640 }).farm,
    (f) => skipDays(f, 5).farm,
    (f) => skipDays(f, 'week').farm,
  ];
  for (const step of steps) farm = between(step(farm));
  return farm;
}

describe('saving the working day', () => {
  it('a farm part-way through a day comes back the same', () => {
    const b = busyFarm();
    let farm = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    farm = work(farm, { type: 'buildFence', edges: across(12, 2, 20), fence: 'electric' }).farm;
    expect(farm.clock.used).toBeGreaterThan(30);
    const back = reload(farm);
    expect(farmHash(back)).toBe(farmHash(farm));
    expect(back.clock).toEqual(farm.clock);
    // The times in the action log come back too.
    expect(back.actionLog.at(-1)).toEqual(farm.actionLog.at(-1));
    expect(back.actionLog.at(-1)!.at!.end).toBeGreaterThan(back.actionLog.at(-1)!.at!.start);
    // And it carries on from the same time of day.
    const job: Action = { type: 'placePortable', cell: 5 };
    expect(work(back, job).job).toEqual(work(farm, job).job);
  });

  it('save, load and carry on equals running straight through, at every step', () => {
    const straight = play((f) => f);
    const saved = play(reload);
    expect(farmHash(saved)).toBe(farmHash(straight));
    expect(straight.day).toBe(14);
    // The run did what it was meant to: the barley was sown and two days of fence were built.
    expect(straight.crops.fields.length).toBe(mixedFarm().crops.fields.length + 1);
    expect(straight.actionLog.filter((a) => a.action.type === 'buildFence').length).toBe(3);
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

  it('the hash covers the clock and the times in the log', () => {
    const b = busyFarm();
    const farm = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    const base = farmHash(farm);
    const changed = (change: (f: FarmState) => void): string => {
      const f = cloneFarm(farm);
      change(f);
      return farmHash(f);
    };
    expect(changed((f) => (f.clock.used -= 1))).not.toBe(base);
    expect(changed((f) => (f.clock.firstLight += 1))).not.toBe(base);
    expect(changed((f) => (f.clock.lastLight += 1))).not.toBe(base);
    expect(changed((f) => (f.actionLog.at(-1)!.at!.end += 1))).not.toBe(base);
    expect(changed((f) => (f.buildings.yards += 1))).not.toBe(base);
    expect(changed(() => undefined)).toBe(base);
  });

  it('a farm keeps the clock, the yards and nothing else of the working day', () => {
    const farm = openFarm('nsw');
    expect(Object.keys(farm.clock).sort()).toEqual(['firstLight', 'lastLight', 'used']);
    expect(Object.keys(farm.buildings)).toEqual(['yards']);
    for (const gone of ['jobs', 'nextJobId', 'bookings', 'nextBookingId', 'workRules']) {
      expect(gone in farm, gone).toBe(false);
    }
  });
});

describe('older saves', () => {
  /** A save as format 2 wrote it: no clock, and a homestead beside the yards. */
  function format2(farm: FarmState): SavedFarm {
    const old = JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm;
    expect('clock' in old).toBe(true);
    delete old.clock;
    (old.buildings as Record<string, number>).homestead = 1003;
    old.saveFormat = 2;
    old.engineVersion = '0.6.0';
    return old;
  }

  /**
   * A save as the first cut of the working day wrote it (format 3, never
   * released): the player's place, travel switches, a job in progress, a
   * booking and a homestead.
   */
  function format3(farm: FarmState): SavedFarm {
    const old = JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm;
    (old.buildings as Record<string, number>).homestead = 1003;
    (old.clock as Record<string, unknown>).at = { x: 3.5, y: 25.5 };
    old.workRules = { travel: true, driveHome: 'inside-daylight' };
    old.jobs = [
      {
        id: 1,
        action: { type: 'placeTrough', cell: 5 },
        startedDay: 0,
        kind: 'whole',
        left: [],
        part: 0.4,
        lastEnd: null,
        piecesDone: 0,
        pieces: 0,
        spent: 0,
        workedMin: 72,
        travelMin: 3,
        tapeFeePaid: false,
      },
    ];
    old.nextJobId = 2;
    old.bookings = [
      { id: 1, action: { type: 'harvest', field: 1 }, bookedDay: 0, dueDay: 3, quote: -100 },
    ];
    old.nextBookingId = 2;
    const log = old.actionLog as Record<string, unknown>[];
    if (log.length) log[log.length - 1]!.job = 1;
    old.saveFormat = 3;
    return old;
  }

  it('the save format is 4 and the engine is 0.7.0', () => {
    expect(SAVE_FORMAT_VERSION).toBe(4);
    expect(ENGINE_VERSION).toBe('0.7.0');
    expect(saveFarm(openFarm('nsw')).saveFormat).toBe(4);
  });

  it('a save from before the clock loads at first light, with the homestead dropped and the yards kept', () => {
    const farm = skipDays(busyFarm().farm, 9).farm;
    const loaded = loadFarm(format2(farm));
    expect(loaded.saveFormat).toBe(4);
    expect(loaded.engineVersion).toBe('0.7.0');
    const light = lightOn(farm);
    expect(loaded.clock).toEqual({
      firstLight: light.firstLight,
      lastLight: light.lastLight,
      used: 0,
    });
    expect(loaded.buildings).toEqual({ yards: farm.buildings.yards });
    // Nothing else is different: it is the farm that was saved, at first light.
    expect(farmHash(loaded)).toBe(farmHash(farm));
    // And it plays on.
    const job: Action = { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' };
    const a = applyAction(loaded, job);
    const b = applyAction(farm, job);
    expect(a.ok && b.ok && farmHash(a.farm) === farmHash(b.farm)).toBe(true);
  });

  it('a save from the first cut of the working day loads with what was taken out dropped', () => {
    const b = busyFarm();
    const farm = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    const loaded = loadFarm(format3(farm));
    expect(loaded.saveFormat).toBe(4);
    // The time of day is kept. The player's place, the switches, the job in
    // progress, the booking and the homestead are gone.
    expect(loaded.clock).toEqual(farm.clock);
    expect(loaded.buildings).toEqual({ yards: farm.buildings.yards });
    for (const gone of ['jobs', 'nextJobId', 'bookings', 'nextBookingId', 'workRules']) {
      expect(gone in loaded, gone).toBe(false);
    }
    expect(loaded.actionLog.at(-1)).toEqual(farm.actionLog.at(-1));
    expect(farmHash(loaded)).toBe(farmHash(farm));
    // Nothing of the old job happens: the trough it was fitting is not built, today or later.
    const later = skipDays(loaded, 5).farm;
    expect(later.layout.water.troughs).toEqual(farm.layout.water.troughs);
  });

  it('a mob that was in the yards is still in the yards', () => {
    const b = busyFarm();
    const farm = cloneFarm(b.farm);
    farm.mobs.find((m) => m.id === b.steers)!.where = { kind: 'yards' };
    for (const old of [format2(farm), format3(farm)]) {
      const loaded = loadFarm(old);
      expect(loaded.mobs.find((m) => m.id === b.steers)!.where).toEqual({ kind: 'yards' });
      expect(loaded.buildings.yards).toBe(farm.buildings.yards);
      // The yards have water: a week on, the mob is alive and has not gone dry.
      const week = skipDays(loaded, 'week');
      expect(week.stops).toEqual([]);
      const mob = week.farm.mobs.find((m) => m.id === b.steers)!;
      expect(mob.animals.length).toBe(40);
      expect(mob.dry).toBe(0);
    }
  });

  it('a save made part-way through a day keeps its time of day', () => {
    const b = busyFarm();
    const farm = withLightLeft(b.farm, 200);
    const back = reload(farm);
    expect(back.clock.used).toBe(farm.clock.used);
    // Only a save with no clock at all is put back to first light.
    expect(loadFarm(format2(farm)).clock.used).toBe(0);
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
    });
    expect(farmHash(loaded)).toBe(farmHash(farm));
    // It carries on: a job on the clock, the next day, and a skip, with the real data.
    const job: Action = { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' };
    const done = applyAction(loaded, job, { data });
    if (!done.ok) throw new Error(done.message);
    expect(done.job!.outcome).toBe('part');
    farm = endDay(done.farm, { data }).farm;
    expect(dateOn(farm)).toEqual({ year: 1997, month: 1, date: 6 });
    expect(skipDays(farm, 'week', { data }).daysRun).toBe(7);
    // The same as the farm that was never saved.
    const straight = applyAction(unsaved, job, { data });
    expect(straight.ok && farmHash(straight.farm)).toBe(farmHash(done.farm));
  });
});
