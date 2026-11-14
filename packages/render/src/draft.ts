/**
 * The draft overlay: what a tool is about to build, drawn on top of the map.
 *
 * Pure data, so the page can build it and a test can read it. The page
 * hands the map one draft; the map redraws only the overlay.
 *
 * Styles:
 * - `ok`: the line's own colour (permanent, electric, tape or pipe).
 * - `late`: red. It does not fit in today's light, so it is not built.
 * - `remove`: what a Remove tool is about to take away.
 */

import type { FarmView, ViewEdge } from '@gg/shared';
import { cornerJoinsFence, edgeKey, type Corner } from './lines';

export type DraftKind = 'permanent' | 'electric' | 'tape' | 'pipe' | 'mark';
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
  kind: 'permanent' | 'electric' | 'tape',
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
