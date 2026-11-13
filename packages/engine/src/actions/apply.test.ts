import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  PLENTY,
  act,
  actWith,
  openFarm,
  refused,
  twoPaddockFarm,
} from '../../test-support/wholeFarm';
import { classOf } from '../cattle/animal';
import type { Animal } from '../cattle/types';
import { GRID_N } from '../grid';
import { buyPrice, netSaleValue, saleValue } from '../market/prices';
import { farmHash } from '../save/save';
import { createFarm } from '../sim/create';
import { pricesOf, surveyOf } from '../sim/derived';
import { cloneFarm, type FarmMob, type FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { MAX_BUY, applyAction } from './apply';
import type { Action } from './types';

/*
 * Every action a player can take: what it costs, what it changes, what it
 * reports and when it is refused. The MVP faults in BUILD_PLAN 2.4 are
 * tested here as the rules they now are.
 */

vi.setConfig({ testTimeout: 600_000 });

const mobOf = (farm: FarmState, id: number): FarmMob => farm.mobs.find((m) => m.id === id)!;
const everyone = (farm: FarmState): Animal[] => farm.mobs.flatMap((m) => m.animals);
/** A farm the bank will lend exactly `room` dollars more to. */
const withRoom = (farm: FarmState, room: number): FarmState => {
  const f = cloneFarm(farm);
  f.cash = f.overdraft + room;
  return f;
};

// ---------------------------------------------------------------------------
describe('buying cattle', () => {
  it('costs each beast its value, plus $30 a head, plus $100 for each cow and calf unit', () => {
    let farm = openFarm('nsw');
    const bore = farm.layout.water.bore;
    const prices = pricesOf(farm);
    const cash = farm.cash;
    const out = actWith(farm, { type: 'buyCattle', cls: 'cowCalf', qty: 12, to: { cell: bore } });
    farm = out.farm;
    const all = everyone(farm);
    const cows = all.filter((a) => a.kind === 'cow');
    const calves = all.filter((a) => a.kind === 'calf');
    expect([cows.length, calves.length]).toEqual([12, 12]);
    let total = 0;
    for (const a of cows) {
      expect(a.paid).toBe(saleValue(a, prices) + 30 + 100);
      total += a.paid;
    }
    for (const c of calves) {
      // The freight is on the unit, not on the calf.
      expect(c.paid).toBe(saleValue(c, prices));
      total += c.paid;
    }
    for (const a of all) expect(a.cost).toBe(a.paid);
    expect(cash - farm.cash).toBeCloseTo(total, 6);
    expect(farm.year.buys).toBeCloseTo(total, 6);
    expect(out.events[0]).toMatchObject({
      type: 'cattle-bought',
      cls: 'cowCalf',
      qty: 12,
      total: farm.year.buys,
      indicator: prices.indicator,
      mob: farm.mobs[0]!.id,
      mobName: 'Mob 1',
    });
  });

  it('prices bulls by the head: $5,500 at an indicator of 400, whatever they weigh', () => {
    let farm = openFarm('nsw');
    const prices = pricesOf(farm);
    const cash = farm.cash;
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'bull',
      qty: 3,
      to: { cell: farm.layout.water.bore },
    });
    const each = (5500 * prices.indicator) / 400;
    for (const a of everyone(farm)) {
      expect(a.paid).toBe(each + 30);
      expect(buyPrice(a, prices)).toBe(each);
    }
    expect(new Set(everyone(farm).map((a) => a.wt)).size).toBe(3);
    expect(cash - farm.cash).toBeCloseTo(3 * (each + 30), 6);
  });

  it('other classes cost their sale value plus $30 a head', () => {
    for (const cls of [
      'weanerSteer',
      'yearSteer',
      'weanerHeifer',
      'joinHeifer',
      'dryCow',
      'ptic',
    ] as const) {
      let farm = openFarm('cw');
      const prices = pricesOf(farm);
      const cash = farm.cash;
      farm = act(farm, { type: 'buyCattle', cls, qty: 7, to: { cell: farm.layout.water.bore } });
      let total = 0;
      for (const a of everyone(farm)) {
        expect(a.paid, cls).toBe(saleValue(a, prices) + 30);
        total += a.paid;
      }
      expect(cash - farm.cash, cls).toBeCloseTo(total, 6);
      expect(everyone(farm).length).toBe(7);
    }
  });

  it.each(DISTRICT_IDS)('%s: a new mob starts on a lick in Central Qld only', (id) => {
    const farm = act(openFarm(id), {
      type: 'buyCattle',
      cls: 'weanerSteer',
      qty: 5,
      to: { cell: openFarm(id).layout.water.bore },
    });
    expect(farm.mobs[0]!.supp).toBe(id === 'cq' ? 'lick' : 'none');
  });

  it('goes into the mob that is already in the area, or straight into a named mob', () => {
    let farm = openFarm('nsw');
    const bore = farm.layout.water.bore;
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 20, to: { cell: bore } });
    const mob = farm.mobs[0]!.id;
    const second = actWith(farm, {
      type: 'buyCattle',
      cls: 'weanerSteer',
      qty: 5,
      to: { cell: 3 },
    });
    farm = second.farm;
    expect(farm.mobs.length).toBe(1);
    expect(farm.mobs[0]!.id).toBe(mob);
    expect(farm.mobs[0]!.animals.length).toBe(25);
    expect(second.events.map((e) => e.type)).toEqual(['mobs-joined', 'cattle-bought']);
    expect(second.events[1]).toMatchObject({ mob });
    // A bigger lot bought into the area takes the name over.
    farm = act(farm, { type: 'buyCattle', cls: 'weanerSteer', qty: 40, to: { cell: 3 } });
    expect(farm.mobs.length).toBe(1);
    expect(farm.mobs[0]!.id).not.toBe(mob);
    // Into a mob in the feedlot.
    farm = act(farm, { type: 'moveMob', mob: farm.mobs[0]!.id, to: 'lot' });
    farm = act(farm, { type: 'buyCattle', cls: 'bull', qty: 1, to: { mob: farm.mobs[0]!.id } });
    expect(farm.mobs.length).toBe(1);
    expect(farm.mobs[0]!.where).toEqual({ kind: 'lot' });
    expect(farm.mobs[0]!.animals.length).toBe(66);
  });

  it('draws the cattle from the buying stream: each lot is different, and a refusal uses none', () => {
    let farm = openFarm('nsw');
    const bore = farm.layout.water.bore;
    const stream = farm.rng.buying.join();
    const no = refused(withRoom(farm, 100), {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 5,
      to: { cell: bore },
    });
    expect(no.reason).toBe('bank-limit');
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 5, to: { cell: bore } });
    const first = everyone(farm).map((a) => a.wt);
    expect(farm.rng.buying.join()).not.toBe(stream);
    expect(farm.animalIds.next).toBe(6);
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 5, to: { cell: bore } });
    const second = everyone(farm)
      .slice(5)
      .map((a) => a.wt);
    expect(second).not.toEqual(first);
    expect(everyone(farm).map((a) => a.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // The other streams were not touched.
    const fresh = openFarm('nsw');
    for (const k of ['breeding', 'deaths', 'breakouts', 'strays', 'market'] as const) {
      expect(farm.rng[k]).toEqual(fresh.rng[k]);
    }
  });

  it('is refused for a bad class, number, mob or square, with nothing changed', () => {
    const farm = openFarm('nsw');
    const bore = farm.layout.water.bore;
    const hash = farmHash(farm);
    const bad: [Action, string][] = [
      [{ type: 'buyCattle', cls: 'sheep' as 'bull', qty: 5, to: { cell: bore } }, 'bad-request'],
      [{ type: 'buyCattle', cls: 'toString' as 'bull', qty: 5, to: { cell: bore } }, 'bad-request'],
      [{ type: 'buyCattle', cls: 'bull', qty: 0, to: { cell: bore } }, 'bad-request'],
      [{ type: 'buyCattle', cls: 'bull', qty: -3, to: { cell: bore } }, 'bad-request'],
      [{ type: 'buyCattle', cls: 'bull', qty: 2.5, to: { cell: bore } }, 'bad-request'],
      [{ type: 'buyCattle', cls: 'bull', qty: MAX_BUY + 1, to: { cell: bore } }, 'bad-request'],
      [{ type: 'buyCattle', cls: 'bull', qty: NaN, to: { cell: bore } }, 'bad-request'],
      [{ type: 'buyCattle', cls: 'bull', qty: 5, to: { cell: GRID_N } }, 'bad-request'],
      [{ type: 'buyCattle', cls: 'bull', qty: 5, to: { cell: -1 } }, 'bad-request'],
      [{ type: 'buyCattle', cls: 'bull', qty: 5, to: { mob: 99 } }, 'no-such-mob'],
    ];
    for (const [action, reason] of bad) {
      expect(refused(farm, action).reason, JSON.stringify(action)).toBe(reason);
    }
    expect(farmHash(farm)).toBe(hash);
    expect(MAX_BUY).toBe(5000);
    expect(
      applyAction(farm, { type: 'buyCattle', cls: 'weanerSteer', qty: MAX_BUY, to: { cell: bore } })
        .ok,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('selling cattle', () => {
  /** A breeding mob and a steer mob, in two paddocks. */
  function herd(): FarmState {
    let farm = twoPaddockFarm('nsw');
    const bore = farm.layout.water.bore;
    const topo = surveyOf(farm).topology;
    const dry = topo.paddocks.find((p) => p.id !== topo.paddockOf[bore])!;
    farm = act(farm, { type: 'buyCattle', cls: 'cowCalf', qty: 10, to: { cell: bore } });
    farm = act(farm, { type: 'buyCattle', cls: 'ptic', qty: 6, to: { cell: bore } });
    farm = act(farm, { type: 'buyCattle', cls: 'dryCow', qty: 6, to: { cell: bore } });
    farm = act(farm, { type: 'buyCattle', cls: 'bull', qty: 2, to: { cell: bore } });
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 12, to: { cell: dry.cells[0]! } });
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'weanerSteer',
      qty: 8,
      to: { mob: farm.mobs[1]!.id },
    });
    return farm;
  }

  it('banks the value less 5% and $30 a head, and reports the profit on what they cost', () => {
    const farm = herd();
    const prices = pricesOf(farm);
    const steers = farm.mobs[1]!;
    const heaviest = [...steers.animals].sort((a, b) => b.wt - a.wt).slice(0, 5);
    const out = actWith(farm, { type: 'sellGroup', mob: steers.id, group: 'steer', qty: 5 });
    let net = 0;
    let profit = 0;
    let kg = 0;
    for (const a of heaviest) {
      const v = saleValue(a, prices) * 0.95 - 30;
      expect(netSaleValue(a, prices)).toBe(v);
      net += v;
      profit += v - a.cost;
      kg += a.wt;
    }
    expect(out.events).toEqual([
      { type: 'cattle-sold', head: 5, calvesAtFoot: 0, avgKg: Math.round(kg / 5), net, profit },
    ]);
    expect(out.farm.cash).toBe(farm.cash + net);
    expect(out.farm.year.sales).toBe(net);
    // Bought and sold the same day: the loss is the freight in and the costs out.
    expect(profit).toBeLessThan(0);
    // Steers go heaviest first.
    const gone = new Set(heaviest.map((a) => a.id));
    expect(mobOf(out.farm, steers.id).animals.some((a) => gone.has(a.id))).toBe(false);
    expect(mobOf(out.farm, steers.id).animals.length).toBe(15);
  });

  it('sells cows lowest condition first, then oldest, and their calves go with them', () => {
    const farm = herd();
    const prices = pricesOf(farm);
    const m = farm.mobs[0]!;
    const cows = m.animals
      .filter((a) => a.kind === 'cow' && a.preg < 0)
      .sort((a, b) => a.cond - b.cond || b.age - a.age);
    expect(cows.length).toBe(16);
    const pick = cows.slice(0, 9);
    const calves = pick.filter((a) => a.calf).map((a) => m.animals.find((c) => c.id === a.calf)!);
    expect(calves.length).toBeGreaterThan(0);
    const out = actWith(farm, { type: 'sellGroup', mob: m.id, group: 'cowE', qty: 9 });
    const sold = out.events[0]!;
    expect(sold).toMatchObject({ type: 'cattle-sold', head: 9, calvesAtFoot: calves.length });
    let net = 0;
    for (const a of pick) {
      net += netSaleValue(a, prices);
      const c = calves.find((x) => x.dam === a.id);
      if (c) net += netSaleValue(c, prices);
    }
    expect(sold.type === 'cattle-sold' && sold.net).toBeCloseTo(net, 6);
    const left = mobOf(out.farm, m.id).animals;
    for (const a of [...pick, ...calves]) expect(left.some((x) => x.id === a.id)).toBe(false);
    expect(left.length).toBe(m.animals.length - 9 - calves.length);
    // The in-calf cows were not in this group.
    expect(left.filter((a) => a.preg >= 0).length).toBe(6);
  });

  it('selling a calf on its own dries off its mother, and selling a cow alone leaves no orphan', () => {
    const farm = herd();
    const m = farm.mobs[0]!;
    const cow = m.animals.find((a) => a.kind === 'cow' && a.calf)!;
    const out = act(farm, { type: 'sellAnimals', ids: [cow.calf] });
    const dam = mobOf(out, m.id).animals.find((a) => a.id === cow.id)!;
    expect([dam.calf, dam.lact]).toEqual([0, -1]);
    expect(everyone(out).some((a) => a.id === cow.calf)).toBe(false);
    // Selling the cow takes her calf too, even if only she was named.
    const both = actWith(farm, { type: 'sellAnimals', ids: [cow.id, cow.id] });
    expect(both.events[0]).toMatchObject({ head: 1, calvesAtFoot: 1 });
    expect(everyone(both.farm).some((a) => a.id === cow.calf || a.id === cow.id)).toBe(false);
  });

  it('sells a market class from across the farm, and drops a mob that is sold out', () => {
    const farm = herd();
    // Yearling steers (280 kg and over) are the "feed" class. They are all in the second mob.
    const feed = everyone(farm).filter((a) => a.kind === 'steer' && a.wt >= 280 && a.wt < 450);
    const out = actWith(farm, { type: 'sellClass', cls: 'feed', qty: 100 });
    expect(out.events[0]).toMatchObject({ type: 'cattle-sold', head: feed.length });
    expect(everyone(out.farm).some((a) => a.kind === 'steer' && a.wt >= 280)).toBe(false);
    const rest = act(out.farm, { type: 'sellClass', cls: 'wean', qty: 100 });
    expect(rest.mobs.length).toBe(1);
    // Bulls: lowest condition first.
    const bulls = everyone(farm)
      .filter((a) => a.kind === 'bull')
      .sort((a, b) => a.cond - b.cond);
    const one = act(farm, { type: 'sellClass', cls: 'bull', qty: 1 });
    expect(everyone(one).filter((a) => a.kind === 'bull')[0]!.id).toBe(bulls[1]!.id);
  });

  it('is refused when there is nothing there to sell, or the request is wrong', () => {
    const farm = herd();
    const m = farm.mobs[0]!.id;
    expect(refused(farm, { type: 'sellGroup', mob: m, group: 'steer', qty: 3 }).reason).toBe(
      'nothing-to-sell',
    );
    expect(refused(farm, { type: 'sellGroup', mob: 77, group: 'steer', qty: 3 }).reason).toBe(
      'no-such-mob',
    );
    expect(
      refused(farm, { type: 'sellGroup', mob: m, group: 'goat' as 'steer', qty: 3 }).reason,
    ).toBe('bad-request');
    expect(refused(farm, { type: 'sellGroup', mob: m, group: 'cowE', qty: 0 }).reason).toBe(
      'bad-request',
    );
    expect(refused(farm, { type: 'sellClass', cls: 'heavy', qty: 3 }).reason).toBe(
      'nothing-to-sell',
    );
    expect(refused(farm, { type: 'sellClass', cls: 'pig' as 'cow', qty: 3 }).reason).toBe(
      'bad-request',
    );
    expect(refused(farm, { type: 'sellAnimals', ids: [] }).reason).toBe('nothing-to-sell');
    expect(refused(farm, { type: 'sellAnimals', ids: [1, 99999] }).reason).toBe('no-such-animal');
  });
});

// ---------------------------------------------------------------------------
describe('moving cattle', () => {
  function farmWithMob(): { farm: FarmState; mob: number; dry: number; dryName: string } {
    let farm = twoPaddockFarm('cq');
    const bore = farm.layout.water.bore;
    const topo = surveyOf(farm).topology;
    const dryPad = topo.paddocks.find((p) => p.id !== topo.paddockOf[bore])!;
    farm = act(farm, { type: 'buyCattle', cls: 'cowCalf', qty: 10, to: { cell: bore } });
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 20, to: { cell: bore } });
    farm = act(farm, { type: 'buyCattle', cls: 'weanerSteer', qty: 10, to: { cell: bore } });
    return { farm, mob: farm.mobs[0]!.id, dry: dryPad.cells[7]!, dryName: dryPad.name };
  }

  it('a whole mob keeps its name, its supplement and its counters', () => {
    const { farm, mob, dry } = farmWithMob();
    const before = mobOf(farm, mob);
    before.lossDays = 4;
    before.lastBreak = 2;
    const out = actWith(farm, { type: 'moveMob', mob, to: { cell: dry } });
    const m = mobOf(out.farm, mob);
    expect(m.name).toBe(before.name);
    expect(m.animals.length).toBe(50);
    expect([m.lossDays, m.lastBreak, m.supp]).toEqual([4, 2, 'lick']);
    const s = surveyOf(out.farm);
    expect(m.where).toEqual({
      kind: 'paddock',
      anchor: s.topology.areas[s.topology.areaOf[dry]!]!.label,
    });
    expect(out.events[0]).toMatchObject({ type: 'mob-moved', mob, head: 50 });
    expect(refused(out.farm, { type: 'moveMob', mob, to: { cell: dry + 1 } }).reason).toBe(
      'already-there',
    );
  });

  it('to the feedlot and back', () => {
    const { farm, mob } = farmWithMob();
    const lot = actWith(farm, { type: 'moveMob', mob, to: 'lot' });
    expect(mobOf(lot.farm, mob).where).toEqual({ kind: 'lot' });
    expect(lot.events).toEqual([
      { type: 'mob-moved', mob, mobName: 'Mob 1', head: 50, where: { kind: 'lot' }, area: null },
    ]);
    expect(refused(lot.farm, { type: 'moveMob', mob, to: 'lot' }).reason).toBe('already-there');
    // A day in the lot costs the ration and the yard fee.
    const f = lot.farm;
    stepDay(f);
    expect(f.year.feed).toBeGreaterThan(50 * 0.35);
    expect(mobOf(f, mob).st!.me).toBe(11.6);
    const back = act(f, { type: 'moveMob', mob, to: { cell: f.layout.water.bore } });
    expect(mobOf(back, mob).where.kind).toBe('paddock');
  });

  it('part of a mob by class and number: heaviest steers first, calves with their mothers', () => {
    const { farm, mob, dry, dryName } = farmWithMob();
    const m = mobOf(farm, mob);
    const yearlings = m.animals
      .filter((a) => classOf(a) === 'yearlingSteer')
      .sort((a, b) => b.wt - a.wt);
    const cows = m.animals.filter((a) => a.kind === 'cow').sort((a, b) => a.cond - b.cond);
    const out = actWith(farm, {
      type: 'moveCattle',
      picks: [
        { mob, cls: 'yearlingSteer', qty: 6 },
        { mob, cls: 'cowWithCalf', qty: 3 },
        { mob, cls: 'bull', qty: 5 },
      ],
      to: { cell: dry },
    });
    expect(out.farm.mobs.length).toBe(2);
    const t = out.farm.mobs.find((x) => x.id !== mob)!;
    const ids = new Set(t.animals.map((a) => a.id));
    for (const a of yearlings.slice(0, 6)) expect(ids.has(a.id)).toBe(true);
    for (const a of yearlings.slice(6)) expect(ids.has(a.id)).toBe(false);
    // Cows go lowest condition first, each with her calf.
    for (const a of cows.slice(0, 3)) {
      expect(ids.has(a.id)).toBe(true);
      expect(ids.has(a.calf)).toBe(true);
    }
    expect(t.animals.length).toBe(6 + 3 + 3);
    expect(mobOf(out.farm, mob).animals.length).toBe(50 - 12);
    // The new mob takes the supplement of the mob it came from, and starts its own counters.
    expect(t.supp).toBe('lick');
    expect(t.name).toBe('Mob ' + t.id);
    expect(out.events.map((e) => e.type)).toEqual(['mob-moved', 'no-water']);
    expect(out.events[0]).toMatchObject({ mob: t.id, head: 12, area: dryName });
  });

  it('cattle moved in with another mob join it', () => {
    const { farm, mob, dry } = farmWithMob();
    let f = act(farm, {
      type: 'moveCattle',
      picks: [{ mob, cls: 'yearlingSteer', qty: 15 }],
      to: { cell: dry },
    });
    const other = f.mobs.find((x) => x.id !== mob)!.id;
    const out = actWith(f, {
      type: 'moveCattle',
      picks: [{ mob, cls: 'weanerSteer', qty: 4 }],
      to: { cell: dry },
    });
    f = out.farm;
    expect(f.mobs.length).toBe(2);
    expect(mobOf(f, other).animals.length).toBe(19);
    expect(out.events.map((e) => e.type)).toEqual(['mobs-joined', 'mob-moved', 'no-water']);
    expect(out.events[1]).toMatchObject({ mob: other, head: 4 });
    // Into the feedlot by class.
    const lot = act(f, {
      type: 'moveCattle',
      picks: [{ mob: other, cls: 'weanerSteer', qty: 99 }],
      to: 'lot',
    });
    expect(lot.mobs.find((x) => x.where.kind === 'lot')!.animals.length).toBe(4);
  });

  it('is refused for nothing to move, a mob already there, or a wrong request', () => {
    const { farm, mob, dry } = farmWithMob();
    const bore = farm.layout.water.bore;
    const no = (a: Action): string => refused(farm, a).reason;
    expect(
      no({ type: 'moveCattle', picks: [{ mob, cls: 'bullock', qty: 5 }], to: { cell: dry } }),
    ).toBe('nothing-to-move');
    expect(no({ type: 'moveCattle', picks: [], to: { cell: dry } })).toBe('nothing-to-move');
    expect(
      no({ type: 'moveCattle', picks: [{ mob, cls: 'bull', qty: 1 }], to: { cell: bore } }),
    ).toBe('already-there');
    expect(
      no({ type: 'moveCattle', picks: [{ mob: 9, cls: 'bull', qty: 1 }], to: { cell: dry } }),
    ).toBe('no-such-mob');
    expect(
      no({ type: 'moveCattle', picks: [{ mob, cls: 'emu' as 'bull', qty: 1 }], to: { cell: dry } }),
    ).toBe('bad-request');
    expect(
      no({ type: 'moveCattle', picks: [{ mob, cls: 'bull', qty: 0 }], to: { cell: dry } }),
    ).toBe('bad-request');
    expect(no({ type: 'moveMob', mob, to: { cell: 4000 } })).toBe('bad-request');
    expect(no({ type: 'moveMob', mob: 9, to: 'lot' })).toBe('no-such-mob');
  });

  it('says what stock will meet when they are put on a crop, as data', () => {
    let farm: FarmState;
    for (let seed = 1; ; seed++) {
      farm = createFarm({
        seed,
        district: 'cw',
        size: 'small',
        start: { year: 2022, month: 5 },
        startType: 'scratch',
        mixed: { arablePct: 40, croppedPct: 50 },
        difficulty: 'easy',
        money: { ...PLENTY },
      });
      if (surveyOf(farm).topology.areas.length === 1) break;
    }
    const bore = farm.layout.water.bore;
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 10, to: { cell: bore } });
    const mob = farm.mobs[0]!.id;
    farm = act(farm, { type: 'moveMob', mob, to: 'lot' });
    const out = actWith(farm, { type: 'moveMob', mob, to: { cell: bore } });
    expect(out.events.map((e) => e.type)).toEqual(['mob-moved', 'crop-risks']);
    const e = out.events[1]!;
    if (e.type !== 'crop-risks') throw new Error('expected crop risks');
    expect(e.area).toBe('Paddock 1');
    const types = e.risks.map((r) => r.type);
    // Crop and pasture in one paddock, barley sown today (a grain crop, not established), and bare fallow.
    expect(types).toContain('mixed-paddock');
    expect(types).toContain('not-established');
    const mixed = e.risks.find((r) => r.type === 'mixed-paddock')!;
    if (mixed.type !== 'mixed-paddock') throw new Error('expected a mixed paddock');
    expect(mixed.cropHa + mixed.pastureHa).toBeLessThanOrEqual(500);
    expect(mixed.cropHa).toBeGreaterThan(0);
    // On plain pasture there is nothing to say.
    let plain = openFarm('cw');
    plain = act(plain, { type: 'buyCattle', cls: 'yearSteer', qty: 10, to: { cell: 3 } });
    plain = act(plain, { type: 'moveMob', mob: plain.mobs[0]!.id, to: 'lot' });
    const back = actWith(plain, { type: 'moveMob', mob: plain.mobs[0]!.id, to: { cell: 3 } });
    expect(back.events.map((x) => x.type)).toEqual(['mob-moved']);
  });
});

describe('who goes first when a group is sold', () => {
  function mixed(): FarmState {
    let farm = openFarm('nsw');
    const bore = farm.layout.water.bore;
    farm = act(farm, { type: 'buyCattle', cls: 'dryCow', qty: 8, to: { cell: bore } });
    farm = act(farm, { type: 'buyCattle', cls: 'weanerHeifer', qty: 8, to: { cell: bore } });
    farm = act(farm, { type: 'buyCattle', cls: 'joinHeifer', qty: 6, to: { cell: bore } });
    farm = act(farm, { type: 'buyCattle', cls: 'bull', qty: 5, to: { cell: bore } });
    return farm;
  }

  it('cows in the same condition: the oldest goes first', () => {
    const farm = mixed();
    const cows = everyone(farm).filter((a) => a.kind === 'cow');
    // Three cows in the same, lowest, condition and of different ages.
    const [a, b, c] = cows;
    for (const x of [a!, b!, c!]) x.cond = 2.1;
    a!.age = 1700;
    b!.age = 2300;
    c!.age = 2000;
    const m = farm.mobs[0]!.id;
    const one = act(farm, { type: 'sellGroup', mob: m, group: 'cowE', qty: 1 });
    expect(everyone(one).some((x) => x.id === b!.id)).toBe(false);
    expect(everyone(one).filter((x) => x.kind === 'cow').length).toBe(7);
    const two = act(farm, { type: 'sellGroup', mob: m, group: 'cowE', qty: 2 });
    expect(everyone(two).some((x) => x.id === b!.id || x.id === c!.id)).toBe(false);
    expect(everyone(two).some((x) => x.id === a!.id)).toBe(true);
    // The same order when cows are sold as a market class.
    const cls = act(farm, { type: 'sellClass', cls: 'cow', qty: 2 });
    expect(everyone(cls).some((x) => x.id === b!.id || x.id === c!.id)).toBe(false);
  });

  it('heifers, empty or in calf: the heaviest go first', () => {
    const farm = mixed();
    const m = farm.mobs[0]!.id;
    const heifers = everyone(farm)
      .filter((a) => a.kind === 'heifer')
      .sort((x, y) => y.wt - x.wt);
    expect(heifers.length).toBe(14);
    const out = act(farm, { type: 'sellGroup', mob: m, group: 'heifer', qty: 4 });
    const left = new Set(everyone(out).map((a) => a.id));
    for (const h of heifers.slice(0, 4)) expect(left.has(h.id)).toBe(false);
    for (const h of heifers.slice(4)) expect(left.has(h.id)).toBe(true);
    // Five of the lighter ones in calf: they are their own group, heaviest first again.
    const inCalf = heifers.slice(6, 11);
    for (const h of inCalf) h.preg = 60;
    const ptic = act(farm, { type: 'sellGroup', mob: m, group: 'heiferP', qty: 2 });
    const now = new Set(everyone(ptic).map((a) => a.id));
    expect(now.has(inCalf[0]!.id) || now.has(inCalf[1]!.id)).toBe(false);
    for (const h of inCalf.slice(2)) expect(now.has(h.id)).toBe(true);
    expect(everyone(ptic).length).toBe(everyone(farm).length - 2);
  });

  it('bulls: the lowest condition go first, whatever they weigh', () => {
    const farm = mixed();
    const bulls = everyone(farm).filter((a) => a.kind === 'bull');
    // The two in the lowest condition are also the two lightest.
    const conds = [3.5, 3.1, 3.4, 3.05, 3.3];
    const weights = [800, 700, 810, 720, 760];
    bulls.forEach((b, k) => {
      b.cond = conds[k]!;
      b.wt = weights[k]!;
    });
    const out = act(farm, { type: 'sellClass', cls: 'bull', qty: 2 });
    const left = everyone(out)
      .filter((a) => a.kind === 'bull')
      .map((a) => a.id);
    expect(left).toEqual([bulls[0]!.id, bulls[2]!.id, bulls[4]!.id]);
    const grouped = act(farm, { type: 'sellGroup', mob: farm.mobs[0]!.id, group: 'bull', qty: 2 });
    expect(
      everyone(grouped)
        .filter((a) => a.kind === 'bull')
        .map((a) => a.id),
    ).toEqual(left);
  });
});

describe('requests with parts missing', () => {
  it('are refused with a reason, never an error', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buyCattle', cls: 'bull', qty: 1, to: { cell: 3 } });
    const mob = farm.mobs[0]!.id;
    const hash = farmHash(farm);
    const bad = [
      { type: 'buyCattle', cls: 'bull', qty: 1 },
      { type: 'buyCattle', cls: 'bull', qty: 1, to: null },
      { type: 'buyCattle', cls: 'bull', qty: 1, to: 'lot' },
      { type: 'buyCattle', cls: 'bull', qty: 1, to: {} },
      { type: 'moveCattle', picks: [null], to: 'lot' },
      { type: 'moveCattle', picks: ['bull'], to: 'lot' },
      { type: 'moveCattle', picks: [{ mob, cls: 'bull', qty: 1 }] },
      { type: 'moveCattle', picks: [{ mob, cls: 'bull', qty: 1 }], to: 'yards' },
      { type: 'moveMob', mob },
      { type: 'moveMob', mob, to: null },
      { type: 'sellAnimals' },
      { type: 'sellAnimals', ids: 'all' },
      {},
    ] as unknown as Action[];
    for (const action of bad) {
      const out = applyAction(farm, action);
      expect(out.ok, JSON.stringify(action)).toBe(false);
      if (!out.ok) expect(out.reason, JSON.stringify(action)).toBe('bad-request');
    }
    expect(farmHash(farm)).toBe(hash);
  });
});
