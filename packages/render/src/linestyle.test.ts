import { describe, expect, it } from 'vitest';
import { CONTRACT_TAG, LINE_PATTERN, MESH, TICK, tickOffsets, type LineStyleId } from './linestyle';

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

describe('sheep netting is told apart without colour', () => {
  const others = (Object.keys(LINE_PATTERN) as LineStyleId[]).filter((k) => k !== 'netting');

  it('has a pattern of its own: a mesh, shared with no other line', () => {
    expect(LINE_PATTERN.netting).toBe('mesh');
    for (const o of others) expect(LINE_PATTERN[o], o).not.toBe('mesh');
  });

  it('is not dashed (tape), not sagging (a fence down) and has no ticks (the contractor)', () => {
    expect(LINE_PATTERN.netting).not.toBe('dashed');
    expect(LINE_PATTERN.netting).not.toBe('sag');
    expect(LINE_PATTERN.netting).not.toContain('ticks');
  });

  it('every kind of line still has a pattern no other kind shares, except the plain solid ones', () => {
    // Permanent and electric fence and pipe are the plain solid lines, told apart by colour and posts.
    const solid = (Object.keys(LINE_PATTERN) as LineStyleId[]).filter(
      (k) => LINE_PATTERN[k] === 'solid',
    );
    expect(solid.sort()).toEqual(['electric', 'permanent', 'pipe']);
  });

  it('has a mesh fine enough to read as netting and big enough to see', () => {
    expect(MESH.stepPx).toBeGreaterThanOrEqual(3);
    expect(MESH.stepPx).toBeLessThanOrEqual(6);
    expect(MESH.swingPx).toBeGreaterThanOrEqual(1);
    expect(MESH.widthPx).toBeGreaterThanOrEqual(1);
  });
});
