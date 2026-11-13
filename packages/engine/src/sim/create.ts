/**
 * A new farm, from a seed and the setup choices.
 *
 * The land, fences, water and buildings come from generateFarm. The money
 * and the starting herd follow the MVP's rules (its diffMoney and
 * startHerd; docs/DATA.md, Money and difficulty; Established farm layout).
 * Every random part draws from its own named stream.
 */

import type { DistrictId } from '@gg/shared';
import type { FarmStart } from '../calendar';
import { makeSaleBatch } from '../cattle/animal';
import type { Animal } from '../cattle/types';
import type { SaleClassId } from '../data/cattle';
import { FARM_SIZES } from '../data/farms';
import { DEFAULT_WORK_RULES } from '../data/jobTimes';
import { generateFarm, type StartType } from '../farm/generate';
import type { GrazingArea as TopologyArea } from '../farm/topology';
import { buyPrice } from '../market/prices';
import { realMarket, type RealMarket } from '../market/realMarket';
import { standInMarket } from '../market/standIn';
import { carryingCapacityAE, startMoney, type Difficulty, type StartMoney } from '../money/costs';
import { newYear } from '../money/worth';
import { rngStream, type Rng, type RngState } from '../rng';
import type { GrowthFactorSource } from '../season/factors';
import { planRealYears, type YearOrder } from '../season/realYears';
import { weatherSeasons } from '../season/weatherSeasons';
import { ENGINE_VERSION, SAVE_FORMAT_VERSION } from '../version';
import { startDay } from './clock';
import { placeAnchor, pricesOf, seasonsOf, surveyOf, type SourceEnv } from './derived';
import type { FarmStarted, StartHerd } from './events';
import { mergeShared, newMob } from './mobs';
import {
  PLAY_STREAMS,
  emptyLedger,
  toInbox,
  type FarmClock,
  type FarmState,
  type MarketState,
  type PlayStream,
  type RealYearsSpec,
  type WorkRules,
  type YearTotals,
} from './state';

export type FarmSizeName = 'small' | 'medium' | 'large';
const SIZE_INDEX: Record<FarmSizeName, 0 | 1 | 2> = { small: 0, medium: 1, large: 2 };

export interface CreateFarmOptions {
  /** The farm's seed. The same seed and options always give the same farm. */
  seed: number;
  district: DistrictId;
  /** One of the district's three sizes, or a size in hectares. */
  size: FarmSizeName | number;
  /**
   * The farm starts on the 1st of this month (0 is January).
   *
   * With random seasons the year is needed. With real years the year is
   * the first real year played, and can be left out: in order the oldest
   * year is then used, and at random the first year is drawn from the seed.
   */
  start: { year?: number; month: number };
  /**
   * The years the farm plays (PRD 5.14). Left out, or `random`: the MVP's
   * random seasons with the stand-in market. `real`: real years from 1997,
   * each with its real weather and real prices, as they happened
   * (`in-order`) or shuffled from the seed (`random`). After the newest
   * year an in-order farm goes back to the oldest.
   */
  years?: { kind: 'random' } | { kind: 'real'; order: YearOrder };
  /** Start from scratch (no cattle), or take over a running farm with its herd. */
  startType: StartType;
  /** A mixed farm: the arable share of the farm and the share of that in the rotation, both %. */
  mixed?: { arablePct: number; croppedPct: number };
  difficulty: Difficulty;
  /** Money to use in place of the difficulty's. For tests and calibration. */
  money?: StartMoney;
  /**
   * The switches for the working day, in place of the defaults (PRD 21,
   * row 4): whether driving takes time, and whether the drive home must
   * fit inside daylight. The farm keeps what it starts with.
   */
  work?: Partial<WorkRules>;
}

/** The stream the starting herd is drawn from. */
export const HERD_STREAM = 'gen:herd';

/** A running farm's herd is this share of its long-term carrying capacity. */
export const START_HERD_SHARE = { lo: 0.35, hi: 0.65 } as const;

/**
 * Put a running farm's herd on it: cows and bulls in the biggest area with
 * water and weaners in the next. Cows are the AE x 0.65 / 1.05 (55% PTIC,
 * 25% with calves, the rest dry), with one bull for each 40 cows. Weaners
 * are the AE x 0.3 / 0.55, half steers and half heifers. Each beast is
 * valued at today's market. Returns null if no area has water.
 */
export function startHerd(farm: FarmState, rng: Rng): StartHerd | null {
  const share = rng.range(START_HERD_SHARE.lo, START_HERD_SHARE.hi);
  const ae = carryingCapacityAE(farm.district, farm.layout.scale.farmHa) * share;
  const survey = surveyOf(farm);
  const wet = survey.topology.areas
    .filter((r) => survey.points.areaTroughs[r.id]!.length > 0)
    .sort((a, b) => b.ha - a.ha);
  if (!wet.length) return null;
  const cows = Math.max(10, Math.round((ae * 0.65) / 1.05));
  const bulls = Math.max(1, Math.ceil(cows / 40));
  const weaners = Math.max(4, Math.round((ae * 0.3) / 0.55));
  const prices = pricesOf(farm);
  const batch = (key: SaleClassId, qty: number): Animal[] =>
    makeSaleBatch(farm.animalIds, rng, key, qty);
  const put = (list: Animal[], area: TopologyArea): void => {
    const m = newMob(farm, { kind: 'paddock', anchor: placeAnchor(survey, area.id) });
    for (const a of list) {
      a.paid = buyPrice(a, prices);
      a.cost = a.paid;
      m.animals.push(a);
    }
  };
  const ptic = Math.round(cows * 0.55);
  const withCalf = Math.round(cows * 0.25);
  put(
    [
      ...batch('ptic', ptic),
      ...batch('cowCalf', withCalf),
      ...batch('dryCow', cows - ptic - withCalf),
      ...batch('bull', bulls),
    ],
    wet[0]!,
  );
  const steers = Math.round(weaners / 2);
  put(
    [...batch('weanerSteer', steers), ...batch('weanerHeifer', weaners - steers)],
    wet[1] ?? wet[0]!,
  );
  mergeShared(farm, survey);
  return { cows, bulls, weaners, ae, share };
}

/** What a real-year farm is set up with: its years, its weather and its market on day 0. */
interface RealStart {
  spec: RealYearsSpec;
  start: FarmStart;
  seasons: GrowthFactorSource;
  market: RealMarket;
}

/** Lay out a real-year farm's years and open its market, from the real data. */
function startRealYears(o: CreateFarmOptions, order: YearOrder, env: SourceEnv): RealStart {
  if (!env.data) {
    throw new Error(
      'A real-year farm needs the real weather and price tables: pass the real data bundle as `data`.',
    );
  }
  const data = env.data.district(o.district);
  const years = data.years(o.start.month);
  if (!years.length) throw new Error('The real data has no year that can be played.');
  const first = years[0]!;
  const last = years.at(-1)!;
  // The farm saves only the oldest and newest year, so there must be none missing between.
  if (last - first + 1 !== years.length) {
    throw new Error('The real years that can be played must run on with none missing.');
  }
  const plan = planRealYears({
    years,
    order,
    seed: o.seed,
    startMonth: o.start.month,
    firstYear: o.start.year,
  });
  const market = realMarket({
    prices: data.prices,
    cpi: data.cpi,
    realDateOn: plan.realDateOn,
  }).open(plan.start, rngStream(o.seed, PLAY_STREAMS.market));
  return {
    spec: {
      kind: 'real',
      order,
      firstYear: plan.start.year,
      years: { first, last },
      dataVersion: data.version,
    },
    start: plan.start,
    seasons: weatherSeasons({ growth: data.weather, plan }),
    market,
  };
}

/**
 * Build a new farm.
 *
 * A real-year farm (`years: { kind: 'real', ... }`) needs the real data
 * bundle in `env.data`. Its pasture run-up uses the real weather before
 * its start, and its market opens on the real prices of its first day.
 */
export function createFarm(o: CreateFarmOptions, env: SourceEnv = {}): FarmState {
  const farmHa = typeof o.size === 'number' ? o.size : FARM_SIZES[o.district][SIZE_INDEX[o.size]];
  const running = o.startType === 'running';
  const real = o.years?.kind === 'real' ? startRealYears(o, o.years.order, env) : null;
  if (!real && o.start.year === undefined) {
    throw new RangeError('A farm with random seasons needs a start year.');
  }
  const start: FarmStart = real ? real.start : { year: o.start.year!, month: o.start.month };
  const gen = generateFarm({
    seed: o.seed,
    district: o.district,
    farmHa,
    start,
    startType: o.startType,
    mixed: o.mixed,
    seasons: real?.seasons,
  });
  const money = o.money ?? startMoney(o.district, farmHa, o.difficulty, running);

  const rng = {} as Record<PlayStream, RngState>;
  for (const name of Object.keys(PLAY_STREAMS) as PlayStream[]) {
    rng[name] = rngStream(o.seed, PLAY_STREAMS[name]).state();
  }
  // The market opens on day 0. Past the end of its series the stand-in
  // draws from its stream. The real market never draws.
  let market: MarketState;
  if (real) market = real.market;
  else {
    const marketRng = rngStream(o.seed, PLAY_STREAMS.market);
    market = standInMarket.open(start, marketRng);
    rng.market = marketRng.state();
  }

  const farm: FarmState = {
    engineVersion: ENGINE_VERSION,
    saveFormat: SAVE_FORMAT_VERSION,
    seed: o.seed,
    district: o.district,
    start: { year: start.year, month: start.month },
    startType: o.startType,
    mixed: !!o.mixed,
    arablePct: gen.arablePct,
    difficulty: o.money ? 'custom' : o.difficulty,
    day: 0,
    cash: money.cash,
    startCash: money.cash,
    overdraft: money.overdraft,
    broke: money.broke,
    pasture: gen.pasture,
    crops: gen.crops,
    layout: gen.layout,
    // An energiser comes with a farm that has electric fence.
    energiser: gen.improvements.electric > 0,
    buildings: gen.buildings,
    mobs: [],
    animalIds: { next: 1 },
    nextMobId: 1,
    seasons: real ? real.spec : { kind: 'random' },
    market,
    priceHistory: [],
    rng,
    // Set below, once the herd is on, because a year opens with the farm's net worth.
    year: null as unknown as YearTotals,
    years: [],
    ledger: emptyLedger(),
    inbox: [],
    inboxSeq: 1,
    noFeedDays: 0,
    over: null,
    actionLog: [],
    // Set below: the clock reads the date from the farm.
    clock: null as unknown as FarmClock,
    workRules: { ...DEFAULT_WORK_RULES, ...(o.work ?? {}) },
    jobs: [],
    nextJobId: 1,
    bookings: [],
    nextBookingId: 1,
  };
  startDay(farm);

  const herd = running ? startHerd(farm, rngStream(o.seed, HERD_STREAM)) : null;
  farm.year = newYear(farm);

  const season = seasonsOf(farm, { data: env.data }).factorsOn(0);
  const started: FarmStarted = {
    type: 'farm-started',
    farmHa,
    sideM: farm.layout.scale.sideM,
    cash: farm.cash,
    overdraft: farm.overdraft,
    broke: farm.broke,
    improvements: gen.improvements,
    herd,
    season: { label: season.label, factor: season.seasonF },
  };
  toInbox(farm, 0, [started]);
  return farm;
}
