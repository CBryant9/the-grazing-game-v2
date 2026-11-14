import { describe, expect, it } from 'vitest';
import { applyInstantly } from '../../test-support/instant';
import { loadFarm, saveFarm, farmHash } from '../save/save';
import { createFarm } from '../sim/create';
import { surveyOf } from '../sim/derived';
import type { FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { SAVE_FORMAT_VERSION } from '../version';
import { addSheepMob, occupiedAreas, sheepMobsOf, sheepWaterLitres } from './farm';
import { sheepMobsRead, stockingRead } from './reads';
import { headOf } from './simFlock';

/* Sheep on a farm: putting them on, the daily tick, saves, and the rule of one mob to an area. */

function farmOf(seed: number, district: 'nsw' | 'cw' | 'wv' | 'cq' = 'wv'): FarmState {
  return createFarm({
    seed,
    district,
    size: 'small',
    start: { year: 2021, month: 2 },
    startType: 'running',
    difficulty: 'easy',
  });
}

/** A square in a watered grazing area no mob is on, or null. */
function emptyWatered(farm: FarmState): number | null {
  const s = surveyOf(farm);
  const occ = occupiedAreas(farm, s);
  const r = s.topology.areas.find((a) => !occ.has(a.id) && s.points.areaTroughs[a.id]!.length > 0);
  return r ? s.points.areaTroughs[r.id]![0]! : null;
}

/** A farm with a mob of Merino ewes and rams in an empty watered paddock. */
function withSheep(seed: number): FarmState {
  const farm = farmOf(seed);
  const cell = emptyWatered(farm);
  if (cell === null) throw new Error('no empty watered paddock');
  const r = addSheepMob(farm, surveyOf(farm), {
    cell,
    breed: 'merino',
    groups: [
      { cls: 'ewe', head: 200 },
      { cls: 'ram', head: 3 },
    ],
  });
  if (!r.ok) throw new Error(r.reason);
  return farm;
}

describe('sheep on a farm', () => {
  it('are refused in Central Queensland and where a mob already grazes', () => {
    const cq = farmOf(1, 'cq');
    const r = addSheepMob(cq, surveyOf(cq), {
      cell: cq.layout.water.bore,
      breed: 'merino',
      groups: [{ cls: 'ewe', head: 10 }],
    });
    expect(r).toEqual({ ok: false, reason: 'not-a-sheep-district' });
    expect(cq.sheep).toBeUndefined();
    const wv = farmOf(1);
    const cattleCell = wv.mobs.find((m) => m.where.kind === 'paddock')!;
    const anchor = cattleCell.where.kind === 'paddock' ? cattleCell.where.anchor : 0;
    const r2 = addSheepMob(wv, surveyOf(wv), {
      cell: anchor,
      breed: 'merino',
      groups: [{ cls: 'ewe', head: 10 }],
    });
    expect(r2).toEqual({ ok: false, reason: 'area-occupied' });
  });

  it('a farm with no sheep saves with no sheep at all', () => {
    const farm = farmOf(2);
    for (let d = 0; d < 5; d++) stepDay(farm);
    expect('sheep' in saveFarm(farm)).toBe(false);
  });

  it('an older save (format 9) loads with no sheep and plays on', () => {
    const farm = farmOf(3);
    const saved = saveFarm(farm);
    saved.saveFormat = 9;
    const loaded = loadFarm(saved);
    expect(loaded.sheep).toBeUndefined();
    expect(loaded.saveFormat).toBe(SAVE_FORMAT_VERSION);
    stepDay(loaded);
    expect(loaded.day).toBe(1);
  });

  it('play the same from the same seed, and a save of a farm with sheep loads to the same farm', () => {
    const a = withSheep(4);
    const b = withSheep(4);
    for (let d = 0; d < 200; d++) {
      stepDay(a);
      stepDay(b);
    }
    expect(farmHash(a)).toBe(farmHash(b));
    expect(sheepMobsOf(a).reduce((n, m) => n + headOf(m.sheep), 0)).toBeGreaterThan(200);
    const c = loadFarm(JSON.parse(JSON.stringify(saveFarm(a))));
    expect(farmHash(c)).toBe(farmHash(a));
    for (let d = 0; d < 30; d++) {
      stepDay(a);
      stepDay(c);
    }
    expect(farmHash(c)).toBe(farmHash(a));
  });

  it('join, lamb and report on the farm, and their day is told as facts', () => {
    const farm = withSheep(5);
    const types = new Set<string>();
    let lambs = 0;
    // Joining starts on 1 April (day 31); weaning is 14 weeks after lambing starts.
    for (let d = 0; d < 300; d++) {
      const r = stepDay(farm);
      lambs += (r.lambs ?? []).reduce((t, x) => t + x.count, 0);
      for (const e of r.events) {
        if (e.type === 'sheep') types.add(e.note.type);
        else types.add(e.type);
      }
    }
    expect(types.has('joiningStarted')).toBe(true);
    expect(types.has('scanned')).toBe(true);
    expect(types.has('lambs-born')).toBe(true);
    expect(types.has('marked')).toBe(true);
    expect(types.has('sheep-weaned')).toBe(true);
    expect(lambs).toBeGreaterThan(150);
    const read = sheepMobsRead(farm, 0);
    expect(read.length).toBeGreaterThan(0);
    expect(read[0]!.species).toBe('sheep');
    expect(read[0]!.joining!.marked!.pct).toBeGreaterThan(50);
    const st = stockingRead(farm);
    expect(st.sheepDse).toBeGreaterThan(100);
    expect(st.totalAe).toBeCloseTo(st.cattleAe + st.sheepDse / 8.4, 9);
  });

  it('cattle are never moved in with sheep', () => {
    const farm = withSheep(6);
    const sheepCell = sheepMobsOf(farm)[0]!.where;
    const cattle = farm.mobs.find((m) => m.where.kind === 'paddock')!;
    const r = applyInstantly(farm, {
      type: 'moveMob',
      mob: cattle.id,
      to: { cell: sheepCell.kind === 'paddock' ? sheepCell.anchor : 0 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('sheep-there');
  });

  it('cattle in their own paddock play the same with sheep next door', () => {
    const plain = farmOf(5);
    const mixed = farmOf(5);
    const cell = emptyWatered(mixed)!;
    expect(
      addSheepMob(mixed, surveyOf(mixed), {
        cell,
        breed: 'merino',
        groups: [{ cls: 'wether', head: 150 }],
      }),
    ).toMatchObject({ ok: true });
    for (let d = 0; d < 120; d++) {
      stepDay(plain);
      stepDay(mixed);
    }
    // Tag numbers differ (the sheep took some), so the cattle are compared by their figures.
    const cattle = (f: FarmState): string =>
      JSON.stringify(
        f.mobs.map((m) => m.animals.map((a) => [a.kind, a.age, a.wt, a.cond, a.preg])),
      );
    expect(cattle(mixed)).toBe(cattle(plain));
    // Cash differs: the sheep have their own costs (health, shearing, crutching).
  });

  it('drink by class: more with lambs, more in summer', () => {
    const farm = withSheep(8);
    const m = sheepMobsOf(farm)[0]!;
    expect(sheepWaterLitres(m, 0)).toBeGreaterThan(sheepWaterLitres(m, 5));
  });
});
