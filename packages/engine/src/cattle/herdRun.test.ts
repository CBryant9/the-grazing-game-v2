import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { AREAS, HerdRun, TROUGHS, loadCattleMvp, pairedRandom } from '../../test-support/cattle';
import { makeScenario } from '../../test-support/farms';
import type { Mvp } from '../../test-support/mvp';
import type { SaleClassId } from '../data/cattle';
import { rngStream } from '../rng';
import { randomSeasons } from '../season/randomSeasons';
import { makeSaleBatch } from './animal';
import type { Animal } from './types';

/*
 * Whole herds for 200 days and more, side by side with the MVP.
 *
 * Each day the grass grows in both, then every mob has its day in both.
 * After every day every animal, mob figure, pasture array, total, death and
 * note must be the same exactly, and both sides must have drawn the same
 * count of random numbers. A small difference on day 1 would be a large one
 * by day 200, so drift would show.
 *
 * The MVP left a cow milking after her calf died. The engine dries her off.
 * When that comes up the run checks the engine has done so, then dries her
 * off in the MVP as well so the two can carry on side by side.
 */

const loaded = loadCattleMvp();
const { mvp } = loaded;

// These runs are long. Give a slow machine room.
vi.setConfig({ testTimeout: 120_000 });

/** A start month for each district that takes the run through dry or frosty months. */
const STARTS: Record<DistrictId, number> = { cq: 2, nsw: 9, cw: 4, wv: 7 };

function startRun(
  id: DistrictId,
  o: { seed: number; landUses?: boolean; farmHa?: number; troughs?: readonly number[] },
): { run: HerdRun; grow: () => void } {
  const start = { year: 2023, month: STARTS[id] };
  const seasons = randomSeasons({ seed: 20261113 + o.seed, start });
  const scn = makeScenario(mvp as unknown as Mvp, {
    district: id,
    start,
    farmHa: o.farmHa ?? 2000,
    landUses: o.landUses,
    seed: o.seed,
  });
  const run = new HerdRun(
    loaded,
    scn,
    { random: pairedRandom(o.seed * 7919), landUses: o.landUses },
    o.troughs,
  );
  const grow = (): void => {
    const f = seasons.factorsOn(scn.day);
    scn.seasonF = f.seasonF;
    scn.monthF = f.monthF;
    run.grow();
  };
  return { run, grow };
}

function bought(
  run: HerdRun,
  seed: number,
  counts: Partial<Record<SaleClassId, number>>,
): Animal[] {
  const rng = rngStream(seed, 'test-herd');
  const out: Animal[] = [];
  for (const [key, n] of Object.entries(counts)) {
    out.push(...makeSaleBatch(run.ids, rng, key as SaleClassId, n));
  }
  return out;
}

/** Cows in calf, cows with calves (a third of them unmarked bull calves), dry cows, heifers, bulls. */
function breeders(run: HerdRun, seed: number, scale = 1): Animal[] {
  const herd = bought(run, seed, {
    ptic: Math.round(30 * scale),
    cowCalf: Math.round(25 * scale),
    dryCow: Math.round(15 * scale),
    joinHeifer: Math.round(10 * scale),
    bull: 2,
  });
  herd.filter((a) => a.kind === 'calf').forEach((c, k) => k % 3 === 0 && (c.sex = 'M'));
  return herd;
}

describe.each(DISTRICT_IDS)('%s: herds side by side with the MVP', (id) => {
  it('a breeding herd, heifers with young bulls, and steers: 240 days with seasons', () => {
    const { run, grow } = startRun(id, { seed: 3, landUses: true });
    const lick = id === 'cq' ? 'lick' : 'none';
    const cows = run.addHerd('Breeders', AREAS.mid, breeders(run, 11), lick);
    run.addHerd('Steers', AREAS.big, bought(run, 12, { weanerSteer: 70, yearSteer: 20 }), lick);
    // Weaner heifers running with three unmarked young bulls.
    const young = bought(run, 13, { weanerHeifer: 30, weanerSteer: 3 });
    young.slice(-3).forEach((a) => Object.assign(a, { kind: 'bull', sex: 'M', young: true }));
    run.addHerd('Heifers', AREAS.strip, young, 'none');

    const seen = new Set<string>();
    let born = 0;
    let weanedAway = 0;
    let conceived = 0;
    for (let d = 0; d < 240; d++) {
      grow();
      const mobs = run.pairs.length;
      const inCalf = run.pairs.reduce(
        (n, p) => n + p.e.animals.filter((a) => a.preg === 0).length,
        0,
      );
      const out = run.day();
      for (const r of out.results) {
        born += r.births.length;
        for (const n of r.notes) seen.add(n.type);
      }
      if (run.pairs.length > mobs) weanedAway++;
      conceived += Math.max(
        0,
        run.pairs.reduce((n, p) => n + p.e.animals.filter((a) => a.preg === 0).length, 0) - inCalf,
      );
    }

    // The run went through the whole breeding year, not just a quiet stretch.
    expect(born).toBeGreaterThan(20);
    expect(conceived).toBeGreaterThan(10);
    expect(weanedAway).toBeGreaterThan(0);
    for (const type of [
      'calvingStarted',
      'toMark',
      'joiningStarted',
      'joiningProgress',
      'pregTest',
      'youngBullsFertile',
    ]) {
      expect(seen, type).toContain(type);
    }
    expect(cows.e.animals.length).toBeGreaterThan(50);
    // The MVP also drew a spot on the map for every calf. The engine did not.
    const c = run.random.counts();
    expect(c.engine).toBe(c.mvp);
    expect(c.sprite).toBeGreaterThanOrEqual(born);
    expect(c.engine).toBeGreaterThan(20000);
  });

  it('steers: set-stocked, on a 2-move-a-day rotation, on pellets and in the lot, 220 days', () => {
    const { run, grow } = startRun(id, { seed: 5, farmHa: 1300 });
    run.addHerd('Set-stocked', AREAS.big, bought(run, 21, { weanerSteer: 60 }), 'none');
    const stops = [AREAS.mid, AREAS.strip, AREAS.small];
    const rotation = run.addHerd('Rotation', AREAS.mid, bought(run, 22, { yearSteer: 50 }), 'lick');
    run.setShifts(rotation, stops, 2);
    run.addHerd('Lot', 'lot', bought(run, 24, { yearSteer: 15 }), 'none');
    const start = run.pairs.map((p) => p.e.animals.reduce((s, a) => s + a.wt, 0));
    for (let d = 0; d < 220; d++) {
      grow();
      run.day();
      rotation.m.plan!.idx = (rotation.m.plan!.idx + 2) % stops.length;
      run.move(rotation, stops[rotation.m.plan!.idx]!);
      // The pellet mob starts half way through.
      if (d === 110) {
        run.addHerd('Pellets', AREAS.tiny, bought(run, 23, { weanerSteer: 4 }), 'pellet');
      }
    }
    expect(run.pairs.length).toBe(4);
    const end = run.pairs.map((p) => p.e.animals.reduce((s, a) => s + a.wt, 0));
    // The lot steers put on weight every day.
    expect(end[2]! - start[2]!).toBeGreaterThan(15 * 150);
    expect(run.totals.eaten).toBeGreaterThan(100000);
    expect(rotation.rep.headDays).toBeGreaterThan(50 * 200);
  });

  it('too many cattle through a drought: slipped calves, dead calves, deaths, 150 days', () => {
    // Water only in the small area, so weaners stay with the cows.
    const { run } = startRun(id, { seed: 8, troughs: [TROUGHS.small] });
    run.scn.state.G.fill(300);
    run.scn.state.D.fill(900);
    mvp.S.G.fill(300);
    mvp.S.D.fill(900);
    run.addHerd('Breeders', AREAS.small, breeders(run, 31, 3), 'none');
    const seen = new Set<string>();
    const causes = new Set<string>();
    let days = 0;
    for (; days < 150 && run.pairs.length; days++) {
      // A drought: half the usual growth.
      run.scn.seasonF = 0.5;
      run.scn.monthF = 0.4;
      run.grow();
      const out = run.day();
      for (const r of out.results) for (const n of r.notes) seen.add(n.type);
      for (const x of out.deaths) causes.add(x.cause);
    }
    expect(days).toBe(150);
    expect(run.totals.deaths).toBeGreaterThan(15);
    expect(causes).toContain('poorCondition');
    expect(seen).toContain('shortOfFeed');
    expect(seen).toContain('losingWeight');
    expect(seen).toContain('lowCondition');
    expect(seen).toContain('slipped');
    // Calves died with their dams still alive: the fixed MVP fault came up,
    // was checked, and the run carried on equal.
    expect(run.driedOff).toBeGreaterThan(0);
  });
});
