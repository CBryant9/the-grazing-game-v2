import { describe, expect, it, vi } from 'vitest';
import { toSaleDay, work } from '../../test-support/workingDay';
import { classOf } from '../cattle/animal';
import type { Animal } from '../cattle/types';
import { endDay } from '../day/days';
import { PREG_PREMIUM, netSaleValue } from '../market/prices';
import { farmHash, loadFarm, saveFarm, type SavedFarm } from '../save/save';
import { createFarm } from './create';
import { pricesOf } from './derived';
import type { FarmState } from './state';
import { breedingReports } from './summary';
import { stepDay } from './tick';
import { PTIC_DAYS, onRecordPtic, recordClassOf, recordGroupOf } from './told';
import { farmView } from './view';

/*
 * The herd record (Claudia, 14 Nov 2026): a cow or heifer is PTIC on the
 * record, by herself, from PTIC_DAYS in calf. Before that she shows exactly
 * as a cow or heifer not in calf. The sale price pays the in-calf premium
 * from the same day, so the record and the price agree.
 */

vi.setConfig({ testTimeout: 600_000 });

/** A running farm: cows (some bought PTIC, some with calves, some dry) with bulls, and weaners. */
const herdFarm = (seed = 21): FarmState =>
  createFarm({
    seed,
    district: 'nsw',
    size: 'small',
    start: { year: 2023, month: 8 },
    startType: 'running',
    difficulty: 'medium',
  });

const everyone = (farm: FarmState): Animal[] => farm.mobs.flatMap((m) => m.animals);

describe('the record', () => {
  it('PTIC_DAYS is the day the price starts paying the in-calf premium', () => {
    expect(PTIC_DAYS).toBe(PREG_PREMIUM.fromDays);
    expect(PTIC_DAYS).toBe(50);
  });

  it('a cow 10 days in calf shows exactly as a cow not in calf, in every read for the player', () => {
    const farm = herdFarm();
    const m = farm.mobs.find((x) => x.animals.some((a) => a.kind === 'cow' && !a.calf))!;
    const cow = m.animals.find((a) => a.kind === 'cow' && !a.calf)!;
    const read = () => ({
      cls: recordClassOf(cow),
      group: recordGroupOf(cow),
      report: breedingReports(farm).find((r) => r.mob === m.id),
      view: farmView(farm).mobs.find((x) => x.id === m.id)!.classes,
    });
    cow.preg = -1;
    const empty = read();
    cow.preg = 10;
    const tenDays = read();
    expect(tenDays).toEqual(empty);
    expect(empty.cls).toBe('dryCow');
    expect(empty.group).toBe('cowE');
    // But the live class (for tests and calibration) knows.
    expect(classOf(cow)).toBe('pticCow');
    cow.preg = PTIC_DAYS - 1;
    expect(read()).toEqual(empty);
    cow.preg = PTIC_DAYS;
    expect(recordClassOf(cow)).toBe('pticCow');
    expect(recordGroupOf(cow)).toBe('cowP');
    expect(onRecordPtic(cow)).toBe(true);
  });

  it('the report gives head PTIC and how far along, in whole months', () => {
    const farm = herdFarm();
    const all = everyone(farm).filter((a) => a.kind === 'cow');
    for (const a of all) a.preg = -1;
    all[0]!.preg = 70; // 2 months
    all[1]!.preg = 130; // 4 months
    all[2]!.preg = 20; // not on the record yet
    const m = farm.mobs.find((x) => x.animals.includes(all[0]!))!;
    const r = breedingReports(farm).find((x) => x.mob === m.id)!;
    const here = [all[0], all[1]].filter((a) => m.animals.includes(a!)).length;
    expect(r.ptic.cows).toBe(here);
    if (here === 2) expect(r.months).toEqual({ least: 2, most: 4 });
    expect(r.classes.pticCow ?? 0).toBe(here);
  });

  it('through a joining, the record counts PTIC only from PTIC_DAYS in calf', () => {
    const farm = herdFarm();
    for (let d = 0; d < 120; d++) {
      stepDay(farm);
      const live = everyone(farm).filter(
        (a) => (a.kind === 'cow' || a.kind === 'heifer') && a.preg >= PTIC_DAYS,
      ).length;
      const record = breedingReports(farm).reduce((t, r) => t + r.ptic.cows + r.ptic.heifers, 0);
      expect(record).toBe(live);
    }
  });

  it('cattle bought PTIC are on the record as PTIC from the day they land', () => {
    const farm = toSaleDay(herdFarm());
    const bought = work(farm, { type: 'buyCattle', cls: 'ptic', qty: 8 }).farm;
    const landed = endDay(bought).farm;
    const before = breedingReports(farm).reduce((t, r) => t + r.ptic.cows, 0);
    const after = breedingReports(landed).reduce((t, r) => t + r.ptic.cows, 0);
    expect(after - before).toBeGreaterThanOrEqual(8);
    // The bought cattle, where they are now (landed in the yards): every one is PTIC on the record.
    const ids = new Set(bought.arrivals.flatMap((x) => x.animals.map((a) => a.id)));
    const here = landed.mobs.flatMap((m) => m.animals).filter((a) => ids.has(a.id));
    const cows = here.filter((a) => a.kind !== 'calf');
    expect(cows.length).toBe(8);
    for (const a of cows) expect(onRecordPtic(a)).toBe(true);
  });
});

describe('the price agrees with the record', () => {
  it('only cows on the record as PTIC get the PTIC price; all others sell as cows', () => {
    const farm = herdFarm();
    const prices = pricesOf(farm);
    const cow = everyone(farm).find((a) => a.kind === 'cow' && a.preg < 0)!;
    const at = (preg: number): number => netSaleValue({ ...cow, preg }, prices);
    for (const preg of [-1, 0, 10, PTIC_DAYS - 1]) {
      expect(onRecordPtic({ ...cow, preg })).toBe(false);
      expect(at(preg)).toBe(at(-1));
    }
    for (const preg of [PTIC_DAYS, 100, 250]) {
      expect(onRecordPtic({ ...cow, preg })).toBe(true);
      expect(at(preg)).toBeGreaterThan(at(-1));
    }
  });
});

describe('saves', () => {
  it('save, load and carry on is the same as straight through', () => {
    const farm = herdFarm();
    for (let d = 0; d < 60; d++) stepDay(farm);
    const loaded = loadFarm(JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm);
    expect(breedingReports(loaded)).toEqual(breedingReports(farm));
    for (let d = 0; d < 40; d++) {
      stepDay(farm);
      stepDay(loaded);
    }
    expect(farmHash(loaded)).toBe(farmHash(farm));
  });

  it('a format 7 save loads with what it kept of preg tests dropped, and plays on', () => {
    const farm = herdFarm();
    for (let d = 0; d < 30; d++) stepDay(farm);
    const old = JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm;
    (old as Record<string, unknown>).knownInCalf = [1, 2, 3];
    for (const m of old.mobs as Record<string, unknown>[]) {
      m.reports = { joining: null, pregTest: null };
    }
    old.saveFormat = 7;
    const loaded = loadFarm(old);
    expect('knownInCalf' in loaded).toBe(false);
    expect(loaded.mobs.every((m) => !('reports' in m))).toBe(true);
    expect(breedingReports(loaded)).toEqual(breedingReports(farm));
    stepDay(loaded);
    expect(loaded.day).toBe(farm.day + 1);
  });
});
