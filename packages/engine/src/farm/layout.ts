/**
 * Changes to a farm's fences and water, as pure operations.
 *
 * Each operation takes the layout and returns either a new layout with a
 * report of what was built or removed, or a refusal with the reason. The
 * layout passed in is never changed. Money is left out: the report gives
 * lengths and counts, and the caller applies the costs (BUILD_PLAN 2.4).
 *
 * The rules are the MVP's (buildFence, removeFence, placeGate, toggleGate,
 * fixFence, layPipe, placeTrough, moveTrough, placeHub, placeFenceHub,
 * placePort, refillPort). The mouse, snapping and drawing code is not here.
 * Moving and removing water hubs, and fence materials kept, are the
 * rebuild's (Claudia, 14 Nov 2026).
 */

import type { FarmScale } from '../data/farms';
import { GRID_H, GRID_W } from '../grid';
import {
  EDGE,
  areaChanges,
  buildTopology,
  cloneFences,
  edgeOnFarm,
  getEdge,
  hEdge,
  hIdx,
  setEdge,
  vEdge,
  vIdx,
  type AreaChanges,
  type EdgeRef,
  type FenceType,
  type Fences,
  type Topology,
} from './topology';
import {
  PORTABLE_CAPACITY_L,
  cellOnFarm,
  cloneWater,
  hubCells,
  pipeReach,
  vertexOnFarm,
  waterPoints,
  type PortableTrough,
  type Water,
  type WaterPoints,
} from './water';

/** A farm's fences and water, and its size. */
export interface FarmLayout {
  scale: FarmScale;
  fences: Fences;
  water: Water;
  /** Rolled-up tape ready to use again, in segments. One segment is one side of a square. */
  tapeOnRoll: number;
  /**
   * Permanent and electric fence taken down and kept to use again, in
   * segments, by kind (Claudia, 14 Nov 2026). Fence of that kind is built
   * from these first, at half the price of new (REUSED_FENCE_SHARE).
   */
  fenceOnHand: FenceOnHand;
}

/** Fence materials kept from fence taken down, in segments, by kind. */
export interface FenceOnHand {
  permanent: number;
  electric: number;
}

/** Nothing on hand: a new farm's fence materials. */
export const noFenceOnHand = (): FenceOnHand => ({ permanent: 0, electric: 0 });

export type RefusalReason =
  | 'off-the-farm'
  | 'nothing-to-build'
  | 'nothing-to-remove'
  | 'gate-on-boundary'
  | 'gate-needs-fence'
  | 'gate-already-there'
  | 'fence-is-down'
  | 'no-gate-there'
  | 'nothing-to-fix'
  | 'not-tape'
  | 'pipe-already-there'
  | 'trough-already-there'
  | 'trough-needs-water'
  | 'no-trough-there'
  | 'hub-already-there'
  | 'hub-needs-water'
  | 'hub-needs-fence'
  | 'no-hub-there'
  | 'no-portable-trough';

/** Why an operation was not done. Nothing has changed. */
export interface Refusal {
  ok: false;
  reason: RefusalReason;
  /** The reason in plain words. */
  message: string;
}

export type Done<T> = { ok: true; layout: FarmLayout } & T;
export type Outcome<T> = Done<T> | Refusal;

const refuse = (reason: RefusalReason, message: string): Refusal => ({
  ok: false,
  reason,
  message,
});

/** A count of fence segments and gates by kind. */
export interface EdgeTally {
  permanent: number;
  electric: number;
  tape: number;
  gateShut: number;
  gateOpen: number;
  electricDown: number;
  tapeDown: number;
}

const TALLY_KEY: Record<number, keyof EdgeTally> = {
  [EDGE.permanent]: 'permanent',
  [EDGE.electric]: 'electric',
  [EDGE.tape]: 'tape',
  [EDGE.gateShut]: 'gateShut',
  [EDGE.gateOpen]: 'gateOpen',
  [EDGE.electricDown]: 'electricDown',
  [EDGE.tapeDown]: 'tapeDown',
};

const emptyTally = (): EdgeTally => ({
  permanent: 0,
  electric: 0,
  tape: 0,
  gateShut: 0,
  gateOpen: 0,
  electricDown: 0,
  tapeDown: 0,
});

const count = (tally: EdgeTally, code: number): void => {
  const key = TALLY_KEY[code];
  if (key) tally[key]++;
};

/** What a change to the fences did to the paddocks and grazing areas. */
export interface FenceEffect {
  /** The paddocks and grazing areas after the change. */
  topology: Topology;
  paddocksBefore: number;
  paddocksAfter: number;
  /**
   * Grazing areas that were split or joined. The ids in `from` are from
   * before the change and the ids in `into` from after. A mob in a split
   * area is shared out by the caller; mobs in a joined area run as one.
   */
  areas: AreaChanges;
}

function fenceEffect(before: FarmLayout, fences: Fences): FenceEffect {
  const was = buildTopology(before.fences, before.scale.haPerSquare);
  const topology = buildTopology(fences, before.scale.haPerSquare);
  return {
    topology,
    paddocksBefore: was.paddocks.length,
    paddocksAfter: topology.paddocks.length,
    areas: areaChanges(was, topology),
  };
}

/** The paddocks, grazing areas, watered squares and distance to water for a layout. */
export interface Survey {
  topology: Topology;
  points: WaterPoints;
}

export function surveyLayout(layout: FarmLayout): Survey {
  const topology = buildTopology(layout.fences, layout.scale.haPerSquare);
  return { topology, points: waterPoints(topology, layout.water) };
}

// ---------------------------------------------------------------------------
// Fences
// ---------------------------------------------------------------------------

/** A grid corner: column line `vx` (0 to GRID_W) and row line `vy` (0 to GRID_H). */
export interface Vertex {
  vx: number;
  vy: number;
}

const vertexOk = (v: Vertex): boolean =>
  Number.isInteger(v.vx) &&
  Number.isInteger(v.vy) &&
  v.vx >= 0 &&
  v.vx <= GRID_W &&
  v.vy >= 0 &&
  v.vy <= GRID_H;

/** The codes of the up to four edges that meet at a grid corner. */
function edgesAtVertex(f: Fences, vx: number, vy: number): number[] {
  const e: number[] = [];
  if (vx < GRID_W) e.push(f.hE[hIdx(vy, vx)]!);
  if (vx > 0) e.push(f.hE[hIdx(vy, vx - 1)]!);
  if (vy < GRID_H) e.push(f.vE[vIdx(vy, vx)]!);
  if (vy > 0) e.push(f.vE[vIdx(vy - 1, vx)]!);
  return e;
}

/** True if any fence, gate or the boundary meets the grid corner. */
export function touchesFence(f: Fences, vx: number, vy: number): boolean {
  return edgesAtVertex(f, vx, vy).some((t) => t > 0);
}

/** True if a fence or gate (not just the boundary) runs through the grid corner. */
export function vertexOnFence(f: Fences, v: number): boolean {
  const vx = v % (GRID_W + 1);
  const vy = Math.floor(v / (GRID_W + 1));
  return edgesAtVertex(f, vx, vy).some((t) => t >= 1 && t <= 7);
}

/** A straight run of fence line between two grid corners. */
export interface FenceLine {
  edges: EdgeRef[];
  /** The end the run starts from. */
  a: Vertex;
  /** The other end, squared up to the run's row or column. */
  b: Vertex;
  /** True if the start touches a fence, gate or the boundary. */
  aOn: boolean;
  /** True if the other end does. A run with a loose end closes nothing off. */
  bOn: boolean;
}

/**
 * The straight run from corner `a` towards corner `b`. It runs along the
 * row if `b` is further across than down, otherwise down the column, and
 * always starts from `a`. Returns null if either corner is off the farm.
 */
export function fenceLine(f: Fences, a: Vertex, b: Vertex): FenceLine | null {
  if (!vertexOk(a) || !vertexOk(b)) return null;
  const edges: EdgeRef[] = [];
  if (Math.abs(b.vx - a.vx) >= Math.abs(b.vy - a.vy)) {
    for (let x = Math.min(a.vx, b.vx); x < Math.max(a.vx, b.vx); x++) edges.push(hEdge(a.vy, x));
    return {
      edges,
      a: { vx: a.vx, vy: a.vy },
      b: { vx: b.vx, vy: a.vy },
      aOn: touchesFence(f, a.vx, a.vy),
      bOn: touchesFence(f, b.vx, a.vy),
    };
  }
  for (let y = Math.min(a.vy, b.vy); y < Math.max(a.vy, b.vy); y++) edges.push(vEdge(y, a.vx));
  return {
    edges,
    a: { vx: a.vx, vy: a.vy },
    b: { vx: a.vx, vy: b.vy },
    aOn: touchesFence(f, a.vx, a.vy),
    bOn: touchesFence(f, a.vx, b.vy),
  };
}

export interface FenceBuilt extends FenceEffect {
  type: FenceType;
  /** Segments of new fence. Segments already of this type, gates and the boundary don't count. */
  segments: number;
  metres: number;
  /** Tape only: segments taken off the roll. */
  tapeFromRoll: number;
  tapeFromRollM: number;
  /** Tape only: segments of new tape that had to be bought. */
  tapeNew: number;
  tapeNewM: number;
  /**
   * Permanent and electric only: segments built from materials on hand, and
   * those segments. Materials are used first, along the line in the order
   * it was drawn.
   */
  fromStock: number;
  fromStockM: number;
  fromStockEdges: EdgeRef[];
  /** Old fence the new run went over, by kind. It is gone, tape included. */
  replaced: EdgeTally;
}

/**
 * Build a run of fence. Gates and the boundary in the run are left as they
 * are. Any other fence in the run becomes the new type. Tape comes off the
 * roll first. Permanent and electric fence use the materials of that kind on
 * hand first, along the line in the order drawn.
 */
export function buildFence(
  layout: FarmLayout,
  edges: readonly EdgeRef[],
  type: FenceType,
): Outcome<FenceBuilt> {
  if (type !== EDGE.permanent && type !== EDGE.electric && type !== EDGE.tape) {
    return refuse('nothing-to-build', 'That is not a kind of fence.');
  }
  if (!edges.every(edgeOnFarm)) return refuse('off-the-farm', 'That line runs off the farm.');
  const fences = cloneFences(layout.fences);
  const replaced = emptyTally();
  const kind = type === EDGE.permanent ? 'permanent' : type === EDGE.electric ? 'electric' : null;
  let stock = kind ? layout.fenceOnHand[kind] : 0;
  const fromStockEdges: EdgeRef[] = [];
  let n = 0;
  for (const e of edges) {
    const c = getEdge(fences, e);
    if (c === EDGE.boundary || c === EDGE.gateShut || c === EDGE.gateOpen) continue;
    if (c !== type) {
      n++;
      count(replaced, c);
      if (stock > 0) {
        stock--;
        fromStockEdges.push({ line: e.line, index: e.index });
      }
    }
    setEdge(fences, e, type);
  }
  if (!n) return refuse('nothing-to-build', 'There is no new fence to build along that line.');
  const side = layout.scale.sideM;
  const fromRoll = type === EDGE.tape ? Math.min(n, layout.tapeOnRoll) : 0;
  const bought = type === EDGE.tape ? n - fromRoll : 0;
  const fromStock = fromStockEdges.length;
  const fenceOnHand = kind
    ? { ...layout.fenceOnHand, [kind]: layout.fenceOnHand[kind] - fromStock }
    : layout.fenceOnHand;
  return {
    ok: true,
    layout: { ...layout, fences, tapeOnRoll: layout.tapeOnRoll - fromRoll, fenceOnHand },
    type,
    segments: n,
    metres: n * side,
    tapeFromRoll: fromRoll,
    tapeFromRollM: fromRoll * side,
    tapeNew: bought,
    tapeNewM: bought * side,
    fromStock,
    fromStockM: fromStock * side,
    fromStockEdges,
    replaced,
    ...fenceEffect(layout, fences),
  };
}

export interface FenceRemoved extends FenceEffect {
  /** Everything pulled down, by kind. Gates come down with the fence. */
  removed: EdgeTally;
  /** Segments pulled down, gates included. */
  segments: number;
  metres: number;
  /** Tape rolled up and put back on the roll, in segments. Knocked-down tape counts. */
  tapeToRoll: number;
  tapeToRollM: number;
  /**
   * Permanent and electric fence materials kept to use again, in segments,
   * by kind. Knocked-down electric fence counts. Gates are not kept.
   */
  kept: FenceOnHand;
}

/**
 * Pull down every fence and gate along a run. The boundary stays. Tape goes
 * back on the roll, and permanent and electric fence materials are kept.
 */
export function removeFence(layout: FarmLayout, edges: readonly EdgeRef[]): Outcome<FenceRemoved> {
  if (!edges.every(edgeOnFarm)) return refuse('off-the-farm', 'That line runs off the farm.');
  const fences = cloneFences(layout.fences);
  const removed = emptyTally();
  const kept = noFenceOnHand();
  let n = 0;
  let tape = 0;
  for (const e of edges) {
    const c = getEdge(fences, e);
    if (c >= 1 && c <= 7) {
      if (c === EDGE.tape || c === EDGE.tapeDown) tape++;
      if (c === EDGE.permanent) kept.permanent++;
      if (c === EDGE.electric || c === EDGE.electricDown) kept.electric++;
      count(removed, c);
      setEdge(fences, e, EDGE.none);
      n++;
    }
  }
  if (!n) return refuse('nothing-to-remove', 'There is no fence or gate there to pull down.');
  const side = layout.scale.sideM;
  return {
    ok: true,
    layout: {
      ...layout,
      fences,
      tapeOnRoll: layout.tapeOnRoll + tape,
      fenceOnHand: {
        permanent: layout.fenceOnHand.permanent + kept.permanent,
        electric: layout.fenceOnHand.electric + kept.electric,
      },
    },
    removed,
    segments: n,
    metres: n * side,
    tapeToRoll: tape,
    tapeToRollM: tape * side,
    kept,
    ...fenceEffect(layout, fences),
  };
}

/**
 * The straight run of tape an edge is part of, so the whole length can be
 * rolled up at once. The edge itself comes first. Knocked-down tape counts.
 */
export function tapeRun(f: Fences, e: EdgeRef): EdgeRef[] {
  const out: EdgeRef[] = [e];
  const isTape = (x: EdgeRef): boolean => {
    const v = getEdge(f, x);
    return v === EDGE.tape || v === EDGE.tapeDown;
  };
  if (e.line === 'h') {
    const vy = Math.floor(e.index / GRID_W);
    const x0 = e.index % GRID_W;
    for (let x = x0 - 1; x >= 0 && isTape(hEdge(vy, x)); x--) out.push(hEdge(vy, x));
    for (let x = x0 + 1; x < GRID_W && isTape(hEdge(vy, x)); x++) out.push(hEdge(vy, x));
  } else {
    const y0 = Math.floor(e.index / (GRID_W + 1));
    const vx = e.index % (GRID_W + 1);
    for (let y = y0 - 1; y >= 0 && isTape(vEdge(y, vx)); y--) out.push(vEdge(y, vx));
    for (let y = y0 + 1; y < GRID_H && isTape(vEdge(y, vx)); y++) out.push(vEdge(y, vx));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Gates and repairs
// ---------------------------------------------------------------------------

export interface GatePlaced extends FenceEffect {
  /** The fence segment the gate took the place of. */
  replaced: FenceType;
}

/** Hang a gate in a standing fence. It starts shut. */
export function placeGate(layout: FarmLayout, edge: EdgeRef): Outcome<GatePlaced> {
  if (!edgeOnFarm(edge)) return refuse('off-the-farm', 'That line is off the farm.');
  const c = getEdge(layout.fences, edge);
  if (c === EDGE.boundary) {
    return refuse('gate-on-boundary', "Gates can't go in the boundary fence.");
  }
  if (c === EDGE.gateShut || c === EDGE.gateOpen) {
    return refuse('gate-already-there', 'There is already a gate there.');
  }
  if (c === EDGE.electricDown || c === EDGE.tapeDown) {
    return refuse('fence-is-down', 'That fence is knocked down. Put it back up first.');
  }
  if (c === EDGE.none) return refuse('gate-needs-fence', 'Gates only go on fences.');
  const fences = cloneFences(layout.fences);
  setEdge(fences, edge, EDGE.gateShut);
  return {
    ok: true,
    layout: { ...layout, fences },
    replaced: c as FenceType,
    ...fenceEffect(layout, fences),
  };
}

export interface GateRemoved extends FenceEffect {
  wasOpen: boolean;
}

/** Take a gate out. It leaves a gap in the fence. */
export function removeGate(layout: FarmLayout, edge: EdgeRef): Outcome<GateRemoved> {
  if (!edgeOnFarm(edge)) return refuse('off-the-farm', 'That line is off the farm.');
  const c = getEdge(layout.fences, edge);
  if (c !== EDGE.gateShut && c !== EDGE.gateOpen) {
    return refuse('no-gate-there', 'There is no gate there.');
  }
  const fences = cloneFences(layout.fences);
  setEdge(fences, edge, EDGE.none);
  return {
    ok: true,
    layout: { ...layout, fences },
    wasOpen: c === EDGE.gateOpen,
    ...fenceEffect(layout, fences),
  };
}

export interface GateSet extends FenceEffect {
  open: boolean;
}

/** Open or shut a gate. An open gate joins the paddocks either side for grazing. */
export function setGate(layout: FarmLayout, edge: EdgeRef, open: boolean): Outcome<GateSet> {
  if (!edgeOnFarm(edge)) return refuse('off-the-farm', 'That line is off the farm.');
  const c = getEdge(layout.fences, edge);
  if (c !== EDGE.gateShut && c !== EDGE.gateOpen) {
    return refuse('no-gate-there', 'There is no gate there.');
  }
  const fences = cloneFences(layout.fences);
  setEdge(fences, edge, open ? EDGE.gateOpen : EDGE.gateShut);
  return { ok: true, layout: { ...layout, fences }, open, ...fenceEffect(layout, fences) };
}

/** Open a shut gate, or shut an open one. */
export function toggleGate(layout: FarmLayout, edge: EdgeRef): Outcome<GateSet> {
  if (!edgeOnFarm(edge)) return refuse('off-the-farm', 'That line is off the farm.');
  return setGate(layout, edge, getEdge(layout.fences, edge) === EDGE.gateShut);
}

export interface FenceFixed extends FenceEffect {
  /** The fence that is standing again. */
  type: typeof EDGE.electric | typeof EDGE.tape;
}

/** Put a knocked-down fence back up. */
export function fixFence(layout: FarmLayout, edge: EdgeRef): Outcome<FenceFixed> {
  if (!edgeOnFarm(edge)) return refuse('off-the-farm', 'That line is off the farm.');
  const c = getEdge(layout.fences, edge);
  if (c !== EDGE.electricDown && c !== EDGE.tapeDown) {
    return refuse('nothing-to-fix', 'There is no knocked-down fence there.');
  }
  const type = c === EDGE.electricDown ? EDGE.electric : EDGE.tape;
  const fences = cloneFences(layout.fences);
  setEdge(fences, edge, type);
  return { ok: true, layout: { ...layout, fences }, type, ...fenceEffect(layout, fences) };
}

/**
 * Knock down one segment of tape. Stock only push through temporary tape,
 * and only when they are hungry or thirsty. The cattle model decides when;
 * this records which segment went down.
 */
export function knockDownTape(layout: FarmLayout, edge: EdgeRef): Outcome<FenceEffect> {
  if (!edgeOnFarm(edge)) return refuse('off-the-farm', 'That line is off the farm.');
  if (getEdge(layout.fences, edge) !== EDGE.tape) {
    return refuse('not-tape', 'Stock only push through temporary tape.');
  }
  const fences = cloneFences(layout.fences);
  setEdge(fences, edge, EDGE.tapeDown);
  return { ok: true, layout: { ...layout, fences }, ...fenceEffect(layout, fences) };
}

// ---------------------------------------------------------------------------
// Pipe and troughs
// ---------------------------------------------------------------------------

/**
 * The squares in a straight run of pipe from one square towards another.
 * It runs along the row if the second square is further across than down,
 * otherwise down the column, and always starts from the first square's row
 * or column.
 */
export function pipeLine(from: number, to: number): number[] {
  const x0 = from % GRID_W;
  const y0 = (from / GRID_W) | 0;
  const x1 = to % GRID_W;
  const y1 = (to / GRID_W) | 0;
  const out: number[] = [];
  if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push(y0 * GRID_W + x);
  } else {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push(y * GRID_W + x0);
  }
  return out;
}

export interface PipeLaid {
  /** Squares of new pipe. Squares already piped and the bore don't count. */
  segments: number;
  metres: number;
  /** False if some of the new pipe isn't joined to the bore, a trough, a hub or other pipe yet. */
  connected: boolean;
}

/** Lay pipe on the given squares. */
export function layPipe(layout: FarmLayout, cells: readonly number[]): Outcome<PipeLaid> {
  if (!cells.every(cellOnFarm)) return refuse('off-the-farm', 'That pipe runs off the farm.');
  const fresh = [...new Set(cells)].filter((i) => !layout.water.pipe[i] && i !== layout.water.bore);
  if (!fresh.length) return refuse('pipe-already-there', 'There is already pipe there.');
  const water = cloneWater(layout.water);
  for (const i of fresh) water.pipe[i] = 1;
  const reach = pipeReach(water);
  return {
    ok: true,
    layout: { ...layout, water },
    segments: fresh.length,
    metres: fresh.length * layout.scale.sideM,
    connected: fresh.every((i) => reach[i] === 1),
  };
}

/** True if a trough can go on the square: it is the bore, or water reaches it. */
export function canTrough(water: Water, cell: number): boolean {
  return !!pipeReach(water)[cell];
}

export interface TroughPlaced {
  cell: number;
}

/** Put a fixed trough on a square the water reaches. A trough on the bore needs no pipe. */
export function placeTrough(layout: FarmLayout, cell: number): Outcome<TroughPlaced> {
  if (!cellOnFarm(cell)) return refuse('off-the-farm', 'That square is off the farm.');
  if (layout.water.troughs.includes(cell)) {
    return refuse('trough-already-there', 'There is already a trough there.');
  }
  if (!canTrough(layout.water, cell)) {
    return refuse(
      'trough-needs-water',
      'A trough needs water. Put it on the bore or on pipe joined to the bore.',
    );
  }
  const water = cloneWater(layout.water);
  water.troughs.push(cell);
  return { ok: true, layout: { ...layout, water }, cell };
}

export interface TroughMoved {
  from: number;
  to: number;
}

/** Move a fixed trough to another square the water reaches. */
export function moveTrough(layout: FarmLayout, from: number, to: number): Outcome<TroughMoved> {
  if (!cellOnFarm(from) || !cellOnFarm(to)) {
    return refuse('off-the-farm', 'That square is off the farm.');
  }
  const at = layout.water.troughs.indexOf(from);
  if (at < 0) return refuse('no-trough-there', 'There is no trough there to move.');
  if (layout.water.troughs.includes(to)) {
    return refuse('trough-already-there', 'There is already a trough there.');
  }
  if (!canTrough(layout.water, to)) {
    return refuse(
      'trough-needs-water',
      'A trough can only move onto the bore or onto pipe joined to the bore.',
    );
  }
  const water = cloneWater(layout.water);
  water.troughs[at] = to;
  return { ok: true, layout: { ...layout, water }, from, to };
}

export interface TroughRemoved {
  cell: number;
}

/** Take a fixed trough out. */
export function removeTrough(layout: FarmLayout, cell: number): Outcome<TroughRemoved> {
  if (!layout.water.troughs.includes(cell)) {
    return refuse('no-trough-there', 'There is no trough there.');
  }
  const water = cloneWater(layout.water);
  water.troughs = water.troughs.filter((x) => x !== cell);
  return { ok: true, layout: { ...layout, water }, cell };
}

// ---------------------------------------------------------------------------
// Water hubs
// ---------------------------------------------------------------------------

export interface FenceHubPlaced {
  vertex: number;
  /** The squares that can now drink at it. */
  cells: number[];
  /** The paddocks it waters, by id. */
  paddocks: number[];
}

/**
 * Build a water hub on a fence line or corner. One trough waters the two to
 * four squares that meet there. One of those squares must be the bore or
 * have water reaching it.
 */
export function placeFenceHub(layout: FarmLayout, vertex: number): Outcome<FenceHubPlaced> {
  if (!vertexOnFarm(vertex)) return refuse('off-the-farm', 'That corner is off the farm.');
  if (layout.water.hubs.includes(vertex)) {
    return refuse('hub-already-there', 'There is already a water hub there.');
  }
  if (!vertexOnFence(layout.fences, vertex)) {
    return refuse('hub-needs-fence', 'This kind of water hub goes on a fence line or corner.');
  }
  const cells = hubCells(vertex);
  const reach = pipeReach(layout.water);
  if (!cells.some((c) => reach[c])) {
    return refuse(
      'hub-needs-water',
      'A water hub needs water. One of the squares it touches must be the bore or pipe joined to the bore.',
    );
  }
  const water = cloneWater(layout.water);
  water.hubs.push(vertex);
  const topology = buildTopology(layout.fences, layout.scale.haPerSquare);
  const paddocks = [...new Set(cells.map((c) => topology.paddockOf[c]!))];
  return { ok: true, layout: { ...layout, water }, vertex, cells, paddocks };
}

export interface HubRemoved {
  vertex: number;
}

export interface HubMoved {
  from: number;
  to: number;
  /** The squares that can now drink at it. */
  cells: number[];
  /** The paddocks it now waters, by id. */
  paddocks: number[];
}

/**
 * Move a fence-line or corner hub to another grid corner. The new corner
 * needs a fence or gate, and water reaching one of the squares it touches,
 * as the water stands before the move (the check `moveTrough` makes).
 * What drew water through the old corner is left as it is: a trough or hub
 * that was placed keeps watering its squares, as when a trough is moved.
 */
export function moveHub(layout: FarmLayout, from: number, to: number): Outcome<HubMoved> {
  if (!vertexOnFarm(from) || !vertexOnFarm(to)) {
    return refuse('off-the-farm', 'That corner is off the farm.');
  }
  const at = layout.water.hubs.indexOf(from);
  if (at < 0) return refuse('no-hub-there', 'There is no water hub there to move.');
  if (layout.water.hubs.includes(to)) {
    return refuse('hub-already-there', 'There is already a water hub there.');
  }
  if (!vertexOnFence(layout.fences, to)) {
    return refuse('hub-needs-fence', 'This kind of water hub goes on a fence line or corner.');
  }
  const cells = hubCells(to);
  const reach = pipeReach(layout.water);
  if (!cells.some((c) => reach[c])) {
    return refuse(
      'hub-needs-water',
      'A water hub can only move where one of the squares it touches is the bore or pipe joined to the bore.',
    );
  }
  const water = cloneWater(layout.water);
  water.hubs[at] = to;
  const topology = buildTopology(layout.fences, layout.scale.haPerSquare);
  const paddocks = [...new Set(cells.map((c) => topology.paddockOf[c]!))];
  return { ok: true, layout: { ...layout, water }, from, to, cells, paddocks };
}

/** The four sides of a square, as edges: top, bottom, left, right. */
function sidesOf(cell: number): EdgeRef[] {
  const x = cell % GRID_W;
  const y = (cell / GRID_W) | 0;
  return [hEdge(y, x), hEdge(y + 1, x), vEdge(y, x), vEdge(y, x + 1)];
}

/**
 * True if the square holds a water hub: a fixed trough with a gate on every
 * side that is not the boundary. This is what `placeSquareHub` builds, and
 * what it already calls "built".
 */
export function isSquareHub(layout: Pick<FarmLayout, 'fences' | 'water'>, cell: number): boolean {
  if (!cellOnFarm(cell) || !layout.water.troughs.includes(cell)) return false;
  return sidesOf(cell).every((e) => {
    const c = getEdge(layout.fences, e);
    return c === EDGE.boundary || c === EDGE.gateShut || c === EDGE.gateOpen;
  });
}

/** The squares that hold a water hub, in the order their troughs were put in. */
export function squareHubs(layout: Pick<FarmLayout, 'fences' | 'water'>): number[] {
  return layout.water.troughs.filter((c) => isSquareHub(layout, c));
}

export interface SquareHubRemoved {
  cell: number;
  /** Gates left standing round the square. They stay as they were, open or shut. */
  gates: number;
}

/**
 * Take out a water hub on a square: its trough comes out. The gates stay as
 * they are, so the paddocks round it keep their fences and nothing about the
 * grazing changes (a builder's rule). A gate can be taken out on its own.
 */
export function removeSquareHub(layout: FarmLayout, cell: number): Outcome<SquareHubRemoved> {
  if (!cellOnFarm(cell)) return refuse('off-the-farm', 'That square is off the farm.');
  if (!isSquareHub(layout, cell)) return refuse('no-hub-there', 'There is no water hub there.');
  const water = cloneWater(layout.water);
  water.troughs = water.troughs.filter((x) => x !== cell);
  const gates = sidesOf(cell).filter((e) => {
    const c = getEdge(layout.fences, e);
    return c === EDGE.gateShut || c === EDGE.gateOpen;
  }).length;
  return { ok: true, layout: { ...layout, water }, cell, gates };
}

export interface SquareHubMoved extends FenceEffect {
  from: number;
  to: number;
  /** Gates hung at the new square, all open. The gates at the old square stay. */
  gates: number;
  /** Fence the new gates took the place of, by kind. */
  replaced: EdgeTally;
}

/**
 * Move a water hub on a square to another square: the trough moves, and the
 * new square gets an open gate on every side that is not the boundary or a
 * gate, as when a hub is built. The new square must have no trough, and
 * water must reach it as the water stands before the move (the check
 * `moveTrough` makes). The gates at the old square stay as they are.
 */
export function moveSquareHub(
  layout: FarmLayout,
  from: number,
  to: number,
): Outcome<SquareHubMoved> {
  if (!cellOnFarm(from) || !cellOnFarm(to)) {
    return refuse('off-the-farm', 'That square is off the farm.');
  }
  if (!isSquareHub(layout, from)) {
    return refuse('no-hub-there', 'There is no water hub there to move.');
  }
  if (layout.water.troughs.includes(to)) {
    return refuse('trough-already-there', 'There is already a trough there.');
  }
  if (!canTrough(layout.water, to)) {
    return refuse(
      'hub-needs-water',
      'A water hub can only move onto the bore or onto pipe joined to the bore.',
    );
  }
  const water = cloneWater(layout.water);
  water.troughs[water.troughs.indexOf(from)] = to;
  const fences = cloneFences(layout.fences);
  const replaced = emptyTally();
  let gates = 0;
  for (const e of sidesOf(to)) {
    const c = getEdge(fences, e);
    if (c === EDGE.boundary || c === EDGE.gateShut || c === EDGE.gateOpen) continue;
    count(replaced, c);
    setEdge(fences, e, EDGE.gateOpen);
    gates++;
  }
  return {
    ok: true,
    layout: { ...layout, water, fences },
    from,
    to,
    gates,
    replaced,
    ...fenceEffect(layout, fences),
  };
}

/** Take out a fence-line or corner hub. */
export function removeHub(layout: FarmLayout, vertex: number): Outcome<HubRemoved> {
  if (!layout.water.hubs.includes(vertex)) {
    return refuse('no-hub-there', 'There is no water hub there.');
  }
  const water = cloneWater(layout.water);
  water.hubs = water.hubs.filter((x) => x !== vertex);
  return { ok: true, layout: { ...layout, water }, vertex };
}

export interface SquareHubPlaced extends FenceEffect {
  cell: number;
  /** True if a trough was put in. False if the square already had one. */
  troughAdded: boolean;
  /** Gates hung, all open: one on each side of the square that is not the boundary or a gate. */
  gates: number;
  /** Fence the gates took the place of, by kind. Sides with no fence are not counted here. */
  replaced: EdgeTally;
}

/**
 * Build a water hub on a square: a trough with a gate on every side, all
 * open. Sides on the boundary are left alone. Every other side becomes an
 * open gate, whether or not a fence was there. Fences run out from its
 * corners then let each paddock drink through its own gate.
 */
export function placeSquareHub(layout: FarmLayout, cell: number): Outcome<SquareHubPlaced> {
  if (!cellOnFarm(cell)) return refuse('off-the-farm', 'That square is off the farm.');
  if (!canTrough(layout.water, cell)) {
    return refuse('hub-needs-water', 'A water hub goes on the bore or on pipe joined to the bore.');
  }
  const x = cell % GRID_W;
  const y = (cell / GRID_W) | 0;
  const sides = [hEdge(y, x), hEdge(y + 1, x), vEdge(y, x), vEdge(y, x + 1)].filter((e) => {
    const c = getEdge(layout.fences, e);
    return c !== EDGE.boundary && c !== EDGE.gateShut && c !== EDGE.gateOpen;
  });
  const has = layout.water.troughs.includes(cell);
  if (has && !sides.length) {
    return refuse('hub-already-there', 'That water hub is already built.');
  }
  const water = cloneWater(layout.water);
  if (!has) water.troughs.push(cell);
  const fences = cloneFences(layout.fences);
  const replaced = emptyTally();
  for (const e of sides) {
    count(replaced, getEdge(fences, e));
    setEdge(fences, e, EDGE.gateOpen);
  }
  return {
    ok: true,
    layout: { ...layout, water, fences },
    cell,
    troughAdded: !has,
    gates: sides.length,
    replaced,
    ...fenceEffect(layout, fences),
  };
}

// ---------------------------------------------------------------------------
// Portable troughs
// ---------------------------------------------------------------------------

export interface PortablePlaced {
  port: PortableTrough;
}

/** Set up a portable trough, full. It needs no pipe and can go on any square. */
export function placePortable(layout: FarmLayout, cell: number): Outcome<PortablePlaced> {
  if (!cellOnFarm(cell)) return refuse('off-the-farm', 'That square is off the farm.');
  const water = cloneWater(layout.water);
  const port: PortableTrough = {
    id: water.nextPortId++,
    cell,
    level: PORTABLE_CAPACITY_L,
    warned: false,
    lastUse: 0,
  };
  water.ports.push(port);
  return { ok: true, layout: { ...layout, water }, port: { ...port } };
}

export interface PortableMoved {
  portId: number;
  from: number;
  to: number;
}

/** Move a portable trough to another square. It keeps the water it has. */
export function movePortable(
  layout: FarmLayout,
  portId: number,
  cell: number,
): Outcome<PortableMoved> {
  if (!cellOnFarm(cell)) return refuse('off-the-farm', 'That square is off the farm.');
  const water = cloneWater(layout.water);
  const pt = water.ports.find((p) => p.id === portId);
  if (!pt) return refuse('no-portable-trough', 'There is no portable trough with that number.');
  const from = pt.cell;
  pt.cell = cell;
  return { ok: true, layout: { ...layout, water }, portId, from, to: cell };
}

export interface PortableRefilled {
  portId: number;
  /** Litres carted to fill it. */
  litres: number;
  /** True if it had run dry, so its square has water again. */
  wasEmpty: boolean;
}

/** Fill a portable trough. This clears its low-water warning. */
export function refillPortable(layout: FarmLayout, portId: number): Outcome<PortableRefilled> {
  const water = cloneWater(layout.water);
  const pt = water.ports.find((p) => p.id === portId);
  if (!pt) return refuse('no-portable-trough', 'There is no portable trough with that number.');
  const was = pt.level;
  pt.level = PORTABLE_CAPACITY_L;
  pt.warned = false;
  return {
    ok: true,
    layout: { ...layout, water },
    portId,
    litres: PORTABLE_CAPACITY_L - was,
    wasEmpty: was <= 0,
  };
}

export interface PortableRemoved {
  port: PortableTrough;
}

/** Take a portable trough off the farm. */
export function removePortable(layout: FarmLayout, portId: number): Outcome<PortableRemoved> {
  const pt = layout.water.ports.find((p) => p.id === portId);
  if (!pt) return refuse('no-portable-trough', 'There is no portable trough with that number.');
  const water = cloneWater(layout.water);
  water.ports = water.ports.filter((p) => p.id !== portId);
  return { ok: true, layout: { ...layout, water }, port: { ...pt } };
}
