import { describe, expect, it } from 'vitest';
import {
  AREAS,
  TROUGHS,
  animalDifference,
  beast,
  loadCattleMvp,
  noteText,
  putCattleFarm,
  sampleBeasts,
  scriptedRandom,
  toEngine,
  type BeastSpec,
  type MvpBeast,
  type MvpHerdMob,
} from '../../test-support/cattle';
import { makeScenario } from '../../test-support/farms';
import type { Mvp } from '../../test-support/mvp';
import {
  anoDays,
  breedingNotes,
  bullCover,
  calve,
  condConc,
  cycling,
  expectedRate,
  joinReport,
  markCalves,
  weanMob,
  weanOne,
  weaningDue,
} from './breeding';
import type { CattleNote } from './notes';
import {
  animalLookup,
  createCattleMob,
  emptyCattleTotals,
  type Animal,
  type CattleMob,
  type Joining,
} from './types';

/*
 * Breeding against the MVP's own functions. Where the MVP draws a random
 * number, both sides are given the same scripted numbers, so the same
 * branch is taken and the results can be compared exactly.
 */

const loaded = loadCattleMvp();
const { mvp } = loaded;

/** A fresh farm in the MVP. Returns the diary lines it writes. */
function newFarm(troughs?: readonly number[], day = 200): string[] {
  const scn = makeScenario(mvp as unknown as Mvp, {
    district: 'nsw',
    start: { year: 2023, month: 0 },
    day,
  });
  return putCattleFarm(mvp, scn, troughs);
}

const mvpMob = (animals: MvpBeast[], extra: Partial<MvpHerdMob> = {}): MvpHerdMob => ({
  id: 1,
  name: 'Mob 1',
  animals,
  loc: 'pad',
  anchor: AREAS.mid,
  supp: 'none',
  plan: null,
  dry: 0,
  st: null,
  wReg: -1,
  ...extra,
});

/** The engine's copy of an MVP mob, with its note days and joining. */
function engineMob(m: MvpHerdMob): CattleMob {
  const e = createCattleMob();
  e.animals = m.animals.map(toEngine);
  e.join = m.join ? { ...m.join } : null;
  e.markNote = m.markNote ?? null;
  e.youngNote = m.youngNote ?? 0;
  e.calvNote = m.calvNote ?? null;
  e.openNote = m.openNote ?? null;
  return e;
}

function sameMob(e: CattleMob, m: MvpHerdMob, where: string): void {
  expect(e.animals.length, where).toBe(m.animals.length);
  e.animals.forEach((a, k) => expect(animalDifference(a, m.animals[k]!), where).toBeNull());
  expect(e.join, `join ${where}`).toEqual(m.join ?? null);
  expect(e.markNote, `markNote ${where}`).toBe(m.markNote ?? null);
  expect(e.youngNote, `youngNote ${where}`).toBe(m.youngNote ?? 0);
  expect(e.calvNote, `calvNote ${where}`).toBe(m.calvNote ?? null);
  expect(e.openNote, `openNote ${where}`).toBe(m.openNote ?? null);
}

describe('conception and cycling, against the MVP', () => {
  it('conception by condition score is the same from CS 0.5 to 5.5', () => {
    for (let k = 50; k <= 550; k++) {
      const c = k / 100;
      expect(Object.is(condConc(c), mvp.condConc(c)), `CS ${c}`).toBe(true);
    }
  });

  it('the expected 9-week rate is the same, dry and milking', () => {
    for (let k = 50; k <= 550; k += 5) {
      for (const lact of [false, true]) {
        const cs = k / 100;
        expect(Object.is(expectedRate(cs, lact), mvp.expectedRate(cs, lact)), `CS ${cs}`).toBe(
          true,
        );
      }
    }
  });

  it('anoestrus and cycling are the same for every kind of animal', () => {
    sampleBeasts().forEach((s, k) => {
      const b = beast(k + 1, s);
      const a = toEngine(b);
      expect(Object.is(anoDays(a), mvp.anoDays(b)), `#${k}`).toBe(true);
      expect(cycling(a), `#${k}`).toBe(mvp.cycling(b));
    });
  });

  it('bull cover: 1 bull to 40 open females, young bulls count 0.6', () => {
    expect(bullCover(1, 0, 40)).toBe(1);
    expect(bullCover(1, 0, 80)).toBe(0.5);
    expect(bullCover(0, 1, 40)).toBe(0.6);
    expect(bullCover(2, 5, 400)).toBe((5 * 40) / 400);
    expect(bullCover(0, 0, 30)).toBe(0);
    expect(bullCover(1, 0, 0)).toBe(1);
  });
});

describe('breeding benchmarks (docs/CALIBRATION.md)', () => {
  it('conception per 3-week cycle: 50 to 65% in good condition, about 25% at CS 2', () => {
    for (const cs of [3, 3.25, 3.5, 3.75, 4]) {
      expect(condConc(cs)).toBeGreaterThanOrEqual(0.5);
      expect(condConc(cs)).toBeLessThanOrEqual(0.65);
    }
    expect(condConc(2)).toBe(0.25);
    // Either side of every point in the table.
    expect([1, 1.5, 2, 2.5, 3, 3.5, 4, 5].map(condConc)).toEqual([
      0.05, 0.12, 0.25, 0.38, 0.5, 0.6, 0.65, 0.55,
    ]);
  });

  it('9-week joining: 84% expected in calf at CS 3, 85 to 95% from CS 3.25 to 4', () => {
    // At CS 3 exactly the MVP's figure is 84%, a point under the benchmark's 85%.
    expect(expectedRate(3, false)).toBeCloseTo(0.84, 12);
    for (const cs of [3.25, 3.5, 3.75, 4]) {
      expect(expectedRate(cs, false)).toBeGreaterThanOrEqual(0.85);
      expect(expectedRate(cs, false)).toBeLessThanOrEqual(0.95);
    }
    // About 4% never get in calf, however good the condition.
    expect(expectedRate(4, false)).toBeLessThan(0.96);
  });

  it('anoestrus after calving: 45 days at CS 3 and above, 85 at CS 2', () => {
    const cow = (cond: number, lact: number): Animal =>
      toEngine(beast(1, { kind: 'cow', sex: 'F', wt: 450, age: 2000, cond, lact, calf: 5 }));
    expect(anoDays(cow(3, 10))).toBe(45);
    expect(anoDays(cow(4, 10))).toBe(45);
    expect(anoDays(cow(2, 10))).toBe(85);
    expect(cycling(cow(3, 45))).toBe(false);
    expect(cycling(cow(3, 46))).toBe(true);
    expect(cycling(cow(2, 85))).toBe(false);
    expect(cycling(cow(2, 86))).toBe(true);
  });

  it('heifers cycle from 400 days and 270 kg', () => {
    const h = (wt: number, age: number): Animal =>
      toEngine(beast(1, { kind: 'heifer', sex: 'F', wt, age, cond: 3 }));
    expect(cycling(h(270, 400))).toBe(true);
    expect(cycling(h(269.9, 400))).toBe(false);
    expect(cycling(h(270, 399))).toBe(false);
  });
});

describe('calving, against the MVP', () => {
  const DAMS: { name: string; spec: BeastSpec }[] = [
    { name: 'heifer', spec: { kind: 'heifer', sex: 'F', wt: 380, age: 800, cond: 3, preg: 283 } },
    {
      name: 'thin heifer',
      spec: { kind: 'heifer', sex: 'F', wt: 330, age: 800, cond: 1.79, preg: 283 },
    },
    {
      name: 'cow that has not calved',
      spec: { kind: 'cow', sex: 'F', wt: 430, age: 1500, cond: 1.8, preg: 283, parity: 0 },
    },
    { name: 'cow', spec: { kind: 'cow', sex: 'F', wt: 480, age: 2200, cond: 3.2, preg: 283 } },
    { name: 'thin cow', spec: { kind: 'cow', sex: 'F', wt: 400, age: 2200, cond: 1.5, preg: 283 } },
  ];
  // First draw: lost at birth? Either side of 2.5%, 7%, 8.5% and 13%.
  const LOSS_DRAWS = [0, 0.0249, 0.025, 0.0699, 0.07, 0.0849, 0.085, 0.1299, 0.13, 0.9];
  // Second draw: bull calf under 0.5. Third: a heifer calf barren under 0.04.
  const CALF_DRAWS: [number, number][] = [
    [0.2, 0.9],
    [0.4999, 0.9],
    [0.5, 0.0399],
    [0.5, 0.04],
    [0.9, 0.9],
  ];

  it.each(DAMS)('a $name calving gives the same dam, calf, totals and notes', ({ spec }) => {
    // The calving note comes again once the last one is more than 150 days
    // old. These run on day 200: either side of day 50.
    for (const calvNote of [undefined, 40, 49, 50, 51]) {
      for (const loss of LOSS_DRAWS) {
        for (const [sexDraw, barrenDraw] of CALF_DRAWS) {
          const lines = newFarm(undefined, 200);
          const random = scriptedRandom([loss, sexDraw, barrenDraw]);
          loaded.setRandom(random.forMvp);
          mvp.S.nid = 31;
          const dam = beast(30, spec);
          const m = mvpMob([dam], { calvNote });
          const e = engineMob(m);
          lines.length = 0;
          mvp.calve(dam, m);

          const totals = emptyCattleTotals();
          const notes: CattleNote[] = [];
          const births: Animal[] = [];
          const ids = { next: 31 };
          calve(e.animals[0]!, e, { ids, rng: random.rng, day: 200, totals, notes, births });

          const where = `loss ${loss}, sex ${sexDraw}, calving note ${calvNote}`;
          sameMob(e, m, where);
          expect(ids.next, where).toBe(mvp.S.nid);
          expect(totals.births, where).toBe(mvp.S.yr.births);
          expect(totals.gain, where).toBe(mvp.S.yr.gain);
          expect(births.length, where).toBe(m.animals.length - 1);
          expect(
            notes.map((n) => noteText(n, 'Mob 1', '')),
            where,
          ).toEqual(lines);
          const c = random.counts();
          expect(c.engine, where).toBe(c.mvp);
          // The engine never draws a spot on the map for the calf.
          expect(c.sprite, where).toBe(births.length);
        }
      }
    }
  });

  it('a first calf weighs 32 kg, later calves 36 kg, and the dam starts milking', () => {
    for (const [spec, wt] of [
      [DAMS[0]!.spec, 32],
      [DAMS[2]!.spec, 32],
      [DAMS[3]!.spec, 36],
    ] as const) {
      const m = createCattleMob();
      m.animals = [toEngine(beast(30, spec))];
      const births: Animal[] = [];
      calve(m.animals[0]!, m, {
        ids: { next: 31 },
        rng: scriptedRandom([0.9, 0.2]).rng,
        day: 5,
        totals: emptyCattleTotals(),
        notes: [],
        births,
      });
      const dam = m.animals[0]!;
      expect(births[0]!.wt).toBe(wt);
      expect([births[0]!.kind, births[0]!.sex, births[0]!.dam]).toEqual(['calf', 'M', 30]);
      expect([dam.kind, dam.preg, dam.lact, dam.calf]).toEqual(['cow', -1, 0, 31]);
    }
  });
});

describe('weaning, against the MVP', () => {
  const herd = (): MvpBeast[] => {
    const out: MvpBeast[] = [];
    let id = 1;
    // A cow for each calf, calves from 60 to 300 days, of each sex.
    for (const age of [60, 89, 90, 91, 150, 279, 280, 300]) {
      for (const sex of ['F', 'M', 'S'] as const) {
        const cow = id++;
        const calf = id++;
        out.push(
          beast(cow, { kind: 'cow', sex: 'F', wt: 450, age: 2000, cond: 3, lact: age, calf }),
        );
        out.push(beast(calf, { kind: 'calf', sex, wt: 36 + age * 0.8, age, cond: 3, dam: cow }));
      }
    }
    return out;
  };

  it('weaning one calf dries off its dam and names the calf by its sex', () => {
    const theirs = herd();
    const mine = theirs.map(toEngine);
    const byIdM = new Map(theirs.map((a) => [a.id, a]));
    const byIdE = new Map(mine.map((a) => [a.id, a]));
    for (let k = 1; k < theirs.length; k += 2) {
      mvp.weanOne(theirs[k]!, byIdM);
      weanOne(mine[k]!, byIdE);
    }
    mine.forEach((a, k) => expect(animalDifference(a, theirs[k]!)).toBeNull());
    expect(mine.filter((a) => a.kind === 'bull').every((a) => a.young)).toBe(true);
    expect(mine.some((a) => a.kind === 'calf')).toBe(false);
    expect(mine.filter((a) => a.kind === 'cow').every((a) => a.calf === 0 && a.lact === -1)).toBe(
      true,
    );
  });

  it('weaning the mob takes only calves 90 days or older', () => {
    // Water in this area only, so the MVP leaves the weaners with the cows.
    newFarm([TROUGHS.mid]);
    const m = mvpMob(herd());
    mvp.S.mobs = [m];
    const e = engineMob(m);
    mvp.weanMob(m, undefined, true);
    const weaned = weanMob(e, animalLookup([e]));
    sameMob(e, m, 'weaned');
    expect(weaned.map((a) => a.age).sort((a, b) => a - b)[0]).toBe(90);
    expect(weaned.length).toBe(18);
    expect(e.animals.filter((a) => a.kind === 'calf').map((a) => a.age)).toEqual([
      60, 60, 60, 89, 89, 89,
    ]);
  });

  it('a drop is due once a calf is 280 days old and its dam is on the farm', () => {
    const due = (age: number, damHere: boolean): boolean => {
      const m = createCattleMob();
      const cow = toEngine(beast(1, { kind: 'cow', sex: 'F', wt: 450, age: 2000, cond: 3 }));
      m.animals = [toEngine(beast(2, { kind: 'calf', sex: 'F', wt: 200, age, cond: 3, dam: 1 }))];
      return weaningDue(m, new Map(damHere ? [[1, cow]] : []));
    };
    expect(due(279, true)).toBe(false);
    expect(due(280, true)).toBe(true);
    expect(due(300, false)).toBe(false);
  });

  it('fixed MVP fault: weaning dries off a dam that is in another mob', () => {
    newFarm([TROUGHS.mid]);
    const cow = beast(1, {
      kind: 'cow',
      sex: 'F',
      wt: 450,
      age: 2000,
      cond: 3,
      lact: 280,
      calf: 2,
    });
    const calf = beast(2, { kind: 'calf', sex: 'M', wt: 250, age: 280, cond: 3, dam: 1 });
    const cows = mvpMob([cow], { id: 1, name: 'Cows' });
    const calves = mvpMob([calf], { id: 2, name: 'Calves' });
    mvp.S.mobs = [cows, calves];
    const eCows = engineMob(cows);
    const eCalves = engineMob(calves);

    mvp.weanMob(calves, undefined, true);
    // The MVP only looked in the calf's own mob, so the cow is still milking.
    expect([cow.calf, cow.lact]).toEqual([2, 280]);

    const weaned = weanMob(eCalves, animalLookup([eCows, eCalves]));
    expect(weaned.map((a) => a.id)).toEqual([2]);
    expect([eCows.animals[0]!.calf, eCows.animals[0]!.lact]).toEqual([0, -1]);
    // The calf itself is weaned the same way in both.
    expect(animalDifference(eCalves.animals[0]!, calf)).toBeNull();
  });
});

describe('marking, against the MVP', () => {
  it('marks bull calves and young bulls, and costs the same', () => {
    newFarm();
    const specs: BeastSpec[] = [
      { kind: 'calf', sex: 'M', wt: 90, age: 70, cond: 3, cost: 12.5 },
      { kind: 'calf', sex: 'M', wt: 200, age: 250, cond: 3 },
      { kind: 'calf', sex: 'F', wt: 90, age: 70, cond: 3 },
      { kind: 'calf', sex: 'S', wt: 90, age: 70, cond: 3 },
      { kind: 'bull', sex: 'M', wt: 310, age: 330, cond: 3, young: true, cost: 40 },
      { kind: 'bull', sex: 'M', wt: 800, age: 1500, cond: 3 },
      { kind: 'steer', sex: 'S', wt: 300, age: 400, cond: 3 },
      { kind: 'cow', sex: 'F', wt: 450, age: 2000, cond: 3 },
    ];
    const m = mvpMob(specs.map((s, k) => beast(k + 1, s)));
    const e = engineMob(m);
    mvp.S.cash = 1000;
    mvp.S.yr.running = 0;
    mvp.markCalves(m);
    const res = markCalves(e);
    sameMob(e, m, 'marked');
    expect(res).toEqual({ marked: 3, cost: 8 + 8 + 25 });
    expect(1000 - res.cost).toBe(mvp.S.cash);
    expect(res.cost).toBe(mvp.S.yr.running);
    // The young bull is now a steer, 3% lighter. The adult bull is untouched.
    expect([e.animals[4]!.kind, e.animals[4]!.sex, e.animals[4]!.young]).toEqual([
      'steer',
      'S',
      false,
    ]);
    expect(e.animals[4]!.wt).toBe(310 * 0.97);
    expect(e.animals[5]!.kind).toBe('bull');
    // Nothing left to mark.
    expect(markCalves(e)).toEqual({ marked: 0, cost: 0 });
  });
});

describe('joining notes, against the MVP', () => {
  /**
   * Run the breeding notes day after day in both on the same mob. `change`
   * alters the mob each day, the same way on both sides.
   */
  function runNotes(
    specs: BeastSpec[],
    days: number,
    bulls: { adult: number; young: number; cover: number },
    change: (animals: (MvpBeast | Animal)[], day: number, join: Joining | null) => void,
    lot = false,
    from = 1,
  ): string[] {
    const lines = newFarm(undefined, 0);
    const m = mvpMob(specs.map((s, k) => beast(k + 1, s)));
    const e = engineMob(m);
    const all: string[] = [];
    for (let day = from; day < from + days; day++) {
      mvp.S.day = day;
      change(m.animals, day, m.join ?? null);
      change(e.animals, day, e.join);
      lines.length = 0;
      mvp.breedingNotes(m, bulls.adult, bulls.young, bulls.cover, lot);
      const notes: CattleNote[] = [];
      breedingNotes(e, bulls.adult, bulls.young, bulls.cover, lot, day, notes);
      expect(
        notes.map((n) => noteText(n, 'Mob 1', '')),
        `day ${day}`,
      ).toEqual(lines);
      sameMob(e, m, `day ${day}`);
      all.push(...lines);
    }
    return all;
  }

  const cows = (n: number, extra: Partial<BeastSpec> = {}): BeastSpec[] =>
    Array.from({ length: n }, (_, k) => ({
      kind: 'cow' as const,
      sex: 'F' as const,
      wt: 420 + k,
      age: 2000,
      cond: 2 + (k % 5) * 0.4,
      ...extra,
    }));

  it('a 9-week joining: start, 3 and 6 week notes, then the preg test', () => {
    // Four cows get in calf every 5 days, counted on the joining record the
    // way the daily step counts them.
    const all = runNotes(
      [...cows(40), { kind: 'heifer', sex: 'F', wt: 250, age: 380, cond: 3 }],
      140,
      { adult: 1, young: 0, cover: 1 },
      (animals, day, join) => {
        if (day % 5 !== 2) return;
        const open = animals.filter((a) => a.kind === 'cow' && a.preg < 0).slice(0, 4);
        for (const a of open) {
          a.preg = 0;
          if (join) join.conc++;
        }
      },
    );
    expect(all.filter((l) => l.startsWith('Joining has started')).length).toBe(1);
    expect(all.filter((l) => l.includes('3 weeks of joining')).length).toBe(1);
    expect(all.filter((l) => l.includes('6 weeks of joining')).length).toBe(1);
    // Every cow was in calf by week 9, so the second 9 weeks has nothing to report.
    expect(all.filter((l) => l.startsWith('Preg test')).length).toBe(1);
  });

  it('a second 9 weeks reports again when cows were still open', () => {
    const all = runNotes(cows(30), 140, { adult: 1, young: 0, cover: 1 }, (animals, day, join) => {
      if (day % 10 !== 2) return;
      const a = animals.find((x) => x.preg < 0);
      if (a) {
        a.preg = 0;
        if (join) join.conc++;
      }
    });
    expect(all.filter((l) => l.startsWith('Preg test')).length).toBe(2);
  });

  it('with no conceptions there is no 3-week note, and the preg test still comes', () => {
    const all = runNotes(cows(12), 70, { adult: 1, young: 0, cover: 1 }, () => {});
    expect(all.filter((l) => l.includes('weeks of joining')).length).toBe(0);
    expect(all.filter((l) => l.startsWith('Preg test')).length).toBe(1);
  });

  it('thin cows, a lot of them milking, some recently calved: the preg test wording follows', () => {
    const specs = [
      ...cows(12, { cond: 2.1, lact: 200, calf: 900 }),
      ...cows(6, { cond: 2.3, lact: 20, calf: 901 }),
      ...cows(4, { cond: 2.6 }),
    ];
    const all = runNotes(specs, 70, { adult: 1, young: 0, cover: 0.9 }, (animals, day) => {
      if (day === 30) animals.slice(0, 3).forEach((a) => (a.preg = 0));
    });
    const test = all.find((l) => l.startsWith('Preg test'))!;
    expect(test).toContain('too soon to tell');
    expect(test).toContain('Fewer got in calf');
    expect(test).toContain('Condition is holding them back');
  });

  it('the bull leaves: a preg test after 3 weeks or more, none before', () => {
    for (const leaveOn of [20, 21, 40]) {
      const lines = newFarm(undefined, 0);
      const m = mvpMob(cows(10).map((s, k) => beast(k + 1, s)));
      const e = engineMob(m);
      const all: string[] = [];
      for (let day = 0; day <= leaveOn; day++) {
        mvp.S.day = day;
        const cover = day < leaveOn ? 1 : 0;
        lines.length = 0;
        mvp.breedingNotes(m, cover, 0, cover, true);
        const notes: CattleNote[] = [];
        breedingNotes(e, cover, 0, cover, true, day, notes);
        expect(notes.map((n) => noteText(n, 'Mob 1', ''))).toEqual(lines);
        sameMob(e, m, `day ${day}`);
        all.push(...lines);
      }
      expect(all.some((l) => l.startsWith('Preg test'))).toBe(leaveOn >= 21);
      expect(e.join).toBeNull();
    }
  });

  it('no bull: a note when 3 or more are ready, at most every 60 days, never in the lot', () => {
    const three = runNotes(cows(3), 130, { adult: 0, young: 0, cover: 0 }, () => {});
    expect(three.length).toBe(3);
    expect(three[0]).toContain('3 cows/heifers');
    const two = runNotes(cows(2), 130, { adult: 0, young: 0, cover: 0 }, () => {});
    expect(two.length).toBe(0);
    const lot = runNotes(cows(3), 130, { adult: 0, young: 0, cover: 0 }, () => {}, true);
    expect(lot.length).toBe(0);
    // Barren cows, and heifers too young or too light, are not ready.
    const notReady = runNotes(
      [
        ...cows(2),
        ...cows(2, { barren: true }),
        { kind: 'heifer', sex: 'F', wt: 269, age: 500, cond: 3 },
        { kind: 'heifer', sex: 'F', wt: 300, age: 399, cond: 3 },
      ],
      10,
      { adult: 0, young: 0, cover: 0 },
      () => {},
    );
    expect(notReady.length).toBe(0);
  });

  it('bull calves to mark: from 60 days old, at most every 45 days', () => {
    const specs: BeastSpec[] = [
      ...cows(4),
      { kind: 'calf', sex: 'M', wt: 80, age: 50, cond: 3 },
      { kind: 'calf', sex: 'M', wt: 80, age: 20, cond: 3 },
      { kind: 'calf', sex: 'F', wt: 80, age: 100, cond: 3 },
    ];
    const all = runNotes(specs, 120, { adult: 0, young: 0, cover: 0 }, (animals) => {
      for (const a of animals) if (a.kind === 'calf') a.age++;
    });
    const marks = all.filter((l) => l.includes('old enough to mark'));
    expect(marks.length).toBe(3);
    expect(marks[0]).toMatch(/^1 bull calves/);
    expect(marks[1]).toMatch(/^2 bull calves/);
  });

  it('young bulls: noted once when they become fertile, and joining starts without a bull', () => {
    const all = runNotes(
      [...cows(10), { kind: 'bull', sex: 'M', wt: 300, age: 290, cond: 3, young: true }],
      40,
      { adult: 0, young: 1, cover: 0.6 },
      () => {},
    );
    expect(all.filter((l) => l.includes('are now fertile')).length).toBe(1);
    expect(all.find((l) => l.startsWith('Joining has started'))).toContain('unmarked young bulls');
  });

  it('MVP quirk, kept: a note made on day 0 of a farm is made again on day 1', () => {
    // The MVP stores the day of the note and reads 0 as "not noted yet".
    const all = runNotes(
      [...cows(10), { kind: 'bull', sex: 'M', wt: 300, age: 290, cond: 3, young: true }],
      40,
      { adult: 0, young: 1, cover: 0.6 },
      () => {},
      false,
      0,
    );
    expect(all.filter((l) => l.includes('are now fertile')).length).toBe(2);
  });

  it('the preg test alone gives the same figures', () => {
    const lines = newFarm(undefined, 100);
    for (let seed = 0; seed < 40; seed++) {
      const specs = cows(25).map((s, k) => ({
        ...s,
        cond: 1.2 + ((k * 7 + seed * 3) % 30) / 10,
        preg: (k + seed) % 3 === 0 ? 10 : -1,
        lact: (k + seed) % 4 === 0 ? 30 + ((k * seed) % 200) : -1,
        calf: (k + seed) % 4 === 0 ? 500 + k : 0,
      }));
      const beasts = specs.map((s, k) => beast(k + 1, s));
      const preg = beasts.filter((a) => a.preg >= 0).length;
      lines.length = 0;
      mvp.joinReport(mvpMob(beasts), beasts, preg);
      const note = joinReport(beasts.map(toEngine), preg);
      expect([noteText(note, 'Mob 1', '')]).toEqual(lines);
    }
  });

  it('the preg test counts a cow from 63 days after her anoestrus, and "milking" means over half', () => {
    const lines = newFarm(undefined, 100);
    const report = (specs: BeastSpec[]): string => {
      const beasts = specs.map((s, k) => beast(k + 1, s));
      lines.length = 0;
      mvp.joinReport(mvpMob(beasts), beasts, 0);
      const text = noteText(joinReport(beasts.map(toEngine), 0), 'Mob 1', '');
      expect([text]).toEqual(lines);
      return text;
    };
    // At CS 3 anoestrus is 45 days, so a cow has had her 9 weeks from day
    // 108 of milking. The one at 107 days is too soon to tell.
    const edge = report([
      ...cows(5, { cond: 3 }),
      ...[107, 108, 109].map((lact) => ({ ...cows(1, { cond: 3 })[0]!, lact, calf: 900 })),
    ]);
    expect(edge).toContain('0 of 7 in calf');
    expect(edge).toContain('1 recently calved is too soon to tell');
    // 21 of 42 milking is not over half: the dry rate is expected (84%).
    const half = report([...cows(21, { cond: 3 }), ...cows(21, { cond: 3, lact: 300, calf: 900 })]);
    expect(half).toContain("you'd expect about 84%");
    // 22 of 43 is over half: the milking rate is expected (78%).
    const over = report([...cows(21, { cond: 3 }), ...cows(22, { cond: 3, lact: 300, calf: 900 })]);
    expect(over).toContain("you'd expect about 78%");
  });
});
