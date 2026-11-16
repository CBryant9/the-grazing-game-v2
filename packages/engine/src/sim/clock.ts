/**
 * The farm clock (PRD 5.1 and 14.4).
 *
 * Every farm day starts at first light and ends at last light for the
 * farm's district town, on the date the game reports (the real date on a
 * real-year farm). The farm keeps today's first and last light and how
 * many minutes of that light have been used. There is no place on the
 * farm the player has to be: a job's time is its work only.
 *
 * Nothing here reads a real clock. The date always comes from the farm.
 */

import { daylightFor, type Daylight } from '../daylight/daylight';
import { DISTRICT_PLACES } from '../daylight/places';
import { dateOn } from './derived';
import type { FarmState } from './state';

// First and last light for a district and a date never change, so each is
// worked out once.
const lights = new Map<string, Daylight>();

/** First light, last light and the minutes between them on a farm day (today if no day is given). */
export function lightOn(farm: FarmState, day: number = farm.day): Daylight {
  const d = dateOn(farm, day);
  const key = `${farm.district}:${d.year}-${d.month}-${d.date}`;
  let light = lights.get(key);
  if (!light) {
    light = daylightFor(DISTRICT_PLACES[farm.district], d);
    lights.set(key, light);
  }
  return light;
}

/** Start the farm's day: first light, nothing used. */
export function startDay(farm: FarmState): void {
  const light = lightOn(farm);
  farm.clock = {
    firstLight: light.firstLight,
    lastLight: light.lastLight,
    used: 0,
  };
}

/** Minutes of light in the farm's day. */
export const dayMinutes = (farm: Pick<FarmState, 'clock'>): number =>
  farm.clock.lastLight - farm.clock.firstLight;

/** Minutes of today's light not yet used. Never under 0. */
export const lightLeft = (farm: Pick<FarmState, 'clock'>): number =>
  Math.max(0, dayMinutes(farm) - farm.clock.used);

/** The time now on the farm, in minutes after midnight on the district town's clock. */
export const timeNow = (farm: Pick<FarmState, 'clock'>): number =>
  farm.clock.firstLight + farm.clock.used;
