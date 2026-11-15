import { describe, expect, it, vi } from 'vitest';
import { openFarm, twoPaddockFarm } from '../../test-support/wholeFarm';
import { busyFarm, setUp, work } from '../../test-support/workingDay';
import { BANK_NEAR_SHARE } from '../money/bank';
import { FEED_FLOOR_KG_HA } from '../pasture/summary';
import { loadFarm, saveFarm } from '../save/save';
import { loadRealData } from '../server';
import { createFarm } from '../sim/create';
import { dateOn, surveyOf } from '../sim/derived';
import { cloneFarm, type FarmState } from '../sim/state';
import { applyAction } from './act';
import { daysToYearEnd, endDay, skipDays, type SkipStop } from './days';
import { allThingsToDo, thingsToDo, todoKey, type ThingToDo } from './todo';

/*
 * The playtest fixes (engine 0.20.0): the bank is told before it takes the
 * farm, skips stop for what needs the player, a year skip ends on the year
 * end, and Things to do holds facts that come once and go when they stop
 * being true or are put away.
 */

vi.setConfig({ testTimeout: 600_000 });

const ofType = <T extends ThingToDo['type']>(
  list: ThingToDo[],
  type: T,
): Extract<ThingToDo, { type: T }>[] =>
  list.filter((x): x is Extract<ThingToDo, { type: T }> => x.type === type);

const stopOf = <T extends SkipStop['type']>(
  stops: SkipStop[],
  type: T,
): Extract<SkipStop, { type: T }> | undefined =>
  stops.find((x): x is Extract<SkipStop, { type: T }> => x.type === type);

/** A running herd in Central Queensland, easy money. */
const herdFarm = (seed = 3): FarmState =>
  createFarm({
    seed,
    district: 'cq',
    size: 'small',
    start: { year: 2026, month: 8 },
    startType: 'running',
    difficulty: 'easy',
  });

describe('the bank is told before it takes the farm', () => {
  it('cash below zero, then three quarters of the way to the limit: one fact and one stop each', () => {
    const start = cloneFarm(openFarm('nsw'));
    start.cash = 1;
    // Day one's running costs take cash below zero.
    const first = skipDays(start, 'month');
    expect(first.daysRun).toBe(1);
    const told = stopOf(first.stops, 'bank')!;
    expect(told).toMatchObject({ level: 1, limit: start.broke, head: 0 });
    expect(told.cash).toBeLessThan(0);
    expect(first.farm.inbox.filter((m) => m.event.type === 'bank')).toHaveLength(1);
    // Still overdrawn: it is not told again.
    const more = skipDays(first.farm, 'week');
    expect(more.daysRun).toBe(7);
    expect(stopOf(more.stops, 'bank')).toBeUndefined();
    // Just short of three quarters of the way to the limit, then past it.
    const near = cloneFarm(more.farm);
    near.cash = near.broke * BANK_NEAR_SHARE + 1;
    const second = skipDays(near, 'month');
    expect(second.daysRun).toBe(1);
    expect(stopOf(second.stops, 'bank')).toMatchObject({ level: 2, limit: near.broke });
    // Then on to the limit: the farm is taken, with both facts in the inbox before it.
    const edge = cloneFarm(second.farm);
    edge.cash = edge.broke + 1;
    const over = skipDays(edge, 'month');
    expect(over.stops).toEqual([{ type: 'game-over', reason: 'bank' }]);
    const kinds = over.farm.inbox.map((m) => m.event.type);
    expect(kinds.filter((k) => k === 'bank')).toHaveLength(2);
    expect(kinds.lastIndexOf('bank')).toBeLessThan(kinds.lastIndexOf('game-over'));
  });

  it('names the head on hand that could be sold, and is a thing to do while it is true', () => {
    const b = busyFarm();
    const f = cloneFarm(b.farm);
    f.cash = 10;
    const day = endDay(f);
    const bank = day.day.events.find((e) => e.type === 'bank');
    // 12 cows (calves at foot go with them) and 40 steers.
    expect(bank).toMatchObject({ type: 'bank', level: 1, head: 52 });
    expect(ofType(thingsToDo(day.farm), 'bank')).toMatchObject([{ level: 1, count: 52 }]);
    // Cash back above zero: the item goes, and the mark falls back for next time.
    const paid = cloneFarm(day.farm);
    paid.cash = 1000;
    expect(ofType(thingsToDo(paid), 'bank')).toEqual([]);
    const next = endDay(paid).farm;
    expect(next.bankWarned).toBeUndefined();
  });

  it('a farm that never goes below zero saves no bank field', () => {
    const f = endDay(openFarm('nsw')).farm;
    expect('bankWarned' in saveFarm(f)).toBe(false);
  });
});

describe('a skip stops for what needs the player', () => {
  it('deaths from poor condition stop it; natural deaths do not', () => {
    const b = busyFarm();
    const f = cloneFarm(b.farm);
    for (const a of f.mobs.find((m) => m.id === b.steers)!.animals) a.cond = 1.0;
    const run = skipDays(f, 'month');
    const stop = stopOf(run.stops, 'deaths')!;
    expect(stop).toMatchObject({ species: 'cattle', cause: 'poorCondition', mob: b.steers });
    expect(run.daysRun).toBeLessThan(30);
  });

  it('calving starting in a mob stops it, and lists calving, then marking once for the drop', () => {
    let f = herdFarm();
    let stop: Extract<SkipStop, { type: 'calving' }> | undefined;
    for (let i = 0; i < 30 && !stop; i++) {
      const run = skipDays(f, 'month', {}, { anyway: true });
      f = run.farm;
      stop = stopOf(run.stops, 'calving');
      if (run.daysRun === 0 || f.over) break;
    }
    expect(stop).toBeDefined();
    const mob = stop!.mob;
    expect(ofType(thingsToDo(f), 'calving').map((x) => x.mob)).toContain(mob);
    // Marking is listed once, as one item for the drop, 30 days after calving started.
    let seen = 0;
    let firstCount = 0;
    for (let d = 0; d < 40; d++) {
      f = endDay(f).farm;
      const items = ofType(thingsToDo(f), 'calves-to-mark').filter((x) => x.mob === mob);
      expect(items.length).toBeLessThanOrEqual(1);
      if (items.length && !seen) {
        seen = f.day;
        firstCount = items[0]!.count;
      }
    }
    expect(seen).toBeGreaterThan(0);
    // It came with the drop's bull calves, not one calf at a time.
    expect(firstCount).toBeGreaterThan(1);
  });
});

describe('a year skip ends on the year end', () => {
  it('a real year with 29 February in it runs 366 days and shows the year', () => {
    const data = loadRealData();
    const farm = createFarm(
      {
        seed: 2,
        district: 'cw',
        size: 'small',
        start: { year: 2007, month: 8 },
        years: { kind: 'real', order: 'in-order' },
        startType: 'scratch',
        difficulty: 'easy',
      },
      { data },
    );
    expect(dateOn(farm)).toMatchObject({ year: 2007, month: 8 });
    expect(daysToYearEnd(farm)).toBe(366);
    const year = skipDays(farm, 'year', { data });
    expect(year.daysRun).toBe(366);
    expect(year.farm.years).toHaveLength(1);
    expect(year.stops).toEqual([{ type: 'year-end', year: 1 }]);
  });

  it('a year with random seasons is still 365 days, and a part year runs to the year end', () => {
    const farm = openFarm('nsw');
    expect(daysToYearEnd(farm)).toBe(365);
    expect(daysToYearEnd(skipDays(farm, 300).farm)).toBe(65);
  });
});

describe('things to do: facts', () => {
  it('a sale within the week, with the head at sale weight by class', () => {
    const farm = twoPaddockFarm('nsw');
    const watered = surveyOf(farm).topology.areas.find(
      (a) => surveyOf(farm).points.areaTroughs[a.id]!.length,
    )!;
    const f = setUp(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 30,
      to: { cell: watered.cells[0]! },
    });
    const sale = ofType(thingsToDo(f), 'sale-soon');
    expect(sale).toHaveLength(1);
    expect(sale[0]!.daysAway).toBeLessThanOrEqual(7);
    expect(sale[0]!.classes).toEqual([{ cls: 'feed', head: 30 }]);
    // Steers booked onto the sale are not counted again.
    const booked = work(f, { type: 'sellGroup', mob: f.mobs[0]!.id, group: 'steer', qty: 30 });
    expect(ofType(thingsToDo(booked.farm), 'sale-soon')).toEqual([]);
  });

  it("a mob's condition under 2.5, with the figure", () => {
    const b = busyFarm();
    const f = cloneFarm(b.farm);
    const steers = f.mobs.find((m) => m.id === b.steers)!;
    steers.st = null;
    for (const a of steers.animals) a.cond = 2.3;
    const low = ofType(thingsToDo(f), 'low-condition');
    expect(low).toHaveLength(1);
    expect(low[0]).toMatchObject({ mob: b.steers, count: 40 });
    expect(low[0]!.cs).toBeCloseTo(2.3, 6);
  });

  it('a paddock holding stock with feed under the floor', () => {
    const b = busyFarm();
    const f = cloneFarm(b.farm);
    f.pasture.G.fill(300);
    f.pasture.D.fill(300);
    const under = ofType(thingsToDo(f), 'feed-floor');
    expect(under.map((x) => x.mob).sort()).toEqual([b.cows, b.steers].sort());
    expect(under[0]).toMatchObject({ floorKgHa: FEED_FLOOR_KG_HA });
    expect(under[0]!.massKgHa).toBeCloseTo(600, 3);
  });

  it('marking 30 days after calving started, though the calves are young', () => {
    const b = busyFarm();
    const f = cloneFarm(b.farm);
    const cows = f.mobs.find((m) => m.id === b.cows)!;
    for (const a of cows.animals) if (a.kind === 'calf') a.age = 25;
    cows.calvNote = f.day - 29;
    expect(ofType(thingsToDo(f), 'calves-to-mark')).toEqual([]);
    expect(ofType(thingsToDo(f), 'calving')).toMatchObject([{ mob: b.cows, count: 12 }]);
    cows.calvNote = f.day - 30;
    expect(ofType(thingsToDo(f), 'calving')).toEqual([]);
    expect(ofType(thingsToDo(f), 'calves-to-mark')).toMatchObject([
      { mob: b.cows, count: 6, sinceCalving: 30 },
    ]);
  });
});

describe('things to do: put away', () => {
  it('stays away while true, comes back once it stops and starts again', () => {
    const b = busyFarm();
    const f = cloneFarm(b.farm);
    f.cash = -10;
    const key = todoKey(ofType(thingsToDo(f), 'bank')[0]!);
    const done = applyAction(f, { type: 'dismissTodo', key });
    if (!done.ok) throw new Error(done.message);
    // A decision: none of the day's light.
    expect(done.farm.clock.used).toBe(f.clock.used);
    expect(ofType(thingsToDo(done.farm), 'bank')).toEqual([]);
    expect(ofType(allThingsToDo(done.farm), 'bank')).toHaveLength(1);
    // It is kept in the save.
    expect(ofType(thingsToDo(loadFarm(saveFarm(done.farm))), 'bank')).toEqual([]);
    // Cash comes back above zero for a night: it drops off the list of things put away.
    const paid = cloneFarm(done.farm);
    paid.cash = 5000;
    const next = endDay(paid).farm;
    expect(next.todoOff).toBeUndefined();
    next.cash = -10;
    expect(ofType(thingsToDo(next), 'bank')).toHaveLength(1);
  });

  it('refuses a thing that is not on the list', () => {
    const b = busyFarm();
    const no = applyAction(b.farm, { type: 'dismissTodo', key: 'bank:1' });
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.reason).toBe('not-on-list');
  });
});
