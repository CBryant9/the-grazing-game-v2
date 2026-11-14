import 'server-only';
import type { Action, EdgeRef, FenceKind } from '@gg/engine';
import { FARM_GRID_H, FARM_GRID_N, FARM_GRID_W } from '@gg/shared';

/**
 * Checking the build actions a browser asks for. The browser is never
 * trusted: every number is a whole number in range, every list is capped,
 * and anything else is refused before the engine sees it.
 */

const H_EDGES = (FARM_GRID_H + 1) * FARM_GRID_W;
const V_EDGES = FARM_GRID_H * (FARM_GRID_W + 1);
const CORNERS = (FARM_GRID_W + 1) * (FARM_GRID_H + 1);

/** The longest line a request may carry: a fence round the whole farm and then some. */
export const MAX_LINE_PIECES = 400;

const FENCES: readonly string[] = ['permanent', 'electric', 'tape'];

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;

function edgeOf(v: unknown): EdgeRef | null {
  if (typeof v !== 'object' || v === null) return null;
  const e = v as Record<string, unknown>;
  if (e.line === 'h') {
    const index = int(e.index, 0, H_EDGES - 1);
    return index === null ? null : { line: 'h', index };
  }
  if (e.line === 'v') {
    const index = int(e.index, 0, V_EDGES - 1);
    return index === null ? null : { line: 'v', index };
  }
  return null;
}

function edgesOf(v: unknown): EdgeRef[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_LINE_PIECES) return null;
  const out: EdgeRef[] = [];
  for (const raw of v as unknown[]) {
    const e = edgeOf(raw);
    if (!e) return null;
    out.push(e);
  }
  return out;
}

function cellsOf(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_LINE_PIECES) return null;
  const out: number[] = [];
  for (const raw of v as unknown[]) {
    const c = int(raw, 0, FARM_GRID_N - 1);
    if (c === null) return null;
    out.push(c);
  }
  return out;
}

/** The fence, gate, pipe, trough and hub actions. Null when the request is not one of them, or is not well formed. */
export function parseBuildAction(a: Record<string, unknown>): Action | null {
  switch (a.type) {
    case 'buildFence': {
      const edges = edgesOf(a.edges);
      if (!edges || typeof a.fence !== 'string' || !FENCES.includes(a.fence)) return null;
      return { type: 'buildFence', edges, fence: a.fence as FenceKind };
    }
    case 'removeFence': {
      const edges = edgesOf(a.edges);
      return edges ? { type: 'removeFence', edges } : null;
    }
    case 'rollUpTape':
    case 'fixFence':
    case 'placeGate':
    case 'removeGate': {
      const edge = edgeOf(a.edge);
      return edge ? ({ type: a.type, edge } as Action) : null;
    }
    case 'setGate': {
      const edge = edgeOf(a.edge);
      return edge && typeof a.open === 'boolean' ? { type: 'setGate', edge, open: a.open } : null;
    }
    case 'layPipe': {
      const cells = cellsOf(a.cells);
      return cells ? { type: 'layPipe', cells } : null;
    }
    case 'placeTrough':
    case 'removeTrough':
    case 'placeSquareHub':
    case 'placePortable': {
      const cell = int(a.cell, 0, FARM_GRID_N - 1);
      return cell === null ? null : ({ type: a.type, cell } as Action);
    }
    case 'moveTrough': {
      const from = int(a.from, 0, FARM_GRID_N - 1);
      const to = int(a.to, 0, FARM_GRID_N - 1);
      return from === null || to === null ? null : { type: 'moveTrough', from, to };
    }
    case 'placeFenceHub':
    case 'removeHub': {
      const vertex = int(a.vertex, 0, CORNERS - 1);
      return vertex === null ? null : ({ type: a.type, vertex } as Action);
    }
    case 'movePortable': {
      const port = int(a.port, 0, 1e6);
      const cell = int(a.cell, 0, FARM_GRID_N - 1);
      return port === null || cell === null ? null : { type: 'movePortable', port, cell };
    }
    case 'removePortable': {
      const port = int(a.port, 0, 1e6);
      return port === null ? null : { type: 'removePortable', port };
    }
    default:
      return null;
  }
}
