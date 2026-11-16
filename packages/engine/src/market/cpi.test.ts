import { describe, expect, it } from 'vitest';
import { readRawTable } from '../server';
import {
  TODAYS_DOLLARS,
  cpiFor,
  parseCpiTable,
  quarterNumber,
  quarterOf,
  todaysDollarsFactor,
} from './cpi';

const small = parseCpiTable('quarter,index\n2000-Q3,50\n2000-Q4,52\n2001-Q1,55\n2001-Q2,60\n');

describe('the CPI table', () => {
  it('reads a quarter for each row', () => {
    expect(cpiFor(small, { year: 2000, quarter: 3 })).toBe(50);
    expect(cpiFor(small, { year: 2001, quarter: 2 })).toBe(60);
    expect(small.index.length).toBe(4);
  });

  it('refuses a quarter it does not hold', () => {
    expect(() => cpiFor(small, { year: 2000, quarter: 2 })).toThrow(/no 2000 quarter 2/);
    expect(() => cpiFor(small, { year: 2001, quarter: 3 })).toThrow(/no 2001 quarter 3/);
  });

  it('puts each date in its quarter', () => {
    expect(quarterOf({ year: 1997, month: 0, date: 1 })).toEqual({ year: 1997, quarter: 1 });
    expect(quarterOf({ year: 1997, month: 2, date: 31 })).toEqual({ year: 1997, quarter: 1 });
    expect(quarterOf({ year: 1997, month: 3, date: 1 })).toEqual({ year: 1997, quarter: 2 });
    expect(quarterOf({ year: 1997, month: 8, date: 30 })).toEqual({ year: 1997, quarter: 3 });
    expect(quarterOf({ year: 1997, month: 9, date: 1 })).toEqual({ year: 1997, quarter: 4 });
    expect(quarterOf({ year: 1997, month: 11, date: 31 })).toEqual({ year: 1997, quarter: 4 });
    expect(
      quarterNumber({ year: 1998, quarter: 1 }) - quarterNumber({ year: 1997, quarter: 4 }),
    ).toBe(1);
  });

  it.each([
    ['the wrong columns', 'date,index\n2000-Q3,50\n', /must start with/],
    ['no rows', 'quarter,index\n', /no quarters/],
    ['a quarter missing', 'quarter,index\n2000-Q3,50\n2001-Q1,55\n', /line 3.*does not follow/],
    ['a quarter twice', 'quarter,index\n2000-Q3,50\n2000-Q3,55\n', /line 3.*does not follow/],
    ['a fifth quarter', 'quarter,index\n2000-Q5,50\n', /line 2/],
    ['a blank figure', 'quarter,index\n2000-Q3,\n', /line 2.*not an index number/],
    ['a figure of zero', 'quarter,index\n2000-Q3,0\n', /line 2.*not an index number/],
    ['a negative figure', 'quarter,index\n2000-Q3,-4\n', /line 2.*not an index number/],
  ])('refuses a table with %s', (_name, text, message) => {
    expect(() => parseCpiTable(text)).toThrow(message);
  });
});

describe("a past price in today's dollars", () => {
  const base = { year: 2001, quarter: 2 };

  it('is lifted by the index of the base quarter over the index of its own quarter', () => {
    // 60 / 50.
    expect(todaysDollarsFactor(small, { year: 2000, month: 6, date: 1 }, base)).toBe(1.2);
    expect(todaysDollarsFactor(small, { year: 2000, month: 8, date: 30 }, base)).toBe(1.2);
    // 60 / 52, from the first day of the next quarter.
    expect(todaysDollarsFactor(small, { year: 2000, month: 9, date: 1 }, base)).toBeCloseTo(
      60 / 52,
      12,
    );
    expect(todaysDollarsFactor(small, { year: 2001, month: 2, date: 31 }, base)).toBeCloseTo(
      60 / 55,
      12,
    );
  });

  it('is left as it is in the base quarter and after it', () => {
    expect(todaysDollarsFactor(small, { year: 2001, month: 3, date: 1 }, base)).toBe(1);
    expect(todaysDollarsFactor(small, { year: 2001, month: 5, date: 30 }, base)).toBe(1);
    // After the base quarter, even though the table holds nothing for it.
    expect(todaysDollarsFactor(small, { year: 2001, month: 6, date: 1 }, base)).toBe(1);
    expect(todaysDollarsFactor(small, { year: 2030, month: 0, date: 1 }, base)).toBe(1);
  });

  it('is refused for a date before the table starts', () => {
    expect(() => todaysDollarsFactor(small, { year: 2000, month: 5, date: 30 }, base)).toThrow(
      /no 2000 quarter 2/,
    );
  });
});

describe('the ABS table as pulled', () => {
  const cpi = parseCpiTable(readRawTable('abs/cpi-all-groups.csv'));

  it('holds every quarter from March 1990 to September 2026', () => {
    expect(cpi.firstQuarter).toBe(quarterNumber({ year: 1990, quarter: 1 }));
    expect(cpi.index.length).toBe(147);
    expect(() => cpiFor(cpi, { year: 2026, quarter: 3 })).not.toThrow();
  });

  it('reads the figures the ABS served on 14 Nov 2026 (the same as the RBA table G1 to two places)', () => {
    // Index numbers, September 2025 = 100 (docs/DATA.md, "Inflation").
    expect(cpiFor(cpi, { year: 1997, quarter: 1 })).toBe(46.58);
    expect(cpiFor(cpi, { year: 2000, quarter: 2 })).toBe(48.77);
    expect(cpiFor(cpi, { year: 2000, quarter: 3 })).toBe(50.59);
    expect(cpiFor(cpi, { year: 2010, quarter: 4 })).toBe(67.26);
    expect(cpiFor(cpi, { year: 2025, quarter: 4 })).toBe(100.32);
    expect(cpiFor(cpi, { year: 2026, quarter: 3 })).toBe(103.64);
  });

  it("puts today's dollars at the September quarter 2026, the newest quarter in the table", () => {
    expect(TODAYS_DOLLARS).toEqual({ year: 2026, quarter: 3 });
    expect(quarterNumber(TODAYS_DOLLARS)).toBe(cpi.firstQuarter + cpi.index.length - 1);
  });

  it('lifts a 1997 price about two and a quarter times, and a 2025 price by a few per cent', () => {
    // 103.64 / 46.58 and 103.64 / 100.32.
    expect(todaysDollarsFactor(cpi, { year: 1997, month: 1, date: 14 })).toBeCloseTo(2.22499, 4);
    expect(todaysDollarsFactor(cpi, { year: 2025, month: 11, date: 31 })).toBeCloseTo(1.03309, 4);
    expect(todaysDollarsFactor(cpi, { year: 2026, month: 7, date: 1 })).toBe(1);
  });

  it('moves by no more than a few per cent from one quarter to the next', () => {
    for (let i = 1; i < cpi.index.length; i++) {
      expect(cpi.index[i]! / cpi.index[i - 1]!, `quarter ${i}`).toBeGreaterThan(0.98);
      expect(cpi.index[i]! / cpi.index[i - 1]!, `quarter ${i}`).toBeLessThan(1.05);
    }
  });
});
