import { describe, expect, it } from 'vitest';
import { daySerial } from '../season/weatherTable';
import {
  latestPriceRow,
  parsePriceTable,
  priceRowOn,
  priceTableFirst,
  priceTableLast,
} from './priceTable';

const table = (rows: string[]): string => ['date,value,head', ...rows, ''].join('\n');
const day = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return daySerial({ year: y!, month: m! - 1, date: d! });
};

describe('a price table', () => {
  const t = parsePriceTable(
    table([
      '2001-03-05,180.5,120',
      '2001-03-06,181,90',
      '2001-03-12,175.25,8',
      '2001-03-20,190,45',
    ]),
  );

  it('holds a price for each day that has a row, and none for a day that has not', () => {
    expect(t.rows).toBe(4);
    expect(t.dropped).toBe(0);
    expect(priceTableFirst(t)).toEqual({ year: 2001, month: 2, date: 5 });
    expect(priceTableLast(t)).toEqual({ year: 2001, month: 2, date: 20 });
    expect(priceRowOn(t, day('2001-03-05'))).toEqual({
      serial: day('2001-03-05'),
      value: 180.5,
      head: 120,
    });
    expect(priceRowOn(t, day('2001-03-06'))?.value).toBe(181);
    // No row on the 7th, and nothing before the first row or after the last.
    expect(priceRowOn(t, day('2001-03-07'))).toBeNull();
    expect(priceRowOn(t, day('2001-03-04'))).toBeNull();
    expect(priceRowOn(t, day('2001-03-21'))).toBeNull();
  });

  it('finds the newest row on or before a day, no older than asked for', () => {
    // On the day itself.
    expect(latestPriceRow(t, day('2001-03-06'), 14)?.value).toBe(181);
    // 5 days after the row of the 6th. A row 5 days old is found with 5 days of look back, not with 4.
    expect(latestPriceRow(t, day('2001-03-11'), 5)?.value).toBe(181);
    expect(latestPriceRow(t, day('2001-03-11'), 4)).toBeNull();
    // A look back of 0 days is the day itself only.
    expect(latestPriceRow(t, day('2001-03-07'), 0)).toBeNull();
    expect(latestPriceRow(t, day('2001-03-06'), 0)?.value).toBe(181);
  });

  it('passes over a row with too few head behind it', () => {
    // The row of the 12th has 8 head. With 20 wanted, the row of the 6th is the newest that counts.
    expect(latestPriceRow(t, day('2001-03-13'), 14, 20)?.value).toBe(181);
    expect(latestPriceRow(t, day('2001-03-13'), 14, 8)?.value).toBe(175.25);
    expect(latestPriceRow(t, day('2001-03-13'), 14, 9)?.value).toBe(181);
    // 90 head is enough for 90 and not for 91.
    expect(latestPriceRow(t, day('2001-03-06'), 0, 90)?.value).toBe(181);
    expect(latestPriceRow(t, day('2001-03-06'), 0, 91)).toBeNull();
  });
});

describe('rows that hold no price', () => {
  it('never become a price: negative, zero and blank figures are left out and counted', () => {
    const t = parsePriceTable(
      table([
        '2006-12-05,300,40',
        '2006-12-06,-6.67,37',
        '2006-12-07,0,12',
        '2006-12-08,,12',
        '2006-12-09,310,',
        '2006-12-10,305,33',
      ]),
    );
    expect(t.rows).toBe(2);
    expect(t.dropped).toBe(4);
    for (const d of ['2006-12-06', '2006-12-07', '2006-12-08', '2006-12-09']) {
      expect(priceRowOn(t, day(d)), d).toBeNull();
    }
    // The day after the negative row looks back to the last real price.
    expect(latestPriceRow(t, day('2006-12-09'), 14)?.value).toBe(300);
    for (let s = t.firstSerial; s < t.firstSerial + t.value.length; s++) {
      const row = priceRowOn(t, s);
      if (row) expect(row.value).toBeGreaterThan(0);
    }
  });

  it('a table with no usable row at all is refused', () => {
    expect(() => parsePriceTable(table(['2006-12-06,-6.67,37']))).toThrow(/no usable rows/);
    expect(() => parsePriceTable('date,value,head\n')).toThrow(/no rows/);
  });
});

describe('a broken price table is refused, with the line', () => {
  it.each([
    ['the wrong columns', 'date,price,head\n2001-01-01,100,5\n', /must start with/],
    ['a date that is not real', table(['2001-02-30,100,5']), /line 2.*not a real date/],
    ['text for a date', table(['yesterday,100,5']), /line 2.*not a date/],
    [
      'rows out of order',
      table(['2001-01-02,100,5', '2001-01-01,100,5']),
      /line 3.*does not come after/,
    ],
    [
      'the same day twice',
      table(['2001-01-02,100,5', '2001-01-02,101,5']),
      /line 3.*does not come after/,
    ],
    ['a row with a value missing', table(['2001-01-02,100']), /line 2.*2 values/],
  ])('%s', (_name, text, message) => {
    expect(() => parsePriceTable(text)).toThrow(message);
  });
});
