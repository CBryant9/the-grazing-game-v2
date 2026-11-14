import { describe, expect, it } from 'vitest';
import { loadFarm, saveFarm, farmHash } from '../save/save';
import { sheepMobsOf } from '../sheep/farm';
import { headOf } from '../sheep/simFlock';
import { createFarm } from './create';
import { areaIdOf, surveyOf } from './derived';
import type { TickEvent } from './events';
import type { FarmState, YearTotals } from './state';
import { stepDay } from './tick';

/*
 * A mixed farm (cattle and sheep) left alone for two years: the probe from
 * the m2.7 engine join (docs/CALIBRATION.md, the m2.7 entry). It holds that
 * the two species never share a paddock, that nothing is eaten twice (the
 * pasture the mixed farm eats is what its cattle alone and its sheep alone
 * eat on the same farm), that the year totals add up to the change in
 * cash, that both species breed and wean, and that a seed plays the same
 * twice.
 */

const DAYS = 730;

function mixedFarm(): FarmState {
  return createFarm({
    seed: 11,
    district: 'wv',
    size: 'medium',
    start: { year: 2021, month: 2 },
    startType: 'running',
    difficulty: 'easy',
    stock: 'mix',
  });
}

interface Run {
  farm: FarmState;
  cash0: number;
  births: number;
  weaned: number;
  lambs: number;
  sheepWeaned: number;
  shared: number;
  yearEnds: number;
}

function run(farm: FarmState): Run {
  const r: Run = {
    farm,
    cash0: farm.cash,
    births: 0,
    weaned: 0,
    lambs: 0,
    sheepWeaned: 0,
    shared: 0,
    yearEnds: 0,
  };
  for (let d = 0; d < DAYS; d++) {
    for (const e of stepDay(farm).events) {
      if (e.type === 'births') r.births += e.count;
      else if (e.type === 'weaned') r.weaned += e.count;
      else if (e.type === 'lambs-born') r.lambs += e.count;
      else if (e.type === 'sheep-weaned') r.sheepWeaned += e.count;
      else if (e.type === 'year-end') r.yearEnds++;
    }
    const s = surveyOf(farm);
    const cattle = new Set<number>();
    for (const m of farm.mobs)
      if (m.where.kind === 'paddock' && m.animals.length) cattle.add(areaIdOf(s, m));
    for (const m of sheepMobsOf(farm))
      if (m.where.kind === 'paddock' && m.sheep.length && cattle.has(areaIdOf(s, m))) r.shared++;
  }
  return r;
}

/** Cash in less cash out, from the year lines. */
const net = (y: YearTotals): number =>
  y.sales +
  (y.wool ?? 0) +
  (y.sheepSales ?? 0) +
  y.grain +
  y.interest -
  y.buys -
  (y.sheepBuys ?? 0) -
  y.feed -
  y.crops -
  y.infra -
  y.running;

describe('a mixed farm left alone for two years (Western Victoria)', () => {
  const start = mixedFarm();
  const mixed = run(loadFarm(saveFarm(start)));

  it('runs two years with both species on it', () => {
    expect(mixed.farm.day).toBe(DAYS);
    expect(mixed.yearEnds).toBe(2);
    expect(mixed.farm.mobs.some((m) => m.animals.some((a) => !a.dead))).toBe(true);
    expect(headOf(sheepMobsOf(mixed.farm).flatMap((m) => m.sheep))).toBeGreaterThan(0);
  });

  it('never has cattle and sheep in one paddock', () => {
    expect(mixed.shared).toBe(0);
  });

  it('calves and lambs are born and weaned', () => {
    expect(mixed.births).toBeGreaterThan(0);
    expect(mixed.weaned).toBeGreaterThan(0);
    expect(mixed.lambs).toBeGreaterThan(0);
    expect(mixed.sheepWeaned).toBeGreaterThan(0);
  });

  it('the year lines add up to the change in cash', () => {
    const f = mixed.farm;
    const lines = f.years.reduce((t, y) => t + net(y), 0) + net(f.year);
    expect(f.cash - mixed.cash0).toBeCloseTo(lines, 4);
  });

  /*
   * Nothing eaten twice, square by square. Each day the mixed farm's green
   * and dead feed on every square equal the cattle-only farm's on the
   * squares its cattle graze and the sheep-only farm's on the squares its
   * sheep graze, and both on squares nobody grazes. This holds for as long
   * as the three farms can be kept in step: until a weaning sends weaners
   * somewhere else (weaners go to an empty watered paddock, and which are
   * empty depends on where the other species is; on this farm the first
   * lambs, on day 276, go to Paddock 1 with the cattle there and to
   * Paddock 6 without them).
   *
   * And the intake really comes off the pasture, once: on a day of each
   * season, the feed on the farm the same day with no stock on it, less the
   * feed with the stock, summed square by square in kg DM, is what the stock
   * ate that day (the year's eaten) plus what they trampled.
   */
  it('nothing is eaten twice: square by square, each species takes only its own paddock', () => {
    const m = loadFarm(saveFarm(start));
    const c = loadFarm(saveFarm(start));
    delete c.sheep;
    const s = loadFarm(saveFarm(start));
    s.mobs = [];
    const intoOf = (events: TickEvent[], type: 'weaned' | 'sheep-weaned'): string =>
      JSON.stringify(events.flatMap((e) => (e.type === type ? [e.into?.area ?? null] : [])));
    let days = 0;
    let bad = 0;
    let cattleSquares = 0;
    let sheepSquares = 0;
    for (; days < DAYS; days++) {
      // Who stands where this morning, on the mixed farm, and tonight (weaners are moved
      // before the day's grazing): 1 cattle, 2 sheep.
      const sv = surveyOf(m);
      const own = new Int8Array(sv.topology.areas.length);
      const mark = (): void => {
        for (const x of m.mobs)
          if (x.where.kind === 'paddock' && x.animals.length) {
            const k = areaIdOf(sv, x);
            own[k] = own[k]! | 1;
          }
        for (const x of sheepMobsOf(m))
          if (x.where.kind === 'paddock' && x.sheep.length) {
            const k = areaIdOf(sv, x);
            own[k] = own[k]! | 2;
          }
      };
      mark();
      const em = stepDay(m).events;
      mark();
      const ec = stepDay(c).events;
      const es = stepDay(s).events;
      if (
        intoOf(em, 'weaned') !== intoOf(ec, 'weaned') ||
        intoOf(em, 'sheep-weaned') !== intoOf(es, 'sheep-weaned')
      )
        break;
      for (let i = 0; i < m.pasture.G.length; i++) {
        const area = sv.topology.areaOf[i]!;
        const who = area >= 0 ? own[area]! : 0;
        const ref = who === 1 ? c : who === 2 ? s : null;
        if (who === 1) cattleSquares++;
        if (who === 2) sheepSquares++;
        const same = (f: FarmState): boolean =>
          m.pasture.G[i] === f.pasture.G[i] && m.pasture.D[i] === f.pasture.D[i];
        const ok = who === 3 ? same(c) || same(s) : ref ? same(ref) : same(c) && same(s);
        if (!ok) bad++;
      }
    }
    expect(days).toBeGreaterThan(200);
    expect(cattleSquares).toBeGreaterThan(0);
    expect(sheepSquares).toBeGreaterThan(0);
    expect(bad).toBe(0);
  });

  it('what the stock eat comes off the pasture, once', () => {
    const f = loadFarm(saveFarm(start));
    const checked: number[] = [];
    for (let d = 0; d < DAYS && checked.length < 4; d++) {
      if (d % 91 === 45) {
        const bare = loadFarm(saveFarm(f));
        bare.mobs = [];
        delete bare.sheep;
        const eaten0 = f.year.eaten;
        const year0 = f.years.length;
        stepDay(f);
        stepDay(bare);
        const eaten =
          f.years.length > year0
            ? f.years.at(-1)!.eaten - eaten0 + f.year.eaten
            : f.year.eaten - eaten0;
        const ha = f.layout.scale.haPerSquare;
        let lost = 0;
        for (let i = 0; i < f.pasture.G.length; i++) {
          lost +=
            (bare.pasture.G[i]! + bare.pasture.D[i]! - f.pasture.G[i]! - f.pasture.D[i]!) * ha;
        }
        expect(eaten).toBeGreaterThan(0);
        // Trampling knocks down extra dead feed with what is eaten: 4 to 16% of it (MODEL,
        // grazing). So the feed lost is what was eaten and up to 16% more: never less, never twice.
        expect(lost / eaten).toBeGreaterThanOrEqual(1 - 1e-6);
        expect(lost / eaten).toBeLessThanOrEqual(1.16 + 1e-6);
        checked.push(d);
      } else stepDay(f);
    }
    expect(checked.length).toBe(4);
  });

  it('plays the same twice on the same seed', () => {
    expect(farmHash(run(mixedFarm()).farm)).toBe(farmHash(mixed.farm));
  });
});
