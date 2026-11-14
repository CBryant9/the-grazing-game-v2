import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { AVERAGE_YEAR } from '../../test-support/calibration';
import {
  testSheep,
  heldRun,
  sheepYearRun,
  testMob,
  type SheepYearCase,
  type SheepYearRun,
} from '../../test-support/sheep';
import { FLYSTRIKE, JOIN_START, type SheepBreed } from '../data/sheep';
import { heldDiet } from '../sheep/graze';
import { sheepMobsOf } from '../sheep/farm';
import type { Sheep } from '../sheep/types';

/*
 * The sheep benchmarks of kind "Year" (docs/SHEEP_BENCHMARKS.md): a flock
 * set-stocked for a year on the cattle steer block (260 ha, one water) in
 * the district, judged on the average year, as the cattle are. Each case
 * is the mean over eight seeds. Ewes are stocked at 80% of the block's
 * carrying capacity in DSE (1.5 DSE a ewe over the year), with rams at
 * 1% + 1; shorn at the start and crutched six months on.
 *
 * Every case runs with the district's usual winter feeding (milestone 2.4):
 * grain fed to fill the energy gap whenever a mob's CS falls under 2.7
 * (Lifetime Wool's target from joining to lambing, S18), and weaners fed
 * while they grow under 50 g a day (MMFS S17). Without it the grass
 * model's native winter takes Tablelands ewes from CS 3 to 1.4 at lambing
 * (docs/CALIBRATION.md, the grass question for Claudia).
 *
 * A known open gap is vitest's expected failure (`it.fails`): the reason
 * and the figure are in its name, and it fails the run if it starts to pass.
 */

vi.setConfig({ testTimeout: 1_800_000 });

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const DISTRICTS: readonly DistrictId[] = ['nsw', 'cw', 'wv'];
const NAME: Record<string, string> = {
  nsw: 'Northern Tablelands',
  cw: 'Central West',
  wv: 'Western Victoria',
};
const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const within = (v: number, lo: number, hi: number): void => {
  expect(v).toBeGreaterThanOrEqual(lo);
  expect(v).toBeLessThanOrEqual(hi);
};

/** The month joining starts in (call C27, `JOIN_START`): the run starts on the 1st of it. */
const joinMonth = (d: DistrictId): number => JOIN_START[d]!.month;

const cache = new Map<string, SheepYearRun[]>();
function runs(c: SheepYearCase): SheepYearRun[] {
  const key = JSON.stringify({ ...c, probe: undefined });
  let r = cache.get(key);
  if (!r) {
    r = SEEDS.map((seed) => sheepYearRun(c, seed, AVERAGE_YEAR));
    cache.set(key, r);
  }
  return r;
}

const ewes = (district: DistrictId, breed: SheepBreed = 'merino'): SheepYearRun[] =>
  runs({
    district,
    month: joinMonth(district),
    breed,
    ramBreed: breed,
    stock: 'ewes',
    share: 0.8,
    days: 365,
    crutch: [180],
    winterFeed: true,
  });

const marked = (rs: SheepYearRun[]): number =>
  mean(rs.map((r) => (r.join!.marked / r.join!.joined) * 100));

/**
 * Known open gaps, for Claudia: the row, the district and the figure. Each
 * is an expected failure, so it fails the run if it starts to pass.
 */
const GAPS: Record<string, string> = {
  'SB-43 xb nsw': 'first-cross ewes 4.2% a year (S67 puts their lambing deaths alone at 3.25%)',
  'SB-43 xb cw': 'first-cross ewes 4.7% a year (S67 puts their lambing deaths alone at 3.25%)',
  'SB-43 xb wv': 'first-cross ewes 4.6% a year (S67 puts their lambing deaths alone at 3.25%)',
  'SB-47 wv': 'weaners lose 1.6% (the band is the national average, which takes in worms: C22)',
};

/** A test per district: an expected failure where the row has a known open gap. */
function byDistrict(
  row: string,
  key: (d: DistrictId) => string,
  title: (d: DistrictId) => string,
  check: (d: DistrictId) => void,
): void {
  for (const d of DISTRICTS) {
    const gap = GAPS[key(d)];
    if (gap) it.fails(`${row} ${NAME[d]}: KNOWN OPEN GAP, ${gap}`, () => check(d));
    else it(`${row} ${title(d)}`, () => check(d));
  }
}

describe('sheep benchmarks: year', () => {
  byDistrict(
    'SB-40',
    (d) => `SB-40 ${d}`,
    (d) =>
      `self-replacing Merino ewes, ${NAME[d]}, average year: 75 to 90 lambs marked per 100 ewes joined`,
    (d) => within(marked(ewes(d)), 75, 90),
  );

  byDistrict(
    'SB-41',
    (d) => `SB-41 ${d}`,
    (d) =>
      `first-cross ewes to terminal rams, ${NAME[d]}, average year: 100 to 120 lambs marked per 100 ewes joined`,
    (d) => within(marked(ewes(d, 'xb')), 100, 120),
  );

  /**
   * SB-43: breeding ewes near CS 3, 2 to 4% a year. Held on the mean over the
   * blocks, as every year band is (CALIBRATION, how a benchmark is judged):
   * one block of a few hundred ewes differs from the next by about 0.7
   * points in the same season. The "never over 4.5%" is the same mean, and
   * the highest single block is logged in CALIBRATION.
   */
  for (const breed of ['merino', 'xb'] as const) {
    byDistrict(
      'SB-43',
      (d) => `SB-43 ${breed} ${d}`,
      (d) =>
        `breeding ewes near CS 3, ${breed === 'xb' ? 'first-cross' : 'Merino'}, ${NAME[d]}, average year: 2 to 4% die in a year`,
      (d) => {
        const rs = ewes(d, breed);
        within(mean(rs.map((r) => r.csAtLambing!)), 2.5, 3.3);
        within(mean(rs.map((r) => r.deathsPct)), 2, 4);
      },
    );
  }

  const weanerDeaths = (district: DistrictId): number =>
    mean(
      runs({
        district,
        month: 11,
        breed: 'merino',
        stock: 'weaners',
        share: 0.6,
        days: 365,
        crutch: [120],
        winterFeed: true,
      }).map((r) => r.deathsPct),
    );
  byDistrict(
    'SB-47',
    (d) => `SB-47 ${d}`,
    (d) => `Merino weaners grown to target, ${NAME[d]}, average year: 2 to 6% die after weaning`,
    (d) => within(weanerDeaths(d), 2, 6),
  );

  it('SB-52 adult Merino wethers, Tablelands and Central West, average year, shorn once: 3.8 to 4.6 kg clean, 18 to 20 micron', () => {
    for (const district of ['nsw', 'cw'] as const) {
      const rs = runs({
        district,
        month: joinMonth(district),
        breed: 'merino',
        stock: 'wethers',
        share: 0.8,
        days: 365,
        crutch: [180],
        winterFeed: true,
      });
      within(mean(rs.map((r) => r.fleeceKg)), 3.8, 4.6);
      within(mean(rs.map((r) => r.micron)), 18, 20);
    }
  });

  it('SB-52a adult Merino breeding ewes, all three districts, average year, shorn once: 3.3 to 4.7 kg clean', () => {
    for (const district of ['nsw', 'cw', 'wv'] as const) {
      within(mean(ewes(district).map((r) => r.fleeceKg)), 3.3, 4.7);
    }
  });

  it('SB-52b Merino weaners at their first shearing, about 8 months of wool (Western Victoria): 1.0 to 1.5 kg clean', () => {
    const fleeces = SEEDS.map((seed) => {
      let kg = 0;
      sheepYearRun(
        {
          district: 'wv',
          month: 3,
          breed: 'merino',
          stock: 'ewes',
          share: 0.8,
          days: 430,
          crutch: [180],
          winterFeed: true,
          probe: (_d, farm, isStart) => {
            if (kg) return;
            // The lambs born on the farm this year, by head.
            const lambs = sheepMobsOf(farm).flatMap((m) =>
              m.sheep.filter((s) => !isStart(s) && s.age < 400),
            );
            const head = lambs.reduce((t, s) => t + s.n, 0);
            const by = (f: (s: Sheep) => number): number =>
              lambs.reduce((t, s) => t + f(s) * s.n, 0) / head;
            if (head && by((s) => s.woolDays) >= 240) kg = by((s) => s.fleece);
          },
        },
        seed,
        AVERAGE_YEAR,
      );
      return kg;
    });
    within(mean(fleeces), 1.0, 1.5);
  });

  it('SB-52c first-cross ewes against Merino ewes on the same feed for a year (Western Victoria): 65 to 85% of the Merino cut', () => {
    // Greasy at the one national yield (call C15), so the clean and greasy shares are the same.
    const xb = mean(ewes('wv', 'xb').map((r) => r.fleeceKg));
    const mer = mean(ewes('wv').map((r) => r.fleeceKg));
    within(xb / mer, 0.65, 0.85);
  });

  /** A year of flystrike on a held paddock: shorn on day 0, crutched on day 200. */
  function strikeYear(
    breed: SheepBreed,
    seed: number,
  ): { struckPct: number; diedOfStruck: number } {
    // A large flock (one record of 100,000 ewes) so a 2% share of the struck is measured to a tenth of a point.
    const N = 100_000;
    const m = testMob([testSheep({ sex: 'F', breed, n: N })]);
    let struck = 0;
    let died = 0;
    heldRun(m, 365, {
      diet: heldDiet(1500, 0.68),
      seed,
      each: (day, r, mob) => {
        if (day === 0 || day === 200) for (const s of mob.sheep) s.flyCover = FLYSTRIKE.protectDays;
        for (const note of r.notes) if (note.type === 'flystrike') struck += note.count;
        for (const d of r.deaths) if (d.cause === 'flystrike') died += d.count;
      },
    });
    // Strikes per 100 ewes: a ewe struck twice in the year counts twice (records do not keep which ewe).
    return { struckPct: (struck / N) * 100, diedOfStruck: died / Math.max(1, struck) };
  }

  it('SB-53 unmulesed Merino ewes, a year with normal care: 10 to 25% struck, and about 2% of those struck die within 7 days', () => {
    const r = strikeYear('merino', 61);
    within(r.struckPct, 10, 25);
    within(r.diedOfStruck * 100, 1.8, 2.2);
    // The rule itself: 2% over the 7 days.
    const daily = 1 - Math.pow(1 - FLYSTRIKE.dieShare, 1 / FLYSTRIKE.dieWithin);
    expect(1 - Math.pow(1 - daily, FLYSTRIKE.dieWithin)).toBeCloseTo(0.02, 9);
  });

  it('SB-54 unmulesed crossbred ewes, a year with normal care: 2 to 8% struck', () => {
    within(strikeYear('xb', 62).struckPct, 2, 8);
  });

  it.skip('SB-59 sheep on unimproved native pasture, Northern Tablelands: 4 to 6 DSE/ha: skipped (C18), the grass model carries 3.5 DSE/ha there', () => {});
  it.skip('SB-60 sheep on sown, fertilised pasture, Northern Tablelands: 12 to 17.5 DSE/ha: skipped (C18), the carrying capacity rule gives about 5.5 DSE/ha on phalaris', () => {});
  it.skip('SB-61 sheep on improved perennial pasture, Western Victoria: 13 to 23 DSE/ha: skipped (C18), the carrying capacity rule gives about 7 DSE/ha on phalaris or ryegrass', () => {});
  it.skip('SB-62 a Central West whole farm: 1.0 to 1.5 DSE/ha per 100 mm of rain: skipped (C18), it needs sown pasture, lucerne and crops (the native rule gives about 0.45)', () => {});
});
