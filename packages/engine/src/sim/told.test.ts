import { describe, expect, it, vi } from 'vitest';
import { toSaleDay, work } from '../../test-support/workingDay';
import { classOf } from '../cattle/animal';
import {
  GESTATION_DAYS,
  JOINING_DAYS,
  JOINING_REPORT_DAYS,
  joiningFemales,
} from '../cattle/breeding';
import type { Animal } from '../cattle/types';
import { endDay } from '../day/days';
import { PREG_PREMIUM, netSaleValue } from '../market/prices';
import { farmHash, loadFarm, saveFarm, type SavedFarm } from '../save/save';
import { createFarm } from './create';
import { pricesOf } from './derived';
import type { TickEvent } from './events';
import type { FarmState } from './state';
import { breedingReports, mobSummaries } from './summary';
import { stepDay } from './tick';
import { knownClassOf } from './told';

/*
 * The player is told only what a joining report or a preg test has told
 * them (the screens review, 14 Nov 2026). A grazier can't see which cows
 * are in calf: REQUIREMENTS asks for a joining report every three weeks and
 * a preg test at nine weeks. PTIC means pregnancy-tested in calf.
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
const knownTotal = (farm: FarmState): number =>
  breedingReports(farm).reduce((t, r) => t + r.knownInCalf.cows + r.knownInCalf.heifers, 0);
const liveInCalf = (farm: FarmState): number =>
  everyone(farm).filter((a) => (a.kind === 'cow' || a.kind === 'heifer') && a.preg >= 0).length;

/** The joining notes in a day's events, by mob. */
function notesOf(events: readonly TickEvent[], type: 'joiningProgress' | 'pregTest') {
  return events.flatMap((e) => (e.type === 'cattle' && e.note.type === type ? [e] : []));
}

/** Events that may change the head known in calf on a day with no report: calving, a slip, deaths, weaning, mobs joining. */
const STOCK_CHANGES = new Set(['births', 'deaths', 'weaned', 'mobs-joined', 'mob-split']);
const changedStock = (events: readonly TickEvent[], mob: number): boolean =>
  events.some(
    (e) =>
      (STOCK_CHANGES.has(e.type) && 'mob' in e && e.mob === mob) ||
      e.type === 'mobs-joined' ||
      (e.type === 'cattle' && e.mob === mob && e.note.type === 'slipped') ||
      (e.type === 'cattle' && e.mob === mob && e.note.type === 'calfLostAtBirth'),
  );

describe('what the engine tells the player', () => {
  it('a joining runs 9 weeks, with a report every 3: the screens read the length from the engine', () => {
    expect(JOINING_DAYS).toBe(63);
    expect(JOINING_REPORT_DAYS).toBe(21);
    expect(JOINING_DAYS / 7).toBe(9);
  });

  it('a new running farm: the cows that came PTIC are known in calf, and nothing has been reported yet', () => {
    const farm = herdFarm();
    const reports = breedingReports(farm);
    expect(reports.length).toBe(farm.mobs.length);
    for (const r of reports) {
      expect(r.joining).toBeNull();
      expect(r.pregTest).toBeNull();
    }
    // Every cow in calf on day 0 came as PTIC, so the player knows them all.
    expect(knownTotal(farm)).toBe(liveInCalf(farm));
    expect(knownTotal(farm)).toBeGreaterThan(0);
    const cows = breedingReports(farm).find((r) => r.knownInCalf.cows > 0)!;
    const sum = mobSummaries(farm).find((m) => m.id === cows.mob)!;
    expect(cows.classes).toEqual(sum.classes);
  });

  it('through a joining: the reports change only on report days, and live conceptions never show', () => {
    const farm = herdFarm();
    let before = breedingReports(farm);
    let conceivedUnseen = 0;
    let reportDays = 0;
    let testDays = 0;
    let joinedOn = -1;
    for (let d = 0; d < 200; d++) {
      const live = liveInCalf(farm);
      const day = farm.day;
      const res = stepDay(farm);
      if (joinedOn < 0) {
        const started = res.events.find(
          (e) => e.type === 'cattle' && e.note.type === 'joiningStarted',
        );
        if (started) joinedOn = day;
      }
      const after = breedingReports(farm);
      const progress = notesOf(res.events, 'joiningProgress');
      const tests = notesOf(res.events, 'pregTest');
      for (const r of after) {
        const was = before.find((b) => b.mob === r.mob);
        const p = progress.find((e) => e.mob === r.mob);
        const t = tests.find((e) => e.mob === r.mob);
        if (p && p.note.type === 'joiningProgress') {
          reportDays++;
          expect(r.joining).toEqual({
            day,
            weeks: p.note.weeks,
            conceived: p.note.conceived,
            inCalf: p.note.inCalf,
            females: p.note.females,
          });
        } else if (was) {
          expect(r.joining, `day ${day}: joining report changed with no report`).toEqual(
            was.joining,
          );
        }
        if (t && t.note.type === 'pregTest') {
          testDays++;
          expect(r.pregTest).toMatchObject({
            day,
            inCalf: t.note.inCalf,
            females: t.note.females,
            rate: t.note.rate,
            expected: t.note.expected,
            tooSoon: t.note.tooSoon,
          });
          // After the test the player knows every female it found in calf.
          const m = farm.mobs.find((x) => x.id === r.mob)!;
          const found = joiningFemales(m).filter((a) => a.preg >= 0);
          for (const a of found) expect(farm.knownInCalf).toContain(a.id);
          if (!res.deaths.some((x) => x.mob === r.mob)) {
            expect(r.knownInCalf.cows + r.knownInCalf.heifers).toBeGreaterThanOrEqual(
              t.note.inCalf,
            );
          }
        } else if (was) {
          expect(r.pregTest, `day ${day}: preg test changed with no test`).toEqual(was.pregTest);
          if (!changedStock(res.events, r.mob)) {
            expect(r.knownInCalf, `day ${day}: known in calf changed with no report`).toEqual(
              was.knownInCalf,
            );
          }
        }
      }
      if (!tests.length && liveInCalf(farm) > live) conceivedUnseen++;
      before = after;
    }
    // The run went through joining reports and a preg test, and conceptions on other days
    // never reached the read.
    expect(reportDays).toBeGreaterThan(0);
    expect(testDays).toBeGreaterThan(0);
    expect(conceivedUnseen).toBeGreaterThan(5);
    expect(joinedOn).toBe(0);
  });

  it('the preg test comes the length of a joining after it starts', () => {
    const farm = herdFarm();
    let first = -1;
    for (let d = 0; d < 80 && first < 0; d++) {
      const day = farm.day;
      if (notesOf(stepDay(farm).events, 'pregTest').length) first = day;
    }
    expect(first).toBe(JOINING_DAYS);
  });

  it('a cow in calf that nobody has told the player about is listed as if empty', () => {
    const farm = herdFarm();
    const cow = everyone(farm).find((a) => a.kind === 'cow' && a.preg < 0 && !a.calf)!;
    cow.preg = 20;
    expect(classOf(cow)).toBe('pticCow');
    expect(knownClassOf(cow, new Set(farm.knownInCalf))).toBe('dryCow');
    const mob = farm.mobs.find((m) => m.animals.includes(cow))!;
    const r = breedingReports(farm).find((x) => x.mob === mob.id)!;
    const sum = mobSummaries(farm).find((x) => x.id === mob.id)!;
    expect(r.classes.pticCow).toBe((sum.classes.pticCow ?? 0) - 1);
    expect(r.classes.dryCow).toBe((sum.classes.dryCow ?? 0) + 1);
  });

  it('a known cow that calves comes off the list, and is not counted again when she gets back in calf', () => {
    const farm = herdFarm();
    const id = farm.knownInCalf[0]!;
    const cow = everyone(farm).find((a) => a.id === id)!;
    cow.preg = GESTATION_DAYS - 1;
    const known = knownTotal(farm);
    stepDay(farm);
    expect(cow.preg).toBe(-1);
    expect(farm.knownInCalf).not.toContain(id);
    expect(knownTotal(farm)).toBeLessThanOrEqual(known - 1);
    cow.preg = 5;
    expect(knownClassOf(cow, new Set(farm.knownInCalf))).not.toMatch(/^ptic/);
  });

  it('a cow known in calf that is sold or dies comes off the list', () => {
    const farm = herdFarm();
    const mob = farm.mobs.find((m) => m.animals.some((a) => farm.knownInCalf.includes(a.id)))!;
    const id = mob.animals.find((a) => farm.knownInCalf.includes(a.id))!.id;
    const sold = work(toSaleDay(farm), { type: 'sellAnimals', ids: [id] }).farm;
    const next = endDay(sold).farm;
    expect(next.knownInCalf).not.toContain(id);
  });
});

describe('cattle bought PTIC', () => {
  it('are known in calf from the day they are bought, on their way and once they land', () => {
    const farm = toSaleDay(
      createFarm({
        seed: 4,
        district: 'nsw',
        size: 'small',
        start: { year: 2023, month: 8 },
        startType: 'scratch',
        difficulty: 'easy',
      }),
    );
    expect(farm.knownInCalf.length).toBe(0);
    const bought = work(farm, { type: 'buyCattle', cls: 'ptic', qty: 8 }).farm;
    expect(bought.knownInCalf.length).toBe(8);
    const landed = endDay(bought).farm;
    expect(landed.knownInCalf.length).toBe(8);
    const r = breedingReports(landed);
    expect(r.reduce((t, x) => t + x.knownInCalf.cows, 0)).toBe(8);
    expect(r[0]!.classes.pticCow).toBe(8);
    // Dry cows bought are not known in calf.
    const dry = work(toSaleDay(landed), { type: 'buyCattle', cls: 'dryCow', qty: 5 }).farm;
    expect(dry.knownInCalf.length).toBe(8);
  });
});

describe('display state only', () => {
  it('no formula, price or chance reads it: a farm with it wiped runs the same', () => {
    const a = herdFarm(33);
    const b = herdFarm(33);
    b.knownInCalf = new Int32Array(0);
    for (let d = 0; d < 120; d++) {
      stepDay(a);
      stepDay(b);
      // Wipe what the player was told on one farm every day.
      b.knownInCalf = new Int32Array(0);
      for (const m of b.mobs) delete m.reports;
    }
    const strip = (f: FarmState): string => {
      const s = saveFarm(f) as Record<string, unknown>;
      delete s.knownInCalf;
      for (const m of s.mobs as Record<string, unknown>[]) delete m.reports;
      return JSON.stringify(s);
    };
    expect(strip(a)).toBe(strip(b));
    expect(a.knownInCalf.length).toBeGreaterThan(0);
  });
});

describe('saves', () => {
  /** A farm part way through its second joining, after a preg test. */
  function afterATest(): FarmState {
    const farm = herdFarm();
    for (let d = 0; d < JOINING_DAYS + 30; d++) stepDay(farm);
    expect(breedingReports(farm).some((r) => r.pregTest)).toBe(true);
    return farm;
  }

  it('what the player was told is saved, and save, load and carry on is the same as straight through', () => {
    const farm = afterATest();
    const loaded = loadFarm(JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm);
    expect(breedingReports(loaded)).toEqual(breedingReports(farm));
    expect(Array.from(loaded.knownInCalf)).toEqual(Array.from(farm.knownInCalf));
    for (let d = 0; d < 40; d++) {
      stepDay(farm);
      stepDay(loaded);
    }
    expect(farmHash(loaded)).toBe(farmHash(farm));
  });

  it('it is in the hash', () => {
    const farm = afterATest();
    const other = { ...farm, knownInCalf: farm.knownInCalf.slice(1) };
    expect(farmHash(other)).not.toBe(farmHash(farm));
  });

  it('an older save loads with no female known in calf, and each mob’s reports read back from the inbox', () => {
    const farm = afterATest();
    const old = JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm;
    delete old.knownInCalf;
    for (const m of old.mobs as Record<string, unknown>[]) delete m.reports;
    old.saveFormat = 6;
    const loaded = loadFarm(old);
    expect(loaded.knownInCalf.length).toBe(0);
    const now = breedingReports(farm);
    const back = breedingReports(loaded);
    for (const r of back) {
      const was = now.find((x) => x.mob === r.mob)!;
      // The inbox keeps the last 120 messages, which reach back past the test here.
      expect(r.pregTest).toEqual(was.pregTest);
      expect(r.joining).toEqual(was.joining);
      expect(r.knownInCalf).toEqual({ cows: 0, heifers: 0 });
    }
    // And it plays on.
    stepDay(loaded);
    expect(loaded.day).toBe(farm.day + 1);
  });
});

describe('the pregnancy premium (for Claudia: not changed)', () => {
  it('a cow’s sale value steps up on her 50th day in calf, tested or not', () => {
    const farm = herdFarm();
    const prices = pricesOf(farm);
    const cow = everyone(farm).find((a) => a.kind === 'cow' && a.preg < 0)!;
    const at = (preg: number): number => netSaleValue({ ...cow, preg }, prices);
    expect(at(0)).toBe(at(-1));
    expect(at(PREG_PREMIUM.fromDays - 1)).toBe(at(-1));
    // On day 50 the premium lands, less commission: 13 days before a preg test can find her
    // when she conceived on the first day of a joining.
    expect(at(PREG_PREMIUM.fromDays) - at(-1)).toBeCloseTo(
      ((PREG_PREMIUM.dollars * prices.indicator) / PREG_PREMIUM.atIndicator) * 0.95,
      6,
    );
    expect(JOINING_DAYS - PREG_PREMIUM.fromDays).toBe(13);
  });
});
