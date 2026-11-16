/**
 * A self-replacing Merino flock managed the way a gross margin budget
 * assumes (review of the third pass, item 15): the running farm's start
 * flock, sheep only, run two years on the average year with no hands. Each
 * weaning the wether lambs are sold and the ewe lambs over the replacements
 * a self-replacing flock needs; after weaning the ewes past the cast-for-age
 * age are sold; and the district's usual winter feeding is done through the
 * player's own action (grain when a mob's CS falls under 2.7, as the year
 * benchmarks feed). The second year is the one measured: the gross margin a
 * DSE, and its parts.
 *
 * Test use only.
 */

import type { DistrictId } from '@gg/shared';
import { START_FLOCK } from '../src/data/sheep';
import {
  SHEEP_BUDGET_COSTS,
  SHEEP_HEAD_PRICES,
  SHEEP_HEALTH_PER_HEAD_YEAR,
} from '../src/data/sheepMarket';
import { isAdultRam } from '../src/sheep/energy';
import { sheepMobsOf } from '../src/sheep/farm';
import { sheepIndicatorsOf, sheepWorth } from '../src/sheep/market';
import { stockingRead } from '../src/sheep/reads';
import { headOf } from '../src/sheep/simFlock';
import type { SheepFeed } from '../src/data/sheep';
import { createFarm } from '../src/sim/create';
import type { FarmState } from '../src/sim/state';
import { stepDay } from '../src/sim/tick';
import { AVERAGE_YEAR } from './calibration';
import { applyInstantly } from './instant';
import { FEED_FROM_CS, FEED_TO_CS } from './sheep';

/** The second year's money, dollars, and the flock's average DSE over it. */
export interface MarginYear {
  dse: number;
  /** Ewes joined at the last joining. */
  ewes: number;
  sales: number;
  wool: number;
  buys: number;
  shearing: number;
  crutching: number;
  health: number;
  rams: number;
  feed: number;
  /** Sheep worth at the end of the year less at its start (wool on their backs included). */
  stockChange: number;
  /** Gross margin: sales + wool + stock change − buys − every variable cost. */
  margin: number;
  perDse: number;
}

/** Replacements kept a year as a share of the ewes joined: one age class of five, and the ewe deaths. */
export const REPLACEMENT_SHARE = 1 / (START_FLOCK.castForAge - START_FLOCK.maidenYears) + 0.03;

function must(farm: FarmState, action: Parameters<typeof applyInstantly>[1]): FarmState {
  const r = applyInstantly(farm, action, { seasons: AVERAGE_YEAR });
  if (!r.ok) throw new Error(`${action.type} was refused: ${r.message}`);
  return r.farm;
}

/** Run the managed flock two years and measure the second. */
export function managedFlockYear(district: DistrictId, seed: number): MarginYear {
  const env = { seasons: AVERAGE_YEAR };
  let farm = createFarm(
    {
      seed,
      district,
      size: 'medium',
      start: { year: 2021, month: 8 },
      startType: 'running',
      difficulty: 'easy',
      stock: 'sheep',
      money: { cash: 5e6, overdraft: -5e6, broke: -1e7 },
    },
    env,
  );
  const y: MarginYear = {
    dse: 0,
    ewes: 0,
    sales: 0,
    wool: 0,
    buys: 0,
    shearing: 0,
    crutching: 0,
    health: 0,
    rams: 0,
    feed: 0,
    stockChange: 0,
    margin: 0,
    perDse: 0,
  };
  let worth0 = 0;
  let dseDays = 0;
  for (let d = 0; d < 730; d++) {
    const measured = d >= 365;
    if (d === 365) worth0 = sheepWorth(sheepMobsOf(farm), sheepIndicatorsOf(farm));
    // Winter feeding, as the year benchmarks feed.
    for (const m of sheepMobsOf(farm)) {
      const w = m.sheep.filter((x) => x.weaned);
      const h = headOf(w);
      const cs = h ? w.reduce((t, x) => t + x.cond * x.n, 0) / h : 3;
      let want: SheepFeed = m.feed;
      if (cs < FEED_FROM_CS) want = 'grain';
      else if (cs >= FEED_TO_CS) want = 'none';
      if (want !== m.feed) farm = must(farm, { type: 'setSheepFeed', mob: m.id, feed: want });
    }
    const feed0 = farm.year.feed;
    const buys0 = farm.year.sheepBuys ?? 0;
    const r = stepDay(farm, env);
    let weaned = false;
    for (const e of r.events) {
      if (!measured) continue;
      if (e.type === 'sheep-shorn') {
        y.shearing += e.cost;
        y.wool += e.woolIncome;
      }
      if (e.type === 'sheep-crutched') y.crutching += e.cost;
    }
    for (const e of r.events) if (e.type === 'sheep-weaned') weaned = true;
    if (measured) {
      // A year-end resets the year lines; take the day's change either way.
      if (farm.year.start === farm.day) y.feed += farm.years.at(-1)!.feed - feed0;
      else y.feed += farm.year.feed - feed0;
      const head = sheepMobsOf(farm).reduce(
        (t, m) => t + headOf(m.sheep.filter((x) => x.weaned)),
        0,
      );
      y.health += (head * SHEEP_HEALTH_PER_HEAD_YEAR) / 365;
      const rams = sheepMobsOf(farm).reduce((t, m) => t + headOf(m.sheep.filter(isAdultRam)), 0);
      y.rams += (rams * SHEEP_HEAD_PRICES.ramHead) / SHEEP_BUDGET_COSTS.ramYears / 365;
      dseDays += stockingRead(farm).sheepDse;
    }
    if (weaned) {
      // Sell the wether lambs and the surplus ewe lambs; then the ewes past cast-for-age.
      const ewesJoined = sheepMobsOf(farm).reduce((t, m) => Math.max(t, m.join?.joined ?? 0), 0);
      const keep = Math.round(ewesJoined * REPLACEMENT_SHARE);
      const before = farm.year.sheepSales ?? 0;
      for (const m of sheepMobsOf(farm)) {
        for (const sex of ['W', 'M'] as const) {
          const n = m.sheep
            .filter((x) => x.weaned && x.age < 365 && x.sex === sex)
            .reduce((t, x) => t + x.n, 0);
          if (n) farm = must(farm, { type: 'sellSheep', mob: m.id, cls: 'weaner', qty: n, sex });
        }
      }
      let eweLambs = 0;
      for (const m of sheepMobsOf(farm))
        eweLambs += m.sheep
          .filter((x) => x.weaned && x.age < 365 && x.sex === 'F')
          .reduce((t, x) => t + x.n, 0);
      let surplus = Math.max(0, eweLambs - keep);
      for (const m of sheepMobsOf(farm)) {
        if (surplus <= 0) break;
        const n = m.sheep
          .filter((x) => x.weaned && x.age < 365 && x.sex === 'F')
          .reduce((t, x) => t + x.n, 0);
        const k = Math.min(n, surplus);
        if (k) farm = must(farm, { type: 'sellSheep', mob: m.id, cls: 'weaner', qty: k, sex: 'F' });
        surplus -= k;
      }
      for (const m of sheepMobsOf(farm)) {
        const old = m.sheep
          .filter((x) => x.sex === 'F' && x.weaned && x.age >= START_FLOCK.castForAge * 365)
          .reduce((t, x) => t + x.n, 0);
        // `sellSheep` takes the oldest ewes first.
        if (old)
          farm = must(farm, { type: 'sellSheep', mob: m.id, cls: 'ewe', qty: old, sex: 'F' });
      }
      if (measured) y.sales += (farm.year.sheepSales ?? 0) - before;
    }
    if (measured) {
      y.buys += Math.max(0, (farm.year.sheepBuys ?? 0) - buys0);
    }
  }
  y.dse = dseDays / 365;
  y.ewes = sheepMobsOf(farm).reduce((t, m) => Math.max(t, m.join?.joined ?? 0), 0);
  y.stockChange = sheepWorth(sheepMobsOf(farm), sheepIndicatorsOf(farm)) - worth0;
  y.margin =
    y.sales +
    y.wool +
    y.stockChange -
    y.buys -
    y.shearing -
    y.crutching -
    y.health -
    y.rams -
    y.feed;
  y.perDse = y.margin / y.dse;
  return y;
}
