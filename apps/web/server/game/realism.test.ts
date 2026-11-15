import { createFarm, type FarmEvent, type RescueTerms, type YearTotals } from '@gg/engine';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../../lib/game/types';
import { farmCard } from '../community/share';
import { fileLines, periodFilings } from './diary';
import { rescueLine } from './game';
import { inboxMessage } from './inboxwords';
import { rescueSaleWords } from './rescuewords';
import { stopWord, todoWire } from './words';
import { yearFacts, yearMoney } from './years';

/*
 * The m7.1 realism fixes on the server's words: the real reason a plan waits, the rescue's
 * words by case and its own money line, the day number the player sees, and day cards that
 * carry job and farm facts only (PRD 9.3), picked by the kind of line.
 */

const dateOf = () => ({ year: 2026, month: 2, date: 4 });

describe('a plan that waits says why', () => {
  const event = (why: 'no-water' | 'sheep-there'): FarmEvent => ({
    type: 'plan-waiting',
    mob: 1,
    mobName: 'Steers',
    template: 1,
    why,
    area: 'Paddock 3',
    cell: 10,
    step: 1,
  });

  it('in the inbox: sheep when sheep are there, no water only when that is the reason', () => {
    expect(inboxMessage(event('sheep-there'), dateOf)!.text).toBe(
      "Steers's grazing plan can not move it into Paddock 3, because sheep are grazing there.",
    );
    expect(inboxMessage(event('no-water'), dateOf)!.text).toMatch(/because that area has no water/);
  });

  it('in the things to do and the skip stop', () => {
    const todo = todoWire({
      type: 'plan-waiting',
      mob: 1,
      mobName: 'Steers',
      area: 'Paddock 3',
      why: 'sheep-there',
      step: 1,
      count: 10,
      does: 'pausePlan',
      action: { type: 'pausePlan', mob: 1 },
    } as never);
    expect(todo.text).toMatch(/because sheep are grazing there/);
    expect(todo.text).not.toMatch(/water/);
    expect(
      stopWord({
        type: 'plan-waiting',
        mob: 1,
        mobName: 'Steers',
        area: 'Paddock 3',
        why: 'sheep-there',
        step: 1,
      }),
    ).toMatch(/because sheep are grazing there/);
  });
});

describe('the rescue in words', () => {
  const terms = (o: Partial<RescueTerms>): RescueTerms => ({
    cattleSold: 40,
    sheepSold: 0,
    stockValue: 52_000,
    debt: 80_000,
    hardStartCash: 140_000,
    cashAfter: 140_000,
    ...o,
  });

  it('with a debt: the stock was sold to pay it, and the cash now', () => {
    expect(rescueLine(terms({}))).toBe(
      'You paid to keep going. 40 head of stock were sold for $52,000 to pay the debt. Cash is now $140,000. The farm is open again.',
    );
  });

  it('with no debt: sold, and the cash now, without "to pay the debt" or "was set to"', () => {
    const line = rescueLine(terms({ debt: 0, cashAfter: 260_000 }));
    expect(line).toBe(
      'You paid to keep going. 40 head of stock were sold for $52,000. Cash is now $260,000. The farm is open again.',
    );
    expect(line).not.toMatch(/to pay the debt|was set to/);
  });

  it('one head is "1 head was sold"; no stock says so', () => {
    expect(rescueLine(terms({ cattleSold: 1, stockValue: 900 }))).toMatch(
      /1 head was sold for \$900 to pay the debt\./,
    );
    expect(rescueLine(terms({ cattleSold: 0, stockValue: 0 }))).toMatch(
      /There was no stock to sell\./,
    );
  });

  it('the offer card says what the stock fetches today, by the same case rule', () => {
    expect(rescueSaleWords(40, 52_000, true, 'will be')).toBe(
      "40 head of stock will be sold at today's prices for $52,000 to pay the debt.",
    );
    expect(rescueSaleWords(40, 52_000, false, 'will be')).toBe(
      "40 head of stock will be sold at today's prices for $52,000.",
    );
    expect(rescueSaleWords(1, 900, false, 'will be')).toBe(
      "1 head will be sold at today's prices for $900.",
    );
    expect(rescueSaleWords(0, 0, true, 'will be')).toBe('There is no stock to sell.');
  });

  it('the cash paid in is its own money line and a fact under the year, not in the profit', () => {
    const y = {
      sales: 52_000,
      buys: 0,
      feed: 0,
      grain: 0,
      crops: 0,
      infra: 0,
      running: 0,
      interest: 0,
      keepGoing: 97_640,
    } as YearTotals;
    expect(yearMoney(y)).toContainEqual({ label: 'Paid to keep going', dollars: 97_640 });
    const facts = yearFacts({
      ...y,
      worth0: 42_360,
      worth1: 140_000,
      gain: 0,
      births: 0,
      deaths: 0,
      grown: 0,
      eaten: 0,
      covers: [50],
      score: { cover: 50 },
    } as never);
    expect(facts).toContain(
      "Paid to keep going: $97,640. It is in net worth but not in the year's profit.",
    );
  });
});

describe('the day the player sees', () => {
  it('Share my farm says the diary day: engine day 0 is Day 1', () => {
    const snap = {
      day: 0,
      date: { year: 2026, month: 2, date: 4 },
      season: 'Average',
      farm: { name: 'Home', district: 'cw' },
      totals: { head: 10, massKgHa: 2000, coverPct: 80, netWorth: 1 },
    } as unknown as Snapshot;
    expect(farmCard(snap, 'daily').title).toBe('Home, Day 1');
  });
});

describe('a day card carries job and farm facts only, by the kind of line', () => {
  const farm = createFarm({
    seed: 3,
    district: 'cw',
    size: 'small',
    start: { year: 2023, month: 8 },
    startType: 'running',
    difficulty: 'medium',
  });
  const summary = {
    daysRun: 1,
    cash: { before: 1000, after: 900 },
    money: {
      sales: 0,
      buys: 0,
      feed: 0,
      grain: 0,
      running: 100,
      interest: 0,
      contract: 0,
      wages: 0,
      wool: 0,
    },
  } as never;
  const events: FarmEvent[] = [
    { type: 'births', mob: 1, mobName: 'Cows', count: 2 },
    { type: 'wages-paid', hands: 1, wages: 900, superannuation: 100, total: 1000 },
  ];

  it('the diary keeps every line; the card has the births, not the cash, running costs or wages', () => {
    const [f] = periodFilings(farm, Number.MAX_SAFE_INTEGER, summary, [
      { day: farm.day, events, rainMm: 12.4 },
    ]);
    expect(f!.lines).toContain('Cows: 2 calves born.');
    expect(f!.lines.some((l) => l.startsWith('Cash went from'))).toBe(true);
    expect(f!.lines.some((l) => l.startsWith('Running costs'))).toBe(true);
    expect(f!.lines.length).toBeGreaterThanOrEqual(4);
    expect(f!.card).toEqual(['Cows: 2 calves born.']);
    expect(f!.rainMm).toBe(12.4);
    // Kept with the day: a line filed later (a job) adds to the card when it is a card line.
    const kept = fileLines(
      [],
      [f!, { day: farm.day, date: f!.date, lines: ['Moved Cows.'], card: ['Moved Cows.'] }],
    );
    expect(kept[0]!.card).toEqual(['Cows: 2 calves born.', 'Moved Cows.']);
    expect(kept[0]!.rainMm).toBe(12.4);
    // A line filed with no card (a data note, the rescue line) stays out of the card.
    const noted = fileLines(kept, [{ day: farm.day, date: f!.date, lines: ['A note.'] }]);
    expect(noted[0]!.card).toEqual(['Cows: 2 calves born.', 'Moved Cows.']);
    expect(noted[0]!.lines).toContain('A note.');
  });
});
