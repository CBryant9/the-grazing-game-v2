/**
 * First light and last light for a place and a date (PRD 5.1 and 14.4).
 *
 * Every game day starts at first light and ends at last light. These are
 * civil dawn and dusk: the moments the centre of the sun is 6 degrees below
 * the horizon. Winter days are shorter than summer days, and the further
 * south the farm, the bigger the swing.
 *
 * The sun's position is worked out with the standard NOAA solar equations
 * (after Meeus). The result is given as clock time at the place, so daylight
 * saving is allowed for where it applies. Nothing here reads today's date:
 * the day is always passed in.
 */

import type { CalendarDate } from '../calendar';

export interface Place {
  /** Degrees. South is negative. */
  lat: number;
  /** Degrees. East is positive. */
  lon: number;
  /** The place's time zone name, for example "Australia/Brisbane". */
  timeZone: string;
}

export interface Daylight {
  /** First light, in minutes after midnight on the place's clock. */
  firstLight: number;
  /** Last light, in minutes after midnight on the place's clock. */
  lastLight: number;
  /** Minutes of working light between the two. */
  minutes: number;
  /** Minutes the place's clock is ahead of UTC on this day. */
  utcOffset: number;
}

/** The sun's centre is this far below the horizon at civil dawn and dusk. */
const CIVIL_ZENITH_DEG = 96;

const RAD = Math.PI / 180;

/** Days since 1 Jan 2000, 12:00 UTC, for 12:00 UTC on a calendar date. */
function daysSinceJ2000(date: CalendarDate): number {
  return Date.UTC(date.year, date.month, date.date, 12) / 86400000 - 10957.5;
}

/**
 * The sun for a day: its declination in degrees, and the equation of time in
 * minutes (how far sundial time runs ahead of clock time).
 */
function sunFor(date: CalendarDate): { declination: number; equationOfTime: number } {
  const t = daysSinceJ2000(date) / 36525;
  const meanLon = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const meanAnom = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const ecc = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const centre =
    Math.sin(meanAnom * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnom * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnom * RAD) * 0.000289;
  const trueLon = meanLon + centre;
  const omega = 125.04 - 1934.136 * t;
  const apparentLon = trueLon - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const declination = Math.asin(Math.sin(obliq * RAD) * Math.sin(apparentLon * RAD)) / RAD;

  const y = Math.tan((obliq / 2) * RAD) ** 2;
  const equationOfTime =
    (4 *
      (y * Math.sin(2 * meanLon * RAD) -
        2 * ecc * Math.sin(meanAnom * RAD) +
        4 * ecc * y * Math.sin(meanAnom * RAD) * Math.cos(2 * meanLon * RAD) -
        0.5 * y * y * Math.sin(4 * meanLon * RAD) -
        1.25 * ecc * ecc * Math.sin(2 * meanAnom * RAD))) /
    RAD;
  return { declination, equationOfTime };
}

/**
 * Minutes the place's clock is ahead of UTC at midday on a date. Daylight
 * saving and its past rule changes come from the time zone database, so real
 * years back to 1997 are right without hand-written rules.
 */
export function utcOffsetMinutes(timeZone: string, date: CalendarDate): number {
  const at = new Date(Date.UTC(date.year, date.month, date.date, 2));
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((local - at.getTime()) / 60000);
}

/** First light, last light and the minutes between them. */
export function daylightFor(place: Place, date: CalendarDate): Daylight {
  const { declination, equationOfTime } = sunFor(date);
  const utcOffset = utcOffsetMinutes(place.timeZone, date);

  // The hour angle of the sun at civil dawn and dusk, in degrees.
  const cosH =
    Math.cos(CIVIL_ZENITH_DEG * RAD) / (Math.cos(place.lat * RAD) * Math.cos(declination * RAD)) -
    Math.tan(place.lat * RAD) * Math.tan(declination * RAD);
  // Outside -1 to 1 the sun never gets that low or that high. That does not
  // happen at Australian farming latitudes, but the clamp keeps it safe.
  const hourAngle = Math.acos(Math.min(1, Math.max(-1, cosH))) / RAD;

  // Solar noon on the place's clock, then half the day either side of it.
  const noon = 720 - 4 * place.lon - equationOfTime + utcOffset;
  const firstLight = noon - 4 * hourAngle;
  const lastLight = noon + 4 * hourAngle;
  return { firstLight, lastLight, minutes: lastLight - firstLight, utcOffset };
}

/** Clock time for the screens: 302.4 becomes "5:02am". */
export function clockText(minutesAfterMidnight: number): string {
  const total = ((Math.round(minutesAfterMidnight) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')}${h24 < 12 ? 'am' : 'pm'}`;
}

/** A length of time for the screens: 439 becomes "7 h 19 m". */
export function durationText(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} m`;
  return `${h} h ${m} m`;
}
