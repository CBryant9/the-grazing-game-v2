/**
 * Looking at the working day: the clock, the jobs in progress and the
 * bookings, as numbers for the screens (PRD 5.1). Looking is free: nothing
 * here changes the farm or moves the clock.
 */

import type { ActionEnv } from '../actions/apply';
import type { Action, ActionType, JobPreview } from '../actions/types';
import type { CalendarDate } from '../calendar';
import { JOB_TIMES } from '../data/jobTimes';
import { dayMinutes, homesteadPoint, lightLeft, timeNow } from '../sim/clock';
import { dateOn } from '../sim/derived';
import type { FarmState, JobPiece, LoggedAction, MapPoint, WorkRules } from '../sim/state';
import { NO_TIME, jobShare, previewAction } from './act';
import { driveMinutes, edgeEnds, pointAlong, squaresBetween } from './travel';

/** The farm clock, for the daylight bar. Times of day are minutes after midnight on the district town's clock. */
export interface ClockView {
  day: number;
  /** The date the game reports: the real date on a real-year farm. */
  date: CalendarDate;
  firstLight: number;
  lastLight: number;
  /** The time now. First light until a job is done. */
  now: number;
  /** Minutes of light in the day, used so far, and left. */
  dayMin: number;
  usedMin: number;
  leftMin: number;
  /** Where the player is, and the drive home from there, minutes. */
  at: MapPoint;
  homeMin: number;
  /** False once today's light is used up: no more jobs can start today. */
  canStartJobs: boolean;
  /** The switches the farm runs on, and the speed of travel, km/h. */
  workRules: WorkRules;
  travelKmH: number;
  jobsInProgress: number;
  bookings: number;
}

export function clockView(farm: FarmState): ClockView {
  const left = lightLeft(farm);
  return {
    day: farm.day,
    date: dateOn(farm),
    firstLight: farm.clock.firstLight,
    lastLight: farm.clock.lastLight,
    now: timeNow(farm),
    dayMin: dayMinutes(farm),
    usedMin: farm.clock.used,
    leftMin: left,
    at: { x: farm.clock.at.x, y: farm.clock.at.y },
    homeMin: driveMinutes(farm, farm.clock.at, homesteadPoint(farm)),
    canStartJobs: !farm.over && left > NO_TIME,
    workRules: { ...farm.workRules },
    travelKmH: JOB_TIMES.travelKmH.value,
    jobsInProgress: farm.jobs.length,
    bookings: farm.bookings.length,
  };
}

/** A job in progress, for the jobs list and the map. */
export interface JobView {
  id: number;
  /** The action as it was asked for, and its type. */
  action: Action;
  type: ActionType;
  kind: 'line' | 'whole';
  startedDay: number;
  /** The share of the job done, 0 to under 1. */
  doneShare: number;
  /** Dollars charged so far, and minutes worked and driven so far. */
  spent: number;
  workedMin: number;
  travelMin: number;
  /** Fence, tape and pipe: what the map needs to draw pegs and a half-built line. Null for other jobs. */
  line: {
    /** Pieces finished, and pieces in the job when it started. */
    piecesDone: number;
    pieces: number;
    /** The pieces still to do, in order: where the pegs go. */
    pegs: JobPiece[];
    /** The piece being built: how far along it the work has got, and the built part's two ends. Null between pieces. */
    half: { piece: JobPiece; share: number; from: MapPoint; to: MapPoint } | null;
    metresLeft: number;
  } | null;
  /**
   * What carrying on today would do: the time, the cost of what is left,
   * and the days it still needs. Or why it can't carry on today.
   */
  carryOn: JobPreview;
}

/** Every job in progress, oldest first. */
export function jobsInProgress(farm: FarmState, env: ActionEnv = {}): JobView[] {
  const sideM = farm.layout.scale.sideM;
  return farm.jobs.map((j) => {
    let line: JobView['line'] = null;
    if (j.kind === 'line') {
      let half: NonNullable<JobView['line']>['half'] = null;
      const first = j.left[0];
      if (first && j.part > 0 && 'edge' in first) {
        let [a, b] = edgeEnds(first.edge);
        if (j.lastEnd && squaresBetween(b, j.lastEnd) < squaresBetween(a, j.lastEnd)) {
          [a, b] = [b, a];
        }
        half = { piece: first, share: j.part, from: a, to: pointAlong(a, b, j.part) };
      }
      line = {
        piecesDone: j.piecesDone,
        pieces: j.pieces,
        pegs: j.left.map((p) => ('edge' in p ? { edge: { ...p.edge } } : { cell: p.cell })),
        half,
        metresLeft: (j.left.length - j.part) * sideM,
      };
    }
    return {
      id: j.id,
      action: j.action,
      type: j.action.type,
      kind: j.kind,
      startedDay: j.startedDay,
      doneShare: jobShare(j),
      spent: j.spent,
      workedMin: j.workedMin,
      travelMin: j.travelMin,
      line,
      carryOn: previewAction(farm, { type: 'continueJob', job: j.id }, env),
    };
  });
}

/** Work booked with a contractor, for the jobs list. */
export interface BookingView {
  id: number;
  action: Action;
  type: ActionType;
  bookedDay: number;
  /** The farm day the work is done, at first light, and how many days away that is. */
  dueDay: number;
  daysToGo: number;
  /** What the work would have cost on the day it was booked. It is charged when it is done. */
  quote: number;
}

export function bookingsView(farm: FarmState): BookingView[] {
  return farm.bookings.map((b) => ({
    id: b.id,
    action: b.action,
    type: b.action.type,
    bookedDay: b.bookedDay,
    dueDay: b.dueDay,
    daysToGo: Math.max(0, b.dueDay - farm.day),
    quote: b.quote,
  }));
}

/**
 * Today's jobs with their times, in the order they were done: for the
 * diary, and for splitting a mob's day of grazing at the time it was
 * moved (the next part of this milestone).
 */
export function jobsToday(farm: FarmState): LoggedAction[] {
  const out: LoggedAction[] = [];
  for (let i = farm.actionLog.length - 1; i >= 0; i--) {
    const entry = farm.actionLog[i]!;
    if (entry.day !== farm.day) break;
    if (entry.at) out.push(entry);
  }
  return out.reverse();
}
