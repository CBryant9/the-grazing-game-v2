/**
 * Everything a player can do to a farm, as data.
 *
 * An action is a plain record, so a server can receive it, check it and
 * keep it in the farm's action log. `applyAction` (apply.ts) does the
 * checking and the work.
 */

import type { CalendarDate } from '../calendar';
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
   * Buy a saleyard class. In the game this can be done only on a sale day.
   * The cattle are paid for at once, are on the farm's books, and arrive in
   * the stock yards at first light the next day. `to` is not used there.
   * Without the farm clock (calibration and tests) `to` is needed: the
   * cattle go straight into a grazing area or an existing mob, on any day.
   */
  | {
      type: 'buyCattle';
      cls: SaleClassId;
      qty: number;
      to?: { cell: number } | { mob: number };
    }
  /**
   * Sell the animals with these tag numbers. Calves at foot go with their
   * mothers. On a sale day they are sold today. On any other day they are
   * booked onto the next sale and sold at first light that day.
   */
  | { type: 'sellAnimals'; ids: number[] }
  /** Sell from one mob by group: steers and heifers heaviest first, cows and bulls lowest condition first. Booked the same way. */
  | { type: 'sellGroup'; mob: number; group: GroupId; qty: number }
  /** Sell a market class from across the farm. Booked the same way. */
  | { type: 'sellClass'; cls: MarketClassId; qty: number }
  /** Take stock off the sale they are booked onto: these tag numbers, or every booking if none are given. */
  | { type: 'cancelSale'; ids?: number[] }
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
  /** Sow. It costs money, happens at once and takes none of the player's day. */
  | { type: 'sow'; species: SpeciesId; cells: number[] }
  /** Harvest, the same way. */
  | { type: 'harvest'; field: number };

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
  /** Cattle can only be bought on a sale day, and there is none today. */
  | 'not-a-sale-day'
  /** Nothing is booked onto a sale, so there is nothing to cancel. */
  | 'nothing-booked'
  | 'nothing-to-move'
  | 'already-there'
  | 'no-calves-to-wean'
  | 'nothing-to-mark'
  /** Today's light is used up. No more jobs can start until tomorrow. */
  | 'no-daylight'
  /** There is light left, but not enough for this job, or for the first piece of this line. */
  | 'not-enough-daylight';

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
    | 'feed-out'
    /** Drafting and loading, done where the mob is. */
    | 'draft-and-load';
  minutes: number;
}

/** One piece of a line: a fence segment or a square of pipe. */
export type JobPiece = { edge: { line: 'h' | 'v'; index: number } } | { cell: number };

/**
 * What a job takes: the figures on the job card (PRD 5.1). `previewAction`
 * gives it before the job, and `applyAction` gives the same figures back
 * when the job is done. Times of day are minutes after midnight on the
 * district town's clock. Lengths of time are minutes. A job's time is its
 * work: there is no driving.
 */
export interface JobCard {
  action: ActionType;
  /**
   * `done`: all of it is done today. `part`: a line too long for today:
   * the pieces that fit are built and the rest are not. `free`: it takes
   * none of the day.
   */
  outcome: 'done' | 'part' | 'free';
  /** When the job starts and when it finishes. */
  startsAt: number;
  endsAt: number;
  /** Minutes of today's light the job uses. */
  workMin: number;
  /** Today's light, how much was used before the job, and how much is left after it. */
  dayMin: number;
  usedBeforeMin: number;
  leftAfterMin: number;
  /** True if all of it is done today. */
  fitsToday: boolean;
  /**
   * True if this job uses up the rest of today's light: it finishes with
   * none to spare, or it is a line cut short (what is left is less than
   * its next piece needs). The screen says "this would use up your full
   * day".
   */
  usesRestOfDay: boolean;
  /** The work in the whole job as it was asked for, at today's pace. More than `workMin` for a line cut short. */
  totalWorkMin: number;
  /** How the work is made up. */
  parts: JobWorkPart[];
  /** Dollars for the whole job as it was asked for. Negative for money in. */
  cost: number;
  /** Dollars charged today: for a line cut short, the part that was built. */
  costToday: number;
  /**
   * Fence, tape and pipe: the pieces that fit today, in the order drawn,
   * and the pieces that do not, with the metres of each. A screen draws
   * the first in the line's own colour and the rest in red.
   */
  line?: {
    fits: { pieces: JobPiece[]; metres: number };
    doesNotFit: { pieces: JobPiece[]; metres: number };
  };
  /**
   * For stock sold on a day with no sale: they are booked onto the next
   * sale, nothing is paid yet and they stay where they are.
   */
  booking?: {
    head: number;
    calvesAtFoot: number;
    saleDay: number;
    date: CalendarDate;
    daysAway: number;
  };
  /** For cattle bought: they arrive in the stock yards at first light on this farm day. */
  arrival?: { arriveDay: number; date: CalendarDate; head: number };
  /**
   * For a line cut short: the reason the rest was not built, in plain
   * words. It is not remembered. The player draws it again another day.
   */
  notToday?: { reason: 'not-enough-daylight'; message: string };
}

/** What `previewAction` returns: the job card, or why the job can't be done. Nothing changes. */
export type JobPreview = { ok: true; card: JobCard } | ActionRefusal;

export type ActionResult = ActionDone | ActionRefusal;
