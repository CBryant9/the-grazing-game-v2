/**
 * The stand-in market: the MVP's price mechanism.
 *
 * WARNING: the 2019 to 2025 series below was written from memory in the MVP
 * build. It follows the real shape of those years but the monthly values
 * are not real data (docs/DATA.md, Market; LESSONS 13). Milestone 1.4
 * replaces this source with real MLA prices behind the same interface.
 *
 * This is the MVP's MKT, series, mktBase, MCLS and the market lines of its
 * stepDay, matched number for number.
 */

import { dateAt, type FarmStart } from '../calendar';
import { MARKET_CLASSES, type MarketClassId } from '../data/cattle';
import { clamp, lerp } from '../num';
import type { Rng } from '../rng';
import type { PriceSource, Prices } from './prices';

/** The first year of the series. */
export const STAND_IN_FIRST_YEAR = 2019;

/** Restocker yearling steer indicator, c/kg live weight, monthly from January 2019 to December 2025. Approximate. */
export const STAND_IN_SERIES: readonly number[] = [
  280, 255, 262, 272, 282, 292, 302, 312, 302, 305, 330, 352, 385, 425, 432, 452, 470, 452, 442,
  462, 472, 482, 492, 522, 562, 602, 622, 612, 602, 622, 642, 652, 642, 652, 642, 662, 682, 692,
  662, 642, 602, 582, 562, 542, 522, 482, 422, 402, 412, 392, 342, 302, 292, 262, 272, 242, 202,
  242, 282, 332, 342, 332, 312, 322, 302, 292, 312, 332, 332, 352, 352, 362, 372, 382, 392, 402,
  412, 402, 412, 422, 432, 442, 452, 452,
];

/** After the series ends: a random walk that pulls toward 430 c/kg. */
export const STAND_IN_WALK = {
  /** The level it pulls toward, c/kg. */
  mean: 430,
  /** The share of the gap to the mean closed each month. */
  pull: 0.06,
  /** Monthly noise, c/kg (one standard deviation). */
  noise: 20,
  /** The chance of a shock in a month, and its size, c/kg (one standard deviation). */
  shockChance: 0.05,
  shock: 60,
  min: 180,
  max: 760,
} as const;

/** Each class as a multiple of the indicator. */
export const CLASS_MULTIPLIERS: Readonly<Record<MarketClassId, number>> = {
  wean: 1.08,
  feed: 1,
  heavy: 0.9,
  wheif: 0.92,
  heifer: 0.85,
  cow: 0.64,
  bull: 0.58,
  calf: 1.1,
};

/** The daily wobble on the indicator, and the slow drift of each class around it. */
export const STAND_IN_DAILY = {
  noiseKeep: 0.97,
  noiseStep: 0.006,
  driftKeep: 0.985,
  driftStep: 0.007,
  /** Each class stays within 20% of its usual multiple. */
  driftLimit: 0.2,
} as const;

const CLASS_IDS = Object.keys(MARKET_CLASSES) as MarketClassId[];

/** The stand-in market's state. Plain data, saved with the farm. */
export interface StandInMarket {
  kind: 'standIn';
  /** Today's indicator, c/kg live weight, with the daily wobble in it. */
  indicator: number;
  /** The daily wobble, as a share of the indicator. */
  noise: number;
  /** Each class's drift, as a share of its usual multiple. */
  drift: Record<MarketClassId, number>;
  /** The monthly indicator after the series ends, drawn as it is first needed. */
  ext: number[];
}

/**
 * A normally distributed number, drawn the way the MVP drew it: two numbers
 * from the stream, either redrawn if it comes up exactly zero.
 */
function gauss(rng: Pick<Rng, 'next'>): number {
  let u = 0;
  let v = 0;
  while (!u) u = rng.next();
  while (!v) v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** The indicator for month `i` of the series (0 is January 2019). Months before the series use its first value. */
function series(m: StandInMarket, i: number, rng: Pick<Rng, 'next'>): number {
  if (i < 0) return STAND_IN_SERIES[0]!;
  if (i < STAND_IN_SERIES.length) return STAND_IN_SERIES[i]!;
  const W = STAND_IN_WALK;
  while (m.ext.length <= i - STAND_IN_SERIES.length) {
    const last = m.ext.length
      ? m.ext[m.ext.length - 1]!
      : STAND_IN_SERIES[STAND_IN_SERIES.length - 1]!;
    const shock = rng.next() < W.shockChance ? gauss(rng) * W.shock : 0;
    m.ext.push(
      Math.round(
        clamp(last + W.pull * (W.mean - last) + gauss(rng) * W.noise + shock, W.min, W.max),
      ),
    );
  }
  return m.ext[i - STAND_IN_SERIES.length]!;
}

/** The indicator for a farm day before the daily wobble: the monthly values joined mid-month to mid-month. */
function base(m: StandInMarket, start: FarmStart, day: number, rng: Pick<Rng, 'next'>): number {
  const d = dateAt(start, day);
  const mi = (d.year - STAND_IN_FIRST_YEAR) * 12 + d.month + (d.date - 15) / 30;
  const i0 = Math.floor(mi);
  return lerp(series(m, i0, rng), series(m, i0 + 1, rng), mi - i0);
}

/** The MVP's market, as a price source. */
export const standInMarket: PriceSource<StandInMarket> = {
  open(start, rng) {
    const drift = {} as Record<MarketClassId, number>;
    for (const k of CLASS_IDS) drift[k] = 0;
    const m: StandInMarket = { kind: 'standIn', indicator: 0, noise: 0, drift, ext: [] };
    m.indicator = base(m, start, 0, rng);
    return m;
  },
  step(m, start, toDay, rng) {
    const D = STAND_IN_DAILY;
    m.noise = m.noise * D.noiseKeep + gauss(rng) * D.noiseStep;
    for (const k of CLASS_IDS) {
      m.drift[k] = clamp(
        (m.drift[k] || 0) * D.driftKeep + gauss(rng) * D.driftStep,
        -D.driftLimit,
        D.driftLimit,
      );
    }
    m.indicator = base(m, start, toDay, rng) * (1 + m.noise);
  },
  prices(m): Prices {
    const classes = {} as Record<MarketClassId, number>;
    for (const k of CLASS_IDS) {
      classes[k] = m.indicator * CLASS_MULTIPLIERS[k] * (1 + (m.drift[k] || 0));
    }
    return { indicator: m.indicator, classes };
  },
};
