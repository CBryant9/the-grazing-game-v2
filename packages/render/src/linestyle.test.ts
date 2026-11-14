import { describe, expect, it } from 'vitest';
import { CONTRACT_TAG, LINE_PATTERN, TICK, tickOffsets, type LineStyleId } from './linestyle';

describe("the contractor's fence is told apart without colour", () => {
  const mine: LineStyleId[] = ['contractBuilt', 'contractLeft'];
  const others = (Object.keys(LINE_PATTERN) as LineStyleId[]).filter((k) => !mine.includes(k));

  it('has a line pattern no other line has, built and still to build', () => {
    for (const m of mine) {
      for (const o of others) {
        expect(LINE_PATTERN[m], `${m} against ${o}`).not.toBe(LINE_PATTERN[o]);
      }
    }
    expect(LINE_PATTERN.contractBuilt).not.toBe(LINE_PATTERN.contractLeft);
  });

  it('is the only pattern with cross ticks', () => {
    const ticked = (Object.keys(LINE_PATTERN) as LineStyleId[]).filter((k) =>
      LINE_PATTERN[k].includes('ticks'),
    );
    expect(ticked.sort()).toEqual(['contractBuilt', 'contractLeft']);
  });

  it('puts ticks evenly along a line, at a size that reads at every zoom', () => {
    const at = tickOffsets(100);
    expect(at.length).toBeGreaterThanOrEqual(7);
    for (let i = 1; i < at.length; i++) {
      expect(at[i]! - at[i - 1]!).toBeCloseTo(TICK.spacingPx, 6);
    }
    expect(at.at(-1)!).toBeLessThan(100);
    expect(TICK.lengthPx).toBeGreaterThanOrEqual(8);
    expect(tickOffsets(0)).toEqual([]);
  });

  it('carries a short text tag', () => {
    expect(CONTRACT_TAG).toBe('Team fence');
  });
});
