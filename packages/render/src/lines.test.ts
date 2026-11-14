import { VIEW_FENCE } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { lookAt, worldToScreen, type Viewport } from './camera';
import { GROUND_SQUASH as K } from './grid';
import {
  cornerJoinsFence,
  cornerVertex,
  edgeBetween,
  edgesAtCorner,
  edgesOfPath,
  extendPath,
  extendSquares,
  fenceCodeAt,
  nearestCorner,
  nearestEdge,
  sameEdge,
  startPath,
  startSquares,
  tapeRun,
  vertexCorner,
  type Corner,
} from './lines';
import { cell, hEdge, sampleView, vEdge } from './testing/sampleView';

const VP: Viewport = { width: 1000, height: 700 };
const c = (vx: number, vy: number): Corner => ({ vx, vy });

/** A screen point for a ground position, with the camera that made it. */
function at(zoom: number, gx: number, gy: number, cx = 20, cy = 9) {
  const cam = lookAt(VP, zoom, cx, cy * K);
  return { cam, ...worldToScreen(cam, VP, gx, gy * K) };
}

describe('the segment under a finger', () => {
  for (const zoom of [12, 26, 60, 96]) {
    it(`finds a row line and a column line at ${zoom} px a square`, () => {
      const h = at(zoom, 20.5, 9, 20, 9);
      const hit = nearestEdge(h.cam, VP, h.x, h.y + 4);
      expect(hit?.edge).toEqual({ line: 'h', index: hEdge(9, 20) });
      const v = at(zoom, 22, 9.5, 20, 9);
      const hitV = nearestEdge(v.cam, VP, v.x - 4, v.y);
      expect(hitV?.edge).toEqual({ line: 'v', index: vEdge(9, 22) });
    });
  }

  it('is null when nothing is within a touch of it', () => {
    const p = at(96, 20.5, 9.5);
    expect(nearestEdge(p.cam, VP, p.x, p.y)).toBeNull();
    expect(nearestEdge(p.cam, VP, p.x, p.y, 1000)).not.toBeNull();
  });

  it('takes the nearer of two lines', () => {
    const p = at(60, 20.4, 9.05, 20, 9);
    expect(nearestEdge(p.cam, VP, p.x, p.y)?.edge).toEqual({ line: 'h', index: hEdge(9, 20) });
    const q = at(60, 20.95, 9.3, 20, 9);
    expect(nearestEdge(q.cam, VP, q.x, q.y)?.edge).toEqual({ line: 'v', index: vEdge(9, 21) });
  });

  it('leaves out segments the caller does not want', () => {
    const view = sampleView();
    view.fences.h[hEdge(9, 20)] = VIEW_FENCE.tape;
    const p = at(26, 20.5, 9.5, 20, 9);
    const wanted = (e: { line: 'h' | 'v'; index: number }): boolean =>
      fenceCodeAt(view, e) !== VIEW_FENCE.none;
    const hit = nearestEdge(p.cam, VP, p.x, p.y, 40, wanted);
    expect(hit?.edge).toEqual({ line: 'h', index: hEdge(9, 20) });
  });

  it('is held to the farm', () => {
    const cam = lookAt(VP, 20, 0.5, 0.5);
    const off = worldToScreen(cam, VP, -3, -3);
    expect(nearestEdge(cam, VP, off.x, off.y, 10)).toBeNull();
  });
});

describe('the corner under a finger', () => {
  for (const zoom of [12, 26, 60, 96]) {
    it(`rounds to the nearest corner at ${zoom} px a square`, () => {
      const p = at(zoom, 21.2, 10.1, 20, 9);
      expect(nearestCorner(p.cam, VP, p.x, p.y)).toMatchObject({ vx: 21, vy: 10 });
    });
  }

  it('can be given a limit', () => {
    const p = at(96, 21.5, 10.5);
    expect(nearestCorner(p.cam, VP, p.x, p.y, 20)).toBeNull();
    expect(nearestCorner(p.cam, VP, p.x, p.y)).not.toBeNull();
  });

  it('is held to the farm: a drag that wanders off keeps to the boundary', () => {
    const cam = lookAt(VP, 12, 20, 9 * K);
    const off = worldToScreen(cam, VP, 45, -2);
    expect(nearestCorner(cam, VP, off.x, off.y)).toMatchObject({ vx: 40, vy: 0 });
  });

  it('is numbered as the engine numbers corners', () => {
    expect(cornerVertex(c(3, 2))).toBe(2 * 41 + 3);
    expect(vertexCorner(2 * 41 + 3)).toEqual(c(3, 2));
  });
});

describe('the path a drag makes along the grid', () => {
  it('walks straight along a row line', () => {
    const p = extendPath([c(2, 3)], c(5, 3));
    expect(p).toEqual([c(2, 3), c(3, 3), c(4, 3), c(5, 3)]);
    expect(edgesOfPath(p)).toEqual([
      { line: 'h', index: hEdge(3, 2) },
      { line: 'h', index: hEdge(3, 3) },
      { line: 'h', index: hEdge(3, 4) },
    ]);
  });

  it('walks down a column line', () => {
    const p = extendPath([c(7, 1)], c(7, 3));
    expect(edgesOfPath(p)).toEqual([
      { line: 'v', index: vEdge(1, 7) },
      { line: 'v', index: vEdge(2, 7) },
    ]);
  });

  it('turns a corner: the long way first, then the short way', () => {
    expect(extendPath([c(0, 0)], c(3, 1))).toEqual([c(0, 0), c(1, 0), c(2, 0), c(3, 0), c(3, 1)]);
    expect(extendPath([c(0, 0)], c(1, 3))).toEqual([c(0, 0), c(0, 1), c(0, 2), c(0, 3), c(1, 3)]);
  });

  it('follows a finger one corner at a time, with a corner where it turns', () => {
    let p: Corner[] = [c(5, 5)];
    for (const t of [c(6, 5), c(7, 5), c(7, 6), c(7, 7), c(8, 7)]) p = extendPath(p, t);
    expect(p).toEqual([c(5, 5), c(6, 5), c(7, 5), c(7, 6), c(7, 7), c(8, 7)]);
  });

  it('dragging back over the line undoes it', () => {
    const p = extendPath([c(0, 0), c(1, 0), c(2, 0), c(3, 0)], c(1, 0));
    expect(p).toEqual([c(0, 0), c(1, 0)]);
  });

  it('every step is one segment, so the path has no gaps', () => {
    const p = extendPath([c(10, 10)], c(3, 22));
    expect(edgesOfPath(p)).toHaveLength(p.length - 1);
    for (let i = 1; i < p.length; i++) {
      expect(edgeBetween(p[i - 1]!, p[i]!)).not.toBeNull();
    }
  });

  it('is extended by dragging again from its end, or from its start turned round', () => {
    const line = [c(2, 2), c(3, 2), c(4, 2)];
    expect(startPath(line, c(4, 2))).toEqual(line);
    expect(startPath(line, c(2, 2))).toEqual([c(4, 2), c(3, 2), c(2, 2)]);
    expect(startPath(line, c(9, 9))).toEqual([c(9, 9)]);
    expect(extendPath(startPath(line, c(4, 2)), c(4, 4))).toEqual([...line, c(4, 3), c(4, 4)]);
  });

  it('edges between corners that are not a step apart are none', () => {
    expect(edgeBetween(c(0, 0), c(2, 0))).toBeNull();
    expect(edgeBetween(c(0, 0), c(1, 1))).toBeNull();
  });
});

describe('the squares a pipe drag runs over', () => {
  it('goes square by square, the long way first', () => {
    expect(extendSquares([cell(2, 2)], cell(5, 3))).toEqual([
      cell(2, 2),
      cell(3, 2),
      cell(4, 2),
      cell(5, 2),
      cell(5, 3),
    ]);
  });
  it('undoes when dragged back, and carries on from either end', () => {
    expect(extendSquares([cell(1, 1), cell(2, 1), cell(3, 1)], cell(2, 1))).toEqual([
      cell(1, 1),
      cell(2, 1),
    ]);
    const run = [cell(1, 1), cell(2, 1)];
    expect(startSquares(run, cell(2, 1))).toEqual(run);
    expect(startSquares(run, cell(1, 1))).toEqual([cell(2, 1), cell(1, 1)]);
    expect(startSquares(run, cell(9, 9))).toEqual([cell(9, 9)]);
  });
  it('ignores a point off the farm', () => {
    expect(extendSquares([cell(1, 1)], -1)).toEqual([cell(1, 1)]);
  });
});

describe('what a line would join', () => {
  it('a corner on the boundary or on a fence joins it, open ground does not', () => {
    const view = sampleView();
    expect(cornerJoinsFence(view, c(0, 5))).toBe(true);
    expect(cornerJoinsFence(view, c(20, 5))).toBe(true);
    expect(cornerJoinsFence(view, c(10, 5))).toBe(false);
  });
  it('four segments meet at a corner, fewer on the edge of the farm', () => {
    expect(edgesAtCorner(c(10, 10))).toHaveLength(4);
    expect(edgesAtCorner(c(0, 0))).toHaveLength(2);
    expect(edgesAtCorner(c(40, 5))).toHaveLength(3);
  });
});

describe('a run of tape', () => {
  it('is the whole straight run, up or down, both ways', () => {
    const view = sampleView();
    for (const x of [4, 5, 6]) view.fences.h[hEdge(8, x)] = VIEW_FENCE.tape;
    view.fences.h[hEdge(8, 5)] = VIEW_FENCE.tapeDown;
    view.fences.h[hEdge(8, 8)] = VIEW_FENCE.tape;
    const run = tapeRun(view, { line: 'h', index: hEdge(8, 5) });
    expect(run).toEqual([4, 5, 6].map((x) => ({ line: 'h', index: hEdge(8, x) })));
    expect(sameEdge(run[0]!, run[0]!)).toBe(true);
  });
  it('goes down a column line too', () => {
    const view = sampleView();
    for (const y of [2, 3, 4]) view.fences.v[vEdge(y, 10)] = VIEW_FENCE.tape;
    expect(tapeRun(view, { line: 'v', index: vEdge(3, 10) })).toHaveLength(3);
  });
  it('is just the segment when it is not tape', () => {
    const view = sampleView();
    const e = { line: 'v' as const, index: vEdge(3, 20) };
    expect(tapeRun(view, e)).toEqual([e]);
  });
});
