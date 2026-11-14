import { describe, expect, it } from 'vitest';
import {
  aboutTime,
  cardLines,
  clockText,
  dateText,
  delta,
  doneLines,
  durationText,
  lightNote,
  money,
} from './format';
import type { JobCardWire } from './types';

describe('format', () => {
  it('writes money, dates and times plainly', () => {
    expect(money(212400)).toBe('$212,400');
    expect(money(-1200)).toBe('-$1,200');
    expect(dateText({ year: 2026, month: 10, date: 14 })).toBe('14 Nov 2026');
    expect(clockText(302)).toBe('5:02 am');
    expect(clockText(0)).toBe('12:00 am');
    expect(clockText(12 * 60 + 5)).toBe('12:05 pm');
    expect(durationText(45)).toBe('45 min');
    expect(durationText(80)).toBe('1 h 20 min');
    expect(durationText(180)).toBe('3 h');
  });

  it('gives the daylight note as light, not a countdown', () => {
    expect(lightNote(370, false)).toBe('About 6 h of light left');
    expect(lightNote(60, false)).toBe('About an hour of light left');
    expect(lightNote(20, false)).toBe('A little light left');
    expect(lightNote(5, true)).toBe('Not enough light left for a job today');
    for (const n of [370, 60, 20]) expect(lightNote(n, false)).not.toMatch(/\d+:\d+|min/);
  });

  it('says what changed', () => {
    expect(delta(10, 10)).toBe('no change');
    expect(delta(10, 14)).toBe('+4');
    expect(delta(1200, 1000)).toBe('-200');
  });
});

const card = (over: Partial<JobCardWire> = {}): JobCardWire => ({
  action: 'markCalves',
  outcome: 'done',
  workMin: 30,
  leftAfterMin: 250,
  usesRestOfDay: false,
  fitsToday: true,
  cost: 72,
  costToday: 72,
  perDay: null,
  notes: [],
  line: null,
  ...over,
});

describe('cardLines', () => {
  it('states time, cost and light left', () => {
    expect(cardLines(card())).toEqual([
      'Takes about 30 min.',
      'Costs $72.',
      'About 4 h 10 min of light left after.',
    ]);
  });
  it('gives the time lightly, to the nearest five minutes', () => {
    expect(aboutTime(41)).toBe('about 40 min');
    expect(aboutTime(2)).toBe('about 5 min');
    expect(aboutTime(80)).toBe('about 1 h 20 min');
  });
  it('shows a supplement as a daily price, not a job cost', () => {
    const lines = cardLines(card({ outcome: 'free', cost: 0, workMin: 0, perDay: 84 }));
    expect(lines).toEqual(['Takes none of the day.', 'Costs about $84 a day while it is on.']);
    expect(cardLines(card({ outcome: 'free', perDay: 4.5 }))[1]).toBe(
      'Costs about $4.50 a day while it is on.',
    );
  });
  it('says so when a job uses the full day, is free, or only part fits', () => {
    expect(cardLines(card({ usesRestOfDay: true }))).toContain('This would use up your full day.');
    expect(cardLines(card({ outcome: 'free', cost: 0, workMin: 0 }))).toEqual([
      'Takes none of the day.',
      'No cost.',
    ]);
    expect(cardLines(card({ outcome: 'part' }))).toContain('Only part of it fits today.');
    expect(cardLines(card({ cost: -300 }))).toContain('Pays $300.');
  });
  it('adds the notes after the figures', () => {
    expect(cardLines(card({ notes: ['One more fact.'] })).at(-1)).toBe('One more fact.');
  });
});

describe('a job with its own lines', () => {
  const own = card({
    summary: [
      'Buy 12 weaner steers: $5,572, freight and fees included. That is about $464 a head.',
      'They arrive tomorrow morning in the stock yards.',
      'That leaves $149,313 in the bank.',
    ],
    notes: ['One more fact.'],
  });
  it('uses the server lines, then the notes, and not the time and cost lines', () => {
    expect(cardLines(own)).toEqual([...own.summary!, 'One more fact.']);
  });
  it('repeats only where the bank stands under the result', () => {
    expect(doneLines(own)).toEqual(['That leaves $149,313 in the bank.']);
    expect(doneLines(card({ summary: ['Sale booked.'] }))).toEqual([]);
    expect(doneLines(card())).toEqual(['Takes about 30 min.', 'Costs $72.']);
  });
});
