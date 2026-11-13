/**
 * Everything a player can do to a farm, as data.
 *
 * An action is a plain record, so a server can receive it, check it and
 * keep it in the farm's action log. `applyAction` (apply.ts) does the
 * checking and the work.
 */

import type { CropRefusalReason } from '../crops/fields';
import type { CattleClassId, GroupId, MarketClassId, SaleClassId } from '../data/cattle';
import type { Supplement } from '../data/feed';
import type { SpeciesId } from '../data/species';
import type { RefusalReason } from '../farm/layout';
import type { EdgeRef } from '../farm/topology';
import type { FarmEvent } from '../sim/events';
import type { FarmState } from '../sim/state';

/** The fences a player can build. */
export type FenceKind = 'permanent' | 'electric' | 'tape';

/** Where cattle are sent: the grazing area that holds a square, or the feedlot. */
export type MoveTarget = { cell: number } | 'lot';

export type Action =
  // ---- Cattle
  /**
   * Buy a saleyard class straight into a grazing area or an existing mob.
   * An instant buy, kept for tests and calibration: sale days and delivery
   * to the yards come in a later milestone.
   */
  | { type: 'buyCattle'; cls: SaleClassId; qty: number; to: { cell: number } | { mob: number } }
  /** Sell the animals with these tag numbers. Calves at foot go with their mothers. */
  | { type: 'sellAnimals'; ids: number[] }
  /** Sell from one mob by group: steers and heifers heaviest first, cows and bulls lowest condition first. */
  | { type: 'sellGroup'; mob: number; group: GroupId; qty: number }
  /** Sell a market class from across the farm. */
  | { type: 'sellClass'; cls: MarketClassId; qty: number }
  /** Move a whole mob into a grazing area, or send it to the feedlot. */
  | { type: 'moveMob'; mob: number; to: MoveTarget }
  /** Move part of one or more mobs, by class and number. Calves go with their mothers. */
  | {
      type: 'moveCattle';
      picks: { mob: number; cls: CattleClassId; qty: number }[];
      to: MoveTarget;
    }
  | { type: 'setSupplement'; mob: number; supp: Supplement }
  /** Wean every calf of 90 days or more. With no `to`, the weaners go where the daily tick would send them. */
  | { type: 'wean'; mob: number; to?: MoveTarget }
  /** Mark every bull calf and unmarked young bull in the mob. */
  | { type: 'markCalves'; mob: number }
  // ---- Fences and gates
  | { type: 'buildFence'; edges: EdgeRef[]; fence: FenceKind }
  /** Pull down every fence and gate along a run. Tape goes back on the roll. */
  | { type: 'removeFence'; edges: EdgeRef[] }
  /** Roll up the whole straight run of tape that a segment is part of. */
  | { type: 'rollUpTape'; edge: EdgeRef }
  | { type: 'placeGate'; edge: EdgeRef }
  | { type: 'removeGate'; edge: EdgeRef }
  | { type: 'setGate'; edge: EdgeRef; open: boolean }
  /** Put a knocked-down fence back up. */
  | { type: 'fixFence'; edge: EdgeRef }
  // ---- Water
  | { type: 'layPipe'; cells: number[] }
  | { type: 'placeTrough'; cell: number }
  | { type: 'moveTrough'; from: number; to: number }
  | { type: 'removeTrough'; cell: number }
  /** A water hub on a fence line or corner, by grid corner (see vertexId). */
  | { type: 'placeFenceHub'; vertex: number }
  | { type: 'removeHub'; vertex: number }
  /** A water hub on a square: a trough with an open gate on every side. */
  | { type: 'placeSquareHub'; cell: number }
  | { type: 'placePortable'; cell: number }
  | { type: 'movePortable'; port: number; cell: number }
  | { type: 'refillPortable'; port: number }
  /** Sell a portable trough back for half its price. */
  | { type: 'removePortable'; port: number }
  // ---- Crops and pastures
  /** Book a contractor to sow. It costs money and none of the player's time, and is done a few days on. */
  | { type: 'sow'; species: SpeciesId; cells: number[] }
  /** Book a contractor to harvest, the same way. */
  | { type: 'harvest'; field: number }
  // ---- Jobs in progress and bookings (the working day)
  /** Spend what is left of today's light on a job in progress. */
  | { type: 'continueJob'; job: number }
  /** Give up a job in progress. What was built stays. Takes no time. */
  | { type: 'cancelJob'; job: number }
  /** Call off work booked with a contractor, before it is done. Takes no time. */
  | { type: 'cancelBooking'; booking: number };

export type ActionType = Action['type'];

export type ActionRefusalReason =
  | RefusalReason
  | CropRefusalReason
  /** The game is over on this farm. */
  | 'game-over'
  /** The bank won't lend that much: it would go past the overdraft limit. */
  | 'bank-limit'
  /** The request itself is wrong: a number out of range, an unknown class, a square off the farm. */
  | 'bad-request'
  | 'no-such-mob'
  | 'no-such-animal'
  | 'nothing-to-sell'
  | 'nothing-to-move'
  | 'already-there'
  | 'no-calves-to-wean'
  | 'nothing-to-mark'
  /** Today's light is used up. No more jobs can start until tomorrow. */
  | 'no-daylight'
  /** There is light left, but not enough to get to the job and home, or for a job that has to be done in one day. */
  | 'not-enough-daylight'
  | 'no-such-job'
  | 'no-such-booking';

/** Why an action was not done. Nothing has changed. */
export interface ActionRefusal {
  ok: false;
  reason: ActionRefusalReason;
  /** The reason in plain words. */
  message: string;
}

/** An action that was done: the farm after it, and what happened. The farm passed in is unchanged. */
export interface ActionDone {
  ok: true;
  farm: FarmState;
  /** What happened, in order: the action's own events, and any mobs that joined or split because of it. */
  events: FarmEvent[];
  /**
   * The time and money the job took, as the job card showed it. Left out
   * for an action done without the farm clock (calibration and tests).
   */
  job?: JobCard;
}

/** One part of a job's work, for the job card. */
export interface JobWorkPart {
  /** What the time is for. The screens write the words. */
  what:
    | 'build'
    | 'pull-down'
    | 'gate'
    | 'trough'
    | 'portable-trough'
    | 'pipe'
    | 'muster'
    | 'settle'
    | 'head'
    /** Walking a mob along its route. 0 until moves follow a route through gates. */
    | 'walk'
    | 'feed-out'
    | 'yard-work'
    | 'saleyard';
  minutes: number;
}

/**
 * What a job takes: the figures on the job card (PRD 5.1). `previewAction`
 * gives it before the job, and `applyAction` gives the same figures back
 * when the job is done. Times of day are minutes after midnight on the
 * district town's clock. Lengths of time are minutes.
 */
export interface JobCard {
  action: ActionType;
  /**
   * `done`: the whole job is done today. `part`: what fits is done today
   * and the rest is a job in progress. `booked`: a contractor is booked.
   * `free`: it takes no time.
   */
  outcome: 'done' | 'part' | 'booked' | 'free';
  /** When the job starts and when it stops for today. */
  startsAt: number;
  endsAt: number;
  /** Driving to the job, and working on it, today. */
  travelMin: number;
  workMin: number;
  /**
   * The drive home from where the job leaves the player. Where the drive
   * home must fit inside daylight this much light is kept back, so what
   * is free for other jobs is `leftAfterMin` less this. 0 when the drive
   * home is free.
   */
  homeMin: number;
  /** Today's light, how much was used before the job, and how much is left after it. */
  dayMin: number;
  usedBeforeMin: number;
  leftAfterMin: number;
  /** True if the whole job is done today. */
  fitsToday: boolean;
  /** The work in the whole job (what is left of it, for a job in progress), at today's pace. */
  totalWorkMin: number;
  /** How the work is made up. */
  parts: JobWorkPart[];
  /** The share of the whole job done once today's part is in, 0 to 1. */
  doneShare: number;
  /** More days the job needs after today, if each is spent on it from first light. 0 when it fits. */
  moreDays: number;
  /** Dollars for the whole job (what is left of it, for a job in progress). Negative for money in. */
  cost: number;
  /** Dollars charged today. */
  costToday: number;
  /** Fence, tape and pipe: metres in the job (what is left of it), and metres done today. */
  line?: { metres: number; metresToday: number; pieces: number; piecesToday: number };
  /** The job in progress, when the job does not fit today. */
  jobId?: number;
  /** The booking, and the farm day the contractor does the work. */
  bookingId?: number;
  dueDay?: number;
}

/** What `previewAction` returns: the job card, or why the job can't be done. Nothing changes. */
export type JobPreview = { ok: true; card: JobCard } | ActionRefusal;

export type ActionResult = ActionDone | ActionRefusal;
