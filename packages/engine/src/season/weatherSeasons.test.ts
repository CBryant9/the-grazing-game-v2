import type { DistrictId } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { dateAt } from '../calendar';
import { DISTRICTS } from '../data/districts';
import { districtPotential } from '../pasture/potential';
import { loadWeatherGrowth } from '../server/weatherFiles';
import type { GrowthFactorSource } from './factors';
import { RUN_UP_DAYS, RUN_UP_SEASON_FLOOR, SEASON_OUTLOOKS } from './randomSeasons';
import { planRealYears } from './realYears';
import { WEATHER_FACTOR_CEILING, buildWeatherGrowth } from './weatherGrowth';
import {
  SEASON_LABEL_EDGES,
  SEASON_WINDOW_DAYS,
  seasonLabel,
  weatherSeasons,
  weatherYears,
  type WeatherSeasons,
} from './weatherSeasons';
import { daySerial, tableIndex } from './weatherTable';

const IDS: DistrictId[] = ['cq', 'nsw', 'cw', 'wv'];
const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** A farm in a district playing real years from a January start. */
function farm(
  id: DistrictId,
  firstYear: number,
  order: 'in-order' | 'random' = 'in-order',
  more: { seed?: number; startMonth?: number; runUpFloor?: number } = {},
) {
  const growth = loadWeatherGrowth(id);
  const startMonth = more.startMonth ?? 0;
  const plan = planRealYears({
    years: weatherYears(growth, startMonth),
    order,
    seed: more.seed ?? 1,
    startMonth,
    firstYear,
  });
  const seasons = weatherSeasons({ growth, plan, runUpFloor: more.runUpFloor });
  return { growth, plan, seasons };
}

/** The share of an average year's feed the given factors allow over a stretch of farm days. */
function shareOfAverage(
  id: DistrictId,
  start: { year: number; month: number },
  from: number,
  to: number,
  factor: (day: number) => number,
): number {
  let grown = 0;
  let average = 0;
  for (let day = from; day <= to; day++) {
    const c = districtPotential(DISTRICTS[id], dateAt(start, day));
    grown += c * factor(day);
    average += c;
  }
  return grown / average;
}

describe('the years a farm can start in', () => {
  it.each(IDS)('are 1997 to 2025 for a January start in %s', (id) => {
    expect(weatherYears(loadWeatherGrowth(id))).toEqual(range(1997, 2025));
  });

  it('stop a year sooner when the 12 months would run past the table', () => {
    const growth = loadWeatherGrowth('cq');
    // The table ends on 12 November 2026.
    expect(weatherYears(growth, 10).at(-1)).toBe(2025);
    expect(weatherYears(growth, 11).at(-1)).toBe(2024);
    expect(weatherYears(growth, 6)).toEqual(range(1997, 2025));
  });
});

describe('the years a farm can start in, with a shorter table', () => {
  it('need 905 days of settled table before them: the run-up and the look back', () => {
    const full = loadWeatherGrowth('nsw').table;
    // The same table from 1 January 1995 on.
    const skip = daySerial({ year: 1995, month: 0, date: 1 }) - daySerial(full.first);
    const growth = buildWeatherGrowth(DISTRICTS.nsw, {
      first: { year: 1995, month: 0, date: 1 },
      rain: full.rain.slice(skip),
      et0: full.et0.slice(skip),
    });
    expect(growth.first.year).toBe(1995);
    const years = weatherYears(growth);
    const lead = (year: number): number =>
      daySerial({ year, month: 0, date: 1 }) - daySerial(growth.first);
    // 1997 has under 905 days of settled table before it. 1998 has more.
    expect(lead(1997)).toBeLessThan(905);
    expect(lead(1998)).toBeGreaterThanOrEqual(905);
    expect(years[0]).toBe(1998);
    // The first year can be played right back to the start of its run-up look back.
    const plan = planRealYears({ years, order: 'in-order', seed: 1 });
    const seasons = weatherSeasons({ growth, plan });
    expect(() => seasons.factorsOn(-RUN_UP_DAYS)).not.toThrow();
  });
});

describe('the season in words', () => {
  it('uses the random seasons own six labels, in order', () => {
    expect(SEASON_LABEL_EDGES).toEqual([0.6, 0.8, 0.925, 1.075, 1.25]);
    expect(SEASON_LABEL_EDGES.length).toBe(SEASON_OUTLOOKS.length - 1);
    const at = [0, 0.5999, 0.6, 0.7999, 0.8, 0.9249, 0.925, 1, 1.0749, 1.075, 1.2499, 1.25, 1.9];
    expect(at.map(seasonLabel)).toEqual([
      'Drought',
      'Drought',
      'Well below average',
      'Well below average',
      'Below average',
      'Below average',
      'Average',
      'Average',
      'Average',
      'Above average',
      'Above average',
      'Wet',
      'Wet',
    ]);
  });

  it('gives each of the MVP season factors its own label', () => {
    for (const o of SEASON_OUTLOOKS) expect(seasonLabel(o.factor)).toBe(o.label);
  });

  it('changes at 0.8, where the grass model starts haying off faster', () => {
    expect(seasonLabel(0.8)).not.toBe(seasonLabel(0.7999));
  });

  it('describes and does not judge', () => {
    for (const o of SEASON_OUTLOOKS) {
      expect(o.label).not.toMatch(/good|bad|poor|great|terrible|overgraz|fail|should/i);
    }
  });
});

describe.each(IDS)('seasons from real weather, %s', (id) => {
  const { growth, plan, seasons } = farm(id, 2004);

  it('gives the real date and the real rain for a farm day', () => {
    for (const day of [-540, -1, 0, 59, 365, 366, 800, 2000]) {
      const date = dateAt(plan.start, day);
      expect(seasons.realDateOn(day)).toEqual(date);
      expect(seasons.rainOn(day)).toBe(growth.table.rain[tableIndex(growth.table, date)]);
      expect(seasons.soilWaterOn(day)).toBe(growth.soilWaterOn(date));
    }
  });

  it('gives the day its growth factor from the soil water on the real date', () => {
    for (let day = 0; day < 365 * 3; day++) {
      expect(seasons.factorsOn(day).monthF).toBe(growth.factorOn(dateAt(plan.start, day)));
    }
  });

  it('gives a season factor that is the feed of the last 365 days as a share of the average', () => {
    expect(SEASON_WINDOW_DAYS).toBe(365);
    for (const day of [400, 500, 731, 1000, 1500]) {
      const expected = shareOfAverage(id, plan.start, day - 364, day, (d) =>
        growth.factorOn(dateAt(plan.start, d)),
      );
      expect(seasons.factorsOn(day).seasonF).toBeCloseTo(expected, 12);
    }
  });

  it('labels the day by its season factor', () => {
    for (let day = -540; day < 365 * 4; day += 7) {
      const f = seasons.factorsOn(day);
      expect(f.label).toBe(seasonLabel(f.seasonF));
    }
  });

  it('stays in bounds on every day of every year', () => {
    const all = farm(id, 1997, 'in-order', { runUpFloor: 0 }).seasons;
    const last = Math.round((Date.UTC(2025, 11, 31) - Date.UTC(1997, 0, 1)) / 86400000);
    for (let day = -RUN_UP_DAYS; day <= last; day++) {
      const f = all.factorsOn(day);
      expect(f.monthF).toBeGreaterThanOrEqual(0);
      expect(f.monthF).toBeLessThanOrEqual(WEATHER_FACTOR_CEILING);
      expect(f.seasonF).toBeGreaterThan(0);
      expect(f.seasonF).toBeLessThanOrEqual(WEATHER_FACTOR_CEILING);
      expect(Number.isFinite(f.monthF) && Number.isFinite(f.seasonF)).toBe(true);
    }
  });

  it('moves the season factor a little at a time', () => {
    let biggest = 0;
    for (let day = 1; day < 365 * 6; day++) {
      biggest = Math.max(
        biggest,
        Math.abs(seasons.factorsOn(day).seasonF - seasons.factorsOn(day - 1).seasonF),
      );
    }
    // One day in 365, weighted by the curve, can't move the year far.
    expect(biggest).toBeLessThan(0.03);
  });

  it('gives the same answer whatever order the days are asked for in', () => {
    const forwards = farm(id, 2004).seasons;
    const backwards = farm(id, 2004).seasons;
    const days = range(-540, 900);
    const a = days.map((d) => forwards.factorsOn(d));
    const b = [...days]
      .reverse()
      .map((d) => backwards.factorsOn(d))
      .reverse();
    expect(b).toEqual(a);
    // And the same again when asked twice.
    expect(days.map((d) => forwards.factorsOn(d))).toEqual(a);
  });
});

describe('the pasture run-up', () => {
  const runUpShare = (id: DistrictId, s: WeatherSeasons, start: { year: number; month: number }) =>
    shareOfAverage(id, start, -RUN_UP_DAYS, -1, (d) => s.factorsOn(d).monthF);

  it('is lifted to 85% of an average year when the real weather before the start grew less', () => {
    // Central West, 1 January 2007: the 18 months before took in the dry year of 2006.
    const real = farm('cw', 2007, 'in-order', { runUpFloor: 0 });
    const went = runUpShare('cw', real.seasons, real.plan.start);
    expect(went).toBeLessThan(0.8);

    const { growth, plan, seasons } = farm('cw', 2007);
    expect(RUN_UP_SEASON_FLOOR).toBe(0.85);
    expect(runUpShare('cw', seasons, plan.start)).toBeCloseTo(0.85, 12);
    // Every run-up day is moved the same share of the way to an average day.
    const share = (0.85 - went) / (1 - went);
    for (let day = -RUN_UP_DAYS; day < 0; day++) {
      const was = growth.factorOn(dateAt(plan.start, day));
      expect(seasons.factorsOn(day).monthF).toBeCloseTo(was + share * (1 - was), 12);
    }
  });

  it('leaves play as the real weather, from day 0', () => {
    const { growth, plan, seasons } = farm('cw', 2007);
    for (let day = 0; day < 400; day++) {
      expect(seasons.factorsOn(day).monthF).toBe(growth.factorOn(dateAt(plan.start, day)));
    }
  });

  it('counts the lifted run-up in the season factor at the start, then the real weather takes over', () => {
    const lifted = farm('cw', 2007).seasons;
    const real = farm('cw', 2007, 'in-order', { runUpFloor: 0 }).seasons;
    expect(lifted.factorsOn(0).seasonF).toBeGreaterThan(real.factorsOn(0).seasonF + 0.2);
    // A year in, the look back holds no run-up days.
    expect(lifted.factorsOn(365).seasonF).toBe(real.factorsOn(365).seasonF);
  });

  it('is left alone when the real weather before the start grew more than 85%', () => {
    // Central West, 1 January 2011: 2010 was a wet year.
    const real = farm('cw', 2011, 'in-order', { runUpFloor: 0 });
    expect(runUpShare('cw', real.seasons, real.plan.start)).toBeGreaterThan(0.85);
    const { seasons } = farm('cw', 2011);
    for (let day = -RUN_UP_DAYS; day < 0; day++) {
      expect(seasons.factorsOn(day).monthF).toBe(real.seasons.factorsOn(day).monthF);
    }
  });

  it('never gives a run-up day a season factor under the floor, in any district or start year', () => {
    // The grass model hays green feed off faster under 0.8. The random
    // seasons never let the run-up get there, and neither does this.
    let lifted = 0;
    for (const id of IDS) {
      for (const year of weatherYears(loadWeatherGrowth(id))) {
        const { seasons } = farm(id, year);
        const real = farm(id, year, 'in-order', { runUpFloor: 0 }).seasons;
        for (let day = -RUN_UP_DAYS; day < 0; day += 7) {
          const s = seasons.factorsOn(day).seasonF;
          expect(s).toBeGreaterThanOrEqual(RUN_UP_SEASON_FLOOR);
          if (real.factorsOn(day).seasonF < 0.8) lifted++;
        }
      }
    }
    // The real weather would have gone under 0.8 on plenty of these days.
    expect(lifted).toBeGreaterThan(100);
  });

  it('leaves the days before the run-up as the weather really was', () => {
    const { growth, plan, seasons } = farm('cw', 2007);
    for (let day = -RUN_UP_DAYS - 365; day < -RUN_UP_DAYS; day += 5) {
      expect(seasons.factorsOn(day).monthF).toBe(growth.factorOn(dateAt(plan.start, day)));
    }
  });

  it('gives the real season factor again from day 0', () => {
    // Central West, 1 January 2007: the look back at the start is under the floor,
    // and the label says so.
    const { seasons } = farm('cw', 2007);
    expect(seasons.factorsOn(-1).seasonF).toBe(RUN_UP_SEASON_FLOOR);
    expect(seasons.factorsOn(0).seasonF).toBeLessThan(RUN_UP_SEASON_FLOOR);
  });

  it('refuses a floor or a run-up length that makes no sense', () => {
    const growth = loadWeatherGrowth('cw');
    const plan = planRealYears({ years: weatherYears(growth), order: 'in-order', seed: 1 });
    expect(() => weatherSeasons({ growth, plan, runUpFloor: 1.2 })).toThrow(RangeError);
    expect(() => weatherSeasons({ growth, plan, runUpFloor: -0.1 })).toThrow(RangeError);
    expect(() => weatherSeasons({ growth, plan, runUpDays: 10.5 })).toThrow(RangeError);
  });
});

describe('years in order and at random', () => {
  it('year 2 in order is the next real year', () => {
    const { growth, seasons } = farm('nsw', 2018);
    expect(seasons.realDateOn(364)).toEqual({ year: 2018, month: 11, date: 31 });
    expect(seasons.realDateOn(365)).toEqual({ year: 2019, month: 0, date: 1 });
    expect(seasons.factorsOn(365 + 200).monthF).toBe(
      growth.factorOn(dateAt({ year: 2019, month: 0 }, 200)),
    );
  });

  it('year 2 at random is the next year of the shuffle, with that year its own weather', () => {
    const { growth, plan, seasons } = farm('nsw', 2018, 'random', { seed: 77 });
    const second = plan.yearAt(1);
    expect(second).not.toBe(2018);
    expect(seasons.realDateOn(365)).toEqual({ year: second, month: 0, date: 1 });
    for (const offset of [0, 30, 200, 364]) {
      // The farm's own calendar gives the month and day. The shuffle gives the year.
      const onFarm = dateAt(plan.start, 365 + offset);
      const date = { year: second, month: onFarm.month, date: onFarm.date };
      expect(seasons.factorsOn(365 + offset).monthF).toBe(growth.factorOn(date));
      expect(seasons.rainOn(365 + offset)).toBe(growth.rainOn(date));
    }
  });

  it('looks back over the game the farm has played, not the real year before', () => {
    // At random, the 365 days before a day in year 2 are year 1 of the game.
    const { growth, plan, seasons } = farm('nsw', 2018, 'random', { seed: 77 });
    const day = 365 + 100;
    const expected = shareOfAverage('nsw', plan.start, day - 364, day, (d) =>
      growth.factorOn(plan.realDateOn(d)),
    );
    expect(seasons.factorsOn(day).seasonF).toBeCloseTo(expected, 12);
  });

  it('gives the same seasons for the same seed', () => {
    const a = farm('wv', 2001, 'random', { seed: 5 }).seasons;
    const b = farm('wv', 2001, 'random', { seed: 5 }).seasons;
    const c = farm('wv', 2001, 'random', { seed: 6 }).seasons;
    const days = range(0, 365 * 5);
    const of = (s: GrowthFactorSource) => days.map((d) => s.factorsOn(d).monthF);
    expect(of(a)).toEqual(of(b));
    expect(of(a)).not.toEqual(of(c));
  });

  it('runs a year from a start in another month, across New Year, on real days', () => {
    const { growth, plan, seasons } = farm('cq', 2010, 'random', { seed: 9, startMonth: 8 });
    expect(plan.start).toEqual({ year: 2010, month: 8 });
    for (let day = 0; day < 365; day++) {
      const date = dateAt(plan.start, day);
      expect(seasons.realDateOn(day)).toEqual(date);
      expect(seasons.factorsOn(day).monthF).toBe(growth.factorOn(date));
    }
    expect(seasons.realDateOn(365)).toEqual({ year: plan.yearAt(1), month: 8, date: 1 });
  });

  it('goes back to 1997 after the newest year, in order', () => {
    const { seasons } = farm('cw', 2025);
    expect(seasons.realDateOn(365)).toEqual({ year: 1997, month: 0, date: 1 });
    expect(() => seasons.factorsOn(365 + 10)).not.toThrow();
  });
});

describe('weather the table does not hold', () => {
  it('is an error, not a guess', () => {
    const growth = loadWeatherGrowth('cq');
    // A plan that claims 2026 can be played. The table stops on 12 November 2026.
    const plan = planRealYears({
      years: [...weatherYears(growth), 2026],
      order: 'in-order',
      seed: 1,
      firstYear: 2026,
    });
    const seasons = weatherSeasons({ growth, plan });
    expect(() => seasons.factorsOn(300)).not.toThrow();
    // The look back over the season reaches the first missing day first.
    expect(() => seasons.factorsOn(330)).toThrow(/no day 2026-11-13/);
    expect(() => seasons.rainOn(330)).toThrow(/no day 2026-11-27/);
  });

  it('is an error for a day that is not a whole day', () => {
    const { seasons } = farm('cq', 2000);
    expect(() => seasons.factorsOn(1.5)).toThrow(RangeError);
  });
});
