/**
 * Helpers for tests of the working day: doing jobs on the farm clock, and
 * a farm on which every kind of action can be done.
 *
 * Test use only. Nothing in `src` may import this file.
 */

import { expect } from 'vitest';
import type { ActionEnv } from '../src/actions/apply';
import type { Action, ActionDone, ActionRefusal, JobCard } from '../src/actions/types';
import { applyAction } from '../src/day/act';
import { EDGE, cloneFences, hEdge, setEdge, vEdge, type EdgeRef } from '../src/farm/topology';
import { GRID_W } from '../src/grid';
import { surveyOf } from '../src/sim/derived';
import { cloneFarm, type FarmState } from '../src/sim/state';
import { stepDay } from '../src/sim/tick';
import { applyInstantly } from './instant';
import { openFarm } from './wholeFarm';

/** A job done on the clock, with its card. */
export type Worked = ActionDone & { job: JobCard };

/** Do a job on the farm clock that must be accepted. */
export function work(farm: FarmState, action: Action, env: ActionEnv = {}): Worked {
  const done = applyAction(farm, action, env);
  if (!done.ok) throw new Error(`${action.type} was refused (${done.reason}): ${done.message}`);
  if (!done.job) throw new Error(`${action.type} came back with no job card`);
  return done as Worked;
}

/** Do a job on the farm clock that must be refused. */
export function turnedDown(farm: FarmState, action: Action, env: ActionEnv = {}): ActionRefusal {
  const done = applyAction(farm, action, env);
  if (done.ok) throw new Error(`${action.type} should have been refused`);
  expect(done.message.length).toBeGreaterThan(10);
  return done;
}

/** Set a farm up all at once, off the clock. */
export function setUp(farm: FarmState, action: Action, env: ActionEnv = {}): FarmState {
  const done = applyInstantly(farm, action, env);
  if (!done.ok) throw new Error(`${action.type} was refused (${done.reason}): ${done.message}`);
  return done.farm;
}

/** A run of fence line along the top of row `vy`, from column `x0` to `x1`, left to right. */
export function across(vy: number, x0: number, x1: number): EdgeRef[] {
  const out: EdgeRef[] = [];
  for (let x = x0; x <= x1; x++) out.push(hEdge(vy, x));
  return out;
}

/** A run of fence line down the left of column `vx`, from row `y0` to `y1`, top to bottom. */
export function down(vx: number, y0: number, y1: number): EdgeRef[] {
  const out: EdgeRef[] = [];
  for (let y = y0; y <= y1; y++) out.push(vEdge(y, vx));
  return out;
}

export const cell = (x: number, y: number): number => y * GRID_W + x;

/** The column of the square the bore is on, and its row. */
export function boreXY(farm: FarmState): [number, number] {
  const b = farm.layout.water.bore;
  return [b % GRID_W, Math.floor(b / GRID_W)];
}

/** Use up today's light, as if the player had worked until last light where they stand. */
export function atLastLight(farm: FarmState): FarmState {
  const f = cloneFarm(farm);
  f.clock.used = f.clock.lastLight - f.clock.firstLight;
  return f;
}

/** Leave this many minutes of today's light. */
export function withLightLeft(farm: FarmState, minutes: number): FarmState {
  const f = cloneFarm(farm);
  f.clock.used = f.clock.lastLight - f.clock.firstLight - minutes;
  return f;
}

/**
 * A farm on which every kind of action can be done, with the ids a test
 * needs to ask for each one. Set up all at once, off the clock.
 *
 * A row of small paddocks across the top, each with something in it: cows
 * with calves old enough to wean and mark, steers, standing tape, electric
 * fence with a segment knocked down, a gate, a trough on pipe, a water hub
 * and a portable trough. On a mixed farm, run until a crop is ready.
 */
export interface BusyFarm {
  farm: FarmState;
  /** A mob of cows with calves, and a mob of steers. */
  cows: number;
  steers: number;
  /** A square of the steers' paddock, a square of an empty watered paddock, and a square of open country. */
  steerCell: number;
  emptyCell: number;
  openCell: number;
  /** A gate, a standing tape segment, and a knocked-down electric segment. */
  gate: EdgeRef;
  tape: EdgeRef;
  downed: EdgeRef;
  /** A fixed trough that is not on the bore, and a piped square with no trough. */
  trough: number;
  pipedCell: number;
  /** A water hub on a fence corner. */
  hub: number;
  /** A portable trough. */
  port: number;
}

export function busyFarm(): BusyFarm {
  let farm = openFarm('nsw');
  const [bx, by] = boreXY(farm);
  // Work in the half of the farm away from the bore's row.
  const top = by > 13 ? 2 : 16;
  const y0 = top;
  const y1 = top + 5;
  // Pipe from the bore up or down to the row of paddocks, then along it.
  const pipe: number[] = [];
  const step = y0 > by ? 1 : -1;
  for (let y = by + step; y !== y0 + 2; y += step) pipe.push(cell(bx, y));
  const rowY = y0 + 2;
  const xs = [4, 10, 16, 22, 28];
  for (let x = Math.min(bx, 3); x <= Math.max(bx, 30); x++) pipe.push(cell(x, rowY));
  pipe.push(cell(bx, rowY));
  farm = setUp(farm, { type: 'layPipe', cells: [...new Set(pipe)] });

  // Four paddocks in a row, 5 squares wide and 6 deep: permanent outside, electric between.
  farm = setUp(farm, { type: 'buildFence', edges: across(y0, 4, 27), fence: 'permanent' });
  farm = setUp(farm, { type: 'buildFence', edges: across(y1 + 1, 4, 27), fence: 'permanent' });
  farm = setUp(farm, { type: 'buildFence', edges: down(4, y0, y1), fence: 'permanent' });
  farm = setUp(farm, { type: 'buildFence', edges: down(28, y0, y1), fence: 'permanent' });
  farm = setUp(farm, { type: 'buildFence', edges: down(10, y0, y1), fence: 'electric' });
  farm = setUp(farm, { type: 'buildFence', edges: down(16, y0, y1), fence: 'electric' });
  farm = setUp(farm, { type: 'buildFence', edges: down(22, y0, y1), fence: 'tape' });
  // A trough in each of the first three paddocks, on the pipe.
  for (const x of [xs[0]! + 2, xs[1]! + 2, xs[2]! + 2]) {
    if (!farm.layout.water.troughs.includes(cell(x, rowY))) {
      farm = setUp(farm, { type: 'placeTrough', cell: cell(x, rowY) });
    }
  }
  const gate = vEdge(y0 + 1, 10);
  farm = setUp(farm, { type: 'placeGate', edge: gate });
  // A water hub on the fence corner where the pipe row meets the tape line.
  const hub = (rowY + 1) * (GRID_W + 1) + 22;
  farm = setUp(farm, { type: 'placeFenceHub', vertex: hub });
  farm = setUp(farm, { type: 'placePortable', cell: cell(xs[3]! + 3, y1) });
  const port = farm.layout.water.ports[0]!.id;

  // Cows with calves in the first paddock, steers in the second.
  farm = setUp(farm, {
    type: 'buyCattle',
    cls: 'cowCalf',
    qty: 12,
    to: { cell: cell(xs[0]! + 1, y0 + 1) },
  });
  const cows = farm.mobs[0]!;
  let k = 0;
  for (const a of cows.animals) {
    if (a.kind !== 'calf') continue;
    a.age = 120;
    a.sex = k++ % 2 === 0 ? 'M' : 'F';
  }
  farm = setUp(farm, {
    type: 'buyCattle',
    cls: 'yearSteer',
    qty: 40,
    to: { cell: cell(xs[1]! + 1, y0 + 1) },
  });
  const steers = farm.mobs.find((m) => m.id !== cows.id)!;

  // One electric segment knocked down, on the line between the second and third paddocks.
  const downed = vEdge(y1, 16);
  const fences = cloneFences(farm.layout.fences);
  setEdge(fences, downed, EDGE.electricDown);
  farm.layout = { ...farm.layout, fences };
  // The knocked-down segment joins two areas for grazing. The steers are the only mob there.
  expect(surveyOf(farm).topology.paddocks.length).toBeGreaterThan(4);

  return {
    farm,
    cows: cows.id,
    steers: steers.id,
    steerCell: cell(xs[1]! + 1, y0 + 1),
    emptyCell: cell(xs[3]! + 2, y0 + 1),
    openCell: cell(34, top + 2),
    gate,
    tape: vEdge(y0 + 2, 22),
    downed,
    trough: cell(xs[1]! + 2, rowY),
    pipedCell: cell(xs[0]! + 1, rowY),
    hub,
    port,
  };
}

/** Run a mixed farm, off the clock, until a crop is ready to harvest. */
export function farmWithCropReady(make: () => FarmState): { farm: FarmState; field: number } {
  const farm = make();
  for (let d = 0; d < 400; d++) {
    for (const e of stepDay(farm).events) {
      if (e.type === 'crop' && e.event.type === 'harvest-ready') {
        return { farm, field: e.event.fieldId };
      }
    }
  }
  throw new Error('no crop came ready');
}
