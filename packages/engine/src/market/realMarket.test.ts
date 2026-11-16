import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { MARKET_CLASSES, type MarketClassId } from '../data/cattle';
import { rngStream } from '../rng';
import { loadRealData } from '../server';
import { REAL_PRICE_DOLLARS, realMarket, realPricesOn } from './realMarket';

// These read the real tables. Give them room when the whole suite is running beside them.
vi.setConfig({ testTimeout: 120_000 });

const data = loadRealData();
const CLASS_IDS = Object.keys(MARKET_CLASSES) as MarketClassId[];

/*
 * The CPI figures are written out here (docs/DATA.md, "Inflation"), so the
 * lift is worked out apart from the code under test.
 */
const CPI_SEPTEMBER_2026 = 103.64;
const CASES = [
  // 1 July 1998 is in the September quarter 1998.
  { date: { year: 1998, month: 6, date: 1 }, cpi: 46.91 },
  // 30 June 2000 and 1 July 2000 sit either side of a quarter.
  { date: { year: 2000, month: 5, date: 30 }, cpi: 48.77 },
  { date: { year: 2000, month: 6, date: 1 }, cpi: 50.59 },
  // 15 November 2010 is in the December quarter 2010.
  { date: { year: 2010, month: 10, date: 15 }, cpi: 67.26 },
  { date: { year: 2025, month: 11, date: 31 }, cpi: 100.32 },
];

describe('real prices in the dollars asked for', () => {
  it('of the day: the class prices as the yard and the mapping give them', () => {
    for (const id of DISTRICT_IDS) {
      const d = data.district(id);
      for (const { date } of CASES) {
        expect(realPricesOn(d.prices, d.cpi, date, 'of-the-day')).toEqual(d.prices.pricesOn(date));
      }
    }
  });

  it("today's dollars: the indicator and every class lifted by the same CPI ratio", () => {
    for (const id of DISTRICT_IDS) {
      const d = data.district(id);
      for (const { date, cpi } of CASES) {
        const asReported = d.prices.pricesOn(date);
        const lifted = realPricesOn(d.prices, d.cpi, date, 'today');
        const ratio = CPI_SEPTEMBER_2026 / cpi;
        expect(lifted.indicator).toBeCloseTo(asReported.indicator * ratio, 9);
        for (const k of CLASS_IDS) {
          expect(lifted.classes[k], `${id} ${k}`).toBeCloseTo(asReported.classes[k] * ratio, 9);
        }
        expect(Object.keys(lifted.classes).sort()).toEqual([...CLASS_IDS].sort());
      }
    }
  });

  it('leaves a price in the September quarter 2026 as it is', () => {
    const d = data.district('cw');
    const date = { year: 2026, month: 7, date: 20 };
    expect(realPricesOn(d.prices, d.cpi, date, 'today')).toEqual(d.prices.pricesOn(date));
  });
});

describe('the real market as a price source', () => {
  const d = data.district('cw');
  const dates = [
    { year: 1998, month: 6, date: 1 },
    { year: 2010, month: 10, date: 15 },
  ];
  const realDateOn = (day: number) => dates[day]!;
  const rng = rngStream(1, 'market');
  const start = { year: 1998, month: 6 };

  it("opens in today's dollars unless told otherwise, and keeps the dollars it opened in", () => {
    expect(REAL_PRICE_DOLLARS).toBe('today');
    const source = realMarket({ prices: d.prices, cpi: d.cpi, realDateOn });
    const m = source.open(start, rng);
    expect(m.kind).toBe('real');
    expect(m.dollars).toBe('today');
    const day0 = d.prices.pricesOn(dates[0]!);
    expect(m.indicator).toBeCloseTo((day0.indicator * CPI_SEPTEMBER_2026) / 46.91, 9);
    expect(m.classes.cow).toBeCloseTo((day0.classes.cow * CPI_SEPTEMBER_2026) / 46.91, 9);
    source.step(m, start, 1, rng);
    const day1 = d.prices.pricesOn(dates[1]!);
    expect(m.dollars).toBe('today');
    expect(m.indicator).toBeCloseTo((day1.indicator * CPI_SEPTEMBER_2026) / 67.26, 9);
    expect(m.classes.heavy).toBeCloseTo((day1.classes.heavy * CPI_SEPTEMBER_2026) / 67.26, 9);
    expect(source.prices(m)).toEqual({ indicator: m.indicator, classes: m.classes });
  });

  it('opened in the dollars of the day, stays in them when it moves on', () => {
    const source = realMarket({ prices: d.prices, cpi: d.cpi, realDateOn, dollars: 'of-the-day' });
    const m = source.open(start, rng);
    expect(m.dollars).toBe('of-the-day');
    expect(source.prices(m)).toEqual(d.prices.pricesOn(dates[0]!));
    source.step(m, start, 1, rng);
    expect(source.prices(m)).toEqual(d.prices.pricesOn(dates[1]!));
  });

  it('never draws from the market stream', () => {
    const fresh = rngStream(1, 'market');
    const used = rngStream(1, 'market');
    const source = realMarket({ prices: d.prices, cpi: d.cpi, realDateOn });
    const m = source.open(start, used);
    source.step(m, start, 1, used);
    expect(used.state()).toEqual(fresh.state());
  });
});
