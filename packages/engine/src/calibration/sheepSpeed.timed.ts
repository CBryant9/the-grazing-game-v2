import { describe, expect, it, vi } from 'vitest';
import { DSE_PER_AE } from '../data/sheep';
import { carryingCapacityAE } from '../money/costs';
import { ramsNeeded } from '../sheep/breeding';
import { addSheepMob, sheepMobsOf } from '../sheep/farm';
import { headOf } from '../sheep/simFlock';
import { createFarm } from '../sim/create';
import { surveyOf } from '../sim/derived';
import { stepDay } from '../sim/tick';
import { EWE_YEAR_DSE } from '../../test-support/sheep';

/*
 * Speed of a sheep farm (docs/CALIBRATION.md, Speed): the largest flock the
 * game holds, a day of it under the same limit as the cattle test (5 ms a
 * day, so fast-forward stays smooth whatever the species).
 *
 * The largest flock: the largest farm in the best sheep district (Western
 * Victoria, 1,500 ha), stocked as the sheep year benchmarks are (80% of its
 * carrying capacity in DSE, 1.5 DSE a ewe for the year), with rams at
 * 1% + 1. It is timed through lambing, when the flock is biggest (ewes and
 * their lambs at foot), and the head is checked.
 *
 * Run with `pnpm test:speed`, alone. GG_SPEED_LIMIT_MS sets a looser limit
 * for slower shared machines, as for the cattle test.
 */

vi.setConfig({ testTimeout: 600_000 });

const LIMIT_MS = Number(process.env.GG_SPEED_LIMIT_MS ?? 5);
const FARM_HA = 1500;

describe('speed of the daily tick with sheep', () => {
  it(`runs a day of the largest flock (lambs at foot) in under ${LIMIT_MS} ms`, () => {
    const farm = createFarm({
      seed: 5,
      district: 'wv',
      size: FARM_HA,
      start: { year: 2024, month: 3 },
      startType: 'scratch',
      difficulty: 'easy',
      money: { cash: 1e8, overdraft: -1e8, broke: -1e9 },
    });
    const ewes = Math.round((carryingCapacityAE('wv', FARM_HA) * DSE_PER_AE * 0.8) / EWE_YEAR_DSE);
    const r = addSheepMob(farm, surveyOf(farm), {
      cell: farm.layout.water.bore,
      breed: 'merino',
      groups: [
        { cls: 'ewe', head: ewes },
        { cls: 'ram', head: ramsNeeded(ewes) },
      ],
    });
    expect(r.ok).toBe(true);
    // Joining starts on day 0 (1 April); lambing from day 147. Run to day 185 (lambing over), then time.
    for (let d = 0; d < 185; d++) stepDay(farm);
    const head = (): number => sheepMobsOf(farm).reduce((n, m) => n + headOf(m.sheep), 0);
    expect(head()).toBeGreaterThan(ewes * 1.6);
    let best = Infinity;
    for (let rep = 0; rep < 6; rep++) {
      const t0 = performance.now();
      for (let d = 0; d < 5; d++) stepDay(farm);
      best = Math.min(best, (performance.now() - t0) / 5);
    }
    const msg = `${best.toFixed(2)} ms a day with ${head()} sheep (${ewes} ewes joined) on ${FARM_HA} ha`;
    expect(best, msg).toBeLessThan(LIMIT_MS);
    process.stdout.write(`Sheep speed: ${msg} (limit ${LIMIT_MS} ms)\n`);
  });
});
