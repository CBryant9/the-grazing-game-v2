/**
 * Light and weather, as one colour laid over the whole map.
 *
 * The map is tinted from the warm low light at first light, through the
 * white light of the day, to the warm light before dark, so the day's work
 * time is something you can see (PRD 7). Outside those hours it is dark
 * blue. The tint multiplies every colour on the map: it costs nothing to
 * draw (no full-screen filter).
 */

import { lit, mix } from './colour';
import { NATURAL } from './palette';

/** The light takes this long to turn from warm to white after first light, and back before last light. */
export const WARM_LIGHT_MINUTES = 110;
/** The light takes this long to fade between dark and first or last light. */
export const TWILIGHT_MINUTES = 40;

export type MapWeatherKind = 'clear' | 'overcast' | 'rain';

export interface MapWeather {
  kind: MapWeatherKind;
}

/**
 * The colour of the light at a time of day. `minutes` is minutes after
 * midnight on the farm's clock. `first` and `last` are first and last light.
 */
export function lightTint(minutes: number, first: number, last: number): number {
  const N = NATURAL;
  if (!Number.isFinite(minutes)) return N.lightDay;
  if (minutes <= first - TWILIGHT_MINUTES || minutes >= last + TWILIGHT_MINUTES) {
    return N.lightNight;
  }
  if (minutes < first) {
    return mix(
      N.lightNight,
      N.lightFirst,
      (minutes - (first - TWILIGHT_MINUTES)) / TWILIGHT_MINUTES,
    );
  }
  if (minutes > last) {
    return mix(N.lightLast, N.lightNight, (minutes - last) / TWILIGHT_MINUTES);
  }
  // A short day can be all warm light: the two ramps meet in the middle.
  const warm = Math.min(WARM_LIGHT_MINUTES, (last - first) / 2);
  if (minutes < first + warm) return mix(N.lightFirst, N.lightDay, (minutes - first) / warm);
  if (minutes > last - warm) return mix(N.lightLast, N.lightDay, (last - minutes) / warm);
  return N.lightDay;
}

/** The colour the weather lays over the light. Clear weather leaves it alone. */
export function weatherTint(kind: MapWeatherKind): number {
  return kind === 'rain'
    ? NATURAL.lightRain
    : kind === 'overcast'
      ? NATURAL.lightOvercast
      : NATURAL.lightDay;
}

/** The light on the map: time of day and weather together. */
export function mapTint(
  minutes: number | null,
  first: number,
  last: number,
  weather: MapWeatherKind,
): number {
  const day = minutes === null ? NATURAL.lightDay : lightTint(minutes, first, last);
  return lit(day, weatherTint(weather));
}
