import { describe, expect, it } from 'vitest';
import { VIEW_FENCE } from '@gg/shared';
import {
  draftMetres,
  fenceDraft,
  markDraft,
  newFenceSegments,
  newPipeSquares,
  pipeDraft,
  snapDots,
  squareSideM,
  styleSegments,
  styleSquares,
} from './draft';
import { edgesOfPath, extendPath, type Corner } from './lines';
import { cell, hEdge, sampleView } from './testing/sampleView';

const c = (vx: number, vy: number): Corner => ({ vx, vy });

describe('the draft overlay styles', () => {
  const path = extendPath([c(2, 5)], c(7, 5));
  const edges = edgesOfPath(path);

  it('every segment is in the line colour until the server has answered', () => {
    expect(styleSegments(edges, null).every((s) => s.style === 'ok')).toBe(true);
  });

  it('the part the card says does not fit is red, the rest is the line colour', () => {
    const notFit = { edges: edges.slice(3), cells: [] };
    const styled = styleSegments(edges, notFit);
    expect(styled.map((s) => s.style)).toEqual(['ok', 'ok', 'ok', 'late', 'late']);
    expect(styled.map((s) => s.edge)).toEqual(edges);
  });

  it('a job that cannot start today is red from end to end', () => {
    expect(styleSegments(edges, 'all').every((s) => s.style === 'late')).toBe(true);
    expect(styleSquares([1, 2, 3], 'all').every((s) => s.style === 'late')).toBe(true);
  });

  it('pipe squares are styled the same way', () => {
    const styled = styleSquares([cell(1, 1), cell(2, 1), cell(3, 1)], {
      edges: [],
      cells: [cell(3, 1)],
    });
    expect(styled.map((s) => s.style)).toEqual(['ok', 'ok', 'late']);
    expect(pipeDraft([cell(1, 1)], null)).toMatchObject({ kind: 'pipe', segments: [], dots: [] });
  });

  it('a fence draft has its segments and a dot at each end', () => {
    const view = sampleView();
    const d = fenceDraft(view, 'tape', path, edges, { edges: edges.slice(4), cells: [] });
    expect(d.kind).toBe('tape');
    expect(d.segments).toHaveLength(5);
    expect(d.dots).toHaveLength(2);
  });

  it('dots: green where the end joins a fence, a white ring on open ground', () => {
    const view = sampleView();
    // From the middle fence (column line 20) out to open ground.
    const dots = snapDots(view, [c(20, 8), c(19, 8), c(18, 8)]);
    expect(dots.map((d) => d.joins)).toEqual([true, false]);
    expect(snapDots(view, [c(10, 10)])).toEqual([{ vx: 10, vy: 10, joins: false }]);
    expect(snapDots(view, [])).toEqual([]);
  });

  it('a remove mark is one style over the segments given', () => {
    const d = markDraft([{ line: 'h', index: hEdge(3, 3) }]);
    expect(d.segments).toEqual([{ edge: { line: 'h', index: hEdge(3, 3) }, style: 'remove' }]);
  });
});

describe('the length of a drawn line, counted as the job card counts it', () => {
  it('counts each new segment once: not the boundary, a gate, or fence of the same kind', () => {
    const view = sampleView();
    const h = (vy: number, x: number) => ({ line: 'h' as const, index: hEdge(vy, x) });
    view.fences.h[hEdge(8, 3)] = VIEW_FENCE.gate;
    view.fences.h[hEdge(8, 4)] = VIEW_FENCE.tape;
    view.fences.h[hEdge(8, 5)] = VIEW_FENCE.tapeDown;
    const edges = [h(0, 1), h(8, 2), h(8, 3), h(8, 4), h(8, 5), h(8, 6), h(8, 6)];
    // h(0, 1) is the boundary; h(8, 6) is drawn twice.
    expect(newFenceSegments(view, 'tape', edges)).toBe(3);
    // Permanent fence over the tape builds it too.
    expect(newFenceSegments(view, 'permanent', edges)).toBe(4);
    expect(newFenceSegments(view, 'contract', edges)).toBe(4);
  });

  it('counts new squares of pipe only, and uses the exact side of a square', () => {
    const view = sampleView();
    view.scale = { farmHa: 3000, haPerSquare: 2.88, sideM: 169.8 };
    view.water.pipe = [cell(10, 10)];
    const cells = [view.water.bore, cell(10, 10), cell(11, 10), cell(12, 10), cell(12, 10)];
    expect(newPipeSquares(view, cells)).toBe(2);
    // 3,000 ha over 1,040 squares is 2.8846 ha: 169.84 m a side.
    expect(squareSideM(view)).toBeCloseTo(169.84, 2);
    expect(draftMetres(view, pipeDraft(cells, null))).toBeCloseTo(2 * 169.84, 1);
    expect(draftMetres(view, markDraft([]))).toBe(0);
  });
});
