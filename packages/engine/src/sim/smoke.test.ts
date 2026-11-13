import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { farmHash, loadFarm, saveFarm } from '../save/save';
import { createFarm } from './create';
import { farmTotals } from './summary';
import { stepDay } from './tick';

describe('smoke', () => {
  it.each(DISTRICT_IDS)('%s runs', (id) => {
    const farm = createFarm({
      seed: 7,
      district: id,
      size: 'medium',
      start: { year: 2023, month: 8 },
      startType: 'running',
      difficulty: 'medium',
    });
    const t0 = performance.now();
    const seen = new Set<string>();
    for (let d = 0; d < 400; d++) {
      const r = stepDay(farm);
      for (const e of r.events) seen.add(e.type === 'cattle' ? 'cattle:' + e.note.type : e.type);
    }
    const ms = (performance.now() - t0) / 400;
    const t = farmTotals(farm);
    console.log(
      id,
      ms.toFixed(3),
      'ms/day',
      t.head,
      'head',
      Math.round(t.cash),
      [...seen].join(' '),
    );
    console.log(JSON.stringify(farm.years[0]?.score), JSON.stringify(t.netWorth));
    const saved = JSON.stringify(saveFarm(farm));
    console.log('save bytes', saved.length, farmHash(farm), farmHash(loadFarm(JSON.parse(saved))));
    expect(farm.day).toBe(400);
  });
});
