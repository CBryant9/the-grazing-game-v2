import { FARM_GRID_H, FARM_GRID_W, type FarmView } from '@gg/shared';
import { markSquares } from '@gg/render/draft';
import type { MapDraft } from '@gg/render/draft';

/**
 * The pure parts of sowing: picking squares by dragging a box on the map,
 * and "all the arable land in this paddock". The server decides what a
 * square can take and what it costs; this only says which squares were
 * picked.
 */

export interface SowPick {
  /** The paddock whose sheet is open. */
  paddockId: number;
  /** True while the map takes drags as squares to sow. */
  picking: boolean;
  /** The squares picked by dragging, arable ones only. */
  cells: number[];
  /** Where the drag in hand began, or null between drags. */
  from: number | null;
  /** The box the drag in hand has reached, shown before it is let go. */
  live: number[];
}

export const newPick = (paddockId: number): SowPick => ({
  paddockId,
  picking: false,
  cells: [],
  from: null,
  live: [],
});

/** Every square in the box between two squares, corner to corner. Empty if either is off the farm. */
export function rectCells(a: number, b: number): number[] {
  const n = FARM_GRID_W * FARM_GRID_H;
  if (a < 0 || b < 0 || a >= n || b >= n) return [];
  const [ax, ay] = [a % FARM_GRID_W, Math.floor(a / FARM_GRID_W)];
  const [bx, by] = [b % FARM_GRID_W, Math.floor(b / FARM_GRID_W)];
  const out: number[] = [];
  for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) out.push(y * FARM_GRID_W + x);
  }
  return out;
}

/** Keep only the arable squares. */
export function arableOnly(cells: readonly number[], view: Pick<FarmView, 'squares'>): number[] {
  return cells.filter((c) => view.squares.arable[c] === 1);
}

/** Squares picked so far plus more, each once, in order. */
export function union(a: readonly number[], b: readonly number[]): number[] {
  return [...new Set([...a, ...b])];
}

/** All the arable squares in a paddock. */
export function paddockArable(view: Pick<FarmView, 'squares'>, paddockId: number): number[] {
  const out: number[] = [];
  const { arable, paddock } = view.squares;
  for (let i = 0; i < arable.length; i++) {
    if (arable[i] === 1 && paddock[i] === paddockId) out.push(i);
  }
  return out;
}

/** A drag in hand: begin, move or end. Returns the pick after it. */
export function dragPick(
  pick: SowPick,
  view: Pick<FarmView, 'squares'>,
  e: { phase: 'start' | 'move' | 'end'; square: number },
): SowPick {
  if (!pick.picking) return pick;
  if (e.phase === 'start') {
    return { ...pick, from: e.square, live: arableOnly(rectCells(e.square, e.square), view) };
  }
  if (pick.from === null) return pick;
  const box = arableOnly(rectCells(pick.from, e.square), view);
  if (e.phase === 'move') return { ...pick, live: box };
  return { ...pick, from: null, live: [], cells: union(pick.cells, box) };
}

/** What the map shows for the squares picked and the box being dragged. Null with none. */
export function pickDraft(pick: SowPick | null): MapDraft | null {
  if (!pick || !pick.picking) return null;
  const all = union(pick.cells, pick.live);
  return all.length ? markSquares(all, 'ok') : null;
}

/** The squares the sowing covers: the ones picked, or all the paddock's arable land. */
export function sowCells(
  pick: SowPick,
  view: Pick<FarmView, 'squares'>,
  mode: 'all' | 'picked',
): number[] {
  return mode === 'all' ? paddockArable(view, pick.paddockId) : pick.cells;
}
