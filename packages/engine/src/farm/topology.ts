/**
 * Fences, gates, paddocks and grazing areas.
 *
 * Fences and gates sit on the lines between squares. A paddock is any area
 * closed in by a fence or gate, whether the gate is open or shut and whether
 * the fence is standing or knocked down. A grazing area is what stock can
 * reach: open gates and knocked-down fences join paddocks into one area
 * (docs/MODEL.md, section 5; LESSONS 25).
 *
 * This is the MVP's flood, labelCell and the paddock part of recompute. The
 * same edges give the same paddocks and areas, with the same ids.
 */

import { GRID_H, GRID_N, GRID_W } from '../grid';

/** What sits on the line between two squares. The codes are the MVP's. */
export const EDGE = {
  none: 0,
  /** Permanent fence. */
  permanent: 1,
  /** Electric fence. */
  electric: 2,
  /** Temporary tape. */
  tape: 3,
  gateShut: 4,
  gateOpen: 5,
  /** Electric fence knocked down. Stock can cross until it is fixed. */
  electricDown: 6,
  /** Tape knocked down. Stock can cross until it is fixed. */
  tapeDown: 7,
  /** The farm boundary. Nothing crosses it and it can't be changed. */
  boundary: 9,
} as const;
export type EdgeCode = (typeof EDGE)[keyof typeof EDGE];

/** The fence types a player can build. */
export type FenceType = typeof EDGE.permanent | typeof EDGE.electric | typeof EDGE.tape;

/**
 * Every fence line on the farm. `hE` holds the lines along the top and
 * bottom of squares, `vE` the lines down their sides.
 */
export interface Fences {
  /** Horizontal lines: (GRID_H + 1) rows of GRID_W. See hIdx. */
  hE: Uint8Array;
  /** Vertical lines: GRID_H rows of (GRID_W + 1). See vIdx. */
  vE: Uint8Array;
}

/** Index of the horizontal line on grid row line `vy` (0 to GRID_H) above square column `x`. */
export const hIdx = (vy: number, x: number): number => vy * GRID_W + x;
/** Index of the vertical line on grid column line `vx` (0 to GRID_W) beside square row `y`. */
export const vIdx = (y: number, vx: number): number => y * (GRID_W + 1) + vx;

export const H_EDGES = (GRID_H + 1) * GRID_W;
export const V_EDGES = GRID_H * (GRID_W + 1);

/** One line between two squares. */
export interface EdgeRef {
  /** `h` is a horizontal line (index from hIdx), `v` a vertical one (vIdx). */
  line: 'h' | 'v';
  index: number;
}

export const hEdge = (vy: number, x: number): EdgeRef => ({ line: 'h', index: hIdx(vy, x) });
export const vEdge = (y: number, vx: number): EdgeRef => ({ line: 'v', index: vIdx(y, vx) });

/** True if the edge is on the grid. */
export function edgeOnFarm(e: EdgeRef): boolean {
  if (!Number.isInteger(e.index) || e.index < 0) return false;
  return e.line === 'h' ? e.index < H_EDGES : e.line === 'v' ? e.index < V_EDGES : false;
}

export function getEdge(f: Fences, e: EdgeRef): number {
  return (e.line === 'h' ? f.hE[e.index] : f.vE[e.index])!;
}

/** Change one edge in place. The layout operations work on a copy. */
export function setEdge(f: Fences, e: EdgeRef, code: number): void {
  if (e.line === 'h') f.hE[e.index] = code;
  else f.vE[e.index] = code;
}

/** A farm with only its boundary fence. */
export function createFences(): Fences {
  const hE = new Uint8Array(H_EDGES);
  const vE = new Uint8Array(V_EDGES);
  for (let x = 0; x < GRID_W; x++) {
    hE[x] = EDGE.boundary;
    hE[GRID_H * GRID_W + x] = EDGE.boundary;
  }
  for (let y = 0; y < GRID_H; y++) {
    vE[y * (GRID_W + 1)] = EDGE.boundary;
    vE[y * (GRID_W + 1) + GRID_W] = EDGE.boundary;
  }
  return { hE, vE };
}

export function cloneFences(f: Fences): Fences {
  return { hE: f.hE.slice(), vE: f.vE.slice() };
}

const flags = (codes: readonly number[]): Uint8Array => {
  const out = new Uint8Array(10);
  for (const v of codes) out[v] = 1;
  return out;
};

/** What stops stock: standing fences, shut gates and the boundary. */
export const STOCK_BLOCK: Uint8Array = flags([1, 2, 3, 4, 9]);
/** What bounds a paddock: any fence or gate at all, and the boundary. */
export const PADDOCK_BLOCK: Uint8Array = flags([1, 2, 3, 4, 5, 6, 7, 9]);

/**
 * Group the squares that connect without crossing a blocking edge. Groups
 * are numbered in the order their first square is met, scanning row by row,
 * and each group's squares are in ascending order.
 */
export function flood(fences: Fences, block: Uint8Array): { of: Int16Array; groups: number[][] } {
  const { hE, vE } = fences;
  const of = new Int16Array(GRID_N).fill(-1);
  const groups: number[][] = [];
  for (let s0 = 0; s0 < GRID_N; s0++) {
    if (of[s0]! >= 0) continue;
    const id = groups.length;
    const cells: number[] = [];
    const st = [s0];
    of[s0] = id;
    while (st.length) {
      const i = st.pop()!;
      cells.push(i);
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      if (x < GRID_W - 1 && !block[vE[vIdx(y, x + 1)]!] && of[i + 1]! < 0) {
        of[i + 1] = id;
        st.push(i + 1);
      }
      if (x > 0 && !block[vE[vIdx(y, x)]!] && of[i - 1]! < 0) {
        of[i - 1] = id;
        st.push(i - 1);
      }
      if (y < GRID_H - 1 && !block[hE[hIdx(y + 1, x)]!] && of[i + GRID_W]! < 0) {
        of[i + GRID_W] = id;
        st.push(i + GRID_W);
      }
      if (y > 0 && !block[hE[hIdx(y, x)]!] && of[i - GRID_W]! < 0) {
        of[i - GRID_W] = id;
        st.push(i - GRID_W);
      }
    }
    cells.sort((a, b) => a - b);
    groups.push(cells);
  }
  return { of, groups };
}

/** The square nearest the middle of a group, where its label goes. */
export function labelSquare(cells: readonly number[]): number {
  let mx = 0;
  let my = 0;
  for (const i of cells) {
    mx += i % GRID_W;
    my += (i / GRID_W) | 0;
  }
  mx /= cells.length;
  my /= cells.length;
  let best = cells[0]!;
  let bd = 1e9;
  for (const i of cells) {
    const d = ((i % GRID_W) - mx) ** 2 + (((i / GRID_W) | 0) - my) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

export interface Paddock {
  id: number;
  /** Its squares, in ascending order. */
  cells: number[];
  ha: number;
  /** "Paddock 1", "Paddock 2" and so on. */
  name: string;
  /** The square nearest its middle. */
  label: number;
}

export interface GrazingArea {
  id: number;
  /** Its squares, in ascending order. */
  cells: number[];
  /** The paddocks it is made of, by id, in ascending order. */
  paddocks: number[];
  ha: number;
  /** The paddock's name, or "Paddocks 1 + 2" where open gates join several. */
  name: string;
  /** The square nearest its middle. */
  label: number;
}

/** The paddocks and grazing areas a set of fences makes. */
export interface Topology {
  /** The paddock each square is in. */
  paddockOf: Int16Array;
  paddocks: Paddock[];
  /** The grazing area each square is in. */
  areaOf: Int16Array;
  areas: GrazingArea[];
}

/** Work out the paddocks and grazing areas. `haPerSquare` sets their areas. */
export function buildTopology(fences: Fences, haPerSquare: number): Topology {
  const pad = flood(fences, PADDOCK_BLOCK);
  const paddocks: Paddock[] = pad.groups.map((cells, id) => ({
    id,
    cells,
    ha: cells.length * haPerSquare,
    name: 'Paddock ' + (id + 1),
    label: labelSquare(cells),
  }));
  const area = flood(fences, STOCK_BLOCK);
  const areas: GrazingArea[] = area.groups.map((cells, id) => {
    const pads = [...new Set(cells.map((i) => pad.of[i]!))].sort((a, b) => a - b);
    const name =
      pads.length === 1
        ? paddocks[pads[0]!]!.name
        : 'Paddocks ' + pads.map((p) => p + 1).join(' + ');
    return {
      id,
      cells,
      paddocks: pads,
      ha: cells.length * haPerSquare,
      name,
      label: labelSquare(cells),
    };
  });
  return { paddockOf: pad.of, paddocks, areaOf: area.of, areas };
}

/**
 * The edges around a grazing area that hold one of the given codes. Used to
 * find the tape a hungry mob could push through. An edge is listed once for
 * each square of the area that touches it from inside.
 */
export function areaEdges(
  topology: Topology,
  fences: Fences,
  areaId: number,
  codes: readonly number[],
): EdgeRef[] {
  const out: EdgeRef[] = [];
  const of = topology.areaOf;
  for (const i of topology.areas[areaId]!.cells) {
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    const c: EdgeRef[] = [];
    if (x < GRID_W - 1 && of[i + 1] !== areaId) c.push(vEdge(y, x + 1));
    if (x > 0 && of[i - 1] !== areaId) c.push(vEdge(y, x));
    if (y < GRID_H - 1 && of[i + GRID_W] !== areaId) c.push(hEdge(y + 1, x));
    if (y > 0 && of[i - GRID_W] !== areaId) c.push(hEdge(y, x));
    for (const e of c) if (codes.includes(getEdge(fences, e))) out.push(e);
  }
  return out;
}

/** How the grazing areas changed between two layouts. */
export interface AreaChanges {
  /**
   * Former areas that are now divided, each with the new areas its squares
   * fall in. Stock that were in a former area have to be shared out among
   * these by the caller.
   */
  splits: { from: number; into: number[] }[];
  /** New areas made from more than one former area. Mobs in them now run together. */
  joins: { from: number[]; into: number }[];
}

/** Compare the grazing areas before and after a change. Ids are each topology's own. */
export function areaChanges(before: Topology, after: Topology): AreaChanges {
  const into = new Map<number, Set<number>>();
  const from = new Map<number, Set<number>>();
  for (let i = 0; i < GRID_N; i++) {
    const b = before.areaOf[i]!;
    const a = after.areaOf[i]!;
    let s = into.get(b);
    if (!s) into.set(b, (s = new Set()));
    s.add(a);
    let t = from.get(a);
    if (!t) from.set(a, (t = new Set()));
    t.add(b);
  }
  const asc = (s: Set<number>): number[] => [...s].sort((p, q) => p - q);
  const splits = [...into]
    .filter(([, s]) => s.size > 1)
    .map(([id, s]) => ({ from: id, into: asc(s) }))
    .sort((p, q) => p.from - q.from);
  const joins = [...from]
    .filter(([, s]) => s.size > 1)
    .map(([id, s]) => ({ from: asc(s), into: id }))
    .sort((p, q) => p.into - q.into);
  return { splits, joins };
}
