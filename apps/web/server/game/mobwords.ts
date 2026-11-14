import 'server-only';
import type { GainForecast, GainReason } from '@gg/engine';

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

export const SUPP_LABEL = { none: 'None', lick: 'Lick', hay: 'Hay', pellet: 'Pellets' } as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: { year: number; month: number; date: number }): string =>
  `${d.date} ${MONTHS[d.month]} ${d.year}`;
const pct = (share: number): string => `${Math.round(share * 100)}%`;

type Date3 = { year: number; month: number; date: number };

export interface BreedingInputs {
  /** The joining under way, from its start, or null. Its length is the engine's `JOINING_DAYS`. */
  joining: { start: Date3; end: Date3; days: number; reportDays: number; ended: boolean } | null;
  /** The latest joining report, with the date it was made, or null. */
  report: {
    date: Date3;
    weeks: number;
    conceived: number;
    inCalf: number;
    females: number;
  } | null;
  /** The latest preg test, with the date it was made, or null. */
  pregTest: {
    date: Date3;
    inCalf: number;
    females: number;
    rate: number;
    dry: number;
    tooSoon: number;
  } | null;
  knownCows: number;
  knownHeifers: number;
}

/**
 * The breeding lines on the mob card: only what the player has been told,
 * by a joining report, a preg test or the saleyard, each with its date.
 * Nothing here changes on a day with no report (CLAUDE.md rule 14).
 */
export function breedingLines(i: BreedingInputs): string[] {
  const out: string[] = [];
  const j = i.joining;
  if (j) {
    const weeks = Math.round(j.days / 7);
    out.push(
      j.ended
        ? `Joining: ${day(j.start)} to ${day(j.end)} (${weeks} weeks). It has ended.`
        : `Joining: ${day(j.start)} to ${day(j.end)} (${weeks} weeks). A report comes every ${Math.round(j.reportDays / 7)} weeks.`,
    );
  }
  const r = i.report;
  if (r) {
    out.push(
      `Joining report, ${r.weeks} weeks in (${day(r.date)}): ${r.inCalf} of ${plural(r.females, 'female')} in calf, ${r.conceived} in the 3 weeks before it.`,
    );
  }
  const p = i.pregTest;
  if (p) {
    const soon =
      p.tooSoon > 0 ? ` ${plural(p.tooSoon, 'female')} calved too recently to tell.` : '';
    out.push(
      `Preg test (${day(p.date)}): ${p.inCalf} of ${plural(p.females, 'female')} in calf (${pct(p.rate)}). ${p.dry} not in calf.${soon}`,
    );
  }
  if (i.knownCows + i.knownHeifers > 0) {
    out.push(
      `Known in calf now: ${plural(i.knownCows, 'cow')} and ${plural(i.knownHeifers, 'heifer')}.`,
    );
  }
  return out;
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
