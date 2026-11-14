import { createFarm, onRecordPtic, recordClassOf, stepDay, type FarmState } from '@gg/engine';
import { describe, expect, it } from 'vitest';
import type { SetupChoices } from '../../lib/game/types';
import { buildSnapshot } from './snapshot';

/*
 * The mob card and the herd list show the herd record (Claudia, 14 Nov
 * 2026): a female is PTIC from the engine's PTIC_DAYS in calf, and before
 * that shows exactly as one not in calf. No preg test is reported.
 */

const setup: SetupChoices = {
  district: 'cw',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'easy',
  name: 'Record',
};
const snap = (farm: FarmState) => buildSnapshot(farm, { name: 'R', setup, version: 'v1' }, {});

function farmAt(days: number): FarmState {
  const farm = createFarm({
    seed: 5,
    district: 'cw',
    size: 'small',
    start: { year: 2026, month: 8 },
    startType: 'running',
    difficulty: 'easy',
  });
  for (let d = 0; d < days; d++) stepDay(farm);
  return farm;
}

describe('the mob card shows the record', () => {
  it('head PTIC, how far along, and the class rows follow the one rule', () => {
    const farm = farmAt(90);
    const s = snap(farm);
    for (const m of s.mobs) {
      const mob = farm.mobs.find((x) => x.id === m.id)!;
      const ptic = mob.animals.filter(onRecordPtic).length;
      expect(m.ptic).toBe(ptic);
      if (ptic > 0) {
        expect(m.pticText).toMatch(/^\d+ PTIC.*, \d+( to \d+)? months? in calf\.$/);
        expect(m.breeding).toContain(m.pticText);
      } else expect(m.pticText).toBeNull();
      for (const row of m.classes) {
        expect(row.head).toBe(mob.animals.filter((a) => recordClassOf(a) === row.id).length);
      }
    }
  });

  it('a cow 10 days in calf and an empty cow show the same on every screen', () => {
    const farm = farmAt(10);
    const m = farm.mobs.find((x) => x.animals.some((a) => a.kind === 'cow' && !a.calf))!;
    const cow = m.animals.find((a) => a.kind === 'cow' && !a.calf)!;
    cow.preg = -1;
    const empty = snap(farm);
    cow.preg = 10;
    const tenDays = snap(farm);
    expect(tenDays.mobs).toEqual(empty.mobs);
    expect(tenDays.view.mobs).toEqual(empty.view.mobs);
  });

  it('no preg test or count of cows in calf reaches the inbox, and no cow is called empty', () => {
    const farm = farmAt(200);
    const s = snap(farm);
    const text = JSON.stringify({ inbox: s.inbox, mobs: s.mobs });
    expect(text).not.toMatch(/preg test|in calf now|got in calf|empty/i);
  });
});
