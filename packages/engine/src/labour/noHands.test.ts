/**
 * A farm with no farm hands and no contractors plays day for day exactly as
 * it did before hands and contractors were built (milestone 2.1).
 *
 * The digests below were taken on engine 0.12.1 (save format 8, commit
 * 34fecf2), before any labour code existed. The farm is hashed with the
 * fields that only say which engine and format ran it left out, and with
 * the labour state left out (a farm with no hands has none). Every other
 * figure, the inbox and the action log must be what they were.
 */

import { describe, expect, it } from 'vitest';
import { across, work } from '../../test-support/workingDay';
import { endDay, skipDays } from '../day/days';
import { hash32 } from '../rng';
import { saveFarm } from '../save/save';
import { loadRealData } from '../server';
import { createFarm } from '../sim/create';
import type { FarmState } from '../sim/state';

/** A hash of the farm without its engine version, save format or labour state. */
function digest(farm: FarmState): string {
  const saved = saveFarm(farm) as Record<string, unknown>;
  delete saved.engineVersion;
  delete saved.saveFormat;
  delete saved.labour;
  const canonical = (v: unknown): string => {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return (
        '{' +
        Object.keys(o)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(o[k]))
          .join(',') +
        '}'
      );
    }
    return JSON.stringify(v);
  };
  const text = canonical(saved);
  return (
    hash32(text).toString(16).padStart(8, '0') +
    hash32(text, 0x9747b28c).toString(16).padStart(8, '0')
  );
}

/** Run the farm on a day at a time, then by skips, to `days` days. */
function runOn(farm: FarmState, days: number, env = {}): FarmState {
  let f = farm;
  for (let i = 0; i < 10; i++) f = endDay(f, env).farm;
  while (f.day < days && !f.over) {
    const s = skipDays(f, Math.min(60, days - f.day), env, { anyway: true });
    f = s.farm;
    if (s.daysRun === 0) break;
  }
  return f;
}

describe('a farm with no hands and no contractors is unchanged', () => {
  it('a running farm on random seasons, a year with a fence job', { timeout: 120_000 }, () => {
    let farm = createFarm({
      seed: 11,
      district: 'nsw',
      size: 'small',
      start: { year: 2021, month: 6 },
      startType: 'running',
      difficulty: 'easy',
    });
    farm = work(farm, { type: 'buildFence', edges: across(9, 2, 6), fence: 'permanent' }).farm;
    farm = runOn(farm, 365);
    expect(farm.day).toBe(365);
    expect(farm.over).toBeNull();
    expect(digest(farm)).toBe(NO_HANDS_RANDOM);
  });

  it('a running farm on real years, half a year', { timeout: 120_000 }, () => {
    const data = loadRealData();
    let farm = createFarm(
      {
        seed: 5,
        district: 'cw',
        size: 'small',
        start: { year: 2006, month: 4 },
        years: { kind: 'real', order: 'in-order' },
        startType: 'running',
        difficulty: 'easy',
      },
      { data },
    );
    farm = work(
      farm,
      { type: 'buildFence', edges: across(12, 3, 8), fence: 'tape' },
      { data },
    ).farm;
    farm = runOn(farm, 180, { data });
    expect(farm.day).toBe(180);
    expect(digest(farm)).toBe(NO_HANDS_REAL);
  });
});

// Taken on engine 0.12.1, before labour existed.
const NO_HANDS_RANDOM = '119de6c1e6862bb2';
const NO_HANDS_REAL = 'a52568e82c5f4cdf';
