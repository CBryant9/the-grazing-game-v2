/**
 * What the cattle step has to tell the player, as data.
 *
 * The engine never writes a diary line, opens a dialog or stops the clock.
 * It returns these notes, in the order things happened. The screens decide
 * the wording, and whether a note stops a skip (no water does). The notes
 * carry facts and figures only, never a judgement.
 */

import type { CattleClassId } from '../data/cattle';

/** Why a class of cattle is gaining little or losing weight on a feed. */
export type GainReason =
  /** Not much feed where they graze, so they can't eat their fill. */
  | { reason: 'notEnoughFeed'; mass: number }
  /** Low energy: the feed is mostly dry or stemmy. `me` is MJ/kg DM. */
  | { reason: 'lowMe'; me: number }
  /** Diet CP is under 7% and there is no lick, so they eat less. */
  | { reason: 'lowProtein' }
  /** Milking for a calf. MJ a day for milk, and for her own upkeep. */
  | { reason: 'milking'; milkMJ: number; ownMJ: number }
  /** Late in pregnancy. */
  | { reason: 'latePregnancy' }
  /** None of the above: intake (kg DM a day) of this feed is just short of needs. */
  | { reason: 'justShort'; intake: number; me: number };

/** The expected weight change of one class in a mob on an area's feed. */
export interface GainForecast {
  cls: CattleClassId;
  /** Head in the class. */
  n: number;
  /** Average kg a head a day. */
  gain: number;
  /** Up to two reasons, given when the gain is under 0.05 kg a day. */
  why: GainReason[];
}

export type CattleNote =
  /** The mob has had no water for `days` days (sent on day 1 and day 3). Everything dies on day 4. */
  | { type: 'noWater'; days: number }
  /** The area supplied only `f` (0 to 1) of the pasture the mob wanted. */
  | { type: 'shortOfFeed'; f: number }
  /** Ten days of weight loss. Diet ME and CP, and the classes forecast to lose. */
  | { type: 'losingWeight'; me: number; cp: number; classes: GainForecast[] }
  /** A cow or heifer under CS 1.6 lost her pregnancy. */
  | { type: 'slipped'; kind: 'cow' | 'heifer' }
  /** A calf was lost at birth. `first` is true for a first calf. */
  | { type: 'calfLostAtBirth'; first: boolean }
  /** The first calf of a new calving. */
  | { type: 'calvingStarted' }
  /** Bull calves 60 days or older that have not been marked. */
  | { type: 'toMark'; count: number }
  /** Unmarked young bulls in the mob are now fertile. */
  | { type: 'youngBullsFertile' }
  /** A bull is with females: a joining has started. */
  | { type: 'joiningStarted'; adultBulls: number; ready: number; femalesPerBull: number }
  /** Three or six weeks into a joining. */
  | {
      type: 'joiningProgress';
      weeks: number;
      /** Got in calf in the last 3 weeks. */
      conceived: number;
      /** In calf now. */
      inCalf: number;
      /** Females old and heavy enough to join. */
      females: number;
    }
  /** The preg test at the end of a joining. */
  | {
      type: 'pregTest';
      inCalf: number;
      /** Females counted: in calf, or had the full 9 weeks and did not take. */
      females: number;
      /** inCalf over females, 0 to 1. */
      rate: number;
      /** Females counted that are not in calf. */
      dry: number;
      /** Average condition score of the females counted. */
      cs: number;
      /** The share expected in calf at that condition, 0 to 1. */
      expected: number;
      /** Recently calved, too soon to tell. */
      tooSoon: number;
    }
  /** Females ready to get in calf with no bull in the mob. */
  | { type: 'noBull'; ready: number }
  /** Average condition score is under 1.9. */
  | { type: 'lowCondition'; cs: number };
