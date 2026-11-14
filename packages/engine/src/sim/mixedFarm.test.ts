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

const eatenOver = (f: FarmState): number => f.years.reduce((t, y) => t + y.eaten, 0) + f.year.eaten;

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
   * Day by day, the mixed farm eats what the same farm eats with only its
   * cattle plus what it eats with only its sheep. This holds until a
   * weaning sends weaners somewhere else: they go to an empty watered
   * paddock, and which paddocks are empty depends on where the other
   * species is (on this farm the first lambs, on day 276, go to Paddock 1
   * with the cattle there and to Paddock 6 without them). From then the farms differ by where stock stand, not by
   * anything eaten twice; the shared-paddock test above covers the rest.
   */
  it('eats what its cattle alone and its sheep alone eat: nothing twice', () => {
    const m = loadFarm(saveFarm(start));
    const c = loadFarm(saveFarm(start));
    delete c.sheep;
    const s = loadFarm(saveFarm(start));
    s.mobs = [];
    let days = 0;
    const intoOf = (events: TickEvent[], type: 'weaned' | 'sheep-weaned'): string =>
      JSON.stringify(events.flatMap((e) => (e.type === type ? [e.into?.area ?? null] : [])));
    for (; days < DAYS; days++) {
      const em = stepDay(m).events;
      const ec = stepDay(c).events;
      const es = stepDay(s).events;
      if (
        intoOf(em, 'weaned') !== intoOf(ec, 'weaned') ||
        intoOf(em, 'sheep-weaned') !== intoOf(es, 'sheep-weaned')
      )
        break;
      expect(eatenOver(m)).toBeCloseTo(eatenOver(c) + eatenOver(s), 6);
    }
    expect(days).toBeGreaterThan(200);
    expect(eatenOver(c)).toBeGreaterThan(0);
    expect(eatenOver(s)).toBeGreaterThan(0);
  });

  it('plays the same twice on the same seed', () => {
    expect(farmHash(run(mixedFarm()).farm)).toBe(farmHash(mixed.farm));
  });
});
