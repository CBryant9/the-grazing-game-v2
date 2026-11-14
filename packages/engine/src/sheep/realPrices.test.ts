/**
 * Real-year sheep prices (review of the third pass, item 10): a real-year
 * farm with sheep sells and values them at MLA's national sheep indicators
 * for the real date, in today's dollars, as its cattle are; a farm with
 * random seasons keeps the dated stand-in.
 */

import { describe, expect, it } from 'vitest';
import { SHEEP_INDICATORS_C_KG } from '../data/sheepMarket';
import { todaysDollarsFactor } from '../market/cpi';
import { SHEEP_REAL_RULES } from '../market/realSheepPrices';
import { latestPriceRow, parsePriceTable } from '../market/priceTable';
import { daySerial } from '../season/weatherTable';
import { loadRealData } from '../server';
import { netWorth } from '../money/worth';
import { createFarm } from '../sim/create';
import { stepDay } from '../sim/tick';
import { readFileSync } from 'node:fs';
import { sheepIndicatorsOf, sheepWorth } from './market';

const data = loadRealData();
const env = { data };

function realFarm(year: number) {
  return createFarm(
    {
      seed: 3,
      district: 'wv',
      size: 'small',
      start: { year, month: 2 },
      startType: 'running',
      difficulty: 'easy',
      stock: 'mix',
      years: { kind: 'real', order: 'in-order' },
    },
    env,
  );
}

describe('real-year sheep prices', () => {
  it('a real-year farm reads the mutton indicator on its real date, in today’s dollars', () => {
    const farm = realFarm(2010);
    const p = farm.sheep!.prices!;
    expect(p.date).toBe('2010-03-01');
    const t = parsePriceTable(
      readFileSync('packages/engine/data/raw/mla/national/mutton.csv', 'utf8'),
    );
    const date = { year: 2010, month: 2, date: 1 };
    const row = latestPriceRow(
      t,
      daySerial(date),
      SHEEP_REAL_RULES.maxGapDays,
      SHEEP_REAL_RULES.thinHead,
    )!;
    expect(p.indicators.mutton).toBeCloseTo(
      row.value * todaysDollarsFactor(data.district('wv').cpi, date),
      6,
    );
    expect(sheepIndicatorsOf(farm)).toBe(p.indicators);
  });

  it('moves with the real years, day by day, and the flock’s worth with it', () => {
    const a = realFarm(2010);
    const b = realFarm(2020);
    expect(a.sheep!.prices!.indicators.tradeLamb).not.toBeCloseTo(
      b.sheep!.prices!.indicators.tradeLamb,
      0,
    );
    const before = a.sheep!.prices!.date;
    stepDay(a, env);
    expect(a.sheep!.prices!.date).not.toBe(before);
    // Net worth values the sheep at the real figures, not the stand-in.
    const worth = netWorth(a);
    expect(worth).toBeGreaterThan(0);
    expect(sheepWorth(a.sheep!.mobs, a.sheep!.prices!.indicators)).not.toBeCloseTo(
      sheepWorth(a.sheep!.mobs),
      0,
    );
  });

  it('covers every real year from 1997: the two long breaks over the 1996 Christmas are held', () => {
    for (const date of [
      { year: 1997, month: 0, date: 1 },
      { year: 1997, month: 0, date: 8 },
    ]) {
      const p = data.sheep().on(date, 'of-the-day');
      for (const v of Object.values(p)) expect(v).toBeGreaterThan(0);
    }
  });

  it('a farm with random seasons keeps the dated stand-in', () => {
    const farm = createFarm({
      seed: 3,
      district: 'wv',
      size: 'small',
      start: { year: 2021, month: 2 },
      startType: 'running',
      difficulty: 'easy',
      stock: 'mix',
    });
    expect(farm.sheep!.prices).toBeUndefined();
    expect(sheepIndicatorsOf(farm)).toBe(SHEEP_INDICATORS_C_KG);
  });

  it('refuses sheep data of another version', () => {
    const farm = realFarm(2010);
    farm.sheep!.prices!.dataVersion = '0000000000000000';
    expect(() => stepDay(farm, env)).toThrow(/sheep prices/);
  });
});
