import { describe, expect, it, vi } from 'vitest';
import { rngFrom } from '../../test-support/cattle';
import { seededRandom } from '../../test-support/mvp';
import { WholeFarmRun, loadMvpWhole, mvpAnyGame } from '../../test-support/mvpWhole';
import { makeSaleBatch } from '../cattle/animal';
import type { Animal } from '../cattle/types';
import { MARKET_CLASSES, SALE_CLASSES, type MarketClassId, type SaleClassId } from '../data/cattle';
import { rngFromState, rngStream } from '../rng';
import { createFarm } from '../sim/create';
import { PLAY_STREAMS } from '../sim/state';
import {
  bullPrice,
  buyPrice,
  centsPerKg,
  estimateBuy,
  netSaleValue,
  saleValue,
  type Prices,
} from './prices';
import {
  CLASS_MULTIPLIERS,
  STAND_IN_FIRST_YEAR,
  STAND_IN_SERIES,
  asStandIn,
  standInMarket,
  type StandInMarket,
} from './standIn';

vi.setConfig({ testTimeout: 600_000 });

const loaded = loadMvpWhole();
const { mvp } = loaded;
mvpAnyGame(loaded);
const CLASS_IDS = Object.keys(MARKET_CLASSES) as MarketClassId[];

/** Put a market state into the MVP and return the engine's prices for it. */
function setMarket(indicator: number, drift: (k: MarketClassId) => number): Prices {
  const m: StandInMarket = {
    kind: 'standIn',
    indicator,
    noise: 0,
    drift: Object.fromEntries(CLASS_IDS.map((k) => [k, drift(k)])) as Record<MarketClassId, number>,
    ext: [],
  };
  mvp.S.R = indicator;
  mvp.S.cn = { ...m.drift };
  return standInMarket.prices(m);
}

describe('the stand-in market figures', () => {
  it('the series is the MVP series, month for month, from January 2019', () => {
    expect(STAND_IN_SERIES).toEqual(mvp.MKT);
    expect(STAND_IN_SERIES.length).toBe(7 * 12);
    expect(STAND_IN_FIRST_YEAR).toBe(2019);
  });

  it('the class multiples are the MVP multiples, in the MVP order', () => {
    expect(Object.entries(CLASS_MULTIPLIERS)).toEqual(
      Object.entries(mvp.MCLS).map(([k, v]) => [k, v[1]]),
    );
    expect(Object.keys(MARKET_CLASSES)).toEqual(Object.keys(mvp.MCLS));
  });
});

describe('what an animal is worth, against the MVP', () => {
  const rng = rngStream(4, 'market-test');
  const ids = { next: 1 };
  const animals: Animal[] = [];
  for (const key of Object.keys(SALE_CLASSES) as SaleClassId[]) {
    animals.push(...makeSaleBatch(ids, rng, key, 12));
  }
  // Either side of every weight, condition and pregnancy step.
  const edge = (over: Partial<Animal>, base: Animal): Animal => ({ ...base, ...over });
  const steer = animals.find((a) => a.kind === 'steer')!;
  const heifer = animals.find((a) => a.kind === 'heifer')!;
  const cow = animals.find((a) => a.kind === 'cow')!;
  const bull = animals.find((a) => a.kind === 'bull')!;
  const calf = animals.find((a) => a.kind === 'calf')!;
  for (const wt of [279.99, 280, 449.99, 450]) animals.push(edge({ wt }, steer));
  for (const wt of [279.99, 280]) animals.push(edge({ wt }, heifer));
  for (const cond of [1.99, 2, 2.99, 3]) {
    animals.push(edge({ cond }, cow), edge({ cond }, steer), edge({ cond }, heifer));
    animals.push(edge({ cond }, bull), edge({ cond }, calf));
  }
  for (const preg of [-1, 0, 49, 50, 200]) {
    animals.push(edge({ preg }, cow), edge({ preg }, heifer), edge({ preg }, steer));
  }

  it.each([
    [400, 0],
    [202, -0.2],
    [692.5, 0.2],
    [431.37, 0.07],
  ])('at an indicator of %s with class drift %s', (indicator, d) => {
    const prices = setMarket(indicator, (k) => (k === 'cow' ? -d : d));
    for (const k of CLASS_IDS) {
      expect(prices.classes[k], k).toBe(indicator * mvp.MCLS[k]![1] * (1 + (k === 'cow' ? -d : d)));
    }
    for (const a of animals) {
      const who = `${a.kind} ${a.wt} kg CS ${a.cond} preg ${a.preg}`;
      expect(centsPerKg(a, prices), who).toBe(mvp.cpk(a));
      expect(saleValue(a, prices), who).toBe(mvp.value(a));
      expect(netSaleValue(a, prices), who).toBe(mvp.netSale(a));
    }
    expect(bullPrice(prices)).toBe((5500 * indicator) / 400);
    expect(buyPrice(bull, prices)).toBe(bullPrice(prices));
    expect(buyPrice(cow, prices)).toBe(mvp.value(cow));
    for (const key of Object.keys(SALE_CLASSES) as SaleClassId[]) {
      for (const qty of [1, 37]) {
        expect(estimateBuy(key, qty, prices), key).toBe(mvp.estBuy(key, qty));
      }
    }
  });

  it('the rules in plain figures', () => {
    const prices = setMarket(400, () => 0);
    const base = { kind: 'steer', wt: 300, cond: 3, preg: -1 } as const;
    // A 300 kg steer is a yearling: 400 c/kg, $1,200. It nets 5% and $30 less.
    expect(saleValue(base, prices)).toBe(1200);
    expect(netSaleValue(base, prices)).toBe(1200 * 0.95 - 30);
    // Under 280 kg it is a weaner at 1.08 times the indicator.
    expect(centsPerKg({ ...base, wt: 250 }, prices)).toBe(400 * 1.08);
    // Under CS 2 it makes 14% less.
    expect(centsPerKg({ ...base, cond: 1.9 }, prices)).toBe(400 * 0.86);
    // Cows: 15% less under CS 2, 5% more from CS 3.
    expect(centsPerKg({ kind: 'cow', wt: 450, cond: 1.9, preg: -1 }, prices)).toBe(
      400 * 0.64 * 0.85,
    );
    expect(centsPerKg({ kind: 'cow', wt: 450, cond: 3, preg: -1 }, prices)).toBe(400 * 0.64 * 1.05);
    expect(centsPerKg({ kind: 'cow', wt: 450, cond: 2.5, preg: -1 }, prices)).toBe(400 * 0.64);
    // In calf 50 days or more: $320 more at an indicator of 400.
    const dry = saleValue({ kind: 'cow', wt: 450, cond: 2.5, preg: 49 }, prices);
    expect(saleValue({ kind: 'cow', wt: 450, cond: 2.5, preg: 50 }, prices) - dry).toBe(320);
    // A tiny calf can be worth less than it costs to sell.
    expect(netSaleValue({ kind: 'calf', wt: 5, cond: 3, preg: -1 }, prices)).toBeLessThan(0);
    // A bull costs $5,500 to buy at an indicator of 400, whatever it weighs.
    expect(buyPrice({ kind: 'bull', wt: 700, cond: 3, preg: -1 }, prices)).toBe(5500);
    expect(buyPrice({ kind: 'bull', wt: 820, cond: 3.6, preg: -1 }, prices)).toBe(5500);
  });
});

describe('the market over time, against the MVP', () => {
  it('opens on the MVP indicator for any start, drawing past the end of the series', () => {
    for (const [year, month] of [
      [2015, 3],
      [2019, 0],
      [2021, 8],
      [2025, 11],
      [2026, 0],
      [2031, 6],
    ] as const) {
      const start = { year, month };
      const mine = rngStream(9, PLAY_STREAMS.market);
      const theirs = rngStream(9, PLAY_STREAMS.market);
      const m = standInMarket.open(start, mine);
      mvp.S.startY = year;
      mvp.S.startM = month;
      mvp.S.ext = [];
      loaded.route({ market: () => theirs.next() });
      expect(m.indicator, `${year}-${month}`).toBe(mvp.mktBase(0));
      expect(m.ext, `${year}-${month}`).toEqual(Array.from(mvp.S.ext));
      expect(mine.state()).toEqual(theirs.state());
      // December 2025 is still inside the series. From January 2026 the walk is needed.
      expect(m.ext.length > 0).toBe(year >= 2026);
      expect(m.noise).toBe(0);
    }
    // Before 2019 the series holds its first value.
    expect(standInMarket.open({ year: 2015, month: 3 }, rngStream(1, 'x')).indicator).toBe(280);
  });

  it('moves day by day exactly as the MVP does, for six years from 2024 into the random walk', () => {
    const farm = createFarm({
      seed: 21,
      district: 'wv',
      size: 'small',
      start: { year: 2024, month: 6 },
      startType: 'scratch',
      difficulty: 'easy',
    });
    const run = new WholeFarmRun(loaded, farm);
    const lo = { ...asStandIn(farm.market).drift };
    const hi = { ...asStandIn(farm.market).drift };
    for (let d = 0; d < 6 * 365; d++) {
      run.day();
      for (const k of CLASS_IDS) {
        lo[k] = Math.min(lo[k], asStandIn(run.farm.market).drift[k]);
        hi[k] = Math.max(hi[k], asStandIn(run.farm.market).drift[k]);
      }
    }
    const m = asStandIn(run.farm.market);
    // 2026 to mid-2030 came from the random walk, inside its limits.
    expect(m.ext.length).toBeGreaterThan(50);
    expect(Math.min(...m.ext)).toBeGreaterThanOrEqual(180);
    expect(Math.max(...m.ext)).toBeLessThanOrEqual(760);
    expect(m.ext.every((v) => Number.isInteger(v))).toBe(true);
    // Each class drifted, and stayed within 20% of its usual multiple.
    for (const k of CLASS_IDS) {
      expect(lo[k]).toBeLessThan(-0.01);
      expect(hi[k]).toBeGreaterThan(0.01);
      expect(lo[k]).toBeGreaterThanOrEqual(-0.2);
      expect(hi[k]).toBeLessThanOrEqual(0.2);
    }
    expect(run.farm.priceHistory.length).toBe(31);
    expect(run.farm.priceHistory.at(-1)).toEqual({
      day: run.farm.day,
      c: standInMarket.prices(m).classes,
    });
    expect(run.farm.years.length).toBe(6);
  });

  it('the random walk holds its limits and the drift its 20% when the draws are extreme', () => {
    // A stream of numbers that makes every normal draw large and every month a shock.
    for (const [u, sign] of [
      [1e-12, 1],
      [1e-12, -1],
    ] as const) {
      // cos(2 pi v) is 1 at v = 0 (redrawn, so just above it) and -1 at v = 0.5.
      const v = sign > 0 ? 1e-9 : 0.5;
      let k = 0;
      // Draw order: the shock test, then pairs of (u, v) for each normal draw.
      const next = (): number => {
        const i = k++ % 5;
        return i === 0 ? 0.01 : i % 2 === 1 ? u : v;
      };
      const m = standInMarket.open({ year: 2030, month: 0 }, rngFrom(next));
      for (const x of m.ext) {
        expect(x).toBeGreaterThanOrEqual(180);
        expect(x).toBeLessThanOrEqual(760);
      }
      expect(m.ext.at(-1)).toBe(sign > 0 ? 760 : 180);
    }
    const m = standInMarket.open({ year: 2022, month: 0 }, rngFromState([1, 2, 3, 4]));
    const big = rngFrom(seededRandom(3));
    for (let d = 1; d < 4000; d++) standInMarket.step(m, { year: 2022, month: 0 }, d, big);
    for (const k of CLASS_IDS) expect(Math.abs(m.drift[k])).toBeLessThanOrEqual(0.2);
  });
});

describe('the limits, exactly', () => {
  it('each class stops at exactly 20% above or below its usual multiple', () => {
    for (const sign of [1, -1]) {
      // Every normal draw is large: +7.4 or -7.4. A step moves a class by about 5%.
      const v = sign > 0 ? 1e-9 : 0.5;
      let k = 0;
      const rng = rngFrom(() => (k++ % 2 === 0 ? 1e-12 : v));
      const start = { year: 2022, month: 0 };
      const m = standInMarket.open(start, rng);
      for (let d = 1; d <= 30; d++) standInMarket.step(m, start, d, rng);
      for (const id of CLASS_IDS) expect(m.drift[id], id).toBe(sign * 0.2);
      // Prices follow: 20% over, or under, the indicator times the class multiple.
      const prices = standInMarket.prices(m);
      expect(prices.classes.cow).toBe(m.indicator * 0.64 * (1 + sign * 0.2));
      expect(prices.indicator).toBe(m.indicator);
    }
  });
});
