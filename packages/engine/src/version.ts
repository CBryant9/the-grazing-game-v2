/**
 * Every farm records the engine version it runs on. Any change to the model
 * or its data bumps this, re-runs calibration and is logged in
 * docs/MODEL.md and docs/CALIBRATION.md.
 *
 * 0.6.0 (milestone 1.4): a farm can play real years, with real weather,
 * real prices in today's dollars and real sale days. A farm with random
 * seasons runs exactly as it did on 0.5.0.
 *
 * 0.7.0 (milestone 1.5a): the farm clock. Jobs take time off the day's
 * light. A job fits today or it does not, and a line too long for today
 * is built as far as fits. No grass, cattle, crop or price
 * formula changed: a farm driven without the clock (calibration) runs
 * exactly as it did on 0.6.0.
 *
 * 0.8.0 (milestone 1.5b): sale days and the yards. Every farm has a sale
 * calendar. On the clock, cattle are bought only on a sale day and land in
 * the stock yards at first light the next day. Stock sold on another day
 * is booked onto the next sale. No grass, cattle, crop or price formula
 * changed: a farm driven without the clock (calibration) runs exactly as
 * it did on 0.7.0.
 *
 * 0.9.0 (milestone 1.5c): grazing plans as templates, run from a step, and
 * the plan moves in the daily tick, with the move time taken off the day's
 * light. A farm with no plan runs exactly as it did on 0.8.0. No grass,
 * cattle, crop or price formula changed.
 *
 * 0.10.0 (engine rules after the screens review, 14 Nov 2026): fence
 * materials are kept when fence is taken down and reused at half price;
 * both kinds of water hub can be removed and moved; the player is told
 * only what a joining report or a preg test has told them; and reads the
 * web server needs. No grass, cattle, crop, season or price formula
 * changed. A farm that never takes a fence down and builds again runs
 * exactly as it did on 0.9.0.
 *
 * 0.11.0 (milestone 1.7f, 14 Nov 2026): selling by sale group and moving
 * part of a mob by class picked by what the player was told. Replaced the
 * same day by 0.12.0.
 *
 * 0.12.0 (14 Nov 2026, Claudia): the herd record. A cow or heifer is PTIC
 * on the record, by herself, from `PTIC_DAYS` in calf (the day the price
 * pays the in-calf premium); no preg test and nothing kept of what the
 * player was told. Every class and group the player sees or picks from
 * uses that rule (`recordClassOf`, `recordGroupOf`). No grass, cattle,
 * crop, season or price formula changed.
 */
export const ENGINE_VERSION = '0.12.0';

/**
 * The shape of a saved farm. Old saves are upgraded with defaults.
 *
 * 2: a farm can be a real-year farm (its `seasons` and `market` have a
 * second form). Nothing was added to a farm with random seasons, so a
 * format 1 save loads as it is. An engine that only knows format 1 refuses
 * a format 2 save, which is right: it could not run a real-year farm.
 *
 * 3: the first cut of the working day (never released): a clock, the
 * player's place, travel switches, jobs in progress and bookings.
 *
 * 4: the working day as Claudia simplified it on 14 Nov 2026. A farm has
 * a clock (first light, last light, light used) and nothing else new. The
 * homestead is gone and the stock yards stay. A format 1 or 2 save loads
 * at first light. A format 3 save loads with the homestead, the player's
 * place, the switches, the jobs in progress and the bookings dropped.
 *
 * 5: sale days and the yards (milestone 1.5b). A farm has `arrivals`
 * (cattle bought and on their way to the yards) and `saleBookings` (stock
 * booked onto a sale day), and a mob in the yards may say the day it came.
 * An older save loads with none of them.
 *
 * 6: grazing plans (milestone 1.5c). A farm has `plans` (templates) and
 * `nextPlanId`, and a mob may have a `plan` (where it is on a template). An
 * older save loads with no plans.
 *
 * 7: engine rules after the screens review (14 Nov 2026). A farm's layout
 * has `fenceOnHand` (permanent and electric fence materials kept, in
 * segments). A farm has `knownInCalf` (the females the player knows are in
 * calf) and a mob may have `reports` (its latest joining report and preg
 * test), both display state only. An older save loads with nothing on hand,
 * no female known in calf, and each mob's latest reports read back from
 * the inbox.
 *
 * 8: the herd record (14 Nov 2026, Claudia). A female is PTIC on the record
 * from `PTIC_DAYS` in calf, worked out from the cattle, so `knownInCalf` and
 * a mob's `reports` are gone. A format 7 save loads with them dropped.
 */
export const SAVE_FORMAT_VERSION = 8;
