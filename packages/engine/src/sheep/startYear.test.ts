/**
 * A start flock whose lambs were born before the farm's first day plays on
 * like any other flock (review of the third pass, item 1): the lambs at foot
 * are weaned on the district's day at a believable weight, the ewes join
 * again dry, the start lambs are shorn with the rest, and no sheep is left
 * alive far under its normal weight for its age.
 *
 * Central West, seed 7, from 1 September: joining began on 5 January, so
 * lambing began on 1 June (day −92) and the lambs are about 80 days old.
 */

import { describe, expect, it } from 'vitest';
import { AVERAGE_YEAR } from '../../test-support/calibration';
import { heldRun, testMob, testSheep } from '../../test-support/sheep';
import { heldDiet } from './graze';
import { GESTATION_DAYS, LAMBING_TIMES, STARVED } from '../data/sheep';
import { createFarm } from '../sim/create';
import { stepDay } from '../sim/tick';
import { starvedRefKg } from './simFlock';
import { sheepMobsOf } from './farm';
import type { Sheep } from './types';

const env = { seasons: AVERAGE_YEAR };

interface Probe {
  atFoot: number;
  startAdults: number;
  weanDay: number;
  weanKg: number;
  weaned: number;
  joinDay: number;
  joined: number;
  born: number;
  shornHead: number;
  shearDay: number;
  /** Live records under half the weight they are measured against (`starvedRefKg`), on any day. */
  light: { day: number; age: number; wt: number; normal: number }[];
  unweanedOld: number;
  yearBirths: number;
}

function run(): Probe {
  const farm = createFarm(
    {
      seed: 7,
      district: 'cw',
      size: 'medium',
      start: { year: 2021, month: 8 },
      startType: 'running',
      difficulty: 'easy',
      stock: 'sheep',
    },
    env,
  );
  const m0 = sheepMobsOf(farm)[0]!;
  const p: Probe = {
    atFoot: m0.sheep.filter((s) => !s.weaned).reduce((t, s) => t + s.n, 0),
    startAdults: m0.sheep.filter((s) => s.weaned).reduce((t, s) => t + s.n, 0),
    weanDay: -1,
    weanKg: 0,
    weaned: 0,
    joinDay: -1,
    joined: 0,
    born: 0,
    shornHead: 0,
    shearDay: -1,
    light: [],
    unweanedOld: 0,
    yearBirths: 0,
  };
  for (let d = 0; d < 365; d++) {
    for (const e of stepDay(farm, env).events) {
      if (e.type === 'sheep-weaned' && p.weanDay < 0) {
        p.weanDay = d;
        p.weanKg = e.avgKg;
        p.weaned = e.count;
      }
      if (e.type === 'sheep' && e.note.type === 'joiningStarted' && p.joinDay < 0) {
        p.joinDay = d;
        p.joined = e.note.ewes;
      }
      if (e.type === 'lambs-born') p.born += e.count;
      if (e.type === 'sheep-shorn' && (p.shearDay < 0 || p.shearDay === d)) {
        // Every mob is shorn on the same day (the weaners went to a mob of their own).
        p.shearDay = d;
        p.shornHead += e.head;
      }
    }
    const all: Sheep[] = sheepMobsOf(farm).flatMap((m) => m.sheep);
    for (const s of all) {
      const normal = starvedRefKg(s);
      if (s.wt < STARVED.share * normal && p.light.length < 5)
        p.light.push({ day: d, age: s.age, wt: s.wt, normal });
      if (!s.weaned && s.age > LAMBING_TIMES.weanDays + 60) p.unweanedOld += s.n;
    }
  }
  p.yearBirths = farm.years[0]!.births;
  return p;
}

describe('a start flock with lambs at foot (Central West, from 1 September)', () => {
  const p = run();

  it('starts with lambs at foot about 80 days old', () => {
    expect(p.atFoot).toBeGreaterThan(500);
  });

  it('weans them on the district day, 14 weeks from the start of lambing, at a believable weight', () => {
    // Lambing began 239 − 147 = 92 days before the farm's first day.
    expect(p.weanDay).toBe(LAMBING_TIMES.weanDays - (239 - GESTATION_DAYS));
    expect(p.weaned).toBeGreaterThan(0.9 * p.atFoot);
    // Weaned at about 45% of SRW (MMFS S17): 22.5 kg for a 50 kg Merino.
    expect(p.weanKg).toBeGreaterThanOrEqual(18);
    expect(p.weanKg).toBeLessThanOrEqual(30);
  });

  it('never keeps a lamb at foot long past weaning', () => {
    expect(p.unweanedOld).toBe(0);
  });

  it('joins the ewes again on 5 January and they lamb as a dry flock would', () => {
    expect(p.joinDay).toBe(126);
    expect(p.joined).toBeGreaterThan(0.8 * p.startAdults * 0.6);
    // About 1.1 to 1.3 lambs born a ewe joined (Merino, CS near 3).
    expect(p.born).toBeGreaterThan(0.9 * p.joined);
  });

  it("counts the lambs born in the year's births", () => {
    expect(p.born).toBeGreaterThan(0);
    expect(p.yearBirths).toBe(p.born);
  });

  it('shears the start lambs with the rest of the flock', () => {
    expect(p.shearDay).toBeGreaterThan(300);
    expect(p.shornHead).toBeGreaterThan(0.85 * (p.startAdults + p.weaned));
  });

  it('has no live sheep under half its normal weight for its age (STARVED)', () => {
    expect(p.light).toEqual([]);
  });
});

describe('a sheep far under its normal weight is dead', () => {
  it('a 15-month-old at 3.5 kg dies that day, starved; one at 30 kg lives on', () => {
    const light = testSheep({ id: 1, age: 456, wt: 3.5, cond: 1.5, n: 20 });
    const thin = testSheep({ id: 2, age: 456, wt: 30, cond: 1.6, n: 20 });
    const m = testMob([light, thin]);
    const causes: string[] = [];
    heldRun(m, 1, {
      diet: heldDiet(1500, 0.7),
      each: (_d, r) => {
        for (const x of r.deaths) if (x.sheep.id === 1) causes.push(`${x.cause}:${x.count}`);
      },
    });
    expect(causes).toEqual(['starved:20']);
    expect(m.sheep.find((s) => s.id === 2)?.n ?? 0).toBeGreaterThan(15);
  });
});
