import { describe, expect, it } from 'vitest';
import {
  clampQty,
  movableClasses,
  movePicks,
  pickable,
  sellLimits,
  sortMobs,
  sortPaddocks,
} from './lists';
import type { MobWire, PaddockWire } from './types';

const mob = (over: Partial<MobWire>): MobWire =>
  ({
    id: 1,
    name: 'Steers A',
    where: 'paddock',
    area: 'Paddock 1',
    head: 10,
    calves: 0,
    cs: 3,
    adgKg: 0.4,
    classes: [],
    sellGroups: [],
    ...over,
  }) as MobWire;

const paddock = (over: Partial<PaddockWire>): PaddockWire =>
  ({
    id: 0,
    name: 'Paddock 1',
    ha: 10,
    label: 'green',
    water: 'own',
    mobs: [],
    massKgHa: 1500,
    ...over,
  }) as PaddockWire;

describe('sorting the herd', () => {
  const mobs = [
    mob({ id: 1, name: 'Steers B', head: 40, cs: 3.5, adgKg: -0.1 }),
    mob({ id: 2, name: 'Cows A', head: 120, cs: 2.8, adgKg: 0.6 }),
    mob({ id: 3, name: 'Steers A', head: 40, cs: null, adgKg: null }),
  ];
  const names = (l: MobWire[]): string[] => l.map((m) => m.name);

  it('sorts by name, with numbers read as numbers', () => {
    expect(names(sortMobs(mobs, 'name', 'asc'))).toEqual(['Cows A', 'Steers A', 'Steers B']);
    expect(names(sortMobs(mobs, 'name', 'desc'))).toEqual(['Steers B', 'Steers A', 'Cows A']);
    const nums = [mob({ id: 1, name: 'Mob 10' }), mob({ id: 2, name: 'Mob 9' })];
    expect(names(sortMobs(nums, 'name', 'asc'))).toEqual(['Mob 9', 'Mob 10']);
  });

  it('sorts by head, breaking a tie by name', () => {
    expect(names(sortMobs(mobs, 'head', 'desc'))).toEqual(['Cows A', 'Steers A', 'Steers B']);
    expect(names(sortMobs(mobs, 'head', 'asc'))).toEqual(['Steers A', 'Steers B', 'Cows A']);
  });

  it('puts a mob with no figure yet last, whichever way it runs', () => {
    expect(names(sortMobs(mobs, 'gain', 'desc'))).toEqual(['Cows A', 'Steers B', 'Steers A']);
    expect(names(sortMobs(mobs, 'gain', 'asc'))).toEqual(['Steers B', 'Cows A', 'Steers A']);
    expect(names(sortMobs(mobs, 'cs', 'asc')).at(-1)).toBe('Steers A');
  });

  it('does not change the list it was given', () => {
    const before = names(mobs);
    sortMobs(mobs, 'head', 'asc');
    expect(names(mobs)).toEqual(before);
  });
});

describe('sorting the paddocks', () => {
  const mobs = [mob({ id: 1, name: 'Steers A' }), mob({ id: 2, name: 'Cows B' })];
  const pads = [
    paddock({ id: 0, name: 'Paddock 2', ha: 20, massKgHa: 900, mobs: [1] }),
    paddock({ id: 1, name: 'Paddock 10', ha: 5, massKgHa: 2100, mobs: [] }),
    paddock({ id: 2, name: 'Paddock 1', ha: 12, massKgHa: 1500, mobs: [2], label: 'short' }),
  ];
  const names = (l: PaddockWire[]): string[] => l.map((p) => p.name);

  it('sorts by name, by hectares and by feed', () => {
    expect(names(sortPaddocks(pads, mobs, 'name', 'asc'))).toEqual([
      'Paddock 1',
      'Paddock 2',
      'Paddock 10',
    ]);
    expect(names(sortPaddocks(pads, mobs, 'ha', 'desc'))).toEqual([
      'Paddock 2',
      'Paddock 1',
      'Paddock 10',
    ]);
    expect(names(sortPaddocks(pads, mobs, 'feed', 'desc'))).toEqual([
      'Paddock 10',
      'Paddock 1',
      'Paddock 2',
    ]);
  });

  it('sorts by label and by mob, with empty paddocks last', () => {
    expect(names(sortPaddocks(pads, mobs, 'label', 'asc'))[2]).toBe('Paddock 1');
    expect(names(sortPaddocks(pads, mobs, 'mob', 'asc'))).toEqual([
      'Paddock 1',
      'Paddock 2',
      'Paddock 10',
    ]);
    expect(names(sortPaddocks(pads, mobs, 'mob', 'desc')).at(-1)).toBe('Paddock 10');
  });
});

describe('the sell picker', () => {
  const groups = [
    { id: 'steer', name: 'Steers', head: 30 },
    { id: 'cowP', name: 'Cows (PTIC)', head: 1 },
  ] as MobWire['sellGroups'];

  it('holds a number to what is free to sell', () => {
    expect(clampQty(5, 30)).toBe(5);
    expect(clampQty(99, 30)).toBe(30);
    expect(clampQty(0, 30)).toBe(1);
    expect(clampQty(-4, 30)).toBe(1);
    expect(clampQty(2.9, 30)).toBe(2);
    expect(clampQty(Number.NaN, 30)).toBe(1);
    expect(clampQty(3, 0)).toBe(0);
  });

  it('gives the limits for a group, and none for a group that is not there', () => {
    expect(sellLimits(groups, 'steer', 12)).toEqual({ max: 30, qty: 12 });
    expect(sellLimits(groups, 'steer', 500)).toEqual({ max: 30, qty: 30 });
    expect(sellLimits(groups, 'cowP', 8)).toEqual({ max: 1, qty: 1 });
    expect(sellLimits(groups, 'bull', 3)).toEqual({ max: 0, qty: 0 });
  });
});

describe('the move picker', () => {
  const m = mob({
    id: 7,
    classes: [
      { id: 'cowWithCalf', label: 'Cow with calf', head: 50, weightKg: 480, cs: 3, calf: false },
      { id: 'heiferCalf', label: 'Heifer calf', head: 30, weightKg: 120, cs: 3, calf: true },
      { id: 'bull', label: 'Bull', head: 2, weightKg: 700, cs: 3, calf: false },
      { id: 'dryCow', label: 'Dry cow', head: 0, weightKg: 0, cs: 0, calf: false },
    ],
  });

  it('offers classes of adult cattle only: calves go with their mothers', () => {
    expect(movableClasses(m).map((c) => c.id)).toEqual(['cowWithCalf', 'bull']);
  });

  it('picks only classes with a number, each held to the head in the class', () => {
    expect(movePicks(m, {})).toEqual([]);
    expect(movePicks(m, { cowWithCalf: 20, bull: 0 })).toEqual([
      { mob: 7, cls: 'cowWithCalf', qty: 20 },
    ]);
    expect(movePicks(m, { cowWithCalf: 500, bull: 1.9 })).toEqual([
      { mob: 7, cls: 'cowWithCalf', qty: 50 },
      { mob: 7, cls: 'bull', qty: 1 },
    ]);
    expect(movePicks(m, { cowWithCalf: -3, heiferCalf: 10 })).toEqual([]);
  });
});

describe('the paddocks a mob can be moved to', () => {
  const mobs = [mob({ id: 1, name: 'Steers A' }), mob({ id: 2, name: 'Cows B' })];
  const pads = [
    paddock({ id: 0, name: 'Paddock 1', mobs: [1] }),
    paddock({ id: 1, name: 'Paddock 2', mobs: [2] }),
    paddock({ id: 2, name: 'Paddock 3', water: 'none' }),
    paddock({ id: 3, name: 'Paddock 4', water: 'gate' }),
  ];

  it('leaves out where the mob is, notes who is in the others, and marks no water', () => {
    const rows = pickable(pads, mobs, mobs[0]!);
    expect(rows.map((r) => r.paddock.name)).toEqual(['Paddock 2', 'Paddock 3', 'Paddock 4']);
    expect(rows.map((r) => r.holds)).toEqual(['Cows B', null, null]);
    expect(rows.map((r) => r.dry)).toEqual([false, true, false]);
  });

  it('lists every paddock when no mob is picked yet', () => {
    expect(pickable(pads, mobs, null)).toHaveLength(4);
  });
});
