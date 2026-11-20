/**
 * The draft overlay: what a tool is about to build, drawn on top of the map.
 *
 * Pure data, so the page can build it and a test can read it. The page
 * hands the map one draft; the map redraws only the overlay.
 *
 * Styles:
 * - `ok`: the line's own colour (permanent, electric, tape or pipe). A line a
 *   contractor will build is `contract`: the contractor's colour.
 * - `late`: red. It does not fit in today's light, so it is not built.
 * - `remove`: what a Remove tool is about to take away.
 */

import { FARM_GRID_N, VIEW_FENCE, type FarmView, type ViewEdge } from '@gg/shared';
import { GRID_N } from './grid';
import { cornerJoinsFence, edgeKey, type Corner } from './lines';

export type DraftKind =
  'permanent' | 'contract' | 'electric' | 'tape' | 'netting' | 'pipe' | 'mark';
export type DraftStyle = 'ok' | 'late' | 'remove';

export interface DraftSegment {
  edge: ViewEdge;
  style: DraftStyle;
}

export interface DraftSquare {
  cell: number;
  style: DraftStyle;
}

/** A dot at a corner: green where a line joins a fence or the boundary, a white ring on open ground. */
export interface DraftDot extends Corner {
  joins: boolean;
}

export interface MapDraft {
  kind: DraftKind;
  segments: DraftSegment[];
  squares: DraftSquare[];
  dots: DraftDot[];
}

/** The pieces of a line that do not fit today, as the server's job card gives them. */
export interface NotFit {
  edges: readonly ViewEdge[];
  cells: readonly number[];
}

/**
 * Style the segments of a drawn line. `notFit` is what the job card says
 * does not fit: those are `late`, the rest `ok`. With `'all'` (the job
 * could not be started at all today) every segment is `late`. With null
 * (no card yet) every segment is `ok`.
 */
export function styleSegments(
  edges: readonly ViewEdge[],
  notFit: NotFit | 'all' | null,
): DraftSegment[] {
  if (notFit === 'all') return edges.map((edge) => ({ edge, style: 'late' as const }));
  const late = new Set((notFit?.edges ?? []).map(edgeKey));
  return edges.map((edge) => ({ edge, style: late.has(edgeKey(edge)) ? 'late' : 'ok' }));
}

/** The same for squares of pipe. */
export function styleSquares(
  cells: readonly number[],
  notFit: NotFit | 'all' | null,
): DraftSquare[] {
  if (notFit === 'all') return cells.map((cell) => ({ cell, style: 'late' as const }));
  const late = new Set(notFit?.cells ?? []);
  return cells.map((cell) => ({ cell, style: late.has(cell) ? 'late' : 'ok' }));
}

/**
 * Snap dots at the two ends of a path of corners. A single corner has one.
 * Green where the end joins an existing fence or the boundary.
 */
export function snapDots(view: FarmView, path: readonly Corner[]): DraftDot[] {
  if (path.length === 0) return [];
  const ends = path.length === 1 ? [path[0]!] : [path[0]!, path[path.length - 1]!];
  return ends.map((c) => ({ vx: c.vx, vy: c.vy, joins: cornerJoinsFence(view, c) }));
}

/** A draft of a fence or tape line. */
export function fenceDraft(
  view: FarmView,
  kind: 'permanent' | 'contract' | 'electric' | 'tape' | 'netting',
  path: readonly Corner[],
  edges: readonly ViewEdge[],
  notFit: NotFit | 'all' | null,
): MapDraft {
  return {
    kind,
    segments: styleSegments(edges, notFit),
    squares: [],
    dots: snapDots(view, path),
  };
}

/** A draft of a run of pipe. */
export function pipeDraft(cells: readonly number[], notFit: NotFit | 'all' | null): MapDraft {
  return { kind: 'pipe', segments: [], squares: styleSquares(cells, notFit), dots: [] };
}

/** A draft that marks segments for removal, or for a gate. */
export function markDraft(edges: readonly ViewEdge[], style: DraftStyle = 'remove'): MapDraft {
  return {
    kind: 'mark',
    segments: edges.map((edge) => ({ edge, style })),
    squares: [],
    dots: [],
  };
}

/** A draft that marks squares (a trough to take away, or a place to put one). */
export function markSquares(cells: readonly number[], style: DraftStyle = 'ok'): MapDraft {
  return {
    kind: 'mark',
    segments: [],
    squares: cells.map((cell) => ({ cell, style })),
    dots: [],
  };
}

// ---------------------------------------------------------------------------
// How long a drawn line is, counted as the job card counts it
// ---------------------------------------------------------------------------

/** The kinds of fence line a player draws. A team's line is permanent fence. */
export type FenceDraftKind = 'permanent' | 'contract' | 'electric' | 'tape' | 'netting';

/** The fence code each kind of line leaves on the map. */
const BUILDS: Record<FenceDraftKind, number> = {
  permanent: VIEW_FENCE.permanent,
  contract: VIEW_FENCE.permanent,
  electric: VIEW_FENCE.electric,
  tape: VIEW_FENCE.tape,
  netting: VIEW_FENCE.netting,
};

/**
 * Metres along one side of a square, exactly. The view's `sideM` is
 * rounded to a tenth; the farm is always 40 by 26 squares, so the exact
 * figure comes from its hectares (geometry, not a game rule).
 */
export function squareSideM(view: FarmView): number {
  const ha = view.scale.farmHa;
  return ha > 0 ? Math.sqrt((ha / FARM_GRID_N) * 10000) : view.scale.sideM;
}

/**
 * The new segments a fence line would build: each segment once, leaving out
 * the boundary, gates and segments that already carry this kind of fence,
 * as the server's job does. A tape or electric fence that is down counts:
 * it is put back up.
 */
export function newFenceSegments(
  view: FarmView,
  kind: FenceDraftKind,
  edges: readonly ViewEdge[],
): number {
  const want = BUILDS[kind];
  const seen = new Set<string>();
  let n = 0;
  for (const e of edges) {
    const key = edgeKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    const code = (e.line === 'h' ? view.fences.h : view.fences.v)[e.index] ?? VIEW_FENCE.none;
    if (code === VIEW_FENCE.boundary || code === VIEW_FENCE.gate || code === want) continue;
    n++;
  }
  return n;
}

/** The new squares of pipe a run would lay: each square once, leaving out pipe already there and the bore. */
export function newPipeSquares(view: FarmView, cells: readonly number[]): number {
  const piped = new Set<number>([...view.water.pipe, ...view.water.pipeDry, view.water.bore]);
  const fresh = new Set<number>();
  for (const c of cells) if (c >= 0 && c < GRID_N && !piped.has(c)) fresh.add(c);
  return fresh.size;
}

/** Metres of new fence a line builds, as the job card will say. */
export const newFenceMetres = (
  view: FarmView,
  kind: FenceDraftKind,
  edges: readonly ViewEdge[],
): number => newFenceSegments(view, kind, edges) * squareSideM(view);

/** Metres of new pipe a run lays, as the job card will say. */
export const newPipeMetres = (view: FarmView, cells: readonly number[]): number =>
  newPipeSquares(view, cells) * squareSideM(view);

/** Metres of new line in a draft (0 for a mark), for the length beside the line's end. */
export function draftMetres(view: FarmView, d: MapDraft): number {
  if (d.kind === 'mark') return 0;
  if (d.kind === 'pipe')
    return newPipeMetres(
      view,
      d.squares.map((q) => q.cell),
    );
  return newFenceMetres(
    view,
    d.kind,
    d.segments.map((q) => q.edge),
  );
}
