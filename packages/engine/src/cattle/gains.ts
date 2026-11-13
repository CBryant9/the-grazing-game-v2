/**
 * What cattle would gain on an area's feed, and why a class is not gaining.
 *
 * These are the MVP's gainOn, gainWhy and predictGains, matched number for
 * number. The MVP wrote the reasons as a sentence. Here they are data, so
 * every warning can say why (CLAUDE.md, rule 5) in wording the screens own.
 */

import type { CattleClassId } from '../data/cattle';
import type { Supplement } from '../data/feed';
import { clamp } from '../num';
import { meFromDmd } from '../pasture/quality';
import { classOf } from './animal';
import { dietOf, intakeOf, type Diet } from './graze';
import type { GainForecast, GainReason } from './notes';
import type { Animal, CattleMob, GrazingArea, GrazingLand } from './types';

/** Milk energy a cow gives, MJ a day, on feed of the given ME. Poor feed means less milk. */
export function milkMJ(a: Animal, me: number): number {
  return (
    24 *
    (a.lact < 60 ? 1 : Math.max(0, 1 - (a.lact - 60) / 220)) *
    clamp(0.55 + 0.15 * a.cond, 0.6, 1.2) *
    clamp((me - 6) / 3, 0.45, 1)
  );
}

/** Expected weight change, kg a day, for one animal on a diet with its fill of feed. */
export function gainOn(a: Animal, diet: Diet, supp: Supplement): number {
  const it = intakeOf(a, diet, supp, false);
  const mei = it.past * meFromDmd(diet.dmd) + it.sKg * it.sME;
  const m75 = Math.pow(a.wt, 0.75);
  let req = 0.45 * m75 * (1.05 + 0.12 * Math.min(1, diet.dist / 3000));
  if (a.preg > 190) req += (0.13 * m75 * (a.preg - 190)) / 93;
  if (a.lact >= 0 && a.calf) req += milkMJ(a, meFromDmd(diet.dmd)) / 0.65;
  const cap = a.kind === 'steer' ? 1.6 : a.kind === 'bull' ? 1.4 : 1.1;
  const bal = mei - req;
  return clamp(bal > 0 ? bal / (20 + 0.045 * a.wt) : bal / 22, -1.5, cap);
}

/** Up to two reasons an animal is not gaining on this feed, most basic first. */
export function gainWhy(a: Animal, diet: Diet, supp: Supplement): GainReason[] {
  const it = intakeOf(a, diet, supp, false);
  const meF = meFromDmd(diet.dmd);
  const why: GainReason[] = [];
  if (diet.avail < 0.75) why.push({ reason: 'notEnoughFeed', mass: diet.mass });
  if (meF < 8) why.push({ reason: 'lowMe', me: meF });
  if (diet.cp < 7 && supp !== 'lick') why.push({ reason: 'lowProtein' });
  if (a.lact >= 0 && a.calf) {
    const milk = milkMJ(a, meF);
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
export function predictGains(m: CattleMob, land: GrazingLand, area: GrazingArea): GainForecast[] {
  const diet = dietOf(land, area).diet;
  const groups = new Map<CattleClassId, Animal[]>();
  for (const a of m.animals) {
    if (a.kind === 'calf') continue;
    const cls = classOf(a);
    const list = groups.get(cls);
    if (list) list.push(a);
    else groups.set(cls, [a]);
  }
  return [...groups].map(([cls, list]) => {
    const gain = list.reduce((s, a) => s + gainOn(a, diet, m.supp), 0) / list.length;
    return { cls, n: list.length, gain, why: gain < 0.05 ? gainWhy(list[0]!, diet, m.supp) : [] };
  });
}
