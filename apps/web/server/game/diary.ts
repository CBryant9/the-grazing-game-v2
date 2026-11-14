import 'server-only';
import { dateOn, type FarmEvent, type FarmState } from '@gg/engine';
import type { DateParts, DiaryDay, SummaryWire } from '../../lib/game/types';
import { inboxMessage } from './inboxwords';

/*
 * The diary: a plain list of the days the player has lived, with a few lines
 * for each. The lines are words the server already makes (a job's result, a
 * day's inbox messages, the money for a day or skip). The server keeps the
 * last `DIARY_DAYS` days in the farm's file, beside the engine's save.
 */

/** Days kept for each farm. The oldest go first. */
export const DIARY_DAYS = 400;
/** Lines kept for a day. Past these, the day says how many more there were. */
export const DIARY_LINES = 12;
/** Days in one page of the Diary. */
export const DIARY_PAGE = 30;

/** A day as it is kept: the lines, and how many more there were past the limit. */
export interface StoredDiaryDay {
  day: number;
  date: DateParts;
  lines: string[];
  more: number;
}

/** Lines to add to a day. */
export interface Filing {
  day: number;
  date: DateParts;
  lines: string[];
}

/**
 * The diary with the lines filed under their days, as a new list. A day
 * that is not there yet is added in its place by day number. A day takes
 * `DIARY_LINES` lines and counts the rest. Past `DIARY_DAYS` days the oldest
 * are dropped.
 */
export function fileLines(
  diary: readonly StoredDiaryDay[],
  filings: readonly Filing[],
): StoredDiaryDay[] {
  const out = diary.map((d) => ({ ...d, lines: d.lines.slice() }));
  for (const f of filings) {
    if (f.lines.length === 0) continue;
    let at = out.length - 1;
    while (at >= 0 && out[at]!.day > f.day) at--;
    let entry = out[at];
    if (!entry || entry.day !== f.day) {
      entry = { day: f.day, date: f.date, lines: [], more: 0 };
      out.splice(at + 1, 0, entry);
    }
    for (const line of f.lines) {
      if (entry.lines.length < DIARY_LINES) entry.lines.push(line);
      else entry.more++;
    }
  }
  if (out.length > DIARY_DAYS) out.splice(0, out.length - DIARY_DAYS);
  return out;
}

/**
 * One page of the diary, newest day first. `before` asks for days older
 * than that day. `earlier` is the `before` to ask for the next page, or null
 * when this page reaches the oldest day kept.
 */
export function diaryPage(
  diary: readonly StoredDiaryDay[],
  before?: number,
): { diary: DiaryDay[]; earlier: number | null } {
  const older = before === undefined ? diary : diary.filter((d) => d.day < before);
  const page = older.slice(-DIARY_PAGE).reverse();
  const out = page.map((d): DiaryDay => ({
    day: d.day,
    date: d.date,
    lines: d.more > 0 ? [...d.lines, `and ${d.more.toLocaleString('en-AU')} more`] : d.lines,
  }));
  const hasEarlier = older.length > page.length;
  return { diary: out, earlier: hasEarlier && page.length ? page[page.length - 1]!.day : null };
}

const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;

/**
 * The money lines of a day or skip: cash, and what came in and went out. Born
 * and dead cattle, sales and the rest are in the inbox messages, so they are
 * not said twice. A skip says how many days the figures cover.
 */
export function summaryLines(s: SummaryWire): string[] {
  if (s.daysRun === 0) return [];
  const over = s.daysRun > 1 ? ` over ${s.daysRun.toLocaleString('en-AU')} days` : '';
  const out: string[] = [];
  if (s.cash.before !== s.cash.after) {
    out.push(
      `Cash went from ${s.cash.before < 0 ? '-' : ''}${money(s.cash.before)} to ${s.cash.after < 0 ? '-' : ''}${money(s.cash.after)}${over}.`,
    );
  }
  const m = s.money;
  if (m.sales > 0) out.push(`Sales: ${money(m.sales)}${over}.`);
  if (m.buys > 0) out.push(`Cattle bought: ${money(m.buys)}${over}.`);
  if (m.feed > 0) out.push(`Feed: ${money(m.feed)}${over}.`);
  if (m.grain > 0) out.push(`Grain sold: ${money(m.grain)}${over}.`);
  if (m.running > 0) out.push(`Running costs: ${money(m.running)}${over}.`);
  if (m.interest > 0) out.push(`Interest earned: ${money(m.interest)}${over}.`);
  if (m.interest < 0) out.push(`Interest paid: ${money(m.interest)}${over}.`);
  return out;
}

/** A day the engine ran, with what its tick reported. */
export interface RunDay {
  day: number;
  events: readonly FarmEvent[];
}

/**
 * What a day or skip files in the diary. Each day's own events (from the
 * run itself, not the inbox, which keeps only 120 messages) go under that
 * day. The events of first light carry no day, so those still come from the
 * inbox made since `seq0`: cattle landing and booked stock selling. Messages
 * made by the player's own jobs are older than `seq0`: the job's result line
 * was filed when it was done. The money lines go under the last day that ran.
 */
export function periodFilings(
  farm: FarmState,
  seq0: number,
  summary: SummaryWire,
  days: readonly RunDay[],
): Filing[] {
  const byDay = new Map<number, string[]>();
  const add = (day: number, lines: string[]): void => {
    if (lines.length === 0) return;
    const there = byDay.get(day);
    if (there) there.push(...lines);
    else byDay.set(day, lines);
  };
  for (const d of days) {
    for (const e of d.events) {
      const words = inboxMessage(e);
      if (words) add(d.day, [words.text]);
    }
  }
  for (const m of farm.inbox) {
    if (m.seq < seq0) continue;
    if (m.event.type !== 'cattle-arrived' && m.event.type !== 'cattle-sold') continue;
    const words = inboxMessage(m.event);
    if (words) add(m.day, [words.text]);
  }
  if (summary.daysRun > 0) add(Math.max(0, farm.day - 1), summaryLines(summary));
  return [...byDay]
    .sort((a, b) => a[0] - b[0])
    .map(([day, lines]) => {
      const d = dateOn(farm, day);
      return { day, date: { year: d.year, month: d.month, date: d.date }, lines };
    });
}
