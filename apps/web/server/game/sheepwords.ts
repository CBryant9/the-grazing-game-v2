import 'server-only';
import {
  SHEEP_BUY_CLASSES,
  type FarmEvent,
  type SheepClass,
  type SheepDeathCause,
  type SheepJoiningRecord,
  type SheepLossReason,
  type SheepMobRead,
  type SheepNote,
  type SheepStage,
} from '@gg/engine';
import type { DateParts, InboxKind } from '../../lib/game/types';
import type { DateOf } from './labourwords';

/**
 * The words for sheep (milestone 2.8). Plain Australian English, short sentences, facts with
 * their reasons. Nothing here praises, blames or says what to do (CLAUDE.md rules 2, 5, 11).
 */

const n0 = (n: number): string => Math.round(n).toLocaleString('en-AU');
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n0(n)} ${Math.round(n) === 1 ? one : many}`;
const money = (n: number): string => `$${n0(Math.abs(n))}`;
const cents = (n: number): string =>
  `$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const t1 = (n: number): string =>
  (Math.round(n * 10) / 10).toLocaleString('en-AU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "14 November". */
export const dayMonth = (d: { month: number; date: number }): string =>
  `${d.date} ${MONTH_NAMES[d.month]}`;
/** "14 November 2026". */
export const fullDate = (d: DateParts): string => `${dayMonth(d)} ${d.year}`;

/** The class names on the mob card and the lists. */
export const SHEEP_CLASS_LABEL: Record<SheepClass, string> = {
  ewe: 'Ewes',
  wether: 'Wethers',
  ram: 'Rams',
  hogget: 'Hoggets',
  weaner: 'Weaners',
  lamb: 'Lambs at foot',
};

/** Sex words for a class that holds both: "Ewe hoggets", "Wether weaners". */
const SEX_WORD = { F: 'Ewe', W: 'Wether', M: 'Ram' } as const;

/** The label of a class to sell, by sex where the class holds more than one. */
export function sellLabel(cls: SheepClass, sex: 'F' | 'W' | 'M'): string {
  if (cls === 'hogget' || cls === 'weaner') return `${SEX_WORD[sex]} ${cls}s`;
  return SHEEP_CLASS_LABEL[cls];
}

export const SHEEP_FEED_LABEL = { none: 'None', lick: 'Lick', grain: 'Grain', hay: 'Hay' } as const;
const FEED_WORD = { none: 'no feed', lick: 'lick', grain: 'grain', hay: 'hay' } as const;

const CAUSE: Record<SheepDeathCause, string> = {
  noWater: 'no water',
  starved: 'starvation (under half their normal weight)',
  poorCondition: 'poor condition',
  lambing: 'lambing',
  newborn: 'newborn losses',
  orphaned: 'being orphaned',
  flystrike: 'flystrike',
  weaner: 'slow growth after weaning',
  natural: 'natural causes',
};
export const sheepCauseWord = (c: SheepDeathCause): string => CAUSE[c];

const LOSS: Record<SheepLossReason, string> = {
  lowFeed: 'not enough feed',
  lowEnergy: 'low ME',
  lowProtein: 'CP under 7%',
  milking: 'ewes milking',
  latePregnancy: 'late pregnancy',
};
export const lossWord = (r: SheepLossReason): string => LOSS[r];

/** "low ME, late pregnancy". */
export const lossList = (why: readonly SheepLossReason[]): string => why.map(lossWord).join(', ');

const STAGE: Record<SheepStage, string> = {
  joining: 'ewes at joining',
  pregnancy: 'ewes in early to mid pregnancy',
  lambing: 'ewes at lambing',
  lactation: 'ewes with lambs at foot',
  other: 'dry sheep',
};
export const stageWord = (s: SheepStage): string => STAGE[s];

/** The start flock on the first day, in plain facts, from the engine's read of it. */
export function startFlockText(m: SheepMobRead | null): string {
  if (!m) return 'A self-replacing Merino flock.';
  const parts = [
    'A self-replacing Merino flock: ewes of several ages, ewe hoggets kept as replacements, and rams.',
  ];
  if (m.lambs > 0) parts.push('On the first day the ewes have lambs at foot.');
  else if (m.joining?.scanned) parts.push('On the first day the ewes are scanned in lamb.');
  else if (m.joining) parts.push('On the first day the ewes are joined.');
  else parts.push('On the first day the ewes are dry.');
  if (m.woolMonths >= 1) parts.push(`They carry about ${plural(m.woolMonths, 'month')} of wool.`);
  parts.push('Shearing, crutching, marking and weaning happen by themselves on their dates.');
  return parts.join(' ');
}

/** "About 7 months of wool: 2.4 kg clean a head, 18.1 micron." */
export function woolText(m: SheepMobRead): string | null {
  if (m.head <= 0) return null;
  if (m.woolMonths < 0.5 || m.fleeceKgHead <= 0) return 'Freshly shorn.';
  return `About ${plural(m.woolMonths, 'month')} of wool: ${t1(m.fleeceKgHead)} kg clean a head, ${t1(m.micron)} micron.`;
}

/** "Shearing on 14 November. About $9.81 a head." */
export function contractorText(
  job: 'Shearing' | 'Crutching',
  on: { month: number; date: number } | null,
  perHead: number,
): string | null {
  return on ? `${job} on ${dayMonth(on)}. About ${cents(perHead)} a head.` : null;
}

/** The joining record, as far as the player has been told, one line each. */
export function joiningLines(
  j: SheepJoiningRecord | null,
  joinOn: { month: number; date: number },
  dateOf: DateOf,
): string[] {
  const out: string[] = [];
  if (!j) {
    out.push(`Joining starts on ${dayMonth(joinOn)} each year.`);
    return out;
  }
  out.push(
    `Joined ${fullDate(dateOf(j.start))}: ${plural(j.joined, 'ewe')} with ${plural(j.rams, 'ram')}.`,
  );
  if (j.scanned) {
    out.push(
      `Scanned: ${plural(j.scanned.pregnant, 'ewe')} in lamb, carrying ${plural(j.scanned.foetuses, 'lamb')} (${n0(j.scanned.pct)} lambs per 100 ewes joined).`,
    );
  }
  if (j.born > 0) out.push(`${plural(j.born, 'lamb')} born.`);
  if (j.marked)
    out.push(`Marked: ${plural(j.marked.lambs, 'lamb')}, ${n0(j.marked.pct)}% of ewes joined.`);
  if (j.weaned)
    out.push(`Weaned: ${plural(j.weaned.lambs, 'lamb')}, ${n0(j.weaned.pct)}% of ewes joined.`);
  out.push(`Next joining starts on ${dayMonth(joinOn)}.`);
  return out;
}

/** Where a sheep mob is up to, in plain words, from its classes and its joining record. */
export function stageText(m: SheepMobRead, joiningNow: boolean): string {
  const classes = m.classes.filter((c) => c.cls !== 'lamb').map((c) => SHEEP_CLASS_LABEL[c.cls]);
  const who = classes.length ? classes.join(', ') : 'Sheep';
  if (m.lambs > 0) return `${who}, with ${plural(m.lambs, 'lamb')} at foot.`;
  if (joiningNow) return `${who}. Joining is under way.`;
  const j = m.joining;
  if (j?.scanned && j.born === 0 && !j.marked) return `${who}. The ewes are scanned in lamb.`;
  return `${who}.`;
}

/** What a sheep mob's day tells the player. */
export function sheepNoteWord(mobName: string, area: string | null, n: SheepNote): string {
  const where = area ? ` in ${area}` : '';
  switch (n.type) {
    case 'noWater':
      return `${mobName} has had no water for ${plural(n.days, 'day')}${where}. Sheep die on the fourth day without water.`;
    case 'shortOfFeed':
      return `${mobName}${where}: the paddock gave ${Math.round(n.f * 100)}% of the feed the mob wanted.`;
    case 'lowCondition':
      return `${mobName} has an average condition of CS ${t1(n.cs)}.`;
    case 'losingWeight':
      return `${mobName} is losing weight${n.why.length ? `: ${lossList(n.why)}` : ''}. The feed is ME ${t1(n.me)} MJ/kg and CP ${n0(n.cp)}%.`;
    case 'joiningStarted':
      return `Joining has started in ${mobName}: ${plural(n.ewes, 'ewe')} with ${plural(n.rams, 'ram')}${n.rams < n.ramsNeeded ? `, short of the ${n0(n.ramsNeeded)} rams the joining needs` : ''}.`;
    case 'joiningEnded':
      return `Joining has ended in ${mobName}: ${plural(n.ewes, 'ewe')} joined.`;
    case 'scanned':
      return `${mobName} scanned: ${plural(n.pregnant, 'ewe')} of ${n0(n.ewes)} in lamb, carrying ${plural(n.foetuses, 'lamb')}.`;
    case 'lambingStarted':
      return `Lambing has started in ${mobName}.`;
    case 'marked':
      return `${mobName} marked: ${plural(n.lambs, 'lamb')} from ${plural(n.ewesJoined, 'ewe')} joined. The ram lambs are wethers now.`;
    case 'flystrike':
      return `${plural(n.count, 'sheep', 'sheep')} in ${mobName} struck by flies.`;
  }
}

/** Every event the engine raises about sheep. A new one fails the type check below until it has words. */
export type SheepEvent = Extract<FarmEvent, { type: `sheep${string}` | 'lambs-born' }>;

const SHEEP_TYPES: Record<SheepEvent['type'], true> = {
  sheep: true,
  'lambs-born': true,
  'sheep-deaths': true,
  'sheep-weaned': true,
  'sheep-shorn': true,
  'sheep-crutched': true,
  'sheep-bought': true,
  'sheep-sold': true,
  'sheep-breakout': true,
  'sheep-moved': true,
  'sheep-plan-set': true,
  'sheep-plan-paused': true,
  'sheep-plan-resumed': true,
  'sheep-plan-cleared': true,
  'sheep-plan-finished': true,
  'sheep-plan-waiting': true,
  'sheep-plan-moved': true,
  'sheep-on-the-way': true,
  'sheep-arrived': true,
  'sheep-feed-set': true,
  'sheep-dates-set': true,
};

export const isSheepEvent = (e: FarmEvent): e is SheepEvent => Object.hasOwn(SHEEP_TYPES, e.type);

/** A buy class's name, from the engine's list: "Merino ewes". */
/** A buy class's name inside a sentence: "Merino ewes" keeps its capital, "crossbred store lambs" does not. */
export const classInText = (id: string): string => {
  const n = className(id);
  return /^Merino/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1);
};

export const className = (id: string): string =>
  (SHEEP_BUY_CLASSES as Record<string, { name: string } | undefined>)[id]?.name ?? 'sheep';

const WAIT: Record<'no-water' | 'sheep-there' | 'cattle-there', string> = {
  'no-water': 'that area has no water',
  'sheep-there': 'other sheep are there',
  'cattle-there': 'cattle are there',
};

/**
 * The words for a sheep event, with the inbox kind. Exhaustive: every sheep event has words.
 * `dateOf` dates a farm day.
 */
export function sheepMessage(e: SheepEvent, dateOf: DateOf): { kind: InboxKind; text: string } {
  const sheep = (text: string) => ({ kind: 'sheep' as const, text });
  const sale = (text: string) => ({ kind: 'sale' as const, text });
  const plan = (text: string) => ({ kind: 'plan' as const, text });
  switch (e.type) {
    case 'sheep':
      return sheep(sheepNoteWord(e.mobName, e.area, e.note));
    case 'lambs-born':
      return sheep(`${e.mobName}: ${plural(e.count, 'lamb')} born.`);
    case 'sheep-deaths':
      return sheep(
        `${e.mobName}: ${plural(e.count, 'sheep', 'sheep')} died, from ${sheepCauseWord(e.cause)}.`,
      );
    case 'sheep-weaned':
      return sheep(
        `${plural(e.count, 'lamb')} weaned from ${e.mobName}, averaging ${n0(e.avgKg)} kg.${e.into ? ` They went to ${e.into.mobName}${e.into.area ? ` in ${e.into.area}` : ''}.` : ' They stayed with the ewes: no other empty paddock had water.'}`,
      );
    case 'sheep-shorn':
      return sheep(
        `${e.mobName} shorn: ${plural(e.head, 'head', 'head')}, ${t1(e.head ? e.cleanKg / e.head : 0)} kg clean a head at ${t1(e.micron)} micron, ${plural(e.months, 'month')} of wool. Wool ${money(e.woolIncome)} after selling costs. Shearing ${money(e.cost)}.`,
      );
    case 'sheep-crutched':
      return sheep(`${e.mobName} crutched: ${plural(e.head, 'head', 'head')}, ${money(e.cost)}.`);
    case 'sheep-bought':
      return sale(
        `Bought ${n0(e.qty)} ${classInText(e.cls)} for ${money(e.total)}. They are in ${e.mobName}.`,
      );
    case 'sheep-sold':
      return sale(
        `${plural(e.head, 'sheep', 'sheep')} sold from ${e.mobName}${e.lambsAtFoot ? `, with ${plural(e.lambsAtFoot, 'lamb')} at foot` : ''}, averaging ${n0(e.avgKg)} kg. ${money(e.net)} paid into the bank after selling costs.`,
      );
    case 'sheep-breakout':
      return sheep(
        `${e.mobName} got through a fence from ${e.from} into ${e.to}, because they were ${e.reason}. A cattle fence does not hold sheep.`,
      );
    case 'sheep-moved':
      return sheep(`${e.mobName} moved (${plural(e.head, 'head', 'head')}) to ${e.area}.`);
    case 'sheep-plan-set':
      return plan(
        `${e.mobName} is on a grazing plan.${e.dryAreas.length ? ` ${e.dryAreas.join(', ')} ${e.dryAreas.length === 1 ? 'has' : 'have'} no water.` : ''}`,
      );
    case 'sheep-plan-paused':
      return plan(`${e.mobName}'s grazing plan is paused.`);
    case 'sheep-plan-resumed':
      return plan(
        `${e.mobName}'s grazing plan is running again, from step ${e.step + 1}, in ${e.area}.`,
      );
    case 'sheep-plan-cleared':
      return plan(`${e.mobName} is off its grazing plan.`);
    case 'sheep-plan-finished':
      return plan(`${e.mobName}'s grazing plan has finished. The mob stays where it is.`);
    case 'sheep-plan-waiting':
      return plan(
        `${e.mobName}'s grazing plan can not move it into ${e.area}, because ${WAIT[e.why]}.`,
      );
    case 'sheep-plan-moved':
      return plan(`${e.mobName} moved by its grazing plan from ${e.from} to ${e.to}.`);
    case 'sheep-on-the-way':
      return sale(
        `Bought ${n0(e.qty)} ${classInText(e.cls)} for ${money(e.total)}, the head fee included. They arrive in the stock yards at first light on ${fullDate(dateOf(e.arriveDay))}.`,
      );
    case 'sheep-arrived':
      return sale(
        `${plural(e.head, 'sheep', 'sheep')} arrived in the stock yards, in ${e.mobName}.`,
      );
    case 'sheep-feed-set':
      return sheep(
        e.feed === 'none'
          ? `${e.mobName} is off feed.`
          : `${e.mobName} is on ${FEED_WORD[e.feed]}.`,
      );
    case 'sheep-dates-set':
      return sheep(
        e.shearOn
          ? `${e.mobName} is booked for shearing on ${dayMonth(e.shearOn)} each year.`
          : `${e.mobName} has no shearing booked.`,
      );
    default: {
      const none: never = e;
      return none;
    }
  }
}

/**
 * What the sheep did over a day or a skip, one line each, for the summary card: lambs born,
 * deaths with their causes, weaning, shearing and crutching with the wool and its money.
 */
export function sheepSummaryLines(ticks: readonly FarmEvent[]): { lines: string[]; wool: number } {
  let lambs = 0;
  const deaths = new Map<SheepDeathCause, number>();
  let weaned = 0;
  let wool = 0;
  let shorn = 0;
  let clean = 0;
  let shearCost = 0;
  let micronKg = 0;
  let crutched = 0;
  let crutchCost = 0;
  let broke = 0;
  for (const e of ticks) {
    if (e.type === 'lambs-born') lambs += e.count;
    else if (e.type === 'sheep-deaths') deaths.set(e.cause, (deaths.get(e.cause) ?? 0) + e.count);
    else if (e.type === 'sheep-weaned') weaned += e.count;
    else if (e.type === 'sheep-shorn') {
      wool += e.woolIncome;
      shorn += e.head;
      clean += e.cleanKg;
      micronKg += e.micron * e.cleanKg;
      shearCost += e.cost;
    } else if (e.type === 'sheep-crutched') {
      crutched += e.head;
      crutchCost += e.cost;
    } else if (e.type === 'sheep-breakout') broke++;
  }
  const lines: string[] = [];
  if (lambs) lines.push(`${plural(lambs, 'lamb')} born.`);
  const died = [...deaths.values()].reduce((a, b) => a + b, 0);
  if (died) {
    const why = [...deaths]
      .sort((a, b) => b[1] - a[1])
      .map(([c, k]) => `${n0(k)} from ${sheepCauseWord(c)}`)
      .join(', ');
    lines.push(`${plural(died, 'sheep', 'sheep')} died: ${why}.`);
  }
  if (weaned) lines.push(`${plural(weaned, 'lamb')} weaned.`);
  if (shorn) {
    lines.push(
      `${plural(shorn, 'sheep', 'sheep')} shorn: ${t1(clean / shorn)} kg clean a head at ${t1(clean > 0 ? micronKg / clean : 0)} micron. Wool ${money(wool)} after selling costs. Shearing ${money(shearCost)}.`,
    );
  }
  if (crutched) lines.push(`${plural(crutched, 'sheep', 'sheep')} crutched, ${money(crutchCost)}.`);
  if (broke) lines.push(`Sheep got through a cattle fence ${plural(broke, 'time')}.`);
  return { lines, wool };
}
