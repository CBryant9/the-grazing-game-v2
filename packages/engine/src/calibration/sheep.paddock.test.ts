import { describe, expect, it } from 'vitest';
import { heldRun, testMob, testSheep } from '../../test-support/sheep';
import { dietOf } from '../cattle/graze';
import type { GrazingLand } from '../cattle/types';
import { DISTRICTS } from '../data/districts';
import { SRW } from '../data/sheep';
import { GRID_N } from '../grid';
import { meFromDmd } from '../pasture/quality';
import { createPastureState } from '../pasture/state';
import { needsMJ } from '../sheep/energy';
import { heldDiet, sheepDietOf } from '../sheep/graze';
import type { Sheep } from '../sheep/types';

/*
 * The sheep benchmarks of kind "Paddock" (docs/SHEEP_BENCHMARKS.md): one
 * mob on one paddock held at a set green mass and digestibility (call C5:
 * green herbage mass, the MLA Pasture Ruler's measure), with as much of it
 * as they want. Each test is named by its row and asserts its band.
 */

const within = (v: number, lo: number, hi: number): void => {
  expect(v).toBeGreaterThanOrEqual(lo);
  expect(v).toBeLessThanOrEqual(hi);
};

/** Weight change over the first day on the feed, g a day (the mob's average). */
function gainOn(make: () => Sheep, green: number, dmd: number, n = 1): number {
  const sheep: Sheep[] = [];
  for (let i = 0; i < n; i++) sheep.push({ ...make(), id: i + 1 });
  const m = testMob(sheep);
  const w0 = m.sheep.reduce((t, s) => t + s.wt, 0);
  heldRun(m, 1, { diet: heldDiet(green, dmd), seed: 1 });
  return ((m.sheep.reduce((t, s) => t + s.wt, 0) - w0) / m.sheep.length) * 1000;
}

/** ME eaten over ME needed for the stage, on the first day on the feed. */
function needsMet(make: () => Sheep, lambs: number, green: number, dmd: number): number {
  const s = make();
  const kids: Sheep[] = [];
  for (let i = 0; i < lambs; i++)
    kids.push(testSheep({ id: 100 + i, weaned: false, dam: s.id, wt: 12, age: 30 }));
  const m = testMob([s, ...kids]);
  const need = needsMJ(s, lambs);
  let mei = 0;
  heldRun(m, 1, {
    diet: heldDiet(green, dmd),
    seed: 1,
    each: (_d, r) => {
      mei = r.st.intake * meFromDmd(dmd);
    },
  });
  return mei / need;
}

const dry = (): Sheep => testSheep({ sex: 'W', wt: 50 });
const lateSingle = (): Sheep => testSheep({ sex: 'F', wt: 50, preg: 132, litter: 1 });
const lactSingle = (): Sheep => testSheep({ sex: 'F', wt: 50, lact: 30, reared: 1 });
const lactTwins = (): Sheep => testSheep({ sex: 'F', wt: 50, lact: 30, reared: 2 });
const weaner =
  (o: Partial<Sheep> = {}): (() => Sheep) =>
  () =>
    testSheep({ sex: 'W', wt: 30, age: 180, ...o });
const ANY_MASS = 5000;

/** A one-square paddock with this green and dead feed and fresh leaf, for the cattle and sheep diets. */
function oneSquare(green: number, dead: number): { land: GrazingLand; cells: number[] } {
  const pasture = createPastureState();
  pasture.G[0] = green;
  pasture.D[0] = dead;
  pasture.F[0] = 1;
  return {
    land: {
      pasture,
      district: DISTRICTS.wv,
      plantings: null,
      haPerSquare: 10,
      sideM: 316,
      distToWater: new Float32Array(GRID_N),
    },
    cells: [0],
  };
}

describe('sheep benchmarks: paddock', () => {
  it('SB-17 dry sheep hold weight (−20 to +20 g a day) on 400 kg green at 75%, 600 at 68%, 1,200 at 60%, and lose at 60% of each mass', () => {
    for (const [g, d] of [
      [400, 0.75],
      [600, 0.68],
      [1200, 0.6],
    ] as const) {
      within(gainOn(dry, g, d), -20, 20);
      expect(gainOn(dry, g * 0.6, d)).toBeLessThan(0);
    }
  });

  it('SB-18 a ewe in the last month with a single gets 90 to 110% of her needs on 700 kg green at 75% and 1,200 at 68%, under 90% at any mass at 60%', () => {
    within(needsMet(lateSingle, 0, 700, 0.75), 0.9, 1.1);
    within(needsMet(lateSingle, 0, 1200, 0.68), 0.9, 1.1);
    expect(needsMet(lateSingle, 0, ANY_MASS, 0.6)).toBeLessThan(0.9);
  });

  it('SB-19 a ewe milking a single gets 90 to 110% of her needs on 1,000 kg green at 75% and 1,700 at 68%, under 90% at any mass at 60%', () => {
    within(needsMet(lactSingle, 1, 1000, 0.75), 0.9, 1.1);
    within(needsMet(lactSingle, 1, 1700, 0.68), 0.9, 1.1);
    expect(needsMet(lactSingle, 1, ANY_MASS, 0.6)).toBeLessThan(0.9);
  });

  it('SB-20 a ewe milking twins gets 90 to 110% of her needs on 1,500 kg green at 75%, under 90% at any mass at 68%', () => {
    within(needsMet(lactTwins, 2, 1500, 0.75), 0.9, 1.1);
    expect(needsMet(lactTwins, 2, ANY_MASS, 0.68)).toBeLessThan(0.9);
  });

  it('SB-21 weaners grow 100 to 150 g a day on 600 kg green at 75% and 1,000 at 68%', () => {
    within(gainOn(weaner(), 600, 0.75), 100, 150);
    within(gainOn(weaner(), 1000, 0.68), 100, 150);
  });

  it('SB-22 weaners grow 150 to 200 g a day on 800 kg green at 75% and 1,700 at 68%', () => {
    within(gainOn(weaner(), 800, 0.75), 150, 200);
    within(gainOn(weaner(), 1700, 0.68), 150, 200);
  });

  it('SB-23 weaners grow 200 to 250 g a day on 1,600 kg green at 75%, under 200 at any mass at 68%', () => {
    within(gainOn(weaner(), 1600, 0.75), 200, 250);
    expect(gainOn(weaner(), ANY_MASS, 0.68)).toBeLessThan(200);
  });

  it('SB-24 large Merino and crossbred weaners grow over 200 g a day on good green pasture over 2,000 kg/ha feed on offer', () => {
    // Feed on offer is herbage mass plus 300 (Lifetime Wool, S19): 1,700 kg green and up.
    for (const green of [1700, 2500]) {
      expect(gainOn(weaner({ breed: 'xb', srw: SRW.xb }), green, 0.75)).toBeGreaterThan(200);
      expect(gainOn(weaner({ srw: SRW.largeMerino }), green, 0.75)).toBeGreaterThan(200);
    }
  });

  it('SB-25 at 1,600 kg green (6 cm) dry sheep get 90% or more of their intake, and a bigger share than cattle', () => {
    const { land, cells } = oneSquare(1600, 0);
    const area = { cells, ha: 10, hasWater: true };
    const sheep = sheepDietOf(land, area).diet.avail;
    const cattle = dietOf(land, area).diet.avail;
    expect(sheep).toBeGreaterThanOrEqual(0.9);
    expect(sheep).toBeGreaterThan(cattle);
  });

  it('SB-26 sheep at 800 kg/ha feed on offer and cattle at 1,200 get shares of their intake within 10 points of each other (C19)', () => {
    const s = oneSquare(800, 0);
    const c = oneSquare(1200, 0);
    const area = { cells: [0], ha: 10, hasWater: true };
    const sheep = sheepDietOf(s.land, area).diet.avail;
    const cattle = dietOf(c.land, area).diet.avail;
    expect(Math.abs(sheep - cattle)).toBeLessThanOrEqual(0.1);
  });
});
