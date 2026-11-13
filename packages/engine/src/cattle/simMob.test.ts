import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  AREAS,
  HerdRun,
  PASTURE_STATES,
  TROUGHS,
  areaOf,
  bothStreams,
  constantRandom,
  landOf,
  loadCattleMvp,
  paintArea,
  pairedRandom,
  regAt,
  rngFrom,
  scriptedRandom,
  type AreaName,
  type BeastSpec,
  type PairedRandom,
  type PastureStateName,
} from '../../test-support/cattle';
import { makeScenario, type Scenario } from '../../test-support/farms';
import type { Mvp } from '../../test-support/mvp';
import { HEALTH_COST_PER_HEAD_YEAR, type SaleClassId } from '../data/cattle';
import { SUPPLEMENTS } from '../data/feed';
import { rngStream } from '../rng';
import { makeSaleBatch } from './animal';
import { settleDeaths, simMob, type SimMobInputs } from './simMob';
import {
  animalLookup,
  createCattleMob,
  emptyCattleTotals,
  type Animal,
  type CattleMob,
} from './types';

/*
 * One day for a mob against the MVP's own simMob, and the deaths handling
 * from its stepDay.
 *
 * The same herd is put on the same farm in the MVP and in the engine. After
 * each day every animal, every mob figure, the pasture, the year totals, the
 * deaths and the notes must be the same exactly. Nothing uses a tolerance.
 *
 * Where the MVP draws random numbers, both sides get the same ones: a fixed
 * value (0.999999 so nothing random happens, or 0 so everything does), or
 * the same seeded sequence, drawn in the same order.
 */

const loaded = loadCattleMvp();
const { mvp } = loaded;
// Some of these run a few hundred mob days. Give a slow machine room.
vi.setConfig({ testTimeout: 60_000 });
const AREA_NAMES = Object.keys(AREAS) as AreaName[];
const STATE_NAMES = Object.keys(PASTURE_STATES) as PastureStateName[];

interface RunOptions {
  farmHa?: number;
  day?: number;
  month?: number;
  seasonF?: number;
  landUses?: boolean;
  troughs?: readonly number[];
  paint?: (scn: Scenario) => void;
  random?: PairedRandom;
  seed?: number;
}

function startRun(district: DistrictId, o: RunOptions = {}): HerdRun {
  const scn = makeScenario(mvp as unknown as Mvp, {
    district,
    start: { year: 2023, month: o.month ?? 9 },
    day: o.day ?? 30,
    farmHa: o.farmHa ?? 2000,
    seasonF: o.seasonF ?? 1,
    monthF: o.seasonF ?? 1,
    landUses: o.landUses,
    seed: o.seed ?? 2,
  });
  o.paint?.(scn);
  return new HerdRun(
    loaded,
    scn,
    { random: o.random ?? pairedRandom(77), landUses: o.landUses },
    o.troughs,
  );
}

/** Animals of the saleyard classes, made with the run's tag numbers. */
function bought(
  run: HerdRun,
  seed: number,
  counts: Partial<Record<SaleClassId, number>>,
): Animal[] {
  const rng = rngStream(seed, 'test-herd');
  const out: Animal[] = [];
  for (const [key, n] of Object.entries(counts)) {
    out.push(...makeSaleBatch(run.ids, rng, key as SaleClassId, n));
  }
  return out;
}

/**
 * A mob with every class in it: steers, heifers (empty and in calf), cows
 * (dry, in calf early and late, with young and old calves), bulls, a young
 * bull, and heifer, steer and bull calves. Condition runs from 1 to 5.
 */
function everyClass(run: HerdRun, seed: number): Animal[] {
  const herd = bought(run, seed, {
    weanerSteer: 6,
    yearSteer: 6,
    weanerHeifer: 5,
    joinHeifer: 6,
    dryCow: 8,
    ptic: 12,
    cowCalf: 12,
    bull: 2,
  });
  const adults = herd.filter((a) => a.kind !== 'calf');
  adults.forEach((a, k) => {
    // Every third animal keeps its bought condition. The rest span CS 1 to 5.
    if (k % 3) a.cond = 1 + ((k * 7) % 17) / 4;
    a.barren = k % 11 === 0 && a.sex === 'F';
  });
  const cows = herd.filter((a) => a.kind === 'cow');
  // Some about to calve, one today, and one heifer in calf.
  cows
    .filter((a) => a.preg >= 0)
    .forEach((a, k) => (a.preg = [20, 150, 189, 191, 250, 281, 282][k % 7]!));
  const heifers = herd.filter((a) => a.kind === 'heifer' && a.wt > 280);
  heifers[0]!.preg = 282;
  heifers[1]!.preg = 120;
  // Calves from newborn to nearly weaning age, some of them unmarked bulls.
  const calves = herd.filter((a) => a.kind === 'calf');
  calves.forEach((c, k) => {
    c.age = [3, 25, 45, 61, 88, 95, 130, 200, 250, 278, 305, 150][k % 12]!;
    c.wt = 36 + c.age * 0.8;
    if (k % 3 === 0) c.sex = 'M';
    const dam = herd.find((a) => a.id === c.dam)!;
    dam.lact = c.age;
  });
  // A weaned, unmarked male: a young bull old enough to work.
  const steer = herd.find((a) => a.kind === 'steer' && a.wt > 300)!;
  steer.kind = 'bull';
  steer.sex = 'M';
  steer.young = true;
  steer.age = 320;
  return herd;
}

const steers = (n: number, wt = 280): BeastSpec[] =>
  Array.from({ length: n }, (_, k) => ({
    kind: 'steer' as const,
    sex: 'S' as const,
    wt: wt + (k % 20) * 4,
    age: 300 + k,
    cond: 2.4 + (k % 9) * 0.1,
  }));

const paintAll =
  (state: PastureStateName) =>
  (scn: Scenario): void =>
    AREA_NAMES.forEach((name) => paintArea(scn, name, state));

describe('one mob, a few days, against the MVP', () => {
  const RANDOMS: [string, () => PairedRandom][] = [
    ['nothing random happens (0.999999)', () => constantRandom(0.999999)],
    ['everything random happens (0)', () => constantRandom(0)],
    ['a seeded sequence', () => pairedRandom(404)],
  ];

  describe.each(DISTRICT_IDS)('%s', (id) => {
    it.each(STATE_NAMES)('every class on %s pasture, each supplement', (state) => {
      for (const supp of SUPPLEMENTS) {
        for (const [, random] of RANDOMS) {
          const run = startRun(id, { paint: paintAll(state), random: random() });
          run.addHerd('Mob 1', AREAS.mid, everyClass(run, 5), supp);
          for (let d = 0; d < 3; d++) run.day();
        }
      }
    });

    it('every class on a farm with every kind of square', () => {
      for (const [, random] of RANDOMS) {
        const run = startRun(id, { random: random(), seed: 9 });
        run.addHerd('Mob 1', AREAS.big, everyClass(run, 6), 'none');
        run.addHerd('Mob 2', AREAS.mid, everyClass(run, 7), 'lick');
        run.addMob('Mob 3', AREAS.strip, steers(40), 'hay');
        for (let d = 0; d < 4; d++) run.day();
      }
    });
  });

  it('with the fixed value 0 every animal dies on its first day, by cause', () => {
    const run = startRun('cq', { random: constantRandom(0), paint: paintAll('green') });
    const pair = run.addHerd('Mob 1', AREAS.mid, everyClass(run, 5));
    const head = pair.e.animals.length;
    const out = run.day();
    expect(out.deaths.length).toBe(head);
    // A calf whose dam died before it in the day's order dies as an orphan.
    expect(new Set(out.deaths.map((d) => d.cause))).toEqual(
      new Set(['natural', 'poorCondition', 'orphaned']),
    );
    expect(run.totals.deaths).toBe(head);
    expect(run.pairs.length).toBe(0);
  });

  it('with the fixed value 0.999999 nothing dies, conceives or is born dead', () => {
    const run = startRun('cq', { random: constantRandom(0.999999), paint: paintAll('green') });
    const pair = run.addHerd('Mob 1', AREAS.mid, everyClass(run, 5));
    const inCalf = pair.e.animals.filter((a) => a.preg >= 0).length;
    let born = 0;
    for (let d = 0; d < 3; d++) {
      const out = run.day();
      expect(out.deaths.length).toBe(0);
      born += out.results[0]!.births.length;
    }
    // Two cows and a heifer were due on the first two days. All calves are heifers.
    expect(born).toBe(3);
    expect(pair.e.animals.filter((a) => a.preg >= 0).length).toBe(inCalf - 3);
    expect(pair.e.animals.slice(-3).map((a) => [a.kind, a.sex, a.barren])).toEqual([
      ['calf', 'F', false],
      ['calf', 'F', false],
      ['calf', 'F', false],
    ]);
  });
});

describe('stocking, light to very heavy, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: 500 head on 4 ha, moved on to the next 16 ha', (id) => {
    // 1,040 ha farm: 1 ha squares. The tiny area is 4 ha, the small one 16 ha.
    const run = startRun(id, { farmHa: 1040, random: pairedRandom(31) });
    expect(regAt(mvp, AREAS.tiny).ha).toBe(4);
    const pair = run.addMob('Mob 1', AREAS.tiny, steers(500), 'none');
    const first = run.day().results[0]!;
    // They wanted far more than 4 ha holds: the area is down to the residual.
    expect(first.st.f).toBeLessThan(0.7);
    expect(first.notes.some((n) => n.type === 'shortOfFeed')).toBe(true);
    run.day();
    run.move(pair, AREAS.small);
    // Within a week the 16 ha runs short too. (Five days in Central West
    // since its 1.3 tune: the feed is a little less digestible, so the
    // steers eat a little less of it a day.)
    let shortOn = -1;
    for (let d = 0; d < 7 && shortOn < 0; d++) {
      run.day();
      if (pair.e.st!.f < 1) shortOn = d + 1;
    }
    expect(shortOn).toBeGreaterThanOrEqual(1);
    expect(shortOn).toBeLessThanOrEqual(id === 'cw' ? 5 : 4);
  });

  it.each(DISTRICT_IDS)('%s: light, normal and heavy mobs side by side for 12 days', (id) => {
    const run = startRun(id, { random: pairedRandom(32) });
    run.addMob('Light', AREAS.big, steers(4));
    run.addMob('Normal', AREAS.mid, steers(150));
    run.addMob('Heavy', AREAS.strip, steers(600, 380));
    run.addMob('Very heavy', AREAS.tiny, steers(300));
    const fs: number[][] = [];
    for (let d = 0; d < 12; d++) {
      run.grow();
      fs.push(run.day().results.map((r) => r.st.f));
    }
    // The light mob always gets its fill. The heaviest runs short.
    expect(Math.min(...fs.map((f) => f[0]!))).toBeGreaterThan(0.999);
    expect(Math.min(...fs.map((f) => f[3]!))).toBeLessThan(0.5);
  });

  it('a mob short of feed for weeks: the 10-day weight loss note says which classes', () => {
    // 520 ha farm: half-hectare squares, so the tiny area is 2 ha.
    const run = startRun('cq', {
      farmHa: 520,
      random: pairedRandom(33),
      paint: paintAll('dry'),
      troughs: [TROUGHS.tiny],
    });
    run.addHerd('Mob 1', AREAS.tiny, everyClass(run, 8));
    const days: Record<string, number[]> = {};
    for (let d = 0; d < 45; d++) {
      const day = run.scn.day;
      for (const r of run.day().results.slice(0, 1)) {
        for (const n of r.notes) (days[n.type] ??= []).push(day);
      }
    }
    expect(days.losingWeight!.length).toBeGreaterThanOrEqual(1);
    // Short of feed is noted again after more than 14 days, low condition
    // after more than 30, not every day.
    expect(days.shortOfFeed!.length).toBeGreaterThanOrEqual(2);
    expect(days.shortOfFeed![1]! - days.shortOfFeed![0]!).toBe(15);
  });

  it('a mob in low condition is noted, and again after more than 30 days', () => {
    const run = startRun('cq', { random: constantRandom(0.999999), paint: paintAll('bare') });
    const thin = steers(30).map((s) => ({ ...s, cond: 1.5 }));
    run.addMob('Mob 1', AREAS.mid, thin, 'hay');
    const days: number[] = [];
    for (let d = 0; d < 65; d++) {
      const day = run.scn.day;
      if (run.day().results[0]!.notes.some((n) => n.type === 'lowCondition')) days.push(day);
    }
    expect(days).toEqual([30, 61, 92]);
  });
});

describe('water, against the MVP', () => {
  it('water near and water 3 km out', () => {
    // 10,400 ha: squares 316 m across. The big area has its trough in a corner.
    const run = startRun('cq', {
      farmHa: 10400,
      random: pairedRandom(41),
      paint: (scn) => {
        paintAll('green')(scn);
        // Feed within about 3 km of that trough is eaten out.
        for (let i = 0; i < 1040; i++) {
          if (i % 40 >= 20 && Math.hypot((i % 40) - 39, Math.floor(i / 40)) < 10) {
            scn.state.G[i] = 30;
            scn.state.D[i] = 150;
          }
        }
      },
    });
    const far = run.addMob('Far', AREAS.big, steers(200));
    const near = run.addMob('Near', AREAS.small, steers(20));
    for (let d = 0; d < 6; d++) run.day();
    expect(far.e.st!.dist).toBeGreaterThan(3000);
    expect(near.e.st!.dist).toBeLessThan(700);
    // The long walk costs energy: the far mob gains less on the same feed.
    expect(far.e.st!.adg).toBeLessThan(near.e.st!.adg);
  });

  it.each(DISTRICT_IDS)('%s: no water, everything dies on day 4', (id) => {
    const run = startRun(id, {
      random: pairedRandom(42),
      troughs: [TROUGHS.mid],
      paint: paintAll('green'),
    });
    const dry = run.addHerd('Dry mob', AREAS.big, everyClass(run, 3));
    run.addMob('Watered', AREAS.mid, steers(30));
    const start = dry.e.animals.map((a) => a.wt);
    const notes: number[] = [];
    let alive = 0;
    let died = 0;
    for (let d = 0; d < 4; d++) {
      alive = dry.e.animals.length;
      const out = run.day();
      notes.push(out.results[0]!.notes.filter((n) => n.type === 'noWater').length);
      died = out.deaths.filter((x) => x.cause === 'noWater').length;
      if (d === 0) {
        // 4% of live weight lost on a day without water.
        expect(dry.e.animals[0]!.wt).toBe(start[0]! + -start[0]! * 0.04);
        expect(dry.e.dry).toBe(1);
      }
    }
    // Told on day 1 and on day 3. On day 4 every one of them dies, calves
    // born on the first days included, and the mob is gone.
    expect(notes).toEqual([1, 0, 1, 0]);
    expect(alive).toBeGreaterThan(60);
    expect(died).toBe(alive);
    expect(run.pairs.some((p) => p.m.name === 'Dry mob')).toBe(false);
    expect(run.pairs.some((p) => p.m.name === 'Watered')).toBe(true);
  });

  it('water put back before day 4 saves them, and the count starts again', () => {
    const run = startRun('nsw', { random: constantRandom(0.999999), troughs: [TROUGHS.mid] });
    const pair = run.addMob('Mob 1', AREAS.big, steers(25));
    for (let d = 0; d < 3; d++) run.day();
    expect(pair.e.dry).toBe(3);
    run.move(pair, AREAS.mid);
    run.day();
    expect(pair.e.dry).toBe(0);
    expect(pair.e.animals.length).toBe(25);
    run.move(pair, AREAS.big);
    expect(run.day().results[0]!.notes.some((n) => n.type === 'noWater')).toBe(true);
  });
});

describe('supplements and the feedlot, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: no supplement, lick, hay and pellets on dry feed', (id) => {
    const run = startRun(id, { random: pairedRandom(51), paint: paintAll('dry') });
    const pairs = SUPPLEMENTS.map((supp, k) =>
      run.addHerd(
        `On ${supp}`,
        AREAS[(['strip', 'mid', 'big', 'small'] as const)[k]!],
        everyClass(run, 4),
        supp,
      ),
    );
    const cost: Record<string, number> = {};
    let all = 0;
    for (let d = 0; d < 8; d++) {
      const out = run.day();
      // The first four results are the four mobs. Weaner mobs made on the
      // way come after them.
      out.results.forEach((r, k) => {
        if (k < 4) cost[SUPPLEMENTS[k]!] = (cost[SUPPLEMENTS[k]!] ?? 0) + r.feedCost;
        all += r.feedCost;
      });
    }
    expect(cost.none).toBe(0);
    expect(cost.lick).toBeGreaterThan(0);
    expect(cost.hay).toBeGreaterThan(cost.lick!);
    expect(cost.pellet).toBeGreaterThan(cost.hay!);
    expect(-run.cash).toBeCloseTo(all, 6);
    // Lick lifts intake of dry, low-protein feed.
    expect(pairs[1]!.e.st!.cp).toBeLessThan(7);
    expect(pairs[1]!.e.st!.intake).toBeGreaterThan(pairs[0]!.e.st!.intake);
  });

  it('lick on green feed costs a fifth as much and does not lift intake', () => {
    const cost = (state: PastureStateName): number => {
      const run = startRun('cq', { random: constantRandom(0.999999), paint: paintAll(state) });
      run.addMob('Mob 1', AREAS.mid, steers(10), 'lick');
      return run.day().results[0]!.feedCost;
    };
    expect(cost('dry')).toBeCloseTo(10 * 0.15, 10);
    expect(cost('green')).toBeCloseTo(10 * 0.15 * 0.2, 10);
  });

  it.each(DISTRICT_IDS)('%s: a mob in the feedlot for 30 days', (id) => {
    const run = startRun(id, { random: pairedRandom(52) });
    const lot = run.addHerd('In the lot', 'lot', everyClass(run, 5), 'lick');
    run.addMob('Paddock', AREAS.mid, steers(30));
    let cost = 0;
    for (let d = 0; d < 30; d++) cost += run.day().results[0]!.feedCost;
    expect(cost).toBeGreaterThan(0);
    expect(lot.e.st!.me).toBe(11.6);
    expect(lot.e.st!.cp).toBe(14);
    expect(lot.e.st!.f).toBe(1);
    expect(lot.e.st!.adg).toBeGreaterThan(0.5);
  });

  it('a mob goes into the lot and comes back out', () => {
    const run = startRun('cw', { random: pairedRandom(53) });
    const pair = run.addHerd('Mob 1', AREAS.mid, everyClass(run, 2));
    for (let d = 0; d < 5; d++) run.day();
    run.move(pair, 'lot');
    for (let d = 0; d < 12; d++) run.day();
    run.move(pair, AREAS.big);
    for (let d = 0; d < 5; d++) run.day();
    expect(pair.e.st!.me).toBeLessThan(11.6);
  });
});

describe('several shifts a day, against the MVP', () => {
  const STOPS = [AREAS.small, AREAS.strip, AREAS.mid, AREAS.big];

  it.each([1, 2, 4])('%i move(s) a day around four paddocks for 12 days', (perDay) => {
    for (const id of DISTRICT_IDS) {
      const run = startRun(id, { random: pairedRandom(61) });
      const pair = run.addHerd('Mob 1', AREAS.small, everyClass(run, 5), 'lick');
      run.setShifts(pair, STOPS, perDay);
      for (let d = 0; d < 12; d++) {
        run.grow();
        run.day();
        // The plan moves on by the number of shifts each day.
        pair.m.plan!.idx = (pair.m.plan!.idx + perDay) % STOPS.length;
        run.move(pair, STOPS[pair.m.plan!.idx]!);
      }
      expect(pair.m.plan!.rep.eaten).toBeGreaterThan(0);
      expect(pair.rep.headDays).toBe(pair.m.plan!.rep.headDays);
    }
  });

  it('the day is shared equally: each of 4 stops gives a quarter of the feed', () => {
    const run = startRun('cq', {
      farmHa: 20000,
      random: constantRandom(0.999999),
      paint: paintAll('green'),
    });
    const pair = run.addMob('Mob 1', AREAS.mid, steers(40));
    run.setShifts(pair, [AREAS.strip, AREAS.mid, AREAS.big, AREAS.mid], 4);
    const before = AREA_NAMES.map((name) => feedOn(run, name));
    const res = run.day().results[0]!;
    const taken = AREA_NAMES.map((name, k) => before[k]! - feedOn(run, name));
    const eaten = res.st.demand * res.st.f;
    expect(res.st.f).toBeCloseTo(1, 6);
    // Eaten and trampled: strip and big one share each, mid two shares, the others none.
    const byName = Object.fromEntries(AREA_NAMES.map((name, k) => [name, taken[k]!]));
    expect(byName.tiny).toBe(0);
    expect(byName.small).toBe(0);
    expect(byName.strip! / eaten).toBeGreaterThan(0.25);
    expect(byName.strip! / eaten).toBeLessThan(0.3);
    expect(byName.mid! / byName.strip!).toBeCloseTo(2, 1);
    expect(byName.big! / byName.strip!).toBeCloseTo(1, 1);
  });

  it('two stops and 4 shifts: each paddock is grazed twice in the day', () => {
    const run = startRun('wv', { random: pairedRandom(62) });
    const pair = run.addMob('Mob 1', AREAS.small, steers(120));
    run.setShifts(pair, [AREAS.small, AREAS.strip], 4);
    for (let d = 0; d < 6; d++) run.day();
    expect(pair.e.st!.demand).toBeGreaterThan(0);
  });

  it('a stop with no water is skipped; with one watered stop left the mob grazes where it is', () => {
    // No water in the strip or the big area.
    const troughs = [TROUGHS.tiny, TROUGHS.small, TROUGHS.mid];
    const run = startRun('nsw', { random: pairedRandom(63), troughs });
    const three = run.addMob('Three stops', AREAS.small, steers(60));
    run.setShifts(three, [AREAS.small, AREAS.strip, AREAS.mid, AREAS.big], 4);
    expect(mvp.planSubs(three.m).length).toBe(2);
    const one = run.addMob('One stop', AREAS.tiny, steers(10));
    run.setShifts(one, [AREAS.strip, AREAS.mid, AREAS.big], 4);
    expect(mvp.planSubs(one.m).length).toBe(1);
    const stripBefore = feedOn(run, 'strip');
    const tinyBefore = feedOn(run, 'tiny');
    for (let d = 0; d < 3; d++) run.day();
    expect(feedOn(run, 'strip')).toBe(stripBefore);
    // One watered stop is not a shift: the mob eats in its own area.
    expect(feedOn(run, 'tiny')).toBeLessThan(tinyBefore);
    expect(one.e.dry).toBe(0);
  });

  /** Standing feed in an area, kg DM. */
  function feedOn(run: HerdRun, name: AreaName): number {
    let kg = 0;
    for (const i of regAt(mvp, AREAS[name]).cells) {
      kg += (run.scn.state.G[i]! + run.scn.state.D[i]!) * mvp.HA;
    }
    return kg;
  }
});

describe('grazing sown pasture and crops, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: mobs on planted country for 10 days', (id) => {
    const run = startRun(id, { landUses: true, random: pairedRandom(71), month: 5 });
    run.addHerd('Mob 1', AREAS.big, everyClass(run, 5));
    run.addMob('Mob 2', AREAS.mid, steers(300));
    run.addMob('Mob 3', AREAS.strip, steers(80), 'lick');
    let planted = 0;
    for (let d = 0; d < 10; d++) {
      run.grow();
      for (const r of run.day().results) planted += r.plantingGrazes.length;
    }
    // The crop model is told about every planted square that was grazed.
    expect(planted).toBeGreaterThan(100);
  });
});

describe('MVP faults fixed (BUILD_PLAN 2.4)', () => {
  /** Run one engine day for a mob with nothing random happening. */
  function engineDay(m: CattleMob, place: SimMobInputs['place'], all: CattleMob[] = [m]) {
    const scn = makeScenario(mvp as unknown as Mvp, {
      district: 'cq',
      start: { year: 2023, month: 0 },
    });
    AREA_NAMES.forEach((name) => paintArea(scn, name, 'green'));
    const run = new HerdRun(loaded, scn, { random: constantRandom(0.999999) }, [TROUGHS.mid]);
    const totals = emptyCattleTotals();
    const byId = animalLookup(all);
    const res = simMob(m, {
      place,
      land: landOf(mvp, scn, null),
      day: 10,
      byId,
      ids: { next: 1000 },
      rng: bothStreams(rngFrom(() => 0.999999)),
      healthPerHeadYear: HEALTH_COST_PER_HEAD_YEAR.cq,
      totals,
    });
    return { res, totals, byId, run };
  }

  const animal = (run: HerdRun, key: SaleClassId): Animal => bought(run, 1, { [key]: 1 })[0]!;

  it('a mob sent to the feedlot out of water stops losing weight: the count clears', () => {
    // In the MVP: the count stays at 2 in the lot and the mob keeps losing 4% a day.
    const run = startRun('cq', { random: constantRandom(0.999999), troughs: [TROUGHS.mid] });
    const pair = run.addMob('Mob 1', AREAS.big, steers(10));
    run.day();
    run.day();
    expect(pair.e.dry).toBe(2);
    const before = pair.m.animals[0]!.wt;
    pair.m.loc = 'lot';
    mvp.simMob(pair.m, new Map(pair.m.animals.map((a) => [a.id, a])), []);
    expect(pair.m.dry).toBe(2);
    expect(pair.m.animals[0]!.wt).toBe(before + -before * 0.04);

    // In the engine: the count clears and they gain on the ration.
    const mine = pair.e.animals[0]!.wt;
    const { res } = engineDay(pair.e, { kind: 'lot' });
    expect(pair.e.dry).toBe(0);
    expect(pair.e.animals[0]!.wt).toBeGreaterThan(mine);
    expect(res.st.adg).toBeGreaterThan(pair.m.st!.adg);
    expect(res.deaths.length).toBe(0);
    // Back in a paddock with no water, the count starts from 1 again.
    engineDay(pair.e, { kind: 'paddock', area: areaOf(regAt(mvp, AREAS.big)) });
    expect(pair.e.dry).toBe(1);
  });

  it('four dry days then the lot: the MVP kills the mob in the lot, the engine does not', () => {
    const run = startRun('cq', { random: constantRandom(0.999999), troughs: [TROUGHS.mid] });
    const pair = run.addMob('Mob 1', AREAS.big, steers(6));
    for (let d = 0; d < 3; d++) run.day();
    pair.m.dry = 4;
    pair.e.dry = 4;
    pair.m.loc = 'lot';
    const dead: [unknown, unknown, string][] = [];
    mvp.simMob(pair.m, new Map(pair.m.animals.map((a) => [a.id, a])), dead as never);
    expect(dead.length).toBe(6);
    const { res } = engineDay(pair.e, { kind: 'lot' });
    expect(res.deaths.length).toBe(0);
  });

  it('a cow whose calf dies is dried off', () => {
    const scratch = startRun('cq');
    const cow = animal(scratch, 'dryCow');
    const calf = animal(scratch, 'weanerSteer');
    Object.assign(cow, { calf: calf.id, lact: 40, cond: 3 });
    Object.assign(calf, { kind: 'calf', dam: cow.id, age: 40, wt: 70, cond: 1 });
    const m = createCattleMob();
    m.animals = [cow, calf];
    const totals = emptyCattleTotals();
    const byId = animalLookup([m]);
    // The calf dies today (CS 1, and the draw is under its chance of dying).
    const res = simMob(m, {
      place: { kind: 'lot' },
      land: landOf(mvp, scratch.scn, null),
      day: 10,
      byId,
      ids: { next: 1000 },
      rng: bothStreams(rngFrom(() => 0.005)),
      healthPerHeadYear: 20,
      totals,
    });
    expect(res.deaths.map((d) => [d.animal.id, d.cause])).toEqual([[calf.id, 'poorCondition']]);
    // Until the deaths are settled she still has the calf on her.
    expect(cow.calf).toBe(calf.id);
    settleDeaths([m], res.deaths, byId, totals);
    expect(m.animals).toEqual([cow]);
    expect([cow.calf, cow.lact]).toEqual([0, -1]);
    expect(totals.deaths).toBe(1);
    // Next day she is a dry cow: no milk, and no extra appetite.
    const wt = cow.wt;
    const next = simMob(m, {
      place: { kind: 'lot' },
      land: landOf(mvp, scratch.scn, null),
      day: 11,
      byId: animalLookup([m]),
      ids: { next: 1000 },
      rng: bothStreams(rngFrom(() => 0.999999)),
      healthPerHeadYear: 20,
      totals,
    });
    expect(cow.milk).toBe(0);
    expect(next.st.intake).toBe(cow.di);
    expect(cow.di).toBe(wt * (wt < 450 ? 0.027 : 0.024));
  });

  it('a cow whose calf dies in another mob is dried off too, and a dam with a newer calf is left alone', () => {
    const scratch = startRun('cq');
    const cow = animal(scratch, 'dryCow');
    const calf = animal(scratch, 'weanerSteer');
    const other = animal(scratch, 'dryCow');
    const old = animal(scratch, 'weanerHeifer');
    Object.assign(cow, { calf: calf.id, lact: 40 });
    Object.assign(calf, { kind: 'calf', dam: cow.id, age: 40, dead: true });
    // `old` still names `other` as its dam, but she has a newer calf at foot.
    Object.assign(other, { calf: 9999, lact: 5 });
    Object.assign(old, { kind: 'calf', dam: other.id, age: 250, dead: true });
    const cows = createCattleMob();
    cows.animals = [cow, other];
    const calves = createCattleMob();
    calves.animals = [calf, old];
    const totals = emptyCattleTotals();
    settleDeaths(
      [cows, calves],
      [
        { animal: calf, cause: 'natural' },
        { animal: old, cause: 'natural' },
      ],
      animalLookup([cows, calves]),
      totals,
    );
    expect([cow.calf, cow.lact]).toEqual([0, -1]);
    expect([other.calf, other.lact]).toEqual([9999, 5]);
    expect(calves.animals.length).toBe(0);
    expect(totals.deaths).toBe(2);
  });

  it('a calf whose dam dies is an orphan: weaned at 100 days, at risk before (as in the MVP)', () => {
    // Two cows with calves. The first cow is at CS 1. Her calf is 60 days old.
    // The draws, in order. Day 1: thin cow dies (0.005), the other cow lives,
    // the orphan survives its 2% risk, then both calves live. Day 2: the cow
    // lives, the orphan survives its risk and lives, the other calf lives.
    // Day 3: the same, but the orphan is weaned, so it has no risk to draw.
    const day1 = [0.005, 0.9, 0.9, 0.9, 0.9];
    const day2 = [0.9, 0.9, 0.9, 0.9];
    const day3 = [0.9, 0.9, 0.9];
    const run = startRun('cq', {
      random: scriptedRandom([...day1, ...day2, ...day3]),
      paint: paintAll('green'),
    });
    const herd = bought(run, 4, { cowCalf: 2 });
    herd[0]!.cond = 1;
    herd[1]!.age = 60;
    herd[0]!.lact = 60;
    const pair = run.addHerd('Mob 1', AREAS.mid, herd);
    const orphan = pair.e.animals[1]!;
    const out = run.day();
    expect(out.deaths.map((d) => [d.animal.id, d.cause])).toEqual([[herd[0]!.id, 'poorCondition']]);
    // Settling the deaths clears the calf's dam, so it is an orphan from now on.
    expect([orphan.kind, orphan.dam]).toEqual(['calf', 0]);
    run.day();
    expect(orphan.kind).toBe('calf');
    // At 100 days old it is weaned where it stands.
    orphan.age = 99;
    pair.m.animals.find((a) => a.id === orphan.id)!.age = 99;
    const next = run.day();
    expect(next.results[0]!.weaned.map((a) => a.id)).toEqual([orphan.id]);
    expect(orphan.kind).not.toBe('calf');
    expect(run.random.counts().engine).toBe(12);
  });

  it('an orphan under 100 days has a 2% chance of dying each day', () => {
    const scratch = startRun('cq');
    const day = (draw: number, age: number): string[] => {
      const calf = animal(scratch, 'weanerHeifer');
      Object.assign(calf, { kind: 'calf', dam: 0, age, wt: 80, cond: 3 });
      const m = createCattleMob();
      m.animals = [calf];
      const res = simMob(m, {
        place: { kind: 'lot' },
        land: landOf(mvp, scratch.scn, null),
        day: 10,
        byId: animalLookup([m]),
        ids: { next: 1000 },
        rng: bothStreams(rngFrom(() => draw)),
        healthPerHeadYear: 20,
        totals: emptyCattleTotals(),
      });
      return [...res.deaths.map((d) => d.cause), ...res.weaned.map(() => 'weaned')];
    };
    expect(day(0.0199, 50)).toEqual(['orphaned']);
    expect(day(0.02, 50)).toEqual([]);
    // 99 days old today becomes 100 during the day, and is weaned instead.
    expect(day(0.0199, 99)).toEqual(['weaned']);
    expect(day(0.0199, 98)).toEqual(['orphaned']);
  });
});

describe('what the daily cattle step hands back', () => {
  it('keeps breeding and deaths on their own random streams', () => {
    const scratch = startRun('cq', { paint: paintAll('green') });
    const herd = bought(scratch, 5, { dryCow: 40, joinHeifer: 20, bull: 2 });
    const run = (deathsSeed: number): { preg: number[]; dead: number[] } => {
      const m = createCattleMob();
      m.animals = herd.map((a) => ({ ...a }));
      const rng = {
        breeding: rngStream(1, 'breeding'),
        deaths: rngStream(deathsSeed, 'deaths'),
      };
      const dead: number[] = [];
      for (let day = 0; day < 30; day++) {
        // Very thin every day, so some die and few conceive.
        for (const a of m.animals) if (a.kind !== 'bull') a.cond = 1.05;
        const res = simMob(m, {
          place: { kind: 'lot' },
          land: landOf(mvp, scratch.scn, null),
          day,
          byId: animalLookup([m]),
          ids: { next: 5000 },
          rng,
          healthPerHeadYear: 20,
          totals: emptyCattleTotals(),
        });
        // Keep the dead in the mob so both runs make the same breeding draws.
        for (const d of res.deaths) {
          dead.push(d.animal.id);
          d.animal.dead = false;
        }
      }
      return { preg: m.animals.map((a) => a.preg), dead };
    };
    const a = run(1);
    const b = run(2);
    expect(a.dead.length).toBeGreaterThan(2);
    expect(a.dead).not.toEqual(b.dead);
    // A different deaths stream does not change who got in calf, or when.
    expect(a.preg.some((p) => p >= 0)).toBe(true);
    expect(a.preg).toEqual(b.preg);
  });

  it('adds the day to the year totals, and reports the feed cost for cash', () => {
    const run = startRun('cq', { random: constantRandom(0.999999), paint: paintAll('dry') });
    const pair = run.addMob('Mob 1', AREAS.mid, steers(20), 'hay');
    const res = run.day().results[0]!;
    expect(res.feedCost).toBeCloseTo(20 * 3 * 0.28, 10);
    expect(run.totals.feed).toBe(res.feedCost);
    expect(run.totals.eaten).toBeCloseTo(res.planDay.eaten, 6);
    expect(res.planDay.headDays).toBe(20);
    expect(run.totals.gain).toBe(res.planDay.gain);
    // Each animal carries its own running cost: the hay plus a day of health costs.
    expect(pair.e.animals[0]!.cost).toBe(0 + 3 * 0.28 + 20 / 365);
    expect(pair.e.st).toBe(res.st);
  });
});
