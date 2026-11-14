import type { FarmView, ViewEdge } from '@gg/shared';
import type { MapDraft, NotFit } from '@gg/render/draft';
import { fenceDraft, markDraft, markSquares, pipeDraft } from '@gg/render/draft';
import { edgesOfPath, tapeRun, vertexCorner, type Corner } from '@gg/render/lines';
import type { BuildToolId, EdgeWire, FenceKindId, JobCardWire, Shown, SimpleAction } from './types';

/**
 * The build tools as the page holds them: what the player has drawn or
 * picked, where the job card is up to, and what the map should show. Pure
 * functions, so each can be tested without a screen. Nothing here knows a
 * price or a rule: the server's job card carries those.
 */

/** A tool, or the card for a fence that is down (opened from the map or the things to do). */
export type BuildTool = BuildToolId | 'fix';

/** Which tool the map should run: what a drag and a tap mean. */
export type MapToolName = 'look' | 'corners' | 'squares' | 'edge' | 'square' | 'corner';

export type HubOn = 'corner' | 'square';

/** Something picked with a tap, waiting for the player to confirm it. */
export interface PickedJob {
  action: SimpleAction;
  /** What it is, in a few words, for the card's heading. */
  title: string;
  confirm: string;
  /** What to mark on the map. */
  edges: readonly EdgeWire[];
  cells: readonly number[];
  corner: Corner | null;
  /** 'remove' marks it lilac round white (red is only for what does not fit today). */
  style: 'ok' | 'remove';
}

/** A trough or water hub that was tapped: the player says what to do with it. */
export interface TroughChoice {
  /** 'hub' is a hub on a fence line or corner; 'squareHub' a hub on a square. */
  kind: 'portable' | 'trough' | 'hub' | 'squareHub';
  /** The square, or for a hub on a corner the square below and right of it (for the card's place). */
  cell: number;
  /** A portable trough's id. 0 for anything else. */
  port: number;
  /** A hub on a corner: its corner. Null for anything else. */
  corner?: Corner | null;
}

export type BuildPhase =
  /** A tool is picked and nothing is drawn or chosen yet. */
  | 'pick'
  /** The job card is being asked for. */
  | 'previewing'
  | 'confirm'
  /** The job cannot be done as it stands: `message` says why. */
  | 'blocked'
  | 'applying'
  /** Done. The tool is back to Look; the result shows until it is dismissed. */
  | 'done';

export interface BuildState {
  tool: BuildTool;
  fence: FenceKindId;
  hubOn: HubOn;
  /** Fence: the corners the line runs through, in order. */
  corners: Corner[];
  /** Pipe: the squares the pipe runs over, in order. */
  cells: number[];
  /** A tap-picked job (gate, trough, remove and so on). */
  picked: PickedJob | null;
  /** A trough was tapped and the player is choosing. */
  choice: TroughChoice | null;
  /** The player chose Move, and the next tap on a square is the new place. */
  moving: TroughChoice | null;
  phase: BuildPhase;
  card?: JobCardWire;
  message?: string;
  /** True when the server said none of the line fits today, so all of it is red. */
  allLate: boolean;
  /** What the card on show was made for: Confirm sends exactly this. */
  shown?: Shown;
}

export const newBuild = (tool: BuildTool, over: Partial<BuildState> = {}): BuildState => ({
  tool,
  // A normal fence is the one a grazier goes for. Electric is picked on purpose (Claudia, 14 Nov 2026).
  fence: 'permanent',
  hubOn: 'corner',
  corners: [],
  cells: [],
  picked: null,
  choice: null,
  moving: null,
  phase: 'pick',
  allLate: false,
  ...over,
});

export const isLineTool = (tool: BuildTool): tool is 'fence' | 'pipe' =>
  tool === 'fence' || tool === 'pipe';

/** The segments a fence line runs along. */
export const fenceEdges = (b: BuildState): ViewEdge[] => edgesOfPath(b.corners);

/** The action for the line as drawn, or null if nothing is drawn yet. */
export function lineAction(b: BuildState): SimpleAction | null {
  if (b.tool === 'fence') {
    const edges = fenceEdges(b);
    return edges.length ? { type: 'buildFence', edges, fence: b.fence } : null;
  }
  if (b.tool === 'pipe') {
    return b.cells.length >= 1 ? { type: 'layPipe', cells: b.cells } : null;
  }
  return null;
}

/** What the map's pointer does for this state. Back to Look once a job is done. */
export function mapToolFor(b: BuildState | null): MapToolName {
  if (!b || b.phase === 'done') return 'look';
  switch (b.tool) {
    case 'fence':
      return 'corners';
    case 'pipe':
      return 'squares';
    case 'gate':
    case 'remove':
      return 'edge';
    case 'trough':
    case 'portable':
      return 'square';
    case 'hub':
      // Moving a hub on a corner asks for a corner; anything else on the hub tool as picked.
      if (b.moving?.kind === 'hub') return 'corner';
      if (b.moving?.kind === 'squareHub') return 'square';
      return b.hubOn === 'corner' ? 'corner' : 'square';
    case 'fix':
      return 'look';
  }
}

const notFitOf = (b: BuildState): NotFit | 'all' | null => {
  if (b.allLate) return 'all';
  const line = b.phase === 'confirm' ? b.card?.line : null;
  return line ? { edges: line.doesNotFit.edges, cells: line.doesNotFit.cells } : null;
};

/** The draft the map draws for this state, or null. Only the overlay redraws when it changes. */
export function buildDraft(b: BuildState | null, view: FarmView): MapDraft | null {
  if (!b || b.phase === 'done') return null;
  if (b.tool === 'fence') {
    if (b.corners.length === 0) return null;
    return fenceDraft(view, b.fence, b.corners, fenceEdges(b), notFitOf(b));
  }
  if (b.tool === 'pipe') {
    return b.cells.length ? pipeDraft(b.cells, notFitOf(b)) : null;
  }
  const p = b.picked;
  if (p) {
    if (p.edges.length) return markDraft(p.edges, p.style);
    if (p.cells.length) return markSquares(p.cells, p.style);
    if (p.corner) {
      return { kind: 'mark', segments: [], squares: [], dots: [{ ...p.corner, joins: true }] };
    }
  }
  const c = b.choice ?? b.moving;
  if (c?.corner)
    return { kind: 'mark', segments: [], squares: [], dots: [{ ...c.corner, joins: true }] };
  return c ? markSquares([c.cell], 'ok') : null;
}

/** The point on the ground the card sits beside (the end of the line, or the thing picked), or null. */
export function buildAnchor(b: BuildState | null): { gx: number; gy: number } | null {
  if (!b || b.phase === 'done') return null;
  const mid = (e: EdgeWire): { gx: number; gy: number } => {
    const across = e.line === 'h';
    const x = across ? e.index % 40 : e.index % 41;
    const y = across ? Math.floor(e.index / 40) : Math.floor(e.index / 41);
    return across ? { gx: x + 0.5, gy: y } : { gx: x, gy: y + 0.5 };
  };
  const cellAt = (cell: number): { gx: number; gy: number } => ({
    gx: (cell % 40) + 0.5,
    gy: Math.floor(cell / 40) + 0.5,
  });
  if (b.tool === 'fence') {
    const end = b.corners[b.corners.length - 1];
    return end ? { gx: end.vx, gy: end.vy } : null;
  }
  if (b.tool === 'pipe') {
    const end = b.cells[b.cells.length - 1];
    return end === undefined ? null : cellAt(end);
  }
  const p = b.picked;
  if (p) {
    if (p.edges.length) return mid(p.edges[Math.floor(p.edges.length / 2)]!);
    if (p.cells.length) return cellAt(p.cells[0]!);
    if (p.corner) return { gx: p.corner.vx, gy: p.corner.vy };
  }
  const c = b.choice ?? b.moving;
  if (c?.corner) return { gx: c.corner.vx, gy: c.corner.vy };
  return c ? cellAt(c.cell) : null;
}

/** Fence length asked for, in metres, before the server has answered. Segments already built are counted too. */
export const drawnMetres = (b: BuildState, sideM: number): number =>
  (b.tool === 'fence' ? fenceEdges(b).length : b.cells.length) * sideM;

/** Total length the card reports: the part that fits and the part that does not. Null with no line on the card. */
export function cardMetres(card: JobCardWire | undefined): {
  fits: number;
  late: number;
  total: number;
} | null {
  const l = card?.line;
  if (!l) return null;
  return {
    fits: l.fits.metres,
    late: l.doesNotFit.metres,
    total: l.fits.metres + l.doesNotFit.metres,
  };
}

/** The corner a hub vertex number stands on. */
export const hubCorner = (vertex: number): Corner => vertexCorner(vertex);

/** The run of tape a tapped segment rolls up with, or just the segment. */
export function runFor(view: FarmView, edge: ViewEdge): ViewEdge[] {
  return tapeRun(view, edge);
}

/** The squares on the two sides of a segment. -1 where the side is off the farm. */
export function sidesOf(edge: EdgeWire): [number, number] {
  if (edge.line === 'h') {
    const vy = Math.floor(edge.index / 40);
    return [vy > 0 ? edge.index - 40 : -1, vy < 26 ? edge.index : -1];
  }
  const y = Math.floor(edge.index / 41);
  const vx = edge.index % 41;
  return [vx > 0 ? y * 40 + vx - 1 : -1, vx < 40 ? y * 40 + vx : -1];
}

/** A gate on a paddock's edge: whether it is open, and the paddock on the other side. */
export interface PaddockGate {
  edge: EdgeWire;
  open: boolean;
  to: string;
}

/** The gates on the edge of a paddock, for its sheet. */
export function gatesOfPaddock(view: FarmView, paddock: number): PaddockGate[] {
  const out: PaddockGate[] = [];
  for (const g of view.gates) {
    const [a, b] = sidesOf(g);
    const pa = a >= 0 ? view.squares.paddock[a] : undefined;
    const pb = b >= 0 ? view.squares.paddock[b] : undefined;
    if (pa === undefined || pb === undefined) continue;
    if (pa !== paddock && pb !== paddock) continue;
    const other = pa === paddock ? pb : pa;
    if (other === paddock) continue;
    out.push({
      edge: { line: g.line, index: g.index },
      open: g.open,
      to: view.paddocks.find((p) => p.id === other)?.name ?? 'the next paddock',
    });
  }
  return out;
}
