import { describe, expect, it, vi } from 'vitest';
import {
  flock,
  heldRun,
  pastJoining,
  testMob,
  testSheep,
  testRngs,
} from '../../test-support/sheep';
import type { SheepBreed } from '../data/sheep';
import { drawLitter, foetusesPerEwe, lambingRisk, ramsNeeded } from '../sheep/breeding';
import { heldDiet, type SheepDiet } from '../sheep/graze';
import type { FlockDayResult } from '../sheep/simFlock';
import { fleeceMicron } from '../sheep/wool';
import type { Sheep, SheepMob } from '../sheep/types';

/*
 * The sheep benchmarks of kind "Mob" (docs/SHEEP_BENCHMARKS.md): a mob
 * through a joining, a lambing or a season on a held paddock (the sheep step
 * on its own, with a set diet), with seeded draws. Each test is named by its
 * row and asserts its band. Mobs are large (thousands of head) so the draws
 * average out; the seed is fixed so a run always gives the same figure.
 */

vi.setConfig({ testTimeout: 300_000 });

const within = (v: number, lo: number, hi: number): void => {
  expect(v).toBeGreaterThanOrEqual(lo);
  expect(v).toBeLessThanOrEqual(hi);
};

/** Good green feed: plenty, 72% digestible. */
const GOOD = heldDiet(2000, 0.72);
/** 1 April 2021: Western Victoria's joining day (call C27), so day 0 starts joining. */
const APRIL = { year: 2021, month: 3 };

interface JoinResult {
  joined: number;
  pregnant: number;
  foetuses: number;
  firstLamb: number;
}

/** A 5-week joining from day 0, ewes held at their CS, rams at 1% plus one. */
function joinRun(breed: SheepBreed, cs: number, n: number, seed: number, days = 81): JoinResult {
  const ewes = flock(n, () => ({ sex: 'F', breed, cond: cs }));
  const rams = flock(ramsNeeded(n), () => ({ sex: 'M', breed })).map((r, i) => ({
    ...r,
    id: n + 1 + i,
  }));
  const m = testMob([...ewes, ...rams]);
  const out: JoinResult = { joined: 0, pregnant: 0, foetuses: 0, firstLamb: -1 };
  heldRun(m, days, {
    start: APRIL,
    diet: GOOD,
    seed,
    holdCs: true,
    each: (day, r) => {
      for (const note of r.notes) {
        if (note.type === 'scanned') {
          out.joined = note.ewes;
          out.pregnant = note.pregnant;
          out.foetuses = note.foetuses;
        }
        if (note.type === 'lambingStarted' && out.firstLamb < 0) out.firstLamb = day;
      }
    },
  });
  return out;
}

interface LambRecord {
  litter: number;
  born: number;
  died: number | null;
  cause: string | null;
  bornKg: number;
  at42: number | null;
  weanKg: number | null;
  weanAge: number | null;
}

interface LambingResult {
  ewes: number;
  eweDeaths: number;
  eweDeathsBy: Map<number, { ewes: number; died: number }>;
  lambs: LambRecord[];
  mob: SheepMob;
}

/**
 * Ewes `preg` days pregnant, with `litter` lambs each (or drawn for their
 * CS), held at their CS, run for `days`. Lambs are weaned when due unless
 * `wean` is false.
 */
function lambingRun(o: {
  breed: SheepBreed;
  cs: number;
  n: number;
  seed: number;
  days: number;
  litter?: number;
  /** The CS the litters are drawn at (the CS at joining), the ewes' own CS if left out. */
  litterCs?: number;
  preg?: number;
  diet?: SheepDiet;
  holdCs?: boolean;
}): LambingResult {
  const rng = testRngs(o.seed + 1000);
  const ewes = flock(o.n, () => ({
    sex: 'F',
    breed: o.breed,
    cond: o.cs,
    preg: o.preg ?? 146,
    litter: o.litter ?? drawLitter(o.litterCs ?? o.cs, o.breed, rng.breeding),
    csScan: o.cs,
    csJoin: o.cs,
  }));
  const byLitter = new Map<number, { ewes: number; died: number }>();
  const litterOf = new Map<number, number>();
  for (const e of ewes) {
    litterOf.set(e.id, e.litter);
    const r = byLitter.get(e.litter) ?? { ewes: 0, died: 0 };
    r.ewes++;
    byLitter.set(e.litter, r);
  }
  const m = testMob(ewes);
  m.join = pastJoining(o.n);
  const lambs = new Map<number, LambRecord>();
  let eweDeaths = 0;
  heldRun(m, o.days, {
    start: APRIL,
    diet: o.diet ?? GOOD,
    seed: o.seed,
    holdCs: o.holdCs ?? true,
    each: (day, r: FlockDayResult, mob) => {
      for (const b of r.births) {
        lambs.set(b.id, {
          litter: litterOf.get(b.dam) ?? 0,
          born: day,
          died: null,
          cause: null,
          bornKg: b.wt,
          at42: null,
          weanKg: null,
          weanAge: null,
        });
      }
      for (const d of r.deaths) {
        const rec = lambs.get(d.sheep.id);
        if (rec) {
          rec.died = day;
          rec.cause = d.cause;
        } else if (litterOf.has(d.sheep.id)) {
          eweDeaths++;
          byLitter.get(litterOf.get(d.sheep.id)!)!.died++;
        }
      }
      for (const s of mob.sheep) {
        const rec = lambs.get(s.id);
        if (!rec) continue;
        if (s.age === 42) rec.at42 = s.wt;
        if (s.weaned && rec.weanKg === null) {
          rec.weanKg = s.wwt;
          rec.weanAge = s.wage;
        }
      }
    },
  });
  return { ewes: o.n, eweDeaths, eweDeathsBy: byLitter, lambs: [...lambs.values()], mob: m };
}

/** Lambs alive at marking (42 days old) as a share of lambs born, leaving out lambs whose ewe died lambing. */
function survival(lambs: LambRecord[], litter?: number): number {
  const l = lambs.filter(
    (x) => (litter === undefined || x.litter === litter) && x.cause !== 'lambing',
  );
  const alive = l.filter((x) => x.died === null || x.died - x.born >= 42).length;
  return alive / l.length;
}

describe('sheep benchmarks: mob', () => {
  it('SB-29 the first lambs come about day 150 from the start of joining (147 days gestation)', () => {
    const r = joinRun('merino', 3, 400, 7, 160);
    within(r.firstLamb, 145, 153);
  });

  it('SB-30 Merino ewes at CS 3, a 5-week joining with rams at 1% + 1: 88 to 95% in lamb', () => {
    const r = joinRun('merino', 3, 3000, 1);
    within(r.pregnant / r.joined, 0.88, 0.95);
  });

  it('SB-31 crossbred ewes at CS 3, a 5-week joining: 93 to 98% in lamb', () => {
    const r = joinRun('xb', 3, 3000, 2);
    within(r.pregnant / r.joined, 0.93, 0.98);
  });

  it('SB-32 Merino ewes: 15 to 25 more foetuses per 100 ewes for each CS at joining, close to a straight line from CS 1.5 to 4.5', () => {
    const at = (cs: number): number => {
      const r = joinRun('merino', cs, 3000, 3);
      return (r.foetuses / r.joined) * 100;
    };
    const f2 = at(2);
    const f3 = at(3);
    const f4 = at(4);
    within(f3 - f2, 15, 25);
    within(f4 - f3, 15, 25);
    // The rule itself is a straight line over the whole range.
    const slope = (foetusesPerEwe(4.5, 'merino') - foetusesPerEwe(1.5, 'merino')) / 3;
    within(slope * 100, 15, 25);
    expect(foetusesPerEwe(2.5, 'merino') - foetusesPerEwe(1.5, 'merino')).toBeCloseTo(slope, 9);
  });

  it('SB-33 Merino ewes at CS 3, a 5-week joining: scanning 115 to 135%', () => {
    const r = joinRun('merino', 3, 3000, 4);
    within((r.foetuses / r.joined) * 100, 115, 135);
  });

  it('SB-34 non-Merino ewes at CS 3, a 5-week joining: scanning 145 to 165%', () => {
    const r = joinRun('xb', 3, 3000, 5);
    within((r.foetuses / r.joined) * 100, 145, 165);
  });

  it('SB-35 Merino ewes at CS 3 at lambing: lamb survival to marking, singles 88 to 93%, twins 68 to 75%', () => {
    const s = lambingRun({ breed: 'merino', cs: 3, n: 4000, seed: 11, days: 50, litter: 1 });
    const t = lambingRun({ breed: 'merino', cs: 3, n: 3000, seed: 12, days: 50, litter: 2 });
    within(survival(s.lambs) * 100, 88, 93);
    within(survival(t.lambs) * 100, 68, 75);
  });

  it('SB-36 crossbred ewes at CS 3 at lambing: lamb survival to marking, singles 90 to 97%, twins 80 to 87%', () => {
    const s = lambingRun({ breed: 'xb', cs: 3, n: 4000, seed: 13, days: 50, litter: 1 });
    const t = lambingRun({ breed: 'xb', cs: 3, n: 3000, seed: 14, days: 50, litter: 2 });
    within(survival(s.lambs) * 100, 90, 97);
    within(survival(t.lambs) * 100, 80, 87);
  });

  it('SB-37 Merino ewes lambing at CS 3.0 to 3.5 rear 10 to 25 more lambs per 100 than at CS 2.0 to 2.5, twins gaining more (C32: the S19 table is still to be checked)', () => {
    const lo = lambingRun({ breed: 'merino', cs: 2.25, n: 5000, seed: 15, days: 50 });
    const hi = lambingRun({ breed: 'merino', cs: 3.25, n: 5000, seed: 16, days: 50 });
    within((survival(hi.lambs) - survival(lo.lambs)) * 100, 10, 25);
    const gainS = survival(hi.lambs, 1) - survival(lo.lambs, 1);
    const gainT = survival(hi.lambs, 2) - survival(lo.lambs, 2);
    expect(gainT).toBeGreaterThan(gainS);
  });

  it('SB-38 70% or more of lamb deaths from birth to weaning are in the first 3 days', () => {
    const r = lambingRun({ breed: 'merino', cs: 3, n: 3000, seed: 17, days: 110 });
    const dead = r.lambs.filter((x) => x.died !== null && x.cause !== 'lambing');
    const early = dead.filter((x) => x.died! - x.born < 3).length;
    expect(early / dead.length).toBeGreaterThanOrEqual(0.7);
  });

  it('SB-39 lamb deaths from marking to weaning are under 1%', () => {
    const r = lambingRun({ breed: 'merino', cs: 3, n: 3000, seed: 18, days: 110 });
    const marked = r.lambs.filter((x) => x.died === null || x.died - x.born >= 42);
    const lost = marked.filter((x) => x.died !== null && x.weanKg === null).length;
    expect(lost / marked.length).toBeLessThan(0.01);
  });

  it('SB-42 ewe deaths from scanning to marking: singles 0.5 to 3.0%, twins 1.2 to 5.0%, triplets 1.8 to 14.5%', () => {
    const run = (litter: number, n: number, seed: number): number => {
      // Scanning is day 80 of the joining; the ewes are about 60 days in lamb. Marking is 42 days after lambing.
      const r = lambingRun({
        breed: 'merino',
        cs: 3,
        n,
        seed,
        days: 147 - 60 + 42,
        litter,
        preg: 60,
      });
      return (r.eweDeaths / r.ewes) * 100;
    };
    within(run(1, 6000, 21), 0.5, 3.0);
    within(run(2, 6000, 22), 1.2, 5.0);
    within(run(3, 3000, 23), 1.8, 14.5);
  });

  it('SB-43a ewe deaths during lambing: self-replacing Merino 1.5 to 2.5%, first-cross 2.8 to 3.7%', () => {
    const run = (breed: SheepBreed, seed: number): number => {
      const r = lambingRun({ breed, cs: 3, n: 8000, seed, days: 40, preg: 140 });
      return (r.eweDeaths / r.ewes) * 100;
    };
    within(run('merino', 24), 1.5, 2.5);
    within(run('xb', 25), 2.8, 3.7);
  });

  it('SB-44 breeding ewes at CS 1.5 in late pregnancy die at about twice (1.6 to 2.5 times) the rate of ewes at CS 2.5 to 3', () => {
    // The same litters for both: they were set at joining, at CS 3.
    const run = (cs: number, seed: number): number => {
      const r = lambingRun({
        breed: 'merino',
        cs,
        litterCs: 3,
        n: 15000,
        seed,
        days: 147 - 100 + 14,
        preg: 100,
      });
      return r.eweDeaths / r.ewes;
    };
    within(run(1.5, 26) / run(2.75, 27), 1.6, 2.5);
    // The rule itself: twice at lambing for every litter.
    for (const lit of [1, 2, 3]) {
      within(lambingRisk(1.5, lit, 'merino', 0) / lambingRisk(2.75, lit, 'merino', 0), 1.6, 2.5);
    }
  });

  /**
   * A weaner mob of `n`, weaned at `wwt` kg, fed for a year from weaning so
   * they grow `g` g a day: the feed is rationed day by day to follow that
   * weight path.
   */
  function weanerYear(wwt: number, g: number, seed: number, n = 6000): number {
    const sheep = flock(n, () => ({ sex: 'W', wt: wwt, age: 98, wwt, wage: 98, adg: g / 1000 }));
    const m = testMob(sheep);
    let f = 0.5;
    heldRun(m, 365, {
      start: { year: 2021, month: 11 },
      diet: GOOD,
      seed,
      f: (day, mob) => {
        const s = mob.sheep[0]!;
        const target = wwt + (g / 1000) * (day + 1);
        f = Math.min(1, Math.max(0.05, f + (target - s.wt) * 0.2));
        return f;
      },
      each: (_d, _r, mob) => {
        // Shorn and crutched: flystrike is counted on its own rows (SB-53, SB-54).
        for (const s of mob.sheep) s.flyCover = 1;
      },
    });
    return ((n - m.sheep.length) / n) * 100;
  }

  it('SB-45 Merino weaners weaned at about 24 kg and growing about 60 g a day lose 0 to 2% in the first year', () => {
    within(weanerYear(23.9, 62.9, 31), 0, 2);
  });

  it('SB-46 Merino weaners losing about 10 g a day lose 8 to 15% in the first year', () => {
    within(weanerYear(22.0, -9.7, 32), 8, 15);
  });

  it('SB-48 Merino lambs from ewes on 800 against 3,000 kg/ha feed on offer through lactation wean at about 14 kg (11 to 17) against 28 kg (25 to 31)', () => {
    // Feed on offer is herbage mass plus 300 (Lifetime Wool, S19); spring feed taken as 72% digestible.
    const wean = (foo: number, seed: number): number => {
      const r = lambingRun({
        breed: 'merino',
        cs: 3,
        n: 1500,
        seed,
        days: 101,
        diet: heldDiet(foo - 300, 0.72),
        holdCs: false,
      });
      const w = r.lambs.filter((x) => x.weanKg !== null).map((x) => x.weanKg!);
      return w.reduce((a, b) => a + b, 0) / w.length;
    };
    within(wean(800, 41), 11, 17);
    within(wean(3000, 42), 25, 31);
  });

  it('SB-48a Merino singles and twins grow 175 to 220 g a day from marking to weaning on adequate feed', () => {
    const r = lambingRun({
      breed: 'merino',
      cs: 3,
      n: 2000,
      seed: 43,
      days: 101,
      diet: heldDiet(1700, 0.72),
      holdCs: false,
    });
    for (const lit of [1, 2]) {
      const l = r.lambs.filter((x) => x.litter === lit && x.weanKg !== null && x.at42 !== null);
      const g = l.map((x) => ((x.weanKg! - x.at42!) / (x.weanAge! - 42)) * 1000);
      within(g.reduce((a, b) => a + b, 0) / g.length, 175, 220);
    }
  });

  it('SB-50 a Merino ewe that loses 1 CS over pregnancy cuts 0.5 to 0.9 kg less clean wool and grows wool 0.6 to 1.2 micron finer than one that holds CS', () => {
    const run = (loseCs: number): Sheep => {
      const e = testSheep({ id: 1, sex: 'F', preg: 0, litter: 1, csJoin: 3 });
      const m = testMob([e]);
      const w0 = e.wt;
      const kg = loseCs * 9.5;
      let f = 1;
      heldRun(m, 146, {
        diet: GOOD,
        seed: 51,
        // Feed rationed day by day to follow the weight path smoothly (the
        // lambing is not reached). The wool compared is what grew over the
        // pregnancy: the rest of the year the two ewes would be on the same feed.
        f: (day, mob) => {
          const s = mob.sheep[0]!;
          const target = w0 - (kg * day) / 147;
          const slope = -kg / 147;
          f = Math.min(1, Math.max(0.05, f + (target - s.wt) * 0.01 + (slope - s.adg) * 0.5));
          return f;
        },
      });
      return m.sheep[0]!;
    };
    const hold = run(0);
    const lose = run(1);
    within(hold.fleece - lose.fleece, 0.5, 0.9);
    within(fleeceMicron(hold) - fleeceMicron(lose), 0.6, 1.2);
  });
});
