import 'server-only';
import {
  dateOn,
  liveYear,
  netWorth,
  type FarmState,
  type YearRecord,
  type YearScore,
  type YearTotals,
} from '@gg/engine';
import type { OverWire, ScorePartWire, SetupChoices, YearView } from '../../lib/game/types';
import { gameOverWord } from './words';

/*
 * A farm year as words and figures for the year end card and the Scores
 * panel. Everything is worked out and rounded here. The browser gets the
 * finished numbers and sentences, never the weights behind the score.
 */

const round = (n: number): number => Math.round(n);
const n0 = (n: number): string => Math.round(n).toLocaleString('en-AU');
const dollars = (n: number): string => `${n < 0 ? '-' : ''}$${n0(Math.abs(n))}`;
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n0(n)} ${n === 1 ? one : many}`;

/** A year's totals with the figures that are only known when it is over or taken as if over. */
type Closed = YearTotals & { worth1: number; score: YearScore };

/** The five parts of a score, in the order shown. Points are whole numbers. */
export function scoreParts(s: YearScore): ScorePartWire[] {
  return [
    { key: 'profit', label: 'Profit', pts: round(s.profitPts) },
    { key: 'gain', label: 'Weight gain', pts: round(s.gainPts) },
    { key: 'util', label: 'Pasture use', pts: round(s.utilPts) },
    { key: 'cover', label: 'Ground cover', pts: round(s.coverPts) },
    { key: 'death', label: 'Deaths', pts: round(s.deathPts) },
  ];
}

/** Plain sentences from the year's figures. */
export function yearFacts(y: Closed): string[] {
  const out = [`Net worth went from ${dollars(y.worth0)} to ${dollars(y.worth1)}.`];
  out.push(
    y.gain < 0
      ? `Cattle lost ${n0(-y.gain)} kg of live weight, birth weights included.`
      : `Cattle gained ${n0(y.gain)} kg of live weight, birth weights included.`,
  );
  out.push(`${plural(y.births, 'birth')}. ${plural(y.deaths, 'death')}.`);
  // Tonnes, with both totals. What was eaten can top what grew (feed carried over counts as eaten),
  // so no percentage is shown. The score uses its own figure, uncapped.
  if (y.grown > 0 || y.eaten > 0) {
    out.push(
      `${n0(y.grown / 1000)} t DM of pasture grew. The cattle ate ${n0(y.eaten / 1000)} t DM.`,
    );
    if (y.eaten > y.grown) out.push('They ate feed carried over from before the year as well.');
  }
  // With no monthly readings yet the figure is today's cover, not an average.
  out.push(
    y.covers.length === 0
      ? `Ground cover is ${n0(y.score.cover)}% today.`
      : `Ground cover averaged ${n0(y.score.cover)}%.`,
  );
  return out;
}

/** The year's money, in (positive) and out (negative). Rows that are zero are left out. */
export function yearMoney(y: YearTotals): { label: string; dollars: number }[] {
  const rows: { label: string; dollars: number }[] = [
    { label: 'Cattle sales', dollars: y.sales },
    { label: 'Cattle bought', dollars: -y.buys },
    { label: 'Supplements', dollars: -y.feed },
    { label: 'Grain', dollars: y.grain },
    { label: 'Crops', dollars: -y.crops },
    { label: 'Infrastructure', dollars: -y.infra },
    { label: 'Running costs', dollars: -y.running },
    { label: 'Interest', dollars: y.interest },
  ];
  return rows.map((r) => ({ ...r, dollars: round(r.dollars) })).filter((r) => r.dollars !== 0);
}

/** "Year 3", with the real year it began in when the farm plays real years. */
function titleOf(
  farm: FarmState,
  setup: SetupChoices,
  n: number,
  start: number,
  real?: number,
): string {
  if (setup.years === 'random') return `Year ${n}`;
  return `Year ${n} · ${real ?? dateOn(farm, start).year}`;
}

function viewOf(
  farm: FarmState,
  setup: SetupChoices,
  n: number,
  y: Closed,
  realYear?: number,
): YearView {
  return {
    n,
    title: titleOf(farm, setup, n, y.start, realYear),
    total: y.score.total,
    parts: scoreParts(y.score),
    facts: yearFacts(y),
    money: yearMoney(y),
  };
}

/** A finished year. */
export function yearView(farm: FarmState, setup: SetupChoices, rec: YearRecord): YearView {
  return viewOf(farm, setup, rec.n, rec, rec.realYear);
}

/** The year under way, as if it closed today. */
export function soFarView(farm: FarmState, setup: SetupChoices): YearView {
  return viewOf(farm, setup, farm.years.length + 1, liveYear(farm));
}

/** Finished years, newest first. */
export function pastYears(farm: FarmState, setup: SetupChoices): YearView[] {
  return farm.years.map((r) => yearView(farm, setup, r)).reverse();
}

/** The live year's number and score, for the line on the More menu. */
export function liveScore(farm: FarmState): { year: number; total: number } {
  return { year: farm.years.length + 1, total: liveYear(farm).score.total };
}

/** What the game over screen needs. The year under way counts if any of it ran. */
export function overWire(
  farm: FarmState,
  over: { reason: 'bank' | 'feed'; day: number },
): OverWire {
  const years: OverWire['years'] = farm.years.map((r) => ({
    n: r.n,
    total: r.score.total,
    partDays: null,
  }));
  const live = liveYear(farm);
  if (farm.day > live.start) {
    years.push({
      n: farm.years.length + 1,
      total: live.score.total,
      partDays: farm.day - live.start,
    });
  }
  return {
    text: gameOverWord(over.reason),
    days: over.day,
    years,
    total: years.reduce((a, y) => a + y.total, 0),
    worth: round(netWorth(farm)),
  };
}
