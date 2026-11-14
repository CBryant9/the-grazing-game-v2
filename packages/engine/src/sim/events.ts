/**
 * What happened on a farm, as data.
 *
 * The engine never writes a diary line, opens a dialog or stops the clock.
 * The daily tick and the actions return these events, in the order things
 * happened, and the screens decide the wording and what stops a skip. Events
 * state facts and figures only, never a judgement.
 */

import type { CattleNote } from '../cattle/notes';
import type { DeathCause } from '../cattle/simMob';
import type { CropRisk, GrazeDamageEvent } from '../crops/fields';
import type { CropEvent } from '../crops/tick';
import type { SaleClassId } from '../data/cattle';
import type { Supplement } from '../data/feed';
import type { SpeciesId } from '../data/species';
import type { StartImprovements } from '../farm/generate';
import type { EdgeRef } from '../farm/topology';
import type { WaterEvent } from '../farm/water';
import type { ActionType } from '../actions/types';
import type { CalendarDate } from '../calendar';
import type { GameOverReason, MobWhere, YearRecord } from './state';

/** Where a mob is, with the grazing area's name when it is on pasture. */
export interface MobPlaceNote {
  where: MobWhere;
  /** "Paddock 3", or "Paddocks 1 + 2" where open gates join them. Null off pasture. */
  area: string | null;
}

/** Events from the daily tick. */
export type TickEvent =
  /** A new season was drawn (1 July). `factor` is growth as a multiple of a normal season. */
  | { type: 'new-season'; label: string; factor: number }
  /** A planting moved on: established, lock-up soon, harvest ready, shedding, finished, a sowing window. */
  | { type: 'crop'; event: CropEvent }
  /** Stock grazed a planting at a time that costs stand or grain. */
  | { type: 'crop-grazed'; mob: number; mobName: string; event: GrazeDamageEvent }
  /** A note from a mob's day: no water, short of feed, losing weight (with why), joining, preg test. */
  | { type: 'cattle'; mob: number; mobName: string; area: string | null; note: CattleNote }
  /**
   * A drop of calves was weaned. `into` is the new mob they went to, or
   * null when there was no other area with water and they stayed.
   */
  | {
      type: 'weaned';
      mob: number;
      mobName: string;
      count: number;
      avgKg: number;
      into: ({ mob: number; mobName: string } & MobPlaceNote) | null;
    }
  | { type: 'births'; mob: number; mobName: string; count: number }
  /** Cattle that died today in one mob of one cause. */
  | { type: 'deaths'; mob: number; mobName: string; cause: DeathCause; count: number }
  /** A portable trough is low or empty. */
  | { type: 'water'; event: WaterEvent; paddock: string }
  /** A hungry or thirsty mob pushed through one segment of tape. */
  | {
      type: 'breakout';
      mob: number;
      mobName: string;
      reason: 'hungry' | 'thirsty';
      edge: EdgeRef;
      area: string;
    }
  /** Two mobs that share a grazing area, the feedlot or the yards now run as one. */
  | {
      type: 'mobs-joined';
      from: number;
      fromName: string;
      into: number;
      intoName: string;
      area: string | null;
    }
  /** A year closed. */
  | { type: 'year-end'; year: YearRecord }
  /** The whole farm is eaten out with cattle on it. The game ends after `daysLeft` more days of this. */
  | { type: 'out-of-feed'; daysLeft: number }
  | { type: 'game-over'; reason: GameOverReason };

/** Events from the player's actions. */
export type ActionEvent =
  | {
      type: 'cattle-bought';
      cls: SaleClassId;
      qty: number;
      /** Dollars, freight included. */
      total: number;
      /** The young cattle indicator on the day, c/kg. */
      indicator: number;
      mob: number;
      mobName: string;
    }
  /**
   * Cattle bought on a sale day. They are paid for and on their way. They
   * land in the yards at first light on `arriveDay`.
   */
  | {
      type: 'cattle-on-the-way';
      cls: SaleClassId;
      qty: number;
      /** Dollars, freight included. */
      total: number;
      /** The young cattle indicator on the day, c/kg. */
      indicator: number;
      arriveDay: number;
      arriveDate: CalendarDate;
    }
  /** Stock booked onto the next sale. Nothing is paid until that day. */
  | {
      type: 'sale-booked';
      /** Head booked, not counting calves at foot. */
      head: number;
      calvesAtFoot: number;
      saleDay: number;
      saleDate: CalendarDate;
      daysAway: number;
    }
  /** Stock taken off a sale. */
  | { type: 'sale-cancelled'; head: number; saleDay: number; saleDate: CalendarDate }
  | {
      type: 'cattle-sold';
      /** True for stock sold at first light on the sale day they were booked onto. */
      booked?: true;
      /** Head sold, not counting calves at foot. */
      head: number;
      /** Calves that went with their mothers. */
      calvesAtFoot: number;
      avgKg: number;
      /** Dollars banked, after commission and freight. */
      net: number;
      /** `net` less what the cattle have cost. */
      profit: number;
    }
  | ({
      type: 'mob-moved';
      mob: number;
      mobName: string;
      head: number;
      /**
       * The time of day the mob arrived, in minutes after midnight on the
       * district town's clock. Left out for a move done without the farm
       * clock (calibration and tests).
       */
      at?: number;
    } & MobPlaceNote)
  /** The area a mob was put in has no water. Everything dies on day 4 without water. */
  | { type: 'no-water'; mob: number; mobName: string; area: string }
  /** What stock will meet on the area they were put in: a crop not ready to graze, stubble, a mixed paddock. */
  | { type: 'crop-risks'; mob: number; mobName: string; area: string; risks: CropRisk[] }
  /** A new fence or a shut gate divided a mob. Each part is now its own mob. */
  | {
      type: 'mob-split';
      mob: number;
      mobName: string;
      parts: { mob: number; mobName: string; area: string; head: number }[];
    }
  | { type: 'supplement-set'; mob: number; mobName: string; supp: Supplement }
  | { type: 'calves-marked'; mob: number; mobName: string; count: number; cost: number }
  /** A change to fences, gates or water. `detail` holds the lengths and counts. */
  | {
      type: 'layout-job';
      job: string;
      /** Dollars spent. Negative for money back. */
      cost: number;
      detail: Record<string, number | boolean | string>;
    }
  | {
      type: 'sown';
      sp: SpeciesId;
      fieldId: number;
      ha: number;
      /** Pasture turned into cropping country first, ha. */
      convHa: number;
      cost: number;
      /** Squares asked for that could not take it. */
      skipped: number;
    }
  | {
      type: 'harvested';
      sp: SpeciesId;
      fieldId: number;
      /** Tonnes of grain, and tonnes per hectare. */
      t: number;
      tha: number;
      value: number;
      cost: number;
    }
  | WorkEvent;

/**
 * Events from the start of a farm day, before the player can act: cattle
 * landing in the yards. A booked sale reports as a `cattle-sold` event with
 * `booked: true`.
 */
export type DawnEvent = {
  type: 'cattle-arrived';
  cls: SaleClassId;
  /** Head, not counting calves at foot. */
  head: number;
  calves: number;
  /** Dollars paid, freight included. */
  cost: number;
  /** The mob in the yards they are in now. */
  mob: number;
  mobName: string;
  /** True when they joined a mob that was already in the yards. */
  joined: boolean;
};

/** Events from the working day. */
export type WorkEvent =
  /**
   * Time was spent on a job. Times of day are minutes after midnight on the
   * district town's clock. It comes first, ahead of the events for what
   * the work did.
   */
  {
    type: 'job-worked';
    action: ActionType;
    start: number;
    end: number;
    workMin: number;
    /** True if all that was asked for was done. False for a line cut short by the light. */
    finished: boolean;
    /** For fence, tape and pipe: the pieces built, and the pieces that did not fit today. */
    pieces?: { built: number; notBuilt: number };
  };

/** The herd a running farm starts with. */
export interface StartHerd {
  cows: number;
  bulls: number;
  weaners: number;
  /** The herd's size, AE, and its share of the long-term carrying capacity (0 to 1). */
  ae: number;
  share: number;
}

/** What a new farm came with. The first message in every inbox. */
export interface FarmStarted {
  type: 'farm-started';
  farmHa: number;
  /** Metres along one side of a map square. */
  sideM: number;
  cash: number;
  overdraft: number;
  broke: number;
  /** Fence, gates, troughs and pipe that came with the farm, in segments and counts. */
  improvements: StartImprovements;
  herd: StartHerd | null;
  /** The season on day 0, and its growth as a multiple of a normal season. */
  season: { label: string; factor: number };
}

export type FarmEvent = FarmStarted | TickEvent | ActionEvent | DawnEvent;
