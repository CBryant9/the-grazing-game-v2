/**
 * The build grid: the fence lines and corners a tool can use, drawn while a
 * build tool is picked (docs/VISUALS.md, "The grid while building").
 *
 * Pure arithmetic, so a test can read it and the map draws from it. Sizes
 * are in screen pixels, so the grid is crisp at every zoom. Zoomed out, the
 * grid thins to every 2nd, 5th or 10th line so it never turns to noise; near
 * the pointer every line and corner shows.
 */

import { VIEW_FENCE, type FarmView, type ViewEdge } from '@gg/shared';
import { GRID_H, GRID_W, edgeEnds, hIndex, vIndex } from './grid';
import { cornerJoinsFence, type Corner } from './lines';

/** What the grid shows for each map tool. */
export type GridKind =
  /** Fence: the lines and corners a line can run along, the fences it can join. */
  | 'lines'
  /** Pipe, a trough or a portable trough: the squares. */
  | 'squares'
  /** Gate or Remove: the fences and gates a tap can pick. */
  | 'fences'
  /** Water hub on a corner: the fence corners a hub can go on. */
  | 'corners'
  | 'none';

/** The grid each map tool shows. */
export function gridKindFor(tool: string): GridKind {
  switch (tool) {
    case 'corners':
      return 'lines';
    case 'squares':
    case 'square':
      return 'squares';
    case 'edge':
      return 'fences';
    case 'corner':
      return 'corners';
    default:
      return 'none';
  }
}

/** The grid's look, in screen pixels and strengths 0 to 1. */
export const BUILD_GRID = {
  /** Lines closer than this on screen are thinned out. */
  minGapPx: 12,
  /** The steps the grid thins through, in squares. */
  steps: [1, 2, 5, 10] as const,
  /** Every corner gets a dot once squares are at least this many pixels across. */
  dotsFromPx: 18,
  lineColour: 0xffffff,
  lineAlpha: 0.2,
  lineWidthPx: 1,
  /** The boundary line of the lattice, a touch stronger. */
  edgeAlpha: 0.32,
  dotRadiusPx: 1.6,
  dotAlpha: 0.5,
  /** Around the pointer: how many squares out, and how strong. */
  nearRadius: 3,
  nearAlpha: 0.6,
  nearDotRadiusPx: 2.2,
  /** The soft light under fences and the boundary, the things a line joins to. */
  haloColour: 0xd8ffb0,
  haloAlpha: 0.42,
  haloWidthPx: 9,
  /** A target ring under the pointer or finger, for the tap tools. */
  ringRadiusPx: 15,
} as const;

/** The zoom step the grid is drawn for: four to a doubling, so a pinch redraws it a few times, not every frame. */
export const gridBucket = (pxPerSquare: number): number => Math.round(Math.log2(pxPerSquare) * 4);

/** The zoom a step stands for, in screen pixels per square. */
export const bucketZoom = (bucket: number): number => Math.pow(2, bucket / 4);

/** How many squares apart the grid lines are at a zoom (screen pixels per square). */
export function gridStep(pxPerSquare: number): number {
  for (const s of BUILD_GRID.steps) if (s * pxPerSquare >= BUILD_GRID.minGapPx) return s;
  return BUILD_GRID.steps[BUILD_GRID.steps.length - 1]!;
}

/**
 * The grid lines to draw at a step: column lines (0 to 40) and row lines
 * (0 to 26). Every `step`-th line, plus the two outside lines, so the edge
 * of the farm always shows.
 */
export function gridLines(step: number): { cols: number[]; rows: number[] } {
  const pick = (last: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i <= last; i += step) out.push(i);
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  };
  return { cols: pick(GRID_W), rows: pick(GRID_H) };
}

/** True when every corner gets its own dot at this zoom. */
export const showCornerDots = (pxPerSquare: number): boolean =>
  pxPerSquare >= BUILD_GRID.dotsFromPx;

/** Every segment with a fence, a gate or the boundary on it: what a line joins to and a tap can pick. */
export function fencedEdges(view: FarmView): ViewEdge[] {
  const out: ViewEdge[] = [];
  view.fences.h.forEach((code, index) => {
    if (code !== VIEW_FENCE.none) out.push({ line: 'h', index });
  });
  view.fences.v.forEach((code, index) => {
    if (code !== VIEW_FENCE.none) out.push({ line: 'v', index });
  });
  return out;
}

/** Every corner on a fence, a gate or the boundary: where a water hub can go, and where a line joins. */
export function fencedCorners(view: FarmView): Corner[] {
  const out: Corner[] = [];
  for (let vy = 0; vy <= GRID_H; vy++) {
    for (let vx = 0; vx <= GRID_W; vx++) {
      if (cornerJoinsFence(view, { vx, vy })) out.push({ vx, vy });
    }
  }
  return out;
}

/** The short lines of the grid within `radius` squares of a corner, held to the farm. */
export function nearLines(c: Corner, radius: number = BUILD_GRID.nearRadius): ViewEdge[] {
  const out: ViewEdge[] = [];
  const x0 = Math.max(0, c.vx - radius);
  const x1 = Math.min(GRID_W, c.vx + radius);
  const y0 = Math.max(0, c.vy - radius);
  const y1 = Math.min(GRID_H, c.vy + radius);
  for (let vy = y0; vy <= y1; vy++) {
    for (let x = x0; x < x1; x++) out.push({ line: 'h', index: hIndex(vy, x) });
  }
  for (let vx = x0; vx <= x1; vx++) {
    for (let y = y0; y < y1; y++) out.push({ line: 'v', index: vIndex(y, vx) });
  }
  return out;
}

/** The corners within `radius` squares of a corner, held to the farm. */
export function nearCorners(c: Corner, radius: number = BUILD_GRID.nearRadius): Corner[] {
  const out: Corner[] = [];
  for (let vy = Math.max(0, c.vy - radius); vy <= Math.min(GRID_H, c.vy + radius); vy++) {
    for (let vx = Math.max(0, c.vx - radius); vx <= Math.min(GRID_W, c.vx + radius); vx++) {
      out.push({ vx, vy });
    }
  }
  return out;
}

/** A length as the map's label shows it: "300 m" under a kilometre, "1.2 km" past it. */
export function lengthWords(metres: number): string {
  const m = Math.max(0, Math.round(metres));
  if (m < 1000) return `${m} m`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1).replace(/\.0$/, '') : Math.round(km)} km`;
}

/** The corner a segment starts from. */
export function edgeCorner(edge: ViewEdge): Corner {
  const [x0, y0] = edgeEnds(edge);
  return { vx: x0, vy: y0 };
}

/** A thing a tap tool can pick: a segment, a square or a corner. */
export type BuildTarget =
  | { kind: 'edge'; edge: ViewEdge }
  | { kind: 'square'; square: number }
  | { kind: 'corner'; corner: Corner };

/** Where the target ring sits on a picked thing, in ground coordinates: the middle of a segment or square, or the corner. */
export function targetCentre(t: BuildTarget): { gx: number; gy: number } {
  if (t.kind === 'edge') {
    const [x0, y0, x1, y1] = edgeEnds(t.edge);
    return { gx: (x0 + x1) / 2, gy: (y0 + y1) / 2 };
  }
  if (t.kind === 'square') {
    return { gx: (t.square % GRID_W) + 0.5, gy: Math.floor(t.square / GRID_W) + 0.5 };
  }
  return { gx: t.corner.vx, gy: t.corner.vy };
}
