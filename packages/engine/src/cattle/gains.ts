/**
 * What cattle would gain on an area's feed, and why a class is not gaining.
 *
 * These are the MVP's gainOn, gainWhy and predictGains, matched number for
 * number. The MVP wrote the reasons as a sentence. Here they are data, so
 * every warning can say why (CLAUDE.md, rule 5) in wording the screens own.
 */

import { MILK, YOUNG_GAIN_COST, type CattleClassId } from '../data/cattle';
import type { Supplement } from '../data/feed';
import { clamp } from '../num';
import { meFromDmd } from '../pasture/quality';
import { classOf } from './animal';
import { AVAIL_KG_HA, dietOf, intakeOf, type Diet } from './graze';
import type { GainForecast, GainReason } from './notes';
import type { Animal, CattleMob, GrazingArea, GrazingLand } from './types';

/**
 * Milk energy a cow gives, MJ a day. Her feed does not cut it directly: she
 * pays for her milk in her energy needs (milk / 0.65), so on poor feed she
 * milks off her back and loses condition, and her milk falls away as she
 * gets thin, to nothing at `MILK.stopCS` (engine 0.14.0). The MVP cut milk
 * by a share of the feed's ME, to 45% at ME 7.35 or less, which left calves
 * short on ordinary dry feed (docs/CALIBRATION.md, the m2.5 entry).
 */
export function milkMJ(a: Animal): number {
  return (
    24 *
    (a.lact < 60 ? 1 : Math.max(0, 1 - (a.lact - 60) / 220)) *
    clamp(0.55 + 0.15 * a.cond, 0.6, 1.2) *
    clamp((a.cond - MILK.stopCS) / (MILK.fullCS - MILK.stopCS), 0, 1)
  );
}

/** The most weight an animal loses in a day, kg (the MVP's floor on a day's gain). */
export const MOST_LOSS_KG = 1.5;

/** The energy a day's loss at that floor stands for, MJ (a kg of loss gives 22 MJ). */
export const MOST_LOSS_MJ = -MOST_LOSS_KG * 22;

/**
 * How much of today's milk, MJ, a cow cannot pay for. Her loss stops at
 * MOST_LOSS_KG a day, so energy past that would come from nothing; that
 * much milk (at 0.65 MJ of milk for each MJ she spends) is not made.
 * `bal` is her energy balance with the full milk counted, MJ (engine
 * 0.14.0; the MVP made the milk anyway).
 */
export function unpaidMilk(milk: number, bal: number): number {
  if (milk <= 0 || bal >= MOST_LOSS_MJ) return 0;
  return Math.min(milk, (MOST_LOSS_MJ - bal) * 0.65);
}

/**
 * MJ of ME for each kg an animal of this live weight gains (YOUNG_GAIN_COST).
 * From 200 kg it is the MVP's 20 + 0.045 x LW for every animal. Lighter
 * animals pay the measured calf figure, moving to the grown figure in a
 * straight line from 100 to 200 kg. The MVP charged a 60 kg calf the grown
 * figure, about twice what was measured (BUILD_PLAN 2.4: fixed, not copied).
 */
export function mjPerKgGain(wt: number): number {
  const grown = 20 + 0.045 * wt;
  if (wt >= YOUNG_GAIN_COST.grownFromKg) return grown;
  const young = YOUNG_GAIN_COST.mjPerKg075 * Math.pow(wt, 0.75);
  if (wt <= YOUNG_GAIN_COST.youngToKg) return young;
  const t =
    (wt - YOUNG_GAIN_COST.youngToKg) / (YOUNG_GAIN_COST.grownFromKg - YOUNG_GAIN_COST.youngToKg);
  return young + (grown - young) * t;
}

/** Under this share of their fill on offer, "not enough feed" is a reason a class is not gaining. */
export const NOT_ENOUGH_FEED_AVAIL = 0.75;

/**
 * The feed, kg DM/ha, under which cattle can not get that share of their
 * fill: about 900 kg DM/ha. Worked out from the two figures above, so the
 * words on the screens always match the model.
 */
export const FEED_SHORT_KG_HA = -AVAIL_KG_HA * Math.log(1 - NOT_ENOUGH_FEED_AVAIL);

/** Expected weight change, kg a day, for one animal on a diet with its fill of feed. */
export function gainOn(a: Animal, diet: Diet, supp: Supplement): number {
  const it = intakeOf(a, diet, supp, false);
  const mei = it.past * meFromDmd(diet.dmd) + it.sKg * it.sME;
  const m75 = Math.pow(a.wt, 0.75);
  let req = 0.45 * m75 * (1.05 + 0.12 * Math.min(1, diet.dist / 3000));
  if (a.preg > 190) req += (0.13 * m75 * (a.preg - 190)) / 93;
  if (a.lact >= 0 && a.calf) req += milkMJ(a) / 0.65;
  const cap = a.kind === 'steer' ? 1.6 : a.kind === 'bull' ? 1.4 : 1.1;
  const bal = mei - req;
  return clamp(bal > 0 ? bal / mjPerKgGain(a.wt) : bal / 22, -1.5, cap);
}

/** Up to two reasons an animal is not gaining on this feed, most basic first. */
export function gainWhy(a: Animal, diet: Diet, supp: Supplement): GainReason[] {
  const it = intakeOf(a, diet, supp, false);
  const meF = meFromDmd(diet.dmd);
  const why: GainReason[] = [];
  if (diet.avail < NOT_ENOUGH_FEED_AVAIL) why.push({ reason: 'notEnoughFeed', mass: diet.mass });
  if (meF < 8) why.push({ reason: 'lowMe', me: meF });
  if (diet.cp < 7 && supp !== 'lick') why.push({ reason: 'lowProtein' });
  if (a.lact >= 0 && a.calf) {
    const milk = milkMJ(a);
    why.push({ reason: 'milking', milkMJ: milk / 0.65, ownMJ: 0.45 * Math.pow(a.wt, 0.75) });
  }
  if (a.preg > 190) why.push({ reason: 'latePregnancy' });
  if (!why.length) why.push({ reason: 'justShort', intake: it.past, me: meF });
  return why.slice(0, 2);
}

/**
 * The expected gain for each class in a mob if it grazed this area today,
 * calves left out. Does not change the pasture.
 */
export function predictGains(
  m: CattleMob,
  land: GrazingLand,
  area: GrazingArea,
  /**
   * How to group the cattle. The live class by default (tests, the old
   * game); the screens pass `recordClassOf`, so the lines never move on the
   * day a cow conceives.
   */
  classify: (a: Animal) => CattleClassId = classOf,
): GainForecast[] {
  const diet = dietOf(land, area).diet;
  const groups = new Map<CattleClassId, Animal[]>();
  for (const a of m.animals) {
    if (a.kind === 'calf') continue;
    const cls = classify(a);
    const list = groups.get(cls);
    if (list) list.push(a);
    else groups.set(cls, [a]);
  }
  return [...groups].map(([cls, list]) => {
    const gain = list.reduce((s, a) => s + gainOn(a, diet, m.supp), 0) / list.length;
    return { cls, n: list.length, gain, why: gain < 0.05 ? gainWhy(list[0]!, diet, m.supp) : [] };
  });
}
