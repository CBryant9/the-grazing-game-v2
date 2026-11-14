import { describe, expect, it } from 'vitest';
import { AVERAGE_YEAR } from '../../test-support/calibration';
import { scoreYear } from '../money/worth';
import { createFarm } from '../sim/create';
import type { FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { sheepMobsOf } from './farm';

/*
 * Sheep count in the year's totals as cattle do (milestone 2.3, third pass):
 * pasture eaten, live weight gained (birth weights included) and deaths. A
 * death is weighed by the animal's own size (its AE, (kg ÷ 450)^0.75) for
 * sheep, so ordinary lamb losses do not score like a disaster.
 */

const env = { seasons: AVERAGE_YEAR };

function year(stock: 'cattle' | 'sheep' | 'mix'): FarmState {
  const farm = createFarm(
    {
      seed: 7,
      district: 'cw',
      size: 'medium',
      start: { year: 2021, month: 8 },
      startType: 'running',
      difficulty: 'easy',
      stock,
    },
    env,
  );
  for (let d = 0; d < 365; d++) stepDay(farm, env);
  return farm;
}

describe('sheep in the year totals and the score', () => {
  it('a sheep-only year counts its pasture eaten and its weight gained, and scores for both', () => {
    const farm = year('sheep');
    expect(farm.mobs.length).toBe(0);
    expect(sheepMobsOf(farm).length).toBeGreaterThan(0);
    const y = farm.years[0]!;
    expect(y.eaten).toBeGreaterThan(0);
    // Weight gained counts (a sheep year can gain or lose, as a cattle year can).
    expect(y.gain).not.toBe(0);
    expect(y.score.gainPts).toBeCloseTo(y.gain * 0.5, 6);
    expect(y.score.utilPts).toBeGreaterThan(0);
  });

  it('a mixed year counts both species in its totals', () => {
    const mix = year('mix');
    const y = mix.years[0]!;
    expect(y.eaten).toBeGreaterThan(0);
    expect(y.sheepDeaths ?? 0).toBeGreaterThan(0);
    expect(y.deaths).toBeGreaterThanOrEqual(0);
  });

  it('ordinary lamb losses do not score like a disaster', () => {
    // 600 ewes lose 200 newborn lambs of 4 kg and 18 ewes of 50 kg: about 9.4 AE of deaths.
    const base = {
      worth0: 0,
      worth1: 0,
      grown: 1000,
      eaten: 400,
      gain: 0,
      deaths: 0,
      covers: [80],
    };
    const lambs = 200 * Math.pow(4 / 450, 0.75) + 18 * Math.pow(50 / 450, 0.75);
    const s = scoreYear({ ...base, sheepDeaths: 218, sheepDeathAe: lambs }, 80);
    const tenCows = scoreYear({ ...base, deaths: 10 }, 80);
    expect(s.deathPts).toBeGreaterThan(tenCows.deathPts);
    expect(lambs).toBeLessThan(10);
  });
});
