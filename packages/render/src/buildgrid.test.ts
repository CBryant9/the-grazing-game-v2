import { describe, expect, it } from 'vitest';
import {
  BUILD_GRID,
  bucketZoom,
  edgeCorner,
  fencedCorners,
  fencedEdges,
  gridBucket,
  gridKindFor,
  gridLines,
  gridStep,
  lengthWords,
  nearCorners,
  nearLines,
  showCornerDots,
  targetCentre,
} from './buildgrid';
import { GRID_H, GRID_W } from './grid';
import { cell, hEdge, sampleView, vEdge } from './testing/sampleView';

describe('the build grid', () => {
  it('each tool shows its own grid, and Look shows none', () => {
    expect(gridKindFor('corners')).toBe('lines');
    expect(gridKindFor('squares')).toBe('squares');
    expect(gridKindFor('square')).toBe('squares');
    expect(gridKindFor('edge')).toBe('fences');
    expect(gridKindFor('corner')).toBe('corners');
    expect(gridKindFor('look')).toBe('none');
  });

  it('thins out when zoomed out, so lines are never closer than the gap on screen', () => {
    // A phone showing the whole farm: about 9 pixels a square.
    expect(gridStep(9)).toBe(2);
    expect(gridStep(30)).toBe(1);
    expect(gridStep(4)).toBe(5);
    expect(gridStep(1)).toBe(10);
    for (const z of [1, 2, 3, 5, 8, 9, 12, 20, 40, 96]) {
      const step = gridStep(z);
      if (step < 10) expect(step * z).toBeGreaterThanOrEqual(BUILD_GRID.minGapPx);
    }
  });

  it('always draws the farm edge, whatever the step', () => {
    for (const step of [1, 2, 5, 10]) {
      const { cols, rows } = gridLines(step);
      expect(cols[0]).toBe(0);
      expect(cols[cols.length - 1]).toBe(GRID_W);
      expect(rows[0]).toBe(0);
      expect(rows[rows.length - 1]).toBe(GRID_H);
    }
    expect(gridLines(1).cols).toHaveLength(GRID_W + 1);
    expect(gridLines(10).rows).toEqual([0, 10, 20, GRID_H]);
  });

  it('shows a dot on every corner only when squares are big enough to tell them apart', () => {
    expect(showCornerDots(9)).toBe(false);
    expect(showCornerDots(BUILD_GRID.dotsFromPx)).toBe(true);
  });

  it('is drawn on zoom steps, four to a doubling, each within a few per cent of the true zoom', () => {
    for (const z of [3, 9.4, 17, 33, 80]) {
      const b = gridBucket(z);
      expect(Math.abs(bucketZoom(b) / z - 1)).toBeLessThan(0.1);
    }
    expect(gridBucket(16)).toBe(16);
    expect(gridBucket(16.2)).toBe(gridBucket(16));
  });

  it('lights the fences and the boundary as the things a line joins to', () => {
    const view = sampleView();
    const edges = fencedEdges(view);
    // The boundary all round and the fence down the middle.
    expect(edges).toHaveLength(2 * GRID_W + 3 * GRID_H);
    expect(edges).toContainEqual({ line: 'v', index: vEdge(4, 20) });
    expect(edges).toContainEqual({ line: 'h', index: hEdge(0, 3) });
    expect(edges).not.toContainEqual({ line: 'h', index: hEdge(5, 3) });
  });

  it('a hub can go on the corners of fences, and not on open ground', () => {
    const corners = fencedCorners(sampleView());
    expect(corners).toContainEqual({ vx: 20, vy: 10 });
    expect(corners).toContainEqual({ vx: 0, vy: 0 });
    expect(corners).not.toContainEqual({ vx: 10, vy: 10 });
  });

  it('the patch round the pointer stays on the farm', () => {
    expect(nearCorners({ vx: 0, vy: 0 }, 1)).toHaveLength(4);
    expect(nearCorners({ vx: 10, vy: 10 }, 1)).toHaveLength(9);
    // 3 by 3 corners: 3 rows of 2 lines across and 3 columns of 2 lines down.
    expect(nearLines({ vx: 10, vy: 10 }, 1)).toHaveLength(12);
    expect(nearLines({ vx: GRID_W, vy: GRID_H }, 1)).toHaveLength(4);
  });

  it('puts the target ring on the middle of what a tap picks', () => {
    expect(targetCentre({ kind: 'square', square: cell(3, 4) })).toEqual({ gx: 3.5, gy: 4.5 });
    expect(targetCentre({ kind: 'edge', edge: { line: 'h', index: hEdge(2, 5) } })).toEqual({
      gx: 5.5,
      gy: 2,
    });
    expect(targetCentre({ kind: 'corner', corner: { vx: 7, vy: 8 } })).toEqual({ gx: 7, gy: 8 });
    expect(edgeCorner({ line: 'v', index: vEdge(6, 9) })).toEqual({ vx: 9, vy: 6 });
  });

  it('says a line length in metres, then kilometres', () => {
    expect(lengthWords(0)).toBe('0 m');
    expect(lengthWords(300)).toBe('300 m');
    expect(lengthWords(1000)).toBe('1 km');
    expect(lengthWords(1250)).toBe('1.3 km');
    expect(lengthWords(12400)).toBe('12 km');
  });
});
