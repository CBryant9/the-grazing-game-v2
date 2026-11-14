import type { DailyWork, DateParts } from '../../lib/game/types';

/*
 * What a Daily Farm keeps beside the engine's save (docs/DATABASE.md, `farm_saves.daily`).
 * Dates are local dates in the farm's own time zone, as YYYY-MM-DD text.
 */

/** A day the player did not open the farm, waiting to be shown in the catch-up. */
export interface AwayDay {
  day: number;
  date: DateParts;
  lines: string[];
}

export interface DailyStored {
  /** The farm's time zone, an IANA name. Set when the farm starts. */
  timezone: string;
  /** The local date the farm started on. */
  startedOn: string;
  /** The last local date the player opened the farm. A night that follows a date with no open is a missed day. */
  openedOn: string | null;
  /** The last local date the player did a job. */
  workedOn: string | null;
  /** The last local date the player said they were done. */
  doneOn: string | null;
  /** Days that passed with no open, oldest first, until the player has seen them. At most `AWAY_KEPT` are kept. */
  away: AwayDay[];
  /** How many days passed with no open, all of them, kept or not. The summary says this number and that it shows the last `AWAY_KEPT`. */
  awayTotal: number;
  /** The newest inbox message the player has seen. What the hands did after it is the worker report. */
  seenSeq: number;
  /** The farm versions from before the last few midnights, so a job shown before midnight is told why it was not done. */
  rolledFrom: string[];
}

/** Days kept waiting for the catch-up. A farm left alone longer than this shows the latest. */
export const AWAY_KEPT = 60;
export const ROLLED_KEPT = 6;

/** A farm's work for today, as a fact. */
export function workOf(d: DailyStored, today: string): DailyWork {
  if (d.doneOn === today) return 'done';
  if (d.workedOn === today) return 'started';
  return 'not-started';
}

export function isDailyStored(v: unknown): v is DailyStored {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.timezone === 'string' &&
    typeof d.startedOn === 'string' &&
    Array.isArray(d.away) &&
    typeof d.seenSeq === 'number'
  );
}

/** What is kept of a farm saved before it had these (none exist yet; a guard against a half-written value). */
export function cleanDaily(v: unknown): DailyStored | undefined {
  if (!isDailyStored(v)) return undefined;
  const d = v as DailyStored;
  return {
    timezone: d.timezone,
    startedOn: d.startedOn,
    openedOn: typeof d.openedOn === 'string' ? d.openedOn : null,
    workedOn: typeof d.workedOn === 'string' ? d.workedOn : null,
    doneOn: typeof d.doneOn === 'string' ? d.doneOn : null,
    away: d.away.slice(-AWAY_KEPT),
    awayTotal: typeof d.awayTotal === 'number' ? d.awayTotal : d.away.length,
    seenSeq: d.seenSeq,
    rolledFrom: Array.isArray(d.rolledFrom) ? d.rolledFrom.slice(-ROLLED_KEPT) : [],
  };
}
