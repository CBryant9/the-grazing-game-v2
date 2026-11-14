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

  it('setPlan makes a plan for a sheep mob and runs it as a sheep plan; clearPlan takes it off (m2.8 fix)', () => {
    const t = setup();
    const set = applyInstantly(t.farm, {
      type: 'setPlan',
      mob: t.mob,
      plan: {
        legs: [{ stops: [t.sheepCell, t.emptyCells[0]!], rule: { mode: 'days', every: 2 } }],
        after: 'repeat',
      },
      step: 1,
    });
    expect(set.ok ? 'ok' : set.message).toBe('ok');
    if (!set.ok) return;
    expect(set.farm.plans.length).toBe(1);
    expect(set.events.some((e) => e.type === 'sheep-plan-set')).toBe(true);
    expect(sheepMobsOf(set.farm)[0]!.plan?.template).toBe(set.farm.plans[0]!.id);
    expect(mobArea(set.farm)).toBe(areaOf(set.farm, t.emptyCells[0]!));
    const cleared = applyInstantly(set.farm, { type: 'clearPlan', mob: t.mob });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(sheepMobsOf(cleared.farm)[0]!.plan).toBeUndefined();
    // Still refused for a mob that is on neither list.
    const none = applyInstantly(t.farm, {
      type: 'setPlan',
      mob: 999,
      plan: { legs: [{ stops: [t.sheepCell], rule: { mode: 'days', every: 2 } }], after: 'stay' },
    });
    expect(none.ok ? 'ok' : none.reason).toBe('no-such-mob');
  });
});

describe('sheep plans cost and warn as cattle plans do (review of the third pass, items 2 and 7)', () => {
  function withPlan(t: Setup, stops: number[]): void {
    t.farm.plans.push({
      id: 60,
      name: 'Two',
      legs: [{ stops, rule: { mode: 'days', every: 3 }, rounds: 0 }],
      after: 'repeat',
    });
  }

  it('setting a plan whose first stop is another paddock is a move: the same daylight as moveSheep', () => {
    const t = setup();
    const to = t.emptyCells[0]!;
    withPlan(t, [to, t.sheepCell]);
    const move = previewAction(t.farm, { type: 'moveSheep', mob: t.mob, to: { cell: to } });
    const plan = previewAction(t.farm, { type: 'setSheepPlan', mob: t.mob, template: 60 });
    expect(move.ok && plan.ok).toBe(true);
    if (move.ok && plan.ok) {
      expect(move.card!.workMin).toBeGreaterThan(0);
      expect(plan.card!.workMin).toBe(move.card!.workMin);
    }
    const done = applyInstantly(t.farm, { type: 'setSheepPlan', mob: t.mob, template: 60 });
    expect(done.ok && done.events.some((e) => e.type === 'sheep-moved')).toBe(true);
  });

  it('setting a plan on the stop the mob is already on takes none of the day', () => {
    const t = setup();
    withPlan(t, [t.sheepCell, t.emptyCells[0]!]);
    const plan = previewAction(t.farm, { type: 'setSheepPlan', mob: t.mob, template: 60 });
    expect(plan.ok && plan.card!.workMin).toBe(0);
  });

  it('a plan with a dry stop names it, as the cattle plan does', () => {
    const t = setup();
    if (t.dryCell === null) return;
    withPlan(t, [t.dryCell, t.emptyCells[0]!]);
    const done = applyInstantly(t.farm, { type: 'setSheepPlan', mob: t.mob, template: 60 });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const set = done.events.find((e) => e.type === 'sheep-plan-set');
    expect(set?.type === 'sheep-plan-set' && set.dryAreas.length).toBe(1);
    // Put on a dry first stop, the mob is told it has no water, as a hand move is.
    expect(done.events.some((e) => e.type === 'no-water')).toBe(true);
  });

  it('a hand move pauses the plan; resume puts the mob back on the plan at a step, at the move time', () => {
    const t = setup();
    withPlan(t, [t.sheepCell, t.emptyCells[0]!]);
    const set = applyInstantly(t.farm, { type: 'setSheepPlan', mob: t.mob, template: 60 });
    if (!set.ok) throw new Error(set.message);
    const moved = applyInstantly(set.farm, {
      type: 'moveSheep',
      mob: t.mob,
      to: { cell: t.emptyCells[0]! },
    });
    if (!moved.ok) throw new Error(moved.message);
    expect(sheepMobsOf(moved.farm)[0]!.plan!.paused).toBe(true);
    // Paused, the plan does not move the mob.
    for (let d = 0; d < 5; d++) stepDay(moved.farm);
    expect(mobArea(moved.farm)).toBe(areaOf(moved.farm, t.emptyCells[0]!));
    const card = previewAction(moved.farm, { type: 'resumePlan', mob: t.mob, step: 0 });
    expect(card.ok && card.card!.workMin).toBeGreaterThan(0);
    const back = applyInstantly(moved.farm, { type: 'resumePlan', mob: t.mob, step: 0 });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.events.some((e) => e.type === 'sheep-plan-resumed')).toBe(true);
    expect(sheepMobsOf(back.farm)[0]!.plan!.paused).toBe(false);
    expect(mobArea(back.farm)).toBe(areaOf(back.farm, t.sheepCell));
    // Pause by asking, then it waits; a second pause is refused.
    const paused = applyInstantly(back.farm, { type: 'pausePlan', mob: t.mob });
    expect(paused.ok && paused.events.some((e) => e.type === 'sheep-plan-paused')).toBe(true);
    if (paused.ok) {
      const again = applyInstantly(paused.farm, { type: 'pausePlan', mob: t.mob });
      expect(again.ok ? 'ok' : again.reason).toBe('already-paused');
    }
  });
});
