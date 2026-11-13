import { describe, expect, it } from 'vitest';
import { dateAt } from '../calendar';
import { FIRST_REAL_YEAR, isLeapYear, planRealYears, playableYears } from './realYears';
import { daySerial } from './weatherTable';

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const FIRST = { year: 1990, month: 0, date: 1 };
const LAST = { year: 2026, month: 10, date: 12 };
const YEARS = range(1997, 2025);

describe('the real years that can be played', () => {
  it('are the full calendar years from 1997 for a January start', () => {
    expect(FIRST_REAL_YEAR).toBe(1997);
    expect(playableYears(FIRST, LAST)).toEqual(YEARS);
    // The year is only whole on its last day.
    expect(playableYears(FIRST, { year: 2025, month: 11, date: 30 }).at(-1)).toBe(2024);
    expect(playableYears(FIRST, { year: 2025, month: 11, date: 31 }).at(-1)).toBe(2025);
  });

  it('need their whole 12 months for a start in another month', () => {
    // Data to 12 November 2026: a November 2025 start has its 12 months, a December one does not.
    expect(playableYears(FIRST, LAST, 10).at(-1)).toBe(2025);
    expect(playableYears(FIRST, LAST, 11).at(-1)).toBe(2024);
    expect(playableYears(FIRST, LAST, 6)[0]).toBe(1997);
  });

  it('need the lead days before them', () => {
    const first = { year: 1996, month: 0, date: 1 };
    expect(playableYears(first, LAST, 0, 365)[0]).toBe(1997);
    expect(playableYears(first, LAST, 0, 367)[0]).toBe(1998);
    expect(playableYears(first, LAST, 0, 0)[0]).toBe(1997);
  });

  it('refuse a month that is not a month', () => {
    expect(() => playableYears(FIRST, LAST, 12)).toThrow(RangeError);
    expect(() => playableYears(FIRST, LAST, 1.5)).toThrow(RangeError);
  });
});

describe('years in order', () => {
  it('start at the chosen year and take each next year in turn', () => {
    const plan = planRealYears({ years: YEARS, order: 'in-order', seed: 7, firstYear: 2003 });
    expect(plan.start).toEqual({ year: 2003, month: 0 });
    expect([0, 1, 2, 3].map(plan.yearAt)).toEqual([2003, 2004, 2005, 2006]);
  });

  it('start at the oldest year when none is chosen', () => {
    expect(planRealYears({ years: YEARS, order: 'in-order', seed: 7 }).start.year).toBe(1997);
  });

  it('go back to the oldest year after the newest', () => {
    const plan = planRealYears({ years: YEARS, order: 'in-order', seed: 7, firstYear: 2024 });
    expect([0, 1, 2, 3].map(plan.yearAt)).toEqual([2024, 2025, 1997, 1998]);
  });

  it('do not depend on the seed', () => {
    const a = planRealYears({ years: YEARS, order: 'in-order', seed: 1, firstYear: 2010 });
    const b = planRealYears({ years: YEARS, order: 'in-order', seed: 99, firstYear: 2010 });
    expect(range(0, 40).map(a.yearAt)).toEqual(range(0, 40).map(b.yearAt));
  });

  it('show the real date day for day, leap years and all', () => {
    const plan = planRealYears({ years: YEARS, order: 'in-order', seed: 7, firstYear: 2003 });
    for (const day of [-540, -1, 0, 58, 59, 364, 365, 365 + 59, 365 + 60, 1000, 3000]) {
      expect(plan.realDateOn(day)).toEqual(dateAt(plan.start, day));
    }
    // 2004 is a leap year: day 365 + 59 is 29 February 2004.
    expect(plan.realDateOn(365 + 59)).toEqual({ year: 2004, month: 1, date: 29 });
  });
});

describe('years at random', () => {
  it('give the same years for the same seed, and other years for another seed', () => {
    const a = planRealYears({ years: YEARS, order: 'random', seed: 12345 });
    const b = planRealYears({ years: YEARS, order: 'random', seed: 12345 });
    const c = planRealYears({ years: YEARS, order: 'random', seed: 12346 });
    const of = (p: typeof a): number[] => range(0, 99).map(p.yearAt);
    expect(of(a)).toEqual(of(b));
    expect(of(a)).not.toEqual(of(c));
    expect(a.start.year).toBe(a.yearAt(0));
  });

  it('give the same year whatever order the years are asked for in', () => {
    const a = planRealYears({ years: YEARS, order: 'random', seed: 5 });
    const b = planRealYears({ years: YEARS, order: 'random', seed: 5 });
    const forwards = range(0, 70).map(a.yearAt);
    const backwards = range(0, 70).reverse().map(b.yearAt).reverse();
    expect(backwards).toEqual(forwards);
  });

  it('play every year once before any year comes round again', () => {
    for (const seed of range(1, 50)) {
      const plan = planRealYears({ years: YEARS, order: 'random', seed });
      for (const round of [0, 1, 2]) {
        const played = range(0, YEARS.length - 1).map((i) => plan.yearAt(round * YEARS.length + i));
        expect([...played].sort((x, y) => x - y)).toEqual(YEARS);
      }
    }
  });

  it('never play the same year twice running', () => {
    for (const seed of range(1, 300)) {
      const plan = planRealYears({ years: [2001, 2002, 2003], order: 'random', seed });
      const played = range(0, 30).map(plan.yearAt);
      for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1]);
    }
  });

  it('are not the years in order', () => {
    let inOrder = 0;
    for (const seed of range(1, 200)) {
      const plan = planRealYears({ years: YEARS, order: 'random', seed });
      if (plan.yearAt(1) === plan.yearAt(0) + 1) inOrder++;
    }
    // By chance about 1 in 29 second years is the next real year.
    expect(inOrder).toBeLessThan(25);
  });

  it('start in each year about as often as any other', () => {
    const counts = new Map<number, number>();
    const farms = 29000;
    for (let seed = 1; seed <= farms; seed++) {
      const y = planRealYears({ years: YEARS, order: 'random', seed }).start.year;
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
    for (const y of YEARS) {
      // 1,000 expected each. Five standard deviations is about 155.
      expect(Math.abs((counts.get(y) ?? 0) - 1000), String(y)).toBeLessThan(155);
    }
  });

  it('start in the chosen year when one is chosen, and shuffle the rest', () => {
    const plan = planRealYears({ years: YEARS, order: 'random', seed: 8, firstYear: 2019 });
    expect(plan.start.year).toBe(2019);
    expect(plan.yearAt(0)).toBe(2019);
    const played = range(0, YEARS.length - 1).map(plan.yearAt);
    expect([...played].sort((x, y) => x - y)).toEqual(YEARS);
  });

  it('move each game year, whole, onto its real year', () => {
    const plan = planRealYears({ years: YEARS, order: 'random', seed: 3, startMonth: 8 });
    const y0 = plan.yearAt(0);
    const y1 = plan.yearAt(1);
    const y2 = plan.yearAt(2);
    expect(plan.start).toEqual({ year: y0, month: 8 });
    // Game year 1 runs from 1 September of its real year to 31 August of the next.
    expect(plan.realDateOn(0)).toEqual({ year: y0, month: 8, date: 1 });
    const firstOfYear2 =
      daySerial({ year: y0 + 1, month: 8, date: 1 }) - daySerial({ year: y0, month: 8, date: 1 });
    expect(plan.realDateOn(firstOfYear2 - 1)).toEqual({ year: y0 + 1, month: 7, date: 31 });
    // Game year 2 starts on 1 September of the next real year in the shuffle.
    expect(plan.realDateOn(firstOfYear2)).toEqual({ year: y1, month: 8, date: 1 });
    expect(plan.gameYearOn(firstOfYear2 - 1)).toBe(0);
    expect(plan.gameYearOn(firstOfYear2)).toBe(1);
    // New Year inside game year 2 stays with it: January belongs to the year after.
    const newYear = firstOfYear2 + 30 + 31 + 30 + 31;
    expect(plan.realDateOn(newYear)).toEqual({ year: y1 + 1, month: 0, date: 1 });
    const farm = dateAt(plan.start, firstOfYear2 + 400);
    expect(plan.gameYearOn(firstOfYear2 + 400)).toBe(2);
    expect(plan.realDateOn(firstOfYear2 + 400).month).toBe(farm.month);
    expect(plan.realDateOn(firstOfYear2 + 400).year - y2).toBe(farm.year - (y0 + 2));
  });

  it('keep the month and day of the farm calendar, and never give a date that is not real', () => {
    for (const seed of range(1, 20)) {
      const plan = planRealYears({ years: YEARS, order: 'random', seed, startMonth: seed % 12 });
      for (let day = -540; day < 365 * 12; day++) {
        const farm = dateAt(plan.start, day);
        const real = plan.realDateOn(day);
        expect(real.month).toBe(farm.month);
        if (farm.month === 1 && farm.date === 29) {
          expect(real.date).toBe(isLeapYear(real.year) ? 29 : 28);
        } else {
          expect(real.date).toBe(farm.date);
        }
      }
    }
  });

  it('use the real days straight before the start for the run-up', () => {
    const plan = planRealYears({ years: YEARS, order: 'random', seed: 3, startMonth: 4 });
    expect(plan.gameYearOn(-1)).toBe(-1);
    expect(plan.yearAt(-1)).toBe(plan.start.year - 1);
    for (const day of [-1, -200, -540, -900]) {
      expect(plan.realDateOn(day)).toEqual(dateAt(plan.start, day));
    }
  });
});

describe('a plan that cannot be made', () => {
  it('is refused', () => {
    expect(() => planRealYears({ years: [], order: 'in-order', seed: 1 })).toThrow(/no real years/);
    expect(() => planRealYears({ years: [2001, 2001], order: 'random', seed: 1 })).toThrow(
      /oldest first/,
    );
    expect(() => planRealYears({ years: [2002, 2001], order: 'random', seed: 1 })).toThrow(
      /oldest first/,
    );
    expect(() =>
      planRealYears({ years: YEARS, order: 'in-order', seed: 1, firstYear: 1996 }),
    ).toThrow(/1996 is not a year that can be played/);
    expect(() => planRealYears({ years: YEARS, order: 'random', seed: 1, startMonth: 12 })).toThrow(
      RangeError,
    );
    const plan = planRealYears({ years: YEARS, order: 'random', seed: 1 });
    expect(() => plan.yearAt(0.5)).toThrow(RangeError);
  });

  it('with one year plays that year every time', () => {
    const plan = planRealYears({ years: [2005], order: 'random', seed: 1 });
    expect(range(0, 5).map(plan.yearAt)).toEqual([2005, 2005, 2005, 2005, 2005, 2005]);
  });
});

describe('leap years', () => {
  it('follow the calendar rule', () => {
    expect([1996, 2000, 2004, 2024].every(isLeapYear)).toBe(true);
    expect([1900, 1997, 2001, 2100, 2025].some(isLeapYear)).toBe(false);
  });
});
