import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  AREAS,
  HerdRun,
  TROUGHS,
  areaOf,
  beast,
  constantRandom,
  landOf,
  loadCattleMvp,
  paintArea,
  putCattleFarm,
  regAt,
  toEngine,
  type AreaName,
  type BeastSpec,
  type PairedRandom,
  type PastureStateName,
} from '../../test-support/cattle';
import { makeScenario, type Scenario } from '../../test-support/farms';
import type { Mvp } from '../../test-support/mvp';
import { gainOn } from './gains';
import { RESIDUAL, dietOf, intakeOf } from './graze';

/*
 * Chances and thresholds that a long run only meets by luck.
 *
 * A herd run side by side with the MVP for 240 days proves the cases that
 * run happens to reach. A chance of dying nudged from 1.5% to 1.51% would
 * only show if a random draw landed between the two. So these tests go
 * looking: they sweep the draw across the range, put animals either side of
 * each threshold, and tune a mob to sit just inside a limit. Each one is
 * still an exact comparison with the MVP.
 */

const loaded = loadCattleMvp();
const { mvp } = loaded;
vi.setConfig({ testTimeout: 60_000 });
const AREA_NAMES = Object.keys(AREAS) as AreaName[];

interface RunOptions {
  farmHa?: number;
  day?: number;
  troughs?: readonly number[];
  paint?: PastureStateName;
  random?: PairedRandom;
}

function scenario(district: DistrictId, o: RunOptions): Scenario {
  const scn = makeScenario(mvp as unknown as Mvp, {
    district,
    start: { year: 2023, month: 9 },
    day: o.day ?? 30,
    farmHa: o.farmHa ?? 2000,
    seed: 2,
  });
  if (o.paint) for (const name of AREA_NAMES) paintArea(scn, name, o.paint);
  return scn;
}

function startRun(district: DistrictId, o: RunOptions = {}): HerdRun {
  return new HerdRun(
    loaded,
    scenario(district, o),
    { random: o.random ?? constantRandom(0.999999) },
    o.troughs,
  );
}

/** Steers that are all the same, so each wants the same feed. */
const sameSteers = (n: number, extra: Partial<BeastSpec> = {}): BeastSpec[] =>
  Array.from({ length: n }, () => ({
    kind: 'steer' as const,
    sex: 'S' as const,
    wt: 320,
    age: 400,
    cond: 2.8,
    ...extra,
  }));

describe('the daily chance of dying, against the MVP', () => {
  it('is the same at every condition score, for every value of the draw', () => {
    // Steers from CS 1.0 to 1.45, a step of 0.0075 apart, in the feedlot.
    // The same fixed draw goes to every animal, so it decides exactly who
    // dies. The sweep covers every chance from 0 to 0.7% in steps of 0.002%.
    const thin: BeastSpec[] = Array.from({ length: 61 }, (_, i) => ({
      kind: 'steer',
      sex: 'S',
      wt: 300 + i,
      age: 950,
      cond: 1 + i * 0.0075,
    }));
    const dead = new Set<number>();
    for (let k = 0; k <= 350; k++) {
      const run = startRun('cq', { random: constantRandom(k * 0.00002) });
      run.addMob('Mob 1', 'lot', thin);
      dead.add(run.day().deaths.length);
    }
    // From everything dying (a draw of 0) to nothing dying.
    expect(dead.has(61)).toBe(true);
    expect(dead.has(0)).toBe(true);
    expect(dead.size).toBeGreaterThan(40);
  });

  it('records the cause by condition, either side of CS 1.6', () => {
    // With a draw of 0 everything dies. The cause depends on condition at
    // the end of the day, after a day's gain on the lot ration.
    const specs: BeastSpec[] = Array.from({ length: 41 }, (_, i) => ({
      kind: 'steer',
      sex: 'S',
      wt: 300 + i,
      age: 950,
      cond: 1.525 + i * 0.002,
    }));
    const run = startRun('nsw', { random: constantRandom(0) });
    run.addMob('Mob 1', 'lot', specs);
    const causes = run.day().deaths.map((d) => d.cause);
    expect(causes.length).toBe(41);
    expect(causes.filter((c) => c === 'poorCondition').length).toBeGreaterThan(5);
    expect(causes.filter((c) => c === 'natural').length).toBeGreaterThan(5);
  });

  it('records a death on the third day without water as "no water"', () => {
    const run = startRun('cw', { troughs: [TROUGHS.mid], paint: 'green' });
    const pair = run.addMob('Mob 1', AREAS.big, sameSteers(12));
    run.day();
    run.day();
    expect(pair.e.dry).toBe(2);
    // On the third day the draw is 0, so every one of them dies.
    run.useRandom(constantRandom(0));
    const out = run.day();
    expect(out.deaths.map((d) => d.cause)).toEqual(new Array(12).fill('noWater'));
  });

  it('records a death on the second day without water by condition, not as "no water"', () => {
    const run = startRun('cw', { troughs: [TROUGHS.mid], paint: 'green' });
    run.addMob('Mob 1', AREAS.big, sameSteers(12));
    run.day();
    run.useRandom(constantRandom(0));
    const out = run.day();
    expect(out.deaths.map((d) => d.cause)).toEqual(new Array(12).fill('natural'));
  });
});

describe('notes with a limit, against the MVP', () => {
  /** Head of the same steers that would get exactly share `f` of their feed on the tiny area. */
  function headFor(f: number): number {
    const scn = scenario('cq', { farmHa: 1040, paint: 'short' });
    putCattleFarm(mvp, scn);
    const reg = regAt(mvp, AREAS.tiny);
    const land = landOf(mvp, scn, null);
    const diet = dietOf(land, areaOf(reg)).diet;
    const each = intakeOf(toEngine(beast(1, sameSteers(1)[0]!)), diet, 'none', false).past;
    let onOffer = 0;
    for (const i of reg.cells) {
      onOffer += Math.fround(Math.max(0, scn.state.G[i]! + scn.state.D[i]! - RESIDUAL) * mvp.HA);
    }
    return onOffer / (each * f);
  }

  it('short of feed is noted under 70% of what they want, not at 70%', () => {
    // 700 head would get almost exactly 70%. A head count between the one
    // for 70% and the one for 71% gets a share in between: no note.
    const at70 = headFor(0.7);
    const at71 = headFor(0.71);
    expect(Math.floor(at70) - Math.ceil(at71)).toBeGreaterThanOrEqual(1);
    const day = (head: number) => {
      const run = startRun('cq', { farmHa: 1040, paint: 'short' });
      run.addMob('Mob 1', AREAS.tiny, sameSteers(head));
      return run.day().results[0]!;
    };
    const just = day(Math.floor(at70));
    expect(just.st.f).toBeGreaterThanOrEqual(0.7);
    expect(just.st.f).toBeLessThan(0.71);
    expect(just.notes.some((n) => n.type === 'shortOfFeed')).toBe(false);
    const under = day(Math.floor(at70) + 2);
    expect(under.st.f).toBeLessThan(0.7);
    expect(under.st.f).toBeGreaterThan(0.69);
    expect(under.notes.some((n) => n.type === 'shortOfFeed')).toBe(true);
  });

  it('MVP quirk, kept: short feed noted on day 0 of a farm is noted again on day 1', () => {
    const run = startRun('cq', { farmHa: 1040, paint: 'short', day: 0 });
    run.addMob('Mob 1', AREAS.tiny, sameSteers(900));
    const days: number[] = [];
    for (let d = 0; d < 20; d++) {
      const day = run.scn.day;
      if (run.day().results[0]!.notes.some((n) => n.type === 'shortOfFeed')) days.push(day);
    }
    expect(days).toEqual([0, 1, 16]);
  });

  it('MVP quirk, kept: low condition noted on day 0 of a farm is noted again on day 1', () => {
    const run = startRun('cq', { paint: 'bare', day: 0 });
    run.addMob('Mob 1', AREAS.mid, sameSteers(30, { cond: 1.5 }), 'hay');
    const days: number[] = [];
    for (let d = 0; d < 35; d++) {
      const day = run.scn.day;
      if (run.day().results[0]!.notes.some((n) => n.type === 'lowCondition')) days.push(day);
    }
    expect(days).toEqual([0, 1, 32]);
  });

  it('the 10-day weight loss note lists only classes forecast to lose, not one holding its own', () => {
    // A bull whose forecast on this feed is a gain of about 0.005 kg a day:
    // found by trying weights until the forecast sits there.
    const scn = scenario('cq', { farmHa: 5000, paint: 'dry' });
    putCattleFarm(mvp, scn);
    const diet = dietOf(landOf(mvp, scn, null), areaOf(regAt(mvp, AREAS.big))).diet;
    const bull = (wt: number): BeastSpec => ({ kind: 'bull', sex: 'M', wt, age: 2000, cond: 3 });
    const forecast = (wt: number): number => gainOn(toEngine(beast(1, bull(wt))), diet, 'none');
    let lo = 450;
    let hi = 3000;
    expect(forecast(lo)).toBeLessThan(0);
    expect(forecast(hi)).toBeGreaterThan(0.01);
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (forecast(mid) < 0.005) lo = mid;
      else hi = mid;
    }
    expect(forecast(hi)).toBeCloseTo(0.005, 6);

    // The bull runs with thin steers. Every animal starts with a falling
    // weight on record, so the mob counts ten days of loss.
    const run = startRun('cq', { farmHa: 5000, paint: 'dry' });
    const specs = [...sameSteers(8, { adg: -3 }), { ...bull(hi), adg: -3 }];
    const pair = run.addMob('Mob 1', AREAS.big, specs);
    let note;
    for (let d = 0; d < 10; d++) {
      // Hold the bull at its weight so the forecast stays where it was put.
      pair.e.animals[8]!.wt = hi;
      pair.m.animals[8]!.wt = hi;
      note = run.day().results[0]!.notes.find((n) => n.type === 'losingWeight');
    }
    expect(note?.type).toBe('losingWeight');
    if (note?.type !== 'losingWeight') return;
    expect(note.classes.map((c) => c.cls)).toEqual(['yearlingSteer']);
    // The bull's forecast today is between 0 and 0.01: holding, so not listed.
    const now = dietOf(landOf(mvp, run.scn, null), areaOf(regAt(mvp, AREAS.big))).diet;
    const g = gainOn(pair.e.animals[8]!, now, 'none');
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThan(0.01);
  });
});
