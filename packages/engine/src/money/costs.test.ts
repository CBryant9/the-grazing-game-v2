import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { loadMvpWhole, mvpAnyGame } from '../../test-support/mvpWhole';
import { FARM_SIZES, farmScale } from '../data/farms';
import {
  COSTS,
  COST_PER_M,
  COW_CALF_FREIGHT,
  DIFFICULTY,
  HEAD_FEE,
  HERD_CASH_SHARE,
  INFRA_WORTH_SHARE,
  INTEREST,
  OVERHEADS,
  PASTURE_ASSET_SHARE,
  PORTABLE_RESALE_SHARE,
  SELL_COMMISSION,
  carryingCapacityAE,
  cashBase,
  overheadsPerYear,
  segmentCost,
  startMoney,
  type Difficulty,
} from './costs';

const loaded = loadMvpWhole();
const { mvp } = loaded;
mvpAnyGame(loaded);

describe('costs copied from the MVP', () => {
  it('the one-off prices are the MVP COST table', () => {
    expect({
      energiser: COSTS.energiser,
      trough: COSTS.trough,
      moveTrough: COSTS.moveTrough,
      gate: COSTS.gate,
      fix: COSTS.fixFence,
      roll: COSTS.tapeRoll,
      port: COSTS.portable,
      fill: COSTS.portableFill,
      portMove: COSTS.portableMove,
    }).toEqual({
      energiser: mvp.COST.energiser,
      trough: mvp.COST.trough,
      moveTrough: mvp.COST.moveTrough,
      gate: mvp.COST.gate,
      fix: mvp.COST.fix,
      roll: mvp.COST.roll,
      port: mvp.COST.port,
      fill: mvp.COST.fill,
      portMove: mvp.COST.portMove,
    });
  });

  it('the per-metre prices are the MVP PER_M table', () => {
    expect(COST_PER_M).toEqual({
      permanent: mvp.PER_M[1],
      electric: mvp.PER_M[2],
      tape: mvp.PER_M[3],
      pipe: mvp.PER_M.pipe,
    });
  });

  it('the figures written inside the MVP functions', () => {
    // DATA.md, Infrastructure and running costs; Market.
    expect(COSTS.fenceHubExtra).toBe(500);
    expect(COW_CALF_FREIGHT).toBe(100);
    expect(PORTABLE_RESALE_SHARE).toBe(0.5);
    expect(PASTURE_ASSET_SHARE).toBe(0.5);
    expect(INFRA_WORTH_SHARE).toBe(0.8);
    expect(INTEREST).toEqual({ overdraft: 0.095, credit: 0.03 });
    expect(OVERHEADS).toEqual({ perYear: 4000, perHaYear: 0.6 });
    expect(HERD_CASH_SHARE).toBe(0.25);
    expect(SELL_COMMISSION).toBe(mvp.SELL_COMM);
    expect(HEAD_FEE).toBe(mvp.HEAD_FEE);
  });

  it('a segment costs the MVP segCost on every farm size, rounded to a whole dollar', () => {
    const sizes = [260, ...DISTRICT_IDS.flatMap((id) => [...FARM_SIZES[id]])];
    for (const ha of sizes) {
      const scale = farmScale(ha);
      mvp.S.side = scale.sideM;
      expect(segmentCost('permanent', scale.sideM), `permanent ${ha}`).toBe(mvp.segCost(1));
      expect(segmentCost('electric', scale.sideM), `electric ${ha}`).toBe(mvp.segCost(2));
      expect(segmentCost('tape', scale.sideM), `tape ${ha}`).toBe(mvp.segCost(3));
      expect(segmentCost('pipe', scale.sideM), `pipe ${ha}`).toBe(mvp.segCost('pipe'));
      expect(Number.isInteger(segmentCost('pipe', scale.sideM))).toBe(true);
    }
    // The default farm in the docs: 260 ha, 50 m squares.
    expect(segmentCost('permanent', 50)).toBe(350);
    expect(segmentCost('electric', 50)).toBe(180);
    expect(segmentCost('tape', 50)).toBe(45);
    expect(segmentCost('pipe', 50)).toBe(240);
  });

  it('overheads are the MVP figure for the farm', () => {
    for (const ha of [260, 1000, 12000]) {
      mvp.S.farmHa = ha;
      expect(overheadsPerYear(ha)).toBe(mvp.overheads());
    }
  });
});

describe('the money a farm starts with', () => {
  it('carrying capacity and the cash base are the MVP figures for every district and size', () => {
    for (const id of DISTRICT_IDS) {
      for (const ha of [260, ...FARM_SIZES[id]]) {
        expect(carryingCapacityAE(id, ha), `${id} ${ha}`).toBe(mvp.ccAEfor(id, ha));
        expect(cashBase(id, ha), `${id} ${ha}`).toBe(mvp.cashBase(id, ha));
      }
    }
    // About 0.3 AE/ha in Central Qld (CALIBRATION.md).
    expect(carryingCapacityAE('cq', 1000) / 1000).toBeCloseTo(0.308, 2);
    // Never under $50,000, however small the block.
    expect(cashBase('cw', 100)).toBe(50000);
    expect(mvp.cashBase('cw', 100)).toBe(50000);
    expect(carryingCapacityAE('cw', 100) * 0.5 * 950).toBeLessThan(20000);
  });

  it('cash, overdraft and the bank limit are the MVP diffMoney for every choice', () => {
    expect(DIFFICULTY).toEqual(
      Object.fromEntries(
        Object.entries(mvp.DIFF).map(([k, d]) => [k, { cash: d.cash, od: d.od, broke: d.broke }]),
      ),
    );
    for (const id of DISTRICT_IDS) {
      for (const ha of FARM_SIZES[id]) {
        for (const diff of Object.keys(DIFFICULTY) as Difficulty[]) {
          for (const herd of [false, true]) {
            expect(startMoney(id, ha, diff, herd), `${id} ${ha} ${diff} ${herd}`).toEqual(
              mvp.diffMoney(id, ha, diff, herd),
            );
          }
        }
      }
    }
  });

  it('taking over a herd gives a quarter of the cash, and harder is less', () => {
    const scratch = startMoney('cq', 4000, 'medium', false);
    const herd = startMoney('cq', 4000, 'medium', true);
    expect(scratch).toEqual({ cash: 590000, overdraft: -354000, broke: -472000 });
    expect(herd.cash).toBe(148000);
    expect(herd.overdraft).toBe(scratch.overdraft);
    expect(startMoney('cq', 4000, 'easy', false).cash).toBe(1180000);
    expect(startMoney('cq', 4000, 'hard', false)).toEqual({
      cash: 266000,
      overdraft: -177000,
      broke: -236000,
    });
  });
});
