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
  | { type: 'sow'; species: SpeciesId; cells: number[] }
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
  | 'nothing-to-move'
  | 'already-there'
  | 'no-calves-to-wean'
  | 'nothing-to-mark';

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
}

export type ActionResult = ActionDone | ActionRefusal;
