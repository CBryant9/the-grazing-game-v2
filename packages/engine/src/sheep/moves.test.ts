import { describe, expect, it } from 'vitest';
import { applyInstantly } from '../../test-support/instant';
import { previewAction } from '../day/act';
import { createFarm } from '../sim/create';
import { surveyOf } from '../sim/derived';
import type { FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { addSheepMob, sheepMobsOf } from './farm';
import { across } from '../../test-support/workingDay';
import { GRID_W } from '../grid';
import { headOf } from './simFlock';

/*
 * Moving sheep (milestone 2.3, third pass): a whole mob, part of a mob, and
 * grazing plans, with the species rules and the cattle move's daylight.
 */

interface Setup {
  farm: FarmState;
  mob: number;
  sheepCell: number;
  emptyCells: number[];
  cattleCell: number;
  dryCell: number | null;
}

function setup(): Setup {
  // A scratch block cut into bands by permanent fence: sheep at the bore, steers in another band.
  let farm = createFarm({
    seed: 5,
    district: 'wv',
    size: 'small',
    start: { year: 2021, month: 2 },
    startType: 'scratch',
    difficulty: 'easy',
    money: { cash: 1e7, overdraft: -1e7, broke: -1e8 },
  });
  for (const vy of [7, 13, 19]) {
    const done = applyInstantly(farm, {
      type: 'buildFence',
      edges: across(vy, 0, GRID_W - 1),
      fence: 'permanent',
    });
    if (!done.ok) throw new Error(done.message);
    farm = done.farm;
  }
  const s = surveyOf(farm);
  const bore = farm.layout.water.bore;
  const home = s.topology.areaOf[bore]!;
  const others = s.topology.areas.filter((x) => x.id !== home);
  const cattleArea = others[0]!;
  const bought = applyInstantly(farm, {
    type: 'buyCattle',
    cls: 'weanerSteer',
    qty: 10,
    to: { cell: cattleArea.cells[0]! },
  });
  if (!bought.ok) throw new Error(bought.message);
  farm = bought.farm;
  const r = addSheepMob(farm, surveyOf(farm), {
    cell: bore,
    breed: 'merino',
    groups: [{ cls: 'ewe', head: 200 }],
  });
  if (!r.ok) throw new Error(r.reason);
  const free = others.slice(1);
  // Water in the first free band (a portable trough); the next band stays dry.
  const port = applyInstantly(farm, { type: 'placePortable', cell: free[0]!.cells[0]! });
  if (!port.ok) throw new Error(port.message);
  farm = port.farm;
  return {
    farm,
    mob: r.mob.id,
    sheepCell: bore,
    emptyCells: free.map((x) => x.cells[0]!),
    cattleCell: cattleArea.cells[0]!,
    dryCell: free.length > 1 ? free[1]!.cells[0]! : null,
  };
}

const areaOf = (farm: FarmState, cell: number): number => surveyOf(farm).topology.areaOf[cell]!;
const mobArea = (farm: FarmState): number => {
  const m = sheepMobsOf(farm)[0]!;
  return m.where.kind === 'paddock' ? areaOf(farm, m.where.anchor) : -1;
};

describe('moving sheep', () => {
  it('moves a whole mob to an empty paddock, at the cattle move time', () => {
    const t = setup();
    expect(t.emptyCells.length).toBeGreaterThan(0);
    const to = t.emptyCells[0]!;
    const card = previewAction(t.farm, { type: 'moveSheep', mob: t.mob, to: { cell: to } });
    expect(card.ok).toBe(true);
    if (card.ok) expect(card.card!.workMin).toBeGreaterThan(0);
    const done = applyInstantly(t.farm, { type: 'moveSheep', mob: t.mob, to: { cell: to } });
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(mobArea(done.farm)).toBe(areaOf(done.farm, to));
      expect(done.events.some((e) => e.type === 'sheep-moved')).toBe(true);
    }
  });

  it('refuses: no such mob, off the farm, already there, and where cattle graze', () => {
    const t = setup();
    const r = (a: Parameters<typeof applyInstantly>[1]): string => {
      const d = applyInstantly(t.farm, a);
      return d.ok ? 'ok' : d.reason;
    };
    expect(r({ type: 'moveSheep', mob: 999, to: { cell: t.emptyCells[0]! } })).toBe('no-such-mob');
    expect(r({ type: 'moveSheep', mob: t.mob, to: { cell: -5 } })).toBe('bad-request');
    expect(r({ type: 'moveSheep', mob: t.mob, to: { cell: t.sheepCell } })).toBe('already-there');
    expect(r({ type: 'moveSheep', mob: t.mob, to: { cell: t.cattleCell } })).toBe('cattle-there');
    expect(
      r({ type: 'moveSheepPart', mob: t.mob, cls: 'lamb', qty: 1, to: { cell: t.emptyCells[0]! } }),
    ).toBe('bad-request');
    expect(
      r({
        type: 'moveSheepPart',
        mob: t.mob,
        cls: 'wether',
        qty: 1,
        to: { cell: t.emptyCells[0]! },
      }),
    ).toBe('nothing-to-move');
  });

  it('a move into a paddock with no water says so', () => {
    const t = setup();
    if (t.dryCell === null) return;
    const done = applyInstantly(t.farm, { type: 'moveSheep', mob: t.mob, to: { cell: t.dryCell } });
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.events.some((e) => e.type === 'no-water')).toBe(true);
  });

  it('moves part of a mob by class and head into a new mob', () => {
    const t = setup();
    const done = applyInstantly(t.farm, {
      type: 'moveSheepPart',
      mob: t.mob,
      cls: 'ewe',
      qty: 50,
      to: { cell: t.emptyCells[0]! },
    });
    expect(done.ok).toBe(true);
    if (done.ok) {
      const mobs = sheepMobsOf(done.farm);
      expect(mobs.length).toBe(2);
      expect(mobs.map((m) => headOf(m.sheep)).sort((a, b) => a - b)).toEqual([50, 150]);
    }
  });

  it('a plan moves sheep on by its rule, and waits at a stop with cattle', () => {
    const t = setup();
    t.farm.plans.push({
      id: 50,
      name: 'Round',
      legs: [
        {
          stops: [t.sheepCell, t.emptyCells[0]!, t.cattleCell],
          rule: { mode: 'days', every: 2 },
          rounds: 0,
        },
      ],
      after: 'repeat',
    });
    const set = applyInstantly(t.farm, { type: 'setSheepPlan', mob: t.mob, template: 50 });
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    const f = set.farm;
    const seen: string[] = [];
    for (let d = 0; d < 6; d++) {
      for (const e of stepDay(f).events) {
        if (e.type === 'sheep-plan-moved' || e.type === 'sheep-plan-waiting') seen.push(e.type);
      }
    }
    expect(seen).toContain('sheep-plan-moved');
    expect(seen).toContain('sheep-plan-waiting');
    expect(mobArea(f)).not.toBe(areaOf(f, t.cattleCell));
    const cleared = applyInstantly(f, { type: 'clearSheepPlan', mob: t.mob });
    expect(cleared.ok).toBe(true);
    expect(applyInstantly(t.farm, { type: 'clearSheepPlan', mob: t.mob }).ok).toBe(false);
  });
});
