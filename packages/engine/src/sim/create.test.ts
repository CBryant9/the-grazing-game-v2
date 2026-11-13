import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  farmDifferences,
  loadMvpWhole,
  mvpStartHerd,
  putWholeFarm,
} from '../../test-support/mvpWhole';
import { aeOf, classOf } from '../cattle/animal';
import { FARM_SIZES } from '../data/farms';
import { generateFarm } from '../farm/generate';
import { buyPrice } from '../market/prices';
import { standInMarket } from '../market/standIn';
import { carryingCapacityAE, startMoney } from '../money/costs';
import { netWorth } from '../money/worth';
import { rngStream } from '../rng';
import { farmHash } from '../save/save';
import { ENGINE_VERSION, SAVE_FORMAT_VERSION } from '../version';
import { HERD_STREAM, createFarm, startHerd, type CreateFarmOptions } from './create';
import { pricesOf, surveyOf } from './derived';
import type { FarmStarted } from './events';
import { cloneFarm } from './state';

vi.setConfig({ testTimeout: 600_000 });

const loaded = loadMvpWhole();

const options = (over: Partial<CreateFarmOptions> = {}): CreateFarmOptions => ({
  seed: 42,
  district: 'nsw',
  size: 'medium',
  start: { year: 2023, month: 8 },
  startType: 'running',
  difficulty: 'medium',
  ...over,
});

describe('the starting herd, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: the same numbers give the same herd in the same paddocks', (id) => {
    for (const [seed, size] of [
      [1, 'small'],
      [2, 'medium'],
      [3, 'large'],
    ] as const) {
      const farm = createFarm(options({ seed, district: id, size }));
      // The same farm before its herd went on, given to the MVP.
      const bare = cloneFarm(farm);
      bare.mobs = [];
      bare.animalIds.next = 1;
      bare.nextMobId = 1;
      putWholeFarm(loaded, bare);
      mvpStartHerd(loaded, seed);
      expect(
        farmDifferences(farm, loaded.mvp, { skipYear: ['worth0'] }),
        `${id} ${size} seed ${seed}`,
      ).toEqual([]);
      // The MVP also drew a spot on the map for every beast. The engine did not.
      expect(loaded.counts.map).toBeGreaterThan(farm.animalIds.next - 1);
      expect(farm.mobs.length).toBeGreaterThan(0);
    }
  });
});

describe('the starting herd on very small farms, against the MVP', () => {
  it('never fewer than 10 cows, 1 bull and 4 weaners', () => {
    let atCowFloor = 0;
    let atWeanerFloor = 0;
    for (const [seed, ha] of [
      [1, 10],
      [2, 14],
      [3, 18],
      [4, 25],
      [5, 40],
      [6, 60],
    ] as const) {
      const farm = createFarm(options({ seed, district: 'wv', size: ha }));
      const bare = cloneFarm(farm);
      bare.mobs = [];
      bare.animalIds.next = 1;
      bare.nextMobId = 1;
      putWholeFarm(loaded, bare);
      mvpStartHerd(loaded, seed);
      expect(farmDifferences(farm, loaded.mvp, { skipYear: ['worth0'] }), `${ha} ha`).toEqual([]);
      const h = (farm.inbox[0]!.event as FarmStarted).herd!;
      const all = farm.mobs.flatMap((m) => m.animals);
      expect(all.filter((a) => a.kind === 'cow').length).toBe(h.cows);
      expect(h.cows).toBeGreaterThanOrEqual(10);
      expect(h.weaners).toBeGreaterThanOrEqual(4);
      expect(h.bulls).toBe(1);
      if (Math.round((h.ae * 0.65) / 1.05) < 10) {
        atCowFloor++;
        expect(h.cows).toBe(10);
      }
      if (Math.round((h.ae * 0.3) / 0.55) < 4) {
        atWeanerFloor++;
        expect(h.weaners).toBe(4);
      }
    }
    expect(atCowFloor).toBeGreaterThan(1);
    expect(atWeanerFloor).toBeGreaterThan(0);
  });
});

describe('the starting herd, by its rules', () => {
  const herds = DISTRICT_IDS.flatMap((id, k) =>
    [11, 12, 13, 14, 15, 16].map((seed) =>
      createFarm(options({ seed: seed + 10 * k, district: id })),
    ),
  );

  it('is 35 to 65% of carrying capacity, and different on every farm', () => {
    const shares = new Set<number>();
    for (const farm of herds) {
      const started = farm.inbox[0]!.event as FarmStarted;
      const h = started.herd!;
      expect(h.share).toBeGreaterThanOrEqual(0.35);
      expect(h.share).toBeLessThan(0.65);
      expect(h.ae).toBe(carryingCapacityAE(farm.district, farm.layout.scale.farmHa) * h.share);
      shares.add(h.share);
    }
    expect(shares.size).toBe(herds.length);
    // Across the farms the draw covers the range.
    expect(Math.min(...shares)).toBeLessThan(0.42);
    expect(Math.max(...shares)).toBeGreaterThan(0.58);
  });

  it('is cows (55% PTIC, 25% with calves, the rest dry), a bull for each 40 cows, and weaners', () => {
    for (const farm of herds) {
      const h = (farm.inbox[0]!.event as FarmStarted).herd!;
      expect(h.cows).toBe(Math.max(10, Math.round((h.ae * 0.65) / 1.05)));
      expect(h.bulls).toBe(Math.max(1, Math.ceil(h.cows / 40)));
      expect(h.weaners).toBe(Math.max(4, Math.round((h.ae * 0.3) / 0.55)));
      const all = farm.mobs.flatMap((m) => m.animals);
      const n = (cls: string): number => all.filter((a) => classOf(a) === cls).length;
      const ptic = Math.round(h.cows * 0.55);
      const withCalf = Math.round(h.cows * 0.25);
      expect(n('pticCow')).toBe(ptic);
      expect(n('cowWithCalf')).toBe(withCalf);
      expect(n('dryCow')).toBe(h.cows - ptic - withCalf);
      expect(n('bull')).toBe(h.bulls);
      expect(n('weanerSteer')).toBe(Math.round(h.weaners / 2));
      expect(n('weanerHeifer')).toBe(h.weaners - Math.round(h.weaners / 2));
      expect(n('steerCalf') + n('heiferCalf')).toBe(withCalf);
      expect(all.length).toBe(h.cows + h.bulls + h.weaners + withCalf);
      // The AE on the ground is near the AE asked for.
      const ae = all.reduce((s, a) => s + aeOf(a), 0);
      expect(ae / h.ae).toBeGreaterThan(0.85);
      expect(ae / h.ae).toBeLessThan(1.25);
    }
  });

  it('puts the cows in the biggest area with water and the weaners in the next', () => {
    for (const farm of herds) {
      const s = surveyOf(farm);
      const wet = s.topology.areas
        .filter((r) => s.points.areaTroughs[r.id]!.length)
        .sort((a, b) => b.ha - a.ha);
      expect(wet.length).toBeGreaterThan(1);
      expect(farm.mobs.map((m) => m.name)).toEqual(['Mob 1', 'Mob 2']);
      const [cows, weaners] = farm.mobs;
      expect(cows!.where).toEqual({
        kind: 'paddock',
        anchor: s.points.areaTroughs[wet[0]!.id]![0],
      });
      expect(weaners!.where).toEqual({
        kind: 'paddock',
        anchor: s.points.areaTroughs[wet[1]!.id]![0],
      });
      expect(
        cows!.animals.every((a) => a.kind === 'cow' || a.kind === 'bull' || a.kind === 'calf'),
      ).toBe(true);
      expect(weaners!.animals.every((a) => a.kind === 'steer' || a.kind === 'heifer')).toBe(true);
    }
  });

  it('starts on a lick in Central Qld and on nothing elsewhere', () => {
    for (const farm of herds) {
      for (const m of farm.mobs) expect(m.supp).toBe(farm.district === 'cq' ? 'lick' : 'none');
    }
  });

  it('values every beast at the market on day 0: bulls by the head, the rest by weight', () => {
    for (const farm of herds.slice(0, 4)) {
      const prices = pricesOf(farm);
      for (const m of farm.mobs) {
        for (const a of m.animals) {
          expect(a.paid).toBe(buyPrice(a, prices));
          expect(a.cost).toBe(a.paid);
          if (a.kind === 'bull') expect(a.paid).toBe((5500 * prices.indicator) / 400);
        }
      }
    }
  });

  it('with water in only one area, the whole herd runs as one mob', () => {
    const farm = createFarm(options({ seed: 8, startType: 'scratch' }));
    expect(farm.mobs).toEqual([]);
    const h = startHerd(farm, rngStream(8, HERD_STREAM))!;
    expect(farm.mobs.length).toBe(1);
    expect(farm.mobs[0]!.name).toBe('Mob 1');
    expect(farm.mobs[0]!.animals.filter((a) => a.kind === 'cow').length).toBe(h.cows);
    expect(
      farm.mobs[0]!.animals.filter((a) => a.kind === 'steer' || a.kind === 'heifer').length,
    ).toBe(h.weaners);
    expect(farm.nextMobId).toBe(3);
  });

  it('with no water anywhere there is no herd', () => {
    const farm = createFarm(options({ seed: 8, startType: 'scratch' }));
    farm.layout = { ...farm.layout, water: { ...farm.layout.water, troughs: [] } };
    expect(startHerd(farm, rngStream(8, HERD_STREAM))).toBeNull();
    expect(farm.mobs).toEqual([]);
  });
});

describe('createFarm', () => {
  it('gives the same farm for the same seed and choices, and another for another seed', () => {
    const a = farmHash(createFarm(options()));
    expect(farmHash(createFarm(options()))).toBe(a);
    expect(farmHash(createFarm(options({ seed: 43 })))).not.toBe(a);
    expect(farmHash(createFarm(options({ difficulty: 'hard' })))).not.toBe(a);
    expect(farmHash(createFarm(options({ start: { year: 2023, month: 9 } })))).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('takes the land, fences, water and buildings from generateFarm unchanged', () => {
    for (const startType of ['scratch', 'running'] as const) {
      const o = options({ startType, mixed: { arablePct: 20, croppedPct: 50 } });
      const farm = createFarm(o);
      const gen = generateFarm({
        seed: o.seed,
        district: o.district,
        farmHa: FARM_SIZES.nsw[1],
        start: o.start,
        startType,
        mixed: o.mixed,
      });
      expect(farm.pasture).toEqual(gen.pasture);
      expect(farm.crops).toEqual(gen.crops);
      expect(farm.layout).toEqual(gen.layout);
      expect(farm.buildings).toEqual(gen.buildings);
      expect(farm.arablePct).toBe(20);
      expect(farm.mixed).toBe(true);
      expect(farm.layout.scale.farmHa).toBe(1000);
    }
  });

  it('sets the money by district, size and difficulty, with a quarter of the cash for a herd', () => {
    for (const id of DISTRICT_IDS) {
      for (const size of ['small', 'medium', 'large'] as const) {
        const ha = FARM_SIZES[id][['small', 'medium', 'large'].indexOf(size)]!;
        for (const startType of ['scratch', 'running'] as const) {
          const farm = createFarm(options({ district: id, size, startType, difficulty: 'hard' }));
          const m = startMoney(id, ha, 'hard', startType === 'running');
          expect([farm.cash, farm.startCash, farm.overdraft, farm.broke]).toEqual([
            m.cash,
            m.cash,
            m.overdraft,
            m.broke,
          ]);
          expect(farm.difficulty).toBe('hard');
          expect(farm.mobs.length > 0).toBe(startType === 'running');
        }
      }
    }
    const custom = createFarm(
      options({ size: 260, money: { cash: 1, overdraft: -2, broke: -3 }, startType: 'scratch' }),
    );
    expect([custom.cash, custom.overdraft, custom.broke, custom.difficulty]).toEqual([
      1,
      -2,
      -3,
      'custom',
    ]);
    expect(custom.layout.scale.farmHa).toBe(260);
  });

  it('starts on day 0 with a year open at the farm net worth, and nothing in the ledger', () => {
    const farm = createFarm(options());
    expect(farm.day).toBe(0);
    expect(farm.engineVersion).toBe(ENGINE_VERSION);
    expect(farm.saveFormat).toBe(SAVE_FORMAT_VERSION);
    expect(farm.years).toEqual([]);
    expect(farm.year.start).toBe(0);
    expect(farm.year.worth0).toBe(netWorth(farm));
    // The fences and troughs came with the farm. Nothing was spent on them, so they count for nothing.
    expect(farm.ledger).toEqual({
      edges: {},
      pipe: 0,
      troughs: {},
      hubs: {},
      ports: {},
      energiser: 0,
      pasture: {},
    });
    expect(farm.year.worth0).toBeGreaterThan(farm.cash);
    expect(farm.over).toBeNull();
    expect(farm.actionLog).toEqual([]);
    expect(farm.noFeedDays).toBe(0);
  });

  it('comes with an energiser only when it comes with electric fence', () => {
    let withElectric = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const farm = createFarm(options({ seed, size: 'small' }));
      const electric = [...farm.layout.fences.hE, ...farm.layout.fences.vE].includes(2);
      expect(farm.energiser).toBe(electric);
      if (electric) withElectric++;
    }
    expect(withElectric).toBeGreaterThan(0);
    expect(withElectric).toBeLessThan(12);
    expect(createFarm(options({ startType: 'scratch' })).energiser).toBe(false);
  });

  it('a market that drew numbers to open saves its stream where the opening left it', () => {
    // From 2026 the price series has run out, so the market draws its first months as it opens.
    const start = { year: 2027, month: 3 };
    const farm = createFarm(options({ start, startType: 'scratch' }));
    expect(farm.market.ext.length).toBeGreaterThan(10);
    const replay = rngStream(42, 'market');
    const opened = standInMarket.open(start, replay);
    expect(farm.market).toEqual(opened);
    expect(farm.rng.market).toEqual(replay.state());
    expect(farm.rng.market).not.toEqual(rngStream(42, 'market').state());
    // Before 2026 nothing is drawn.
    const early = createFarm(options({ startType: 'scratch' }));
    expect(early.market.ext).toEqual([]);
    expect(early.rng.market).toEqual(rngStream(42, 'market').state());
  });

  it('tells the player what the farm came with, as the first inbox message', () => {
    const farm = createFarm(options());
    expect(farm.inbox.length).toBe(1);
    const e = farm.inbox[0]!;
    expect(e.day).toBe(0);
    expect(e.seq).toBe(1);
    expect(farm.inboxSeq).toBe(2);
    const started = e.event as FarmStarted;
    expect(started.type).toBe('farm-started');
    expect(started.farmHa).toBe(1000);
    expect(started.cash).toBe(farm.cash);
    expect(started.improvements.troughs).toBe(farm.layout.water.troughs.length);
    expect(started.herd!.cows).toBeGreaterThan(9);
    expect(started.season.factor).toBeGreaterThan(0);
    const scratch = createFarm(options({ startType: 'scratch' })).inbox[0]!.event as FarmStarted;
    expect(scratch.herd).toBeNull();
  });

  it.each(DISTRICT_IDS)('%s: a herd from each stream, the others unmoved', (id: DistrictId) => {
    // The herd has its own stream: the same land with and without it.
    const a = createFarm(options({ district: id, seed: 77 }));
    const gen = generateFarm({
      seed: 77,
      district: id,
      farmHa: FARM_SIZES[id][1],
      start: { year: 2023, month: 8 },
      startType: 'running',
    });
    expect(a.pasture.G).toEqual(gen.pasture.G);
    expect(a.layout.fences).toEqual(gen.layout.fences);
    // The streams the farm plays from have not been drawn on yet.
    const b = createFarm(options({ district: id, seed: 77 }));
    expect(b.rng).toEqual(a.rng);
    expect(new Set(Object.values(a.rng).map((s) => s.join())).size).toBe(6);
  });
});
