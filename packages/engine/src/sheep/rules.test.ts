import { describe, expect, it } from 'vitest';
import {
  flock,
  heldRun,
  pastJoining,
  testMob,
  testRngs,
  testSheep,
} from '../../test-support/sheep';
import {
  GESTATION_DAYS,
  JOIN_DAYS,
  LAMB_EARLY_SHARE,
  SHEEP_DISTRICTS,
  sheepDistrict,
} from '../data/sheep';
import {
  birthKg,
  canJoin,
  cycleConception,
  lambFates,
  lambLoss,
  lambSurvival,
  lambingRisk,
  litterShares,
  pregnantShare,
  ramCover,
  ramsNeeded,
} from './breeding';
import {
  aeFromDse,
  appetiteShare,
  dseOf,
  lactationShape,
  maintMJ,
  needsMJ,
  pregnancyMJ,
  sheepClassOf,
} from './energy';
import { binomial, multinomial } from './counts';
import { heldDiet } from './graze';
import { dressingShare, carcaseKg, fleeceOf } from './reads';
import { dailyDeathRisk, weanerDailyRisk } from './simFlock';
import { crutchMob, fleeceMicron, greasyKg, micronAt, shearMob, woolGrowthG } from './wool';

/* The sheep rules one by one (docs/MODEL.md, the sheep section). */

describe('sheep classes and districts', () => {
  it('names the class from age, sex and lambing', () => {
    expect(sheepClassOf({ sex: 'F', weaned: false, age: 20, parity: 0 })).toBe('lamb');
    expect(sheepClassOf({ sex: 'W', weaned: true, age: 200, parity: 0 })).toBe('weaner');
    expect(sheepClassOf({ sex: 'F', weaned: true, age: 500, parity: 0 })).toBe('hogget');
    expect(sheepClassOf({ sex: 'F', weaned: true, age: 500, parity: 1 })).toBe('ewe');
    expect(sheepClassOf({ sex: 'W', weaned: true, age: 800, parity: 0 })).toBe('wether');
    expect(sheepClassOf({ sex: 'M', weaned: true, age: 800, parity: 0 })).toBe('ram');
  });

  it('runs sheep in three districts and never in Central Queensland', () => {
    expect([...SHEEP_DISTRICTS].sort()).toEqual(['cw', 'nsw', 'wv']);
    expect(sheepDistrict('cq')).toBe(false);
  });
});

describe('sheep energy and intake', () => {
  it('maintenance rises with weight and the walk, and is higher for young sheep and rams', () => {
    const a = testSheep({ wt: 50 });
    expect(maintMJ(testSheep({ wt: 60 }), 0.1)).toBeGreaterThan(maintMJ(a, 0.1));
    expect(maintMJ(a, 0.17)).toBeGreaterThan(maintMJ(a, 0.1));
    expect(maintMJ(testSheep({ wt: 50, age: 100 }), 0.1)).toBeGreaterThan(maintMJ(a, 0.1));
    expect(maintMJ(testSheep({ sex: 'M', wt: 50 }), 0.1)).toBeGreaterThan(
      maintMJ(testSheep({ sex: 'W', wt: 50 }), 0.1),
    );
  });

  it('pregnancy costs nothing before day 70 and more with each lamb carried', () => {
    expect(pregnancyMJ(60, 2)).toBe(0);
    expect(pregnancyMJ(140, 2)).toBeGreaterThan(pregnancyMJ(140, 1));
    expect(pregnancyMJ(140, 3)).toBeGreaterThan(pregnancyMJ(140, 2));
    expect(pregnancyMJ(146, 1)).toBeGreaterThan(pregnancyMJ(120, 1));
  });

  it('milk holds to 6 weeks, then falls to half by day 100', () => {
    expect(lactationShape(-1)).toBe(0);
    expect(lactationShape(30)).toBe(1);
    expect(lactationShape(71)).toBeCloseTo(0.75, 2);
    expect(lactationShape(150)).toBe(0.5);
  });

  it('lambs at foot count no DSE of their own; their ewe carries them', () => {
    const lamb = testSheep({ weaned: false, wt: 10, age: 20 });
    expect(dseOf(lamb, 0)).toBe(0);
    const ewe = testSheep({ lact: 20, reared: 1 });
    expect(dseOf(ewe, 1)).toBeGreaterThan(2);
    expect(aeFromDse(8.4)).toBeCloseTo(1, 9);
  });

  it('lambs start to graze at 2 weeks; fat sheep eat less; a milking ewe eats more', () => {
    expect(appetiteShare(testSheep({ weaned: false, wt: 6, age: 10 }), 0)).toBe(0);
    expect(appetiteShare(testSheep({ weaned: false, wt: 15, age: 60 }), 0)).toBeGreaterThan(0);
    expect(appetiteShare(testSheep({ cond: 4.2 }), 0)).toBeLessThan(appetiteShare(testSheep(), 0));
    expect(appetiteShare(testSheep({ lact: 10 }), 1)).toBeGreaterThan(
      appetiteShare(testSheep(), 0),
    );
  });

  it('a growing sheep needs more the faster it grows', () => {
    const w = testSheep({ wt: 30, age: 180 });
    expect(needsMJ(w, 0, 0.15)).toBeGreaterThan(needsMJ(w, 0, 0.05));
  });
});

describe('sheep breeding', () => {
  it('rams: 1% plus one, and fewer rams cover fewer ewes', () => {
    expect(ramsNeeded(500)).toBe(6);
    expect(ramCover(6, 500)).toBe(1);
    expect(ramCover(3, 500)).toBeCloseTo(0.5, 9);
    expect(ramCover(0, 500)).toBe(0);
  });

  it('a ewe joins only when old and heavy enough, empty and with no lambs at foot', () => {
    expect(canJoin(testSheep({ age: 400 }), 0)).toBe(true);
    expect(canJoin(testSheep({ age: 150 }), 0)).toBe(false);
    expect(canJoin(testSheep({ age: 400, wt: 30 }), 0)).toBe(false);
    expect(canJoin(testSheep({ preg: 10, litter: 1 }), 0)).toBe(false);
    expect(canJoin(testSheep(), 1)).toBe(false);
    expect(canJoin(testSheep({ sex: 'W' }), 0)).toBe(false);
  });

  it('conception per heat compounds to the 5-week share', () => {
    const p = cycleConception(3, 'merino');
    expect(1 - Math.pow(1 - p, JOIN_DAYS / 17)).toBeCloseTo(pregnantShare(3, 'merino'), 9);
    expect(pregnantShare(4, 'merino')).toBeGreaterThan(pregnantShare(2, 'merino'));
  });

  it('litter shares add to one and give the average litter', () => {
    for (const mean of [1, 1.2, 1.37, 1.62, 1.9]) {
      const s = litterShares(mean);
      expect(s[1] + s[2] + s[3]).toBeCloseTo(1, 9);
      expect(s[1] + 2 * s[2] + 3 * s[3]).toBeCloseTo(Math.min(mean, 2.15), 1);
    }
  });

  it('twins are lighter at birth, and condition lost early in pregnancy lightens lambs', () => {
    expect(birthKg(2, 50, 0)).toBeLessThan(birthKg(1, 50, 0));
    expect(birthKg(1, 50, 1)).toBeCloseTo(birthKg(1, 50, 0) - 0.32, 9);
  });

  it("lamb survival rises with the ewe's CS, more for twins, and stays inside its limits", () => {
    expect(lambSurvival(3, 1, 'merino')).toBeCloseTo(0.91, 9);
    expect(lambSurvival(3, 2, 'merino')).toBeCloseTo(0.71, 9);
    expect(lambSurvival(2, 2, 'merino')).toBeLessThan(lambSurvival(2, 1, 'merino'));
    expect(lambSurvival(5, 1, 'xb')).toBeLessThanOrEqual(0.98);
    expect(lambSurvival(1, 3, 'merino')).toBeGreaterThanOrEqual(0.05);
  });

  it("lambs' fates: early deaths are 80% of the losses, on the first or second day", () => {
    const rng = testRngs(9).breeding;
    const n = 200_000;
    const f = lambFates(n, 0.8, rng);
    expect((f.doomed + f.doomed2) / n).toBeCloseTo(0.2 * LAMB_EARLY_SHARE, 2);
    expect(f.doomed / (f.doomed + f.doomed2)).toBeCloseTo(0.5, 1);
    expect(f.risk).toBeGreaterThan(0);
    expect(lambLoss(0.8).early).toBeCloseTo(0.16, 9);
  });

  it('counts: draws on head counts are exact in the mean and repeatable from the seed', () => {
    for (const [n, p] of [
      [30, 0.3],
      [5000, 0.002],
      [5000, 0.4],
      [100_000, 0.9],
    ] as const) {
      const a = testRngs(3).deaths;
      const b = testRngs(3).deaths;
      let t = 0;
      for (let i = 0; i < 400; i++) {
        const k = binomial(n, p, a);
        expect(k).toBe(binomial(n, p, b));
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThanOrEqual(n);
        t += k;
      }
      expect(t / 400 / (n * p)).toBeCloseTo(1, 1);
    }
    const shares = multinomial(10_000, [0.2, 0.3, 0.5], testRngs(4).breeding);
    expect(shares.reduce((x, y) => x + y, 0)).toBe(10_000);
  });

  it('lambing risk is higher for twins, crossbreds, thin ewes and ewes losing condition', () => {
    expect(lambingRisk(3, 2, 'merino', 0)).toBeGreaterThan(lambingRisk(3, 1, 'merino', 0));
    expect(lambingRisk(3, 1, 'xb', 0)).toBeGreaterThan(lambingRisk(3, 1, 'merino', 0));
    expect(lambingRisk(1.5, 1, 'merino', 0)).toBeCloseTo(2 * lambingRisk(3, 1, 'merino', 0), 9);
    expect(lambingRisk(3, 3, 'merino', 0.5)).toBeGreaterThan(lambingRisk(3, 3, 'merino', 0));
  });

  it("a joining on the mob's date: rams in for 5 weeks, scanning at day 80, lambing from day 147, marking and weaning counted", () => {
    const ewes = flock(300, () => ({ sex: 'F' }));
    const rams = flock(4, () => ({ sex: 'M' })).map((r, i) => ({ ...r, id: 400 + i }));
    const m = testMob([...ewes, ...rams]);
    const seen: string[] = [];
    heldRun(m, 260, {
      start: { year: 2021, month: 3 },
      diet: heldDiet(1800, 0.72),
      seed: 4,
      each: (day, r) => {
        for (const n of r.notes) {
          if (
            ['joiningStarted', 'joiningEnded', 'scanned', 'lambingStarted', 'marked'].includes(
              n.type,
            )
          ) {
            seen.push(`${n.type}@${day}`);
          }
        }
      },
    });
    expect(seen[0]).toBe('joiningStarted@0');
    expect(seen).toContain(`joiningEnded@${JOIN_DAYS}`);
    expect(seen).toContain('scanned@80');
    expect(seen.find((s) => s.startsWith('lambingStarted'))).toBe(
      `lambingStarted@${GESTATION_DAYS}`,
    );
    const j = m.join!;
    expect(j.joined).toBe(300);
    expect(j.marked).toBeGreaterThan(0);
    expect(j.weaned).toBeGreaterThan(0);
    expect(j.weaned).toBeLessThanOrEqual(j.marked);
    // Ram lambs are marked into wethers at the marking count.
    expect(m.sheep.some((s) => s.dam !== 0 && s.sex === 'M')).toBe(false);
    expect(m.sheep.every((s) => s.lact < 0)).toBe(true);
  });

  it('a lamb whose ewe dies: weaned from 8 weeks, at risk before', () => {
    const ewe = testSheep({ id: 1, lact: 5, reared: 1 });
    const young = testSheep({ id: 2, weaned: false, dam: 1, wt: 8, age: 20 });
    const old = testSheep({ id: 3, weaned: false, dam: 99, wt: 18, age: 60 });
    const m = testMob([ewe, young, old]);
    heldRun(m, 1, { diet: heldDiet(1500, 0.7), seed: 1 });
    expect(m.sheep.find((s) => s.id === 3)!.weaned).toBe(true);
    expect(m.sheep.find((s) => s.id === 2)!.weaned).toBe(false);
  });

  it('a ewe whose last lamb dies is dried off', () => {
    const ewe = testSheep({ id: 1, lact: 0, reared: 1 });
    const lamb = testSheep({ id: 2, weaned: false, dam: 1, wt: 4, age: 0, doomed: 1 });
    const m = testMob([ewe, lamb]);
    m.join = pastJoining(1);
    heldRun(m, 1, { diet: heldDiet(1500, 0.7), seed: 1 });
    expect(m.sheep.length).toBe(1);
    expect(m.sheep[0]!.lact).toBe(-1);
  });
});

describe('sheep deaths', () => {
  it('no water: every sheep dies on day 4', () => {
    const m = testMob(flock(50, () => ({})));
    const days: number[] = [];
    heldRun(m, 6, {
      diet: heldDiet(1500, 0.7),
      hasWater: false,
      each: (day, r) => {
        if (r.deaths.length) days.push(day);
        for (const d of r.deaths) expect(d.cause).toBe('noWater');
      },
    });
    expect(m.sheep.length).toBe(0);
    expect(days).toEqual([3]);
  });

  it('weaner risk falls with growth and weaning weight; thin sheep die more', () => {
    expect(weanerDailyRisk(100, 0.5)).toBeLessThan(weanerDailyRisk(0, 0.5));
    expect(weanerDailyRisk(50, 0.5)).toBeLessThan(weanerDailyRisk(50, 0.35));
    expect(dailyDeathRisk(testSheep({ cond: 1.2 }))).toBeGreaterThan(dailyDeathRisk(testSheep()));
  });

  it('flystrike: none while covered, and shearing gives 6 weeks of cover', () => {
    const m = testMob(flock(20, () => ({ fleece: 2, micronKg: 38, woolDays: 300 })));
    const r = shearMob(m, 5);
    expect(r.head).toBe(20);
    expect(r.cleanKg).toBeCloseTo(40, 9);
    expect(r.micron).toBeCloseTo(19, 9);
    expect(r.greasyKg).toBeCloseTo(greasyKg(40), 9);
    expect(m.shorn).toBe(5);
    for (const s of m.sheep) {
      expect(s.fleece).toBe(0);
      expect(s.woolDays).toBe(0);
      expect(s.flyCover).toBe(42);
    }
    expect(crutchMob(m, 9)).toBe(20);
    expect(m.crutched).toBe(9);
  });
});

describe('wool', () => {
  it('grows with feed and gain, less for a milking ewe a kg of feed, and less for crossbreds', () => {
    const e = testSheep();
    expect(woolGrowthG(e, 1.4, 0, false)).toBeGreaterThan(woolGrowthG(e, 1.0, 0, false));
    expect(woolGrowthG(e, 1.2, 0.05, false)).toBeGreaterThan(woolGrowthG(e, 1.2, -0.05, false));
    expect(woolGrowthG(e, 1.2, 0, true)).toBeLessThan(woolGrowthG(e, 1.2, 0, false));
    expect(woolGrowthG(testSheep({ breed: 'xb' }), 1.2, 0, false)).toBeLessThan(
      woolGrowthG(e, 1.2, 0, false),
    );
  });

  it('slower wool is finer', () => {
    expect(micronAt({ breed: 'merino', sex: 'F' }, 6)).toBeLessThan(
      micronAt({ breed: 'merino', sex: 'F' }, 12),
    );
    expect(fleeceMicron({ fleece: 0, micronKg: 0 })).toBe(0);
    expect(fleeceOf({ fleece: 2, micronKg: 36, woolDays: 365 })).toEqual({
      cleanKg: 2,
      micron: 18,
      months: 12,
    });
  });
});

describe('carcase', () => {
  it('dresses lambs at 47.5% (Merino 45%) and adults by fat score', () => {
    expect(dressingShare(testSheep({ age: 200, breed: 'xb' }))).toBeCloseTo(0.475, 9);
    expect(dressingShare(testSheep({ age: 200 }))).toBeCloseTo(0.45, 9);
    expect(dressingShare(testSheep({ sex: 'W', cond: 3 }))).toBe(0.43);
    expect(dressingShare(testSheep({ sex: 'F', cond: 2 }))).toBe(0.4);
    expect(carcaseKg(testSheep({ sex: 'W', cond: 3, wt: 50 }))).toBeCloseTo(21.5, 9);
  });
});
