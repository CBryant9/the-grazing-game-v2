/// <reference types="node" />
import { describe, expect, it, vi } from 'vitest';
import { CalfWatch } from '../../test-support/calibration';
import { loadRealData } from '../server';
import { createFarm } from '../sim/create';
import { stepDay } from '../sim/tick';

/*
 * The case that found slow calf growth (docs/CALIBRATION.md, the m2.5
 * entry): a small Central Qld farm, a running business, easy, real years in
 * order from 1 September 1997, seed 1, and no player action for a year.
 * 1997-98 grew a below average season (0.81). The calves are born late
 * November to early March and the drop is weaned about 22 August, after
 * the dry season on their mothers.
 *
 * Engine 0.13.0 weaned them at 77 kg (51 to 86) and they weighed 82 kg at
 * 200 days. Engine 0.14.0: 154 kg at 200 days, and those 150 days or older
 * weaned at 150 kg (138 to 154).
 *
 * The bands. The nearest source (Brahman-Shorthorn calves in the dry
 * tropics, Fordyce et al. 1993) gives 161 to 173 kg at 180 days in their
 * years, with growth up to 25% apart from year to year. 1997-98 was a below
 * average season, so a quarter off the source is the floor at 200 days:
 * 140 kg (the bottom of the Central Qld calf band in herds.test.ts). At
 * weaning the calves have had the dry season on their mothers: the mean
 * must be 130 kg or more, and no calf of 150 days or more may be weaned
 * under 100 kg, the weight FutureBeef calls a drought wean.
 */

vi.setConfig({ testTimeout: 900_000 });

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

describe('calves through the dry on their mothers: Central Qld from 1997, no player action', () => {
  const data = loadRealData();
  const env = { data };
  const farm = createFarm(
    {
      seed: 1,
      district: 'cq',
      size: 'small',
      start: { year: 1997, month: 8 },
      startType: 'running',
      difficulty: 'easy',
      years: { kind: 'real', order: 'in-order' },
    },
    env,
  );
  const watch = new CalfWatch();
  for (let d = 0; d < 365; d++) {
    stepDay(farm, env);
    watch.day(farm);
  }
  if (process.env.GG_CALF_PRINT === '1') {
    const w = watch.weaned;
    console.log(
      `found case: weaned ${w.length}, ${Math.min(...w.map((x) => x.age))} to ${Math.max(...w.map((x) => x.age))} days, mean ${mean(w.map((x) => x.kg)).toFixed(1)} kg (${Math.min(...w.map((x) => x.kg)).toFixed(0)} to ${Math.max(...w.map((x) => x.kg)).toFixed(0)}); at 200 days n ${watch.at200.length}, mean ${mean(watch.at200.map((c) => c.kg)).toFixed(1)} kg`,
    );
  }

  it('weighs 140 to 225 kg on average at 200 days', () => {
    expect(watch.at200.length).toBeGreaterThan(20);
    const kg = mean(watch.at200.map((c) => c.kg));
    expect(kg).toBeGreaterThanOrEqual(140);
    expect(kg).toBeLessThanOrEqual(225);
  });

  it('weans calves of 150 days or more at 130 kg or more on average, none under 100 kg', () => {
    const old = watch.weaned.filter((w) => w.age >= 150);
    expect(old.length).toBeGreaterThan(20);
    expect(mean(old.map((w) => w.kg))).toBeGreaterThanOrEqual(130);
    for (const w of old) expect(w.kg).toBeGreaterThanOrEqual(100);
  });
});
