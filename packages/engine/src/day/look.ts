/**
 * Looking at the working day: the clock, what needs doing, and today's
 * jobs, as facts for the screens (PRD 5.1). Looking is free: nothing here
 * changes the farm or moves the clock.
 */

import type { Action, ActionType } from '../actions/types';
import type { CalendarDate } from '../calendar';
import { MARK_NOTE_MIN_AGE, WEAN_MIN_AGE } from '../cattle/breeding';
import { JOB_TIMES } from '../data/jobTimes';
import { SPECIES, type SpeciesId } from '../data/species';
import { EDGE, H_EDGES, V_EDGES, type EdgeRef } from '../farm/topology';
import { PORTABLE_CAPACITY_L, PORTABLE_LOW_SHARE } from '../farm/water';
import { dayMinutes, lightLeft, timeNow } from '../sim/clock';
import { areaIdOf, dateOn, surveyOf } from '../sim/derived';
import type { FarmState, LoggedAction } from '../sim/state';
import { NO_TIME } from './act';

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
    canStartJobs: !farm.over && left > NO_TIME,
    shortestJobMin: SHORTEST_JOB_MIN,
    evening: left < SHORTEST_JOB_MIN,
  };
}

/**
 * One thing that needs doing on the farm now, as a fact: what it is, the
 * mob or the place, and the count. It never says what the player should
 * do. `does` names the action that deals with it, and `action` is that
 * action ready to send when it needs no further choice (null when the
 * player has to pick something first, such as a paddock).
 */
export type ThingToDo =
  /** Bull calves old enough for the model's "to mark" note (60 days), and unmarked young bulls. */
  (
    | {
        type: 'calves-to-mark';
        mob: number;
        mobName: string;
        area: string | null;
        /** Unmarked bull calves 60 days or older. */
        count: number;
        /** Unmarked young bulls in the mob, which marking also deals with. */
        youngBulls: number;
      }
    /** Calves old enough to be weaned (90 days or more). */
    | { type: 'calves-to-wean'; mob: number; mobName: string; area: string | null; count: number }
    /** A mob on ground with no water. `count` is its head, calves included. Everything dies on day 4. */
    | {
        type: 'no-water';
        mob: number;
        mobName: string;
        area: string | null;
        count: number;
        /** Days in a row without water so far. */
        dryDays: number;
      }
    /** A grain crop ready to harvest. `count` is its hectares. */
    | { type: 'crop-ready'; fieldId: number; sp: SpeciesId; count: number }
    /** A fence segment that has been knocked down. `count` is 1. */
    | { type: 'fence-down'; edge: EdgeRef; fence: 'electric' | 'tape'; count: number }
    /** A portable trough that is empty, or under a quarter full. `count` is the litres left. */
    | { type: 'trough-empty' | 'trough-low'; portId: number; cell: number; count: number }
  ) & {
    does: ActionType;
    action: Action | null;
  };

/**
 * What needs doing on the farm now, for the banner and the mob card. It
 * uses only what the model already knows: the ages at which the model
 * notes calves for marking and lets them be weaned, a mob's water, a
 * crop's maturity, fences that are down and the level in a portable
 * trough. In the order: water, stock, crops, fences.
 */
export function thingsToDo(farm: FarmState): ThingToDo[] {
  const out: ThingToDo[] = [];
  if (farm.over) return out;
  const survey = surveyOf(farm);
  const areaName = (id: number): string | null => (id < 0 ? null : survey.topology.areas[id]!.name);

  // Water.
  for (const m of farm.mobs) {
    if (m.where.kind !== 'paddock' || !m.animals.length) continue;
    const id = areaIdOf(survey, m);
    if (survey.points.areaTroughs[id]!.length) continue;
    out.push({
      type: 'no-water',
      mob: m.id,
      mobName: m.name,
      area: areaName(id),
      count: m.animals.length,
      dryDays: m.dry,
      does: 'moveMob',
      action: null,
    });
  }
  for (const pt of farm.layout.water.ports) {
    // The model's own low-water mark: under a quarter full.
    if (pt.level >= PORTABLE_CAPACITY_L * PORTABLE_LOW_SHARE) continue;
    out.push({
      type: pt.level <= 0 ? 'trough-empty' : 'trough-low',
      portId: pt.id,
      cell: pt.cell,
      count: Math.max(0, pt.level),
      does: 'refillPortable',
      action: { type: 'refillPortable', port: pt.id },
    });
  }

  // Stock.
  for (const m of farm.mobs) {
    const area = areaName(areaIdOf(survey, m));
    let toMark = 0;
    let youngBulls = 0;
    let toWean = 0;
    for (const a of m.animals) {
      if (a.kind === 'calf') {
        if (a.sex === 'M' && a.age >= MARK_NOTE_MIN_AGE) toMark++;
        if (a.age >= WEAN_MIN_AGE) toWean++;
      } else if (a.sex === 'M' && a.young) youngBulls++;
    }
    if (toMark || youngBulls) {
      out.push({
        type: 'calves-to-mark',
        mob: m.id,
        mobName: m.name,
        area,
        count: toMark,
        youngBulls,
        does: 'markCalves',
        action: { type: 'markCalves', mob: m.id },
      });
    }
    if (toWean) {
      out.push({
        type: 'calves-to-wean',
        mob: m.id,
        mobName: m.name,
        area,
        count: toWean,
        does: 'wean',
        action: { type: 'wean', mob: m.id },
      });
    }
  }

  // Crops.
  for (const f of farm.crops.fields) {
    const sp = SPECIES[f.sp];
    if (sp.type !== 'crop' || farm.day - f.sown < sp.mature!) continue;
    out.push({
      type: 'crop-ready',
      fieldId: f.id,
      sp: f.sp,
      count: f.cells.length * farm.layout.scale.haPerSquare,
      does: 'harvest',
      action: { type: 'harvest', field: f.id },
    });
  }

  // Fences that are down.
  const down = (line: 'h' | 'v', codes: Uint8Array, n: number): void => {
    for (let index = 0; index < n; index++) {
      const c = codes[index];
      if (c !== EDGE.electricDown && c !== EDGE.tapeDown) continue;
      const edge: EdgeRef = { line, index };
      out.push({
        type: 'fence-down',
        edge,
        fence: c === EDGE.electricDown ? 'electric' : 'tape',
        count: 1,
        does: 'fixFence',
        action: { type: 'fixFence', edge },
      });
    }
  };
  down('h', farm.layout.fences.hE, H_EDGES);
  down('v', farm.layout.fences.vE, V_EDGES);
  return out;
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
