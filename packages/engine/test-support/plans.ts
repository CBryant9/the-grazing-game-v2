/**
 * Helpers for grazing plan tests: a farm of paddocks in a row, each with
 * water, and the old game's plan set up in the MVP beside the engine's.
 *
 * Test use only. Nothing in `src` may import this file.
 *
 * What was added to the MVP hook for plans (in memory only; the file under
 * `reference/` is never changed): `normPlan`, `perDayOf` and `planStep` are
 * reached through the whole-farm hook in `mvpWhole.ts`, and `mvpSetPlan`
 * below does what the MVP's `commitPlan` does (it makes the plan record and
 * puts the mob on the first stop) without the dialog code that surrounds it.
 */

import type { DistrictId } from '@gg/shared';
import type { PlanSpec } from '../src/actions/types';
import { GRID_W } from '../src/grid';
import type { FarmState } from '../src/sim/state';
import type { MvpLeg, MvpPlan, MvpWhole, MvpWholeMob } from './mvpWhole';
import { across, boreXY, down, setUp } from './workingDay';
import { openFarm } from './wholeFarm';

const cell = (x: number, y: number): number => y * GRID_W + x;

/** The columns the paddocks start at: four paddocks, 6 squares wide. */
const XS = [4, 10, 16, 22, 28];

export interface PlanFarm {
  farm: FarmState;
  /** One square in each of the four paddocks, in order. */
  stops: number[];
  /** The square each paddock's trough goes on (a trough is only placed where `dry` does not list the paddock). */
  troughs: number[];
  /** A square of the open country, where the bore is. It has water. */
  open: number;
  /** The row of squares (y) the pipe and the troughs are on. */
  rowY: number;
}

/**
 * A farm with four paddocks in a row, fenced with permanent fence so they
 * stay four, and a trough in each on a pipe from the bore. `dry` lists
 * paddocks (0 to 3) that get no trough, so no water.
 */
export function planFarm(
  district: DistrictId,
  over: { seed?: number; start?: { year: number; month: number }; dry?: number[] } = {},
): PlanFarm {
  let farm = openFarm(district, {
    seed: over.seed ?? 1,
    ...(over.start ? { start: over.start } : {}),
  });
  const [bx, by] = boreXY(farm);
  const top = by > 13 ? 2 : 16;
  const y0 = top;
  const y1 = top + 5;
  const rowY = y0 + 2;
  const pipe: number[] = [];
  const step = y0 > by ? 1 : -1;
  for (let y = by + step; y !== rowY; y += step) pipe.push(cell(bx, y));
  for (let x = Math.min(bx, 3); x <= Math.max(bx, 30); x++) pipe.push(cell(x, rowY));
  farm = setUp(farm, { type: 'layPipe', cells: [...new Set(pipe)] });
  farm = setUp(farm, { type: 'buildFence', edges: across(y0, 4, 27), fence: 'permanent' });
  farm = setUp(farm, { type: 'buildFence', edges: across(y1 + 1, 4, 27), fence: 'permanent' });
  for (const x of XS) {
    farm = setUp(farm, { type: 'buildFence', edges: down(x, y0, y1), fence: 'permanent' });
  }
  for (let i = 0; i < 4; i++) {
    if (over.dry?.includes(i)) continue;
    farm = setUp(farm, { type: 'placeTrough', cell: cell(XS[i]! + 2, rowY) });
  }
  return {
    farm,
    stops: XS.slice(0, 4).map((x) => cell(x + 3, y0 + 3)),
    troughs: XS.slice(0, 4).map((x) => cell(x + 2, rowY)),
    open: cell(Math.min(bx, 36), by),
    rowY,
  };
}

/** The old game's leg for a leg as the engine is asked for it. */
function mvpLeg(l: PlanSpec['legs'][number]): MvpLeg {
  return {
    stops: l.stops.slice(),
    mode: l.rule.mode,
    every: l.rule.mode === 'days' ? l.rule.every : 3,
    kg: l.rule.mode === 'kg' ? l.rule.kg : 1500,
    maxDays: l.rule.mode === 'kg' ? l.rule.maxDays : 0,
    rounds: l.rounds ?? 0,
  };
}

/**
 * Put a mob on a plan in the old game, as its `commitPlan` does: the plan
 * record, with the report at nothing, and the mob moved to the stop unless
 * it is already in that area. `step` is the flat step the engine was given.
 * `keep` carries a report over (a plan started again at a step keeps its
 * counts in the engine).
 */
export function mvpSetPlan(
  mvp: MvpWhole,
  mob: MvpWholeMob,
  spec: PlanSpec,
  step = 0,
  keep?: MvpPlan['rep'],
): MvpPlan {
  const legs = spec.legs.map(mvpLeg);
  let left = step;
  let leg = 0;
  while (left >= legs[leg]!.stops.length) left -= legs[leg++]!.stops.length;
  const day = mvp.S.day;
  const plan: MvpPlan = {
    legs,
    after: spec.after,
    leg,
    idx: left,
    round: 0,
    moved: day,
    noted: 0,
    rep: keep ?? {
      start: day,
      moves: 0,
      rounds: 0,
      eaten: 0,
      gain: 0,
      headDays: 0,
      paddocks: {},
    },
  };
  mob.plan = plan;
  const stop = legs[leg]!.stops[left]!;
  if (mob.loc === 'lot') mob.loc = 'pad';
  if (!(mob.loc === 'pad' && mvp.ROF[mob.anchor] === mvp.ROF[stop])) mvp.moveMob(mob, stop, true);
  return plan;
}
