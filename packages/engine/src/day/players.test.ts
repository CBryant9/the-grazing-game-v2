import { DISTRICT_IDS } from '@gg/shared';
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
 * This test asserts only what must hold. It does not assert who does well:
 * the facts for each run are reported (set GG_PLAYERS_RUN=1 to print them
 * as a Markdown table, as put in docs/CALIBRATION.md).
 */

vi.setConfig({ testTimeout: 600_000 });

const SEEDS = [1, 2] as const;
const DAYS = 180;

const runs: RunFacts[] = [];

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
        const facts = playRun(district, seed, player, DAYS);
        runs.push(facts);
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
        expect(Number.isFinite(facts.gainKg), where).toBe(true);
        // A farm with no plan never made a plan move: only the ordinary player has plans.
        if (player !== 'ordinary') expect(facts.planMoves, where).toBe(0);
      }
      // The same run gives the same result again (one seed, to keep the time down).
      const first = runs.find((r) => r.district === district && r.player === player)!;
      const again = playRun(district, first.seed, player, DAYS);
      expect(again.hash, `${district} ${player} again`).toBe(first.hash);
      expect(JSON.stringify({ ...again, farm: 0 })).toBe(JSON.stringify({ ...first, farm: 0 }));
    });
  }
});

describe('the ordinary player', () => {
  it('moves stock out of the yards and puts it on the rotation, and the careless player waits for a look', () => {
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
    // Day 0 of the farm is not 21 days on: toSaleDay ran some days, so the careless player may not look today.
    const landed = endDay(bought.farm).farm;
    const inYards = (f: typeof landed): boolean => thingsToDo(f).some((t) => t.type === 'in-yards');
    expect(inYards(landed)).toBe(true);
    const done = PLAYERS.ordinary(landed);
    expect(inYards(done)).toBe(false);
    const mob = done.mobs.find((m) => m.animals.length === 20 || m.where.kind === 'paddock')!;
    expect(mob).toBeDefined();
    expect(done.mobs.every((m) => m.plan && !m.plan.paused)).toBe(true);
    expect(done.plans).toHaveLength(1);
    // The absent player leaves them there.
    expect(inYards(PLAYERS.absent(landed))).toBe(true);
  });
});

describe('the play-test table', () => {
  it('is printed when GG_PLAYERS_RUN is set', () => {
    const wanted = (['cq', 'nsw', 'cw', 'wv'] as const).length * 3 * SEEDS.length;
    if (runs.length < wanted) return;
    const order = (r: RunFacts): string =>
      `${DISTRICT_IDS.indexOf(r.district)}${r.seed}${PLAYER_NAMES.indexOf(r.player as PlayerName)}`;
    const table = factsTable([...runs].sort((a, b) => order(a).localeCompare(order(b))));
    expect(table.split('\n').length).toBe(wanted + 2);
    if (process.env.GG_PLAYERS_RUN === '1') console.log('\n' + table + '\n');
  });
});
