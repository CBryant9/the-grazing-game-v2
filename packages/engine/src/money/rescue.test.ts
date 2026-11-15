import { describe, expect, it } from 'vitest';
import { endDay, skipDays } from '../day/days';
import { netSaleValue } from '../market/prices';
import { farmHash, loadFarm, saveFarm } from '../save/save';
import { sheepIndicatorsOf, sheepWorth } from '../sheep/market';
import { createFarm, type CreateFarmOptions } from '../sim/create';
import { pricesOf } from '../sim/derived';
import { cloneFarm, type FarmState } from '../sim/state';
import { SAVE_FORMAT_VERSION } from '../version';
import { startMoney } from './costs';
import { rescueFarm, rescueTerms } from './rescue';

/*
 * Paying to keep going (PRD 10.3): the rescue of a farm whose game is over. Stock sold to clear
 * the debt, cash set to the hard-difficulty starting cash (or what the sale left, if more), the
 * farm open again, once for each purchase.
 */

const base: CreateFarmOptions = {
  seed: 3,
  district: 'wv',
  size: 'small',
  start: { year: 2023, month: 8 },
  startType: 'running',
  difficulty: 'medium',
  stock: 'mix',
};

/** A running farm with cattle and sheep that the bank has just taken. */
function brokeFarm(): FarmState {
  const farm = cloneFarm(createFarm(base));
  farm.cash = farm.broke + 1;
  const run = skipDays(farm, 'week');
  expect(run.farm.over?.reason).toBe('bank');
  return run.farm;
}

const head = (f: FarmState): { cattle: number; sheep: number } => ({
  cattle: f.mobs.reduce((n, m) => n + m.animals.length, 0),
  sheep: (f.sheep?.mobs ?? []).reduce(
    (n, m) => n + m.sheep.reduce((k, s) => k + (s.dead ? 0 : s.n), 0),
    0,
  ),
});

describe('a rescue', () => {
  it('sells every head to pay the debt, sets cash to the hard starting cash, and opens the farm again', () => {
    const over = brokeFarm();
    const before = farmHash(over);
    const stock = head(over);
    expect(stock.cattle).toBeGreaterThan(0);
    expect(stock.sheep).toBeGreaterThan(0);
    const terms = rescueTerms(over);
    // What the stock fetched: the figures net worth uses.
    const prices = pricesOf(over);
    let value = 0;
    for (const m of over.mobs)
      for (const a of m.animals) value += Math.max(0, netSaleValue(a, prices));
    value += sheepWorth(over.sheep!.mobs, sheepIndicatorsOf(over));
    expect(terms).toMatchObject({
      cattleSold: stock.cattle,
      sheepSold: stock.sheep,
      stockValue: Math.round(value),
      debt: -Math.round(over.cash),
      hardStartCash: startMoney('wv', over.layout.scale.farmHa, 'hard', false).cash,
    });
    // The debt is more than the stock fetched, so cash is the hard starting cash.
    expect(Math.round(over.cash) + terms.stockValue).toBeLessThan(terms.hardStartCash);
    expect(terms.cashAfter).toBe(terms.hardStartCash);

    const r = rescueFarm(over, { purchaseId: 'p-1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.already).toBe(false);
    expect(r.terms).toEqual(terms);
    expect(farmHash(over)).toBe(before);
    expect(head(r.farm)).toEqual({ cattle: 0, sheep: 0 });
    expect(r.farm.cash).toBe(terms.cashAfter);
    expect(r.farm.over).toBeNull();
    expect(r.farm.noFeedDays).toBe(0);
    expect(r.farm.saleBookings).toEqual([]);
    expect(r.farm.day).toBe(over.day);
    expect(r.farm.rescues).toEqual([{ purchaseId: 'p-1', day: over.over!.day, terms }]);
    // Nothing else changes: the land, the fences, the plans and the year are as they were.
    expect(r.farm.layout).toEqual(over.layout);
    expect(r.farm.pasture).toEqual(over.pasture);
    expect(r.farm.plans).toEqual(over.plans);
    expect(r.farm.year).toEqual(over.year);
    expect(r.farm.clock).toEqual(over.clock);
    // And it plays on.
    const next = endDay(r.farm);
    expect(next.day.ran).toBe(true);
    expect(next.farm.over).toBeNull();
    expect(next.farm.day).toBe(over.day + 1);
  });

  it('the hard starting cash is what a hard farm of the same district and size starts with', () => {
    const terms = rescueTerms(brokeFarm());
    const hard = createFarm({
      ...base,
      startType: 'scratch',
      difficulty: 'hard',
      stock: undefined,
    });
    expect(terms.hardStartCash).toBe(hard.cash);
  });

  it('is done once for each purchase: the same purchase again changes nothing', () => {
    const r = rescueFarm(brokeFarm(), { purchaseId: 'p-1' });
    if (!r.ok) throw new Error(r.message);
    const again = rescueFarm(r.farm, { purchaseId: 'p-1' });
    expect(again).toMatchObject({ ok: true, already: true, terms: r.terms });
    if (!again.ok) return;
    expect(farmHash(again.farm)).toBe(farmHash(r.farm));
    // A different purchase on a farm that is playing is refused, with a reason.
    expect(rescueFarm(r.farm, { purchaseId: 'p-2' })).toMatchObject({
      ok: false,
      reason: 'not-over',
    });
  });

  it('a farm can be rescued again after a second game over, each rescue recorded', () => {
    const first = rescueFarm(brokeFarm(), { purchaseId: 'p-1' });
    if (!first.ok) throw new Error(first.message);
    const f = cloneFarm(first.farm);
    f.cash = f.broke + 1;
    const run = skipDays(f, 'week');
    expect(run.farm.over?.reason).toBe('bank');
    const second = rescueFarm(run.farm, { purchaseId: 'p-2' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.farm.rescues!.map((x) => x.purchaseId)).toEqual(['p-1', 'p-2']);
    expect(second.terms).toMatchObject({ cattleSold: 0, sheepSold: 0, stockValue: 0 });
  });

  it('keeps what the sale raised when that is more than the hard starting cash', () => {
    // Eaten out with money in the bank: no debt, and the stock fetches a lot.
    const farm = cloneFarm(createFarm(base));
    farm.cash = 400_000;
    farm.pasture.G.fill(0);
    farm.pasture.D.fill(0);
    const run = skipDays(farm, 'month');
    expect(run.farm.over?.reason).toBe('feed');
    const terms = rescueTerms(run.farm);
    expect(terms.debt).toBe(0);
    expect(terms.cashAfter).toBe(Math.round(run.farm.cash) + terms.stockValue);
    expect(terms.cashAfter).toBeGreaterThan(terms.hardStartCash);
    const r = rescueFarm(run.farm, { purchaseId: 'p-9' });
    if (!r.ok) throw new Error(r.message);
    expect(r.farm.cash).toBe(terms.cashAfter);
    expect(r.farm.noFeedDays).toBe(0);
  });

  it('refuses a farm that is still playing, and a missing purchase', () => {
    const farm = createFarm(base);
    expect(rescueFarm(farm, { purchaseId: 'p-1' })).toMatchObject({
      ok: false,
      reason: 'not-over',
    });
    expect(rescueFarm(brokeFarm(), { purchaseId: '' })).toMatchObject({
      ok: false,
      reason: 'bad-purchase',
    });
  });

  it('saves and loads with its rescues (format 13); a farm never rescued saves as before', () => {
    const r = rescueFarm(brokeFarm(), { purchaseId: 'p-1' });
    if (!r.ok) throw new Error(r.message);
    const saved = saveFarm(r.farm);
    expect(saved.saveFormat).toBe(SAVE_FORMAT_VERSION);
    expect(SAVE_FORMAT_VERSION).toBe(13);
    const loaded = loadFarm(JSON.parse(JSON.stringify(saved)));
    expect(loaded.rescues).toEqual(r.farm.rescues);
    expect(farmHash(loaded)).toBe(farmHash(r.farm));
    // The same purchase on the loaded farm still changes nothing.
    expect(rescueFarm(loaded, { purchaseId: 'p-1' })).toMatchObject({ ok: true, already: true });
    expect('rescues' in saveFarm(createFarm(base))).toBe(false);
    // A format 12 save (no rescues) loads with none.
    const old = { ...saveFarm(createFarm(base)), saveFormat: 12 };
    expect(loadFarm(old).rescues).toBeUndefined();
  });
});
