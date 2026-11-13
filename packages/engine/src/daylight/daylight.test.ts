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
