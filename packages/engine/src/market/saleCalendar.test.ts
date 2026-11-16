import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { DISTRICT_YARDS, type YardId } from '../data/yards';
import { loadRealData, readRawTable } from '../server';
import { dateOfSerial, daySerial, isoDate } from '../season/weatherTable';
import {
  CATTLE_SALE_STAND_INS,
  STAND_IN_BREAK,
  buildSaleCalendar,
  type SaleCalendar,
} from './saleCalendar';

// These read the real tables. Give them room when the whole suite is running beside them.
vi.setConfig({ testTimeout: 120_000 });

const day = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return daySerial({ year: y!, month: m! - 1, date: d! });
};
const date = (iso: string) => dateOfSerial(day(iso));
const yardings = (rows: string[]): string => ['date,type,head', ...rows, ''].join('\n');
/** 0 is Sunday. Worked out by the platform, not by the code under test. */
const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

describe('a sale calendar from a yardings table', () => {
  const cal = buildSaleCalendar(
    'DUB',
    'cattle',
    yardings([
      '1996-12-19,Prime,900',
      '1997-01-09,Prime,1200',
      '1997-01-10,Store,300',
      '1997-01-16,Prime,1000',
      '1997-01-16,Store,250',
      '1997-03-06,Prime,800',
    ]),
  );

  it('answers from 1 January 1997 to its last record', () => {
    expect(cal.first).toEqual({ year: 1997, month: 0, date: 1 });
    expect(cal.last).toEqual({ year: 1997, month: 2, date: 6 });
    expect(cal.yard).toBe('DUB');
    expect(cal.species).toBe('cattle');
  });

  it('gives the sale on a day the yard sold, with its type and head', () => {
    expect(cal.saleOn(date('1997-01-09'))).toEqual({
      date: date('1997-01-09'),
      types: ['prime'],
      head: 1200,
      standIn: false,
    });
    expect(cal.saleOn(date('1997-01-10'))?.types).toEqual(['store']);
  });

  it('gives both types, prime first, and all the head, on a day with two sales', () => {
    expect(cal.saleOn(date('1997-01-16'))).toEqual({
      date: date('1997-01-16'),
      types: ['prime', 'store'],
      head: 1250,
      standIn: false,
    });
  });

  it('gives no sale on a day the yard did not sell', () => {
    expect(cal.saleOn(date('1997-01-08'))).toBeNull();
    expect(cal.saleOn(date('1997-01-11'))).toBeNull();
    expect(cal.saleOn(date('1997-02-06'))).toBeNull();
  });

  it('finds the next sale on or after a day, of a type if asked', () => {
    expect(cal.nextSale(date('1997-01-01'))?.date).toEqual(date('1997-01-09'));
    expect(cal.nextSale(date('1997-01-09'))?.date).toEqual(date('1997-01-09'));
    expect(cal.nextSale(date('1997-01-10'))?.date).toEqual(date('1997-01-10'));
    expect(cal.nextSale(date('1997-01-10'), 'prime')?.date).toEqual(date('1997-01-16'));
    expect(cal.nextSale(date('1997-01-01'), 'store')?.date).toEqual(date('1997-01-10'));
    expect(cal.nextSale(date('1997-01-17'))?.date).toEqual(date('1997-03-06'));
    // No store sale is left before the calendar ends.
    expect(cal.nextSale(date('1997-01-17'), 'store')).toBeNull();
  });

  it('refuses a day outside the calendar', () => {
    expect(() => cal.saleOn(date('1996-12-31'))).toThrow(/no day 1996-12-31/);
    expect(() => cal.saleOn(date('1997-03-07'))).toThrow(/no day 1997-03-07/);
    expect(() => cal.nextSale(date('1997-03-07'))).toThrow(/no day 1997-03-07/);
  });
});

describe('the stand-in for a stretch with no records', () => {
  // A Wednesday yard with nothing before 5 March 1997 and nothing from 1 June 1998 to 31 May 1999.
  const WEDNESDAY = 3;
  const cal = buildSaleCalendar(
    'GME',
    'cattle',
    yardings(['1997-03-05,Prime,500', '1998-05-27,Prime,500', '1999-06-02,Prime,500']),
    [
      { from: '1997-01-01', to: '1997-03-04', weekday: WEDNESDAY },
      { from: '1998-06-01', to: '1999-05-31', weekday: WEDNESDAY },
    ],
  );

  it('holds a prime sale each week on the set weekday, with the head not known', () => {
    // 15 January 1997 was a Wednesday.
    expect(weekdayOf('1997-01-15')).toBe(WEDNESDAY);
    expect(cal.saleOn(date('1997-01-15'))).toEqual({
      date: date('1997-01-15'),
      types: ['prime'],
      head: null,
      standIn: true,
    });
    expect(cal.saleOn(date('1997-01-14'))).toBeNull();
    expect(cal.saleOn(date('1997-01-16'))).toBeNull();
    expect(cal.saleOn(date('1997-01-22'))?.standIn).toBe(true);
    // Every stand-in day in the second stretch is a Wednesday, a week apart.
    const found: string[] = [];
    for (let s = day('1998-06-01'); s <= day('1998-12-15'); s++) {
      if (cal.saleOn(dateOfSerial(s))) found.push(isoDate(dateOfSerial(s)));
    }
    // The Wednesdays from 3 June to 9 December 1998: 4 in June, 5 in July, 4 in August,
    // 5 in September, 4 in October, 4 in November and 2 in December.
    expect(found.length).toBe(28);
    for (const iso of found) expect(weekdayOf(iso), iso).toBe(WEDNESDAY);
    expect(found[0]).toBe('1998-06-03');
    expect(found.at(-1)).toBe('1998-12-09');
  });

  it('holds no sale from 16 December to 7 January', () => {
    expect(STAND_IN_BREAK).toEqual({ from: { month: 11, date: 16 }, to: { month: 0, date: 7 } });
    // Wednesdays: 9, 16, 23 and 30 December 1998, 6 and 13 January 1999.
    expect(cal.saleOn(date('1998-12-09'))?.standIn).toBe(true);
    expect(cal.saleOn(date('1998-12-16'))).toBeNull();
    expect(cal.saleOn(date('1998-12-23'))).toBeNull();
    expect(cal.saleOn(date('1998-12-30'))).toBeNull();
    expect(cal.saleOn(date('1999-01-06'))).toBeNull();
    expect(cal.saleOn(date('1999-01-13'))?.standIn).toBe(true);
    // And at the very start: 1 January 1997 was a Wednesday, inside the break. 8 January is the first sale.
    expect(weekdayOf('1997-01-01')).toBe(WEDNESDAY);
    expect(cal.saleOn(date('1997-01-01'))).toBeNull();
    expect(cal.nextSale(date('1997-01-01'))?.date).toEqual(date('1997-01-08'));
  });

  it('stops where the records start, and a real record is never a stand-in', () => {
    expect(cal.saleOn(date('1997-03-05'))?.standIn).toBe(false);
    // Outside a stretch a Wednesday with no record has no sale.
    expect(weekdayOf('1997-03-12')).toBe(WEDNESDAY);
    expect(cal.saleOn(date('1997-03-12'))).toBeNull();
    expect(cal.saleOn(date('1999-05-26'))?.standIn).toBe(true);
    expect(cal.saleOn(date('1999-06-02'))?.head).toBe(500);
  });

  it('is refused when a record falls inside a stretch that is stood in for', () => {
    expect(() =>
      buildSaleCalendar(
        'GME',
        'cattle',
        yardings(['1997-02-05,Prime,500', '1997-03-05,Prime,500']),
        [{ from: '1997-01-01', to: '1997-03-04', weekday: WEDNESDAY }],
      ),
    ).toThrow(/has a record on 1997-02-05, inside a stretch that is stood in for/);
  });

  it('is refused when the records start after 1997 and nothing stands in', () => {
    expect(() =>
      buildSaleCalendar('GME', 'cattle', yardings(['1997-03-05,Prime,500']), []),
    ).toThrow(/yardings start on 1997-03-05 and nothing stands in from 1997-01-01/);
    expect(() =>
      buildSaleCalendar('GME', 'cattle', yardings(['1997-03-05,Prime,500']), [
        { from: '1997-01-01', to: '1997-03-03', weekday: WEDNESDAY },
      ]),
    ).toThrow(/nothing stands in from 1997-03-04/);
  });
});

describe('a broken yardings table is refused, with the line', () => {
  it.each([
    ['the wrong columns', 'date,head\n1997-01-09,5\n', /must start with/],
    ['no rows', 'date,type,head\n', /no rows/],
    [
      'a sale type that is not known',
      yardings(['1997-01-09,Clearing,5']),
      /line 2.*not a sale type/,
    ],
    ['a date that is not real', yardings(['1997-02-30,Prime,5']), /line 2.*not a real date/],
    ['rows out of order', yardings(['1997-01-09,Prime,5', '1997-01-02,Prime,5']), /line 3/],
    ['the same sale twice', yardings(['1997-01-09,Prime,5', '1997-01-09,Prime,6']), /line 3/],
    [
      'a head count that is not a number',
      yardings(['1997-01-09,Prime,lots']),
      /line 2.*head count/,
    ],
    ['a blank head count', yardings(['1997-01-09,Prime,']), /line 2.*head count/],
  ])('%s', (_name, text, message) => {
    expect(() => buildSaleCalendar('DUB', 'cattle', text, [])).toThrow(message);
  });
});

describe('the four cattle yards, from the tables as pulled', () => {
  const data = loadRealData();
  const calendars = Object.fromEntries(
    DISTRICT_IDS.map((id) => [DISTRICT_YARDS[id].cattle, data.district(id).cattleSales]),
  ) as Record<YardId, SaleCalendar>;

  it.each(DISTRICT_IDS.map((id) => DISTRICT_YARDS[id].cattle))(
    '%s: every sale day in the sales table is a sale day here, with the same head, and no other day is',
    (yard) => {
      const cal = calendars[yard];
      const lines = readRawTable(`mla/sales/${yard}-cattle.csv`).split('\n').slice(1, -1);
      const real = new Map(lines.map((l) => l.split(',') as [string, string]));
      let checked = 0;
      for (let s = day('1997-01-01'); s <= daySerial(cal.last); s++) {
        const iso = isoDate(dateOfSerial(s));
        const sale = cal.saleOn(dateOfSerial(s));
        const head = real.get(iso);
        if (head !== undefined) {
          expect(sale, iso).not.toBeNull();
          expect(sale!.standIn, iso).toBe(false);
          expect(sale!.head, iso).toBe(Number(head));
          checked++;
        } else if (sale) {
          // A sale the yard has no record of can only be a stand-in.
          expect(sale.standIn, iso).toBe(true);
        }
      }
      expect(checked).toBe(lines.filter((l) => l >= '1997-01-01').length);
      expect(checked).toBeGreaterThan(400);
    },
  );

  it('stand in only for the stretches the service has nothing for', () => {
    expect(CATTLE_SALE_STAND_INS).toEqual({
      GME: [
        { from: '1997-01-01', to: '1999-11-07', weekday: 1 },
        { from: '2004-08-17', to: '2014-10-09', weekday: 1 },
      ],
      MTL: [{ from: '1997-01-01', to: '2018-01-28', weekday: 1 }],
    });
    // Armidale and Dubbo have records for every year, so nothing there is a stand-in.
    for (const yard of ['ARM', 'DUB'] as const) {
      for (let s = day('1997-01-01'); s <= daySerial(calendars[yard].last); s += 1) {
        expect(calendars[yard].saleOn(dateOfSerial(s))?.standIn ?? false).toBe(false);
      }
    }
  });

  it('each stand-in ends the day before the records start again, and uses the weekday the yard sold on nearest the stretch', () => {
    // Gracemere: the first record is 8 November 1999, the last before the gap 16 August 2004, the first after 10 October 2014.
    expect(calendars.GME.saleOn(date('1999-11-08'))?.standIn).toBe(false);
    expect(calendars.GME.saleOn(date('2004-08-16'))?.standIn).toBe(false);
    expect(calendars.GME.saleOn(date('2014-10-10'))?.standIn).toBe(false);
    // Mortlake: the first record is 29 January 2018.
    expect(calendars.MTL.saleOn(date('2018-01-29'))?.standIn).toBe(false);
    // The weekday the yard really sold prime cattle on most often, in the year of records beside each stretch.
    const usual = (yard: YardId, from: string, to: string): number => {
      const count = new Array<number>(7).fill(0);
      for (let s = day(from); s <= day(to); s++) {
        const sale = calendars[yard].saleOn(dateOfSerial(s));
        if (sale && !sale.standIn && sale.types.includes('prime')) {
          count[weekdayOf(isoDate(dateOfSerial(s)))]!++;
        }
      }
      return count.indexOf(Math.max(...count));
    };
    const MONDAY = 1;
    // Before 8 Nov 1999 there are no records, so the year after is used.
    expect(usual('GME', '1999-11-08', '2000-11-07')).toBe(MONDAY);
    // The gap from 17 Aug 2004 follows the year before it.
    expect(usual('GME', '2003-08-17', '2004-08-16')).toBe(MONDAY);
    // The records start again on Fridays. The gap is not given that day (docs/DATA.md).
    expect(usual('GME', '2014-10-10', '2015-10-09')).toBe(5);
    expect(usual('MTL', '2018-01-29', '2019-01-28')).toBe(MONDAY);
  });

  it('give a stand-in sale on Mondays, about 48 a year, in the stretches with no records', () => {
    for (const [yard, year] of [
      ['GME', 1998],
      ['GME', 2009],
      ['MTL', 2005],
    ] as const) {
      const found: string[] = [];
      for (let s = day(`${year}-01-01`); s <= day(`${year}-12-31`); s++) {
        const sale = calendars[yard].saleOn(dateOfSerial(s));
        if (sale) {
          expect(sale).toEqual({
            date: dateOfSerial(s),
            types: ['prime'],
            head: null,
            standIn: true,
          });
          found.push(isoDate(dateOfSerial(s)));
        }
      }
      for (const iso of found) expect(weekdayOf(iso), iso).toBe(1);
      expect(found.length, `${yard} ${year}`).toBeGreaterThanOrEqual(48);
      expect(found.length, `${yard} ${year}`).toBeLessThanOrEqual(49);
    }
  });

  it('show the real pattern at each yard in a year with records', () => {
    const tally = (yard: YardId, year: number): Record<string, number> => {
      const out: Record<string, number> = {};
      for (let s = day(`${year}-01-01`); s <= day(`${year}-12-31`); s++) {
        const sale = calendars[yard].saleOn(dateOfSerial(s));
        if (!sale) continue;
        const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (const t of sale.types) {
          const key = `${t} ${names[weekdayOf(isoDate(dateOfSerial(s)))]}`;
          out[key] = (out[key] ?? 0) + 1;
        }
      }
      return out;
    };
    // The counts are from docs/DATA.md ("Sale days pulled") and the yardings tables.
    expect(tally('GME', 2022)).toEqual({ 'prime Wed': 45, 'store Mon': 2 });
    expect(tally('ARM', 2005)).toEqual({ 'prime Thu': 49 });
    // Armidale sells about fortnightly from 2020.
    expect(tally('ARM', 2023)).toEqual({ 'prime Thu': 24 });
    expect(tally('DUB', 2010)).toEqual({ 'prime Thu': 49, 'store Fri': 31 });
    expect(tally('MTL', 2024)).toEqual({ 'prime Mon': 47, 'store Thu': 25, 'store Wed': 1 });
  });

  it('find the next sale across a Christmas break', () => {
    // Dubbo's last prime sale of 2015 was 17 December and its first of 2016 was 7 January.
    expect(calendars.DUB.nextSale(date('2015-12-18'), 'prime')?.date).toEqual(date('2016-01-07'));
    // Armidale, fortnightly: from the day after a sale to the next one.
    const first = calendars.ARM.nextSale(date('2023-03-01'))!;
    const second = calendars.ARM.nextSale(dateOfSerial(daySerial(first.date) + 1))!;
    expect(daySerial(second.date) - daySerial(first.date)).toBe(14);
  });
});
