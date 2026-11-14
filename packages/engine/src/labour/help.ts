/**
 * A hand helping on the player's jobs (PRD 5.11, REQUIREMENTS "Farm hands
 * and the workforce").
 *
 * A hand works their own day. On the days they work, the first part of any
 * job the player does is the hands' share and uses none of the player's
 * daylight. An average hand gets 60% of what the player gets done in a day
 * on their own (so one-man permanent fencing goes from 500 m a day to about
 * 800 m), more or less by the skill the job needs. Once a hand's day is used
 * up the job carries on in the player's own light.
 */

import type { Action } from '../actions/types';
import { LABOUR } from '../data/labour';
import { weekdayOf } from '../market/saleCalendar';
import { dateOn } from '../sim/derived';
import type { FarmState } from '../sim/state';
import { rngStream } from '../rng';
import type { Hand, HandSkills, LabourState } from './types';

/** The skill a job needs, or null for a job the hands do not help on (a decision, a purchase). */
export type HelpSkill = keyof HandSkills;

/** The skill an action's work needs. */
export function skillFor(action: Action): HelpSkill | null {
  switch (action.type) {
    case 'buildFence':
    case 'removeFence':
    case 'rollUpTape':
    case 'placeGate':
    case 'removeGate':
    case 'setGate':
    case 'fixFence':
      return 'fencing';
    case 'layPipe':
    case 'placeTrough':
    case 'moveTrough':
    case 'removeTrough':
    case 'placeFenceHub':
    case 'removeHub':
    case 'moveHub':
    case 'placeSquareHub':
    case 'removeSquareHub':
    case 'moveSquareHub':
    case 'placePortable':
    case 'movePortable':
    case 'refillPortable':
    case 'removePortable':
      return 'water';
    case 'moveMob':
    case 'moveCattle':
    case 'setPlan':
    case 'resumePlan':
    case 'wean':
    case 'markCalves':
    case 'sellAnimals':
    case 'sellGroup':
    case 'sellClass':
      return 'stock';
    default:
      return null;
  }
}

/** A new, empty labour state for a farm. */
export function newLabour(farm: Pick<FarmState, 'seed' | 'day'>): LabourState {
  return {
    standing: LABOUR.standingStart.value,
    hands: [],
    taken: [],
    nextPayDay: null,
    runs: [],
    nextRunId: 1,
    help: { day: farm.day, used: {}, fenced: {} },
    rng: rngStream(farm.seed, 'labour:injury').state(),
    wagesOwed: 0,
    planMoves: [],
  };
}

/** The farm's labour state, made if it has none. */
export function labourOf(farm: FarmState): LabourState {
  farm.labour ??= newLabour(farm);
  return farm.labour;
}

/** True if the hand is on the farm's books on that day: started, and not off injured. */
export function onDuty(hand: Hand, day: number): boolean {
  return hand.startDay <= day && (hand.offUntil === null || hand.offUntil <= day);
}

/** True if the hand works on that farm day: on duty, and it is one of their days. */
export function worksOn(farm: FarmState, hand: Hand, day: number): boolean {
  return onDuty(hand, day) && hand.days.includes(weekdayOf(dateOn(farm, day)));
}

/** A hand's day at a skill, as a share of the player's day on their own. */
export function handShare(hand: Hand, skill: HelpSkill): number {
  const level = Math.min(5, Math.max(1, Math.round(hand.skills[skill])));
  let share = LABOUR.handDayShare.value * LABOUR.skillFactor.value[level - 1]!;
  if (skill === 'stock' && hand.dogs) share *= LABOUR.dogsFactor.value;
  return share;
}

/** The share of a hand's day used today (0 to 1). */
export function usedToday(farm: FarmState, hand: Hand): number {
  const help = farm.labour?.help;
  if (!help || help.day !== farm.day) return 0;
  return help.used[String(hand.id)] ?? 0;
}

/** One hand's part of a job: their id and the minutes of the player's work they take. */
export interface HandPart {
  hand: number;
  minutes: number;
}

/**
 * The minutes of the player's work the hands can take today on a job that
 * needs `skill`, hand by hand, in the order they were hired. `dayMin` is
 * today's light. Empty with no hand working today.
 */
export function handsCan(farm: FarmState, skill: HelpSkill, dayMin: number): HandPart[] {
  const out: HandPart[] = [];
  for (const h of farm.labour?.hands ?? []) {
    if (!worksOn(farm, h, farm.day)) continue;
    const left = 1 - usedToday(farm, h);
    if (left <= 1e-9) continue;
    out.push({ hand: h.id, minutes: left * dayMin * handShare(h, skill) });
  }
  return out;
}

/**
 * Give `minutes` of a job's work to the hands, first hired first, as far
 * as their day allows. Returns each hand's part. Changes the farm's
 * record of the hands' day.
 */
export function useHands(
  farm: FarmState,
  skill: HelpSkill,
  dayMin: number,
  minutes: number,
): HandPart[] {
  const parts: HandPart[] = [];
  const labour = farm.labour;
  if (!labour || minutes <= 0) return parts;
  if (labour.help.day !== farm.day) labour.help = { day: farm.day, used: {}, fenced: {} };
  let rest = minutes;
  for (const can of handsCan(farm, skill, dayMin)) {
    if (rest <= 1e-9) break;
    const take = Math.min(rest, can.minutes);
    const hand = labour.hands.find((h) => h.id === can.hand)!;
    const key = String(hand.id);
    labour.help.used[key] = (labour.help.used[key] ?? 0) + take / (dayMin * handShare(hand, skill));
    if (skill === 'fencing') labour.help.fenced[key] = true;
    parts.push({ hand: hand.id, minutes: take });
    rest -= take;
  }
  return parts;
}

/** A hand's weekly wage before super, dollars: the salary, or five days at the day rate. */
export const weeklyWage = (hand: Pick<Hand, 'kind' | 'rate'>): number =>
  hand.kind === 'salaried' ? hand.rate : hand.rate * LABOUR.daysPerWeek.value;

/** Wages and super a hand earns on a farm day, dollars: nothing on a day off for a day-rate hand, or while off injured. */
export function earnedOn(farm: FarmState, hand: Hand, day: number): number {
  if (!onDuty(hand, day)) return 0;
  const wage = hand.kind === 'salaried' ? hand.rate / 7 : worksOn(farm, hand, day) ? hand.rate : 0;
  return wage * (1 + LABOUR.superRate.value);
}
