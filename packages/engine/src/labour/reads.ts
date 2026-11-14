/**
 * What the screens may show about the workforce (milestones 2.1 and 2.2).
 * Every function here is a read: it never changes the farm.
 *
 * What a screen may show: people's names, how they are employed, their
 * days, their pay and their skill ratings (1 to 5), whether they have dogs;
 * the farm's standing as a number and whether it rose or fell; pay days and
 * what is owed; what a hand did; contract fencing under way, metres built and
 * left, and the day it will be done.
 *
 * What a screen may not show or work out: the chance of an injury, the
 * draws behind the list of people, or any formula. The figures are given
 * ready to show (CLAUDE.md rule 14). Words are the screen's, and they state
 * facts only: no judging words about people (PRD 5.11, "Wording").
 */

import type { CalendarDate } from '../calendar';
import { LABOUR } from '../data/labour';
import type { EdgeRef } from '../farm/topology';
import { dateOn } from '../sim/derived';
import type { FarmEvent } from '../sim/events';
import type { FarmState } from '../sim/state';
import { contractDone, runMetresLeft } from './contract';
import { weeklyWage } from './day';
import { handShare, onDuty, usedToday, worksOn } from './help';
import { standingOf } from './pool';
import type { HandKind, HandSkills } from './types';

/** Where a hand is today. */
export type HandStatus =
  /** Hired, starts on `startDay`. */
  | 'starts-soon'
  /** At work today. */
  | 'working'
  /** Not one of their days. */
  | 'day-off'
  /** Off injured until `offUntil`. */
  | 'injured';

/** A hand on the farm, ready to show. */
export interface HandView {
  id: number;
  name: string;
  kind: HandKind;
  level: number;
  skills: HandSkills;
  dogs: boolean;
  /** Weekdays they work, 0 for Sunday. */
  days: number[];
  /** Dollars before super: a week (salaried) or a day worked (casual, contract). */
  rate: number;
  /** What they cost in a full week, wages and super, dollars. */
  weekCost: number;
  status: HandStatus;
  startDay: number;
  /** A contract's last day is the day before this; null for casual and salaried hands. */
  endDay: number | null;
  endDate: CalendarDate | null;
  /** Back at first light on this day, when injured. */
  offUntil: number | null;
  /** Wages and super owed since the last pay day, dollars. */
  owed: number;
  /** The share of their day left for the player's jobs today, 0 to 1 (0 when not working today). */
  dayLeft: number;
  /** Permanent fence they add to the player's day on a full day, metres (500 m is the player's own day). */
  fenceMetresPerDay: number;
}

/** The workforce, ready to show. */
export interface WorkforceView {
  /** The farm's standing with workers, 0 to 100. Missed wages lower it; paying on time brings it back. */
  standing: number;
  hands: HandView[];
  /** The next pay day, or null with no hands. */
  nextPayDay: number | null;
  nextPayDate: CalendarDate | null;
  /** Wages and super owed to all hands now, dollars. */
  owedNow: number;
  /** The super rate paid on top of wages (0.12 is 12%). */
  superRate: number;
  /** The most hands the farm can have at once. */
  maxHands: number;
}

/** The farm's hands and its standing with workers. */
export function workforceView(farm: FarmState): WorkforceView {
  const labour = farm.labour;
  const hands: HandView[] = (labour?.hands ?? []).map((h) => {
    const status: HandStatus =
      h.startDay > farm.day
        ? 'starts-soon'
        : !onDuty(h, farm.day)
          ? 'injured'
          : worksOn(farm, h, farm.day)
            ? 'working'
            : 'day-off';
    return {
      id: h.id,
      name: h.name,
      kind: h.kind,
      level: h.level,
      skills: { ...h.skills },
      dogs: h.dogs,
      days: [...h.days],
      rate: h.rate,
      weekCost: weeklyWage(h) * (1 + LABOUR.superRate.value),
      status,
      startDay: h.startDay,
      endDay: h.endDay,
      endDate: h.endDay === null ? null : dateOn(farm, h.endDay),
      offUntil: h.offUntil,
      owed: h.owed,
      dayLeft: status === 'working' ? Math.max(0, 1 - usedToday(farm, h)) : 0,
      fenceMetresPerDay: Math.round(handShare(h, 'fencing') * 500),
    };
  });
  const next = labour?.nextPayDay ?? null;
  return {
    standing: standingOf(farm),
    hands,
    nextPayDay: next,
    nextPayDate: next === null ? null : dateOn(farm, next),
    owedNow: hands.reduce((t, h) => t + h.owed, 0),
    superRate: LABOUR.superRate.value,
    maxHands: LABOUR.maxHands.value,
  };
}

/**
 * Contract fencing under way, ready to show and draw. `built` is the
 * contractor's fence (the map draws it in the contractor's colour while the
 * run is under way); `left` is still to build, in order. Any other fence on
 * the map is the player's own.
 */
export interface ContractRunView {
  id: number;
  team: 1 | 2;
  handsHelp: boolean;
  orderedDay: number;
  built: EdgeRef[];
  left: EdgeRef[];
  metresBuilt: number;
  metresLeft: number;
  /** Metres a day at the team's pace. */
  metresPerDay: number;
  /** The next day the team works, and the day it will be done at the team's pace. */
  nextWorkDay: number;
  doneDay: number;
  doneDate: CalendarDate;
  /** Dollars charged so far, and the labour charge a metre. */
  spent: number;
  ratePerM: number;
}

/** Every contract fencing run under way: "under way, N m left, done on <day>". Empty when none. */
export function contractView(farm: FarmState): ContractRunView[] {
  const side = farm.layout.scale.sideM;
  return (farm.labour?.runs ?? []).map((r) => {
    const done = contractDone(farm, r);
    return {
      id: r.id,
      team: r.team,
      handsHelp: r.handsHelp,
      orderedDay: r.ordered,
      built: r.built.map((e) => ({ line: e.line, index: e.index })),
      left: r.left.map((e) => ({ line: e.line, index: e.index })),
      metresBuilt: r.built.length * side,
      metresLeft: runMetresLeft(farm, r),
      metresPerDay: LABOUR.teamMetresPerDay.value[r.team],
      nextWorkDay: done.startDay,
      doneDay: done.doneDay,
      doneDate: dateOn(farm, done.doneDay),
      spent: r.spent,
      ratePerM: r.ratePerM,
    };
  });
}

/** One thing in the worker report: an inbox message about the workforce, and the hand it was, if one. */
export interface WorkerReportItem {
  seq: number;
  day: number;
  at?: number;
  /** The hand who did it or whom it is about; null for a contractor's run or pay day. */
  hand: { id: number; name: string } | null;
  event: FarmEvent;
}

const LABOUR_TYPES = new Set<FarmEvent['type']>([
  'hand-hired',
  'hand-left',
  'wages-paid',
  'wages-missed',
  'hand-injured',
  'hand-back',
  'hand-duty',
  'contract-built',
  'contract-finished',
  'contract-stopped',
]);

/**
 * The worker report (PRD 5.11): what was done on the farm since the inbox
 * message numbered `sinceSeq`, one item for each speech bubble. It holds the
 * workforce's messages, and the moves a grazing plan made on days a hand was
 * on the farm (a farm hand does the planned moves, PRD 5.2). Each item is
 * also in the inbox. Oldest first.
 */
export function workerReport(farm: FarmState, sinceSeq = -1): WorkerReportItem[] {
  const hands = farm.labour?.hands ?? [];
  const out: WorkerReportItem[] = [];
  for (const m of farm.inbox) {
    if (m.seq <= sinceSeq) continue;
    const e = m.event;
    let hand: { id: number; name: string } | null = null;
    if (e.type === 'plan-moved') {
      const on = hands.find((h) => onDuty(h, m.day));
      if (!on) continue;
      hand = { id: on.id, name: on.name };
    } else if (!LABOUR_TYPES.has(e.type)) continue;
    else if ('hand' in e && typeof e.hand === 'number' && 'name' in e) {
      hand = { id: e.hand, name: String(e.name) };
    }
    out.push({
      seq: m.seq,
      day: m.day,
      ...(m.at === undefined ? {} : { at: m.at }),
      hand,
      event: e,
    });
  }
  return out;
}
