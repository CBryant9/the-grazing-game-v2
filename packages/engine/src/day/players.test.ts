import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  PLAYERS,
  PLAYER_NAMES,
  factsTable,
  playRun,
  type PlayerName,
  type RunFacts,
} from '../../test-support/players';
import { expectOneMobPerArea, notFinite } from '../../test-support/wholeFarm';
import { toSaleDay } from '../../test-support/workingDay';
import { thingsToDo } from './look';
import { createFarm } from '../sim/create';
import { applyAction } from './act';
import { endDay } from './days';

/*
 * The 180-day play test (BUILD_PLAN row 1.5): an absent, a careless and an
 * ordinary player each run a medium running farm in each of the four
 * districts, on two seeds, from 1 September, with random seasons. The
 * players are in test-support/players.ts, with their rules written at the
 * top of that file.
 *
 * This test asserts only what must hold. It does not assert who does well.
 * It does hold a floor against a broken run (some head left, some live
 * weight gained, and the ordinary player's plans making moves): that is a
 * check on the engine, not a judgement of any player.
 *
 * To print the facts for every run as the Markdown table in
 * docs/CALIBRATION.md, run exactly:
 *
 *   GG_PLAYERS_RUN=1 pnpm exec vitest run packages/engine/src/day/players.test.ts
 *
 * The table is written to standard output after the tests (it is also
 * shown with `--reporter=verbose`).
 */

vi.setConfig({ testTimeout: 600_000 });

const SEEDS = [1, 2] as const;
const DAYS = 180;

/** Every run is made once, in the order asked for, and kept. */
const made = new Map<string, RunFacts>();
function run(district: DistrictId, seed: number, player: PlayerName): RunFacts {
  const key = `${district}/${seed}/${player}`;
  let facts = made.get(key);
  if (!facts) {
    facts = playRun(district, seed, player, DAYS);
    made.set(key, facts);
  }
  return facts;
}

/** Every animal is in one place only: one mob, and not also on its way. */
function expectNoBeastTwice(facts: RunFacts, where: string): void {
  const seen = new Set<number>();
  const farm = facts.farm;
  for (const m of farm.mobs) {
    for (const a of m.animals) {
      expect(seen.has(a.id), `tag ${a.id} twice ${where}`).toBe(false);
      seen.add(a.id);
    }
  }
  for (const arrival of farm.arrivals) {
    for (const a of arrival.animals) {
      expect(seen.has(a.id), `tag ${a.id} on its way and on the farm ${where}`).toBe(false);
      seen.add(a.id);
    }
  }
}

describe.each(DISTRICT_IDS)('%s: 180 days with three kinds of player', (district) => {
  for (const player of PLAYER_NAMES) {
    it(`${player} player, two seeds: no error, finite, nobody in two places, the days add up`, () => {
      for (const seed of SEEDS) {
        const where = `${district} seed ${seed} ${player}`;
        const facts = run(district, seed, player);
        expect(notFinite(facts.farm), where).toEqual([]);
        expectOneMobPerArea(facts.farm, where);
        expectNoBeastTwice(facts, where);
        // The days add up, or the game ended with a reason.
        if (facts.over) {
          expect(['bank', 'feed'], where).toContain(facts.over.reason);
          expect(facts.days, where).toBeLessThanOrEqual(DAYS);
          expect(facts.farm.day, where).toBe(facts.over.day);
        } else {
          expect(facts.days, where).toBe(DAYS);
          expect(facts.farm.day, where).toBe(DAYS);
        }
        // A floor against a broken run, not a judgement of the player: there are still cattle,
        // and the live weight gained is a figure that is not exactly zero.
        expect(facts.headEnd, where).toBeGreaterThan(0);
        expect(Number.isFinite(facts.gainKg), where).toBe(true);
        expect(facts.gainKg, where).not.toBe(0);
        // Only the ordinary player has a plan. Its plans move the mobs in every run.
        if (player === 'ordinary') expect(facts.planMoves, where).toBeGreaterThan(0);
        else expect(facts.planMoves, where).toBe(0);
      }
      // The same run gives the same result again (one seed, to keep the time down).
      const first = run(district, SEEDS[0], player);
      const again = playRun(district, SEEDS[0], player, DAYS);
      expect(again.hash, `${district} ${player} again`).toBe(first.hash);
      expect(JSON.stringify({ ...again, farm: 0 })).toBe(JSON.stringify({ ...first, farm: 0 }));
    });
  }
});

describe('the ordinary player', () => {
  it('moves stock out of the yards and puts it on the rotation, and the absent player leaves it there', () => {
    const farm = createFarm({
      seed: 1,
      district: 'nsw',
      size: 'medium',
      start: { year: 2023, month: 8 },
      startType: 'running',
      difficulty: 'medium',
    });
    const sale = toSaleDay(farm);
    const bought = applyAction(sale, { type: 'buyCattle', cls: 'yearSteer', qty: 20 });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    const landed = endDay(bought.farm).farm;
    const inYards = (f: typeof landed): boolean => thingsToDo(f).some((t) => t.type === 'in-yards');
    expect(inYards(landed)).toBe(true);
    const done = PLAYERS.ordinary(landed);
    expect(inYards(done)).toBe(false);
    expect(done.mobs.every((m) => m.plan && !m.plan.paused)).toBe(true);
    expect(done.plans).toHaveLength(1);
    expect(inYards(PLAYERS.absent(landed))).toBe(true);
  });
});

describe('the play-test table', () => {
  it('has a row for every district, seed and player, and is printed when GG_PLAYERS_RUN is 1', () => {
    const rows: RunFacts[] = [];
    for (const district of DISTRICT_IDS) {
      for (const seed of SEEDS)
        for (const player of PLAYER_NAMES) rows.push(run(district, seed, player));
    }
    // A missing run fails here: there must be 4 districts x 2 seeds x 3 players.
    expect(rows).toHaveLength(DISTRICT_IDS.length * SEEDS.length * PLAYER_NAMES.length);
    const table = factsTable(rows);
    expect(table.split('\n')).toHaveLength(rows.length + 2);
    if (process.env.GG_PLAYERS_RUN === '1') process.stdout.write('\n' + table + '\n\n');
  });
});
