import { describe, expect, it, vi } from 'vitest';
import { applyInstantly } from '../../test-support/instant';
import { createFarm } from '../sim/create';
import { surveyOf } from '../sim/derived';
import { farmTotals } from '../sim/summary';
import { stepDay } from '../sim/tick';

/*
 * Speed (docs/CALIBRATION.md): under about 5 ms per simulated day with
 * 4,000+ head, so fast-forward stays smooth.
 *
 * Run with `pnpm test:speed`. It is kept out of `pnpm test` because the
 * other test files use every core, and a timing taken beside them reads
 * several times slower. The limit is 5 ms unless GG_SPEED_LIMIT_MS says
 * otherwise (CI sets a looser one for its slower shared machines).
 */

vi.setConfig({ testTimeout: 600_000 });

const LIMIT_MS = Number(process.env.GG_SPEED_LIMIT_MS ?? 5);

describe('speed of the daily tick', () => {
  it(`runs a day with more than 4,000 head in under ${LIMIT_MS} ms`, () => {
    let farm = createFarm({
      seed: 5,
      district: 'cq',
      size: 'large',
      start: { year: 2024, month: 4 },
      startType: 'running',
      difficulty: 'easy',
      money: { cash: 1e8, overdraft: -1e8, broke: -1e9 },
    });
    // Top the running herd up with steers in every paddock that has water.
    const s = surveyOf(farm);
    for (const r of s.topology.areas) {
      if (!s.points.areaTroughs[r.id]!.length) continue;
      const done = applyInstantly(farm, {
        type: 'buyCattle',
        cls: 'weanerSteer',
        qty: 700,
        to: { cell: r.cells[0]! },
      });
      if (done.ok) farm = done.farm;
    }
    expect(farmTotals(farm).head).toBeGreaterThan(4000);

    // A month to warm up, then the best of twelve 30-day runs.
    for (let d = 0; d < 30; d++) stepDay(farm);
    let best = Infinity;
    for (let rep = 0; rep < 12; rep++) {
      const t0 = performance.now();
      for (let d = 0; d < 30; d++) stepDay(farm);
      best = Math.min(best, (performance.now() - t0) / 30);
    }
    const now = farmTotals(farm);
    // The figure for docs/CALIBRATION.md, on the test's name so it shows in the run.
    expect(now.head).toBeGreaterThan(4000);
    expect(farm.over).toBeNull();
    expect(
      best,
      `${best.toFixed(2)} ms a day with ${now.head} head and ${now.calves} calves in ${farm.mobs.length} mobs`,
    ).toBeLessThan(LIMIT_MS);
    process.stdout.write(
      `Speed: ${best.toFixed(2)} ms a day with ${now.head} head and ${now.calves} calves in ${farm.mobs.length} mobs (limit ${LIMIT_MS} ms)\n`,
    );
  });
});
