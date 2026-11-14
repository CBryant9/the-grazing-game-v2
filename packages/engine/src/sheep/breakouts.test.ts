import { describe, expect, it } from 'vitest';
import { applyInstantly } from '../../test-support/instant';
import { across } from '../../test-support/workingDay';
import { GRID_W } from '../grid';
import { createFarm } from '../sim/create';
import { surveyOf } from '../sim/derived';
import type { FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { addSheepMob, sheepMobsOf } from './farm';
import { headOf } from './simFlock';

/*
 * One mob to a paddock holds by itself (call, 15 Nov 2026): thirsty or
 * hungry cattle never push through tape into a paddock that holds sheep,
 * and sheep never get into one that holds cattle. They take another fence,
 * or stay put, and the facts (no water, short of feed) are still raised.
 */

/**
 * A scratch block cut in two by tape across the middle. Steers go in the
 * half with no water, so they push at the tape to drink; the bore is in the
 * other half.
 */
function cutBlock(seed: number): { farm: FarmState; boreCell: number } {
  let farm = createFarm({
    seed,
    district: 'nsw',
    size: 'small',
    start: { year: 2021, month: 6 },
    startType: 'scratch',
    difficulty: 'easy',
    money: { cash: 1e7, overdraft: -1e7, broke: -1e8 },
  });
  const done = applyInstantly(farm, {
    type: 'buildFence',
    edges: across(13, 0, GRID_W - 1),
    fence: 'tape',
  });
  if (!done.ok) throw new Error(done.message);
  farm = done.farm;
  const bore = farm.layout.water.bore;
  const s = surveyOf(farm);
  const boreArea = s.topology.areaOf[bore]!;
  const dry = s.topology.areas.find((a) => a.id !== boreArea)!;
  const bought = applyInstantly(farm, {
    type: 'buyCattle',
    cls: 'weanerSteer',
    qty: 60,
    to: { cell: dry.cells[0]! },
  });
  if (!bought.ok) throw new Error(bought.message);
  return { farm: bought.farm, boreCell: bore };
}

describe('one mob to a paddock, across species', () => {
  it('thirsty cattle push through the tape when the other side is empty (the test is live)', () => {
    const { farm } = cutBlock(3);
    let n = 0;
    for (let d = 0; d < 3; d++)
      for (const e of stepDay(farm).events) if (e.type === 'breakout') n++;
    expect(n).toBe(1);
  });

  it('thirsty cattle never push into a paddock that holds sheep, and stay put when every tape leads to sheep', () => {
    const { farm, boreCell } = cutBlock(3);
    const r = addSheepMob(farm, surveyOf(farm), {
      cell: boreCell,
      breed: 'merino',
      groups: [{ cls: 'wether', head: 50 }],
    });
    expect(r.ok).toBe(true);
    const s = surveyOf(farm);
    const sheepArea = s.topology.areaOf[boreCell]!;
    let noWater = 0;
    for (let d = 0; d < 3; d++) {
      const res = stepDay(farm);
      expect(res.events.some((e) => e.type === 'breakout')).toBe(false);
      for (const e of res.events) if (e.type === 'cattle' && e.note.type === 'noWater') noWater++;
      for (const m of farm.mobs) {
        if (m.where.kind === 'paddock') {
          expect(s.topology.areaOf[m.where.anchor]).not.toBe(sheepArea);
        }
      }
    }
    // The thirst is still told.
    expect(noWater).toBeGreaterThan(0);
    expect(headOf(sheepMobsOf(farm)[0]!.sheep)).toBe(50);
  });

  /** The same block, with sheep (not cattle) in the half with no water. */
  function dryHalfSheep(seed: number): { farm: FarmState; boreCell: number; dryCell: number } {
    let farm = createFarm({
      seed,
      district: 'nsw',
      size: 'small',
      start: { year: 2021, month: 6 },
      startType: 'scratch',
      difficulty: 'easy',
      money: { cash: 1e7, overdraft: -1e7, broke: -1e8 },
    });
    const done = applyInstantly(farm, {
      type: 'buildFence',
      edges: across(13, 0, GRID_W - 1),
      fence: 'permanent',
    });
    if (!done.ok) throw new Error(done.message);
    farm = done.farm;
    const bore = farm.layout.water.bore;
    const s = surveyOf(farm);
    const dry = s.topology.areas.find((a) => a.id !== s.topology.areaOf[bore])!;
    const r = addSheepMob(farm, s, {
      cell: dry.cells[0]!,
      breed: 'merino',
      groups: [{ cls: 'wether', head: 200 }],
    });
    if (!r.ok) throw new Error(r.reason);
    return { farm, boreCell: bore, dryCell: dry.cells[0]! };
  }

  it('thirsty sheep get through a cattle fence (permanent) into the empty paddock next door', () => {
    const { farm, boreCell } = dryHalfSheep(4);
    let got = 0;
    for (let d = 0; d < 3; d++) {
      for (const e of stepDay(farm).events) if (e.type === 'sheep-breakout') got++;
    }
    expect(got).toBe(1);
    const s = surveyOf(farm);
    const m = sheepMobsOf(farm)[0]!;
    expect(m.where.kind === 'paddock' && s.topology.areaOf[m.where.anchor]).toBe(
      s.topology.areaOf[boreCell],
    );
  });

  it('thirsty sheep never get into a paddock that holds cattle; they take another fence', () => {
    const { farm, boreCell, dryCell } = dryHalfSheep(4);
    const bought = applyInstantly(farm, {
      type: 'buyCattle',
      cls: 'weanerSteer',
      qty: 20,
      to: { cell: boreCell },
    });
    if (!bought.ok) throw new Error(bought.message);
    const f = bought.farm;
    const s = surveyOf(f);
    const cattleArea = s.topology.areaOf[boreCell]!;
    for (let d = 0; d < 3; d++) {
      for (const e of stepDay(f).events) {
        if (e.type === 'sheep-breakout') expect(e.to).not.toBe(s.topology.areas[cattleArea]!.name);
      }
      const m = sheepMobsOf(f)[0];
      if (m && m.where.kind === 'paddock') {
        expect(s.topology.areaOf[m.where.anchor]).not.toBe(cattleArea);
      }
    }
    void dryCell;
  });

  it('a netting fence holds sheep: thirsty sheep behind netting stay put', () => {
    const { farm } = dryHalfSheep(4);
    const done = applyInstantly(farm, {
      type: 'buildFence',
      edges: across(13, 0, GRID_W - 1),
      fence: 'netting',
    });
    if (!done.ok) throw new Error(done.message);
    const f = done.farm;
    for (let d = 0; d < 3; d++) {
      expect(stepDay(f).events.some((e) => e.type === 'sheep-breakout')).toBe(false);
    }
  });
});
