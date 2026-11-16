/**
 * A farm with no farm hands and no contractors plays day for day exactly as
 * it did before hands and contractors were built (milestone 2.1).
 *
 * The digests below were taken on engine 0.12.1 (save format 8, commit
 * 34fecf2), before any labour code existed. The farm is hashed with the
 * fields that only say which engine and format ran it left out, and with
 * the labour state left out (a farm with no hands has none). The records
 * no rule reads (engine 0.21.0: `startTags`, the first tag after setup, and
 * `stockedOn`, the days stock were on each square, for the stock book and
 * rest days; engine 0.22.0: `startNet`, the stock book's cost in for a head
 * taken over) are left out too. Every other figure, the inbox and the action
 * log must be what they were.
 */

import { describe, expect, it } from 'vitest';
import { across, work } from '../../test-support/workingDay';
import { endDay, skipDays } from '../day/days';
import { hash32 } from '../rng';
import { fromBase64, saveFarm } from '../save/save';
import { loadRealData } from '../server';
import { createFarm } from '../sim/create';
import type { FarmState } from '../sim/state';

/** A hash of the farm without its engine version, save format or labour state. */
function digest(farm: FarmState): string {
  const saved = saveFarm(farm) as Record<string, unknown>;
  delete saved.engineVersion;
  delete saved.saveFormat;
  delete saved.labour;
  delete saved.startTags;
  delete saved.startNet;
  delete saved.stockedOn;
  // Numbers are rounded to 10 significant figures, so the digest holds on every Node version.
  // Node 22 and Node 24 give the same farm, but Math functions can differ in the last bit
  // (about 1 part in 10^16), and an exact hash of the bits then differs (LESSONS).
  const num = (x: number): string =>
    Number.isFinite(x) ? String(Number(x.toPrecision(10)) + 0) : String(x);
  const floats = (b64: string, C: Float32ArrayConstructor | Float64ArrayConstructor): string => {
    const bytes = fromBase64(b64);
    const a = new C(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    return '[' + Array.from(a, num).join(',') + ']';
  };
  const canonical = (v: unknown, key = ''): string => {
    if (typeof v === 'number') return num(v);
    if (key === 'nums' && typeof v === 'string') return floats(v, Float64Array);
    if (Array.isArray(v)) return '[' + v.map((x) => canonical(x)).join(',') + ']';
    if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.$ === 'f64' && typeof o.b === 'string') return floats(o.b, Float64Array);
      if (o.$ === 'f32' && typeof o.b === 'string') return floats(o.b, Float32Array);
      return (
        '{' +
        Object.keys(o)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(o[k], k))
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

// Taken on engine 0.12.1, before labour existed: '119de6c1e6862bb2' and
// 'a52568e82c5f4cdf'. Taken again on engine 0.14.0 (m2.5), because the
// cattle model changed on purpose: stock under 200 kg pay the measured cost
// for a kg of gain, a cow's milk falls with her condition, not with the
// feed, and no milk is made past what her loss can pay for
// (docs/CALIBRATION.md, the m2.5 calf growth entry). Labour did not
// change. The farms are the same; only the cattle figures moved. The real
// years digest did not move with the last of these.
//
// Taken again on engine 0.22.0 (m8 realism 2), because the inbox changed on purpose: a day's
// births are no longer an inbox line, the weekly calving lines and "calving has finished" are,
// and the bank fact counts the head on the farm. Each mob that has calved keeps its count
// (`FarmMob.calving`). Nothing else moved: hashed with the inbox, `inboxSeq` and the calving
// count left out, both farms give the same digest on 0.21.0 (m7-final) and on 0.22.0
// ('e6c82c766149285f' random, '3cef38dcebdd3891' real; docs/CALIBRATION.md, the m8 realism 2
// entry). Before: '154b92c7a442c890' and 'a9d5034a80529087'.
//
// Taken again on 16 Nov 2026 with every number rounded to 10 significant figures before hashing.
// The 0.22.0 digests above failed on this machine on both Node 22 and Node 24, and on every
// earlier commit back to 0.21.0: an exact hash of the bits moves with the Node version (the
// last-bit Math differences, about 1 part in 10^16). Rounded, Node 22.23 and Node 24.22 give the
// same digest. Checked the same way: with the inbox, `inboxSeq` and the calving count left out,
// 0.21.0 (a8ae3bf) and 0.22.0 both give '0961a06107117090' random and '48e1e0e4cbc59ca7' real,
// so the farm itself did not move. Before: '8add17c3f8661742' and '849512f4fe7357eb'.
const NO_HANDS_RANDOM = 'e817683353562dd8';
const NO_HANDS_REAL = '70a8179390429cfc';
