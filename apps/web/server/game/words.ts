import 'server-only';
import { SPECIES, type FarmEvent, type SkipStop, type ThingToDo } from '@gg/engine';
import type { TodoWire } from '../../lib/game/types';

/**
 * The words for what the engine reports. Plain Australian English, short
 * sentences, facts only: nothing here praises or criticises (CLAUDE.md,
 * rules 2 and 11).
 */

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;

const FENCE_WORD = { electric: 'electric', tape: 'tape' } as const;

/** A stable key for a thing to do, so the browser can name it and the server can find it again. */
export function todoKey(t: ThingToDo): string {
  switch (t.type) {
    case 'calves-to-mark':
    case 'no-water':
    case 'plan-waiting':
    case 'in-yards':
      return `${t.type}:${t.mob}`;
    case 'crop-ready':
      return `${t.type}:${t.fieldId}`;
    case 'fence-down':
      return `${t.type}:${t.edge.line}${t.edge.index}`;
    case 'trough-empty':
    case 'trough-low':
      return `${t.type}:${t.portId}`;
  }
}

export function todoWire(t: ThingToDo): TodoWire {
  const key = todoKey(t);
  const button = (label: string): string | null => (t.action ? label : null);
  switch (t.type) {
    case 'calves-to-mark': {
      const bulls = t.youngBulls > 0 ? ` and ${plural(t.youngBulls, 'young bull')}` : '';
      return {
        key,
        text: `${t.mobName} has ${plural(t.count, 'calf', 'calves')} to mark${bulls}.`,
        button: button('Mark calves'),
        urgent: false,
      };
    }
    case 'no-water':
      return {
        key,
        text: `${t.mobName} has no water${t.area ? ` in ${t.area}` : ''}. ${plural(t.dryDays, 'day')} without so far. Cattle die on the fourth day without water.`,
        button: null,
        urgent: true,
      };
    case 'plan-waiting':
      return {
        key,
        text: `${t.mobName}'s grazing plan can not move it into ${t.area}, because that area has no water. The plan tries again each day.`,
        button: button('Pause plan'),
        urgent: false,
      };
    case 'crop-ready':
      return {
        key,
        text: `A crop of ${SPECIES[t.sp].short} is ready to harvest, ${Math.round(t.count * 10) / 10} ha.`,
        button: button('Harvest'),
        urgent: false,
      };
    case 'in-yards':
      return {
        key,
        text: `${t.mobName} (${plural(t.count, 'head', 'head')}) is in the stock yards, ${plural(t.days, 'day')} so far. The yards have water and almost no feed.`,
        button: null,
        urgent: false,
      };
    case 'fence-down':
      return {
        key,
        text: `A ${FENCE_WORD[t.fence]} fence is down.`,
        button: button('Put it back up'),
        urgent: false,
      };
    case 'trough-empty':
      return {
        key,
        text: 'A portable trough is empty.',
        button: button('Refill it'),
        urgent: true,
      };
    case 'trough-low':
      return {
        key,
        text: `A portable trough has ${Math.round(t.count).toLocaleString('en-AU')} litres left.`,
        button: button('Refill it'),
        urgent: false,
      };
  }
}

const CAUSE: Record<string, string> = {
  noWater: 'no water',
  poorCondition: 'poor condition',
  orphaned: 'orphaned calves',
  natural: 'natural causes',
};

export function causeWord(cause: string): string {
  return CAUSE[cause] ?? cause;
}

/** Why a skip stopped early, as a fact. */
export function stopWord(s: SkipStop): string {
  switch (s.type) {
    case 'no-water':
      return s.when === 'before'
        ? `${s.mobName} has no water${s.area ? ` in ${s.area}` : ''}, so nothing was run.`
        : `${s.mobName} had its first day without water${s.area ? ` in ${s.area}` : ''}.`;
    case 'trough-low':
      return `A portable trough has about ${plural(s.daysLeft, 'day')} of water left, so nothing was run.`;
    case 'trough-empty':
      return `A portable trough in ${s.paddock} ran dry.`;
    case 'harvest-ready':
      return 'A crop is ready to harvest.';
    case 'year-end':
      return `Year ${s.year} of the farm has ended.`;
    case 'game-over':
      return gameOverWord(s.reason);
    case 'plan-waiting':
      return `${s.mobName}'s grazing plan could not move it into ${s.area}, because that area has no water.`;
  }
}

export function gameOverWord(reason: 'bank' | 'feed'): string {
  return reason === 'bank'
    ? 'The bank has taken the farm. Cash went past the limit.'
    : 'The whole farm was eaten out for ten days with cattle on it. The game is over.';
}

/** A few lines for the inbox: only the events that have words here. */
export function inboxWord(e: FarmEvent): string | null {
  switch (e.type) {
    case 'births':
      return `${e.mobName}: ${plural(e.count, 'calf', 'calves')} born.`;
    case 'deaths':
      return `${e.mobName}: ${plural(e.count, 'head', 'head')} died, from ${causeWord(e.cause)}.`;
    case 'breakout':
      return `${e.mobName} pushed through a fence in ${e.area}, because they were ${e.reason}.`;
    case 'no-water':
      return `${e.mobName} has no water in ${e.area}.`;
    case 'out-of-feed':
      return `The farm has about ${plural(e.daysLeft, 'day')} of feed left.`;
    case 'new-season':
      return `New season: ${e.label}.`;
    case 'calves-marked':
      return `${e.mobName}: ${plural(e.count, 'calf', 'calves')} marked.`;
    case 'harvested':
      return `Harvested ${Math.round(e.t * 10) / 10} t of ${SPECIES[e.sp].short}.`;
    case 'cattle-arrived':
      return 'Bought cattle have arrived in the stock yards.';
    case 'game-over':
      return gameOverWord(e.reason);
    default:
      return null;
  }
}

/** What a done action did, in a sentence, from the events it made. */
export function doneWord(events: readonly FarmEvent[]): string {
  const parts: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'calves-marked':
        parts.push(`${plural(e.count, 'calf', 'calves')} marked in ${e.mobName}.`);
        break;
      case 'harvested':
        parts.push(
          `Harvested ${Math.round(e.t * 10) / 10} t of ${SPECIES[e.sp].short}, worth ${money(e.value)}.`,
        );
        break;
      case 'mob-moved':
        parts.push(`${e.mobName} moved.`);
        break;
      case 'weaned':
        parts.push(`${plural(e.count, 'calf', 'calves')} weaned from ${e.mobName}.`);
        break;
      case 'plan-paused':
        parts.push('The plan is paused.');
        break;
      case 'plan-cleared':
        parts.push('The mob is off its plan.');
        break;
      case 'layout-job':
        parts.push('Done.');
        break;
      default:
        break;
    }
  }
  return parts.length ? [...new Set(parts)].join(' ') : 'Done.';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Nov 2026". */
export function dateText(d: { year: number; month: number; date: number }): string {
  return `${d.date} ${MONTHS[d.month]} ${d.year}`;
}
