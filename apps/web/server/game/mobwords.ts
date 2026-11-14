import 'server-only';
import type { GainForecast, GainReason } from '@gg/engine';
import { NO_WATER_WHY } from './words';

/**
 * The words on the mob card and the move and supplement job cards. Plain
 * Australian English, short sentences, facts only. Nothing here says what
 * the player should do, and nothing praises or criticises (CLAUDE.md,
 * rules 2, 5 and 11).
 */

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The sentence for one reason the engine gives for a class not gaining. Facts, with the figure. */
export function reasonWord(r: GainReason): string {
  switch (r.reason) {
    case 'notEnoughFeed':
      return `There is not enough feed where they graze: about ${Math.round(r.mass / 10) * 10} kg DM/ha.`;
    case 'lowMe':
      return `The feed is low in energy: ME ${r.me.toFixed(1)} MJ/kg.`;
    case 'lowProtein':
      return 'The feed is under 7% CP, so they eat less.';
    case 'milking':
      return `Cows with calves put about ${Math.round(r.milkMJ)} MJ a day into milk, on top of about ${Math.round(r.ownMJ)} MJ for themselves.`;
    case 'latePregnancy':
      return 'Cows and heifers in late pregnancy need more energy.';
    case 'justShort':
      return `They eat about ${r.intake.toFixed(1)} kg DM a head a day of feed at ME ${r.me.toFixed(1)} MJ/kg, which is just short of what they need.`;
  }
}

export interface WhyInputs {
  name: string;
  area: string | null;
  where: 'paddock' | 'lot' | 'yards';
  hasWater: boolean;
  dryDays: number;
  /** Average gain, kg a head a day, or null before the mob's first day. */
  adg: number | null;
  /** Share of the pasture the mob wanted that the area supplied, 0 to 1. Null off pasture. */
  fed: number | null;
  /** The engine's reasons for each class that is not gaining. */
  forecasts: readonly GainForecast[];
}

/**
 * Why a mob is losing weight, or short of feed or water, in plain sentences
 * built from the engine's own reasons. It states facts. It never says what
 * to do.
 */
export function mobWhy(i: WhyInputs): string[] {
  const out: string[] = [];
  if (i.where === 'paddock' && (!i.hasWater || i.dryDays > 0)) {
    out.push(
      `${i.name} has no water${i.area ? ` in ${i.area}` : ''}.${i.dryDays > 0 ? ` ${plural(i.dryDays, 'day')} without so far.` : ''}`,
    );
  }
  if (i.adg !== null && i.adg < -0.05) {
    out.push(`${i.name} is losing about ${Math.abs(i.adg).toFixed(2)} kg a head a day.`);
  } else if (i.adg !== null && i.adg < 0.05 && i.where === 'paddock') {
    out.push(`${i.name} is not gaining weight (${i.adg.toFixed(2)} kg a head a day).`);
  }
  if (i.fed !== null && i.fed < 0.9) {
    out.push(`The paddock gave the mob ${Math.round(i.fed * 100)}% of the feed it wanted.`);
  }
  const seen = new Set<string>();
  for (const f of i.forecasts) {
    for (const r of f.why) {
      const text = reasonWord(r);
      if (!seen.has(text)) {
        seen.add(text);
        out.push(text);
      }
    }
  }
  return out;
}

/**
 * The sale groups' names on the screens. Nothing calls a cow "empty" or "not
 * in calf": a cow that is not PTIC on the record is just a cow (Claudia,
 * 14 Nov 2026). The engine's GROUPS keep the old game's words for its
 * comparison.
 */
export const GROUP_NAME = {
  steer: 'Steers',
  heifer: 'Heifers',
  heiferP: 'Heifers (PTIC)',
  cowP: 'Cows (PTIC)',
  cowE: 'Cows',
  bull: 'Bulls',
} as const;

export const SUPP_LABEL = { none: 'None', lick: 'Lick', hay: 'Hay', pellet: 'Pellets' } as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: { year: number; month: number; date: number }): string =>
  `${d.date} ${MONTHS[d.month]} ${d.year}`;

type Date3 = { year: number; month: number; date: number };

export interface BreedingInputs {
  /** The joining under way, from the day the bulls went in, or null. Its length is the engine's `JOINING_DAYS`. */
  joining: { start: Date3; end: Date3; days: number; ended: boolean } | null;
  /** "31 PTIC, 2 to 4 months in calf.", or null with none PTIC. */
  ptic: string | null;
}

/**
 * Head PTIC on the record and how far along, in whole months: "31 PTIC, 2 to
 * 4 months in calf." Null with none. The months are for PTIC females only.
 */
export function pticWords(
  ptic: { cows: number; heifers: number },
  months: { least: number; most: number } | null,
): string | null {
  const n = ptic.cows + ptic.heifers;
  if (n <= 0 || !months) return null;
  const who =
    ptic.cows > 0 && ptic.heifers > 0
      ? ` (${plural(ptic.cows, 'cow')}, ${plural(ptic.heifers, 'heifer')})`
      : '';
  const along =
    months.least === months.most
      ? plural(months.least, 'month')
      : `${months.least} to ${months.most} months`;
  return `${n} PTIC${who}, ${along} in calf.`;
}

/**
 * The breeding lines on the mob card: the joining's dates, and the head PTIC
 * on the record with how far along they are. A female is PTIC from the
 * engine's PTIC_DAYS in calf; before that she is listed as a cow or heifer.
 */
export function breedingLines(i: BreedingInputs): string[] {
  const out: string[] = [];
  const j = i.joining;
  if (j) {
    const weeks = Math.round(j.days / 7);
    out.push(
      j.ended
        ? `Joining: bulls in ${day(j.start)} to ${day(j.end)} (${weeks} weeks). It has ended.`
        : `Joining: bulls in from ${day(j.start)} to ${day(j.end)} (${weeks} weeks).`,
    );
  }
  if (i.ptic) out.push(i.ptic);
  return out;
}

/** A water job would leave a mob with none: the fact, and why it matters. */
export function lostWaterNote(mob: string, area: string | null): string {
  return `After this, ${mob} has no water${area ? ` in ${area}` : ''}. ${NO_WATER_WHY}`;
}

/** The notes a move job card carries beyond the engine's own: water, and a mob already there. */
export function moveNotes(
  area: string,
  hasWater: boolean,
  others: { name: string; head: number }[],
): string[] {
  const notes: string[] = [];
  if (!hasWater) notes.push(`${area} has no water.`);
  for (const o of others) {
    notes.push(
      `${o.name} (${plural(o.head, 'head', 'head')}) is in ${area}. The two mobs will join.`,
    );
  }
  return notes;
}

/** Why a husbandry button is off, in plain words. */
export const REASON = {
  noCalvesToMark: 'No bull calves or young bulls to mark.',
  noCalvesToWean: 'No calves old enough to wean.',
  nothingToSell: 'No cattle here that are free to sell.',
  noSuppYards: 'Supplements are for mobs in a paddock. This mob is in the stock yards.',
  noSuppLot: 'Supplements are for mobs in a paddock. This mob is in the feedlot.',
} as const;
