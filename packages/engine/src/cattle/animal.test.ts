import { describe, expect, it } from 'vitest';
import {
  AREAS,
  TROUGHS,
  animalDifference,
  areaCells,
  beast,
  loadCattleMvp,
  pairedRandom,
  putCattleFarm,
  regAt,
  rngFrom,
  sampleBeasts,
  scriptedRandom,
  toEngine,
  type AreaName,
  type MvpHerdMob,
} from '../../test-support/cattle';
import { makeScenario } from '../../test-support/farms';
import type { Mvp } from '../../test-support/mvp';
import { SALE_CLASSES, type SaleClassId } from '../data/cattle';
import { rngStream } from '../rng';
import {
  aeOf,
  groupKey,
  label,
  makeAnimal,
  makeSaleBatch,
  marketClass,
  stockOn,
  waterNeed,
} from './animal';
import { createCattleMob, type AnimalKind, type Sex } from './types';

/*
 * Making animals, and what each is called and counted as, against the
 * MVP's own functions. Every number must be the same exactly.
 */

const loaded = loadCattleMvp();
const { mvp } = loaded;

function newFarm(troughs?: readonly number[]): void {
  const scn = makeScenario(mvp as unknown as Mvp, {
    district: 'cq',
    start: { year: 2023, month: 0 },
  });
  putCattleFarm(mvp, scn, troughs);
}

const mobOf = (animals: MvpHerdMob['animals'], anchor: number): MvpHerdMob => ({
  id: 1,
  name: 'Mob 1',
  animals,
  loc: 'pad',
  anchor,
  supp: 'none',
  plan: null,
  dry: 0,
  st: null,
  wReg: -1,
});

describe('the test farm', () => {
  it('has the five grazing areas, as the MVP works them out from the fences', () => {
    newFarm();
    expect(mvp.REGS.length).toBe(5);
    for (const name of Object.keys(AREAS) as AreaName[]) {
      const reg = regAt(mvp, AREAS[name]);
      expect(reg.cells, name).toEqual(areaCells(name));
      expect(reg.troughs, name).toEqual([TROUGHS[name]]);
      expect(reg.ha, name).toBe(reg.cells.length * mvp.HA);
    }
  });

  it('has the MVP distance to water: squares, straight line, 999 with no water', () => {
    newFarm([TROUGHS.mid]);
    expect(mvp.DIST[TROUGHS.mid]).toBe(0);
    expect(mvp.DIST[TROUGHS.mid + 3]).toBe(3);
    expect(mvp.DIST[TROUGHS.mid + 40 * 3 + 4]).toBe(5);
    expect(mvp.DIST[AREAS.big]).toBe(999);
  });
});

describe('the engine random streams use the MVP arithmetic', () => {
  it('range, int and chance are built on next() the way the MVP built rand and ri', () => {
    const a = rngStream(42, 'twin');
    const b = rngStream(42, 'twin');
    for (let k = 0; k < 200; k++) {
      const u1 = a.next();
      expect(b.range(190, 235)).toBe(190 + u1 * (235 - 190));
      const u2 = a.next();
      expect(b.int(1500, 2400)).toBe(Math.floor(1500 + u2 * (2400 + 1 - 1500)));
      const u3 = a.next();
      expect(b.chance(0.5)).toBe(u3 < 0.5);
    }
  });
});

describe('making animals, against the MVP', () => {
  const KINDS: [AnimalKind, Sex][] = [
    ['steer', 'S'],
    ['heifer', 'F'],
    ['cow', 'F'],
    ['bull', 'M'],
    ['calf', 'F'],
    ['calf', 'M'],
    ['calf', 'S'],
  ];

  it.each(KINDS)('a %s (%s) is the same for the same draws', (kind, sex) => {
    newFarm();
    // Either side of the 4% barren chance, and each number of calves.
    for (const first of [0, 0.039999, 0.04, 0.5, 0.999999]) {
      for (const second of [0, 0.25, 0.5, 0.75, 0.999999]) {
        const random = scriptedRandom([first, second]);
        loaded.setRandom(random.forMvp);
        mvp.S.nid = 77;
        const ids = { next: 77 };
        const theirs = mvp.makeAnimal(kind, sex, 412.5, 900, 2.75);
        const mine = makeAnimal(ids, random.rng, kind, sex, 412.5, 900, 2.75);
        expect(animalDifference(mine, theirs)).toBeNull();
        expect(ids.next).toBe(mvp.S.nid);
        // The MVP drew once more, for the spot on the map. The engine did not.
        const c = random.counts();
        expect(c.engine).toBe(c.mvp);
        expect(c.sprite).toBe(1);
        expect(c.engine).toBe((sex === 'F' ? 1 : 0) + (kind === 'cow' ? 1 : 0));
      }
    }
  });

  it('about 4% of females are barren, and cows have had 1 to 4 calves', () => {
    const rng = rngStream(9, 'generation');
    const ids = { next: 1 };
    const cows = Array.from({ length: 5000 }, () => makeAnimal(ids, rng, 'cow', 'F', 450, 2000, 3));
    const barren = cows.filter((a) => a.barren).length / cows.length;
    expect(barren).toBeGreaterThan(0.03);
    expect(barren).toBeLessThan(0.05);
    expect([...new Set(cows.map((a) => a.parity))].sort()).toEqual([1, 2, 3, 4]);
    const steers = Array.from({ length: 200 }, () =>
      makeAnimal(ids, rng, 'steer', 'S', 250, 300, 3),
    );
    expect(steers.some((a) => a.barren || a.parity !== 0)).toBe(false);
  });

  it.each(Object.keys(SALE_CLASSES) as SaleClassId[])(
    'a bought batch of %s is the same animal for animal',
    (key) => {
      newFarm();
      for (const seed of [1, 2, 3]) {
        const random = pairedRandom(seed * 101);
        loaded.setRandom(random.forMvp);
        mvp.S.nid = 500;
        const ids = { next: 500 };
        const theirs = mvp.makeBatch(key, 60);
        const mine = makeSaleBatch(ids, random.rng, key, 60);
        expect(mine.length).toBe(theirs.length);
        mine.forEach((a, k) => expect(animalDifference(a, theirs[k]!), `${key} ${k}`).toBeNull());
        expect(ids.next).toBe(mvp.S.nid);
        const c = random.counts();
        expect(c.engine).toBe(c.mvp);
        expect(c.sprite).toBe(theirs.length);
      }
    },
  );

  it('a bought batch sits inside its class ranges', () => {
    const rng = rngStream(3, 'market');
    const ids = { next: 1 };
    for (const key of Object.keys(SALE_CLASSES) as SaleClassId[]) {
      const c = SALE_CLASSES[key];
      const adults = makeSaleBatch(ids, rng, key, 300).filter((a) => a.kind !== 'calf');
      expect(adults.length).toBe(300);
      for (const a of adults) {
        expect(a.wt).toBeGreaterThanOrEqual(c.wt[0]);
        expect(a.wt).toBeLessThan(c.wt[1]);
        expect(a.age).toBeGreaterThanOrEqual(c.age[0]);
        expect(a.age).toBeLessThanOrEqual(c.age[1]);
        expect(a.cond).toBeGreaterThanOrEqual(c.cond[0]);
        expect(a.cond).toBeLessThan(c.cond[1]);
      }
      // Whole-day ages reach both ends of the range.
      expect(Math.min(...adults.map((a) => a.age))).toBeLessThan(
        c.age[0] + (c.age[1] - c.age[0]) / 10,
      );
      expect(Math.max(...adults.map((a) => a.age))).toBeGreaterThan(
        c.age[1] - (c.age[1] - c.age[0]) / 10,
      );
    }
  });
});

describe('classes and adult equivalents, against the MVP', () => {
  const beasts = sampleBeasts().map((s, k) => beast(k + 1, s));

  it('label, group and market class are the same for every kind of animal', () => {
    expect(beasts.length).toBeGreaterThan(1000);
    const seen = new Set<string>();
    for (const b of beasts) {
      const a = toEngine(b);
      expect(label(a)).toBe(mvp.label(b));
      expect(groupKey(a)).toBe(mvp.groupKey(b));
      expect(marketClass(a)).toBe(mvp.mclass(b));
      seen.add(label(a));
    }
    // Every class the game has turns up in the samples.
    expect([...seen].sort()).toEqual([
      'Bull',
      'Bull calf (unmarked)',
      'Bullock',
      'Cow with calf',
      'Dry cow',
      'Heifer',
      'Heifer calf',
      'PTIC cow',
      'PTIC cow with calf',
      'PTIC heifer',
      'Steer calf',
      'Weaner heifer',
      'Weaner steer',
      'Yearling steer',
      'Young bull (unmarked)',
    ]);
  });

  it('adult equivalents are the same for every kind of animal', () => {
    for (const b of beasts) {
      expect(Object.is(aeOf(toEngine(b)), mvp.aeOf(b)), `#${b.id}`).toBe(true);
    }
  });

  it('1 AE is a dry 450 kg beast; milking and late pregnancy count more', () => {
    const dry = toEngine(beast(1, { kind: 'cow', sex: 'F', wt: 450, age: 2000, cond: 3 }));
    expect(aeOf(dry)).toBe(1);
    expect(aeOf({ ...dry, lact: 30, calf: 7 })).toBe(1.3);
    expect(aeOf({ ...dry, preg: 191 })).toBe(1.1);
    expect(aeOf({ ...dry, preg: 190 })).toBe(1);
    const calf = toEngine(beast(2, { kind: 'calf', sex: 'F', wt: 450, age: 89, cond: 3 }));
    expect(aeOf(calf)).toBe(0);
    expect(aeOf({ ...calf, age: 90 })).toBe(0.5);
  });

  it('the stock figures for a paddock summary are the same', () => {
    newFarm();
    const m = mobOf(beasts.slice(0, 400), AREAS.mid);
    m.st = { demand: 1234.5, f: 0.83 } as MvpHerdMob['st'];
    const other = mobOf(beasts.slice(400, 500), AREAS.mid);
    mvp.S.mobs = [m, other];
    const area = regAt(mvp, AREAS.mid);
    // A paddock that is a third of the grazing area.
    const pd = { cells: area.cells.slice(0, 100), ha: area.ha / 3 };
    const theirs = mvp.padStats(pd);
    const mobs = [m, other].map((x) => {
      const e = createCattleMob();
      e.animals = x.animals.map(toEngine);
      e.st = x.st as ReturnType<typeof createCattleMob>['st'];
      return e;
    });
    const mine = stockOn(mobs, pd.ha / area.ha);
    expect(Object.is(mine.ae, theirs.ae)).toBe(true);
    expect(Object.is(mine.head, theirs.head)).toBe(true);
    expect(Object.is(mine.eat, theirs.eat)).toBe(true);
    expect(mine.head).toBeGreaterThan(0);
  });
});

describe('water need per head, against the MVP', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])('month %i', (month) => {
    // The only water in the area is a portable trough, so the MVP's daily
    // use for it is the whole mob's need.
    newFarm([]);
    mvp.S.ports = [{ cell: TROUGHS.mid, lvl: 1e12 }];
    mvp.recompute();
    mvp.S.startM = month;
    mvp.S.day = 3;
    const animals = sampleBeasts()
      .slice(0, 300)
      .map((s, k) => beast(k + 1, s));
    mvp.S.mobs = [mobOf(animals, AREAS.mid)];
    mvp.waterUse();
    let need = 0;
    for (const b of animals) need += waterNeed(toEngine(b), month);
    expect(need).toBe(mvp.S.ports[0]!.lastUse);
    expect(need).toBeGreaterThan(0);
  });

  it('is 10% of live weight, more in summer and less in winter', () => {
    const a = toEngine(beast(1, { kind: 'steer', sex: 'S', wt: 400, age: 500, cond: 3 }));
    expect(waterNeed(a, 3)).toBe(40);
    expect(waterNeed(a, 0)).toBe(400 * 0.1 * 1.3);
    expect(waterNeed(a, 6)).toBe(400 * 0.1 * 0.8);
  });

  it('uses a plain rng without extra draws', () => {
    // rngFrom is the test stand-in used across the cattle tests.
    let n = 0;
    const rng = rngFrom(() => {
      n++;
      return 0.5;
    });
    makeAnimal({ next: 1 }, rng, 'calf', 'M', 36, 0, 3);
    expect(n).toBe(0);
  });
});
