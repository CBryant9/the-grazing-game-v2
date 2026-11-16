/**
 * Growth potential for a day.
 *
 * Each monthly figure is taken as the value on the 15th. Days in between
 * are a straight line from one month's figure to the next, so growth
 * changes smoothly through the year.
 */

import type { CalendarDate } from '../calendar';
import type { District } from '../data/districts';
import { lerp } from '../num';

/** A monthly curve (January to December) read off for a date. */
export function interpMonth(curve: readonly number[], date: CalendarDate): number {
  const t = date.month + (date.date - 15) / 30;
  let i0 = Math.floor(t);
  const f = t - i0;
  i0 = ((i0 % 12) + 12) % 12;
  return lerp(curve[i0]!, curve[(i0 + 1) % 12]!, f);
}

/**
 * Native pasture growth potential for a district on a date, kg DM/ha/day,
 * in an average season (before the month factor).
 */
export function districtPotential(district: District, date: CalendarDate): number {
  return interpMonth(district.g, date) * district.scale;
}
