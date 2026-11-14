/**
 * Farm layouts for tests: hand-made ones that each show one rule, and
 * random ones that mix every kind of fence, gate, pipe, trough and hub.
 *
 * Test use only. Nothing in `src` may import this file.
 */

import { farmScale } from '../src/data/farms';
import type { FarmLayout } from '../src/farm/layout';
import {
  EDGE,
  createFences,
  hEdge,
  hIdx,
  vEdge,
  vIdx,
  type EdgeRef,
  type Fences,
} from '../src/farm/topology';
import { PORTABLE_CAPACITY_L, createWater, vertexId } from '../src/farm/water';
import { GRID_H, GRID_N, GRID_W } from '../src/grid';
import type { Rng } from '../src/rng';

const cell = (x: number, y: number): number => y * GRID_W + x;

/** A bare farm: the boundary and a bore, nothing else. */
export function bareLayout(farmHa = 2000, bore = cell(20, 13)): FarmLayout {
  return {
    scale: farmScale(farmHa),
    fences: createFences(),
    water: createWater(bore),
    tapeOnRoll: 0,
    fenceOnHand: { permanent: 0, electric: 0 },
  };
}

/** Run a fence of one code along a row line from column x0 up to (not including) x1. */
export function hRun(f: Fences, vy: number, x0: number, x1: number, code: number): void {
  for (let x = x0; x < x1; x++) f.hE[hIdx(vy, x)] = code;
}

/** Run a fence of one code down a column line from row y0 up to (not including) y1. */
export function vRun(f: Fences, vx: number, y0: number, y1: number, code: number): void {
  for (let y = y0; y < y1; y++) f.vE[vIdx(y, vx)] = code;
}

/** Fence a rectangle of squares: columns x0 to x1 - 1, rows y0 to y1 - 1. */
export function box(f: Fences, x0: number, y0: number, x1: number, y1: number, code: number): void {
  hRun(f, y0, x0, x1, code);
  hRun(f, y1, x0, x1, code);
  vRun(f, x0, y0, y1, code);
  vRun(f, x1, y0, y1, code);
}

export interface NamedLayout {
  name: string;
  layout: FarmLayout;
}

/** Hand-made layouts. Each one shows a rule about paddocks, grazing areas or water. */
export function handMadeLayouts(): NamedLayout[] {
  const out: NamedLayout[] = [];
  const make = (name: string, build: (l: FarmLayout) => void, farmHa = 2000): void => {
    const layout = bareLayout(farmHa);
    build(layout);
    out.push({ name, layout });
  };

  make('one paddock, no water', () => {});
  make('one paddock, a trough on the bore', (l) => {
    l.water.troughs.push(l.water.bore);
  });
  make('a fence down the middle with a shut gate', (l) => {
    vRun(l.fences, 20, 0, GRID_H, EDGE.permanent);
    l.fences.vE[vIdx(10, 20)] = EDGE.gateShut;
    l.water.troughs.push(l.water.bore);
  });
  make('the same with the gate open: two paddocks, one grazing area', (l) => {
    vRun(l.fences, 20, 0, GRID_H, EDGE.electric);
    l.fences.vE[vIdx(10, 20)] = EDGE.gateOpen;
    l.water.troughs.push(l.water.bore);
  });
  make('a fence with a gap closes nothing off', (l) => {
    vRun(l.fences, 12, 0, GRID_H - 1, EDGE.permanent);
  });
  make('a lane with a gate at each end is its own paddock', (l) => {
    hRun(l.fences, 10, 0, GRID_W, EDGE.permanent);
    hRun(l.fences, 12, 0, GRID_W, EDGE.permanent);
    vRun(l.fences, 15, 10, 12, EDGE.gateOpen);
    vRun(l.fences, 25, 10, 12, EDGE.gateShut);
    l.water.troughs.push(l.water.bore);
  });
  make('knocked-down tape still bounds a paddock but lets stock through', (l) => {
    hRun(l.fences, 13, 0, GRID_W, EDGE.tape);
    l.fences.hE[hIdx(13, 7)] = EDGE.tapeDown;
    l.water.troughs.push(cell(3, 3));
  });
  make('knocked-down electric fence does the same', (l) => {
    vRun(l.fences, 30, 0, GRID_H, EDGE.electric);
    l.fences.vE[vIdx(20, 30)] = EDGE.electricDown;
    l.water.troughs.push(cell(35, 3));
  });
  make('a box inside a paddock, all three fence types', (l) => {
    box(l.fences, 5, 5, 12, 11, EDGE.permanent);
    box(l.fences, 15, 5, 22, 11, EDGE.electric);
    box(l.fences, 25, 5, 32, 11, EDGE.tape);
    l.water.troughs.push(cell(8, 8), l.water.bore);
  });
  make('a single fenced square', (l) => {
    box(l.fences, 0, 0, 1, 1, EDGE.permanent);
    box(l.fences, GRID_W - 1, GRID_H - 1, GRID_W, GRID_H, EDGE.tape);
  });
  make('a four-way cross, gates open on two arms', (l) => {
    vRun(l.fences, 20, 0, GRID_H, EDGE.permanent);
    hRun(l.fences, 13, 0, GRID_W, EDGE.permanent);
    l.fences.vE[vIdx(3, 20)] = EDGE.gateOpen;
    l.fences.hE[hIdx(13, 30)] = EDGE.gateOpen;
    l.fences.hE[hIdx(13, 5)] = EDGE.gateShut;
    l.water.troughs.push(cell(2, 2));
  });
  make('pipe from the bore to a trough, and a stray trough off the pipe', (l) => {
    for (let x = 20; x <= 30; x++) l.water.pipe[cell(x, 13)] = 1;
    l.water.troughs.push(cell(30, 13), cell(2, 22));
  });
  make('pipe that does not reach the bore', (l) => {
    for (let x = 2; x <= 9; x++) l.water.pipe[cell(x, 3)] = 1;
  });
  make('a hub on a fence line waters both sides', (l) => {
    vRun(l.fences, 20, 0, GRID_H, EDGE.permanent);
    l.water.hubs.push(vertexId(20, 14));
  });
  make('a hub on a corner where four paddocks meet', (l) => {
    vRun(l.fences, 21, 0, GRID_H, EDGE.permanent);
    hRun(l.fences, 14, 0, GRID_W, EDGE.electric);
    l.water.hubs.push(vertexId(21, 14));
  });
  make('hubs on the boundary and in a farm corner', (l) => {
    vRun(l.fences, 9, 0, GRID_H, EDGE.permanent);
    l.water.hubs.push(vertexId(9, 0), vertexId(0, 0), vertexId(GRID_W, GRID_H), vertexId(0, 9));
  });
  make('a hub carries water on to pipe on its far side', (l) => {
    vRun(l.fences, 21, 0, GRID_H, EDGE.permanent);
    l.water.hubs.push(vertexId(21, 14));
    // The bore at (20, 13) touches the hub. Pipe runs on from (21, 14).
    for (let x = 21; x <= 28; x++) l.water.pipe[cell(x, 14)] = 1;
    l.water.troughs.push(cell(28, 14));
  });
  make('a square hub: a trough with an open gate on each side', (l) => {
    const c = l.water.bore;
    const x = c % GRID_W;
    const y = (c / GRID_W) | 0;
    l.water.troughs.push(c);
    for (const e of [hEdge(y, x), hEdge(y + 1, x), vEdge(y, x), vEdge(y, x + 1)]) {
      if (e.line === 'h') l.fences.hE[e.index] = EDGE.gateOpen;
      else l.fences.vE[e.index] = EDGE.gateOpen;
    }
    vRun(l.fences, x, 0, y, EDGE.permanent);
    vRun(l.fences, x + 1, y + 1, GRID_H, EDGE.permanent);
  });
  make('portable troughs: full, part full and empty', (l) => {
    vRun(l.fences, 13, 0, GRID_H, EDGE.permanent);
    l.water.ports.push(
      { id: 1, cell: cell(3, 3), level: PORTABLE_CAPACITY_L, warned: false, lastUse: 0 },
      { id: 2, cell: cell(30, 20), level: 200, warned: true, lastUse: 310 },
      { id: 3, cell: cell(35, 5), level: 0, warned: true, lastUse: 0 },
    );
    l.water.nextPortId = 4;
  });
  make('a portable trough on the same square as a fixed trough', (l) => {
    l.water.troughs.push(l.water.bore);
    l.water.ports.push({ id: 1, cell: l.water.bore, level: 3000, warned: false, lastUse: 0 });
    l.water.nextPortId = 2;
  });
  make(
    'many small paddocks on a big farm, a trough in every third',
    (l) => {
      for (let x = 4; x < GRID_W; x += 4) vRun(l.fences, x, 0, GRID_H, EDGE.permanent);
      for (let y = 5; y < GRID_H; y += 5) hRun(l.fences, y, 0, GRID_W, EDGE.electric);
      for (let k = 0; k < 20; k++) l.water.troughs.push(cell((k * 7) % GRID_W, (k * 5) % GRID_H));
    },
    12000,
  );
  make('a spiral of tape', (l) => {
    hRun(l.fences, 4, 4, 36, EDGE.tape);
    vRun(l.fences, 36, 4, 22, EDGE.tape);
    hRun(l.fences, 22, 8, 36, EDGE.tape);
    vRun(l.fences, 8, 8, 22, EDGE.tape);
    hRun(l.fences, 8, 8, 32, EDGE.tape);
    l.water.troughs.push(cell(20, 13));
  });
  return out;
}

const FENCE_CODES = [EDGE.permanent, EDGE.electric, EDGE.tape] as const;

/** Any edge on the farm, the boundary included. */
export function randomEdge(rng: Rng): EdgeRef {
  return rng.chance(0.5)
    ? hEdge(rng.int(0, GRID_H), rng.int(0, GRID_W - 1))
    : vEdge(rng.int(0, GRID_H - 1), rng.int(0, GRID_W));
}

/** Every edge that holds one of the given codes. */
export function edgesWith(f: Fences, codes: readonly number[]): EdgeRef[] {
  const out: EdgeRef[] = [];
  f.hE.forEach((v, index) => {
    if (codes.includes(v)) out.push({ line: 'h', index });
  });
  f.vE.forEach((v, index) => {
    if (codes.includes(v)) out.push({ line: 'v', index });
  });
  return out;
}

/**
 * A random layout: full-length lines, boxes, loose runs, gates open and
 * shut, knocked-down fences, pipe, troughs on and off the pipe, hubs and
 * portable troughs. `busy` from 0 to 1 sets how much of everything.
 */
export function randomLayout(rng: Rng, farmHa: number, busy = 0.5): FarmLayout {
  const bore = cell(rng.int(4, GRID_W - 5), rng.int(4, GRID_H - 5));
  const layout = bareLayout(farmHa, bore);
  const f = layout.fences;
  const code = (): number => rng.pick(FENCE_CODES);
  const n = (lo: number, hi: number): number => Math.round(rng.int(lo, hi) * busy * 2);

  for (let k = n(0, 3); k > 0; k--) vRun(f, rng.int(1, GRID_W - 1), 0, GRID_H, code());
  for (let k = n(0, 2); k > 0; k--) hRun(f, rng.int(1, GRID_H - 1), 0, GRID_W, code());
  for (let k = n(0, 3); k > 0; k--) {
    const x0 = rng.int(0, GRID_W - 2);
    const y0 = rng.int(0, GRID_H - 2);
    const x1 = rng.int(x0 + 1, Math.min(GRID_W, x0 + 12));
    const y1 = rng.int(y0 + 1, Math.min(GRID_H, y0 + 9));
    box(f, x0, y0, x1, y1, code());
  }
  for (let k = n(0, 6); k > 0; k--) {
    if (rng.chance(0.5)) {
      const x0 = rng.int(0, GRID_W - 1);
      hRun(f, rng.int(1, GRID_H - 1), x0, rng.int(x0 + 1, GRID_W), code());
    } else {
      const y0 = rng.int(0, GRID_H - 1);
      vRun(f, rng.int(1, GRID_W - 1), y0, rng.int(y0 + 1, GRID_H), code());
    }
  }
  // The runs above may have written over the boundary. Put it back.
  const fresh = createFences();
  fresh.hE.forEach((v, i) => {
    if (v === EDGE.boundary) f.hE[i] = v;
  });
  fresh.vE.forEach((v, i) => {
    if (v === EDGE.boundary) f.vE[i] = v;
  });
  // Gates, open and shut, and knocked-down fences, on fences that are there.
  const standing = edgesWith(f, [EDGE.permanent, EDGE.electric, EDGE.tape]);
  for (const e of standing) {
    const r = rng.next();
    const was = e.line === 'h' ? f.hE[e.index]! : f.vE[e.index]!;
    let now = was;
    if (r < 0.04 * busy) now = EDGE.gateShut;
    else if (r < 0.1 * busy) now = EDGE.gateOpen;
    else if (r < 0.14 * busy && was === EDGE.tape) now = EDGE.tapeDown;
    else if (r < 0.14 * busy && was === EDGE.electric) now = EDGE.electricDown;
    else if (r < 0.16 * busy) now = EDGE.none;
    if (e.line === 'h') f.hE[e.index] = now;
    else f.vE[e.index] = now;
  }

  const w = layout.water;
  for (let k = n(0, 4); k > 0; k--) {
    // Pipe runs, the first from the bore.
    let at = k === 1 || rng.chance(0.6) ? bore : rng.int(0, GRID_N - 1);
    for (let leg = rng.int(1, 3); leg > 0; leg--) {
      const x = at % GRID_W;
      const y = (at / GRID_W) | 0;
      if (rng.chance(0.5)) {
        const x1 = rng.int(0, GRID_W - 1);
        for (let i = Math.min(x, x1); i <= Math.max(x, x1); i++) w.pipe[cell(i, y)] = 1;
        at = cell(x1, y);
      } else {
        const y1 = rng.int(0, GRID_H - 1);
        for (let i = Math.min(y, y1); i <= Math.max(y, y1); i++) w.pipe[cell(x, i)] = 1;
        at = cell(x, y1);
      }
      if (rng.chance(0.5) && !w.troughs.includes(at)) w.troughs.push(at);
    }
  }
  if (rng.chance(0.7)) w.troughs.push(bore);
  for (let k = n(0, 2); k > 0; k--) {
    const t = rng.int(0, GRID_N - 1);
    if (!w.troughs.includes(t)) w.troughs.push(t);
  }
  for (let k = n(0, 3); k > 0; k--) {
    const v = vertexId(rng.int(0, GRID_W), rng.int(0, GRID_H));
    if (!w.hubs.includes(v)) w.hubs.push(v);
  }
  for (let k = n(0, 3); k > 0; k--) {
    w.ports.push({
      id: w.nextPortId++,
      cell: rng.int(0, GRID_N - 1),
      level: rng.pick([0, 0, 150, 1499, 1500, 3000, PORTABLE_CAPACITY_L]),
      warned: rng.chance(0.3),
      lastUse: 0,
    });
  }
  layout.tapeOnRoll = rng.chance(0.5) ? 0 : rng.int(1, 40);
  return layout;
}
