import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../actions/apply';
import type { Action } from '../actions/types';
import { dateAt, type CalendarDate } from '../calendar';
import { generateFarm } from '../farm/generate';
import { buyPrice } from '../market/prices';
import { realPricesOn } from '../market/realMarket';
import { buildRealData, type RealData } from '../real/realData';
import { rngStream } from '../rng';
import { farmHash, loadFarm, saveFarm, type SavedFarm } from '../save/save';
import { averageYear } from '../season/factors';
import { isLeapYear, planRealYears, type RealYearPlan, type YearOrder } from '../season/realYears';
import { weatherSeasons } from '../season/weatherSeasons';
import { daySerial, isoDate } from '../season/weatherTable';
import { loadRealData, readRawTable } from '../server';
import { SAVE_FORMAT_VERSION } from '../version';
import { createFarm, type CreateFarmOptions } from './create';
import { dateOn, nextSaleDay, pricesOf, realPlanOf, saleDayOn, seasonsOf } from './derived';
import { PLAY_STREAMS, cloneFarm, type FarmState, type RealYearsSpec } from './state';
import { farmTotals, mobSummaries, paddockSummaries } from './summary';
import { stepDay, type DayResult } from './tick';

/*
 * A farm that plays real years, through the engine's own wiring
 * (docs/MODEL.md, section 1A): made by createFarm, stepped by stepDay,
 * acted on by applyAction, with the real data handed in as `env.data`.
 */

vi.setConfig({ testTimeout: 600_000 });

const data = loadRealData();
const env = { data };

const options = (over: Partial<CreateFarmOptions> = {}): CreateFarmOptions => ({
  seed: 7,
  district: 'cw',
  size: 'small',
  start: { year: 2001, month: 0 },
  startType: 'scratch',
  difficulty: 'medium',
  years: { kind: 'real', order: 'in-order' },
  ...over,
});

const real = (over: Partial<CreateFarmOptions> = {}): FarmState => createFarm(options(over), env);

/** The plan a farm's years should follow, worked out here from the data and the options. */
function planFor(o: CreateFarmOptions, order: YearOrder): RealYearPlan {
  return planRealYears({
    years: data.district(o.district).years(o.start.month),
    order,
    seed: o.seed,
    startMonth: o.start.month,
    firstYear: o.start.year,
  });
}

/** Step a farm and return each day's result. The game must not end part-way. */
function run(farm: FarmState, days: number): DayResult[] {
  const out: DayResult[] = [];
  for (let d = 0; d < days; d++) {
    const r = stepDay(farm, env);
    expect(r.ran, `day ${r.day}`).toBe(true);
    out.push(r);
  }
  return out;
}

const viaJson = (farm: FarmState): FarmState =>
  loadFarm(JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm);

const text = (d: CalendarDate): string => isoDate(d);

describe('making a real-year farm', () => {
  it('needs the real data bundle', () => {
    expect(() => createFarm(options())).toThrow(/needs the real weather and price tables/);
    expect(() => createFarm(options(), {})).toThrow(/needs the real weather and price tables/);
  });

  it('records the order, the first year, the years that can be played and the data version', () => {
    const farm = real();
    expect(farm.seasons).toEqual({
      kind: 'real',
      order: 'in-order',
      firstYear: 2001,
      years: { first: 1997, last: 2025 },
      dataVersion: data.district('cw').version,
    });
    expect(farm.start).toEqual({ year: 2001, month: 0 });
    expect(farm.day).toBe(0);
    const shuffled = real({ years: { kind: 'real', order: 'random' } });
    expect((shuffled.seasons as RealYearsSpec).order).toBe('random');
    expect(shuffled.start).toEqual({ year: 2001, month: 0 });
  });

  it('with no first year: in order starts at the oldest year, at random draws one from the seed', () => {
    const inOrder = real({ start: { month: 3 } });
    expect(inOrder.start).toEqual({ year: 1997, month: 3 });
    const firsts = [1, 2, 3, 4, 5, 6].map((seed) => {
      const farm = real({ seed, start: { month: 3 }, years: { kind: 'real', order: 'random' } });
      const o = options({ seed, start: { month: 3 } });
      expect(farm.start.year).toBe(planFor(o, 'random').start.year);
      expect(farm.start.month).toBe(3);
      expect((farm.seasons as RealYearsSpec).firstYear).toBe(farm.start.year);
      return farm.start.year;
    });
    for (const y of firsts) {
      expect(y).toBeGreaterThanOrEqual(1997);
      expect(y).toBeLessThanOrEqual(2025);
    }
    expect(new Set(firsts).size).toBeGreaterThan(2);
  });

  it('refuses a first year that cannot be played', () => {
    expect(() => real({ start: { year: 1996, month: 0 } })).toThrow(/1996 is not a year/);
    expect(() => real({ start: { year: 2026, month: 0 } })).toThrow(/2026 is not a year/);
    // A December start in 2025 would run past the tables.
    expect(() => real({ start: { year: 2025, month: 11 } })).toThrow(/2025 is not a year/);
    expect(real({ start: { year: 2024, month: 11 } }).start).toEqual({ year: 2024, month: 11 });
  });

  it('gives the same farm for the same seed, options and data, and another for another', () => {
    const a = farmHash(real());
    expect(farmHash(real())).toBe(a);
    // A second bundle built from the same tables is the same data.
    expect(farmHash(createFarm(options(), { data: buildRealData(readRawTable) }))).toBe(a);
    expect(farmHash(real({ seed: 8 }))).not.toBe(a);
    expect(farmHash(real({ start: { year: 2002, month: 0 } }))).not.toBe(a);
    expect(farmHash(real({ start: { year: 2001, month: 1 } }))).not.toBe(a);
    expect(farmHash(real({ years: { kind: 'real', order: 'random' } }))).not.toBe(a);
    expect(farmHash(real({ district: 'nsw' }))).not.toBe(a);
  });

  it('runs the pasture up on the real weather before the start, not on random seasons', () => {
    for (const o of [
      options(),
      options({ district: 'cq', start: { year: 2003, month: 8 }, startType: 'running' }),
      options({
        district: 'wv',
        start: { year: 2019, month: 3 },
        mixed: { arablePct: 20, croppedPct: 50 },
      }),
    ]) {
      const farm = createFarm(o, env);
      const plan = planFor(o, 'in-order');
      const seasons = weatherSeasons({ growth: data.district(o.district).weather, plan });
      const gen = (source?: typeof seasons) =>
        generateFarm({
          seed: o.seed,
          district: o.district,
          farmHa: farm.layout.scale.farmHa,
          start: plan.start,
          startType: o.startType,
          mixed: o.mixed,
          seasons: source,
        });
      expect(farm.pasture).toEqual(gen(seasons).pasture);
      expect(farm.crops).toEqual(gen(seasons).crops);
      // With the seed's random seasons the run-up leaves another pasture.
      expect(Array.from(farm.pasture.G)).not.toEqual(Array.from(gen().pasture.G));
      // The land itself is the same either way: only the weather differs.
      expect(farm.pasture.F).toEqual(gen().pasture.F);
      expect(farm.layout.fences).toEqual(gen().layout.fences);
    }
  });

  it('reports the season of the real 12 months before the start', () => {
    // Dubbo: the year to 1 January 2003 was a drought, and the year to 1 January 2011 was wet.
    const dry = real({ start: { year: 2003, month: 0 } });
    const wet = real({ start: { year: 2011, month: 0 } });
    const seasonOf = (farm: FarmState) => {
      const e = farm.inbox[0]!.event;
      if (e.type !== 'farm-started') throw new Error('no start event');
      return e.season;
    };
    expect(seasonOf(dry).factor).toBeLessThan(seasonOf(wet).factor);
    expect(seasonOf(wet).label).toBe('Wet');
    expect(seasonOf(dry)).toEqual({
      label: seasonsOf(dry, env).factorsOn(0).label,
      factor: seasonsOf(dry, env).factorsOn(0).seasonF,
    });
  });

  it("opens the market on the real prices of its first day, in today's dollars, and draws nothing", () => {
    for (const id of DISTRICT_IDS) {
      const farm = real({ district: id, start: { year: 2012, month: 4 } });
      const d = data.district(id);
      const p = realPricesOn(d.prices, d.cpi, { year: 2012, month: 4, date: 1 }, 'today');
      expect(farm.market).toEqual({
        kind: 'real',
        dollars: 'today',
        indicator: p.indicator,
        classes: p.classes,
      });
      expect(pricesOf(farm)).toEqual(p);
      // The market stream is where a fresh one starts: the real market never draws from it.
      expect(farm.rng.market).toEqual(rngStream(7, PLAY_STREAMS.market).state());
    }
  });

  it("values a running farm's herd at the real prices of its first day", () => {
    const farm = real({ startType: 'running', start: { year: 1998, month: 6 } });
    const d = data.district('cw');
    const prices = realPricesOn(d.prices, d.cpi, { year: 1998, month: 6, date: 1 }, 'today');
    let head = 0;
    for (const m of farm.mobs) {
      for (const a of m.animals) {
        // A calf at foot is paid for with its mother.
        if (a.kind === 'calf') continue;
        expect(a.paid).toBe(buyPrice(a, prices));
        head++;
      }
    }
    expect(head).toBeGreaterThan(20);
    // The same herd at the prices of the day would be worth well under half as much.
    const ofTheDay = realPricesOn(d.prices, d.cpi, { year: 1998, month: 6, date: 1 }, 'of-the-day');
    expect(prices.indicator / ofTheDay.indicator).toBeCloseTo(103.64 / 46.91, 6);
  });

  it('leaves a farm with random seasons exactly as it was, with or without the bundle', () => {
    const random: CreateFarmOptions = {
      seed: 7,
      district: 'cw',
      size: 'small',
      start: { year: 2021, month: 3 },
      startType: 'running',
      difficulty: 'medium',
    };
    const a = createFarm(random);
    const b = createFarm(random, env);
    const c = createFarm({ ...random, years: { kind: 'random' } }, env);
    expect(a.seasons).toEqual({ kind: 'random' });
    expect(a.market.kind).toBe('standIn');
    expect(farmHash(b)).toBe(farmHash(a));
    expect(farmHash(c)).toBe(farmHash(a));
    for (let d = 0; d < 40; d++) {
      const ra = stepDay(a);
      const rb = stepDay(b, env);
      expect(rb.date).toEqual(ra.date);
      expect(rb.date).toEqual(dateAt({ year: 2021, month: 3 }, d));
    }
    expect(farmHash(b)).toBe(farmHash(a));
    expect(realPlanOf(a)).toBeNull();
    expect(() => createFarm({ ...random, start: { month: 3 } })).toThrow(/needs a start year/);
  });
});

describe('a day on a real-year farm', () => {
  it('grows on the real weather: the same as stepping with the weather source handed in', () => {
    const o = options({ startType: 'running', start: { year: 2009, month: 3 } });
    const own = createFarm(o, env);
    const given = cloneFarm(own);
    const average = cloneFarm(own);
    const seasons = weatherSeasons({
      growth: data.district('cw').weather,
      plan: planFor(o, 'in-order'),
    });
    for (let d = 0; d < 420; d++) {
      stepDay(own, env);
      stepDay(given, { data, seasons });
      stepDay(average, { data, seasons: averageYear });
    }
    expect(farmHash(given)).toBe(farmHash(own));
    expect(own.year.grown).not.toBe(average.year.grown);
    // 1 April 2009 to 31 March 2010 closed as one year. The year under way is on real weather too.
    expect(own.years.length).toBe(1);
    expect(own.years[0]!.grown).not.toBe(average.years[0]!.grown);
  });

  it('reports the real date, which in order is the calendar date from the start', () => {
    const farm = real({ start: { year: 2003, month: 10 } });
    const results = run(farm, 800);
    for (const r of results) {
      expect(r.date).toEqual(dateAt({ year: 2003, month: 10 }, r.day));
    }
    // 29 February 2004 is a day like any other.
    expect(results.map((r) => text(r.date))).toContain('2004-02-29');
    expect(text(results[0]!.date)).toBe('2003-11-01');
    expect(text(results.at(-1)!.date)).toBe('2006-01-08');
    expect(dateOn(farm)).toEqual({ year: 2006, month: 0, date: 9 });
    expect(dateOn(farm, 0)).toEqual({ year: 2003, month: 10, date: 1 });
    expect(farmTotals(farm, env).date).toEqual({ year: 2006, month: 0, date: 9 });
  });

  it('moves the market to the real prices of each new day, and never draws from the market stream', () => {
    const farm = real({ district: 'nsw', start: { year: 2002, month: 11 } });
    const d = data.district('nsw');
    const plan = realPlanOf(farm)!;
    const stream = farm.rng.market;
    for (let day = 0; day < 500; day++) {
      stepDay(farm, env);
      const p = realPricesOn(d.prices, d.cpi, plan.realDateOn(day + 1), 'today');
      expect(pricesOf(farm)).toEqual(p);
      expect(farm.priceHistory.at(-1)).toEqual({ day: day + 1, c: p.classes });
    }
    expect(farm.priceHistory.length).toBe(31);
    expect(farm.rng.market).toEqual(stream);
    // The prices moved: 500 days hold many different indicator values.
    expect(new Set(farm.priceHistory.map((h) => h.c.feed)).size).toBeGreaterThan(3);
  });

  it('closes each year when the real year ends, 365 or 366 days on', () => {
    const farm = real({ start: { year: 1999, month: 0 } });
    const ends: number[] = [];
    for (const r of run(farm, 366 * 4)) {
      for (const e of r.events) {
        if (e.type !== 'year-end') continue;
        ends.push(r.day);
        // The year ends on the last day of December.
        expect(r.date.month).toBe(11);
        expect(r.date.date).toBe(31);
      }
    }
    // 1999 has 365 days, 2000 has 366, 2001 and 2002 have 365.
    expect(ends).toEqual([364, 364 + 366, 364 + 366 + 365, 364 + 366 + 365 + 365]);
    expect(farm.years.map((y) => y.realYear)).toEqual([1999, 2000, 2001, 2002]);
    expect(farm.years.map((y) => y.n)).toEqual([1, 2, 3, 4]);
    expect(farm.years.map((y) => y.end - y.start)).toEqual([365, 366, 365, 365]);
    // Twelve readings of ground cover in every year, on the 1st of each month.
    for (const y of farm.years) expect(y.covers.length).toBe(12);
  });

  it('closes a year that starts in July on 30 June, leap day and all', () => {
    const farm = real({ district: 'wv', start: { year: 2003, month: 6 } });
    const results = run(farm, 366 + 365);
    const ends = results.filter((r) => r.events.some((e) => e.type === 'year-end'));
    expect(ends.map((r) => text(r.date))).toEqual(['2004-06-30', '2005-06-30']);
    // July 2003 to June 2004 holds 29 February 2004.
    expect(farm.years.map((y) => y.end - y.start)).toEqual([366, 365]);
    expect(farm.years.map((y) => y.realYear)).toEqual([2003, 2004]);
  });

  it('a farm with random seasons still closes its year every 365 days', () => {
    const farm = createFarm({ ...options(), years: undefined, start: { year: 1999, month: 0 } });
    for (let d = 0; d < 366 * 2; d++) stepDay(farm);
    expect(farm.years.map((y) => y.end)).toEqual([365, 730]);
    expect(farm.years.every((y) => y.realYear === undefined)).toBe(true);
  });

  it('says a new season on each real 1 July, with the season of the 12 months to that day', () => {
    const farm = real({ district: 'cq', start: { year: 2001, month: 8 } });
    const seen: string[] = [];
    for (const r of run(farm, 900)) {
      for (const e of r.events) {
        if (e.type !== 'new-season') continue;
        seen.push(text(r.date));
        const f = seasonsOf(farm, env).factorsOn(r.day);
        expect(e.label).toBe(f.label);
        expect(e.factor).toBe(f.seasonF);
      }
    }
    expect(seen).toEqual(['2002-07-01', '2003-07-01']);
  });
});

describe('the years in order, past the newest year', () => {
  it('goes from 31 December 2025 back to 1 January 1997, weather, prices and date', () => {
    const farm = real({ start: { year: 2025, month: 0 } });
    const d = data.district('cw');
    const results = run(farm, 365 + 366);
    expect(text(results[364]!.date)).toBe('2025-12-31');
    expect(text(results[365]!.date)).toBe('1997-01-01');
    expect(text(results.at(-1)!.date)).toBe('1998-01-01');
    expect(farm.years.map((y) => y.realYear)).toEqual([2025, 1997]);
    expect(farm.years.map((y) => y.end - y.start)).toEqual([365, 365]);
    // The price on the first day of the second year is the price of 1 January 1997.
    const again = real({ start: { year: 2025, month: 0 } });
    run(again, 365);
    expect(text(dateOn(again))).toBe('1997-01-01');
    expect(pricesOf(again)).toEqual(
      realPricesOn(d.prices, d.cpi, { year: 1997, month: 0, date: 1 }, 'today'),
    );
    // And the growth of its second year is the growth 1997's weather gives.
    const seasons = seasonsOf(again, env);
    for (const day of [365, 400, 500, 700]) {
      const date = realPlanOf(again)!.realDateOn(day);
      expect(date.year).toBe(1997);
      expect(seasons.factorsOn(day).monthF).toBe(d.weather.factorOn(date));
    }
  });

  it('keeps the month and day of the farm calendar on every day, and passes over a leap day the real year has', () => {
    // From 2025 the farm's own calendar runs on through 2026, 2027, 2028 while the real years go 1997, 1998, 1999.
    const farm = real({ start: { year: 2025, month: 0 } });
    const plan = realPlanOf(farm)!;
    let doubled = 0;
    const realDays = new Set<string>();
    for (let day = 0; day < 365 * 12; day++) {
      const own = dateAt(farm.start, day);
      const date = plan.realDateOn(day);
      expect(date.month).toBe(own.month);
      if (own.month === 1 && own.date === 29 && !isLeapYear(date.year)) {
        // The farm calendar has a 29 February the real year does not: 28 February is read again.
        expect(date.date).toBe(28);
        doubled++;
      } else expect(date.date).toBe(own.date);
      realDays.add(text(date));
    }
    // Farm years 2028, 2032 and 2036 are leap years. Their real years, 1999, 2003 and 2007, are not.
    expect(doubled).toBe(3);
    // Real 2000 is a leap year. Its farm year, 2029, is not, so 29 February 2000 is not played.
    expect(realDays.has('2000-02-28')).toBe(true);
    expect(realDays.has('2000-02-29')).toBe(false);
    expect(realDays.has('2000-03-01')).toBe(true);
  });

  it('never parts from the calendar in the 29 years before it goes round', () => {
    const farm = real({ start: { year: 1997, month: 0 } });
    const plan = realPlanOf(farm)!;
    const days =
      daySerial({ year: 2026, month: 0, date: 1 }) - daySerial({ year: 1997, month: 0, date: 1 });
    for (let day = 0; day < days; day++) {
      expect(plan.realDateOn(day)).toEqual(dateAt(farm.start, day));
    }
    expect(text(plan.realDateOn(days))).toBe('1997-01-01');
  });
});

describe('the years at random', () => {
  it('plays each game year in the real year the seed drew, whole', () => {
    const o = options({ seed: 11, start: { month: 3 }, years: { kind: 'real', order: 'random' } });
    const farm = createFarm(o, env);
    const plan = planFor(o, 'random');
    const d = data.district('cw');
    const results = run(farm, 365 * 3 + 2);
    const years = [0, 1, 2].map((g) => plan.yearAt(g));
    expect(new Set(years).size).toBe(3);
    expect(farm.years.map((y) => y.realYear)).toEqual(years);
    for (const r of results) {
      const g = plan.gameYearOn(r.day);
      // A game year runs from 1 April to 31 March, so its days carry two calendar years.
      const base = plan.yearAt(g);
      expect([base, base + 1]).toContain(r.date.year);
      expect(r.date).toEqual(plan.realDateOn(r.day));
    }
    // Each year starts on 1 April of its real year and the day before is 31 March of the year before's.
    const starts = results.filter((r) => r.date.month === 3 && r.date.date === 1);
    expect(starts.map((r) => r.date.year)).toEqual([...years, plan.yearAt(3)]);
    // Prices and weather follow the same date.
    expect(pricesOf(farm)).toEqual(realPricesOn(d.prices, d.cpi, dateOn(farm), 'today'));
    const last = results.at(-1)!;
    expect(seasonsOf(farm, env).factorsOn(last.day).monthF).toBe(d.weather.factorOn(last.date));
  });

  it('plays every year once before any year twice, and no year twice running', () => {
    const farm = real({ seed: 3, years: { kind: 'real', order: 'random' } });
    const plan = realPlanOf(farm)!;
    const first = Array.from({ length: 29 }, (_, g) => plan.yearAt(g));
    expect([...first].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 29 }, (_, i) => 1997 + i),
    );
    expect(first[0]).toBe(2001);
    for (let g = 1; g < 120; g++) expect(plan.yearAt(g)).not.toBe(plan.yearAt(g - 1));
  });

  it('keeps the month and day of the farm calendar, with at most one day a year out', () => {
    const farm = real({ seed: 5, start: { month: 0 }, years: { kind: 'real', order: 'random' } });
    const plan = realPlanOf(farm)!;
    let doubled = 0;
    for (let day = 0; day < 365 * 40; day++) {
      const own = dateAt(farm.start, day);
      const date = plan.realDateOn(day);
      expect(date.month).toBe(own.month);
      if (date.date !== own.date) {
        expect([own.month, own.date, date.date]).toEqual([1, 29, 28]);
        doubled++;
      }
    }
    // The farm calendar has 10 leap days in 40 years. Some land on a real leap year and some do not.
    expect(doubled).toBeGreaterThan(0);
    expect(doubled).toBeLessThanOrEqual(10);
  });
});

describe('a real-year farm without its data', () => {
  const farm = real({ startType: 'running' });
  run(farm, 5);
  const hash = farmHash(farm);
  const mob = farm.mobs[0]!.id;
  const NEEDS = /needs the real weather and price tables/;

  it('will not step, and nothing on the farm changes', () => {
    expect(() => stepDay(farm)).toThrow(NEEDS);
    expect(() => stepDay(farm, {})).toThrow(NEEDS);
    // Handing in a season source is not enough: the prices and the date are real too.
    expect(() => stepDay(farm, { seasons: averageYear })).toThrow(NEEDS);
    expect(farm.day).toBe(5);
    expect(farmHash(farm)).toBe(hash);
  });

  it('will not take an action, whether or not the action reads the weather', () => {
    const jobs: Action[] = [
      { type: 'setSupplement', mob, supp: 'hay' },
      { type: 'buyCattle', cls: 'weanerSteer', qty: 5, to: { mob } },
      { type: 'wean', mob },
    ];
    for (const job of jobs) {
      expect(() => applyAction(farm, job), job.type).toThrow(NEEDS);
      expect(() => applyAction(farm, job, { seasons: averageYear }), job.type).toThrow(NEEDS);
    }
    expect(applyAction(farm, jobs[0]!, env).ok).toBe(true);
    expect(farmHash(farm)).toBe(hash);
  });

  it('will not give the figures that read the weather, and still gives the ones that do not', () => {
    expect(() => farmTotals(farm)).toThrow(NEEDS);
    expect(() => paddockSummaries(farm)).toThrow(NEEDS);
    expect(() => seasonsOf(farm)).toThrow(NEEDS);
    expect(() => nextSaleDay(farm, {})).toThrow(NEEDS);
    // Today's prices and the date are on the farm itself.
    expect(pricesOf(farm).indicator).toBeGreaterThan(0);
    expect(mobSummaries(farm).length).toBe(farm.mobs.length);
    expect(text(dateOn(farm))).toBe('2001-01-06');
  });

  it('will not step after a save and a load either', () => {
    const back = viaJson(farm);
    expect(back.seasons).toEqual(farm.seasons);
    expect(() => stepDay(back)).toThrow(NEEDS);
    expect(stepDay(back, env).ran).toBe(true);
  });

  it('will not run on data of another version: a changed table is refused, not used', () => {
    // The same tables, with one rain figure in the Dubbo weather changed.
    const changed: RealData = buildRealData((path) => {
      const t = readRawTable(path);
      return path === 'silo/cw.csv' ? t.replace('\n2015-06-01,', '\n2015-06-01,9') : t;
    });
    expect(changed.district('cw').version).not.toBe(data.district('cw').version);
    const OTHER =
      /started on real data version [0-9a-f]{16}\. The data given is version [0-9a-f]{16}/;
    expect(() => stepDay(farm, { data: changed })).toThrow(OTHER);
    expect(() => applyAction(farm, { type: 'markCalves', mob }, { data: changed })).toThrow(OTHER);
    expect(() => farmTotals(farm, { data: changed })).toThrow(OTHER);
    expect(farmHash(farm)).toBe(hash);
    // A farm made on the changed data runs on it, and not on the first.
    const other = createFarm(options(), { data: changed });
    expect(stepDay(other, { data: changed }).ran).toBe(true);
    expect(() => stepDay(other, env)).toThrow(OTHER);
    // Another district's table changing does not touch this farm.
    const elsewhere = buildRealData((path) =>
      path === 'silo/cq.csv'
        ? readRawTable(path).replace('\n2015-06-01,', '\n2015-06-01,9')
        : readRawTable(path),
    );
    expect(stepDay(cloneFarm(farm), { data: elsewhere }).ran).toBe(true);
  });

  it('runs with a season source handed in, and still on real prices and the real date', () => {
    const copy = cloneFarm(farm);
    const d = data.district('cw');
    for (let n = 0; n < 60; n++) {
      const r = stepDay(copy, { data, seasons: averageYear });
      expect(r.date).toEqual(dateAt({ year: 2001, month: 0 }, r.day));
    }
    expect(pricesOf(copy)).toEqual(realPricesOn(d.prices, d.cpi, dateOn(copy), 'today'));
  });
});

describe('save, load and carry on, on a real-year farm', () => {
  it.each([
    ['cw', 'in-order', { year: 2024, month: 9 }],
    ['cq', 'random', { month: 8 }],
    ['nsw', 'random', { year: 2010, month: 0 }],
    ['wv', 'in-order', { year: 2003, month: 6 }],
  ] as const)('%s, %s: is exactly the farm that ran straight through', (district, order, start) => {
    const script = (reload: boolean): string[] => {
      let farm = real({
        seed: 31,
        district,
        start,
        startType: 'running',
        difficulty: 'easy',
        years: { kind: 'real', order },
      });
      const bore = farm.layout.water.bore;
      const jobs: [number, Action][] = [
        [2, { type: 'buyCattle', cls: 'cowCalf', qty: 12, to: { cell: bore } }],
        [9, { type: 'buyCattle', cls: 'yearSteer', qty: 30, to: { cell: bore } }],
        [45, { type: 'sellClass', cls: 'cow', qty: 3 }],
        [200, { type: 'sellClass', cls: 'feed', qty: 10 }],
        [380, { type: 'buyCattle', cls: 'weanerSteer', qty: 20, to: { cell: bore } }],
      ];
      const hashes: string[] = [];
      for (let d = 0; d < 480 && !farm.over; d++) {
        for (const [day, job] of jobs) {
          if (day !== d) continue;
          const out = applyAction(farm, job, env);
          if (out.ok) farm = out.farm;
        }
        stepDay(farm, env);
        // Every 7 days the farm goes to storage and comes back.
        if (reload && d % 7 === 0) farm = viaJson(farm);
        if (d % 20 === 19) hashes.push(farmHash(farm));
      }
      // The run went over a year end, so the next real year's weather and prices were picked up.
      expect(farm.years.length).toBeGreaterThanOrEqual(1);
      expect(farm.actionLog.length).toBeGreaterThanOrEqual(3);
      return hashes;
    };
    const straight = script(false);
    const reloaded = script(true);
    expect(reloaded).toEqual(straight);
    expect(straight.length).toBeGreaterThan(10);
    expect(new Set(straight).size).toBe(straight.length);
  });

  it("a save holds no tables: it is the size of a random-season farm's save", () => {
    const o = options({ startType: 'running', size: 'medium' });
    const realFarm = createFarm(o, env);
    const randomFarm = createFarm({ ...o, years: undefined });
    for (let d = 0; d < 60; d++) {
      stepDay(realFarm, env);
      stepDay(randomFarm);
    }
    const saved = saveFarm(realFarm);
    const size = JSON.stringify(saved).length;
    const other = JSON.stringify(saveFarm(randomFarm)).length;
    // The cattle differ a little between the two, so the sizes are close and not equal.
    expect(Math.abs(size - other) / other).toBeLessThan(0.1);
    expect(size).toBeLessThan(400_000);
    expect(saved.saveFormat).toBe(SAVE_FORMAT_VERSION);
    expect(saved.seasons).toEqual(realFarm.seasons);
    expect(saved.market).toEqual(realFarm.market);
    // What the farm keeps of the real data is its years, the version and today's prices.
    expect(Object.keys(saved.seasons as object).sort()).toEqual([
      'dataVersion',
      'firstYear',
      'kind',
      'order',
      'years',
    ]);
    expect(Object.keys(saved.market as object).sort()).toEqual([
      'classes',
      'dollars',
      'indicator',
      'kind',
    ]);
  });

  it('a copy made by an action carries on the same as a farm loaded from a save', () => {
    let farm = real({ startType: 'running', start: { year: 2016, month: 2 } });
    run(farm, 30);
    const out = applyAction(farm, { type: 'sellClass', cls: 'cow', qty: 2 }, env);
    if (!out.ok) throw new Error(out.message);
    farm = out.farm;
    const loaded = viaJson(farm);
    for (let d = 0; d < 120; d++) {
      stepDay(farm, env);
      stepDay(loaded, env);
    }
    expect(farmHash(loaded)).toBe(farmHash(farm));
  });
});

describe('sale days on a real-year farm', () => {
  it("reads the district yard's calendar on the real date behind each farm day", () => {
    const farm = real({ start: { year: 2010, month: 0 } });
    const cal = data.district('cw').cattleSales;
    const plan = realPlanOf(farm)!;
    let sales = 0;
    for (let day = 0; day < 365; day++) {
      const sale = saleDayOn(farm, env, day);
      const realSale = cal.saleOn(plan.realDateOn(day));
      if (!realSale) expect(sale).toBeNull();
      else {
        expect(sale).toEqual({ ...realSale, day });
        sales++;
      }
    }
    // Dubbo in 2010: 49 prime sales on Thursdays and 31 store sales on Fridays.
    expect(sales).toBe(80);
    // 1 January 2010 was a Friday in the Christmas break. The first sale was Thursday 7 January.
    expect(saleDayOn(farm, env)).toBeNull();
    expect(nextSaleDay(farm, env)).toEqual({
      day: 6,
      date: { year: 2010, month: 0, date: 7 },
      types: ['prime'],
      head: cal.saleOn({ year: 2010, month: 0, date: 7 })!.head,
      standIn: false,
    });
  });

  it('gives the next sale from today, or from a day asked for, of a type if asked', () => {
    const farm = real({ start: { year: 2010, month: 0 } });
    run(farm, 7);
    // Day 7 is Friday 8 January 2010.
    expect(text(dateOn(farm))).toBe('2010-01-08');
    const next = nextSaleDay(farm, env)!;
    expect(next.day).toBeGreaterThanOrEqual(7);
    expect(next.date).toEqual(realPlanOf(farm)!.realDateOn(next.day));
    const prime = nextSaleDay(farm, env, farm.day, 'prime')!;
    expect(text(prime.date)).toBe('2010-01-14');
    expect(prime.day).toBe(13);
    const store = nextSaleDay(farm, env, farm.day, 'store')!;
    expect(store.types).toContain('store');
    expect(new Date(`${text(store.date)}T00:00:00Z`).getUTCDay()).toBe(5);
    // From a later day.
    expect(nextSaleDay(farm, env, 14, 'prime')!.day).toBe(20);
    // On a sale day, that day is the next sale.
    expect(nextSaleDay(farm, env, 13, 'prime')!.day).toBe(13);
  });

  it('carries on into the next game year, whatever real year that is', () => {
    const o = options({ seed: 11, start: { month: 0 }, years: { kind: 'real', order: 'random' } });
    const farm = createFarm(o, env);
    const plan = realPlanOf(farm)!;
    const cal = data.district('cw').cattleSales;
    // From 30 December of the first game year the next sale is in January of the second.
    const from = 363;
    expect(text(plan.realDateOn(from)).slice(5)).toBe('12-30');
    const next = nextSaleDay(farm, env, from)!;
    expect(next.day).toBeGreaterThan(364);
    expect(next.date.year).toBe(plan.yearAt(1));
    expect(next.date.month).toBe(0);
    expect(cal.saleOn(next.date)).not.toBeNull();
    // No day between had a sale.
    for (let day = from; day < next.day; day++) expect(saleDayOn(farm, env, day)).toBeNull();
  });

  it('uses the stand-in where the yard has no records', () => {
    // Western Victoria in 2005: Mortlake has nothing before 2018.
    const farm = real({ district: 'wv', start: { year: 2005, month: 0 } });
    const next = nextSaleDay(farm, env)!;
    expect(next).toEqual({
      day: 9,
      date: { year: 2005, month: 0, date: 10 },
      types: ['prime'],
      head: null,
      standIn: true,
    });
    expect(nextSaleDay(farm, env, 0, 'store')).toBeNull();
  });

  it('is only for a real-year farm', () => {
    const random = createFarm({ ...options(), years: undefined });
    expect(() => saleDayOn(random, env)).toThrow(/Only a real-year farm has a real sale calendar/);
    expect(() => nextSaleDay(random, env)).toThrow(/Only a real-year farm/);
  });
});
