import { describe, expect, it } from 'vitest';
import { applyInstantly } from '../../test-support/instant';
import { heldRun, testMob, testSheep } from '../../test-support/sheep';
import { across } from '../../test-support/workingDay';
import { SHEEP_RATION } from '../data/sheep';
import { SHEARING_RATE, woolPriceCKg } from '../data/sheepMarket';
import { DSE_PER_AE, MVP_DSE_PER_AE } from '../data/stocking';
import { GRID_W } from '../grid';
import { COST_PER_M, NETTING_PER_M, segmentCost } from '../money/costs';
import { netWorth, scoreYear } from '../money/worth';
import { loadFarm, saveFarm } from '../save/save';
import { createFarm } from '../sim/create';
import { dateAt } from '../calendar';
import { surveyOf } from '../sim/derived';
import type { FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { addSheepMob, occupiedAreas, sheepJobDates, sheepMobsOf } from './farm';
import { heldDiet } from './graze';
import { sheepBuyPrice, sheepWorth, woolValue } from './market';
import { fenceKindsRead, nettingEdges, sheepMarketRead } from './reads';
import { headOf } from './simFlock';

/* Sheep in the game (milestone 2.4, engine half): feeding, contractors, money, the market, netting and the setup choice. */

function farmWithSheep(seed = 5): FarmState {
  const farm = createFarm({
    seed,
    district: 'wv',
    size: 'small',
    start: { year: 2021, month: 2 },
    startType: 'running',
    difficulty: 'easy',
  });
  const s = surveyOf(farm);
  const occ = occupiedAreas(farm, s);
  const r = s.topology.areas.find((a) => !occ.has(a.id) && s.points.areaTroughs[a.id]!.length > 0)!;
  const added = addSheepMob(farm, s, {
    cell: s.points.areaTroughs[r.id]![0]!,
    breed: 'merino',
    groups: [{ cls: 'wether', head: 300 }],
  });
  if (!added.ok) throw new Error(added.reason);
  return farm;
}

describe('feeding sheep', () => {
  const poor = heldDiet(150, 0.55, 1200, 6);
  const run = (feed: 'none' | 'lick' | 'grain' | 'hay'): { wt: number; cost: number } => {
    const m = testMob([testSheep({ sex: 'W', n: 100 })]);
    m.feed = feed;
    let cost = 0;
    heldRun(m, 30, { diet: poor, seed: 2, each: (_d, r) => (cost += r.feedCost) });
    return { wt: m.sheep.reduce((t, s) => t + s.wt * s.n, 0) / headOf(m.sheep), cost };
  };
  it('grain and hay fill the gap on poor feed, at a cost; a lick lifts intake of dry feed', () => {
    const none = run('none');
    const grain = run('grain');
    const hay = run('hay');
    const lick = run('lick');
    expect(none.cost).toBe(0);
    expect(grain.wt).toBeGreaterThan(none.wt);
    expect(hay.wt).toBeGreaterThan(none.wt);
    expect(lick.wt).toBeGreaterThan(none.wt);
    expect(grain.cost).toBeGreaterThan(0);
    // Never more than the full ration: 100 wethers for 30 days, a little over 45 kg each.
    expect(grain.cost).toBeLessThanOrEqual(100 * 30 * SHEEP_RATION.grain.kgDay.dry * 1.2 * 0.5);
  });
  it('fed sheep on plenty of good feed need nothing, so cost nothing', () => {
    const m = testMob([testSheep({ sex: 'W', n: 100 })]);
    m.feed = 'grain';
    let cost = 0;
    heldRun(m, 10, { diet: heldDiet(2500, 0.72), each: (_d, r) => (cost += r.feedCost) });
    expect(cost).toBe(0);
  });
});

describe('contractors: shearing and crutching on their days', () => {
  it('shear on the day by themselves: fleece off, wool sold, contractors paid, fly cover given', () => {
    const farm = farmWithSheep();
    const m = sheepMobsOf(farm)[0]!;
    // Shear in 200 days.
    const on = dateAt(farm.start, 200);
    m.shearOn = { month: on.month, date: on.date };
    m.crutchOn = null;
    let shorn:
      Extract<ReturnType<typeof stepDay>['events'][number], { type: 'sheep-shorn' }> | undefined;
    for (let d = 0; d <= 200; d++) {
      for (const e of stepDay(farm).events) if (e.type === 'sheep-shorn') shorn = e;
    }
    expect(shorn).toBeDefined();
    expect(shorn!.cost).toBeCloseTo(shorn!.head * SHEARING_RATE.sheep, 6);
    expect(shorn!.woolIncome).toBeCloseTo((shorn!.cleanKg * woolPriceCKg(shorn!.micron)) / 100, 6);
    expect(shorn!.cleanKg / shorn!.head).toBeGreaterThan(1.5);
    expect(farm.year.wool ?? 0).toBeCloseTo(shorn!.woolIncome, 6);
    for (const s of sheepMobsOf(farm)[0]!.sheep) {
      expect(s.woolDays).toBeLessThanOrEqual(1);
      expect(s.flyCover).toBeGreaterThan(30);
    }
  });

  it('default days follow the joining: crutch 60 days before lambing, shear 80 after', () => {
    const d = sheepJobDates({ month: 3, date: 1 });
    // 1 April + 147 + 80 = 14 November; 1 April + 87 = 27 June.
    expect(d.shearOn).toEqual({ month: 10, date: 14 });
    expect(d.crutchOn).toEqual({ month: 5, date: 27 });
  });

  it('the dates and the feed are set by actions, and refused when wrong', () => {
    const farm = farmWithSheep();
    const mob = sheepMobsOf(farm)[0]!.id;
    const a = applyInstantly(farm, {
      type: 'setSheepDates',
      mob,
      shear: { month: 8, date: 10 },
      crutch: null,
    });
    expect(a.ok).toBe(true);
    if (a.ok) {
      const m = sheepMobsOf(a.farm)[0]!;
      expect(m.shearOn).toEqual({ month: 8, date: 10 });
      expect(m.crutchOn).toBeNull();
    }
    expect(
      applyInstantly(farm, { type: 'setSheepDates', mob, shear: { month: 1, date: 29 } }).ok,
    ).toBe(false);
    expect(applyInstantly(farm, { type: 'setSheepFeed', mob, feed: 'grain' }).ok).toBe(true);
    expect(applyInstantly(farm, { type: 'setSheepFeed', mob: 999, feed: 'grain' }).ok).toBe(false);
  });
});

describe('the sheep market', () => {
  it('buys sheep into an empty paddock, into the sheep there, never where cattle are, never in Central Queensland', () => {
    const farm = farmWithSheep();
    const s = surveyOf(farm);
    const sheepCell = sheepMobsOf(farm)[0]!.where;
    const cattle = farm.mobs.find((m) => m.where.kind === 'paddock')!;
    const anchor = (w: typeof sheepCell): number => (w.kind === 'paddock' ? w.anchor : 0);
    const into = applyInstantly(farm, {
      type: 'buySheep',
      cls: 'merinoEwes',
      qty: 50,
      to: { cell: anchor(sheepCell) },
    });
    expect(into.ok).toBe(true);
    if (into.ok) {
      expect(headOf(sheepMobsOf(into.farm)[0]!.sheep)).toBe(350);
      const paid = farm.cash - into.farm.cash;
      expect(paid).toBeCloseTo(50 * (sheepBuyPrice('merinoEwes') + 3), 6);
    }
    const bad = applyInstantly(farm, {
      type: 'buySheep',
      cls: 'merinoEwes',
      qty: 5,
      to: { cell: anchor(cattle.where) },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('sheep-there');
    void s;
    const cq = createFarm({
      seed: 1,
      district: 'cq',
      size: 'small',
      start: { year: 2021, month: 2 },
      startType: 'scratch',
      difficulty: 'easy',
    });
    expect(
      applyInstantly(cq, {
        type: 'buySheep',
        cls: 'merinoEwes',
        qty: 5,
        to: { cell: cq.layout.water.bore },
      }).ok,
    ).toBe(false);
    expect(sheepMarketRead(cq).offered).toBe(false);
  });

  it('sells sheep at the mutton indicator less commission and the head fee', () => {
    const farm = farmWithSheep();
    const mob = sheepMobsOf(farm)[0]!.id;
    const done = applyInstantly(farm, { type: 'sellSheep', mob, cls: 'wether', qty: 100 });
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(headOf(sheepMobsOf(done.farm)[0]!.sheep)).toBe(200);
      const got = done.farm.cash - farm.cash;
      expect(got).toBeGreaterThan(100 * 50);
      expect(got).toBeLessThan(100 * 400);
    }
    expect(applyInstantly(farm, { type: 'sellSheep', mob, cls: 'lamb', qty: 1 }).ok).toBe(false);
  });

  it('counts sheep in net worth at what they would fetch', () => {
    const farm = farmWithSheep();
    const without = { ...farm, sheep: undefined } as FarmState;
    expect(netWorth(farm) - netWorth(without)).toBeCloseTo(sheepWorth(farm.sheep!.mobs), 6);
  });

  it('wool fetches more for finer wool, a straight line between the guides', () => {
    expect(woolPriceCKg(18.5)).toBeCloseTo((2443 + 2178) / 2, 6);
    expect(woolValue(4, 19)).toBeCloseTo(4 * 21.78, 6);
    expect(woolPriceCKg(35)).toBe(605);
  });
});

describe('netting fence', () => {
  it('is a fence kind at the stand-in price, holds sheep, and the map can tell it apart', () => {
    const farm = createFarm({
      seed: 2,
      district: 'nsw',
      size: 'small',
      start: { year: 2021, month: 2 },
      startType: 'scratch',
      difficulty: 'easy',
      money: { cash: 1e6, overdraft: -1e6, broke: -1e7 },
    });
    const done = applyInstantly(farm, {
      type: 'buildFence',
      edges: across(10, 0, 9),
      fence: 'netting',
    });
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(farm.cash - done.farm.cash).toBeCloseTo(
        10 * segmentCost('netting', farm.layout.scale.sideM),
        6,
      );
      expect(nettingEdges(done.farm).length).toBe(10);
    }
    expect(NETTING_PER_M).toBeGreaterThan(COST_PER_M.permanent);
    const kinds = fenceKindsRead();
    expect(kinds.find((k) => k.kind === 'netting')!.holdsSheep).toBe(true);
    expect(kinds.filter((k) => k.holdsSheep).length).toBe(1);
    void GRID_W;
  });
});

describe('the cattle, sheep or mix choice at setup', () => {
  const make = (stock: 'cattle' | 'sheep' | 'mix') =>
    createFarm({
      seed: 7,
      district: 'cw',
      size: 'medium',
      start: { year: 2021, month: 2 },
      startType: 'running',
      difficulty: 'easy',
      stock,
    });
  it('sheep: a start flock and no cattle; mix: both, in separate paddocks; cattle: as before', () => {
    const sheep = make('sheep');
    expect(sheep.mobs.length).toBe(0);
    expect(headOf(sheepMobsOf(sheep)[0]!.sheep)).toBeGreaterThan(100);
    const mix = make('mix');
    expect(mix.mobs.length).toBeGreaterThan(0);
    expect(sheepMobsOf(mix).length).toBe(1);
    const cattle = make('cattle');
    expect(cattle.sheep).toBeUndefined();
    const plain = createFarm({
      seed: 7,
      district: 'cw',
      size: 'medium',
      start: { year: 2021, month: 2 },
      startType: 'running',
      difficulty: 'easy',
    });
    expect(JSON.stringify(saveFarm(cattle))).toBe(JSON.stringify(saveFarm(plain)));
  });
  it('sheep are never offered in Central Queensland', () => {
    expect(() =>
      createFarm({
        seed: 1,
        district: 'cq',
        size: 'small',
        start: { year: 2021, month: 2 },
        startType: 'running',
        difficulty: 'easy',
        stock: 'sheep',
      }),
    ).toThrow();
  });
});

describe('sheep in the score and the saves', () => {
  it('a sheep death counts as one DSE share of a beast in the year score', () => {
    const base = {
      worth0: 0,
      grown: 1000,
      eaten: 500,
      gain: 0,
      deaths: 2,
      covers: [80],
      worth1: 0,
    };
    const a = scoreYear({ ...base }, 80);
    const b = scoreYear({ ...base, sheepDeaths: 84 }, 80);
    const c = scoreYear({ ...base, deaths: 12 }, 80);
    expect(b.deathPts).toBeCloseTo(c.deathPts, 9);
    expect(a.deathPts).toBeGreaterThan(b.deathPts);
  });
  it('one DSE figure for every display: 8.4 (the MVP showed 8)', () => {
    expect(DSE_PER_AE).toBe(8.4);
    expect(MVP_DSE_PER_AE).toBe(8);
  });
  it('a format 10 sheep mob loads with no feed and its district shearing days', () => {
    const farm = farmWithSheep();
    const saved = saveFarm(farm) as Record<string, unknown>;
    saved.saveFormat = 10;
    const sheep = saved.sheep as { mobs: Record<string, unknown>[] };
    for (const m of sheep.mobs) {
      delete m.feed;
      delete m.shearOn;
      delete m.crutchOn;
      delete m.lastBreak;
    }
    const loaded = loadFarm(saved as never);
    const m = sheepMobsOf(loaded)[0]!;
    expect(m.feed).toBe('none');
    expect(m.shearOn).toEqual(sheepJobDates(m.joinOn).shearOn);
    expect(m.lastBreak).toBeNull();
  });
});
