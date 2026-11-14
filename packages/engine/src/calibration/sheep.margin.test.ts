import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { managedFlockYear, type MarginYear } from '../../test-support/sheepMargin';

/*
 * SB-GM (review of the third pass, item 15): a self-replacing Merino flock
 * managed the way a gross margin budget assumes (surplus lambs and
 * cast-for-age ewes sold, replacements kept, winter feeding where the
 * district needs it; test-support/sheepMargin.ts), second year, average
 * year, seeds 7 and 8. The gross margin is sales + wool + the change in the
 * flock's worth, less buys and every variable cost the game charges
 * (shearing, crutching, animal health, ram replacement, feed).
 *
 * The source: NSW DPIRD's 2025 self-replacing 20-micron Merino gross
 * margin, $50.46 a DSE (Sheep Central, 5 August 2026, read; April to
 * September 2025 prices). The budget rates the flock at 2.32 DSE a ewe
 * joined (DPIRD's October 2024 20-micron ewe budget, search summary only),
 * so the game's margin is taken a ewe joined and divided by 2.32, the
 * budget's own DSE: the game's DSE from energy is 1.6 to 2.0 a ewe, and
 * dividing by it would compare unlike things (docs/CALIBRATION.md).
 *
 * The band is ±25% of the budget's figure, $37.85 to $63.08. Why: the same
 * budget moved from $27.81 a DSE on October 2024 prices to $50.46 on 2025
 * prices, so prices alone move it by far more than a quarter; a tighter
 * band would test the price date, not the flock. The game prices at its own
 * dated stand-ins (sheep: MLA, November 2026; wool: AWEX, September 2026).
 *
 * An open row is an expected failure named with its figure, with a
 * REGRESSION LIMIT beside it: today's figure and $5 a DSE on the side away
 * from the band.
 */

vi.setConfig({ testTimeout: 1_800_000 });

const BUDGET_PER_DSE = 50.46;
const BUDGET_DSE_PER_EWE = 2.32;
const BAND = { lo: BUDGET_PER_DSE * 0.75, hi: BUDGET_PER_DSE * 1.25 };
const SEEDS = [7, 8];

const cache = new Map<DistrictId, MarginYear[]>();
const runs = (d: DistrictId): MarginYear[] => {
  let r = cache.get(d);
  if (!r) {
    r = SEEDS.map((s) => managedFlockYear(d, s));
    cache.set(d, r);
  }
  return r;
};
/** Gross margin a ewe joined over the budget's DSE a ewe, mean of the seeds. */
const perBudgetDse = (d: DistrictId): number =>
  runs(d).reduce((t, r) => t + r.margin / r.ewes / BUDGET_DSE_PER_EWE, 0) / SEEDS.length;

const NAME: Record<string, string> = {
  nsw: 'Northern Tablelands',
  cw: 'Central West',
  wv: 'Western Victoria',
};

/** Open rows: today's figure and why. */
const GAPS: Partial<Record<DistrictId, { got: number; why: string }>> = {
  nsw: { got: 71.88, why: 'wool $59 against the budget $20: 2026 prices, a heavier and finer cut' },
  wv: { got: 90.33, why: 'wool $65 against the budget $20: 2026 prices, a heavier and finer cut' },
};

describe('SB-GM: a managed self-replacing Merino flock against the DPIRD gross margin', () => {
  for (const d of ['nsw', 'cw', 'wv'] as const) {
    const check = (): void => {
      const v = perBudgetDse(d);
      expect(v).toBeGreaterThanOrEqual(BAND.lo);
      expect(v).toBeLessThanOrEqual(BAND.hi);
    };
    const gap = GAPS[d];
    if (!gap) {
      it(`SB-GM ${NAME[d]}: $37.85 to $63.08 a budget DSE`, check);
      continue;
    }
    it.fails(
      `SB-GM ${NAME[d]}: KNOWN OPEN GAP, $${gap.got.toFixed(2)} a budget DSE (${gap.why})`,
      check,
    );
    it(`SB-GM ${NAME[d]}: REGRESSION LIMIT, no more than $${(gap.got + 5).toFixed(2)}`, () => {
      expect(perBudgetDse(d)).toBeLessThanOrEqual(gap.got + 5);
    });
  }

  it('the figures, for docs/CALIBRATION.md', () => {
    for (const d of ['nsw', 'cw', 'wv'] as const) {
      const rs = runs(d);
      const per = (k: keyof MarginYear): string =>
        (
          rs.reduce((t, r) => t + (r[k] as number) / r.ewes / BUDGET_DSE_PER_EWE, 0) / rs.length
        ).toFixed(2);
      if (process.env.GG_SHEEP_GM_PRINT === '1') {
        console.log(
          `${d}: GM ${perBudgetDse(d).toFixed(2)} a budget DSE; per budget DSE: sales ${per('sales')}, wool ${per('wool')}, stock change ${per('stockChange')}, buys ${per('buys')}, shearing ${per('shearing')}, crutching ${per('crutching')}, health ${per('health')}, rams ${per('rams')}, feed ${per('feed')}; model DSE a ewe ${(rs.reduce((t, r) => t + r.dse / r.ewes, 0) / rs.length).toFixed(2)}; GM a model DSE ${(rs.reduce((t, r) => t + r.perDse, 0) / rs.length).toFixed(2)}`,
        );
      }
      expect(rs.every((r) => r.ewes > 0 && r.dse > 0)).toBe(true);
    }
  });
});
