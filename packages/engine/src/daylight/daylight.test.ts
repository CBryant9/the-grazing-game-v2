import { describe, expect, it } from 'vitest';
import { DISTRICT_IDS } from '@gg/shared';
import { clockText, daylightFor, durationText, utcOffsetMinutes } from './daylight';
import { DISTRICT_PLACES } from './places';

const day = (year: number, month: number, date: number) => ({ year, month, date });
const midsummer = day(2026, 11, 21);
const midwinter = day(2026, 5, 21);

describe('first light and last light', () => {
  it('gives a winter day in Western Vic less light than a summer day in Central Qld', () => {
    const wvWinter = daylightFor(DISTRICT_PLACES.wv, midwinter);
    const cqSummer = daylightFor(DISTRICT_PLACES.cq, midsummer);
    expect(wvWinter.minutes).toBeLessThan(cqSummer.minutes);
    // Close to four hours less.
    expect(cqSummer.minutes - wvWinter.minutes).toBeGreaterThan(180);
  });

  it('makes summer days longer than winter days in every district', () => {
    for (const id of DISTRICT_IDS) {
      const place = DISTRICT_PLACES[id];
      expect(daylightFor(place, midsummer).minutes).toBeGreaterThan(
        daylightFor(place, midwinter).minutes,
      );
    }
  });

  it('swings more between summer and winter the further south the farm is', () => {
    const swing = (id: (typeof DISTRICT_IDS)[number]) =>
      daylightFor(DISTRICT_PLACES[id], midsummer).minutes -
      daylightFor(DISTRICT_PLACES[id], midwinter).minutes;
    expect(swing('cq')).toBeLessThan(swing('nsw'));
    expect(swing('nsw')).toBeLessThan(swing('cw'));
    expect(swing('cw')).toBeLessThan(swing('wv'));
  });

  it('gives nearly equal light everywhere at the equinox', () => {
    const lengths = DISTRICT_IDS.map(
      (id) => daylightFor(DISTRICT_PLACES[id], day(2026, 2, 20)).minutes,
    );
    // Civil twilight adds about 45 to 55 minutes to a 12 hour day.
    for (const m of lengths) {
      expect(m).toBeGreaterThan(12 * 60 + 40);
      expect(m).toBeLessThan(13 * 60 + 5);
    }
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(10);
  });

  it('keeps first light before last light, in order through the day, all year', () => {
    for (const id of DISTRICT_IDS) {
      for (let n = 0; n < 366; n += 3) {
        const d = new Date(Date.UTC(2024, 0, 1 + n));
        const light = daylightFor(
          DISTRICT_PLACES[id],
          day(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
        );
        expect(light.firstLight).toBeGreaterThan(3 * 60);
        expect(light.firstLight).toBeLessThan(8 * 60);
        expect(light.lastLight).toBeGreaterThan(17 * 60);
        expect(light.lastLight).toBeLessThan(22 * 60);
        expect(light.minutes).toBeCloseTo(light.lastLight - light.firstLight, 9);
      }
    }
  });

  it('changes smoothly from one day to the next', () => {
    const place = DISTRICT_PLACES.cq;
    let prev = daylightFor(place, day(2025, 0, 1)).minutes;
    for (let n = 1; n < 365; n++) {
      const d = new Date(Date.UTC(2025, 0, 1 + n));
      const now = daylightFor(place, day(2025, d.getUTCMonth(), d.getUTCDate())).minutes;
      expect(Math.abs(now - prev)).toBeLessThan(3);
      prev = now;
    }
  });

  it('puts the longest day in December and the shortest in June', () => {
    for (const id of DISTRICT_IDS) {
      let longest = { m: 0, month: -1 };
      let shortest = { m: Infinity, month: -1 };
      for (let n = 0; n < 365; n++) {
        const d = new Date(Date.UTC(2025, 0, 1 + n));
        const m = daylightFor(
          DISTRICT_PLACES[id],
          day(2025, d.getUTCMonth(), d.getUTCDate()),
        ).minutes;
        if (m > longest.m) longest = { m, month: d.getUTCMonth() };
        if (m < shortest.m) shortest = { m, month: d.getUTCMonth() };
      }
      expect(longest.month).toBe(11);
      expect(shortest.month).toBe(5);
    }
  });
});

describe('against a published twilight table', () => {
  // Civil twilight begins and ends, from the US Naval Observatory for the
  // same coordinates, in UTC+10 and rounded to the minute. Read 13 Nov 2026
  // (docs/DATA.md, "District towns, for daylight").
  const PUBLISHED: Record<(typeof DISTRICT_IDS)[number], [string, string, string][]> = {
    cq: [
      ['2026-03-20', '05:48', '18:41'],
      ['2026-06-21', '06:24', '17:54'],
      ['2026-09-23', '05:34', '18:26'],
      ['2026-12-21', '04:52', '19:18'],
      ['1997-01-15', '05:09', '19:24'],
      ['2010-07-04', '06:25', '17:58'],
    ],
    nsw: [
      ['2026-03-20', '05:33', '18:29'],
      ['2026-06-21', '06:24', '17:27'],
      ['2026-09-23', '05:18', '18:14'],
      ['2026-12-21', '04:20', '19:23'],
      ['1997-01-15', '04:39', '19:27'],
      ['2010-07-04', '06:25', '17:31'],
    ],
    cw: [
      ['2026-03-20', '05:44', '18:42'],
      ['2026-06-21', '06:39', '17:36'],
      ['2026-09-23', '05:30', '18:27'],
      ['2026-12-21', '04:27', '19:40'],
      ['1997-01-15', '04:46', '19:43'],
      ['2010-07-04', '06:40', '17:40'],
    ],
    wv: [
      ['2026-03-20', '06:08', '19:10'],
      ['2026-06-21', '07:17', '17:50'],
      ['2026-09-23', '05:54', '18:55'],
      ['2026-12-21', '04:35', '20:24'],
      ['1997-01-15', '04:56', '20:25'],
      ['2010-07-04', '07:18', '17:54'],
    ],
  };
  const minutesOf = (clock: string): number => {
    const [h, m] = clock.split(':').map(Number);
    return h! * 60 + m!;
  };

  it('is within two minutes of every published time', () => {
    let checked = 0;
    for (const id of DISTRICT_IDS) {
      for (const [iso, first, last] of PUBLISHED[id]) {
        const [y, m, d] = iso.split('-').map(Number);
        const light = daylightFor(DISTRICT_PLACES[id], day(y!, m! - 1, d!));
        // The table is in UTC+10. Take daylight saving back off.
        const shift = light.utcOffset - 600;
        expect(Math.abs(light.firstLight - shift - minutesOf(first))).toBeLessThan(2);
        expect(Math.abs(light.lastLight - shift - minutesOf(last))).toBeLessThan(2);
        checked += 2;
      }
    }
    expect(checked).toBe(48);
  });
});

describe('clock time at the place', () => {
  it('has no daylight saving in Queensland', () => {
    expect(utcOffsetMinutes('Australia/Brisbane', midsummer)).toBe(600);
    expect(utcOffsetMinutes('Australia/Brisbane', midwinter)).toBe(600);
  });

  it('has daylight saving in New South Wales and Victoria in summer only', () => {
    for (const zone of ['Australia/Sydney', 'Australia/Melbourne']) {
      expect(utcOffsetMinutes(zone, midsummer)).toBe(660);
      expect(utcOffsetMinutes(zone, midwinter)).toBe(600);
    }
  });

  it('moves last light an hour later on the clock when daylight saving starts', () => {
    // Daylight saving began on Sunday 4 October 2026 in New South Wales.
    const before = daylightFor(DISTRICT_PLACES.cw, day(2026, 9, 3));
    const after = daylightFor(DISTRICT_PLACES.cw, day(2026, 9, 4));
    expect(after.utcOffset - before.utcOffset).toBe(60);
    expect(after.lastLight - before.lastLight).toBeGreaterThan(58);
    expect(after.lastLight - before.lastLight).toBeLessThan(63);
    // The amount of light barely changes in a day.
    expect(Math.abs(after.minutes - before.minutes)).toBeLessThan(3);
  });

  it('uses the rules of the year, so past real years are right', () => {
    // In 1997 daylight saving ended at the end of March, not in April as it does now.
    expect(utcOffsetMinutes('Australia/Sydney', day(1997, 2, 28))).toBe(660);
    expect(utcOffsetMinutes('Australia/Sydney', day(1997, 3, 2))).toBe(600);
  });
});

describe('wording for the screens', () => {
  it('writes clock times the way the mockups do', () => {
    expect(clockText(302)).toBe('5:02am');
    expect(clockText(18 * 60 + 41)).toBe('6:41pm');
    expect(clockText(0)).toBe('12:00am');
    expect(clockText(12 * 60)).toBe('12:00pm');
    expect(clockText(302.4)).toBe('5:02am');
  });

  it('writes lengths of time the way the mockups do', () => {
    expect(durationText(13 * 60 + 39)).toBe('13 h 39 m');
    expect(durationText(260)).toBe('4 h 20 m');
    expect(durationText(45)).toBe('45 m');
    expect(durationText(-5)).toBe('0 m');
  });
});
