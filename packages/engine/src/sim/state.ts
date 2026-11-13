/**
 * A whole farm in one object that can be saved.
 *
 * Everything the simulation needs to carry a farm from one day to the next
 * is here, as plain data and typed arrays: no functions, no clock, nothing
 * drawn. The daily tick (tick.ts) and the actions (../actions) change it.
 * What can be worked out from it (paddocks, grazing areas, watered squares)
 * is never stored; see derived.ts.
 */

import type { DistrictId } from '@gg/shared';
import type { FarmStart } from '../calendar';
import type { AnimalIds, CattleMob } from '../cattle/types';
import type { CropState } from '../crops/fields';
import type { MarketClassId } from '../data/cattle';
import type { FarmBuildings, StartType } from '../farm/generate';
import type { FarmLayout } from '../farm/layout';
import type { StandInMarket } from '../market/standIn';
import type { Difficulty } from '../money/costs';
import type { PastureState } from '../pasture/state';
import type { RngState } from '../rng';
import type { Action } from '../actions/types';
import type { FarmEvent } from './events';

/** Where a mob is. */
export type MobWhere =
  /** On pasture, in the grazing area that holds the anchor square. */
  | { kind: 'paddock'; anchor: number }
  /** In the feedlot, on the ration. */
  | { kind: 'lot' }
  /** In the stock yards (deliveries and yard work, milestone 1.5). */
  | { kind: 'yards' };

/** A mob on the farm: its cattle and the day's figures, plus who and where it is. */
export interface FarmMob extends CattleMob {
  /** Unique on the farm. Never reused. */
  id: number;
  name: string;
  where: MobWhere;
  /** The farm day the mob last pushed through tape, or null. */
  lastBreak: number | null;
}

/** The running totals for a farm year. The first five are the cattle step's totals. */
export interface YearTotals {
  /** The farm day the year started. */
  start: number;
  /** Feed grown across the farm, kg DM. */
  grown: number;
  /** Pasture eaten, kg DM. */
  eaten: number;
  /** Live weight gained, kg, summed over every animal. Birth weights are added too. */
  gain: number;
  births: number;
  deaths: number;
  /** Dollars from cattle sales, after selling costs. */
  sales: number;
  /** Dollars spent buying cattle, freight included. */
  buys: number;
  /** Dollars spent on supplements and the feedlot. */
  feed: number;
  /** Dollars from grain. */
  grain: number;
  /** Dollars spent on sowing forages and crops, and on harvesting. */
  crops: number;
  /** Dollars spent on infrastructure. */
  infra: number;
  /** Dollars of running costs: overheads, animal health, marking, repairs, carting water. */
  running: number;
  /** Interest: negative when paid on an overdraft, positive when earned. */
  interest: number;
  /** Net worth when the year started. */
  worth0: number;
  /** Ground cover % on the 1st of each month. */
  covers: number[];
}

/** The points a year scored, and the figures behind them. */
export interface YearScore {
  /** Change in net worth over the year, dollars. */
  profit: number;
  /** Share of the feed grown that was eaten, %. */
  util: number;
  /** Average ground cover, %. */
  cover: number;
  profitPts: number;
  gainPts: number;
  utilPts: number;
  coverPts: number;
  deathPts: number;
  total: number;
}

/** A finished year. */
export interface YearRecord extends YearTotals {
  /** Net worth when the year closed. */
  worth1: number;
  score: YearScore;
  /** 1 for the farm's first year. */
  n: number;
  /** The farm day the year closed. */
  end: number;
}

/**
 * What has been spent on infrastructure that is still in place, item by
 * item, so net worth falls when something is pulled out. Improvements that
 * came with the farm are not in here: nothing was spent on them. Tape is not
 * in here either: all tape on a farm was bought, so its worth is counted
 * from the tape standing, down and on the roll.
 */
export interface InfraLedger {
  /** Dollars spent on the fence or gate on a line, by line ("h12", "v340"). */
  edges: Record<string, number>;
  /** Dollars spent on pipe. Pipe is never pulled up. */
  pipe: number;
  /** Dollars spent on each fixed trough, by square. */
  troughs: Record<string, number>;
  /** Dollars spent on each fence-line hub, by grid corner. */
  hubs: Record<string, number>;
  /** Dollars counted for each portable trough, by its id. */
  ports: Record<string, number>;
  /** Dollars spent on the energiser. */
  energiser: number;
  /** Sown pasture, by planting id: dollars counted for each square still in the planting. */
  pasture: Record<string, number>;
}

export const emptyLedger = (): InfraLedger => ({
  edges: {},
  pipe: 0,
  troughs: {},
  hubs: {},
  ports: {},
  energiser: 0,
  pasture: {},
});

/** Where the growth factors come from. Real weather joins this in milestone 1.4. */
export type SeasonSpec = { kind: 'random' };

/** The market's saved state. Real prices join this in milestone 1.4. */
export type MarketState = StandInMarket;

/** One day of class prices, for the market chart. */
export interface PriceDay {
  day: number;
  /** c/kg live weight for each class. */
  c: Record<MarketClassId, number>;
}

/** The named random streams a farm draws from in play. Each has its own saved state. */
export const PLAY_STREAMS = {
  /** Conception, slipped calves, calving losses, the sex of a calf, barren females. */
  breeding: 'cattle:breeding',
  /** Daily deaths and orphaned calves. */
  deaths: 'cattle:deaths',
  /** Hungry or thirsty mobs pushing through tape. */
  breakouts: 'breakouts',
  /** Which side of a new fence each beast ends up on. */
  strays: 'strays',
  /** The market's daily moves. */
  market: 'market',
  /** The cattle that turn up when a class is bought. */
  buying: 'buying',
} as const;
export type PlayStream = keyof typeof PLAY_STREAMS;

/** A message for the player: something that happened, as data. The screens write the words. */
export interface InboxMessage {
  /** Messages are numbered in the order they were made. */
  seq: number;
  /** The farm day it happened. */
  day: number;
  event: FarmEvent;
}

/** The inbox keeps this many messages. Older ones drop off. */
export const INBOX_LIMIT = 120;

/** An action the player took, as it was asked for. */
export interface LoggedAction {
  /** The farm day it was done on. */
  day: number;
  action: Action;
}

export type GameOverReason =
  /** Cash reached the bank's limit. */
  | 'bank'
  /** The whole farm was eaten out for 10 days with cattle on it. */
  | 'feed';

export interface FarmState {
  /** The engine version the farm was last run on. */
  engineVersion: string;
  /** The save format the farm was last saved in. */
  saveFormat: number;
  /** The farm's seed. The same seed, options and actions always give the same farm. */
  seed: number;
  district: DistrictId;
  start: FarmStart;
  startType: StartType;
  /** True for a mixed farm (grazing and cropping). */
  mixed: boolean;
  /** Arable share of the farm that was asked for or drawn, %. */
  arablePct: number;
  /** The difficulty the money was set from, or 'custom' when the money was given. */
  difficulty: Difficulty | 'custom';
  /** Today's farm day. Day 0 is the farm's first day. */
  day: number;

  /** Dollars in the bank. Negative when overdrawn. */
  cash: number;
  /** Dollars the farm started with. */
  startCash: number;
  /** How far the bank will lend. A negative number. */
  overdraft: number;
  /** The bank takes the farm when cash reaches this. A negative number. */
  broke: number;

  pasture: PastureState;
  crops: CropState;
  /** Fences, water, the farm's scale and the tape on the roll. Replaced, never changed in place. */
  layout: FarmLayout;
  /** True once the farm has a solar energiser for electric fence. */
  energiser: boolean;
  buildings: FarmBuildings;

  mobs: FarmMob[];
  /** Hands out tag numbers. */
  animalIds: AnimalIds;
  /** The id the next mob gets. */
  nextMobId: number;

  seasons: SeasonSpec;
  market: MarketState;
  /** The last 31 days of class prices. */
  priceHistory: PriceDay[];
  /** The saved state of each random stream. */
  rng: Record<PlayStream, RngState>;

  /** The year under way. */
  year: YearTotals;
  /** Finished years, oldest first. */
  years: YearRecord[];
  ledger: InfraLedger;

  inbox: InboxMessage[];
  /** The number the next inbox message gets. */
  inboxSeq: number;
  /** Days in a row the whole farm has been eaten out with cattle on it. */
  noFeedDays: number;
  /** Set when the game is over. Nothing more can be done on the farm. */
  over: { reason: GameOverReason; day: number } | null;
  /** Every action taken on the farm, in order. */
  actionLog: LoggedAction[];
}

/** The MVP's price chart kept 31 days. */
export const PRICE_HISTORY_DAYS = 31;

/**
 * A separate copy of a farm, or of any part of one: plain objects, arrays
 * and typed arrays, copied all the way down.
 */
export function deepCopy<T>(v: T): T {
  if (ArrayBuffer.isView(v)) {
    return (v as unknown as { slice(): unknown }).slice() as T;
  }
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = deepCopy(v[i]);
    return out as T;
  }
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = deepCopy((v as Record<string, unknown>)[k]);
    return out as T;
  }
  return v;
}

/** A separate copy of a farm, so one can change without the other. */
export const cloneFarm = (farm: FarmState): FarmState => deepCopy(farm);

/** Add events to the inbox, oldest dropped past the limit. */
export function toInbox(farm: FarmState, day: number, events: readonly FarmEvent[]): void {
  for (const event of events) farm.inbox.push({ seq: farm.inboxSeq++, day, event });
  if (farm.inbox.length > INBOX_LIMIT) farm.inbox.splice(0, farm.inbox.length - INBOX_LIMIT);
}
