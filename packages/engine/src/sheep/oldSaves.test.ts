import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadFarm, saveFarm, type SavedFarm } from '../save/save';
import { stepDay } from '../sim/tick';
import { SAVE_FORMAT_VERSION } from '../version';
import { sheepJobDates, sheepMobsOf } from './farm';
import { headOf } from './simFlock';

/*
 * Old saves load by their format number (milestone 2.3, third pass). The
 * fixtures were made by the old code itself: `save-format-10.json` by the
 * first sheep pass (commit e35982a, engine 0.14.0), a running Western
 * Victoria farm with 120 ewes and 3 rams through lambing; `save-format-9.json`
 * by the hands branch (b4e8b75, engine 0.13.0), a running farm with no sheep.
 */

const fixture = (name: string): SavedFarm =>
  JSON.parse(readFileSync(`packages/engine/test-support/fixtures/${name}`, 'utf8')) as SavedFarm;

describe('older saves', () => {
  it('a format 10 save (the first pass) loads every sheep as a record of one, with its lambs', () => {
    const saved = fixture('save-format-10.json');
    expect(saved.saveFormat).toBe(10);
    const farm = loadFarm(saved);
    expect(farm.saveFormat).toBe(SAVE_FORMAT_VERSION);
    const mob = sheepMobsOf(farm)[0]!;
    expect(mob.sheep.length).toBe(169);
    for (const s of mob.sheep) {
      expect(s.n).toBe(1);
      expect(s.doomed === 0 || s.doomed === 1).toBe(true);
      expect(s.doomed2 === 0 || s.doomed2 === 1).toBe(true);
      expect(Number.isFinite(s.wt) && s.wt > 1).toBe(true);
      expect(s.age).toBeGreaterThanOrEqual(0);
    }
    expect(mob.sheep.some((s) => !s.weaned)).toBe(true);
    expect(mob.feed).toBe('none');
    expect(mob.shearOn).toEqual(sheepJobDates(mob.joinOn).shearOn);
    // It plays on, and saves and loads again as format 11.
    for (let d = 0; d < 20; d++) stepDay(farm);
    expect(headOf(sheepMobsOf(farm)[0]!.sheep)).toBeGreaterThan(100);
    const again = loadFarm(JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm);
    expect(headOf(sheepMobsOf(again)[0]!.sheep)).toBe(headOf(sheepMobsOf(farm)[0]!.sheep));
  });

  it('a format 9 save (no sheep) loads with no sheep and plays on', () => {
    const farm = loadFarm(fixture('save-format-9.json'));
    expect(farm.sheep).toBeUndefined();
    const day = farm.day;
    stepDay(farm);
    expect(farm.day).toBe(day + 1);
  });
});
