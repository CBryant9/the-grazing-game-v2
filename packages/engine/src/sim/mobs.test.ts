import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { PLENTY, act, actWith, expectOneMobPerArea, openFarm } from '../../test-support/wholeFarm';
import { EDGE, hEdge, vEdge, type EdgeRef } from '../farm/topology';
import { GRID_H, GRID_W } from '../grid';
import { rngFromState } from '../rng';
import { createFarm } from './create';
import { plantingsNow, surveyOf } from './derived';
import { autoWeanDest, defaultSupplement, mergeShared, newMob } from './mobs';
import { cloneFarm, type FarmMob, type FarmState } from './state';

/*
 * Mobs: one to a grazing area, shared out by a seeded rule when a fence
 * divides their area, and joined when they come to share one.
 */

vi.setConfig({ testTimeout: 600_000 });

/** A fence line right down the farm on column line `vx`. */
const downFarm = (vx: number): EdgeRef[] => Array.from({ length: GRID_H }, (_, y) => vEdge(y, vx));
/** A fence line right across the farm on row line `vy`. */
const acrossFarm = (vy: number): EdgeRef[] =>
  Array.from({ length: GRID_W }, (_, x) => hEdge(vy, x));

function stocked(seed: number, cls: 'yearSteer' | 'cowCalf', qty: number): FarmState {
  const farm = openFarm('nsw', { seed });
  return act(farm, { type: 'buyCattle', cls, qty, to: { cell: farm.layout.water.bore } });
}

/** A column line that leaves the bore at least 3 squares clear, with `left` columns to its left. */
const lineFor = (farm: FarmState): { vx: number; boreLeft: boolean } => {
  const bx = farm.layout.water.bore % GRID_W;
  const vx = bx >= 20 ? 10 : 30;
  return { vx, boreLeft: bx < vx };
};

describe('a fence through a mob shares it out by area', () => {
  it('each beast goes to one side with a chance in proportion to its hectares', () => {
    let small = 0;
    let total = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const farm = stocked(seed, 'yearSteer', 300);
      const { vx } = lineFor(farm);
      // 10 columns on one side of the line and 30 on the other: a quarter and three quarters.
      const out = actWith(farm, { type: 'buildFence', edges: downFarm(vx), fence: 'permanent' });
      const s = surveyOf(out.farm);
      expect(s.topology.areas.length).toBe(2);
      expect(out.farm.mobs.length).toBe(2);
      for (const m of out.farm.mobs) {
        const area = s.topology.areas[s.topology.areaOf[(m.where as { anchor: number }).anchor]!]!;
        if (area.cells.length === 260) small += m.animals.length;
        else expect(area.cells.length).toBe(780);
        total += m.animals.length;
      }
      expectOneMobPerArea(out.farm);
    }
    expect(total).toBe(12 * 300);
    // 900 expected on the small side of 3,600. Three standard deviations is about 78.
    expect(small).toBeGreaterThan(900 - 78);
    expect(small).toBeLessThan(900 + 78);
  });

  it('the part on the mob home side keeps the mob, and the rest are its strays', () => {
    const farm = stocked(3, 'yearSteer', 200);
    const before = farm.mobs[0]!;
    before.dry = 2;
    before.lastBreak = 5;
    before.supp = 'pellet';
    before.lossDays = 3;
    const { vx, boreLeft } = lineFor(farm);
    const out = actWith(farm, { type: 'buildFence', edges: downFarm(vx), fence: 'electric' });
    const [home, strays] = out.farm.mobs as [FarmMob, FarmMob];
    expect(home.id).toBe(before.id);
    expect(home.name).toBe('Mob 1');
    expect(home.where).toEqual(before.where);
    expect(home.lossDays).toBe(3);
    expect(strays.name).toBe('Mob 1 strays');
    expect(strays.id).toBe(2);
    // The strays carry the supplement, the days without water and the last breakout.
    expect([strays.supp, strays.dry, strays.lastBreak]).toEqual(['pellet', 2, 5]);
    expect(strays.lossDays).toBe(0);
    expect(strays.st).toBeNull();
    const s = surveyOf(out.farm);
    const side = (m: FarmMob): boolean => (m.where as { anchor: number }).anchor % GRID_W < vx;
    expect(side(home)).toBe(boreLeft);
    expect(side(strays)).toBe(!boreLeft);
    // The strays stand on the middle of their side: it has no water.
    const area = s.topology.areas[s.topology.areaOf[(strays.where as { anchor: number }).anchor]!]!;
    expect((strays.where as { anchor: number }).anchor).toBe(area.label);
    expect(home.animals.length + strays.animals.length).toBe(200);
    const e = out.events.find((x) => x.type === 'mob-split')!;
    expect(e).toEqual({
      type: 'mob-split',
      mob: 1,
      mobName: 'Mob 1',
      parts: [home, strays]
        .map((m) => ({
          mob: m.id,
          mobName: m.name,
          area: s.topology.areas[s.topology.areaOf[(m.where as { anchor: number }).anchor]!]!.name,
          head: m.animals.length,
        }))
        .sort((a, b) => a.area.localeCompare(b.area)),
    });
    // The order within each part is the order they were in.
    for (const m of [home, strays]) {
      const ids = m.animals.map((a) => a.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    }
  });

  it('strays of a Central Qld mob that was taken off the lick stay off it', () => {
    const farm = openFarm('cq', { seed: 3 });
    let f = act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 200,
      to: { cell: farm.layout.water.bore },
    });
    expect(f.mobs[0]!.supp).toBe('lick');
    f = act(f, { type: 'setSupplement', mob: f.mobs[0]!.id, supp: 'none' });
    const { vx } = lineFor(f);
    const out = act(f, { type: 'buildFence', edges: downFarm(vx), fence: 'permanent' });
    expect(out.mobs.map((m) => m.supp)).toEqual(['none', 'none']);
  });

  it('a calf stays with its dam', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const farm = stocked(seed, 'cowCalf', 60);
      const out = act(farm, { type: 'buildFence', edges: acrossFarm(13), fence: 'permanent' });
      expect(out.mobs.length).toBe(2);
      for (const m of out.mobs) {
        const here = new Set(m.animals.map((a) => a.id));
        for (const a of m.animals) {
          if (a.kind === 'calf') expect(here.has(a.dam)).toBe(true);
          if (a.kind === 'cow') expect(here.has(a.calf)).toBe(true);
        }
        // A calf follows straight after its dam in the mob, as it did before.
        expect(m.animals.length % 2).toBe(0);
      }
    }
  });

  it('a calf with no dam in the mob is shared out like any other beast', () => {
    const farm = stocked(5, 'cowCalf', 150);
    const m = farm.mobs[0]!;
    // Sell the cows from under the calves: 150 calves on their own.
    const orphans = act(farm, {
      type: 'sellAnimals',
      ids: m.animals.filter((a) => a.kind === 'calf').map((a) => a.id),
    });
    expect(orphans.mobs[0]!.animals.every((a) => a.kind === 'cow')).toBe(true);
    const calves = cloneFarm(farm);
    calves.mobs[0]!.animals = calves.mobs[0]!.animals.filter((a) => a.kind === 'calf');
    const stream = calves.rng.strays.slice();
    const out = act(calves, { type: 'buildFence', edges: acrossFarm(13), fence: 'permanent' });
    expect(out.mobs.length).toBe(2);
    expect(out.mobs.every((x) => x.animals.length > 40)).toBe(true);
    // One draw for each of them.
    const rng = rngFromState(stream as [number, number, number, number]);
    for (let k = 0; k < 150; k++) rng.next();
    expect(out.rng.strays.map((v) => v >>> 0)).toEqual(rng.state().map((v) => v >>> 0));
  });

  it('draws one number for each beast that is not a calf at its dam side, from the strays stream only', () => {
    const farm = stocked(7, 'cowCalf', 40);
    const out = act(farm, { type: 'buildFence', edges: acrossFarm(13), fence: 'permanent' });
    const rng = rngFromState(farm.rng.strays);
    for (let k = 0; k < 40; k++) rng.next();
    expect(out.rng.strays.map((v) => v >>> 0)).toEqual(rng.state().map((v) => v >>> 0));
    for (const k of ['breeding', 'deaths', 'breakouts', 'market', 'buying'] as const) {
      expect(out.rng[k]).toEqual(farm.rng[k]);
    }
    // The same farm and the same fence give the same split every time.
    const again = act(farm, { type: 'buildFence', edges: acrossFarm(13), fence: 'permanent' });
    expect(again.mobs.map((m) => m.animals.map((a) => a.id))).toEqual(
      out.mobs.map((m) => m.animals.map((a) => a.id)),
    );
    // A fence that divides nothing draws nothing.
    const short = act(farm, {
      type: 'buildFence',
      edges: acrossFarm(13).slice(0, 5),
      fence: 'permanent',
    });
    expect(short.rng.strays).toEqual(farm.rng.strays);
    expect(short.mobs.length).toBe(1);
  });

  it('three areas at once, in proportion', () => {
    let counts = [0, 0, 0];
    for (let seed = 1; seed <= 8; seed++) {
      const farm = stocked(seed, 'yearSteer', 300);
      const out = act(farm, {
        type: 'buildFence',
        edges: [...downFarm(10), ...downFarm(20)],
        fence: 'tape',
      });
      const s = surveyOf(out);
      expect(s.topology.areas.length).toBe(3);
      expect(out.mobs.length).toBe(3);
      expect(out.mobs.filter((m) => m.name === 'Mob 1').length).toBe(1);
      expect(out.mobs.filter((m) => m.name === 'Mob 1 strays').length).toBe(2);
      for (const m of out.mobs) {
        const x = (m.where as { anchor: number }).anchor % GRID_W;
        counts[x < 10 ? 0 : x < 20 ? 1 : 2]! += m.animals.length;
      }
    }
    counts = counts.map((c) => c / (8 * 300));
    // 10, 10 and 20 columns: a quarter, a quarter and a half.
    expect(counts[0]).toBeGreaterThan(0.21);
    expect(counts[0]).toBeLessThan(0.29);
    expect(counts[1]).toBeGreaterThan(0.21);
    expect(counts[1]).toBeLessThan(0.29);
    expect(counts[2]).toBeGreaterThan(0.45);
    expect(counts[2]).toBeLessThan(0.55);
  });

  it('a mob that all lands on one side stays one mob, wherever that is', () => {
    let moved = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const farm = stocked(seed, 'yearSteer', 1);
      const { vx, boreLeft } = lineFor(farm);
      const out = actWith(farm, { type: 'buildFence', edges: downFarm(vx), fence: 'permanent' });
      expect(out.farm.mobs.length).toBe(1);
      const m = out.farm.mobs[0]!;
      expect([m.id, m.name]).toEqual([1, 'Mob 1']);
      expect(out.events.some((e) => e.type === 'mob-split')).toBe(false);
      const left = (m.where as { anchor: number }).anchor % GRID_W < vx;
      if (left !== boreLeft) moved++;
    }
    // The far side is a quarter or three quarters of the farm, so some went there.
    expect(moved).toBeGreaterThan(1);
    expect(moved).toBeLessThan(19);
  });

  it('strays of strays keep the one name, and shutting a gate divides a mob too', () => {
    let farm = stocked(2, 'yearSteer', 200);
    const { vx } = lineFor(farm);
    farm = act(farm, { type: 'buildFence', edges: downFarm(vx), fence: 'permanent' });
    farm = act(farm, { type: 'buildFence', edges: acrossFarm(13), fence: 'permanent' });
    expect(farm.mobs.length).toBe(4);
    expect(farm.mobs.map((m) => m.name).sort()).toEqual([
      'Mob 1',
      'Mob 1 strays',
      'Mob 1 strays',
      'Mob 1 strays',
    ]);
    // Hang a gate, open it (two mobs join), then shut it (they are shared out again).
    const edge = downFarm(vx)[3]!;
    farm = act(farm, { type: 'placeGate', edge });
    const open = actWith(farm, { type: 'setGate', edge, open: true });
    expect(open.farm.mobs.length).toBe(3);
    expect(open.events.map((e) => e.type)).toEqual(['layout-job', 'mobs-joined']);
    const shut = actWith(open.farm, { type: 'setGate', edge, open: false });
    expect(shut.farm.mobs.length).toBe(4);
    expect(shut.events.map((e) => e.type)).toEqual(['layout-job', 'mob-split']);
    expectOneMobPerArea(shut.farm);
    expect(shut.farm.mobs.reduce((n, m) => n + m.animals.length, 0)).toBe(200);
  });

  it('a mob in the feedlot, and a mob in a paddock the fence does not touch, are left alone', () => {
    let farm = stocked(4, 'yearSteer', 50);
    const { vx, boreLeft } = lineFor(farm);
    farm = act(farm, { type: 'buildFence', edges: downFarm(vx), fence: 'permanent' });
    // Everything back on the bore side, then a second mob in the lot.
    const far = farm.mobs[1]!;
    farm = act(farm, { type: 'moveMob', mob: far.id, to: { cell: farm.layout.water.bore } });
    farm = act(farm, {
      type: 'moveCattle',
      picks: [{ mob: farm.mobs[0]!.id, cls: 'yearlingSteer', qty: 10 }],
      to: 'lot',
    });
    const stream = farm.rng.strays.slice();
    // A line across the far side only.
    const x0 = boreLeft ? vx : 0;
    const line = Array.from({ length: boreLeft ? GRID_W - vx : vx }, (_, k) => hEdge(13, x0 + k));
    const out = actWith(farm, { type: 'buildFence', edges: line, fence: 'permanent' });
    expect(surveyOf(out.farm).topology.areas.length).toBe(3);
    expect(out.farm.mobs.map((m) => m.animals.length)).toEqual(
      farm.mobs.map((m) => m.animals.length),
    );
    expect(out.farm.rng.strays).toEqual(stream);
    expect(out.events.map((e) => e.type)).toEqual(['layout-job']);
  });
});

describe('mobs that share an area run as one', () => {
  function twoMobs(a: number, b: number): FarmState {
    const farm = openFarm('nsw');
    const m1 = newMob(farm, { kind: 'paddock', anchor: 5 }, 'First', 'hay');
    const m2 = newMob(farm, { kind: 'paddock', anchor: 900 }, 'Second', 'lick');
    for (const [m, n] of [
      [m1, a],
      [m2, b],
    ] as const) {
      for (let k = 0; k < n; k++) {
        m.animals.push({
          id: farm.animalIds.next++,
          kind: 'steer',
          sex: 'S',
          wt: 300,
          age: 400,
          cond: 3,
          barren: false,
          paid: 0,
          cost: 0,
          preg: -1,
          lact: -1,
          parity: 0,
          dam: 0,
          calf: 0,
          milk: 0,
          adg: 0,
          young: false,
          dead: false,
          di: undefined,
        });
      }
    }
    return farm;
  }

  it('the bigger mob keeps its name and its own figures, and takes the others in', () => {
    const farm = twoMobs(3, 8);
    farm.mobs[1]!.dry = 2;
    farm.mobs[0]!.dry = 1;
    const events: Parameters<typeof mergeShared>[2] = [];
    mergeShared(farm, surveyOf(farm), events);
    expect(farm.mobs.length).toBe(1);
    const m = farm.mobs[0]!;
    expect([m.name, m.animals.length, m.dry, m.supp]).toEqual(['Second', 11, 2, 'lick']);
    // Its own cattle first, then the ones that joined.
    expect(m.animals.map((a) => a.id)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 1, 2, 3]);
    expect(events).toEqual([
      {
        type: 'mobs-joined',
        from: 1,
        fromName: 'First',
        into: 2,
        intoName: 'Second',
        area: 'Paddock 1',
      },
    ]);
  });

  it('mobs of the same size: the one that was there first keeps its name', () => {
    const farm = twoMobs(5, 5);
    mergeShared(farm, surveyOf(farm));
    expect(farm.mobs.map((m) => m.name)).toEqual(['First']);
    expect(farm.mobs[0]!.supp).toBe('hay');
  });

  it('a mob with no supplement takes on the other mob supplement, and one with a supplement keeps its own', () => {
    const none = twoMobs(9, 2);
    none.mobs[0]!.supp = 'none';
    mergeShared(none, surveyOf(none));
    expect(none.mobs[0]!.supp).toBe('lick');
    const both = twoMobs(9, 2);
    mergeShared(both, surveyOf(both));
    expect(both.mobs[0]!.supp).toBe('hay');
    const neither = twoMobs(9, 2);
    neither.mobs[0]!.supp = 'none';
    neither.mobs[1]!.supp = 'none';
    mergeShared(neither, surveyOf(neither));
    expect(neither.mobs[0]!.supp).toBe('none');
  });

  it('mobs in the feedlot join each other, mobs in the yards join each other, and neither joins a paddock', () => {
    const farm = twoMobs(4, 6);
    farm.mobs[0]!.where = { kind: 'lot' };
    mergeShared(farm, surveyOf(farm));
    expect(farm.mobs.length).toBe(2);
    farm.mobs[1]!.where = { kind: 'lot' };
    const events: Parameters<typeof mergeShared>[2] = [];
    mergeShared(farm, surveyOf(farm), events);
    expect(farm.mobs.length).toBe(1);
    expect(events[0]).toMatchObject({ area: null, into: 2 });
    const yards = twoMobs(4, 6);
    yards.mobs[0]!.where = { kind: 'yards' };
    mergeShared(yards, surveyOf(yards));
    expect(yards.mobs.length).toBe(2);
    yards.mobs[1]!.where = { kind: 'yards' };
    mergeShared(yards, surveyOf(yards));
    expect(yards.mobs.length).toBe(1);
  });

  it('mobs either side of a shut gate stay apart, and empty mobs are dropped', () => {
    let farm = twoMobs(4, 6);
    farm.layout = act(farm, {
      type: 'buildFence',
      edges: Array.from({ length: GRID_W }, (_, x) => hEdge(13, x)),
      fence: 'permanent',
    }).layout;
    farm = cloneFarm(farm);
    newMob(farm, { kind: 'paddock', anchor: 7 }, 'Nobody');
    mergeShared(farm, surveyOf(farm));
    expect(farm.mobs.map((m) => m.name)).toEqual(['First', 'Second']);
  });

  it('a new mob takes the next id and name, and the district usual supplement when none is given', () => {
    for (const id of DISTRICT_IDS) {
      const farm = openFarm(id);
      const a = newMob(farm, { kind: 'lot' });
      const b = newMob(farm, { kind: 'lot' }, 'Weaners 2', 'none');
      const c = newMob(farm, { kind: 'lot' }, undefined, 'pellet');
      expect([a.id, a.name, b.id, b.name, c.id, c.name]).toEqual([
        1,
        'Mob 1',
        2,
        'Weaners 2',
        3,
        'Mob 3',
      ]);
      expect(farm.nextMobId).toBe(4);
      expect(a.supp).toBe(id === 'cq' ? 'lick' : 'none');
      expect(b.supp).toBe(id === 'cq' ? 'lick' : 'none');
      expect(c.supp).toBe('pellet');
      expect(defaultSupplement(id)).toBe(id === 'cq' ? 'lick' : 'none');
      expect([a.dry, a.st, a.lastBreak, a.join]).toEqual([0, null, null, null]);
    }
  });
});

describe('where weaners go', () => {
  /** A running farm with four or more paddocks, each with water. */
  function farm4(): FarmState {
    for (let seed = 1; ; seed++) {
      const farm = createFarm({
        seed,
        district: 'cw',
        size: 'medium',
        start: { year: 2023, month: 8 },
        startType: 'running',
        difficulty: 'easy',
        money: { ...PLENTY },
      });
      if (surveyOf(farm).topology.areas.length >= 4) return farm;
    }
  }
  const paint = (farm: FarmState, cells: readonly number[], green: boolean): void => {
    for (const i of cells) {
      farm.pasture.G[i] = green ? 2200 : 100;
      farm.pasture.D[i] = green ? 200 : 2500;
      farm.pasture.A[i] = green ? 15 : 150;
      farm.pasture.X[i] = 0;
    }
  };

  it('to an empty paddock with water first, the one with the best feed', () => {
    const farm = farm4();
    const s = surveyOf(farm);
    const areas = s.topology.areas;
    const cows = farm.mobs[0]!;
    const home = s.topology.areaOf[(cows.where as { anchor: number }).anchor]!;
    const weanerArea = s.topology.areaOf[(farm.mobs[1]!.where as { anchor: number }).anchor]!;
    const empty = areas.filter((r) => r.id !== home && r.id !== weanerArea);
    expect(empty.length).toBeGreaterThanOrEqual(2);
    for (const r of areas) paint(farm, r.cells, false);
    // The weaners' own paddock is the greenest, but it has a mob in it.
    paint(farm, areas[weanerArea]!.cells, true);
    const best = empty[1]!;
    paint(farm, best.cells.slice(0, best.cells.length >> 1), true);
    const dest = autoWeanDest(farm, s, plantingsNow(farm), cows)!;
    expect(s.topology.areaOf[dest]).toBe(best.id);
    // They are put on the paddock's first water point.
    expect(dest).toBe(s.points.areaTroughs[best.id]![0]);

    // With every other paddock holding a mob, the best feed wins.
    for (const r of empty)
      newMob(farm, { kind: 'paddock', anchor: r.cells[0]! }).animals.push(
        ...cloneFarm(farm).mobs[1]!.animals.slice(0, 1),
      );
    const crowded = autoWeanDest(farm, s, plantingsNow(farm), cows)!;
    expect(s.topology.areaOf[crowded]).toBe(weanerArea);
    // Never the mob's own paddock, however green.
    paint(farm, areas[home]!.cells, true);
    for (const r of areas) if (r.id !== home) paint(farm, r.cells, false);
    expect(s.topology.areaOf[autoWeanDest(farm, s, plantingsNow(farm), cows)!]).not.toBe(home);
  });

  it('nowhere, when no other paddock has water', () => {
    const farm = openFarm('nsw');
    const m = newMob(farm, { kind: 'paddock', anchor: farm.layout.water.bore });
    expect(autoWeanDest(farm, surveyOf(farm), null, m)).toBeNull();
    // From the feedlot, the one paddock with water will do.
    m.where = { kind: 'lot' };
    expect(autoWeanDest(farm, surveyOf(farm), null, m)).toBe(farm.layout.water.bore);
    expect(EDGE.tape).toBe(3);
  });
});
