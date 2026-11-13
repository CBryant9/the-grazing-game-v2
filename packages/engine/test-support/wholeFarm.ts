/**
 * Helpers for whole-farm tests: quick farms, doing actions, fence boxes and
 * a check that every figure on a farm is a finite number.
 *
 * Test use only. Nothing in `src` may import this file.
 */

import type { DistrictId } from '@gg/shared';
import { expect } from 'vitest';
import { applyAction } from '../src/actions/apply';
import type { Action, ActionRefusal } from '../src/actions/types';
import { hEdge, vEdge, type EdgeRef } from '../src/farm/topology';
import { GRID_W } from '../src/grid';
import type { Rng } from '../src/rng';
import { createFarm, type CreateFarmOptions } from '../src/sim/create';
import { surveyOf } from '../src/sim/derived';
import type { FarmEvent } from '../src/sim/events';
import type { FarmState } from '../src/sim/state';

/** Money that never runs out, as the old calibration runs had. */
export const PLENTY = { cash: 5e6, overdraft: -5e6, broke: -1e7 } as const;

/** A from-scratch farm with plenty in the bank: the boundary, the bore and a trough on it. */
export function scratchFarm(
  district: DistrictId = 'nsw',
  over: Partial<CreateFarmOptions> = {},
): FarmState {
  return createFarm({
    seed: 1,
    district,
    size: 260,
    start: { year: 2023, month: 8 },
    startType: 'scratch',
    difficulty: 'easy',
    money: { ...PLENTY },
    ...over,
  });
}

/** A from-scratch farm with no old fence line: one paddock, the bore in it. */
export function openFarm(
  district: DistrictId = 'nsw',
  over: Partial<CreateFarmOptions> = {},
): FarmState {
  for (let seed = over.seed ?? 1; ; seed++) {
    const farm = scratchFarm(district, { ...over, seed });
    if (surveyOf(farm).topology.paddocks.length === 1) return farm;
  }
}

/** A from-scratch farm that came with its one old fence line: a second paddock, with no water. */
export function twoPaddockFarm(
  district: DistrictId = 'nsw',
  over: Partial<CreateFarmOptions> = {},
): FarmState {
  for (let seed = over.seed ?? 1; ; seed++) {
    const farm = scratchFarm(district, { ...over, seed });
    if (surveyOf(farm).topology.paddocks.length === 2) return farm;
  }
}

/** Do an action that must succeed. Returns the farm after it. */
export function act(farm: FarmState, action: Action): FarmState {
  const done = applyAction(farm, action);
  if (!done.ok) throw new Error(`${action.type} was refused (${done.reason}): ${done.message}`);
  return done.farm;
}

/** Do an action that must succeed. Returns the farm after it and the events. */
export function actWith(farm: FarmState, action: Action): { farm: FarmState; events: FarmEvent[] } {
  const done = applyAction(farm, action);
  if (!done.ok) throw new Error(`${action.type} was refused (${done.reason}): ${done.message}`);
  return { farm: done.farm, events: done.events };
}

/** Do an action that must be refused. Returns the refusal. */
export function refused(farm: FarmState, action: Action): ActionRefusal {
  const done = applyAction(farm, action);
  if (done.ok) throw new Error(`${action.type} should have been refused`);
  expect(done.message.length).toBeGreaterThan(10);
  return done;
}

export const cellAt = (x: number, y: number): number => y * GRID_W + x;

/** The edges round a box of squares, x0 to x1 and y0 to y1. */
export function boxEdges(x0: number, y0: number, x1: number, y1: number): EdgeRef[] {
  const out: EdgeRef[] = [];
  for (let x = x0; x <= x1; x++) out.push(hEdge(y0, x), hEdge(y1 + 1, x));
  for (let y = y0; y <= y1; y++) out.push(vEdge(y, x0), vEdge(y, x1 + 1));
  return out;
}

/** The squares in a box, x0 to x1 and y0 to y1. */
export function boxCells(x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(cellAt(x, y));
  return out;
}

/** A corner of the farm well away from the bore, as [x0, y0], for a box up to 6 squares across. */
export function farCorner(farm: FarmState): [number, number] {
  const bx = farm.layout.water.bore % GRID_W;
  return [bx < GRID_W / 2 ? GRID_W - 9 : 3, 3];
}

/** A stream that gives the same number every time. `pick` takes the first item. */
export function fixedRng(value: number): Rng {
  return {
    next: () => value,
    range: (lo, hi) => lo + (hi - lo) * value,
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * value),
    chance: (p) => value < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(value * items.length)] as T,
    gauss: () => 0,
    state: () => [0, 0, 0, 0],
  };
}

/** Every number on a farm that is not finite, as a path to it. An empty list means none. */
export function notFinite(v: unknown, path = 'farm', out: string[] = []): string[] {
  if (out.length > 20) return out;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} = ${v}`);
  } else if (ArrayBuffer.isView(v)) {
    const a = v as unknown as ArrayLike<number>;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i])) {
        out.push(`${path}[${i}] = ${a[i]}`);
        break;
      }
    }
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => notFinite(x, `${path}[${i}]`, out));
  } else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) notFinite(x, `${path}.${k}`, out);
  }
  return out;
}

/** Head on the farm, calves included. */
export const headOn = (farm: FarmState): number =>
  farm.mobs.reduce((n, m) => n + m.animals.length, 0);

/** Assert no two mobs share a grazing area, the feedlot or the yards. */
export function expectOneMobPerArea(farm: FarmState, where = ''): void {
  const s = surveyOf(farm);
  const seen = new Map<string, number>();
  for (const m of farm.mobs) {
    expect(m.animals.length, `an empty mob ${where}`).toBeGreaterThan(0);
    const key =
      m.where.kind === 'paddock' ? 'area ' + s.topology.areaOf[m.where.anchor] : m.where.kind;
    expect(
      seen.get(key),
      `mobs ${seen.get(key)} and ${m.id} share ${key} ${where}`,
    ).toBeUndefined();
    seen.set(key, m.id);
  }
}
