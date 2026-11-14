import 'server-only';
import { weekdayOf } from '@gg/engine';
import type { DateParts } from '../../lib/game/types';

/**
 * The words for the Market tab: the sale line, why Buy is off, and the
 * lines on a buy, sell or cancel card. Plain Australian English, short
 * sentences, facts only: nothing here praises, criticises or says what to do
 * (CLAUDE.md, rules 2, 6 and 11).
 */

/** The line MLA asks for wherever its prices are shown (docs/DATA.md, "Prices: Meat & Livestock Australia"). */
export const MLA_CREDIT =
  'Reproduced courtesy of Meat & Livestock Australia Limited – www.mla.com.au';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
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

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`;
const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;
const signedMoney = (n: number): string => (n < 0 ? `-${money(n)}` : money(n));

/** "Thursday 14 March". */
export function longDate(d: DateParts): string {
  return `${WEEKDAYS[weekdayOf(d)]!} ${d.date} ${MONTHS[d.month]!}`;
}

/** "today", "tomorrow", "in 3 days". */
export function inDays(daysAway: number): string {
  if (daysAway <= 0) return 'today';
  if (daysAway === 1) return 'tomorrow';
  return `in ${daysAway} days`;
}

/** The top of the Market tab, stated lightly. */
export function saleLine(
  isSaleDay: boolean,
  next: { date: DateParts; daysAway: number } | null,
): string {
  if (isSaleDay) return 'There is a cattle sale today.';
  if (!next) return 'No cattle sale in the next few months.';
  return `Next cattle sale: ${longDate(next.date)}, ${inDays(next.daysAway)}.`;
}

/** Why Buy is off on a day with no sale, naming the next sale. Null on a sale day. */
export function buyReason(
  isSaleDay: boolean,
  next: { date: DateParts; daysAway: number } | null,
): string | null {
  if (isSaleDay) return null;
  const base = 'Cattle can only be bought on a sale day.';
  if (!next) return `${base} There is no cattle sale in the next few months.`;
  return `${base} The next cattle sale is on ${longDate(next.date)}, ${inDays(next.daysAway)}.`;
}

/** What selling does today, in a sentence or two, at the top of the Sell view. */
export function sellNote(
  isSaleDay: boolean,
  next: { date: DateParts; daysAway: number } | null,
): string {
  if (isSaleDay) return 'There is a sale today. Stock sold today are paid today.';
  if (!next) return 'There is no cattle sale in the next few months. Nothing can be booked.';
  return `No sale today. Stock go down for the next sale on ${longDate(next.date)}, ${inDays(next.daysAway)}. Nothing is paid now, and the price is set on the day.`;
}

/** The weight range of a sale class: "190 to 235 kg". */
export const weightText = (wt: readonly [number, number]): string => `${wt[0]} to ${wt[1]} kg`;

export interface BuyLines {
  qty: number;
  /** "weaner steer", from the class. */
  one: string;
  label: string;
  /** Dollars for the whole buy, freight included. */
  total: number;
  /** Dollars in the bank now. */
  cashBefore: number;
  /** The class has a calf at foot: each unit is a cow and her calf. */
  units: boolean;
}

/** The lines on the Buy card. The money is the engine's job card; these only say it. */
export function buyLines(b: BuyLines): string[] {
  const what =
    b.qty === 1 ? `1 ${b.one}` : `${b.qty.toLocaleString('en-AU')} ${b.label.toLowerCase()}`;
  const each = Math.round(b.total / b.qty);
  return [
    `Buy ${what}: ${money(b.total)}, freight and fees included. That is about ${money(each)} ${b.units ? 'a unit' : 'a head'}.`,
    'They arrive tomorrow morning in the stock yards.',
    `That leaves ${signedMoney(b.cashBefore - b.total)} in the bank.`,
  ];
}

export interface SellLines {
  head: number;
  /** Calves at foot that go with their mothers. */
  calves: number;
  /** "weaner steers", for the sentence. */
  what: string;
  /** True on a sale day: sold and paid today. */
  today: boolean;
  /** Dollars banked after commission and fees (a sale day), as the job card gives it. */
  net: number;
  cashBefore: number;
  /** The sale the stock go down for, when it is not today. */
  sale: { date: DateParts; daysAway: number } | null;
}

/** The lines on the Sell card. */
export function sellLines(s: SellLines): string[] {
  const head = plural(s.head, 'head', 'head');
  const calves =
    s.calves > 0
      ? [
          `${plural(s.calves, 'calf', 'calves')} at foot ${s.calves === 1 ? 'goes' : 'go'} with their mothers.`,
        ]
      : [];
  if (s.today) {
    return [
      `Sell ${head} of ${s.what} today.`,
      ...calves,
      `${money(s.net)} comes in after commission and selling costs.`,
      `That brings the bank to ${signedMoney(s.cashBefore + s.net)}.`,
    ];
  }
  const when = s.sale ? `${longDate(s.sale.date)}, ${inDays(s.sale.daysAway)}` : 'the next sale';
  return [
    `${head} of ${s.what} go down for the next sale on ${when}.`,
    ...calves,
    'Nothing is paid now.',
    'The price is set on the day of the sale.',
    'They stay on the farm and graze until then.',
  ];
}

/** The line on the Cancel card. */
export function cancelLines(head: number, sale: { date: DateParts } | null): string[] {
  const when = sale ? ` on ${longDate(sale.date)}` : '';
  return [
    `${plural(head, 'head', 'head')} come off the sale${when}.`,
    'They stay on the farm. Nothing is paid or charged.',
  ];
}

/** "+12 c/kg" or "-4 c/kg" or "no change". */
export function changeText(c: number): string {
  if (c === 0) return 'no change';
  return `${c > 0 ? '+' : '-'}${Math.abs(c)} c/kg`;
}
