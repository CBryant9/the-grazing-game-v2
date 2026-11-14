/**
 * Contractor fencing that carries on over days (PRD 5.11, section 21 rows
 * 15 and 34).
 *
 * A run is permanent fence built by a 1-man team (500 m a day) or a 2-man
 * team (1,000 m a day). It takes none of the player's day. The team works
 * Monday to Friday and builds at first light on each day it works, starting
 * the next working day after the run is ordered. It needs nothing from the
 * player each day. It is charged for what it builds each day: materials (the
 * player's own price, materials on hand first at half price) and the labour
 * charge per metre. It stops for a reason only, with an event saying why:
 * the bank won't cover the day's work, or the line has changed since it was
 * ordered (the player put a different fence on a segment still to build).
 */

import { LABOUR } from '../data/labour';
import { weekdayOf } from '../market/saleCalendar';
import { dateOn } from '../sim/derived';
import type { FarmState } from '../sim/state';
import { EDGE, getEdge } from '../farm/topology';
import type { ContractRun } from './types';

/** True if contractors work on that farm day. */
export function contractorWorks(farm: FarmState, day: number): boolean {
  return (LABOUR.contractorDays.value as readonly number[]).includes(weekdayOf(dateOn(farm, day)));
}

/** Segments of a run still to build that need work (not already permanent, not a gate). */
export function runPiecesLeft(farm: FarmState, run: ContractRun): number {
  let n = 0;
  for (const e of run.left) {
    const c = getEdge(farm.layout.fences, e);
    if (c === EDGE.permanent || c === EDGE.gateShut || c === EDGE.gateOpen || c === EDGE.boundary) {
      continue;
    }
    n++;
  }
  return n;
}

/** Metres of a run still to build. */
export const runMetresLeft = (farm: FarmState, run: ContractRun): number =>
  runPiecesLeft(farm, run) * farm.layout.scale.sideM;

/**
 * When a run will start and finish at the team's pace, counting only the
 * days contractors work. `startDay` is the next day the team works (after
 * today: today's first light has passed). Hands helping would make it
 * sooner; they are not counted, as they may be off or busy.
 */
export function contractDone(
  farm: FarmState,
  run: ContractRun,
): { startDay: number; doneDay: number } {
  const need = runMetresLeft(farm, run) - run.progressM;
  const perDay = LABOUR.teamMetresPerDay.value[run.team];
  let startDay = -1;
  let have = 0;
  for (let d = farm.day + 1; d < farm.day + 20000; d++) {
    if (!contractorWorks(farm, d)) continue;
    if (startDay < 0) startDay = d;
    have += perDay;
    if (have >= need - 1e-9) return { startDay, doneDay: d };
  }
  return { startDay: Math.max(startDay, farm.day + 1), doneDay: farm.day + 20000 };
}
