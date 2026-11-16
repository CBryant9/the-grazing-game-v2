import { describe, expect, it, vi } from 'vitest';
import {
  PLENTY,
  act,
  actWith,
  boxCells,
  boxEdges,
  cellAt,
  farCorner,
  openFarm,
  refused,
  twoPaddockFarm,
} from '../../test-support/wholeFarm';
import type { Animal } from '../cattle/types';
import { SUPPLEMENTS } from '../data/feed';
import { SPECIES } from '../data/species';
import { GRID_N, GRID_W } from '../grid';
import { infraInPlace, netWorth } from '../money/worth';
import { LAND } from '../pasture/state';
import { farmHash } from '../save/save';
import { createFarm } from '../sim/create';
import { seasonsOf, surveyOf } from '../sim/derived';
import { cloneFarm, type FarmMob, type FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { applyInstantly } from '../../test-support/instant';
import type { Action } from './types';

/*
 * Supplements, marking, weaning, sowing and harvest as actions. In the MVP
 * changing a supplement and buying a sowing were screen code. Here the
 * server checks them like any other action.
 */

vi.setConfig({ testTimeout: 600_000 });

const mobOf = (farm: FarmState, id: number): FarmMob => farm.mobs.find((m) => m.id === id)!;
const everyone = (farm: FarmState): Animal[] => farm.mobs.flatMap((m) => m.animals);
const withRoom = (farm: FarmState, room: number): FarmState => {
  const f = cloneFarm(farm);
  f.cash = f.overdraft + room;
  return f;
};

/** Cows with calves of a given age, some of them unmarked bull calves, in the bore paddock. */
function breeders(
  calfAge: number,
  district: 'nsw' | 'cq' = 'nsw',
): { farm: FarmState; mob: number } {
  let farm = twoPaddockFarm(district);
  farm = act(farm, {
    type: 'buyCattle',
    cls: 'cowCalf',
    qty: 12,
    to: { cell: farm.layout.water.bore },
  });
  const m = farm.mobs[0]!;
  let k = 0;
  for (const a of m.animals) {
    if (a.kind !== 'calf') continue;
    a.age = calfAge;
    a.sex = k++ % 2 === 0 ? 'M' : 'F';
  }
  return { farm, mob: m.id };
}

describe('setting a supplement', () => {
  it('changes what the mob is fed, for every supplement', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 10, to: { cell: 3 } });
    const mob = farm.mobs[0]!.id;
    for (const supp of SUPPLEMENTS) {
      const out = actWith(farm, { type: 'setSupplement', mob, supp });
      expect(mobOf(out.farm, mob).supp).toBe(supp);
      expect(out.events).toEqual([{ type: 'supplement-set', mob, mobName: 'Mob 1', supp }]);
    }
    expect(refused(farm, { type: 'setSupplement', mob, supp: 'grain' as 'hay' }).reason).toBe(
      'bad-request',
    );
    expect(refused(farm, { type: 'setSupplement', mob: 9, supp: 'hay' }).reason).toBe(
      'no-such-mob',
    );
  });

  it('hay is fed and charged from the next day', () => {
    let farm = openFarm('nsw');
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 10,
      to: { cell: farm.layout.water.bore },
    });
    const none = cloneFarm(farm);
    stepDay(none);
    expect(none.year.feed).toBe(0);
    farm = act(farm, { type: 'setSupplement', mob: farm.mobs[0]!.id, supp: 'hay' });
    stepDay(farm);
    // 3 kg a head at 28c a kg. The farm without hay is that much better off after the day,
    // and a day's interest on it (feed is paid before interest is worked out).
    expect(farm.year.feed).toBeCloseTo(10 * 3 * 0.28, 9);
    expect(none.cash - farm.cash).toBeCloseTo(8.4 * (1 + 0.03 / 365), 6);
  });
});

describe('marking calves', () => {
  it('costs $8 a bull calf and makes them steer calves', () => {
    const { farm, mob } = breeders(70);
    const out = actWith(farm, { type: 'markCalves', mob });
    expect(out.events).toEqual([
      { type: 'calves-marked', mob, mobName: 'Mob 1', count: 6, cost: 48 },
    ]);
    expect(farm.cash - out.farm.cash).toBe(48);
    expect(out.farm.year.running).toBe(48);
    expect(everyone(out.farm).filter((a) => a.kind === 'calf' && a.sex === 'S').length).toBe(6);
    expect(everyone(out.farm).some((a) => a.sex === 'M')).toBe(false);
    expect(refused(out.farm, { type: 'markCalves', mob }).reason).toBe('nothing-to-mark');
    expect(refused(farm, { type: 'markCalves', mob: 9 }).reason).toBe('no-such-mob');
  });

  it('an unmarked young bull costs $25 and loses 3% of its weight', () => {
    const { farm, mob } = breeders(200);
    const weaned = act(farm, { type: 'wean', mob });
    const young = everyone(weaned).filter((a) => a.young);
    expect(young.length).toBe(6);
    const m = weaned.mobs.find((x) => x.animals.some((a) => a.young))!;
    const out = act(weaned, { type: 'markCalves', mob: m.id });
    expect(weaned.cash - out.cash).toBe(6 * 25);
    for (const y of young) {
      const now = everyone(out).find((a) => a.id === y.id)!;
      expect([now.kind, now.sex, now.young]).toEqual(['steer', 'S', false]);
      expect(now.wt).toBe(y.wt * 0.97);
      expect(now.cost).toBe(y.cost + 25);
    }
  });

  it('comes straight off the account, even at the overdraft limit', () => {
    const { farm, mob } = breeders(70);
    const tight = withRoom(farm, 0);
    expect(act(tight, { type: 'markCalves', mob }).cash).toBe(tight.overdraft - 48);
  });
});

describe('weaning', () => {
  it('is refused until a calf is 90 days old', () => {
    const { farm, mob } = breeders(89);
    const no = refused(farm, { type: 'wean', mob });
    expect(no.reason).toBe('no-calves-to-wean');
    expect(no.message).toContain('90 days');
    const { farm: old } = breeders(90);
    expect(act(old, { type: 'wean', mob }).mobs.length).toBe(1);
  });

  it('with no other paddock with water, the weaners stay with the cows', () => {
    const { farm, mob } = breeders(150);
    const out = actWith(farm, { type: 'wean', mob });
    expect(out.farm.mobs.length).toBe(1);
    const all = everyone(out.farm);
    expect(all.some((a) => a.kind === 'calf')).toBe(false);
    expect(all.filter((a) => a.kind === 'heifer').length).toBe(6);
    expect(all.filter((a) => a.kind === 'bull' && a.young).length).toBe(6);
    // Every cow is dried off.
    for (const a of all.filter((x) => x.kind === 'cow')) expect([a.calf, a.lact]).toEqual([0, -1]);
    for (const a of all.filter((x) => x.kind !== 'cow')) expect(a.dam).toBe(0);
    const e = out.events[0]!;
    expect(e).toMatchObject({ type: 'weaned', mob, count: 12, into: null });
    const calves = everyone(farm).filter((a) => a.kind === 'calf');
    expect(e.type === 'weaned' && e.avgKg).toBe(
      Math.round(calves.reduce((s, c) => s + c.wt, 0) / 12),
    );
  });

  it('to a paddock the player picks, as a new mob named Weaners with the mob supplement', () => {
    for (const district of ['nsw', 'cq'] as const) {
      const { farm, mob } = breeders(150, district);
      const bore = farm.layout.water.bore;
      const topo = surveyOf(farm).topology;
      const dry = topo.paddocks.find((p) => p.id !== topo.paddockOf[bore])!;
      const out = actWith(farm, { type: 'wean', mob, to: { cell: dry.cells[0]! } });
      const t = out.farm.mobs.find((m) => m.id !== mob)!;
      expect(t.name).toBe('Weaners ' + t.id);
      expect(t.animals.length).toBe(12);
      // Central Qld mobs are on a lick, and so are their weaners. Elsewhere neither is.
      expect(t.supp).toBe(district === 'cq' ? 'lick' : 'none');
      expect(mobOf(out.farm, mob).animals.length).toBe(12);
      expect(out.events.map((e) => e.type)).toEqual(['weaned', 'no-water']);
      expect(out.events[0]).toMatchObject({
        type: 'weaned',
        count: 12,
        into: { mob: t.id, mobName: t.name, area: dry.name },
      });
      expect(refused(farm, { type: 'wean', mob, to: { cell: bore } }).reason).toBe('already-there');
    }
  });

  it('weaners of a mob on hay go onto hay, and into the feedlot when sent there', () => {
    const { farm, mob } = breeders(150);
    const fed = act(farm, { type: 'setSupplement', mob, supp: 'hay' });
    const out = act(fed, { type: 'wean', mob, to: 'lot' });
    const t = out.mobs.find((m) => m.id !== mob)!;
    expect(t.where).toEqual({ kind: 'lot' });
    expect(t.supp).toBe('hay');
  });

  it('with no paddock picked they go to another paddock with water: an empty one first', () => {
    const { farm: f0, mob } = breeders(150);
    const bore = f0.layout.water.bore;
    const topo = surveyOf(f0).topology;
    const dry = topo.paddocks.find((p) => p.id !== topo.paddockOf[bore])!;
    // Water in the second paddock, from a portable trough.
    let farm = act(f0, { type: 'placePortable', cell: dry.cells[10]! });
    const out = actWith(farm, { type: 'wean', mob });
    const t = out.farm.mobs.find((m) => m.id !== mob)!;
    expect(t.where).toEqual({ kind: 'paddock', anchor: dry.cells[10]! });
    expect(out.events.map((e) => e.type)).toEqual(['weaned']);
    // With steers already in that paddock, the weaners join them.
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 30,
      to: { cell: dry.cells[10]! },
    });
    const steers = farm.mobs.find((m) => m.id !== mob)!.id;
    const joined = actWith(farm, { type: 'wean', mob });
    expect(joined.farm.mobs.length).toBe(2);
    expect(mobOf(joined.farm, steers).animals.length).toBe(42);
    expect(joined.events.map((e) => e.type)).toEqual(['mobs-joined', 'weaned']);
    expect(joined.events[1]).toMatchObject({ into: { mob: steers } });
  });

  it('dries off a dam that is in another mob (the MVP left her milking)', () => {
    const { farm, mob } = breeders(150);
    const m = mobOf(farm, mob);
    const cow = m.animals.find((a) => a.kind === 'cow')!;
    // Her calf stays behind while she goes to the feedlot on her own.
    const lot = cloneFarm(farm);
    const here = mobOf(lot, mob);
    const moved = here.animals.find((a) => a.id === cow.id)!;
    here.animals = here.animals.filter((a) => a.id !== cow.id);
    lot.mobs.push({
      ...cloneFarm(farm).mobs[0]!,
      id: 50,
      name: 'Lot',
      where: { kind: 'lot' },
      animals: [moved],
    });
    expect(moved.calf).toBeGreaterThan(0);
    const out = act(lot, { type: 'wean', mob });
    const dam = everyone(out).find((a) => a.id === cow.id)!;
    expect([dam.calf, dam.lact]).toEqual([0, -1]);
  });
});

/** A mixed Central West farm in June, with crops in the ground and fallow to sow. */
function mixedFarm(): FarmState {
  return createFarm({
    seed: 4,
    district: 'cw',
    size: 'small',
    start: { year: 2022, month: 5 },
    startType: 'scratch',
    mixed: { arablePct: 40, croppedPct: 50 },
    difficulty: 'easy',
    money: { ...PLENTY },
  });
}

describe('sowing', () => {
  it('a crop on fallow costs its $/ha, counted as a cropping cost', () => {
    const farm = mixedFarm();
    const fallow: number[] = [];
    for (let i = 0; i < GRID_N; i++) if (farm.pasture.land[i] === LAND.fallow) fallow.push(i);
    expect(fallow.length).toBeGreaterThan(4);
    const ha = farm.layout.scale.haPerSquare;
    // Barley is sown May to June in Central West.
    const out = actWith(farm, { type: 'sow', species: 'barley', cells: fallow });
    const cost = fallow.length * ha * SPECIES.barley.cost;
    expect(farm.cash - out.farm.cash).toBeCloseTo(cost, 6);
    expect(out.farm.year.crops).toBeCloseTo(cost, 6);
    expect(out.farm.year.infra).toBe(0);
    expect(infraInPlace(out.farm)).toBe(0);
    const e = out.events[0]!;
    expect(e).toMatchObject({ type: 'sown', sp: 'barley', convHa: 0, skipped: 0 });
    expect(e.type === 'sown' && e.ha).toBeCloseTo(fallow.length * ha, 9);
    for (const i of fallow) {
      expect(out.farm.pasture.land[i]).toBe(LAND.crop);
      expect(out.farm.pasture.G[i]).toBe(40);
    }
    expect(out.farm.crops.fields.at(-1)).toMatchObject({ sp: 'barley', sown: 0 });
  });

  it('turning arable pasture into cropping country costs $150 a hectare more', () => {
    const farm = mixedFarm();
    const pasture: number[] = [];
    for (let i = 0; i < GRID_N && pasture.length < 6; i++) {
      if (farm.crops.arable[i] && farm.pasture.land[i] === LAND.native) pasture.push(i);
    }
    expect(pasture.length).toBe(6);
    const ha = farm.layout.scale.haPerSquare;
    const out = actWith(farm, { type: 'sow', species: 'barley', cells: pasture });
    expect(farm.cash - out.farm.cash).toBeCloseTo(6 * ha * (SPECIES.barley.cost + 150), 6);
    expect(out.events[0]).toMatchObject({ type: 'sown', convHa: 6 * ha });
  });

  it('a pasture counts in full as spent on infrastructure, and half of it in net worth', () => {
    // Lucerne is sown in March, April and September in Central West.
    const farm = createFarm({
      seed: 4,
      district: 'cw',
      size: 'small',
      start: { year: 2022, month: 2 },
      startType: 'scratch',
      difficulty: 'easy',
      money: { ...PLENTY },
    });
    const cells = boxCells(2, 2, 5, 4);
    const ha = farm.layout.scale.haPerSquare;
    const cost = 12 * ha * SPECIES.lucerne.cost;
    const worth = netWorth(farm);
    const out = actWith(farm, { type: 'sow', species: 'lucerne', cells });
    const f = out.farm;
    expect(farm.cash - f.cash).toBeCloseTo(cost, 6);
    expect(f.year.infra).toBeCloseTo(cost, 6);
    expect(f.year.crops).toBe(0);
    expect(infraInPlace(f)).toBeCloseTo(cost * 0.5, 6);
    expect(netWorth(f)).toBeCloseTo(worth - cost + 0.8 * 0.5 * cost, 6);
    for (const i of cells) expect(f.pasture.land[i]).toBe(LAND.sown);

    // Sown over in part by another pasture: the first counts only for the squares it still has.
    const over = act(f, { type: 'sow', species: 'phal', cells: cells.slice(0, 3) });
    const phal = 3 * ha * SPECIES.phal.cost;
    expect(infraInPlace(over)).toBeCloseTo(cost * 0.5 * (9 / 12) + phal * 0.5, 6);
    // Sown over altogether: it is gone from the books.
    const gone = act(over, { type: 'sow', species: 'phal', cells: cells.slice(3) });
    expect(Object.keys(gone.ledger.pasture).length).toBe(2);
    expect(gone.crops.fields.some((x) => x.sp === 'lucerne')).toBe(false);
    expect(infraInPlace(gone)).toBeCloseTo(phal * 0.5 + 9 * ha * SPECIES.phal.cost * 0.5, 6);
  });

  it('is refused out of season, for a species the district does not grow, and at the bank limit', () => {
    const farm = mixedFarm();
    const fallow: number[] = [];
    for (let i = 0; i < GRID_N; i++) if (farm.pasture.land[i] === LAND.fallow) fallow.push(i);
    const hash = farmHash(farm);
    const no = (a: Action): string => refused(farm, a).reason;
    // June: forage sorghum is sown October to January.
    expect(no({ type: 'sow', species: 'forsorg', cells: fallow })).toBe('out-of-window');
    // Ryegrass is not grown in Central West.
    expect(no({ type: 'sow', species: 'rye', cells: fallow })).toBe('not-grown-here');
    expect(no({ type: 'sow', species: 'cactus' as 'rye', cells: fallow })).toBe('not-grown-here');
    expect(no({ type: 'sow', species: 'barley', cells: [GRID_N] })).toBe('off-the-farm');
    // Crops only go on arable land.
    const notArable: number[] = [];
    for (let i = 0; i < GRID_N && notArable.length < 3; i++)
      if (!farm.crops.arable[i]) notArable.push(i);
    expect(no({ type: 'sow', species: 'barley', cells: notArable })).toBe('no-usable-land');
    const cost = fallow.length * farm.layout.scale.haPerSquare * SPECIES.barley.cost;
    const short = withRoom(farm, cost - 1);
    expect(refused(short, { type: 'sow', species: 'barley', cells: fallow }).reason).toBe(
      'bank-limit',
    );
    expect(
      act(withRoom(farm, cost + 0.01), { type: 'sow', species: 'barley', cells: fallow }).cash,
    ).toBeCloseTo(farm.overdraft + 0.01, 6);
    expect(farmHash(farm)).toBe(hash);
  });
});

describe('harvest', () => {
  /** Run a mixed farm until a crop is ready. */
  function ready(): { farm: FarmState; field: number } {
    const farm = mixedFarm();
    for (let d = 0; d < 260; d++) {
      for (const e of stepDay(farm).events) {
        if (e.type === 'crop' && e.event.type === 'harvest-ready') {
          return { farm, field: e.event.fieldId };
        }
      }
    }
    throw new Error('no crop came ready');
  }

  it('banks the grain, takes the harvest cost, and leaves stubble', () => {
    const { farm, field } = ready();
    const f = farm.crops.fields.find((x) => x.id === field)!;
    const sp = SPECIES[f.sp];
    const ha = f.cells.length * farm.layout.scale.haPerSquare;
    const out = actWith(farm, { type: 'harvest', field });
    const e = out.events[0]!;
    if (e.type !== 'harvested') throw new Error('expected a harvest');
    expect(e.sp).toBe(f.sp);
    expect(e.cost).toBeCloseTo(ha * sp.harvest!, 6);
    expect(e.value).toBeCloseTo(e.t * sp.price!, 6);
    expect(e.t).toBeCloseTo(e.tha * ha, 6);
    // Somewhere near a Central West yield: over 1 t/ha and under 4.
    expect(e.tha).toBeGreaterThan(1);
    expect(e.tha).toBeLessThan(4);
    expect(out.farm.cash - farm.cash).toBeCloseTo(e.value - e.cost, 6);
    expect(out.farm.year.grain).toBe(e.value);
    expect(out.farm.year.crops).toBe(farm.year.crops + e.cost);
    for (const i of f.cells) expect(out.farm.pasture.land[i]).toBe(LAND.stubble);
    // The yield goes by the season the last day ran on.
    const seasonF = seasonsOf(farm).factorsOn(farm.day - 1).seasonF;
    let y = 0;
    for (const i of f.cells) y += farm.crops.yieldT[i]!;
    expect(e.tha).toBe((y / f.cells.length) * Math.pow(Math.min(1.4, Math.max(0.4, seasonF)), 0.8));
  });

  it('goes by the season the last day ran on, not the one that starts today', () => {
    const { farm, field } = ready();
    const f = farm.crops.fields.find((x) => x.id === field)!;
    let y = 0;
    for (const i of f.cells) y += farm.crops.yieldT[i]!;
    const average = y / f.cells.length;
    // A drought up to yesterday, a wet season from today.
    const seasons = {
      factorsOn: (day: number) =>
        day < farm.day
          ? { seasonF: 0.5, monthF: 0.5, label: 'Drought' }
          : { seasonF: 1.35, monthF: 1.35, label: 'Wet' },
    };
    const out = applyInstantly(farm, { type: 'harvest', field }, { seasons });
    if (!out.ok) throw new Error(out.message);
    const e = out.events[0]!;
    if (e.type !== 'harvested') throw new Error('expected a harvest');
    expect(e.tha).toBe(average * Math.pow(0.5, 0.8));
    expect(e.tha).not.toBe(average * Math.pow(1.35, 0.8));
  });

  it('is refused for a crop that is not ready, a pasture, no crop at all, and at the bank limit', () => {
    const farm = mixedFarm();
    const growing = farm.crops.fields[0]!;
    expect(refused(farm, { type: 'harvest', field: growing.id }).reason).toBe('not-ready');
    expect(refused(farm, { type: 'harvest', field: 999 }).reason).toBe('no-such-planting');
    const { farm: ripe, field } = ready();
    const f = ripe.crops.fields.find((x) => x.id === field)!;
    const cost = f.cells.length * ripe.layout.scale.haPerSquare * SPECIES[f.sp].harvest!;
    const hash = farmHash(withRoom(ripe, cost - 1));
    expect(refused(withRoom(ripe, cost - 1), { type: 'harvest', field }).reason).toBe('bank-limit');
    expect(farmHash(withRoom(ripe, cost - 1))).toBe(hash);
    expect(act(withRoom(ripe, cost + 1), { type: 'harvest', field }).year.grain).toBeGreaterThan(0);
  });
});

describe('fences round a box for stock', () => {
  it('a box built round an empty corner makes a paddock, and cattle bought into it are a mob there', () => {
    let farm = openFarm('nsw');
    const [x0, y0] = farCorner(farm);
    const out = actWith(farm, {
      type: 'buildFence',
      edges: boxEdges(x0, y0, x0 + 2, y0 + 2),
      fence: 'permanent',
    });
    expect(out.events[0]).toMatchObject({ detail: { paddocksBefore: 1, paddocksAfter: 2 } });
    farm = act(out.farm, {
      type: 'buyCattle',
      cls: 'weanerSteer',
      qty: 4,
      to: { cell: cellAt(x0 + 1, y0 + 1) },
    });
    const s = surveyOf(farm);
    expect(s.topology.areaOf[(farm.mobs[0]!.where as { anchor: number }).anchor]).toBe(
      s.topology.areaOf[cellAt(x0 + 1, y0 + 1)],
    );
    expect(GRID_W).toBe(40);
  });
});
