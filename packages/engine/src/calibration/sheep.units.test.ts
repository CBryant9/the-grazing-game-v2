import { describe, expect, it } from 'vitest';
import { flock, heldRun, testMob, testSheep } from '../../test-support/sheep';
import { CYCLE_DAYS, DSE_MJ, GESTATION_DAYS, REF_WALK, SRW, fenceHoldsSheep } from '../data/sheep';
import { onHeat } from '../sheep/breeding';
import { appetiteShare, dseOf, kgPerCs, maintMJ, needsMJ, qualityFactor } from '../sheep/energy';
import { heldDiet, sheepAvail } from '../sheep/graze';
import { sheepWaterLitres } from '../sheep/farm';
import { micronAt, woolGrowthG } from '../sheep/wool';
import type { Sheep } from '../sheep/types';

/*
 * The sheep benchmarks of kind "Unit" (docs/SHEEP_BENCHMARKS.md, the
 * benchmark table): a sheep and a feed, no paddock or farm. Each test is
 * named by its row and asserts the row's band.
 */

const within = (v: number, lo: number, hi: number): void => {
  expect(v).toBeGreaterThanOrEqual(lo);
  expect(v).toBeLessThanOrEqual(hi);
};

const wether = (): Sheep => testSheep({ sex: 'W', wt: 50 });
const ewe = (o: Partial<Sheep> = {}): Sheep => testSheep({ sex: 'F', wt: 50, ...o });
const lactating = (lambs: number, o: Partial<Sheep> = {}): [Sheep, number] => [
  ewe({ lact: 30, reared: lambs, ...o }),
  lambs,
];

/** Green leafy feed, plenty of it: 75% digestible, 3,000 kg green. */
const LUSH = heldDiet(3000, 0.75);
const intakeShare = (s: Sheep, lambs: number): number =>
  appetiteShare(s, lambs) * qualityFactor(LUSH.dmd) * LUSH.avail;

describe('sheep benchmarks: unit', () => {
  it('SB-01 a dry 50 kg Merino wether at CS 3 needs 7.6 to 9.7 MJ ME a day', () => {
    within(maintMJ(wether(), REF_WALK), 7.6, 9.7);
  });

  it('SB-02 a dry 50 kg Merino wether at CS 3 is 0.9 to 1.1 DSE', () => {
    within(dseOf(wether(), 0), 0.9, 1.1);
  });

  it('SB-03 dry Merino ewes: 40 kg is 0.8 to 1.0 DSE, 60 kg is 1.1 to 1.3 (C32: check the printed table)', () => {
    within(dseOf(ewe({ wt: 40 }), 0), 0.8, 1.0);
    within(dseOf(ewe({ wt: 60 }), 0), 1.1, 1.3);
  });

  it('SB-04 a medium Merino ewe with a single at day 130 needs 12 to 14 MJ', () => {
    within(needsMJ(ewe({ preg: 130, litter: 1 }), 0), 12, 14);
  });

  it('SB-05 a medium Merino ewe with twins at day 130 needs 14.5 to 17.5 MJ', () => {
    within(needsMJ(ewe({ preg: 130, litter: 2 }), 0), 14.5, 17.5);
  });

  it('SB-06 a medium Merino ewe milking a single at mid-lactation needs 18.5 to 23 MJ', () => {
    within(needsMJ(...lactating(1)), 18.5, 23);
  });

  it('SB-07 a medium Merino ewe milking twins at mid-lactation needs 23.5 to 28.5 MJ', () => {
    within(needsMJ(...lactating(2)), 23.5, 28.5);
  });

  it('SB-08 a large Merino ewe needs 1.5 to 2.5 MJ more at each stage, 3 to 5 more with twins in lactation', () => {
    const big = { srw: SRW.largeMerino, wt: SRW.largeMerino };
    const pairs: [number, number, number, number][] = [
      [
        needsMJ(ewe({ preg: 130, litter: 1 }), 0),
        needsMJ(ewe({ preg: 130, litter: 1, ...big }), 0),
        1.5,
        2.5,
      ],
      [
        needsMJ(ewe({ preg: 130, litter: 2 }), 0),
        needsMJ(ewe({ preg: 130, litter: 2, ...big }), 0),
        1.5,
        2.5,
      ],
      [needsMJ(...lactating(1)), needsMJ(...lactating(1, big)), 1.5, 2.5],
      [needsMJ(...lactating(2)), needsMJ(...lactating(2, big)), 3, 5],
      [needsMJ(ewe(), 0), needsMJ(ewe(big), 0), 1.5, 2.5],
    ];
    for (const [medium, large, lo, hi] of pairs) within(large - medium, lo, hi);
  });

  it('SB-09 a 50 kg Merino ewe in the last month of pregnancy with a single is 1.3 to 1.5 DSE', () => {
    let t = 0;
    for (let d = GESTATION_DAYS - 30; d < GESTATION_DAYS; d++)
      t += dseOf(ewe({ preg: d, litter: 1 }), 0);
    within(t / 30, 1.3, 1.5);
  });

  it('SB-10 a 50 kg Merino ewe milking a single is 2.2 to 2.5 DSE', () => {
    within(dseOf(...lactating(1)), 2.2, 2.5);
  });

  it('SB-11 a 50 kg Merino ewe milking twins is 3.1 to 3.4 DSE', () => {
    within(dseOf(...lactating(2)), 3.1, 3.4);
  });

  it('SB-12 a mature ram is 1.8 to 2.2 DSE', () => {
    within(dseOf(testSheep({ sex: 'M' }), 0), 1.8, 2.2);
  });

  it('SB-13 a 25 kg Merino weaner is 0.6 to 0.7 DSE at no gain, 0.9 to 1.0 at 100 g a day', () => {
    const w = (adg: number): Sheep => testSheep({ sex: 'F', wt: 25, age: 150, adg });
    within(dseOf(w(0), 0), 0.6, 0.7);
    within(dseOf(w(0.1), 0), 0.9, 1.0);
  });

  it('SB-14 a dry adult sheep on green leafy feed eats 2 to 3% of its live weight', () => {
    within(intakeShare(wether(), 0) * 100, 2, 3);
    within(intakeShare(ewe(), 0) * 100, 2, 3);
  });

  it('SB-15 a weaner on green leafy feed eats 3.5 to 4.5% of its live weight', () => {
    within(intakeShare(testSheep({ wt: 25, age: 150 }), 0) * 100, 3.5, 4.5);
    within(intakeShare(testSheep({ wt: 30, age: 180 }), 0) * 100, 3.5, 4.5);
  });

  it('SB-16 a lactating ewe on green leafy feed eats 4 to 5.5% of its live weight', () => {
    within(intakeShare(...lactating(1)) * 100, 4, 5.5);
    within(intakeShare(...lactating(2)) * 100, 4, 5.5);
  });

  it('SB-27 one CS is 8.5 to 10.5 kg for a 50 kg SRW Merino ewe', () => {
    within(kgPerCs({ srw: 50, sex: 'F' }), 8.5, 10.5);
  });

  it('SB-28 the oestrous cycle is 17 days', () => {
    expect(CYCLE_DAYS).toBe(17);
    const heats: number[] = [];
    for (let d = 0; d < 35; d++) if (onHeat(d, 4)) heats.push(d);
    expect(heats).toEqual([4, 21]);
  });

  it('SB-29 gestation is 144 to 150 days (the first lambs about day 150 from joining is a mob test)', () => {
    within(GESTATION_DAYS, 144, 150);
  });

  it('SB-49 a Merino ewe in the last third of pregnancy grows 20 to 40% less wool than a dry ewe on the same feed', () => {
    const dry = woolGrowthG(ewe(), 1.2, 0, false);
    const preg = woolGrowthG(ewe({ preg: 110, litter: 1 }), 1.2, 0, false);
    within(1 - preg / dry, 0.2, 0.4);
  });

  it('SB-51 Merino wethers and rams grow wool 1 to 3 micron coarser than ewes on the same feed', () => {
    for (const g of [8, 11, 14]) {
      within(
        micronAt({ breed: 'merino', sex: 'W' }, g) - micronAt({ breed: 'merino', sex: 'F' }, g),
        1,
        3,
      );
      within(
        micronAt({ breed: 'merino', sex: 'M' }, g) - micronAt({ breed: 'merino', sex: 'F' }, g),
        1,
        3,
      );
    }
  });

  it('SB-55 sheep in the 6 weeks after shearing or crutching are struck less than an unshorn, uncrutched mob', () => {
    const struck = (cover: number): number => {
      let n = 0;
      const m = testMob(flock(3000, () => ({ sex: 'F', flyCover: cover })));
      heldRun(m, 42, {
        diet: heldDiet(1500, 0.7),
        seed: 3,
        each: (_d, r) => {
          for (const note of r.notes) if (note.type === 'flystrike') n += note.count;
        },
      });
      return n;
    };
    const shorn = struck(42);
    const not = struck(0);
    expect(shorn).toBeLessThan(not);
    expect(shorn).toBe(0);
    expect(not).toBeGreaterThan(0);
  });

  it('SB-56 weaners drink 3 to 5 L on an average day, 5 to 7 L on a summer day', () => {
    const m = testMob([testSheep({ wt: 25, age: 150 })]);
    within(sheepWaterLitres(m, 4), 3, 5);
    within(sheepWaterLitres(m, 0), 5, 7);
  });

  it('SB-57 dry adult sheep drink 4 to 7 L on an average day, 8 to 12 L on a summer day', () => {
    const m = testMob([wether()]);
    within(sheepWaterLitres(m, 4), 4, 7);
    within(sheepWaterLitres(m, 0), 8, 12);
  });

  it('SB-58 ewes with lambs drink 8 to 11 L on an average day, 12 to 15 L on a summer day', () => {
    const e = ewe({ id: 1, lact: 20, reared: 1 });
    const lamb = testSheep({ id: 2, weaned: false, dam: 1, wt: 10, age: 20 });
    const m = testMob([e, lamb]);
    within(sheepWaterLitres(m, 9), 8, 11);
    within(sheepWaterLitres(m, 0), 12, 15);
  });

  it('SB-63 a cattle fence (plain, barbed or electric) does not hold sheep', () => {
    for (const k of ['permanent', 'electric', 'tape'] as const)
      expect(fenceHoldsSheep(k)).toBe(false);
  });

  it('SB-64 a sheep-proof (netting) fence holds sheep', () => {
    expect(fenceHoldsSheep('netting')).toBe(true);
  });

  it.skip("SB-65 sheep-proof fence price above the cattle fence price: skipped, the amount is Claudia's call (C26) and the netting fence is milestone 2.4", () => {});

  it('the reference DSE is the 8.3 MJ of S4', () => {
    expect(maintMJ(wether(), REF_WALK)).toBeCloseTo(DSE_MJ, 6);
    expect(sheepAvail(3000, 0)).toBeGreaterThan(0.99);
  });
});
