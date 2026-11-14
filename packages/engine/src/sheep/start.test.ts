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
import { START_FLOCK } from '../data/sheep';

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

/** A start flock on the 1st of a month, as the setup builds it. */
function startFlock(district: 'nsw' | 'cw' | 'wv', month: number) {
  const farm = createFarm(
    {
      seed: 7,
      district,
      size: 'medium',
      start: { year: 2021, month },
      startType: 'running',
      difficulty: 'easy',
      stock: 'sheep',
    },
    env,
  );
  return { farm, mob: sheepMobsOf(farm)[0]! };
}

describe('the start flock is the flock the model would have on that date (review, item 6)', () => {
  it('keeps only the ewe weaners it needs as replacements (Western Victoria, 1 March)', () => {
    const { mob } = startFlock('wv', 2);
    const eweWeaners = mob.sheep
      .filter((s) => s.sex === 'F' && s.weaned && s.age < 365)
      .reduce((t, s) => t + s.n, 0);
    // One age class: the hoggets (last year's drop, kept the same way) are one class.
    const hoggets = mob.sheep
      .filter((s) => s.sex === 'F' && s.age >= 365 && s.age < 730 && s.parity === 0 && s.preg < 0)
      .reduce((t, s) => t + s.n, 0);
    expect(eweWeaners).toBeGreaterThan(0);
    expect(eweWeaners).toBeLessThanOrEqual(Math.ceil(hoggets * 1.05));
  });

  it('casts the oldest ewes for age once their lambs are weaned, whatever the start month', () => {
    // Joined last at 5.5 years, cast at weaning: never older than 6.25 years on the farm, and
    // none over the cast-for-age age once that season's lambs are weaned.
    for (const district of ['nsw', 'cw', 'wv'] as const) {
      for (const month of [0, 3, 6, 9, 11]) {
        const { mob } = startFlock(district, month);
        const oldest = Math.max(...mob.sheep.filter((s) => s.sex === 'F').map((s) => s.age));
        expect(oldest / 365).toBeLessThanOrEqual(START_FLOCK.castForAge + 0.25);
        if (mob.join!.weaned >= 0) expect(oldest / 365).toBeLessThan(START_FLOCK.castForAge);
      }
    }
  });

  it('carries about the lambs at foot the model marks per ewe joined (Central West, 1 September)', () => {
    // The model's own Central West Merino flock marks 87.4 lambs a 100 ewes joined (8 seeds,
    // review of the third pass); the start flock is built from the same rules at the CS the
    // model lambs at, so it sits within 5 points of it (before: 101).
    const { mob } = startFlock('cw', 8);
    const lambs = mob.sheep.filter((s) => !s.weaned).reduce((t, s) => t + s.n, 0);
    const joined = mob.join!.joined;
    expect(Math.abs((lambs / joined) * 100 - 87.4)).toBeLessThanOrEqual(5);
  });

  it('mid-joining, the ewes that came on heat before the first day are already in lamb (Tablelands, 1 May)', () => {
    const { mob } = startFlock('nsw', 4);
    const ewes = mob.join!.joined;
    const inLamb = mob.sheep.filter((s) => s.preg >= 0).reduce((t, s) => t + s.n, 0);
    // 24 days into a 35-day joining: most ewes have had a heat (about 60 to 65% conceive on it).
    expect(inLamb / ewes).toBeGreaterThan(0.5);
  });
});

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
  }
  // An unmanaged first year is not the DPIRD managed gross margin; the managed flock is
  // benchmarked in calibration/sheep.margin.test.ts. Measured here (seed 7, review of the third
  // pass): Northern Tablelands $5.37/DSE (885 deaths, nobody fed through winter); Central
  // West $44.28/DSE (inside); Western Victoria $135.74/DSE (no sales, so the whole lamb crop is
  // valued at 2026 market prices). Open rows are expected failures, each with a REGRESSION
  // LIMIT beside it: today's figure and $10 a DSE on the side away from the band.
  const GAP: Partial<Record<'nsw' | 'cw' | 'wv', { got: number; worse: 'up' | 'down' }>> = {
    nsw: { got: 5.37, worse: 'down' },
    wv: { got: 135.74, worse: 'up' },
  };
  for (const district of ['nsw', 'cw', 'wv'] as const) {
    const gap = GAP[district];
    const check = (): void => {
      const y = firstYear(district);
      expect(y.perDse).toBeGreaterThan(DPIRD_GM_PER_DSE / 2);
      expect(y.perDse).toBeLessThan(DPIRD_GM_PER_DSE * 2);
    };
    if (!gap) {
      it(`${district}: within half to twice the DPIRD gross margin`, { timeout: 120_000 }, check);
      continue;
    }
    it.fails(
      `${district}: within half to twice the DPIRD gross margin (known gap: $${gap.got}/DSE)`,
      { timeout: 120_000 },
      check,
    );
    const bound = gap.worse === 'up' ? gap.got + 10 : gap.got - 10;
    it(
      `${district}: REGRESSION LIMIT, ${gap.worse === 'up' ? 'no more' : 'no less'} than $${bound.toFixed(2)}/DSE`,
      { timeout: 120_000 },
      () => {
        const y = firstYear(district);
        if (gap.worse === 'up') expect(y.perDse).toBeLessThanOrEqual(bound);
        else expect(y.perDse).toBeGreaterThanOrEqual(bound);
      },
    );
  }
});
