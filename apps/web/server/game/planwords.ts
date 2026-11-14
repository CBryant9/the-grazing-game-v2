import 'server-only';
import type { PlanMobView, PlanNext, PlanRule, PlanReport } from '@gg/engine';

/**
 * The words for grazing plans: the rule, the rounds, where a mob is on its
 * plan and what the plan will do next. Plain Australian English, short
 * sentences, facts only (CLAUDE.md, rules 2, 5 and 11).
 */

const num = (n: number): string => Math.round(n).toLocaleString('en-AU');
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${num(n)} ${n === 1 ? one : many}`;
const one = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('en-AU');

/** How many moves a day a days rule makes: 1, or more for a rule under a day. */
export const movesADay = (every: number): number =>
  every < 1 ? Math.max(1, Math.round(1 / every)) : 1;

/** "Move every 3 days." and "Move when feed is down to 1,500 kg DM/ha, or after 14 days." */
export function ruleText(rule: PlanRule): string {
  if (rule.mode === 'days') {
    if (rule.every < 1) return `Move ${movesADay(rule.every)} times a day.`;
    if (rule.every === 1) return 'Move every day.';
    return `Move every ${one(rule.every)} days.`;
  }
  const kg = `Move when feed is down to ${num(rule.kg)} kg DM/ha`;
  return rule.maxDays > 0 ? `${kg}, or after ${plural(rule.maxDays, 'day')}.` : `${kg}.`;
}

/** "1 round", "2 rounds", "Keeps going". */
export const roundsText = (rounds: number): string =>
  rounds === 0 ? 'Keeps going' : plural(rounds, 'round');

export const afterText = (after: 'repeat' | 'stay'): string =>
  after === 'repeat'
    ? 'Then it starts again from the first paddock.'
    : 'Then the mob stays where it is.';

/** "Round 1 of 2", "Round 3", "Round 1, keeps going". */
export function roundText(inLeg: number, legRounds: number): string {
  if (legRounds === 0) return `Round ${inLeg + 1}, keeps going`;
  return `Round ${inLeg + 1} of ${legRounds}`;
}

/** "Step 2 of 3: Paddock 2". */
export const stepText = (step: number, steps: number, area: string): string =>
  `Step ${step + 1} of ${steps}: ${area}`;

/** Why a plan is paused. `because` is read from the farm's messages when they have it. */
export function pausedText(because: 'asked' | 'manual-move' | null, movedByHand: boolean): string {
  if (because === 'manual-move' || (because === null && movedByHand)) {
    return 'Paused because the mob was moved by hand. The plan does nothing until it is resumed.';
  }
  if (because === 'asked') return 'Paused. The plan does nothing until it is resumed.';
  return 'Paused. The plan does nothing until it is resumed.';
}

/** Why a plan can not move a mob now. */
export const waitingText = (area: string): string =>
  `The plan can not move the mob into ${area}, because that area has no water. It tries again each day.`;

/** What the plan will do next, as a fact. Counts of days are from the plan's own rule. */
export function nextText(next: PlanNext, farmDay: number): string {
  switch (next.kind) {
    case 'paused':
      return 'Nothing, while it is paused.';
    case 'waiting':
      return `Move into ${next.area} once it has water.`;
    case 'finish':
      return 'The next move ends the plan. The mob stays where it is.';
    case 'move': {
      if (next.rule === 'days') {
        if (next.movesADay > 1)
          return `Moves ${next.movesADay} times a day, next into ${next.area}.`;
        const left = (next.onDay ?? farmDay) - farmDay;
        if (left <= 0) return `Moves into ${next.area} when the day ends.`;
        return `Moves into ${next.area} after ${plural(left, 'more day')} here.`;
      }
      const now =
        next.massKgHa === null
          ? ''
          : ` Feed here is ${num(Math.round(next.massKgHa / 10) * 10)} kg DM/ha now.`;
      const limit =
        next.latestDay === null
          ? ''
          : next.latestDay <= farmDay
            ? ' It moves when the day ends at the latest.'
            : ` It moves within ${plural(next.latestDay - farmDay, 'day')} at the latest.`;
      return `Moves into ${next.area} when feed here is down to ${num(next.kg ?? 0)} kg DM/ha.${now}${limit}`;
    }
  }
}

/** The plan's report in sentences: moves, rounds, feed eaten and weight gained. */
export function reportLines(r: PlanMobView): string[] {
  const out = [
    `${plural(r.moves, 'move')} and ${plural(r.roundsDone, 'full round')} in ${plural(r.days, 'day')}.`,
  ];
  if (r.eatenKg > 0) {
    out.push(
      r.eatenKg >= 1000
        ? `Ate about ${one(r.eatenKg / 1000)} t of feed (DM).`
        : `Ate about ${num(r.eatenKg)} kg of feed (DM).`,
    );
  }
  if (r.headDays > 0) {
    out.push(
      r.gainKg >= 1000 || r.gainKg <= -1000
        ? `Live weight ${r.gainKg >= 0 ? 'gained' : 'lost'}: ${one(Math.abs(r.gainKg) / 1000)} t.`
        : `Live weight ${r.gainKg >= 0 ? 'gained' : 'lost'}: ${num(Math.abs(r.gainKg))} kg.`,
    );
  }
  return out;
}

/** A plan report from a finished plan (the engine's own report). */
export function finishedLines(r: PlanReport): string {
  return `${plural(r.moves, 'move')}, ${plural(r.rounds, 'round')}.`;
}

/** The sentence a plan move makes: for the day card and the inbox. */
export function movedText(e: {
  mobName: string;
  from: string | null;
  to: string;
  because: 'days' | 'kg' | 'max-days';
  massKgHa: number | null;
  movesADay: number;
}): string {
  const from = e.from ? ` from ${e.from}` : '';
  const why =
    e.because === 'kg' && e.massKgHa !== null
      ? ` Feed there was down to ${num(Math.round(e.massKgHa / 10) * 10)} kg DM/ha.`
      : e.because === 'max-days'
        ? ' It reached the plan’s day limit.'
        : '';
  return `${e.mobName} moved${from} to ${e.to}, by its grazing plan.${why}`;
}
