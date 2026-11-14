/**
 * One day for one mob: it eats, gains or loses, breeds, and may die.
 *
 * This is the MVP's simMob and the deaths handling from its stepDay, matched
 * number for number (docs/MODEL.md, section 3). The order of the arithmetic
 * and of the random draws is part of the result, so keep each line as
 * written. Where the MVP stopped the clock or wrote to the diary, this
 * returns notes and events, and the caller decides what to do with them.
 *
 * The farm's daily tick runs the cattle like this, mob by mob, in order
 * (a mob made today by weaning goes on the end and has its day too):
 *
 *   1. if weaningDue(mob, byId): weanMob(mob, byId), and move the weaners to
 *      another paddock with water if there is one
 *   2. simMob(mob, inputs)
 *
 * and after the last mob: settleDeaths(mobs, deaths, byId, totals).
 *
 * MVP faults fixed here (BUILD_PLAN 2.4): the no-water count clears in the
 * feedlot, and a cow whose calf dies is dried off.
 */

import type { Supplement } from '../data/feed';
import { LOT_RATION } from '../data/feed';
import { clamp } from '../num';
import { meFromDmd } from '../pasture/quality';
import {
  CYCLE_DAYS,
  GESTATION_DAYS,
  LACTATING_CONCEPTION,
  bullCover,
  breedingNotes,
  calve,
  condConc,
  cycling,
  weanOne,
} from './breeding';
import { milkMJ, predictGains } from './gains';
import { LOT_DIET, dietOf, grazeAlloc, intakeOf, type Diet, type PlantingGraze } from './graze';
import type { CattleNote } from './notes';
import type {
  Animal,
  AnimalIds,
  AnimalLookup,
  CattleMob,
  CattleRngs,
  CattleTotals,
  GrazingArea,
  GrazingLand,
  MobDay,
} from './types';

/** Where a mob spends the day. */
export type MobPlace =
  /** In the feedlot, on the ration. */
  | { kind: 'lot' }
  | {
      kind: 'paddock';
      /** The grazing area the mob is in. */
      area: GrazingArea;
      /**
       * For a plan that moves the mob more than once a day: the areas of
       * today's stops, in order (the same area may come up twice). Areas
       * with no water are skipped. With two or more left, the day's diet is
       * their average and the day's grazing is shared equally across them.
       */
      shifts?: readonly GrazingArea[];
    };

export interface SimMobInputs {
  place: MobPlace;
  /** The farm's country. Not read for a mob in the feedlot. */
  land: GrazingLand;
  /** Today's farm day. */
  day: number;
  /** Every animal on the farm by tag number, built at the start of the day. */
  byId: AnimalLookup;
  ids: AnimalIds;
  rng: CattleRngs;
  /** Vaccines, drench and tags, dollars a head a year (HEALTH_COST_PER_HEAD_YEAR). */
  healthPerHeadYear: number;
  /** Year totals, changed in place. */
  totals: CattleTotals;
}

export type DeathCause = 'orphaned' | 'noWater' | 'poorCondition' | 'natural';

export interface Death {
  animal: Animal;
  cause: DeathCause;
}

export interface MobDayResult {
  /** The mob's figures for the day. Also kept on the mob as `st`. */
  st: MobDay;
  /**
   * Dollars of supplement or feedlot ration fed today. Take it off cash.
   * It has already been added to `totals.feed`.
   */
  feedCost: number;
  /** For a plan's report: pasture eaten (kg DM), head that had a day, and kg gained by the mob. */
  planDay: { eaten: number; headDays: number; gain: number };
  /** Animals that died today. They are flagged dead and still in the mob until settleDeaths. */
  deaths: Death[];
  /** Calves born today. They are already in the mob. */
  births: Animal[];
  /** Orphaned calves of 100 days or more that were weaned today. They stay in the mob. */
  weaned: Animal[];
  /** Notes for the player, in the order things happened. */
  notes: CattleNote[];
  /** Planted squares grazed today, for the crop model. */
  plantingGrazes: PlantingGraze[];
}

/** The diet a mob gets for the day where it is, and the ground it grazes. */
export interface DayDiet {
  diet: Diet;
  /** The area whose water counts for the day: the mob's area, or the first of the day's stops. Null in the feedlot. */
  reg: GrazingArea | null;
  /** Where the mob grazes in its area, for one area. Null for the feedlot or a day of shifts. */
  weights: Float32Array | null;
  /** The day's stops with water, for a plan that moves the mob more than once a day. */
  subs: GrazingArea[];
}

/**
 * The day's diet for a mob in a place: the ration in the feedlot; the
 * average of the day's stops with water for a plan that moves it more than
 * once a day; otherwise its area's. `simMob` and the supplement price read
 * both use this, so the price is what the day really charges.
 */
export function dayDiet(place: MobPlace, land: GrazingLand): DayDiet {
  if (place.kind === 'lot') return { diet: LOT_DIET, reg: null, weights: null, subs: [] };
  const subs = (place.shifts ?? []).filter((r) => r.hasWater);
  if (subs.length > 1) {
    const ds = subs.map((r) => dietOf(land, r).diet);
    const av = (k: keyof Diet): number => ds.reduce((t, x) => t + x[k], 0) / ds.length;
    return {
      diet: {
        dmd: av('dmd'),
        cp: av('cp'),
        mass: av('mass'),
        avail: av('avail'),
        dist: av('dist'),
      },
      reg: subs[0]!,
      weights: null,
      subs,
    };
  }
  const r = dietOf(land, place.area);
  return { diet: r.diet, reg: place.area, weights: r.weights, subs };
}

/** Run one mob's day. Changes the mob, its animals and the pasture in place. */
export function simMob(m: CattleMob, inp: SimMobInputs): MobDayResult {
  const { place, land, day, byId, totals } = inp;
  const lot = place.kind === 'lot';
  const notes: CattleNote[] = [];
  const deaths: Death[] = [];
  const births: Animal[] = [];
  const weaned: Animal[] = [];
  const plantingGrazes: PlantingGraze[] = [];

  const dd = dayDiet(place, land);
  const diet: Diet = dd.diet;
  const reg: GrazingArea | null = dd.reg;
  const weights: Float32Array | null = dd.weights;
  const subs: GrazingArea[] = dd.subs;
  if (place.kind === 'lot') {
    // The lot has water. (The MVP left the count running in the lot.)
    m.dry = 0;
  } else {
    m.dry = reg!.hasWater ? 0 : m.dry + 1;
    if (m.dry === 1) notes.push({ type: 'noWater', days: 1 });
    if (m.dry === 3) notes.push({ type: 'noWater', days: 3 });
  }

  const me = meFromDmd(diet.dmd);
  const supp: Supplement = m.supp;
  // Calves go last, so each dam's milk for today is known first.
  const order = [
    ...m.animals.filter((a) => a.kind !== 'calf'),
    ...m.animals.filter((a) => a.kind === 'calf'),
  ];
  const ints = order.map((a) => intakeOf(a, diet, supp, lot));
  let demand = 0;
  for (const it of ints) demand += it.past;
  let f = 1;
  if (!lot && demand > 0) {
    const head = m.animals.length;
    if (subs.length > 1) {
      // The day's feed comes from each shift in turn.
      let got = 0;
      for (const r of subs) {
        const w = dietOf(land, r).weights;
        got += grazeAlloc({
          land,
          area: r,
          weights: w,
          demand: demand / subs.length,
          head,
          day,
          totals,
          plantingGrazes,
        });
      }
      f = got / demand;
    } else {
      const got = grazeAlloc({
        land,
        area: reg!,
        weights: weights!,
        demand,
        head,
        day,
        totals,
        plantingGrazes,
      });
      f = got / demand;
    }
  }

  const adultBulls = order.filter((a) => a.kind === 'bull' && !a.young && !a.dead).length;
  // Unmarked young bulls are less effective, but they work.
  const youngBulls = order.filter(
    (a) => a.sex === 'M' && (a.kind === 'calf' || a.young) && a.age >= 300 && !a.dead,
  ).length;
  const females = order.filter(
    (a) => (a.kind === 'cow' || a.kind === 'heifer') && a.preg < 0,
  ).length;
  const bullF = bullCover(adultBulls, youngBulls, females);
  const walk = 0.05 + 0.12 * Math.min(1, diet.dist / 3000);
  const health = inp.healthPerHeadYear / 365;

  let sumAdgDay = 0;
  let cost = 0;
  let sumAdg = 0;
  let sumWt = 0;
  let sumCs = 0;
  let sumInt = 0;
  let sumPot = 0;
  let n = 0;
  for (let k = 0; k < order.length; k++) {
    const a = order[k]!;
    const it = ints[k]!;
    if (a.dead) continue;
    const past = it.past * f;
    let mei = past * me + it.sKg * it.sME;
    cost += it.cost;
    // Running tally for the stock book.
    a.cost = a.cost + it.cost + health;
    const W_ = a.wt;
    const m75 = Math.pow(W_, 0.75);
    let req = 0.45 * m75 * (1 + walk);
    if (a.preg > 190) req += (0.13 * m75 * (a.preg - 190)) / 93;
    if (a.lact >= 0 && a.calf) {
      a.milk = milkMJ(a, me);
      req += a.milk / 0.65;
    } else a.milk = 0;
    if (a.kind === 'calf') {
      const dam = byId.get(a.dam);
      if (dam && !dam.dead) mei += dam.milk;
    }
    const bal = mei - req;
    let gain = bal > 0 ? bal / (20 + 0.045 * W_) : bal / 22;
    const cap = a.kind === 'steer' ? 1.6 : a.kind === 'bull' ? 1.4 : a.kind === 'calf' ? 1.15 : 1.1;
    gain = clamp(gain, -1.5, cap);
    // No water: fast weight loss.
    if (m.dry > 0) gain = -W_ * 0.04;
    a.wt = Math.max(25, W_ + gain);
    const young = a.age < 900 && a.kind !== 'cow' && a.kind !== 'bull';
    // About 1 condition score is 15% of live weight. Young growing stock
    // put most of a gain into frame, not condition.
    a.cond = clamp(a.cond + (gain / (0.15 * W_)) * (gain > 0 && young ? 0.3 : 1), 1, 5);
    a.adg = a.adg * 0.93 + gain * 0.07;
    a.age++;
    totals.gain += gain;
    sumAdgDay += gain;

    // Breeding.
    if (a.kind === 'cow' || a.kind === 'heifer') {
      if (a.preg >= 0) {
        a.preg++;
        if (a.cond < 1.6 && inp.rng.breeding.chance(0.002)) {
          notes.push({ type: 'slipped', kind: a.kind, days: a.preg });
          a.preg = -1;
        } else if (a.preg >= GESTATION_DAYS) {
          calve(a, m, { ids: inp.ids, rng: inp.rng.breeding, day, totals, notes, births });
        }
      } else if (bullF > 0 && !a.barren && cycling(a)) {
        const p =
          (condConc(a.cond) * (a.lact >= 0 ? LACTATING_CONCEPTION : 1) * bullF) / CYCLE_DAYS;
        if (inp.rng.breeding.chance(p)) {
          a.preg = 0;
          if (m.join) m.join.conc++;
        }
      }
      if (a.lact >= 0) a.lact++;
    }

    // A calf with no dam: weaned if it is 100 days or older, otherwise at risk.
    if (a.kind === 'calf') {
      const dam = byId.get(a.dam);
      if (!dam || dam.dead) {
        if (a.age >= 100) {
          weanOne(a, byId);
          weaned.push(a);
        } else if (inp.rng.deaths.chance(0.02)) {
          a.dead = true;
          deaths.push({ animal: a, cause: 'orphaned' });
          continue;
        }
      }
    }

    // Deaths: mostly in very poor cattle (CS under about 1.3).
    let pd = 0.00004;
    if (a.cond < 1.4) pd += (1.4 - a.cond) * 0.015;
    // 4 days without water kills every beast.
    if (m.dry >= 4) pd = 1;
    if (inp.rng.deaths.chance(pd)) {
      a.dead = true;
      deaths.push({
        animal: a,
        cause: m.dry > 2 ? 'noWater' : a.cond < 1.6 ? 'poorCondition' : 'natural',
      });
      continue;
    }
    a.di = past + it.sKg;
    if (a.kind !== 'calf') {
      sumAdg += a.adg;
      sumWt += a.wt;
      sumCs += a.cond;
      n++;
      sumInt += past + it.sKg;
      sumPot += a.wt * (a.wt < 300 ? 0.03 : a.wt < 450 ? 0.027 : 0.024);
    }
  }

  const st: MobDay = {
    n,
    wt: n ? sumWt / n : 0,
    cs: n ? sumCs / n : 0,
    adg: n ? sumAdg / n : 0,
    me: lot ? LOT_RATION.me : me,
    cp: lot ? LOT_RATION.cp : diet.cp,
    intake: n ? sumInt / n : 0,
    pct: sumPot ? sumInt / sumPot : 0,
    f,
    mass: diet.mass,
    demand,
    dist: diet.dist,
  };
  m.st = st;
  if (cost > 0) totals.feed += cost;
  if (!lot && f < 0.7 && (m.lastShort || -99) < day - 14) {
    m.lastShort = day;
    notes.push({ type: 'shortOfFeed', f });
  }
  m.lossDays = n && st.adg < -0.05 ? m.lossDays + 1 : 0;
  if (m.lossDays === 10 && !lot) {
    const classes = predictGains(m, land, reg!).filter((g) => g.gain < 0);
    notes.push({ type: 'losingWeight', me, cp: diet.cp, classes });
  }
  breedingNotes(m, adultBulls, youngBulls, bullF, lot, day, notes);
  if (n && st.cs < 1.9 && (m.lastThin || -99) < day - 30) {
    m.lastThin = day;
    notes.push({ type: 'lowCondition', cs: st.cs });
  }

  return {
    st,
    feedCost: cost,
    planDay: { eaten: demand * f, headDays: n, gain: sumAdgDay },
    deaths,
    births,
    weaned,
    notes,
    plantingGrazes,
  };
}

/**
 * The end of the day's cattle step, after every mob has had its day: count
 * the deaths, unhook dams and calves, and take the dead out of their mobs.
 *
 * A calf whose dam died has its dam cleared, so it is treated as an orphan
 * from tomorrow. A cow whose calf died is dried off. (The MVP left her
 * milking: eating more, spending energy on milk, and slower back in calf.)
 */
export function settleDeaths(
  mobs: readonly CattleMob[],
  deaths: readonly Death[],
  byId: AnimalLookup,
  totals: CattleTotals,
): void {
  if (!deaths.length) return;
  for (const { animal: a } of deaths) {
    totals.deaths++;
    if (a.calf) {
      const c = byId.get(a.calf);
      if (c) c.dam = 0;
    }
    if (a.kind === 'calf' && a.dam) {
      const dam = byId.get(a.dam);
      if (dam && dam.calf === a.id) {
        dam.calf = 0;
        dam.lact = -1;
      }
    }
  }
  for (const m of mobs) m.animals = m.animals.filter((a) => !a.dead);
}
