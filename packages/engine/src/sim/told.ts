/**
 * The herd record: what the player's mob lists show about pregnancy, and
 * only that (Claudia, 14 Nov 2026).
 *
 * "They would just be cows before that, then they're PTIC, and before that,
 * they're dry." A cow or heifer goes on the record as PTIC, by herself, once
 * she is `PTIC_DAYS` days in calf. No preg test job. Before that she is an
 * ordinary cow or heifer (dry with no calf at foot), whether or not she is
 * really in calf. The record shows how far along each PTIC female is.
 *
 * `PTIC_DAYS` is the day the sale price starts paying the in-calf premium
 * (`PREG_PREMIUM.fromDays`), so the record and the price always agree: "You
 * only get PTIC price if that cow is confirmed to be pregnant. They would
 * just be sold as cows."
 *
 * Every class and sale group the player sees or picks from uses this one
 * rule: the mob card, the herd list, the map's classes, selling by group,
 * booking a sale and moving part of a mob. `classOf` and `groupKey` (live
 * pregnancy from the day she conceives) stay for tests and calibration.
 */

import { classOf, groupKey } from '../cattle/animal';
import type { Animal } from '../cattle/types';
import type { CattleClassId, GroupId } from '../data/cattle';
import { PREG_PREMIUM } from '../market/prices';

/** Days in calf from which a female is PTIC on the record: the day the price pays the in-calf premium. */
export const PTIC_DAYS = PREG_PREMIUM.fromDays;

/** True for a cow or heifer on the record as PTIC. */
export const onRecordPtic = (a: Animal): boolean =>
  (a.kind === 'cow' || a.kind === 'heifer') && a.preg >= PTIC_DAYS;

/** The beast as the record sees it: not in calf until she is `PTIC_DAYS` in. */
const asRecorded = (a: Animal): Animal =>
  a.preg >= 0 && a.preg < PTIC_DAYS ? { ...a, preg: -1 } : a;

/**
 * An animal's class on the record: the herd list's class, except that a
 * female counts as PTIC only from `PTIC_DAYS` in calf. Before that she is a
 * dry cow, a cow with her calf at foot, or a heifer.
 */
export function recordClassOf(a: Animal): CattleClassId {
  return classOf(asRecorded(a));
}

/** An animal's sale group on the record: the PTIC groups only from `PTIC_DAYS` in calf. */
export function recordGroupOf(a: Animal): GroupId {
  return groupKey(asRecorded(a));
}
