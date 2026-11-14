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
 *
 * 0.12.1 (14 Nov 2026, a review): the `slipped` note carries the days in
 * calf, the joining and no-bull notes carry `readyOnRecord`, and
 * `predictGains` takes a grouping, so the screens can follow the record in
 * every line. No formula changed.
 *
 * 0.13.0 (milestones 2.1 and 2.2): farm hands and contractor fencing. A
 * labour pool worked out from the seed, hiring and letting go, wages and
 * super out of the bank on pay day, the farm's standing with workers,
 * standing duties, a hand's share of the player's jobs from their own day,
 * injuries at the published rate, and contract fencing (permanent fence, a
 * 1-man or 2-man team) that carries on by itself over days. No grass,
 * cattle, crop, season or price formula changed. A farm with no hands and
 * no contract fencing plays exactly as it did on 0.12.1 (a test holds its
 * digest).
 *
 * 0.14.0 (milestone 2.3): the sheep model. Sheep mobs beside the cattle
 * mobs, on the same grass model: energy and intake by class, growth,
 * condition, joining on a 17-day cycle, lambing, lamb survival, marking and
 * weaning counts, wool and micron, deaths (lambing, weaners, thin sheep, no
 * water, flystrike) and water by class (docs/MODEL.md, the sheep section).
 * No grass, cattle, crop, season or price formula changed. A farm with no
 * sheep plays exactly as it did on 0.13.0 (a test holds its digest).
 *
 * 0.15.0 (milestone 2.3 second pass and the engine half of 2.4): sheep run
 * as records of like animals with head counts (drawn from the seeded
 * streams); sheep feeding (lick, grain, hay); contractor shearing and
 * crutching on dates, with wool sold at shearing; sheep health costs; sheep
 * deaths in the year score; the sheep market (buying and selling at the
 * MLA indicators); netting fence; sheep that get through cattle fences;
 * the cattle, sheep or mix choice at setup; one DSE figure (8.4) for every
 * display. No grass, cattle, crop, season or price formula changed. A farm
 * with no sheep plays exactly as it did on 0.13.0 (a test holds its digest).
 *
 * m2.5, calf growth (numbered 0.14.0 on its own branch, cut from 0.13.0;
 * shipped in 0.16.0 below): stock under 200 kg pay the measured energy
 * cost for a kg of gain (Sekine and Asahida 1990), moving to the grown
 * animal's cost in a straight line from 100 to 200 kg (`mjPerKgGain`); and
 * a cow's milk falls with her condition (to none at CS 1.5), not with the
 * feed's ME (`milkMJ`, `MILK`); and no milk is made past what her loss
 * for the day can pay for (`unpaidMilk`). Deliberate cattle model changes:
 * calves grow faster. Logged in
 * docs/CALIBRATION.md (the m2.5 entry); the no-hands digests were taken
 * again. No stored field changed, so the save format stays 9.
 *
 * 0.16.0 (m2.7, the engine join): the sheep line (0.15.0) and the calf
 * growth change joined. Both sets of rules are in; nothing else changed.
 * The calf rules move cattle only: every cattle figure equals the calf
 * branch's and every sheep figure the sheep branch's (docs/CALIBRATION.md,
 * the m2.7 entry). A farm with no sheep plays as the calf branch did (the
 * no-hands digests hold). No stored field changed, so the save format
 * stays 11.
 *
 * 0.17.0 (m2.7, review of the sheep third pass): sheep only. A lambing that
 * began before the farm's first day is a negative day, so start lambs are
 * marked and weaned (and no lamb stays at foot past 150 days); a sheep
 * under half its normal weight for its age dies, starved; the start flock
 * keeps only the replacements it needs, casts the oldest ewes at weaning,
 * has the lambs and the ewes in lamb the model itself would; adult and
 * wether deaths 0.91% a year (the document's arithmetic); lambs count in
 * the year's births; sheep plans take a move's daylight, warn of dry stops
 * and pause and resume; sheep on their way count in net worth; the sheep
 * breakout stream carries on from day to day; real-year sheep prices; the
 * budget's shearing, crutching and ram replacement costs; the weekly
 * losing-weight and low-condition notes. No cattle, grass or crop rule
 * changed. Logged in docs/CALIBRATION.md (the m2.7 review entry).
 */
export const ENGINE_VERSION = '0.17.0';

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
 *
 * 9: farm hands and contractor fencing (milestones 2.1 and 2.2). A farm
 * may have `labour` (its hands, its standing with workers, the next pay
 * day, contract fencing under way and the injury stream). It is left out on
 * a farm that has never hired or ordered contract fencing, so an older save
 * loads with no hands and no contract fencing, and is otherwise unchanged.
 *
 * 10: sheep (milestone 2.3). A farm may have `sheep` (its sheep mobs and
 * their random streams); a mob's sheep are saved in columns. It is left out
 * on a farm that has never had sheep, so an older save loads with no sheep
 * and is otherwise unchanged.
 *
 * 11: sheep as records (milestone 2.3 second pass and 2.4, engine half). A
 * sheep record has `n` (head) and `doomed2`; a sheep mob has `feed`,
 * `shearOn`, `crutchOn` and `lastBreak`; a year may have `wool` and
 * `sheepDeaths`. A format 10 save loads each sheep as a record of one, with
 * the district's shearing days and no feed. Older saves load with no sheep.
 *
 * 12: the sheep review (m2.7). A joining's `lambingStart` is null before
 * lambing, not -1, so a lambing that began before the farm's first day can
 * be a negative day; a format 11 or older save's -1 loads as null. On a
 * real-year farm, `sheep.prices` keeps today's sheep indicators and their
 * data version (left out with random seasons). A format 10 lamb doomed to
 * die after day 2 now dies on its next day.
 */
export const SAVE_FORMAT_VERSION = 12;
