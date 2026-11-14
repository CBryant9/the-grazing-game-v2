/**
 * Farm hands and contractor fencing, as saved state (PRD 5.11; docs/MODEL.md,
 * section 11).
 *
 * A farm that has never hired a hand or ordered a contractor has no labour
 * state at all (`farm.labour` is left out), so it saves, hashes and plays
 * exactly as it did before hands existed.
 */

import type { AwardLevel } from '../data/labour';
import type { EdgeRef } from '../farm/topology';
import type { RngState } from '../rng';

/**
 * How a person is employed. `casual`: paid the casual day rate for each day
 * worked, and can be let go any day. `contract`: a short fixed-term contract at a
 * day rate (the weekly rate over 5 days, no casual loading) that ends by itself. `salaried`: the full-time weekly rate,
 * paid for every week whatever the days.
 */
export type HandKind = 'casual' | 'contract' | 'salaried';

/** A person's skills, 1 to 5 each (3 is average). Kept few (REQUIREMENTS). */
export interface HandSkills {
  /** Fence, tape, gates and taking fence down. */
  fencing: number;
  /** Moving, weaning, marking, drafting and loading stock. */
  stock: number;
  /** Pipe, troughs and water hubs. */
  water: number;
}

/** A person looking for work, or a hand on the farm: the facts about them. */
export interface Person {
  /** Unique in the district. A person is never listed again once hired. */
  id: number;
  name: string;
  kind: HandKind;
  /** Farm and livestock hand level under the Pastoral Award. */
  level: AwardLevel;
  skills: HandSkills;
  /** True if they bring a team of dogs, which makes stock work quicker. */
  dogs: boolean;
  /** The weekdays they work, 0 for Sunday, smallest first. */
  days: number[];
  /**
   * What they ask, dollars, before super: a week for a salaried hand, a day
   * worked for a casual or contract hand.
   */
  rate: number;
}

/** A hand on the farm. */
export interface Hand extends Person {
  /** The farm day they were hired. */
  hired: number;
  /** The first farm day they work: the day after they were hired. */
  startDay: number;
  /** The farm day a contract ends (they leave at first light that day). Null for casual and salaried hands. */
  endDay: number | null;
  /** Wages and super owed since the last pay day, dollars. */
  owed: number;
  /** Off injured until this farm day (back at first light that day). Null when not injured. */
  offUntil: number | null;
}

/** One stretch of contractor fencing: permanent fence only. */
export interface ContractRun {
  id: number;
  /** A 1-man or 2-man team. */
  team: 1 | 2;
  /** True if the farm's hands put their day into this run when they work. */
  handsHelp: boolean;
  /** The farm day it was ordered. */
  ordered: number;
  /** The segments in the order drawn: those not yet built. */
  left: EdgeRef[];
  /** What each segment held when the run was ordered, by edge code, in the order of `left`. */
  was: number[];
  /** The segments the contractor has built, in order. */
  built: EdgeRef[];
  /** Metres of work done that have not yet made a whole segment. */
  progressM: number;
  /** Dollars charged so far: materials and labour. */
  spent: number;
  /** The labour charge, dollars a metre, when it was ordered. */
  ratePerM: number;
}

/** Everything about the workforce that has to be saved. */
export interface LabourState {
  /** The farm's standing with workers, 0 to 100. */
  standing: number;
  hands: Hand[];
  /** People who have been hired, so they are not listed again. Smallest first. */
  taken: number[];
  /** The next pay day, or null with no hands. */
  nextPayDay: number | null;
  /** Contractor fencing under way. */
  runs: ContractRun[];
  nextRunId: number;
  /**
   * The share of each hand's day used on today's jobs, by hand id (0 to 1),
   * and the day it is for. Another day's figures count as none used.
   */
  help: { day: number; used: Record<string, number>; fenced: Record<string, boolean> };
  /** The stream injuries are drawn from. */
  rng: RngState;
  /**
   * Wages, super and claim costs the farm could not pay when they were due,
   * dollars. Never forgiven: paid by itself at first light as soon as the
   * bank can cover it all. 0 when nothing is owed.
   */
  wagesOwed: number;
  /** Grazing plan moves credited to the hand who worked that day, by inbox message number. The worker report reads them. */
  planMoves: { seq: number; hand: number; name: string }[];
}
