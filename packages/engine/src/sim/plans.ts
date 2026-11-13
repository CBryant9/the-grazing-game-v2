/**
 * Grazing plans: the place they plug into the daily tick.
 *
 * Plans are a later milestone (1.5). The cattle step already takes a mob's
 * stops for the day as `shifts`. When plans are built, this is where a
 * mob's plan gives today's stops, and where the plan moves the mob on after
 * the day's costs (docs/MODEL.md, the day's order, step 8).
 */

import type { FarmMob, FarmState } from './state';

/**
 * Today's stops for a mob whose plan moves it more than once a day: one
 * square in each grazing area, in order. Null for a mob that stays put all
 * day, which is every mob until plans are built.
 */
export const stopsToday: (farm: FarmState, mob: FarmMob) => readonly number[] | null = () => null;
