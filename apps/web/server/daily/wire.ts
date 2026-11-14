import 'server-only';
import { dateOn, type FarmState } from '@gg/engine';
import type { DailyWire } from '../../lib/game/types';
import { reportWire } from '../game/labourwords';
import { dateParts } from '../game/snapshot';
import { plansDue } from './advance';
import { localDate, nextMidnight } from './clock';
import { workOf, type DailyStored } from './state';

/** What the player reads when Daily Farm has nothing to run on right now. */
export const UNAVAILABLE_TEXT =
  'Daily Farm is not available right now, so your farm is still on its last day. You can look around, but no job can start until it is back.';
/** What the player reads when Daily Farm is switched off. */
export const PAUSED_TEXT = 'Daily Farm is paused right now. Your farm carries on when it is back.';
/** What the player reads when a job is sent for a day that has ended. */
export const MIDNIGHT_TEXT =
  'The day ended at midnight, so that job was not done. Here is your farm for today.';

/**
 * The part of a snapshot only a Daily Farm has. Every time in it is the server's: `endsAt` is
 * worked out from the server's clock and the farm's locked time zone, and `serverNow` lets the
 * browser count down without trusting its own clock to be right.
 */
export function dailyWire(
  farm: FarmState,
  daily: DailyStored,
  now: number,
  waiting: string | null,
): DailyWire {
  const today = localDate(now, daily.timezone);
  const bubbles = reportWire(farm, daily.seenSeq, (d) => dateParts(dateOn(farm, d))).bubbles;
  return {
    timezone: daily.timezone,
    endsAt: nextMidnight(now, daily.timezone),
    serverNow: now,
    waiting,
    work: workOf(daily, today),
    catchUp:
      daily.away.length > 0 || bubbles.length > 0
        ? { days: daily.away, report: bubbles, daysAway: daily.awayTotal ?? daily.away.length }
        : null,
    planDue: waiting || farm.over ? [] : plansDue(farm),
  };
}
