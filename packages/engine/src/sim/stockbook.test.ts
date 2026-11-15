import { describe, expect, it, vi } from 'vitest';
import { actWith, openFarm } from '../../test-support/wholeFarm';
import { netSaleValue } from '../market/prices';
import { FEED_FLOOR_KG_HA } from '../pasture/summary';
import { NEVER_GRAZED } from '../pasture/state';
import { loadFarm, saveFarm, farmHash, type SavedFarm } from '../save/save';
import { createFarm } from './create';
import { pricesOf, surveyOf } from './derived';
import { FORECAST_DAYS, FORECAST_POINTS, feedForecast } from './forecast';
import { lastRainMm, paddockRestDays } from './paddockfacts';
import { supplementCosts } from './reads';
import { cloneFarm, type FarmState } from './state';
import { originOf, stockBook } from './stockbook';
import { stepDay } from './tick';

/*
 * The stock book, the feed forecast and the small facts for the screens
 * (engine 0.21.0). Reads only: each must leave the farm exactly as it was.
 */

vi.setConfig({ testTimeout: 600_000 });

const running = (seed = 21): FarmState =>
  createFarm({
    seed,
    district: 'cq',
    size: 'small',
    start: { year: 2023, month: 7 },
    startType: 'running',
    difficulty: 'medium',
  });

const days = (farm: FarmState, n: number): FarmState => {
  for (let i = 0; i < n; i++) stepDay(farm);
  return farm;
};

describe('the stock book', () => {
  it('has a row for every head, with value at today’s price after selling costs and profit as value less all costs', () => {
    const farm = days(running(), 20);
    const rows = stockBook(farm);
    const head = farm.mobs.reduce((t, m) => t + m.animals.length, 0);
    expect(rows).toHaveLength(head);
    const prices = pricesOf(farm);
    for (const m of farm.mobs) {
      for (const a of m.animals) {
        const r = rows.find((x) => x.id === a.id)!;
        expect(r.mob).toBe(m.id);
        expect(r.value).toBeCloseTo(Math.max(0, netSaleValue(a, prices)), 9);
        expect(r.paid).toBe(a.paid);
        expect(r.spent).toBeCloseTo(a.cost - a.paid, 9);
        expect(r.profit).toBeCloseTo(r.value - a.cost, 9);
      }
    }
  });

  it('a start herd is valued at takeover, bought cattle at what was paid, calves born here at nothing', () => {
    const farm = running();
    expect(farm.startTags).toBe(farm.animalIds.next);
    for (const r of stockBook(farm)) expect(r.origin).toBe('start');
    expect(originOf(farm, farm.startTags!, 900)).toBe('bought');
    expect(originOf(farm, 1, 0)).toBe('bred');
    // A farm saved before format 16 did not keep which it was.
    expect(originOf({}, 1, 900)).toBe('boughtOrStart');
  });

  it('cattle bought on a farm are "bought", with what was paid, fees in', () => {
    const farm = openFarm('nsw');
    const out = actWith(farm, {
      type: 'buyCattle',
      cls: 'weanerSteer',
      qty: 3,
      to: { cell: farm.layout.water.bore },
    });
    const rows = stockBook(out.farm);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.origin).toBe('bought');
      expect(r.paid).toBeGreaterThan(r.value);
      expect(r.spent).toBe(0);
      expect(r.profit).toBeCloseTo(r.value - r.paid, 9);
    }
  });

  it('reading it changes nothing', () => {
    const farm = days(running(), 5);
    const hash = farmHash(farm);
    stockBook(farm);
    feedForecast(farm);
    supplementCosts(farm);
    paddockRestDays(farm);
    lastRainMm(farm);
    expect(farmHash(farm)).toBe(hash);
  });
});

describe('save format 16', () => {
  it('keeps startTags and stockedOn through a save', () => {
    const farm = days(running(), 2);
    const loaded = loadFarm(saveFarm(farm));
    expect(loaded.startTags).toBe(farm.startTags);
    expect([...loaded.stockedOn!]).toEqual([...farm.stockedOn!]);
  });

  it('a format 15 save loads, with no startTags and every animal not bred here "bought or taken over"', () => {
    const farm = days(running(), 3);
    const old = saveFarm(farm) as Record<string, unknown>;
    old.saveFormat = 15;
    delete old.startTags;
    delete old.stockedOn;
    const loaded = loadFarm(old as SavedFarm);
    expect(loaded.startTags).toBeUndefined();
    expect(loaded.stockedOn).toBeUndefined();
    expect(loaded.saveFormat).toBe(16);
    const rows = stockBook(loaded);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.origin).toBe(r.paid > 0 ? 'boughtOrStart' : 'bred');
    // And it plays on, with the rest record made at its first night.
    stepDay(loaded);
    expect(loaded.day).toBe(4);
    expect(loaded.stockedOn).toBeInstanceOf(Int32Array);
  });
});

describe('the feed forecast', () => {
  it('has a point for today and about each month of the year ahead, the floor and what the stock eat', () => {
    const farm = days(running(), 2);
    const f = feedForecast(farm);
    expect(f.points).toHaveLength(FORECAST_POINTS);
    expect(f.points[0]!.day).toBe(farm.day);
    expect(f.points.at(-1)!.day).toBeLessThanOrEqual(farm.day + FORECAST_DAYS);
    for (let i = 1; i < f.points.length; i++) {
      expect(f.points[i]!.day).toBeGreaterThan(f.points[i - 1]!.day);
    }
    expect(f.floorKgHa).toBe(FEED_FLOOR_KG_HA);
    expect(f.pastureHa).toBeGreaterThan(0);
    // The stock on hand eat what the cattle step said they wanted today.
    const wanted = farm.mobs.reduce((t, m) => t + (m.st ? m.st.demand : 0), 0);
    expect(f.eatKgDay).toBeCloseTo(wanted, 6);
    expect(f.head).toBe(
      farm.mobs.reduce((t, m) => t + m.animals.filter((a) => a.kind !== 'calf').length, 0),
    );
    // Today's point is the feed on the pasture squares now.
    const haSq = farm.layout.scale.haPerSquare;
    let kg = 0;
    for (let i = 0; i < farm.pasture.G.length; i++) {
      if (farm.pasture.land[i] === 0 || farm.pasture.land[i] === 1) {
        kg += (farm.pasture.G[i]! + farm.pasture.D[i]!) * haSq;
      }
    }
    expect(f.points[0]!.pastureKg).toBeCloseTo(kg, 0);
  });

  it('is the same on a farm in a drought year and in a good one: it never reads the season to come', () => {
    const farm = days(running(), 2);
    const a = feedForecast(farm);
    // A different seed changes the random seasons but not this farm's pasture today.
    const other = cloneFarm(farm);
    other.seed = farm.seed + 1;
    const b = feedForecast(other);
    expect(b.points.map((p) => p.pastureKg)).toEqual(a.points.map((p) => p.pastureKg));
  });

  it('with no stock, feed only grows and falls with the season; with heavy stock it falls under the floor', () => {
    const farm = days(running(), 2);
    const empty = cloneFarm(farm);
    empty.mobs = [];
    const none = feedForecast(empty);
    expect(none.eatKgDay).toBe(0);
    expect(none.underFloor).toBeNull();
    const heavy = cloneFarm(farm);
    for (const m of heavy.mobs) m.st = m.st ? { ...m.st, demand: m.st.demand * 40 } : null;
    const h = feedForecast(heavy);
    expect(h.underFloor).not.toBeNull();
    expect(h.points.at(-1)!.pastureKg).toBeLessThan(none.points.at(-1)!.pastureKg);
  });
});

describe('what a supplement adds', () => {
  it('none adds nothing; hay and pellets add their own kg; lick adds no feed of its own', () => {
    const farm = days(running(), 2);
    for (const c of supplementCosts(farm)) {
      expect(c.adds.none).toEqual({ kg: 0, me: 0, cp: 0, pastureKg: 0 });
      const m = farm.mobs.find((x) => x.id === c.mob)!;
      if (m.where.kind !== 'paddock') continue;
      expect(c.adds.hay.kg).toBeGreaterThan(0);
      expect(c.adds.pellet.kg).toBeGreaterThan(0);
      expect(c.adds.pellet.me).toBeGreaterThan(c.adds.hay.me);
      expect(c.adds.lick.kg).toBe(0);
      expect(c.adds.lick.pastureKg).toBeGreaterThanOrEqual(0);
      expect(c.adds.hay.pastureKg).toBeLessThanOrEqual(0.0001);
    }
  });
});

describe('rest days and rain', () => {
  it('a stocked paddock has no rest days; an empty one counts whole days since it was last grazed', () => {
    const farm = days(running(), 3);
    const rest = paddockRestDays(farm);
    const survey = surveyOf(farm);
    const stockedAreas = new Set(
      farm.mobs.map((m) =>
        m.where.kind === 'paddock' ? survey.topology.areaOf[m.where.anchor] : -1,
      ),
    );
    for (const pd of survey.topology.paddocks) {
      const r = rest.get(pd.id);
      if (stockedAreas.has(survey.topology.areaOf[pd.cells[0]!]!)) {
        expect(r).toBeNull();
        continue;
      }
      let last = NEVER_GRAZED;
      for (const i of pd.cells) last = Math.max(last, farm.stockedOn![i]!);
      expect(r).toBe(last === NEVER_GRAZED ? null : Math.max(0, farm.day - 1 - last));
    }
  });

  it('the day stock leave a paddock it has rested 0 days, and one more each day after', () => {
    const farm = days(running(), 3);
    const survey = surveyOf(farm);
    const m = farm.mobs.find((x) => x.where.kind === 'paddock')!;
    const from = survey.topology.areaOf[(m.where as { anchor: number }).anchor]!;
    const pd = survey.topology.paddocks.find((p) => survey.topology.areaOf[p.cells[0]!] === from)!;
    // Every mob on that grazing area leaves this morning.
    farm.mobs = farm.mobs.filter(
      (x) => x.where.kind !== 'paddock' || survey.topology.areaOf[x.where.anchor] !== from,
    );
    expect(paddockRestDays(farm).get(pd.id)).toBe(0);
    stepDay(farm);
    expect(paddockRestDays(farm).get(pd.id)).toBe(1);
  });

  it('a farm with random seasons has no rain figure', () => {
    expect(lastRainMm(days(running(), 2))).toBeNull();
    expect(lastRainMm(running())).toBeNull();
  });
});
