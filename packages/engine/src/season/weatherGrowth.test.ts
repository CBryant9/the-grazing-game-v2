import type { DistrictId } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import type { CalendarDate } from '../calendar';
import { DISTRICTS } from '../data/districts';
import { districtPotential, interpMonth } from '../pasture/potential';
import { loadWeatherGrowth, loadWeatherTable } from '../server/weatherFiles';
import { PLAY_WOBBLE } from './randomSeasons';
import {
  SCALING_YEARS,
  SOIL_WATER,
  WEATHER_FACTOR_CEILING,
  buildWeatherGrowth,
  soilWaterDay,
  soilWaterTally,
  waterIndex,
} from './weatherGrowth';
import { dateOfSerial, daySerial, tableDays, tableIndex, type WeatherTable } from './weatherTable';

/*
 * The real tables are read through the server-only helper, the way the
 * server will. The model code under test takes them as data.
 */

const IDS: DistrictId[] = ['cq', 'nsw', 'cw', 'wv'];

/** Every date from the first day of one year to the last day of another. */
function* daysOf(firstYear: number, lastYear: number): Generator<CalendarDate> {
  const to = daySerial({ year: lastYear, month: 11, date: 31 });
  for (let s = daySerial({ year: firstYear, month: 0, date: 1 }); s <= to; s++)
    yield dateOfSerial(s);
}

/** A made-up table: the same rain and evapotranspiration pattern, repeated. */
function madeUp(
  first: CalendarDate,
  days: number,
  rain: (i: number) => number,
  et0 = 5,
): WeatherTable {
  return {
    first,
    rain: Float64Array.from({ length: days }, (_, i) => rain(i)),
    et0: new Float64Array(days).fill(et0),
  };
}

/** Part of a real table, by date. */
function cut(table: WeatherTable, from: CalendarDate, to: CalendarDate): WeatherTable {
  const a = tableIndex(table, from);
  const b = tableIndex(table, to) + 1;
  return { first: from, rain: table.rain.slice(a, b), et0: table.et0.slice(a, b) };
}

describe('the soil-water tally, one day at a time', () => {
  it('uses the figures in docs/DATA.md', () => {
    expect(SOIL_WATER).toEqual({ capacityMm: 100, easyShare: 0.6 });
    expect(WEATHER_FACTOR_CEILING).toBe(1.9);
    expect(WEATHER_FACTOR_CEILING).toBe(PLAY_WOBBLE.max);
    expect(SCALING_YEARS).toEqual({ first: 1997, last: 2025 });
  });

  it('gives a growth index of 1 while the soil holds 40 mm or more, then falls in step with the water', () => {
    expect(waterIndex(100)).toBe(1);
    expect(waterIndex(40)).toBe(1);
    expect(waterIndex(30)).toBe(0.75);
    expect(waterIndex(20)).toBe(0.5);
    expect(waterIndex(4)).toBeCloseTo(0.1, 12);
    expect(waterIndex(0)).toBe(0);
  });

  it('takes out the full evapotranspiration from moist soil', () => {
    expect(soilWaterDay(80, 0, 6)).toBe(74);
    expect(soilWaterDay(40, 0, 6)).toBe(34);
  });

  it('takes out less as the soil dries', () => {
    // At 20 mm the index is 0.5, so 6 mm of demand takes 3 mm.
    expect(soilWaterDay(20, 0, 6)).toBe(17);
    // At 4 mm the index is 0.1, so it takes 0.6 mm.
    expect(soilWaterDay(4, 0, 6)).toBeCloseTo(3.4, 12);
  });

  it('adds the rain, and loses what does not fit', () => {
    expect(soilWaterDay(20, 12, 6)).toBe(29);
    expect(soilWaterDay(90, 50, 5)).toBe(100);
    expect(soilWaterDay(100, 300, 0)).toBe(100);
  });

  it('never goes below empty, however hot the day', () => {
    expect(soilWaterDay(0, 0, 20)).toBe(0);
    let water = 5;
    for (let i = 0; i < 2000; i++) {
      water = soilWaterDay(water, 0, 20);
      expect(water).toBeGreaterThanOrEqual(0);
    }
    expect(water).toBeLessThan(1e-6);
  });

  it('takes another soil when given one', () => {
    const sand = { capacityMm: 60, easyShare: 0.5 };
    expect(waterIndex(15, sand)).toBe(0.5);
    expect(soilWaterDay(15, 0, 4, sand)).toBe(13);
    expect(soilWaterDay(50, 40, 0, sand)).toBe(60);
  });
});

describe('the soil-water tally over a table', () => {
  const start = { year: 2000, month: 0, date: 1 };

  it('forgets its starting guess once the soil has filled', () => {
    // Dry for 50 days, then 200 mm in a day.
    const tally = soilWaterTally(madeUp(start, 400, (i) => (i === 50 ? 200 : 0)));
    expect(tally.settledFrom).toBe(50);
    expect(tally.water[50]).toBe(100);
    expect(tally.index[50]).toBe(1);
  });

  it('follows the day-by-day rule', () => {
    const table = madeUp(start, 300, (i) => (i % 40 === 0 ? 170 : i % 7 === 0 ? 4 : 0), 6);
    const tally = soilWaterTally(table);
    for (let i = tally.settledFrom + 1; i < 300; i++) {
      expect(tally.water[i]).toBe(soilWaterDay(tally.water[i - 1]!, table.rain[i]!, table.et0[i]!));
      expect(tally.index[i]).toBe(waterIndex(tally.water[i]!));
    }
  });

  it('stops if the table is too short or too dry for the tally to settle', () => {
    expect(() => soilWaterTally(madeUp(start, 400, () => 0, 0))).toThrow(/too short/);
    expect(() => soilWaterTally(madeUp(start, 3, () => 1))).toThrow(/too short/);
  });

  it('stops on a missing figure', () => {
    const table = madeUp(start, 400, (i) => (i === 50 ? 200 : 0));
    table.rain[200] = NaN;
    expect(() => soilWaterTally(table)).toThrow(/figure missing on day 200/);
    const short = madeUp(start, 400, (i) => (i === 50 ? 200 : 0));
    short.et0 = short.et0.slice(0, 399);
    expect(() => soilWaterTally(short)).toThrow(/400 days of rain and 399 of et0/);
  });

  it('stops on a soil that makes no sense', () => {
    const table = madeUp(start, 400, (i) => (i === 50 ? 200 : 0));
    expect(() => soilWaterTally(table, { capacityMm: 0, easyShare: 0.6 })).toThrow(/capacity/);
    expect(() => soilWaterTally(table, { capacityMm: 100, easyShare: 1 })).toThrow(/easy share/);
  });
});

describe.each(IDS)('growth from real weather, %s', (id) => {
  const district = DISTRICTS[id];
  const growth = loadWeatherGrowth(id);
  const table = growth.table;

  it('has settled long before 1997', () => {
    expect(growth.first.year).toBe(1990);
    expect(growth.last).toEqual({ year: 2026, month: 10, date: 12 });
  });

  it('averages 1 in every calendar month over 1997 to 2025', () => {
    const sum = new Array<number>(12).fill(0);
    const n = new Array<number>(12).fill(0);
    for (const date of daysOf(SCALING_YEARS.first, SCALING_YEARS.last)) {
      sum[date.month] = sum[date.month]! + growth.factorOn(date);
      n[date.month] = n[date.month]! + 1;
    }
    for (let m = 0; m < 12; m++) {
      expect(Math.abs(sum[m]! / n[m]! - 1), `month ${m + 1}`).toBeLessThan(1e-9);
    }
  });

  it('gives the district curve its yearly growth back, to within 1 part in 100', () => {
    // Each day weighted by what the curve gives that day.
    let grown = 0;
    let average = 0;
    for (const date of daysOf(SCALING_YEARS.first, SCALING_YEARS.last)) {
      const c = districtPotential(district, date);
      grown += c * growth.factorOn(date);
      average += c;
    }
    expect(Math.abs(grown / average - 1)).toBeLessThan(0.01);
  });

  it('is the growth index over its long-run figure for the time of year, under the ceiling', () => {
    const tally = soilWaterTally(table);
    for (const date of daysOf(1995, 2026 - 1)) {
      const i = tableIndex(table, date);
      const expected = Math.min(1.9, tally.index[i]! / interpMonth(growth.scaling, date));
      expect(growth.factorOn(date)).toBe(expected);
    }
  });

  it('is never negative, never above the ceiling and always a number', () => {
    let lowest = Infinity;
    let highest = -Infinity;
    const from = daySerial(growth.first);
    for (let s = from; s < daySerial(table.first) + tableDays(table); s++) {
      const f = growth.factorOn(dateOfSerial(s));
      expect(Number.isFinite(f)).toBe(true);
      lowest = Math.min(lowest, f);
      highest = Math.max(highest, f);
    }
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(highest).toBeLessThanOrEqual(WEATHER_FACTOR_CEILING);
    expect(highest).toBeGreaterThan(1.5);
    for (const x of growth.scaling) {
      expect(x).toBeGreaterThan(0);
      // A figure can sit a touch over 1 where a month is always wet and its neighbours are not.
      expect(x).toBeLessThanOrEqual(1.05);
    }
  });

  it('only jumps up when it rains', () => {
    let biggestRise = 0;
    let risesOnDryDays = 0;
    let dryDays = 0;
    const from = daySerial(growth.first) + 1;
    for (let s = from; s < daySerial(table.first) + tableDays(table); s++) {
      const date = dateOfSerial(s);
      if (growth.rainOn(date) > 0) continue;
      dryDays++;
      const rise = growth.factorOn(date) - growth.factorOn(dateOfSerial(s - 1));
      if (rise > 0) risesOnDryDays++;
      biggestRise = Math.max(biggestRise, rise);
    }
    // With no rain the soil only dries. The factor can still creep up when
    // the time of year is one that is usually drier still.
    expect(biggestRise).toBeLessThan(0.05);
    expect(risesOnDryDays / dryDays).toBeLessThan(0.2);
  });

  it('gives the rain straight from the table', () => {
    for (const date of daysOf(1996, 2025)) {
      expect(growth.rainOn(date)).toBe(table.rain[tableIndex(table, date)]);
    }
    expect(growth.soilWaterOn({ year: 2010, month: 5, date: 1 })).toBeGreaterThanOrEqual(0);
    expect(growth.soilWaterOn({ year: 2010, month: 5, date: 1 })).toBeLessThanOrEqual(100);
  });

  it('gives the same numbers every time it is built', () => {
    const again = buildWeatherGrowth(district, loadWeatherTable(id));
    expect(again.scaling).toEqual(growth.scaling);
    for (const date of daysOf(1991, 2025)) {
      expect(again.factorOn(date)).toBe(growth.factorOn(date));
    }
  });

  it('refuses a day outside the table, and a day before the tally has settled', () => {
    expect(() => growth.factorOn({ year: 1989, month: 11, date: 31 })).toThrow(/no day 1989-12-31/);
    expect(() => growth.factorOn({ year: 2026, month: 10, date: 13 })).toThrow(/no day 2026-11-13/);
    expect(() => growth.rainOn({ year: 2027, month: 0, date: 1 })).toThrow(RangeError);
    expect(() => growth.factorOn({ year: 1990, month: 0, date: 1 })).toThrow(/has not settled/);
    expect(() => growth.soilWaterOn({ year: 1990, month: 0, date: 1 })).toThrow(/has not settled/);
  });

  it('does not shift past years when a later year is added to the table', () => {
    // The scaling years are fixed, so a table that stops at the end of 2025
    // gives the same factors as the full one.
    const to2025 = buildWeatherGrowth(
      district,
      cut(table, table.first, { year: 2025, month: 11, date: 31 }),
    );
    expect(to2025.scaling).toEqual(growth.scaling);
  });

  it('stops if the table does not hold every scaling year', () => {
    const oneDayShort = cut(table, table.first, { year: 2025, month: 11, date: 30 });
    expect(() => buildWeatherGrowth(district, oneDayShort)).toThrow(
      /must hold every day of 1997 to 2025/,
    );
    const noLeadIn = cut(
      table,
      { year: 1997, month: 0, date: 2 },
      { year: 2026, month: 10, date: 12 },
    );
    expect(() => buildWeatherGrowth(district, noLeadIn)).toThrow(
      /must hold every day of 1997 to 2025/,
    );
  });

  it('stops if a figure is missing', () => {
    const holed = cut(table, table.first, { year: 2026, month: 10, date: 12 });
    holed.et0[5000] = NaN;
    expect(() => buildWeatherGrowth(district, holed)).toThrow(/figure missing on day 5000/);
  });
});

describe('the scaling figures', () => {
  // Pinned so a change to the model, or a new weather pull that moves old
  // figures, is noticed. Update with docs/MODEL.md and docs/CALIBRATION.md.
  const PINNED: Record<DistrictId, number[]> = {
    cq: [
      0.2585, 0.5606, 0.201, 0.1786, 0.0957, 0.208, 0.2112, 0.0902, 0.0365, 0.0447, 0.2032, 0.3139,
    ],
    nsw: [
      0.5045, 0.7034, 0.6088, 0.662, 0.6145, 0.8126, 0.8552, 0.8077, 0.7118, 0.5727, 0.6613, 0.6682,
    ],
    cw: [
      0.145, 0.2569, 0.2442, 0.3502, 0.4113, 0.7824, 0.7846, 0.7148, 0.5524, 0.3478, 0.2588, 0.2059,
    ],
    wv: [
      0.0919, 0.1889, 0.142, 0.4314, 0.8279, 0.9779, 0.9998, 0.9981, 1.0097, 0.924, 0.6253, 0.2822,
    ],
  };

  it.each(IDS)('are the ones recorded for %s', (id) => {
    const scaling = loadWeatherGrowth(id).scaling;
    expect(scaling.map((x) => Number(x.toFixed(4)))).toEqual(PINNED[id]);
  });
});

describe('a month too dry to scale', () => {
  it('stops on real weather when the soil is too small for the district', () => {
    // Emerald on a 50 mm soil: September is dry so often that its scaling
    // figure falls under 0.01, where the factor would mean nothing.
    const table = loadWeatherTable('cq');
    expect(() =>
      buildWeatherGrowth(DISTRICTS.cq, table, { capacityMm: 50, easyShare: 0.6 }),
    ).toThrow(/month 9 is dry too often for the ceiling of 1\.9/);
    // The soil the game uses is clear of it in every district.
    for (const id of IDS) expect(Math.min(...loadWeatherGrowth(id).scaling)).toBeGreaterThan(0.03);
  });

  it('stops with a reason', () => {
    // Rain in one year in three, from January to March. In the other two
    // years the soil is empty, so no month can average 1 under the ceiling.
    const first = { year: 1994, month: 0, date: 1 };
    const days = daySerial({ year: 2026, month: 0, date: 1 }) - daySerial(first);
    const table = madeUp(
      first,
      days,
      (i) => {
        const date = dateOfSerial(daySerial(first) + i);
        return date.year % 3 === 0 && date.month < 3 ? 8 : 0;
      },
      6,
    );
    expect(() => buildWeatherGrowth(DISTRICTS.cq, table)).toThrow(
      /dry too often|could not be scaled|was never wet/,
    );
  });
});
