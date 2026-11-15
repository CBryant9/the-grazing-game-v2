import 'server-only';
import {
  FEED_FLOOR_KG_HA,
  MARKET_CLASSES,
  MARKET_WEIGHTS,
  SPECIES,
  todoKey as engineTodoKey,
  type FarmEvent,
  type MarketClassId,
  type SkipStop,
  type ThingToDo,
} from '@gg/engine';
import type { TodoWire } from '../../lib/game/types';
import { layoutWord } from './buildwords';
import { labourMessage, type DateOf } from './labourwords';
import { waitWhyWord } from './planwords';
import { isSheepEvent, sheepMessage } from './sheepwords';

/** Why water matters, as a fact. Said in the things to do and on the paddock sheet: written once, here. */
export const NO_WATER_WHY = 'Cattle die on the fourth day without water.';

/**
 * The words for what the engine reports. Plain Australian English, short
 * sentences, facts only: nothing here praises or criticises (CLAUDE.md,
 * rules 2 and 11).
 */

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;

const SUPP_WORD = { none: 'no supplement', lick: 'lick', hay: 'hay', pellet: 'pellets' } as const;

const FENCE_WORD = { electric: 'electric', tape: 'tape' } as const;

/** A stable key for a thing to do, so the browser can name it and the server can find it again. The engine's own. */
export const todoKey = (t: ThingToDo): string => engineTodoKey(t);

/** Signed whole dollars: "-$12,400". */
export const signedMoney = (n: number): string => `${n < 0 ? '-' : ''}${money(n)}`;

/** A market class with its weights, from the market's own split: "yearling steers (280 to 450 kg)". */
export function classWithWeight(cls: MarketClassId): string {
  const W = MARKET_WEIGHTS;
  const name = MARKET_CLASSES[cls].toLowerCase();
  switch (cls) {
    case 'wean':
    case 'wheif':
      return `${name} (under ${W.weanerUnderKg} kg)`;
    case 'feed':
      return `${name} (${W.weanerUnderKg} to ${W.heavyFromKg} kg)`;
    case 'heavy':
      return `${name.replace(' (bullocks)', '')} (${W.heavyFromKg} kg and over)`;
    case 'heifer':
      return `${name} (${W.weanerUnderKg} kg and over)`;
    default:
      return name;
  }
}

const away = (days: number): string =>
  days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;

/**
 * The bank fact, the same in the inbox, Things to do and a skip that stopped: the cash, the
 * bank's limit and the head on the farm. Facts only, with no pointer to what to do about it.
 */
export function bankWords(level: 1 | 2, cash: number, limit: number, head: number): string {
  const first =
    level === 1
      ? `Cash is ${signedMoney(cash)}. The bank takes the farm at ${signedMoney(limit)}.`
      : `Cash is ${signedMoney(cash)}, past three quarters of the way to ${signedMoney(limit)}, where the bank takes the farm.`;
  return `${first} ${plural(head, 'head', 'head')} on the farm.`;
}

/** What a mob is gaining or losing a day, as a fact: "Mob 1 is gaining about 0.42 kg a head a day." */
export function gainFact(name: string, adg: number): string {
  if (adg < -0.05) return `${name} is losing about ${Math.abs(adg).toFixed(2)} kg a head a day.`;
  if (adg < 0) return `${name} is holding weight (${adg.toFixed(2)} kg a head a day).`;
  return `${name} is gaining about ${adg.toFixed(2)} kg a head a day.`;
}

export function todoWire(t: ThingToDo): TodoWire {
  const key = todoKey(t);
  const button = (label: string): string | null => (t.action ? label : null);
  const base = { key, mob: null, opens: null, edge: null } as const;
  switch (t.type) {
    case 'calves-to-mark': {
      const bulls = t.youngBulls > 0 ? `, and ${plural(t.youngBulls, 'young bull')}` : '';
      const since =
        t.sinceCalving !== null ? ` Calving started ${plural(t.sinceCalving, 'day')} ago.` : '';
      return {
        ...base,
        mob: t.mob,
        text: `${t.mobName} has ${plural(t.count, 'bull calf', 'bull calves')} to mark${bulls}.${since}`,
        button: button('Mark calves'),
        urgent: false,
      };
    }
    case 'no-water':
      return {
        ...base,
        mob: t.mob,
        text: `${t.mobName} has no water${t.area ? ` in ${t.area}` : ''}. ${plural(t.dryDays, 'day')} without so far. ${NO_WATER_WHY}`,
        button: null,
        urgent: true,
      };
    case 'plan-waiting':
      return {
        ...base,
        mob: t.mob,
        text: `${t.mobName}'s grazing plan can not move it into ${t.area}, because ${waitWhyWord(t.why)}. The plan tries again each day.`,
        button: button('Pause plan'),
        urgent: false,
      };
    case 'crop-ready':
      return {
        ...base,
        text: `A crop of ${SPECIES[t.sp].short} is ready to harvest, ${Math.round(t.count * 10) / 10} ha.`,
        button: button('Harvest'),
        urgent: false,
      };
    case 'in-yards':
      return {
        ...base,
        mob: t.mob,
        text: `${t.mobName} (${plural(t.count, 'head', 'head')}) is in the stock yards, ${plural(t.days, 'day')} so far. The yards have water and almost no feed.`,
        // The button opens the move flow: pick the paddock, done.
        button: 'Move out',
        opens: 'move',
        urgent: false,
      };
    case 'fence-down':
      return {
        ...base,
        text: `A ${FENCE_WORD[t.fence]} fence is down.`,
        // The button opens the same card as tapping the fence on the map.
        button: button('Put it back up'),
        opens: 'fix',
        edge: { line: t.edge.line, index: t.edge.index },
        urgent: false,
      };
    case 'trough-empty':
      return {
        ...base,
        text: 'A portable trough is empty.',
        button: button('Refill it'),
        urgent: true,
      };
    case 'trough-low':
      return {
        ...base,
        text: `A portable trough has ${Math.round(t.count).toLocaleString('en-AU')} litres left.`,
        button: button('Refill it'),
        urgent: false,
      };
    case 'bank':
      return {
        ...base,
        text: bankWords(t.level, t.cash, t.limit, t.count),
        button: null,
        urgent: t.level === 2,
      };
    case 'sale-weight':
      return {
        ...base,
        text: saleWeightText(t),
        button: null,
        urgent: false,
      };
    case 'low-condition':
      return {
        ...base,
        mob: t.mob,
        text: `${t.mobName} averages condition score ${t.cs.toFixed(1)}${t.area ? ` in ${t.area}` : ''}.${t.adg === null ? '' : ` ${gainFact(t.mobName, t.adg)}`}`,
        button: null,
        urgent: false,
      };
    case 'calving':
      return {
        ...base,
        mob: t.mob,
        text: `Calving has started in ${t.mobName}. ${plural(t.count, 'calf', 'calves')} born so far.`,
        button: null,
        urgent: false,
      };
    case 'feed-floor':
      return {
        ...base,
        mob: t.mob,
        text: `${t.area}, where ${t.mobName} grazes, has about ${Math.round(t.massKgHa / 10) * 10} kg DM/ha. That is under ${t.floorKgHa.toLocaleString('en-AU')} kg DM/ha.`,
        button: null,
        urgent: false,
      };
  }
}

/**
 * Stock of one class at sale weight, as a fact about the stock: the head, the class with its
 * weights, and the next cattle sale. "30 yearling steers (280 to 450 kg) are at sale weight and
 * not booked. The next cattle sale is on 14 Nov 2026, in 3 days."
 */
export function saleWeightText(t: Extract<ThingToDo, { type: 'sale-weight' }>): string {
  const n = t.count.toLocaleString('en-AU');
  const are = t.count === 1 ? 'is' : 'are';
  const sale =
    t.date && t.daysAway !== null
      ? ` The next cattle sale is on ${dateText(t.date)}, ${away(t.daysAway)}.`
      : '';
  return `${n} ${classWithWeight(t.cls)} ${are} at sale weight and not booked.${sale}`;
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
      return `${s.mobName}'s grazing plan could not move it into ${s.area}, because ${waitWhyWord(s.why)}.`;
    case 'bank':
      return bankWords(s.level, s.cash, s.limit, s.head);
    case 'out-of-feed':
      return `The whole farm is eaten out with stock on it. The game ends if it stays that way for ${plural(s.daysLeft, 'more day')}.`;
    case 'deaths':
      return `${plural(s.count, s.species === 'sheep' ? 'sheep' : 'head', s.species === 'sheep' ? 'sheep' : 'head')} died in ${s.mobName}, from ${causeWord(s.cause)}.`;
    case 'calving':
      return `Calving has started in ${s.mobName}.`;
  }
}

/** The grazing floor in words, for a paddock under it: "Under 800 kg DM/ha". */
export const UNDER_FLOOR = `Under ${FEED_FLOOR_KG_HA.toLocaleString('en-AU')} kg DM/ha`;

export function gameOverWord(reason: 'bank' | 'feed'): string {
  return reason === 'bank'
    ? 'The bank has taken the farm. Cash went past the limit.'
    : 'The whole farm was eaten out for ten days with cattle on it. The game is over.';
}

/** What a done action did, in a sentence, from the events it made. */
export function doneWord(events: readonly FarmEvent[], dateOf?: DateOf): string {
  const parts: string[] = [];
  // A move into a paddock that holds a mob is one sentence: it moved and joined.
  const joined = events.find((e) => e.type === 'mobs-joined');
  const moved = events.some((e) => e.type === 'mob-moved');
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
        parts.push(
          joined?.type === 'mobs-joined'
            ? `${joined.fromName} moved (${plural(e.head, 'head', 'head')}) and joined ${joined.intoName}.`
            : `${e.mobName} moved (${plural(e.head, 'head', 'head')}).`,
        );
        break;
      case 'mobs-joined':
        if (!moved) parts.push(`${e.fromName} joined ${e.intoName}.`);
        break;
      case 'no-water':
        parts.push(`${e.mobName} has no water in ${e.area}.`);
        break;
      case 'supplement-set':
        parts.push(
          e.supp === 'none'
            ? `${e.mobName} is off supplements.`
            : `${e.mobName} is on ${SUPP_WORD[e.supp]}.`,
        );
        break;
      case 'sale-booked':
        parts.push(
          `${plural(e.head, 'head', 'head')} booked onto the sale on ${dateText(e.saleDate)}. Nothing is paid today.`,
        );
        break;
      case 'sale-cancelled':
        parts.push(
          `${plural(e.head, 'head', 'head')} taken off the sale on ${dateText(e.saleDate)}.`,
        );
        break;
      case 'cattle-sold':
        parts.push(`${plural(e.head, 'head', 'head')} sold. ${money(e.net)} paid into the bank.`);
        break;
      case 'weaned':
        parts.push(`${plural(e.count, 'calf', 'calves')} weaned from ${e.mobName}.`);
        break;
      case 'plan-set':
        parts.push(
          `${e.mobName} is on the plan ${e.templateName}${e.area ? `, in ${e.area}` : ''}.`,
        );
        break;
      case 'plan-resumed':
        parts.push(`${e.mobName}'s plan is running again${e.area ? `, from ${e.area}` : ''}.`);
        break;
      case 'sown':
        parts.push(
          `Sowed ${SPECIES[e.sp].short} on ${Math.round(e.ha * 10) / 10} ha. It cost ${money(e.cost)}.`,
        );
        break;
      case 'cattle-on-the-way':
        parts.push(
          `Bought ${plural(e.qty, 'head', 'head')} for ${money(e.total)}, freight included. They are on the way and arrive tomorrow morning in the stock yards.`,
        );
        break;
      case 'plan-paused':
        parts.push('The plan is paused.');
        break;
      case 'plan-cleared':
        parts.push('The mob is off its plan.');
        break;
      case 'todo-dismissed':
        parts.push('Put away. It shows again if it stops and then starts again.');
        break;
      case 'layout-job':
        parts.push(layoutWord(e) ?? 'Done.');
        break;
      // The jobs of the workforce say their result in the same words as the inbox.
      case 'hand-hired':
      case 'hand-left':
      case 'contract-ordered':
      case 'contract-cancelled':
        if (dateOf) parts.push(labourMessage(e, dateOf));
        break;
      default:
        // A sheep job says its result in the same words as the inbox.
        if (dateOf && isSheepEvent(e)) parts.push(sheepMessage(e, dateOf).text);
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
