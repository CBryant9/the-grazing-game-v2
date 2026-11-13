import { describe, expect, it, vi } from 'vitest';
import { toMvpEdge, type MvpFarm } from '../../test-support/mvpFarm';
import { WholeFarmRun, loadMvpWhole } from '../../test-support/mvpWhole';
import { PLENTY, act, twoPaddockFarm } from '../../test-support/wholeFarm';
import { aeOf, classOf } from '../cattle/animal';
import { EDGE, type EdgeRef } from '../farm/topology';
import { GRID_N } from '../grid';
import { netSaleValue } from '../market/prices';
import { carryingCapacityAE } from '../money/costs';
import { infraInPlace, liveYear, netWorth, scoreYear } from '../money/worth';
import { coverPct } from '../pasture/summary';
import { createFarm } from './create';
import { pricesOf, seasonsOf, surveyOf } from './derived';
import type { FarmEvent } from './events';
import { calibrationView, farmTotals, mobSummaries, paddockSummaries, pregTests } from './summary';
import { stepDay } from './tick';

vi.setConfig({ testTimeout: 600_000 });

const loaded = loadMvpWhole();

describe('paddock summaries, against the MVP padStats on a whole farm', () => {
  it('every figure for every paddock is the same, with stock shared across paddocks joined by a gate', () => {
    let farm = createFarm({
      seed: 14,
      district: 'cw',
      size: 'small',
      start: { year: 2023, month: 5 },
      startType: 'running',
      mixed: { arablePct: 40, croppedPct: 50 },
      difficulty: 'easy',
      money: { ...PLENTY },
    });
    const run = new WholeFarmRun(loaded, farm, 5);
    run.compare = { skipNextTag: true };
    const compare = (when: string): void => {
      const mvp = run.mvp as unknown as MvpFarm;
      const views = paddockSummaries(run.farm);
      expect(views.length).toBe(mvp.PADS.length);
      views.forEach((v, i) => {
        const m = mvp.padStats(mvp.PADS[i]!);
        const mine = {
          g: v.g,
          d: v.d,
          mass: v.mass,
          green: v.green,
          age: v.age,
          x: v.x,
          me: v.me,
          cp: v.cp,
          rest: v.rest,
          cover: v.cover,
          height: v.height,
          leafH: v.leafH,
          ae: v.ae,
          head: v.head,
          grow: v.grow,
          eat: v.eat,
          rate: v.rate,
          cc: v.cc,
          feedDays: v.feedDays,
          zone: v.label,
          ha: v.ha,
        };
        expect(mine, `${v.name} ${when}`).toEqual(m);
        expect(v.name).toBe(mvp.PADS[i]!.name);
        expect(v.dsePerHa).toBe(v.rate * 8);
      });
    };
    run.days(25);
    compare('after 25 days');
    // Open the first gate: the paddocks either side now share their stock by area.
    farm = run.farm;
    const v = farm.layout.fences.vE.indexOf(EDGE.gateShut);
    const edge: EdgeRef =
      v >= 0
        ? { line: 'v', index: v }
        : { line: 'h', index: farm.layout.fences.hE.indexOf(EDGE.gateShut) };
    run.act({ type: 'setGate', edge, open: true }, (m) =>
      (m as unknown as MvpFarm).toggleGate(toMvpEdge(edge)),
    );
    run.days(10);
    compare('with a gate open');
    const views = paddockSummaries(run.farm);
    const joined = views.filter((p) => p.area.startsWith('Paddocks '));
    expect(joined.length).toBe(2);
    expect(joined[0]!.areaId).toBe(joined[1]!.areaId);
    expect(joined[0]!.mobs).toEqual(joined[1]!.mobs);
    // The stock on a joined area are counted once across its paddocks.
    const area = surveyOf(run.farm).topology.areas[joined[0]!.areaId]!;
    const mob = run.farm.mobs.find((m) => joined[0]!.mobs.includes(m.id));
    if (mob) {
      const ae = mob.animals.reduce((s, a) => s + aeOf(a), 0);
      expect(joined[0]!.ae + joined[1]!.ae).toBeCloseTo(ae, 9);
      expect(joined[0]!.ae / joined[1]!.ae).toBeCloseTo(joined[0]!.ha / joined[1]!.ha, 9);
      expect(joined[0]!.ha + joined[1]!.ha).toBeCloseTo(area.ha, 9);
    }
    expect(views.some((p) => p.mobs.length > 0)).toBe(true);
  });

  it('says where each paddock gets its water: its own, through a gate, or none', () => {
    let farm = twoPaddockFarm('nsw');
    const bore = farm.layout.water.bore;
    const topo = surveyOf(farm).topology;
    const wet = topo.paddockOf[bore]!;
    const views = paddockSummaries(farm);
    expect(views.map((p) => p.water)).toEqual(wet === 0 ? ['own', 'none'] : ['none', 'own']);
    expect(views.map((p) => p.name)).toEqual(['Paddock 1', 'Paddock 2']);
    expect(views.every((p) => p.mobs.length === 0 && p.ae === 0 && p.feedDays === Infinity)).toBe(
      true,
    );
    const v = farm.layout.fences.vE.indexOf(EDGE.gateShut);
    farm = act(farm, { type: 'setGate', edge: { line: 'v', index: v }, open: true });
    const open = paddockSummaries(farm);
    expect(open.map((p) => p.water)).toEqual(wet === 0 ? ['own', 'gate'] : ['gate', 'own']);
    expect(open.map((p) => p.area)).toEqual(['Paddocks 1 + 2', 'Paddocks 1 + 2']);
    expect(open[0]!.ha + open[1]!.ha).toBeCloseTo(260, 9);
  });
});

describe('mob summaries and farm totals', () => {
  const farm = createFarm({
    seed: 21,
    district: 'cq',
    size: 'small',
    start: { year: 2023, month: 9 },
    startType: 'running',
    difficulty: 'medium',
  });
  const events: FarmEvent[] = [];
  for (let d = 0; d < 200; d++) events.push(...stepDay(farm).events);

  it('each mob: head, calves, AE, DSE, classes, water, the day figures and what it would sell for', () => {
    const prices = pricesOf(farm);
    const s = surveyOf(farm);
    const sums = mobSummaries(farm);
    expect(sums.length).toBe(farm.mobs.length);
    sums.forEach((sum, i) => {
      const m = farm.mobs[i]!;
      const adults = m.animals.filter((a) => a.kind !== 'calf');
      expect(sum.id).toBe(m.id);
      expect(sum.name).toBe(m.name);
      expect(sum.head).toBe(adults.length);
      expect(sum.calves).toBe(m.animals.length - adults.length);
      expect(sum.ae).toBe(m.animals.reduce((t, a) => t + aeOf(a), 0));
      expect(sum.dse).toBe(sum.ae * 8);
      expect(sum.supp).toBe('lick');
      expect(sum.day).toBe(m.st);
      expect(sum.day!.n).toBe(adults.length);
      expect(sum.dryDays).toBe(0);
      expect(sum.hasWater).toBe(true);
      expect(sum.saleValue).toBe(
        m.animals.reduce((t, a) => t + Math.max(0, netSaleValue(a, prices)), 0),
      );
      const counted = Object.values(sum.classes).reduce((t, n) => t + n, 0);
      expect(counted).toBe(m.animals.length);
      for (const [cls, n] of Object.entries(sum.classes)) {
        expect(n).toBe(m.animals.filter((a) => classOf(a) === cls).length);
      }
      const area = s.topology.areas[s.topology.areaOf[(m.where as { anchor: number }).anchor]!]!;
      expect(sum.area).toBe(area.name);
      expect(sum.where).toEqual(m.where);
    });
  });

  it('a mob with no water, and a mob in the feedlot', () => {
    let f = twoPaddockFarm('nsw');
    const topo = surveyOf(f).topology;
    const dry = topo.paddocks.find((p) => p.id !== topo.paddockOf[f.layout.water.bore])!;
    f = act(f, { type: 'buyCattle', cls: 'yearSteer', qty: 5, to: { cell: dry.cells[0]! } });
    stepDay(f);
    const out = mobSummaries(f)[0]!;
    expect([out.hasWater, out.dryDays, out.area]).toEqual([false, 1, dry.name]);
    f = act(f, { type: 'moveMob', mob: f.mobs[0]!.id, to: 'lot' });
    const lot = mobSummaries(f)[0]!;
    expect([lot.hasWater, lot.area, lot.where]).toEqual([true, null, { kind: 'lot' }]);
  });

  it('the whole farm: head, AE, feed, cover, net worth and the date', () => {
    const t = farmTotals(farm);
    const all = farm.mobs.flatMap((m) => m.animals);
    expect(t.day).toBe(200);
    expect(t.date).toEqual({ year: 2024, month: 3, date: 18 });
    expect(t.head).toBe(all.filter((a) => a.kind !== 'calf').length);
    expect(t.calves).toBe(all.filter((a) => a.kind === 'calf').length);
    expect(t.ae).toBeCloseTo(
      all.reduce((s, a) => s + aeOf(a), 0),
      6,
    );
    expect(t.dse).toBe(t.ae * 8);
    expect(t.carryingCapacityAE).toBe(carryingCapacityAE('cq', 1000));
    let g = 0;
    let d = 0;
    for (let i = 0; i < GRID_N; i++) {
      g += farm.pasture.G[i]!;
      d += farm.pasture.D[i]!;
    }
    expect(t.greenKgHa).toBe(g / GRID_N);
    expect(t.deadKgHa).toBe(d / GRID_N);
    expect(t.massKgHa).toBe((g + d) / GRID_N);
    expect(t.massKgHa).toBeGreaterThan(500);
    expect(t.coverPct).toBe(coverPct(farm.pasture));
    expect(t.cash).toBe(farm.cash);
    expect(t.netWorth.total).toBe(netWorth(farm));
    expect(t.netWorth.cash + t.netWorth.stock + t.netWorth.infrastructure).toBeCloseTo(
      t.netWorth.total,
      6,
    );
    expect(t.netWorth.infrastructure).toBe(infraInPlace(farm) * 0.8);
    expect(t.indicator).toBe(farm.market.indicator);
    const f = seasonsOf(farm).factorsOn(199);
    expect(t.season).toEqual({ label: f.label, factor: f.seasonF });
  });

  it('what a calibration run reads: head, live weight, waters, the year and the preg tests', () => {
    const c = calibrationView(farm);
    const adults = farm.mobs.flatMap((m) => m.animals).filter((a) => a.kind !== 'calf');
    expect(c.head).toBe(adults.length);
    expect(c.liveWeightKg).toBe(adults.reduce((s, a) => s + a.wt, 0));
    expect(c.waters).toBe(farm.layout.water.troughs.length);
    expect(c.year).toBe(farm.year);
    expect(c.years).toBe(farm.years);
    expect(c.day).toBe(200);
    const tests = pregTests(events);
    expect(tests.length).toBeGreaterThan(0);
    for (const p of tests) {
      expect(p.rate).toBe(p.inCalf / Math.max(1, p.females));
      expect(p.expected).toBeGreaterThan(0.3);
      expect(p.expected).toBeLessThan(0.96);
      expect(p.cs).toBeGreaterThan(1);
    }
    // The year so far, scored as if it closed today.
    const live = liveYear(farm);
    expect(live.worth1).toBe(netWorth(farm));
    expect(live.score).toEqual(scoreYear(live, coverPct(farm.pasture)));
    expect(live.score.profit).toBe(live.worth1 - farm.year.worth0);
  });
});

describe('the yearly score', () => {
  const y = (
    over: Partial<Parameters<typeof scoreYear>[0]> = {},
  ): Parameters<typeof scoreYear>[0] => ({
    worth0: 100_000,
    worth1: 120_000,
    grown: 1_000_000,
    eaten: 300_000,
    gain: 10_000,
    deaths: 3,
    covers: [90, 80],
    ...over,
  });

  it('adds profit, gain, utilisation and cover, and takes off deaths', () => {
    const s = scoreYear(y(), 50);
    expect(s).toEqual({
      profit: 20_000,
      util: 30,
      cover: 85,
      profitPts: 1000,
      gainPts: 5000,
      utilPts: 660,
      coverPts: 500,
      deathPts: -180,
      total: 6980,
    });
  });

  it('utilisation scores 22 a point to 45%, 1,000 to 60%, then loses 40 a point, never below 0', () => {
    const pts = (eaten: number): number => scoreYear(y({ eaten }), 50).utilPts;
    expect(pts(450_000)).toBe(990);
    expect(pts(450_001)).toBe(1000);
    expect(pts(600_000)).toBe(1000);
    expect(pts(610_000)).toBeCloseTo(960, 9);
    expect(pts(700_000)).toBeCloseTo(600, 9);
    expect(pts(850_000)).toBeCloseTo(0, 9);
    expect(pts(990_000)).toBe(0);
    expect(scoreYear(y({ grown: 0 }), 50).util).toBe(0);
  });

  it('cover scores 7 a point up to 500, and loses 25 a point under 40%', () => {
    const pts = (cover: number): number => scoreYear(y({ covers: [cover] }), 50).coverPts;
    expect(pts(100)).toBe(500);
    expect(pts(72)).toBe(500);
    expect(pts(70)).toBe(490);
    expect(pts(40)).toBe(280);
    expect(pts(39)).toBe(39 * 7 - 25);
    expect(pts(10)).toBe(70 - 750);
    // With no monthly reading yet, today's cover is used.
    expect(scoreYear(y({ covers: [] }), 60).cover).toBe(60);
  });
});
