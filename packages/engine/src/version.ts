/**
 * Every farm records the engine version it runs on. Any change to the model
 * or its data bumps this, re-runs calibration and is logged in
 * docs/MODEL.md and docs/CALIBRATION.md.
 *
 * 0.6.0 (milestone 1.4): a farm can play real years, with real weather,
 * real prices in today's dollars and real sale days. A farm with random
 * seasons runs exactly as it did on 0.5.0.
 *
 * 0.7.0 (milestone 1.5a): the farm clock. Jobs take time, travel counts,
 * and big jobs run over several days. No grass, cattle, crop or price
 * formula changed: a farm driven without the clock (calibration) runs
 * exactly as it did on 0.6.0.
 */
export const ENGINE_VERSION = '0.7.0';

/**
 * The shape of a saved farm. Old saves are upgraded with defaults.
 *
 * 2: a farm can be a real-year farm (its `seasons` and `market` have a
 * second form). Nothing was added to a farm with random seasons, so a
 * format 1 save loads as it is. An engine that only knows format 1 refuses
 * a format 2 save, which is right: it could not run a real-year farm.
 *
 * 3: the working day. A farm has a clock, the player's place, the
 * switches for the working day, jobs in progress and bookings. A format 1
 * or 2 save loads at first light with none of either.
 */
export const SAVE_FORMAT_VERSION = 3;
