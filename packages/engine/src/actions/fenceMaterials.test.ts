import { describe, expect, it, vi } from 'vitest';
import { act, actWith, openFarm } from '../../test-support/wholeFarm';
import { across, down, withLightLeft, work } from '../../test-support/workingDay';
import { previewAction } from '../day/act';
import { endDay } from '../day/days';
import { EDGE, getEdge, hEdge, setEdge, cloneFences } from '../farm/topology';
import { REUSED_FENCE_SHARE, reusedSegmentCost, segmentCost } from '../money/costs';
import { infraInPlace, netWorth } from '../money/worth';
import { farmHash, loadFarm, saveFarm, type SavedFarm } from '../save/save';
import type { FarmEvent } from '../sim/events';
import type { FarmState } from '../sim/state';
import { materialsOnHand } from '../sim/summary';
import type { Action } from './types';

/*
 * Fence materials are kept (Claudia, 14 Nov 2026): "if they remove a fence,
 * they can have so many discounted fence fees because they would already
 * have some of the materials". Then, on the figure: "half price is fine".
 *
 * On the 260 ha farm used here a square is 50 m across: a segment of
 * permanent fence is $350 new and $175 from materials on hand, electric
 * $180 and $90.
 */

vi.setConfig({ testTimeout: 600_000 });

const P = 350;
const E = 180;

/** A farm with a run of permanent fence put up and taken down: `n` segments of permanent on hand. */
function withPermanentOnHand(n: number): FarmState {
  let farm = openFarm('nsw');
  farm = act(farm, { type: 'buildFence', edges: across(3, 1, n), fence: 'permanent' });
  return act(farm, { type: 'removeFence', edges: across(3, 1, n) });
}

const detailOf = (events: readonly FarmEvent[]): Record<string, unknown> => {
  const e = events.find((x) => x.type === 'layout-job');
  return e?.type === 'layout-job' ? e.detail : {};
};

describe('the figure', () => {
  it('a metre from materials on hand is half the price of a new one', () => {
    expect(REUSED_FENCE_SHARE).toBe(0.5);
    expect(segmentCost('permanent', 50)).toBe(P);
    expect(reusedSegmentCost('permanent', 50)).toBe(175);
    expect(reusedSegmentCost('electric', 50)).toBe(90);
  });
});

describe('taking fence down keeps its materials', () => {
  it('permanent and electric are kept by the metre and by kind, and the result says so', () => {
    let farm = openFarm('nsw');
    expect(materialsOnHand(farm)).toEqual({ permanentM: 0, electricM: 0, tapeM: 0 });
    farm = act(farm, { type: 'buildFence', edges: across(3, 1, 4), fence: 'permanent' });
    farm = act(farm, { type: 'buildFence', edges: across(5, 1, 3), fence: 'electric' });
    farm = act(farm, { type: 'buildFence', edges: across(7, 1, 2), fence: 'tape' });
    const out = actWith(farm, {
      type: 'removeFence',
      edges: [...across(3, 1, 4), ...across(5, 1, 3), ...across(7, 1, 2)],
    });
    expect(out.farm.layout.fenceOnHand).toEqual({ permanent: 4, electric: 3 });
    expect(materialsOnHand(out.farm)).toEqual({ permanentM: 200, electricM: 150, tapeM: 100 });
    expect(detailOf(out.events)).toMatchObject({
      segments: 9,
      keptPermanentM: 200,
      keptElectricM: 150,
      permanentOnHandM: 200,
      electricOnHandM: 150,
      tapeToRollM: 100,
    });
    // Pulling down is still free apart from the tape fee, and the ledger entries go.
    expect(farm.cash - out.farm.cash).toBe(10);
    expect(out.farm.ledger.edges).toEqual({});
  });

  it('knocked-down electric fence is kept as electric; gates and tape are not fence materials', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: across(3, 1, 4), fence: 'electric' });
    farm = act(farm, { type: 'placeGate', edge: hEdge(3, 4) });
    const fences = cloneFences(farm.layout.fences);
    setEdge(fences, hEdge(3, 1), EDGE.electricDown);
    farm = { ...farm, layout: { ...farm.layout, fences } };
    const out = actWith(farm, { type: 'removeFence', edges: across(3, 1, 4) });
    // Three of electric (one knocked down) are kept. The gate is not.
    expect(out.farm.layout.fenceOnHand).toEqual({ permanent: 0, electric: 3 });
    expect(out.farm.layout.tapeOnRoll).toBe(0);
  });

  it('fence built over by another kind is gone, not kept (the builder’s rule)', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: across(3, 1, 4), fence: 'electric' });
    farm = act(farm, { type: 'buildFence', edges: across(3, 1, 4), fence: 'permanent' });
    expect(farm.layout.fenceOnHand).toEqual({ permanent: 0, electric: 0 });
  });

  it('the time to take fence down is unchanged', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: across(3, 1, 6), fence: 'permanent' });
    const card = work(farm, { type: 'removeFence', edges: across(3, 1, 6) }).job;
    // A whole day's light builds 500 m of permanent fence, and taking it out takes as long.
    expect(card.workMin).toBeCloseTo((card.dayMin * 300) / 500, 9);
  });
});

describe('putting fence up uses the materials on hand first, at half price', () => {
  it('a line longer than the materials: half price for what is on hand, full price for the rest', () => {
    const farm = withPermanentOnHand(4);
    const worth = netWorth(farm);
    const out = actWith(farm, { type: 'buildFence', edges: across(9, 1, 6), fence: 'permanent' });
    const f = out.farm;
    expect(farm.cash - f.cash).toBe(4 * 175 + 2 * P);
    expect(f.layout.fenceOnHand.permanent).toBe(0);
    // The ledger records what was spent on what is standing: half for the reused segments.
    expect(Object.values(f.ledger.edges).sort((a, b) => a - b)).toEqual([175, 175, 175, 175, P, P]);
    // The year's spending: the first line at full price, then this one.
    expect(f.year.infra).toBe(4 * P + (4 * 175 + 2 * P));
    expect(infraInPlace(f)).toBe(4 * 175 + 2 * P);
    // Materials on hand count for nothing in net worth, so building from them moves it by
    // what was paid less the 80% of it that counts.
    expect(netWorth(f)).toBeCloseTo(worth - (4 * 175 + 2 * P) * 0.2, 6);
    expect(detailOf(out.events)).toMatchObject({
      fence: 'permanent',
      segments: 6,
      metres: 300,
      fromStockM: 200,
      stockSaving: 4 * 175,
      onHandM: 0,
    });
  });

  it('the materials go to the first segments in the order drawn', () => {
    const farm = withPermanentOnHand(2);
    // Drawn right to left.
    const edges = across(9, 1, 5).reverse();
    const f = act(farm, { type: 'buildFence', edges, fence: 'permanent' });
    expect(f.ledger.edges['h' + edges[0]!.index]).toBe(175);
    expect(f.ledger.edges['h' + edges[1]!.index]).toBe(175);
    for (const e of edges.slice(2)) expect(f.ledger.edges['h' + e.index]).toBe(P);
  });

  it('a short line leaves the rest on hand for later', () => {
    const farm = withPermanentOnHand(5);
    const f = act(farm, { type: 'buildFence', edges: across(9, 1, 2), fence: 'permanent' });
    expect(farm.cash - f.cash).toBe(2 * 175);
    expect(f.layout.fenceOnHand.permanent).toBe(3);
    const g = act(f, { type: 'buildFence', edges: across(11, 1, 4), fence: 'permanent' });
    expect(f.cash - g.cash).toBe(3 * 175 + P);
    expect(g.layout.fenceOnHand.permanent).toBe(0);
  });

  it('each kind uses only its own materials', () => {
    const farm = withPermanentOnHand(4);
    const f = act(farm, { type: 'buildFence', edges: across(9, 1, 3), fence: 'electric' });
    // The first electric fence buys the energiser, and none of the permanent is used.
    expect(farm.cash - f.cash).toBe(3 * E + 900);
    expect(f.layout.fenceOnHand).toEqual({ permanent: 4, electric: 0 });
    // Tape is unchanged: it never uses fence materials.
    const t = act(f, { type: 'buildFence', edges: across(11, 1, 3), fence: 'tape' });
    expect(f.cash - t.cash).toBe(3 * 45);
    expect(t.layout.fenceOnHand).toEqual({ permanent: 4, electric: 0 });
  });

  it('the energiser rule is not affected: bought once, with the first electric fence built', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: across(3, 1, 3), fence: 'electric' });
    expect(farm.energiser).toBe(true);
    farm = act(farm, { type: 'removeFence', edges: across(3, 1, 3) });
    const f = act(farm, { type: 'buildFence', edges: across(9, 1, 4), fence: 'electric' });
    expect(farm.cash - f.cash).toBe(3 * 90 + E);
    expect(f.ledger.energiser).toBe(900);
    // A farm with electric on hand and no energiser (only possible by hand) still buys one.
    const odd = { ...farm, energiser: false };
    const g = act(odd, { type: 'buildFence', edges: across(9, 1, 2), fence: 'electric' });
    expect(odd.cash - g.cash).toBe(2 * 90 + 900);
  });

  it('a reused segment taken down again comes off the ledger at what it cost', () => {
    const farm = withPermanentOnHand(2);
    const f = act(farm, { type: 'buildFence', edges: across(9, 1, 2), fence: 'permanent' });
    expect(infraInPlace(f)).toBe(2 * 175);
    const g = act(f, { type: 'removeFence', edges: across(9, 1, 2) });
    expect(infraInPlace(g)).toBe(0);
    expect(g.layout.fenceOnHand.permanent).toBe(2);
  });

  it('the time to put fence up is unchanged', () => {
    const fresh = openFarm('nsw');
    const reuse = withPermanentOnHand(6);
    const job: Action = { type: 'buildFence', edges: across(9, 1, 6), fence: 'permanent' };
    const a = work(fresh, job).job;
    const b = work(reuse, job).job;
    expect(b.workMin).toBeCloseTo(a.workMin, 9);
    expect(b.cost).toBe(a.cost / 2);
  });
});

describe('the job card', () => {
  it('says how many metres come from materials on hand and what that saves, and agrees with the result', () => {
    const farm = withPermanentOnHand(3);
    const job: Action = { type: 'buildFence', edges: across(9, 1, 5), fence: 'permanent' };
    const done = work(farm, job);
    const preview = previewAction(farm, job);
    expect(preview).toEqual({ ok: true, card: done.job });
    expect(done.job.fenceMaterials).toEqual({
      fence: 'permanent',
      onHandM: 150,
      fromStockM: 150,
      saving: 3 * 175,
      fromStockTodayM: 150,
      savingToday: 3 * 175,
      onHandAfterM: 0,
    });
    expect(done.job.cost).toBe(3 * 175 + 2 * P);
    expect(done.job.costToday).toBe(farm.cash - done.farm.cash);
    expect(done.farm.layout.fenceOnHand.permanent).toBe(0);
  });

  it('a line cut short uses the materials along the line in the order drawn, and charges the part that fits', () => {
    // Permanent fence is 500 m in a whole day: four segments fit in two fifths of it.
    const base = withPermanentOnHand(3);
    const day = base.clock.lastLight - base.clock.firstLight;
    const farm = withLightLeft(base, (day * 200) / 500 + 1);
    const job: Action = { type: 'buildFence', edges: across(9, 1, 8), fence: 'permanent' };
    const done = work(farm, job);
    expect(done.job.outcome).toBe('part');
    expect(done.job.line!.fits.pieces.length).toBe(4);
    // The whole line: three from materials on hand and five new.
    expect(done.job.cost).toBe(3 * 175 + 5 * P);
    // Today: the first four drawn, three of them from materials on hand.
    expect(done.job.costToday).toBe(3 * 175 + P);
    expect(farm.cash - done.farm.cash).toBe(3 * 175 + P);
    expect(done.job.fenceMaterials).toMatchObject({
      fromStockM: 150,
      saving: 3 * 175,
      fromStockTodayM: 150,
      savingToday: 3 * 175,
      onHandAfterM: 0,
    });
    expect(previewAction(farm, job)).toEqual({ ok: true, card: done.job });
  });

  it('when the materials outrun the part that fits, what is not used stays on hand', () => {
    const base = withPermanentOnHand(6);
    const day = base.clock.lastLight - base.clock.firstLight;
    const farm = withLightLeft(base, (day * 200) / 500 + 1);
    const done = work(farm, { type: 'buildFence', edges: across(9, 1, 8), fence: 'permanent' });
    expect(done.job.fenceMaterials).toMatchObject({
      onHandM: 300,
      fromStockM: 300,
      fromStockTodayM: 200,
      savingToday: 4 * 175,
      onHandAfterM: 100,
    });
    expect(done.job.costToday).toBe(4 * 175);
    expect(done.farm.layout.fenceOnHand.permanent).toBe(2);
  });

  it('taking fence down: the card says what was kept and what is on hand', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: down(5, 2, 5), fence: 'electric' });
    const done = work(farm, { type: 'removeFence', edges: down(5, 2, 5) });
    expect(done.job.materialsKept).toEqual({
      permanentM: 0,
      electricM: 200,
      permanentOnHandM: 0,
      electricOnHandM: 200,
    });
    expect(done.job.fenceMaterials).toBeUndefined();
    // A tape job has neither.
    const tape = work(farm, { type: 'buildFence', edges: across(9, 1, 2), fence: 'tape' }).job;
    expect(tape.fenceMaterials).toBeUndefined();
  });
});

describe('saves', () => {
  it('save, load and carry on is the same as running straight through', () => {
    const farm = withPermanentOnHand(5);
    const job: Action = { type: 'buildFence', edges: across(9, 1, 3), fence: 'permanent' };
    const straight = endDay(work(farm, job).farm).farm;
    const loaded = loadFarm(JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm);
    expect(loaded.layout.fenceOnHand).toEqual({ permanent: 5, electric: 0 });
    const carried = endDay(work(loaded, job).farm).farm;
    expect(farmHash(carried)).toBe(farmHash(straight));
    expect(straight.layout.fenceOnHand.permanent).toBe(2);
  });

  it('the materials on hand are in the hash', () => {
    const a = withPermanentOnHand(2);
    const b = { ...a, layout: { ...a.layout, fenceOnHand: { permanent: 3, electric: 0 } } };
    expect(farmHash(a)).not.toBe(farmHash(b));
  });

  it('a save from before materials were kept loads with none on hand, and plays on', () => {
    const farm = openFarm('nsw');
    const old = JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm;
    delete (old.layout as Record<string, unknown>).fenceOnHand;
    old.saveFormat = 6;
    const loaded = loadFarm(old);
    expect(loaded.layout.fenceOnHand).toEqual({ permanent: 0, electric: 0 });
    expect(farmHash(loaded)).toBe(farmHash(farm));
    const f = act(loaded, { type: 'buildFence', edges: across(3, 1, 2), fence: 'permanent' });
    expect(loaded.cash - f.cash).toBe(2 * P);
    expect(getEdge(f.layout.fences, hEdge(3, 1))).toBe(EDGE.permanent);
  });
});
