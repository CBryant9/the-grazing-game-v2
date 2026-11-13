import { describe, expect, it } from 'vitest';
import {
  dateOfSerial,
  daySerial,
  isoDate,
  parseWeatherTable,
  tableDays,
  tableIndex,
  tableLast,
} from './weatherTable';

const GOOD = [
  'date,rain,tmax,tmin,rad,evap,et0',
  '2019-12-30,0,37.2,19.7,33,9.7,8.1',
  '2019-12-31,12.5,30,20.2,32.5,9.3,6',
  '2020-01-01,0.4,37.2,20.1,30.3,9.4,7.7',
  '',
].join('\n');

/** The good table with one line swapped for another. */
const withLine = (n: number, line: string): string => {
  const lines = GOOD.split('\n');
  lines[n] = line;
  return lines.join('\n');
};

describe('reading a weather table', () => {
  it('reads the days, the rain and the evapotranspiration', () => {
    const table = parseWeatherTable(GOOD);
    expect(table.first).toEqual({ year: 2019, month: 11, date: 30 });
    expect(tableDays(table)).toBe(3);
    expect(tableLast(table)).toEqual({ year: 2020, month: 0, date: 1 });
    expect([...table.rain]).toEqual([0, 12.5, 0.4]);
    expect([...table.et0]).toEqual([8.1, 6, 7.7]);
  });

  it('reads the columns by name, wherever they sit', () => {
    const table = parseWeatherTable(
      'et0,date,rain\n5,2020-02-28,1\n4,2020-02-29,2\n3,2020-03-01,3\n',
    );
    expect([...table.rain]).toEqual([1, 2, 3]);
    expect([...table.et0]).toEqual([5, 4, 3]);
  });

  it('finds a day by counting from the first, and refuses a day it does not hold', () => {
    const table = parseWeatherTable(GOOD);
    expect(tableIndex(table, { year: 2019, month: 11, date: 30 })).toBe(0);
    expect(tableIndex(table, { year: 2020, month: 0, date: 1 })).toBe(2);
    expect(() => tableIndex(table, { year: 2019, month: 11, date: 29 })).toThrow(
      /no day 2019-12-29\. It runs from 2019-12-30 to 2020-01-01/,
    );
    expect(() => tableIndex(table, { year: 2020, month: 0, date: 2 })).toThrow(RangeError);
  });

  it.each([
    ['a missing column', GOOD.replace('et0', 'et'), /no "et0" column/],
    ['no days', 'date,rain,et0\n', /no days/],
    [
      'a missing day',
      withLine(2, '2020-01-01,0,30,20,30,9,6'),
      /line 3: 2020-01-01 does not follow/,
    ],
    ['a day twice', withLine(2, '2019-12-30,0,30,20,30,9,6'), /line 3: 2019-12-30 does not follow/],
    ['days out of order', withLine(3, '2019-12-29,0,30,20,30,9,6'), /line 4/],
    [
      'a date that is not real',
      withLine(1, '2019-02-30,0,30,20,30,9,6'),
      /line 2: "2019-02-30" is not a real date/,
    ],
    [
      'a date in another shape',
      withLine(1, '30/12/2019,0,30,20,30,9,6'),
      /line 2: "30\/12\/2019" is not a date/,
    ],
    ['a blank rain figure', withLine(2, '2019-12-31,,30,20,30,9,6'), /line 3: rain is ""/],
    ['a blank et0 figure', withLine(2, '2019-12-31,1,30,20,30,9,'), /line 3: et0 is ""/],
    [
      'a figure that is not a number',
      withLine(3, '2020-01-01,n/a,30,20,30,9,6'),
      /line 4: rain is "n\/a"/,
    ],
    ['negative rain', withLine(3, '2020-01-01,-1,30,20,30,9,6'), /line 4: rain is "-1"/],
    ['a short row', withLine(2, '2019-12-31,1,30'), /line 3: 3 values where 7 were expected/],
    ['a blank line in the middle', withLine(2, ''), /line 3/],
    ['Windows line ends', GOOD.replaceAll('\n', '\r\n'), /no "et0" column/],
  ])('stops on %s', (_what, text, message) => {
    expect(() => parseWeatherTable(text)).toThrow(message);
  });
});

describe('day serials', () => {
  it('count whole days and turn back into the same date, leap days included', () => {
    expect(daySerial({ year: 1970, month: 0, date: 1 })).toBe(0);
    expect(
      daySerial({ year: 2020, month: 2, date: 1 }) - daySerial({ year: 2020, month: 1, date: 28 }),
    ).toBe(2);
    expect(
      daySerial({ year: 2019, month: 2, date: 1 }) - daySerial({ year: 2019, month: 1, date: 28 }),
    ).toBe(1);
    for (const iso of ['1990-01-01', '2000-02-29', '2025-12-31']) {
      const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
      const date = { year: y, month: m - 1, date: d };
      expect(dateOfSerial(daySerial(date))).toEqual(date);
      expect(isoDate(date)).toBe(iso);
    }
  });
});
