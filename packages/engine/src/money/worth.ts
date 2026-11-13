/**
 * Net worth, the year's totals and the yearly score.
 *
 * The score is the MVP's scoreYear, matched number for number (docs/MODEL.md,
 * section 7). Net worth follows the REBUILD rule, not the MVP's: cash, plus
 * stock at net sale value (never below 0 for a beast), plus 80% of what has
 * been spent on infrastructure that is still in place. The MVP counted
 * improvements that were never paid for and never took anything off when it
 * was removed (BUILD_PLAN 2.4).
 */

import { EDGE } from '../farm/topology';
import { netSaleValue, type Prices } from '../market/prices';
import { coverPct } from '../pasture/summary';
import { pricesOf } from '../sim/derived';
import type { FarmState, InfraLedger, YearRecord, YearScore, YearTotals } from '../sim/state';
import { INFRA_WORTH_SHARE, segmentCost } from './costs';

const sum = (r: Record<string, number>): number => {
  let t = 0;
  for (const k in r) t += r[k]!;
  return t;
};

/** Segments of tape the farm owns: standing, knocked down and on the roll. */
export function tapeOwned(farm: Pick<FarmState, 'layout'>): number {
  let n = farm.layout.tapeOnRoll;
  const { hE, vE } = farm.layout.fences;
  for (let i = 0; i < hE.length; i++) if (hE[i] === EDGE.tape || hE[i] === EDGE.tapeDown) n++;
  for (let i = 0; i < vE.length; i++) if (vE[i] === EDGE.tape || vE[i] === EDGE.tapeDown) n++;
  return n;
}

/** Dollars spent on sown pasture that is still in the ground. */
function pastureInPlace(farm: Pick<FarmState, 'crops' | 'ledger'>): number {
  let t = 0;
  for (const f of farm.crops.fields) {
    const perSquare = farm.ledger.pasture[f.id];
    if (perSquare) t += perSquare * f.cells.length;
  }
  return t;
}

/** Dollars spent on infrastructure that is still in place. */
export function infraInPlace(farm: Pick<FarmState, 'layout' | 'crops' | 'ledger'>): number {
  const L: InfraLedger = farm.ledger;
  return (
    sum(L.edges) +
    L.pipe +
    sum(L.troughs) +
    sum(L.hubs) +
    sum(L.ports) +
    L.energiser +
    tapeOwned(farm) * segmentCost('tape', farm.layout.scale.sideM) +
    pastureInPlace(farm)
  );
}

/** What the farm's cattle would put in the bank if sold today. A beast never counts below 0. */
export function stockWorth(farm: Pick<FarmState, 'mobs'>, prices: Prices): number {
  let v = 0;
  for (const m of farm.mobs) for (const a of m.animals) v += Math.max(0, netSaleValue(a, prices));
  return v;
}

/**
 * Net worth: cash, plus 80% of what has been spent on infrastructure still
 * in place, plus the cattle at net sale value.
 */
export function netWorth(farm: FarmState, prices: Prices = pricesOf(farm)): number {
  let v = farm.cash + infraInPlace(farm) * INFRA_WORTH_SHARE;
  for (const m of farm.mobs) for (const a of m.animals) v += Math.max(0, netSaleValue(a, prices));
  return v;
}

/** Net worth in its three parts, for the Scores screen. */
export function netWorthParts(farm: FarmState): {
  cash: number;
  stock: number;
  infrastructure: number;
  total: number;
} {
  const prices = pricesOf(farm);
  return {
    cash: farm.cash,
    stock: stockWorth(farm, prices),
    infrastructure: infraInPlace(farm) * INFRA_WORTH_SHARE,
    total: netWorth(farm, prices),
  };
}

/** A new year's totals, starting today. */
export function newYear(farm: FarmState): YearTotals {
  return {
    start: farm.day,
    grown: 0,
    eaten: 0,
    gain: 0,
    births: 0,
    deaths: 0,
    sales: 0,
    buys: 0,
    feed: 0,
    grain: 0,
    crops: 0,
    infra: 0,
    running: 0,
    interest: 0,
    worth0: netWorth(farm),
    covers: [],
  };
}

/** The score's figures (docs/MODEL.md, section 7). */
export const SCORE = {
  /** A point for every this many dollars of profit. */
  dollarsPerPoint: 20,
  /** Points for each kg of live weight gained. */
  gainPts: 0.5,
  /** Up to this utilisation (%), each point of utilisation scores `utilPts`. */
  utilFull: 45,
  utilPts: 22,
  /** From `utilFull` to this utilisation (%), the score is `utilTop`. Past it, each point costs `utilOver`. */
  utilHigh: 60,
  utilTop: 1000,
  utilOver: 40,
  /** Points for each % of ground cover, up to `coverTop`. */
  coverPts: 7,
  coverTop: 500,
  /** Under this cover (%), each point short costs `coverShort`. */
  coverLow: 40,
  coverShort: 25,
  /** Points lost for each death. */
  death: 60,
} as const;

/**
 * Score a year. `coverNow` is the farm's ground cover % today, used only
 * when the year has no monthly readings yet.
 */
export function scoreYear(
  y: Pick<YearTotals, 'worth0' | 'grown' | 'eaten' | 'gain' | 'deaths' | 'covers'> & {
    worth1: number;
  },
  coverNow: number,
): YearScore {
  const S = SCORE;
  const profit = y.worth1 - y.worth0;
  const util = y.grown > 0 ? (y.eaten / y.grown) * 100 : 0;
  const cover = y.covers.length ? y.covers.reduce((a, b) => a + b, 0) / y.covers.length : coverNow;
  const utilPts =
    util <= S.utilFull
      ? util * S.utilPts
      : util <= S.utilHigh
        ? S.utilTop
        : Math.max(0, S.utilTop - (util - S.utilHigh) * S.utilOver);
  const coverPts =
    Math.min(S.coverTop, cover * S.coverPts) -
    (cover < S.coverLow ? (S.coverLow - cover) * S.coverShort : 0);
  const profitPts = profit / S.dollarsPerPoint;
  const gainPts = y.gain * S.gainPts;
  const deathPts = -y.deaths * S.death;
  return {
    profit,
    util,
    cover,
    profitPts,
    gainPts,
    utilPts,
    coverPts,
    deathPts,
    total: Math.round(profitPts + gainPts + utilPts + coverPts + deathPts),
  };
}

/** The year under way as if it closed today, with its score so far. */
export function liveYear(farm: FarmState): YearTotals & { worth1: number; score: YearScore } {
  const y = { ...farm.year, covers: farm.year.covers.slice(), worth1: netWorth(farm) };
  return { ...y, score: scoreYear(y, coverPct(farm.pasture)) };
}

/** Close the year: score it, file it and start the next. Returns the finished year. */
export function closeYear(farm: FarmState): YearRecord {
  const worth1 = netWorth(farm);
  const y = { ...farm.year, worth1 };
  const rec: YearRecord = {
    ...y,
    score: scoreYear(y, coverPct(farm.pasture)),
    n: farm.years.length + 1,
    end: farm.day,
  };
  farm.years.push(rec);
  farm.year = newYear(farm);
  return rec;
}

/**
 * Take money for something the bank must agree to. Refused, with nothing
 * changed, if it would take the account past the overdraft limit.
 */
export function spend(farm: Pick<FarmState, 'cash' | 'overdraft'>, amount: number): boolean {
  if (farm.cash - amount < farm.overdraft) return false;
  farm.cash -= amount;
  return true;
}
