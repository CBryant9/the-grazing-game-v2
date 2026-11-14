import { daySerial, isoDate } from '@gg/engine';
import { DISTRICT_IDS } from '@gg/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { addDays, parts } from './clock';
import {
  DAILY_DATA_LAG_DAYS,
  DAILY_DATA_VERSION,
  bakedLabelThrough,
  bakedThrough,
  longTermWeather,
} from './data';
import { HELP_TOPICS } from '../../components/play/helptopics';
import { database, keepThrough, rig, weatherFor } from './testrig';

afterAll(async () => {
  await (await database()).close();
});

const real = (n: number): string => addDays(bakedThrough('cq'), n);

describe('the real data a Daily Farm runs on', () => {
  it('runs behind the real date by the lag, and names the lag in the version it records', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    expect(DAILY_DATA_LAG_DAYS).toBe(5);
    expect(DAILY_DATA_VERSION).toBe('daily-lag5');
    const cq = (await r.data.bundleThrough(bakedLabelThrough('cq'))).district('cq');
    // The last baked day (real 12 Nov 2026) is the game's 17 Nov, and the baked 7 Nov is the game's 12 Nov.
    expect(isoDate(cq.weather.last)).toBe('2026-11-17');
    expect(cq.version).toBe(DAILY_DATA_VERSION);
  }, 120_000);

  it('is said plainly on the Help page, with the number of days the lag is', () => {
    const daily = HELP_TOPICS.find((t) => t.id === 'daily')!;
    const line = daily.lines.find((l) => /behind the real date/.test(l))!;
    expect(line).toContain(`${DAILY_DATA_LAG_DAYS} days behind the real date`);
    expect(line).toMatch(/weather and prices/i);
  });

  it('is the baked tables with the kept real days on the end, relabelled to the game date', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    await keepThrough(r, real(3));
    const label = (n: number): string => addDays(real(n), DAILY_DATA_LAG_DAYS);
    const bundle = await r.data.bundleThrough(label(3));
    const cq = bundle.district('cq');
    expect(isoDate(cq.weather.last)).toBe(label(3));
    expect(cq.weather.rainOn(parts(label(1)))).toBe(weatherFor(real(1)).rain);
    expect(cq.weather.rainOn(parts(label(2)))).toBe(weatherFor(real(2)).rain);
  }, 120_000);

  it('as it stood at the end of a day: later days are not in it, so a late farm runs on what an on-time one did', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    await keepThrough(r, real(5));
    const label = (n: number): string => addDays(real(n), DAILY_DATA_LAG_DAYS);
    const early = (await r.data.bundleThrough(label(1))).district('cq');
    expect(isoDate(early.weather.last)).toBe(label(1));
    expect(() => early.weather.rainOn(parts(label(2)))).toThrow();
    const late = (await r.data.bundleThrough(label(5))).district('cq');
    expect(late.weather.rainOn(parts(label(1)))).toBe(early.weather.rainOn(parts(label(1))));
  }, 120_000);

  it('fills a day with no real row with the long-term average, and says which night it was', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const label = (n: number): string => addDays(real(n), DAILY_DATA_LAG_DAYS);
    expect(await r.data.fallbacksOn('cq', label(0))).toEqual({ weather: false, prices: false });
    const missing = await r.data.fallbacksOn('cq', label(2));
    expect(missing.weather).toBe(true);
    const cq = (await r.data.bundleThrough(label(2))).district('cq');
    expect(cq.weather.rainOn(parts(label(2)))).toBe(longTermWeather('cq', label(2)).rain);
    // A real row that arrives makes that day real in a bundle made after, and the average for the day is a plain figure.
    await keepThrough(r, real(2));
    expect((await r.data.fallbacksOn('cq', label(2))).weather).toBe(false);
    const later = (await r.data.bundleThrough(label(2))).district('cq');
    expect(later.weather.rainOn(parts(label(2)))).toBe(weatherFor(real(2)).rain);
    expect(longTermWeather('cq', '2026-02-29').et0).toBeGreaterThan(0);
  }, 120_000);

  it('carries the last price forward when a month goes by with none, so a missing price never throws', async () => {
    const r = await rig({ date: '2026-12-20', time: '10:00:00' });
    // No row kept since the baked tables end: 40 days on is past the engine's own 21 day limit.
    const date = addDays(bakedLabelThrough('cq'), 40);
    const bundle = await r.data.bundleThrough(date);
    for (const id of DISTRICT_IDS) {
      const prices = bundle.district(id).prices.pricesOn(parts(date));
      expect(prices.indicator).toBeGreaterThan(0);
    }
    expect((await r.data.fallbacksOn('cq', date)).prices).toBe(true);
    expect((await r.data.fallbacksOn('cq', bakedLabelThrough('cq'))).prices).toBe(false);
  }, 240_000);

  it('uses the real yard sale days kept after the baked tables, and the weekly stand-in only after them', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const yard = 'DUB';
    const sale = addDays(bakedThrough('cw'), 6);
    await r.sql.transaction((tx) =>
      r.data.keepYardings(tx, yard, [{ date: sale, row: { type: 'Prime', head: 321 } }]),
    );
    r.data.forget();
    const sales = (await r.data.bundleThrough(addDays(bakedLabelThrough('cw'), 9))).district(
      'cw',
    ).cattleSales;
    const real = sales.saleOn(parts(sale));
    expect(real).toMatchObject({ standIn: false, head: 321 });
    // A day the yard held no sale on, inside the kept range, has none: the real calendar answers, not the weekly guess.
    expect(sales.saleOn(parts(addDays(sale, -1)))).toBeNull();
    // Past the last kept sale the usual weekly sale stands in, and the answer never throws.
    for (let d = 1; d <= 400; d += 7) {
      expect(() => sales.saleOn(parts(addDays(sale, d)))).not.toThrow();
    }
    const next = sales.nextSale(parts(addDays(sale, 1)));
    expect(next).not.toBeNull();
    expect(next!.standIn).toBe(true);
    expect(daySerial(next!.date)).toBeGreaterThan(daySerial(parts(sale)));
  }, 120_000);

  it('the weekly stand-in is used where a yard has no real sale days kept at all', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const sales = (await r.data.bundleThrough(addDays(bakedLabelThrough('wv'), 30))).district(
      'wv',
    ).cattleSales;
    const next = sales.nextSale(parts(addDays(bakedThrough('wv'), 3)));
    expect(next).not.toBeNull();
  }, 120_000);
});
