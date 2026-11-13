import { describe, expect, it, vi } from 'vitest';
import { PLENTY, openFarm, twoPaddockFarm } from '../../test-support/wholeFarm';
import {
  atLastLight,
  busyFarm,
  farmWithCropReady,
  setUp,
  work,
} from '../../test-support/workingDay';
import { farmHash } from '../save/save';
import { createFarm } from '../sim/create';
import { surveyOf } from '../sim/derived';
import { cloneFarm } from '../sim/state';
import { previewAction } from './act';
import { skipDays } from './days';
import { thingsToDo, type ThingToDo } from './look';

/*
 * What needs doing on the farm now, for the banner and the mob card: plain
 * facts with the mob and the count, and the action that deals with each.
 * It uses only what the model already knows, and it never says what the
 * player should do.
 */

vi.setConfig({ testTimeout: 600_000 });

const ofType = <T extends ThingToDo['type']>(
  list: ThingToDo[],
  type: T,
): Extract<ThingToDo, { type: T }>[] =>
  list.filter((x): x is Extract<ThingToDo, { type: T }> => x.type === type);

describe('things to do', () => {
  it('a farm with nothing to see to has an empty list', () => {
    expect(thingsToDo(openFarm('nsw'))).toEqual([]);
  });

  it('calves to mark and calves to wean, with the mob, the count and the action', () => {
    const b = busyFarm();
    const list = thingsToDo(b.farm);
    const area = surveyOf(b.farm).topology.areas.find((a) =>
      a.cells.includes((b.farm.mobs[0]!.where as { anchor: number }).anchor),
    )!.name;
    // 12 calves of 120 days, 6 of them bull calves.
    expect(ofType(list, 'calves-to-mark')).toEqual([
      {
        type: 'calves-to-mark',
        mob: b.cows,
        mobName: 'Mob 1',
        area,
        count: 6,
        youngBulls: 0,
        does: 'markCalves',
        action: { type: 'markCalves', mob: b.cows },
      },
    ]);
    expect(ofType(list, 'calves-to-wean')).toEqual([
      {
        type: 'calves-to-wean',
        mob: b.cows,
        mobName: 'Mob 1',
        area,
        count: 12,
        does: 'wean',
        action: { type: 'wean', mob: b.cows },
      },
    ]);
    // The steers have nothing to mark or wean.
    expect(list.some((x) => 'mob' in x && x.mob === b.steers)).toBe(false);
  });

  it("the ages are the model's own: 60 days for the marking note, 90 days to wean", () => {
    const b = busyFarm();
    const withAge = (age: number): ThingToDo[] => {
      const f = cloneFarm(b.farm);
      for (const a of f.mobs[0]!.animals) if (a.kind === 'calf') a.age = age;
      return thingsToDo(f);
    };
    expect(ofType(withAge(59), 'calves-to-mark')).toEqual([]);
    expect(ofType(withAge(60), 'calves-to-mark')[0]!.count).toBe(6);
    expect(ofType(withAge(89), 'calves-to-wean')).toEqual([]);
    expect(ofType(withAge(90), 'calves-to-wean')[0]!.count).toBe(12);
    // The model's own note for marking goes out at the same age.
    const f = cloneFarm(b.farm);
    for (const a of f.mobs[0]!.animals) if (a.kind === 'calf') a.age = 58;
    const days = skipDays(f, 3).days;
    const noted = days.findIndex((d) =>
      d.events.some((e) => e.type === 'cattle' && e.note.type === 'toMark'),
    );
    // Aged 58 at the start: 59 after the first day and 60 after the second, when the note is made.
    expect(noted).toBe(1);
  });

  it('once the job is done the item goes', () => {
    const b = busyFarm();
    const marked = work(b.farm, { type: 'markCalves', mob: b.cows }).farm;
    expect(ofType(thingsToDo(marked), 'calves-to-mark')).toEqual([]);
    expect(ofType(thingsToDo(marked), 'calves-to-wean').length).toBe(1);
    const weaned = work(marked, { type: 'wean', mob: b.cows }).farm;
    expect(ofType(thingsToDo(weaned), 'calves-to-wean')).toEqual([]);
  });

  it('unmarked young bulls are counted beside the calves', () => {
    const b = busyFarm();
    const f = cloneFarm(b.farm);
    const steer = f.mobs.find((m) => m.id === b.steers)!.animals[0]!;
    steer.kind = 'bull';
    steer.sex = 'M';
    steer.young = true;
    const item = ofType(thingsToDo(f), 'calves-to-mark').find((x) => x.mob === b.steers)!;
    expect(item).toMatchObject({ count: 0, youngBulls: 1, does: 'markCalves' });
  });

  it('a mob with no water: the fact, the days so far, and that it needs a move', () => {
    const farm = twoPaddockFarm('nsw');
    const s = surveyOf(farm);
    const dry = s.topology.areas.find((a) => !s.points.areaTroughs[a.id]!.length)!;
    const stocked = setUp(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 30,
      to: { cell: dry.cells[0]! },
    });
    expect(thingsToDo(stocked)).toEqual([
      {
        type: 'no-water',
        mob: stocked.mobs[0]!.id,
        mobName: 'Mob 1',
        area: dry.name,
        count: 30,
        dryDays: 0,
        // The player has to pick where they go, so there is no action ready to send.
        does: 'moveMob',
        action: null,
      },
    ]);
    const twoDays = skipDays(
      skipDays(stocked, 1, {}, { anyway: true }).farm,
      1,
      {},
      { anyway: true },
    );
    expect(ofType(thingsToDo(twoDays.farm), 'no-water')[0]!.dryDays).toBe(2);
  });

  it('a portable trough under a quarter full, and one that is empty', () => {
    const b = busyFarm();
    const level = (litres: number): ThingToDo[] => {
      const f = cloneFarm(b.farm);
      f.layout.water.ports[0]!.level = litres;
      return thingsToDo(f).filter((x) => x.type === 'trough-low' || x.type === 'trough-empty');
    };
    // 6,000 L when full. The model warns under 1,500 L.
    expect(level(6000)).toEqual([]);
    expect(level(1500)).toEqual([]);
    expect(level(1499)).toEqual([
      {
        type: 'trough-low',
        portId: b.port,
        cell: b.farm.layout.water.ports[0]!.cell,
        count: 1499,
        does: 'refillPortable',
        action: { type: 'refillPortable', port: b.port },
      },
    ]);
    expect(level(0)[0]).toMatchObject({ type: 'trough-empty', count: 0 });
  });

  it('a crop ready to harvest, and it goes once it is harvested', () => {
    const ready = farmWithCropReady(() =>
      createFarm({
        seed: 4,
        district: 'cw',
        size: 'small',
        start: { year: 2022, month: 5 },
        startType: 'scratch',
        mixed: { arablePct: 40, croppedPct: 50 },
        difficulty: 'easy',
        money: { ...PLENTY },
      }),
    );
    const items = ofType(thingsToDo(ready.farm), 'crop-ready');
    const item = items.find((x) => x.fieldId === ready.field)!;
    const field = ready.farm.crops.fields.find((f) => f.id === ready.field)!;
    expect(item).toEqual({
      type: 'crop-ready',
      fieldId: ready.field,
      sp: field.sp,
      count: field.cells.length * ready.farm.layout.scale.haPerSquare,
      does: 'harvest',
      action: { type: 'harvest', field: ready.field },
    });
    // The day before it was ready it was not on the list: the model's maturity is the only test.
    const f = cloneFarm(ready.farm);
    f.crops.fields.find((x) => x.id === ready.field)!.sown += 2;
    expect(ofType(thingsToDo(f), 'crop-ready').some((x) => x.fieldId === ready.field)).toBe(false);
    const done = work(ready.farm, item.action!).farm;
    expect(ofType(thingsToDo(done), 'crop-ready').some((x) => x.fieldId === ready.field)).toBe(
      false,
    );
  });

  it('a fence that is down, by segment', () => {
    const b = busyFarm();
    expect(ofType(thingsToDo(b.farm), 'fence-down')).toEqual([
      {
        type: 'fence-down',
        edge: b.downed,
        fence: 'electric',
        count: 1,
        does: 'fixFence',
        action: { type: 'fixFence', edge: b.downed },
      },
    ]);
    const fixed = work(b.farm, { type: 'fixFence', edge: b.downed }).farm;
    expect(ofType(thingsToDo(fixed), 'fence-down')).toEqual([]);
  });

  it('every action it offers is one the farm accepts, and water comes first', () => {
    const b = busyFarm();
    const f = cloneFarm(b.farm);
    f.layout.water.ports[0]!.level = 100;
    const list = thingsToDo(f);
    expect(list.map((x) => x.type)).toEqual([
      'trough-low',
      'calves-to-mark',
      'calves-to-wean',
      'fence-down',
    ]);
    for (const item of list) {
      expect(item.does).toBe(item.action!.type);
      expect(previewAction(f, item.action!).ok, item.type).toBe(true);
    }
  });

  it('it is looking: free after last light, and it changes nothing', () => {
    const b = busyFarm();
    const dark = atLastLight(b.farm);
    const before = farmHash(dark);
    expect(thingsToDo(dark)).toEqual(thingsToDo(b.farm));
    expect(farmHash(dark)).toBe(before);
    // It states facts only: no words at all, so nothing to nag or judge with.
    const text = JSON.stringify(thingsToDo(dark));
    for (const word of ['should', 'must', 'need', 'overdue', 'late', 'good', 'bad', 'warning']) {
      expect(text.includes(word), word).toBe(false);
    }
    // Once the game is over there is nothing to do.
    const over = cloneFarm(b.farm);
    over.over = { reason: 'bank', day: 0 };
    expect(thingsToDo(over)).toEqual([]);
  });
});
