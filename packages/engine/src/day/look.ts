/**
 * Looking at the working day: the clock, what needs doing, and today's
 * jobs, as facts for the screens (PRD 5.1). Looking is free: nothing here
 * changes the farm or moves the clock.
 */

import type { ActionEnv } from '../actions/apply';
import type { Action, ActionRefusalReason } from '../actions/types';
import type { CalendarDate } from '../calendar';
import { markable, weanable } from '../cattle/breeding';
import { JOB_TIMES } from '../data/jobTimes';
import { dayMinutes, lightLeft, timeNow } from '../sim/clock';
import { dateOn, nextSaleDay, saleDayOn, type SourceEnv } from '../sim/derived';
import { animalLookup } from '../cattle/types';
import type { SaleClassId } from '../data/cattle';
import type { FarmState, LoggedAction } from '../sim/state';
import { NO_TIME, previewAction } from './act';

/**
 * The shortest job in the table that takes time and is done in one go:
 * moving a mob (15 minutes and a little for the head). With less light
 * than this left, nothing of that kind fits today.
 */
export const SHORTEST_JOB_MIN = JOB_TIMES.moveMobSettleMin.value;

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
  /** False once today's light is used up: no job can start. Looking is still free. */
  canStartJobs: boolean;
  /** The shortest job that takes time and is done in one go, minutes (moving a mob). */
  shortestJobMin: number;
  /**
   * True when less light is left than the shortest job needs: no more
   * jobs fit today. A screen can dim the farm and light up Next day. The
   * farm can still be looked at.
   */
  evening: boolean;
  /** True when jobs are held to the light (Daily Farm). False with the clock off (Fast Farm). */
  daylightLimit: boolean;
}

/**
 * The clock for the screens. With the clock off (`env.noClock`, Fast Farm)
 * jobs never run out of light, so it is never evening and jobs can always
 * start while the farm is running.
 */
export function clockView(farm: FarmState, env: Pick<ActionEnv, 'noClock'> = {}): ClockView {
  const left = lightLeft(farm);
  if (env.noClock) {
    return {
      day: farm.day,
      date: dateOn(farm),
      firstLight: farm.clock.firstLight,
      lastLight: farm.clock.lastLight,
      now: timeNow(farm),
      dayMin: dayMinutes(farm),
      usedMin: farm.clock.used,
      leftMin: left,
      canStartJobs: !farm.over,
      shortestJobMin: SHORTEST_JOB_MIN,
      evening: false,
      daylightLimit: false,
    };
  }
  return {
    day: farm.day,
    date: dateOn(farm),
    firstLight: farm.clock.firstLight,
    lastLight: farm.clock.lastLight,
    now: timeNow(farm),
    dayMin: dayMinutes(farm),
    usedMin: farm.clock.used,
    leftMin: left,
    canStartJobs: !farm.over && left > NO_TIME,
    shortestJobMin: SHORTEST_JOB_MIN,
    evening: left < SHORTEST_JOB_MIN,
    daylightLimit: true,
  };
}

export {
  CALVING_SHOWN_DAYS,
  LOW_CS,
  MARK_AFTER_CALVING_DAYS,
  allThingsToDo,
  pruneTodoOff,
  thingsToDo,
  todoKey,
  type ThingToDo,
} from './todo';

/** Whether a stock job can be done on a mob now, and on how many head. */
export interface HusbandryJob {
  /** Calves `markCalves` would mark (bull calves and unmarked young bulls), or calves `wean` would wean (90 days or more). */
  count: number;
  /** True if the job can be done now. */
  canDo: boolean;
  /** Why not, as the job itself says it: a reason code and plain words. Left out when it can be done. */
  why?: { reason: ActionRefusalReason; message: string };
}

/** Marking and weaning for one mob. */
export interface MobHusbandry {
  mob: number;
  name: string;
  mark: HusbandryJob;
  wean: HusbandryJob;
}

/**
 * For each mob: how many calves marking would mark and weaning would wean,
 * and whether each can be done now with the plain reason if not. The counts
 * are the actions' own lists (`markable`, `weanable`), and "can it be done"
 * is the job card's own answer (`previewAction`), so the reason is the one
 * the job would give: nothing to do, no light left, the bank, the game over.
 */
export function husbandryNow(farm: FarmState, env: ActionEnv = {}): MobHusbandry[] {
  const job = (action: Action, count: number): HusbandryJob => {
    const card = previewAction(farm, action, env);
    return card.ok
      ? { count, canDo: true }
      : { count, canDo: false, why: { reason: card.reason, message: card.message } };
  };
  return farm.mobs.map((m) => ({
    mob: m.id,
    name: m.name,
    mark: job({ type: 'markCalves', mob: m.id }, markable(m).length),
    wean: job({ type: 'wean', mob: m.id }, weanable(m).length),
  }));
}

/**
 * Today's jobs with their times, in the order they were done: for the
 * diary, and for splitting a mob's day of grazing at the time it was
 * moved.
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

/** A day of sale, as the screens need it. */
export interface SaleDayView {
  /** The farm day, and the date the game reports. */
  day: number;
  date: CalendarDate;
  /** Days from today. 0 for today. */
  daysAway: number;
}

/** Stock booked onto a sale day. */
export interface BookedView extends SaleDayView {
  /** Head booked that are still on the farm, calves at foot not counted unless they were picked. */
  head: number;
  /** Their tag numbers, smallest first. Animals that have died or been sold are left out. */
  animalIds: number[];
}

/** Cattle bought and on their way to the yards. */
export interface OnTheWayView extends SaleDayView {
  cls: SaleClassId;
  /** Head, calves at foot included. */
  head: number;
  /** Dollars paid, freight included. */
  cost: number;
}

/** What the saleyard looks like today, for the market screen. Looking is free. */
export interface MarketView {
  /** True when the district yard holds a cattle sale today. Cattle can be bought only today if so. */
  isSaleDay: boolean;
  /** The next sale after today, or null when there is none in the next few months. */
  nextSale: SaleDayView | null;
  /** Stock booked onto a sale, by sale day. */
  booked: BookedView[];
  /** Cattle bought and on their way to the yards. */
  onTheWay: OnTheWayView[];
}

/**
 * Where the farm stands with the saleyard: whether today is a sale day,
 * the next one, the stock booked onto a sale and the cattle on their way.
 * A farm that plays real years needs the real data in `env`. Nothing
 * changes: looking is free.
 */
export function marketView(farm: FarmState, env: SourceEnv = {}): MarketView {
  const view = (day: number): SaleDayView => ({
    day,
    date: dateOn(farm, day),
    daysAway: day - farm.day,
  });
  const next = nextSaleDay(farm, env, farm.day + 1);
  const all = animalLookup(farm.mobs);
  return {
    isSaleDay: saleDayOn(farm, env) !== null,
    nextSale: next ? view(next.day) : null,
    booked: farm.saleBookings.map((b) => {
      const animalIds = [...b.animalIds].filter((id) => all.has(id));
      return { ...view(b.saleDay), head: animalIds.length, animalIds };
    }),
    onTheWay: farm.arrivals.map((a) => ({
      ...view(a.arriveDay),
      cls: a.cls,
      head: a.animals.length,
      cost: a.cost,
    })),
  };
}
