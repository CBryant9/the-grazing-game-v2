import { daySerial, isoDate } from '@gg/engine';
import { DISTRICT_IDS } from '@gg/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { addDays, parts } from './clock';
import { DAILY_DATA_VERSION, bakedThrough } from './data';
import { USER, at, database, keepThrough, rig, weatherFor } from './testrig';

afterAll(async () => {
  await (await database()).close();
});

describe('the real data a Daily Farm runs on', () => {
  it('is the baked tables with the kept days on the end, and complete only through the last kept day', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const base = bakedThrough('cq');
    expect(await r.data.through('cq')).toBe(base);
    await keepThrough(r, addDays(base, 3));
    expect(await r.data.through('cq', true)).toBe(addDays(base, 3));
    const bundle = await r.data.bundleThrough(addDays(base, 3));
    const cq = bundle.district('cq');
    expect(isoDate(cq.weather.last)).toBe(addDays(base, 3));
    // The label the farm records stays the same as the tables grow.
    expect(cq.version).toBe(DAILY_DATA_VERSION);
    // The real rain of a kept day is the table's.
    expect(cq.weather.rainOn(parts(addDays(base, 1)))).toBe(weatherFor(addDays(base, 1)).rain);
    expect(USER).toBeTypeOf('string');
  }, 120_000);

  it('as it stood at the end of a day: later days are not in it, so a late farm runs on what an on-time one did', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const base = bakedThrough('cq');
    await keepThrough(r, addDays(base, 5));
    const early = (await r.data.bundleThrough(addDays(base, 1))).district('cq');
    expect(isoDate(early.weather.last)).toBe(addDays(base, 1));
    expect(() => early.weather.rainOn(parts(addDays(base, 2)))).toThrow();
    const late = (await r.data.bundleThrough(addDays(base, 5))).district('cq');
    expect(late.weather.rainOn(parts(addDays(base, 1)))).toBe(
      early.weather.rainOn(parts(addDays(base, 1))),
    );
  }, 120_000);

  it('a gap in the days is not skipped over: the data is complete only up to the gap', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const base = bakedThrough('cq');
    await r.sql.transaction((tx) =>
      r.data.keepDay(tx, 'cq', addDays(base, 2), weatherFor(addDays(base, 2)), []),
    );
    r.data.forget();
    expect(await r.data.through('cq')).toBe(base);
  }, 120_000);

  it('carries the yard’s sale days on past the last the tables hold, by the usual weekly sale', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const sales = (await r.data.bundleThrough(bakedThrough('cw'))).district('cw').cattleSales;
    const from = parts(addDays(bakedThrough('cw'), 1));
    const next = sales.nextSale(from);
    expect(next).not.toBeNull();
    expect(daySerial(next!.date)).toBeGreaterThan(daySerial(from) - 1);
    // Every fourth week of the year somewhere has a sale: the answer never throws past the end.
    for (let d = 1; d <= 400; d += 7)
      expect(() => sales.saleOn(parts(addDays(bakedThrough('cw'), d)))).not.toThrow();
    expect(at('2026-11-13', '00:00:00')).toBeGreaterThan(0);
    expect(DISTRICT_IDS).toHaveLength(4);
  }, 120_000);
});
