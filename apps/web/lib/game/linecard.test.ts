import { describe, expect, it } from 'vitest';
import { lineFacts } from './linecard';
import type { JobCardWire } from './types';

const card = (over: Partial<JobCardWire> = {}): JobCardWire => ({
  action: 'buildFence',
  outcome: 'done',
  workMin: 180,
  leftAfterMin: 300,
  usesRestOfDay: false,
  fitsToday: true,
  cost: 2340,
  costToday: 2340,
  perDay: null,
  notes: [],
  line: {
    fits: { edges: [], cells: [], metres: 650 },
    doesNotFit: { edges: [], cells: [], metres: 0 },
    words: [],
  },
  ...over,
});

describe('the facts beside a line', () => {
  it('says the length, the cost and the time, lightly', () => {
    const f = lineFacts(card())!;
    expect(f.length).toBe('650 m');
    expect(f.cost).toBe('Costs $2,340.');
    expect(f.time).toBe('Takes about 3 h.');
    expect(f.notFit).toEqual([]);
    expect(f.fullDay).toBeNull();
    expect(f.nothingFits).toBe(false);
  });

  it('a line too long for the day: the whole length, the cost of what fits, and the words from the server', () => {
    const f = lineFacts(
      card({
        outcome: 'part',
        usesRestOfDay: true,
        cost: 4200,
        costToday: 2800,
        line: {
          fits: { edges: [], cells: [], metres: 400 },
          doesNotFit: { edges: [], cells: [], metres: 200 },
          words: ["You don't have enough time to do this today.", '400 m fits today.'],
        },
      }),
    )!;
    expect(f.length).toBe('600 m');
    expect(f.cost).toBe('Costs $2,800 for the part that fits.');
    expect(f.notFit[0]).toBe("You don't have enough time to do this today.");
    expect(f.fullDay).toBe('This would use up your full day.');
    expect(f.fitsM).toBe(400);
    expect(f.lateM).toBe(200);
  });

  it('a line that uses the rest of the day says so even when all of it fits', () => {
    expect(lineFacts(card({ usesRestOfDay: true }))!.fullDay).toBe(
      'This would use up your full day.',
    );
  });

  it('nothing that fits turns the Build button off', () => {
    const f = lineFacts(
      card({
        line: {
          fits: { edges: [], cells: [], metres: 0 },
          doesNotFit: { edges: [], cells: [], metres: 300 },
          words: ['x'],
        },
      }),
    )!;
    expect(f.nothingFits).toBe(true);
  });

  it('is null for a card with no line', () => {
    expect(lineFacts(card({ line: null }))).toBeNull();
  });

  it('a free line says no cost', () => {
    expect(lineFacts(card({ cost: 0, costToday: 0 }))!.cost).toBe('No cost.');
  });
});
