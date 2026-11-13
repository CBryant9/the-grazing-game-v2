import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../actions/apply';
import { createFarm } from './create';
import { surveyOf } from './derived';
import { farmTotals } from './summary';
import { stepDay } from './tick';

/*
 * The speed of the daily tick with a big herd (CALIBRATION.md: under about
 * 5 ms per simulated day with 4,000+ head, so fast-forward stays smooth).
 *
 * The figure is printed so it can be read off a test run. Run this file on
 * its own for a fair figure: with the whole suite running beside it (the MVP
 * comparisons use every core) it reads several times slower. So the limit
 * checked here is very loose, only there to catch a tick that has become
 * slow by an order of magnitude. The calibration milestone (1.3) holds the
 * benchmark itself.
 */

vi.setConfig({ testTimeout: 600_000 });

describe('speed', () => {
  it('a day with more than 4,000 head takes a few milliseconds', () => {
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
      const done = applyAction(farm, {
        type: 'buyCattle',
        cls: 'weanerSteer',
        qty: 700,
        to: { cell: r.cells[0]! },
      });
      if (done.ok) farm = done.farm;
    }
    const head = farmTotals(farm).head;
    expect(head).toBeGreaterThan(4000);

    // A month to warm up, then the best of twelve 30-day runs.
    for (let d = 0; d < 30; d++) stepDay(farm);
    let best = Infinity;
    for (let rep = 0; rep < 12; rep++) {
      const t0 = performance.now();
      for (let d = 0; d < 30; d++) stepDay(farm);
      best = Math.min(best, (performance.now() - t0) / 30);
    }
    const now = farmTotals(farm);
    console.info(
      `Speed: ${best.toFixed(2)} ms a day with ${now.head} head and ${now.calves} calves in ${farm.mobs.length} mobs`,
    );
    expect(now.head).toBeGreaterThan(4000);
    expect(farm.over).toBeNull();
    // The target is 5 ms on its own. This limit leaves room for a machine busy with the rest of the suite.
    expect(best).toBeLessThan(60);
  });
});
