/**
 * What a sheep mob's day tells the player, as data. Facts and figures only,
 * never praise or blame. The screens write the words.
 */

export type SheepNote =
  /** The mob has had no water for `days` days (sent on day 1 and day 3). Every sheep dies on day 4. */
  | { type: 'noWater'; days: number }
  /** The area supplied `f` of the pasture the mob wanted (at most once a fortnight). */
  | { type: 'shortOfFeed'; f: number }
  /** Average CS is under 2 (at most once a month). */
  | { type: 'lowCondition'; cs: number }
  /**
   * The mob has lost weight for 10 days running, on feed of this energy and
   * protein, with the reasons that apply, in this order (the cattle
   * warnings' reasons): not enough feed where they graze, low energy (ME
   * under 8), protein under 7%, ewes milking, ewes in late pregnancy. An
   * empty list means intake is just short of needs.
   */
  | { type: 'losingWeight'; me: number; cp: number; why: SheepLossReason[] }
  /** Joining started: ewes ready to join, rams in the mob, rams the joining needs. */
  | { type: 'joiningStarted'; ewes: number; rams: number; ramsNeeded: number }
  /** The 5 weeks of joining are over. */
  | { type: 'joiningEnded'; ewes: number }
  /**
   * The scanning count, 80 days after joining started: ewes joined, ewes in
   * lamb, and lambs they carry. It may be shown from this day.
   */
  | { type: 'scanned'; ewes: number; pregnant: number; foetuses: number }
  /** The first lamb of a joining was born. */
  | { type: 'lambingStarted' }
  /** The marking count: lambs alive, and ewes joined. Ram lambs are marked (wethers) from today. */
  | { type: 'marked'; lambs: number; ewesJoined: number }
  /** Sheep struck by flies today. */
  | { type: 'flystrike'; count: number };

/** Why a sheep mob is losing weight (see `losingWeight`). */
export type SheepLossReason = 'lowFeed' | 'lowEnergy' | 'lowProtein' | 'milking' | 'latePregnancy';

/**
 * Why a sheep died. `weaner` is a weaner in its first year after weaning
 * dying of being light or not growing (MMFS ch. 10.4, S17: deaths rise as
 * weaning weight and growth after weaning fall).
 */
export type SheepDeathCause =
  | 'noWater'
  | 'poorCondition'
  | 'lambing'
  | 'newborn'
  | 'orphaned'
  | 'flystrike'
  | 'weaner'
  | 'natural';
