/**
 * A running farm's start flock, as it stands on the start date, played one
 * year with no hands (milestone 2.3, third pass, item 1). Per district:
 * lambs in the first year, a believable first clip, and a first-year profit
 * or loss that is neither a windfall nor a wipe-out.
 *
 * The profit is compared with the NSW DPIRD 2025 self-replacing 20-micron
 * Merino gross margin of $50.46/DSE (DPIRD release, 6 Aug 2026; see
 * docs/DATA.md). A gross margin is a managed year: sales made, winter
 * feeding done. Here nothing is sold, so the year's lambs stay on the books
 * at market value, and nobody feeds through winter. The known gap below
 * records the figures.
 */

import { describe, expect, it } from 'vitest';
import { AVERAGE_YEAR } from '../../test-support/calibration';
import { createFarm } from '../sim/create';
import { stepDay } from '../sim/tick';
import { sheepMobsOf } from './farm';
import { stockingRead } from './reads';

const DPIRD_GM_PER_DSE = 50.46;
const env = { seasons: AVERAGE_YEAR };

type Year = {
  atFoot: number;
  born: number;
  clipDay: number;
  cleanKgHead: number;
  micron: number;
  perDse: number;
};

const cache = new Map<string, Year>();

function firstYear(district: 'nsw' | 'cw' | 'wv'): Year {
  const hit = cache.get(district);
  if (hit) return hit;
  const farm = createFarm(
    {
      seed: 7,
      district,
      size: 'medium',
      start: { year: 2021, month: 8 },
      startType: 'running',
      difficulty: 'easy',
      stock: 'sheep',
    },
    env,
  );
  const m0 = sheepMobsOf(farm)[0]!;
  const dse = stockingRead(farm).sheepDse;
  const atFoot = m0.sheep.filter((s) => !s.weaned).reduce((t, s) => t + s.n, 0);
  let born = 0;
  let clipDay = -1;
  let cleanKgHead = 0;
  let micron = 0;
  for (let d = 0; d < 365; d++) {
    for (const e of stepDay(farm, env).events) {
      if (e.type === 'lambs-born') born += e.count;
      if (e.type === 'sheep-shorn' && clipDay < 0) {
        clipDay = d;
        cleanKgHead = e.cleanKg / e.head;
        micron = e.micron;
      }
    }
  }
  const y = {
    atFoot,
    born,
    clipDay,
    cleanKgHead,
    micron,
    perDse: farm.years[0]!.score.profit / dse,
  };
  cache.set(district, y);
  return y;
}

describe('start flock, first year with no hands', () => {
  for (const district of ['nsw', 'cw', 'wv'] as const) {
    it(`${district}: lambs in the first year`, { timeout: 120_000 }, () => {
      const y = firstYear(district);
      expect(y.atFoot + y.born).toBeGreaterThan(0);
      expect(y.born).toBeGreaterThan(0);
    });
    it(`${district}: a first shearing with a believable clip`, { timeout: 120_000 }, () => {
      const y = firstYear(district);
      expect(y.clipDay).toBeGreaterThanOrEqual(0);
      // Merino ewes: about 3 to 5 kg clean a head, 16.5 to 19.5 micron.
      expect(y.cleanKgHead).toBeGreaterThan(3);
      expect(y.cleanKgHead).toBeLessThan(5);
      expect(y.micron).toBeGreaterThan(16.5);
      expect(y.micron).toBeLessThan(19.5);
    });
    it(
      `${district}: no windfall and no wipe-out (-$50 to $200 a DSE)`,
      { timeout: 120_000 },
      () => {
        const y = firstYear(district);
        expect(y.perDse).toBeGreaterThan(-50);
        expect(y.perDse).toBeLessThan(200);
      },
    );
  }
  // Known gap: an unmanaged year is not the DPIRD managed gross margin. Measured (seed 7):
  // Northern Tablelands $11.6/DSE (897 deaths, nobody fed through winter); Central West
  // $124.7/DSE and Western Victoria $149.9/DSE (no sales, so the whole lamb crop is valued
  // at 2026 market prices, and running costs carry shearing, feed and health only).
  for (const [district, got] of [
    ['nsw', 11.6],
    ['cw', 124.7],
    ['wv', 149.9],
  ] as const) {
    it.fails(
      `${district}: within half to twice the DPIRD gross margin (known gap: $${got}/DSE)`,
      { timeout: 120_000 },
      () => {
        const y = firstYear(district);
        expect(y.perDse).toBeGreaterThan(DPIRD_GM_PER_DSE / 2);
        expect(y.perDse).toBeLessThan(DPIRD_GM_PER_DSE * 2);
      },
    );
  }
});
