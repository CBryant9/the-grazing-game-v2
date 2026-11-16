import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { PLENTY, act, boxEdges, cellAt, farCorner, notFinite } from '../../test-support/wholeFarm';
import { applyInstantly } from '../../test-support/instant';
import type { Action } from '../actions/types';
import { EDGE } from '../farm/topology';
import { GRID_N } from '../grid';
import { asStandIn } from '../market/standIn';
import { rngStream } from '../rng';
import { createFarm } from '../sim/create';
import { cloneFarm, emptyLedger, type FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { ENGINE_VERSION, SAVE_FORMAT_VERSION } from '../version';
import { farmHash, fromBase64, loadFarm, saveFarm, toBase64, type SavedFarm } from './save';

vi.setConfig({ testTimeout: 600_000 });

/** A save as it comes back from storage: through JSON text. */
const viaJson = (farm: FarmState): FarmState =>
  loadFarm(JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm);

const running = (seed: number, district: (typeof DISTRICT_IDS)[number] = 'nsw'): FarmState =>
  createFarm({
    seed,
    district,
    size: 'small',
    start: { year: 2023, month: 2 },
    startType: 'running',
    mixed: { arablePct: district === 'nsw' ? 20 : 40, croppedPct: 50 },
    difficulty: 'easy',
    money: { ...PLENTY },
  });

describe('base64', () => {
  it('the standard examples', () => {
    const bytes = (t: string): Uint8Array => Uint8Array.from(t, (c) => c.charCodeAt(0));
    expect(toBase64(bytes(''))).toBe('');
    expect(toBase64(bytes('M'))).toBe('TQ==');
    expect(toBase64(bytes('Ma'))).toBe('TWE=');
    expect(toBase64(bytes('Man'))).toBe('TWFu');
    expect(toBase64(bytes('Many hands'))).toBe('TWFueSBoYW5kcw==');
    expect(toBase64(Uint8Array.from([0, 255, 254, 253, 252, 251]))).toBe('AP/+/fz7');
    expect(Array.from(fromBase64('TWFueSBoYW5kcw=='))).toEqual(Array.from(bytes('Many hands')));
  });

  it('every length and every byte value comes back the same', () => {
    const rng = rngStream(1, 'bytes');
    for (let n = 0; n < 70; n++) {
      const b = Uint8Array.from({ length: n }, () => rng.int(0, 255));
      expect(Array.from(fromBase64(toBase64(b))), `length ${n}`).toEqual(Array.from(b));
    }
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(Array.from(fromBase64(toBase64(all)))).toEqual(Array.from(all));
  });
});

describe('a saved farm', () => {
  it('is plain data that survives JSON, with its versions on it', () => {
    const farm = running(3);
    for (let d = 0; d < 20; d++) stepDay(farm);
    const hash = farmHash(farm);
    const saved = saveFarm(farm);
    expect(saved.saveFormat).toBe(SAVE_FORMAT_VERSION);
    expect(saved.engineVersion).toBe(ENGINE_VERSION);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
    // Saving does not change the farm.
    expect(farmHash(farm)).toBe(hash);
    // Arrays and cattle are packed as text.
    const text = JSON.stringify(saved);
    expect(text).toContain('"$":"f32"');
    expect(text).toContain('"$":"animals"');
  });

  it('loads back as the same farm, to the last bit of every figure', () => {
    for (const id of DISTRICT_IDS) {
      const farm = running(11, id);
      for (let d = 0; d < 40; d++) stepDay(farm);
      const back = viaJson(farm);
      expect(back).toEqual(farm);
      expect(farmHash(back)).toBe(farmHash(farm));
      for (const key of ['G', 'D', 'A', 'X', 'F', 'graz', 'grown'] as const) {
        expect(back.pasture[key]).toBeInstanceOf(Float32Array);
        expect(Array.from(back.pasture[key])).toEqual(Array.from(farm.pasture[key]));
      }
      expect(back.pasture.land).toBeInstanceOf(Uint8Array);
      expect(back.pasture.lastG).toBeInstanceOf(Int32Array);
      expect(back.crops.fid).toBeInstanceOf(Int16Array);
      expect(back.layout.fences.hE).toBeInstanceOf(Uint8Array);
      // The day's growth is saved too, so a paddock sheet reads the same after a reload.
      expect(back.pasture.grown.some((v) => v > 0)).toBe(true);
    }
  });

  it('keeps awkward numbers exactly: minus zero, tiny, huge and long fractions', () => {
    const farm = running(5);
    const a = farm.mobs[0]!.animals[0]!;
    a.wt = 431.12345678901234;
    a.adg = -0;
    a.cond = 5e-324;
    a.cost = 1.7976931348623157e308;
    a.milk = 0.1 + 0.2;
    a.di = undefined;
    const b = farm.mobs[0]!.animals[1]!;
    b.di = 0;
    b.dead = true;
    b.young = true;
    b.barren = true;
    farm.cash = 123456.78901234567;
    const back = viaJson(farm);
    const a2 = back.mobs[0]!.animals[0]!;
    expect(Object.is(a2.wt, a.wt)).toBe(true);
    expect(Object.is(a2.adg, -0)).toBe(true);
    expect(a2.cond).toBe(5e-324);
    expect(a2.cost).toBe(1.7976931348623157e308);
    expect(a2.milk).toBe(0.30000000000000004);
    expect(a2.di).toBeUndefined();
    const b2 = back.mobs[0]!.animals[1]!;
    expect([b2.di, b2.dead, b2.young, b2.barren]).toEqual([0, true, true, true]);
    expect(back.cash).toBe(123456.78901234567);
  });

  it('is small: the cattle take about 110 characters a head', () => {
    const farm = running(3);
    const head = farm.mobs.reduce((n, m) => n + m.animals.length, 0);
    const size = JSON.stringify(saveFarm(farm)).length;
    const empty = cloneFarm(farm);
    empty.mobs = [];
    const land = JSON.stringify(saveFarm(empty)).length;
    expect(head).toBeGreaterThan(100);
    expect((size - land) / head).toBeLessThan(125);
    expect(land).toBeLessThan(90_000);
  });

  it('will not save a farm with a figure that is not a number', () => {
    const farm = running(3);
    farm.cash = NaN;
    expect(() => saveFarm(farm)).toThrow(/cash/);
    farm.cash = 1;
    farm.mobs[0]!.animals[0]!.age = 3.5;
    expect(() => saveFarm(farm)).toThrow(/whole number/);
  });
});

describe('save, load and carry on', () => {
  it.each(DISTRICT_IDS)('%s: is exactly the farm that ran straight through, day by day', (id) => {
    const script = (reload: boolean): string[] => {
      let farm = running(20 + DISTRICT_IDS.indexOf(id), id);
      const [x0, y0] = farCorner(farm);
      const bore = farm.layout.water.bore;
      const jobs: [number, Action][] = [
        [2, { type: 'buyCattle', cls: 'cowCalf', qty: 20, to: { cell: bore } }],
        [5, { type: 'buildFence', edges: boxEdges(x0, y0, x0 + 3, y0 + 3), fence: 'tape' }],
        [6, { type: 'placePortable', cell: cellAt(x0 + 1, y0 + 1) }],
        [7, { type: 'buyCattle', cls: 'yearSteer', qty: 60, to: { cell: cellAt(x0 + 1, y0 + 1) } }],
        [40, { type: 'sellClass', cls: 'cow', qty: 4 }],
        [90, { type: 'sellClass', cls: 'feed', qty: 10 }],
      ];
      const hashes: string[] = [];
      for (let d = 0; d < 200 && !farm.over; d++) {
        for (const [day, job] of jobs) {
          if (day !== d) continue;
          const out = applyInstantly(farm, job);
          if (out.ok) farm = out.farm;
        }
        stepDay(farm);
        // Every 3 days the farm goes to storage and comes back.
        if (reload && d % 3 === 0) farm = viaJson(farm);
        if (d % 10 === 9) hashes.push(farmHash(farm));
      }
      expect(hashes.length).toBe(20);
      expect(notFinite(farm)).toEqual([]);
      // The run had cattle born, weaned, joined and lost, and tape pushed down.
      const types = new Set(farm.inbox.map((m) => m.event.type));
      expect(farm.year.births).toBeGreaterThan(0);
      expect(types.size).toBeGreaterThan(3);
      return hashes;
    };
    const straight = script(false);
    const reloaded = script(true);
    expect(reloaded).toEqual(straight);
    expect(new Set(straight).size).toBe(straight.length);
  });

  it('a copy of a farm carries on the same as the farm', () => {
    const farm = running(9);
    for (let d = 0; d < 30; d++) stepDay(farm);
    const copy = cloneFarm(farm);
    expect(farmHash(copy)).toBe(farmHash(farm));
    for (let d = 0; d < 30; d++) {
      stepDay(farm);
      stepDay(copy);
    }
    expect(farmHash(copy)).toBe(farmHash(farm));
    // And the copy is a separate farm.
    copy.pasture.G[0] = copy.pasture.G[0]! + 1;
    copy.mobs[0]!.animals[0]!.wt += 1;
    expect(farmHash(copy)).not.toBe(farmHash(farm));
  });
});

/** A save as loose data, so fields can be taken out of it. */
interface OldSave {
  [key: string]: unknown;
  mobs: Record<string, unknown>[];
  pasture: Record<string, unknown>;
  crops: Record<string, unknown>;
  layout: { tapeOnRoll?: number; water: Record<string, unknown> };
}

describe('old saves', () => {
  it('are upgraded with defaults for everything they do not have', () => {
    let farm = running(3);
    farm = act(farm, { type: 'placePortable', cell: 5 });
    for (let d = 0; d < 5; d++) stepDay(farm);
    const old = JSON.parse(JSON.stringify(saveFarm(farm))) as OldSave;
    old.saveFormat = 0;
    old.engineVersion = '0.1.0';
    for (const key of [
      'inbox',
      'inboxSeq',
      'actionLog',
      'noFeedDays',
      'over',
      'priceHistory',
      'years',
      'energiser',
      'ledger',
    ]) {
      delete old[key];
    }
    for (const m of old.mobs) {
      for (const key of ['lastBreak', 'join', 'st', 'markNote', 'calvNote', 'openNote'])
        delete m[key];
    }
    delete old.pasture.grown;
    delete old.crops.regen;
    delete old.crops.rotBlocks;
    delete old.layout.tapeOnRoll;
    delete old.layout.water.nextPortId;

    const loaded = loadFarm(old as unknown as SavedFarm);
    expect(loaded.saveFormat).toBe(SAVE_FORMAT_VERSION);
    expect(loaded.engineVersion).toBe(ENGINE_VERSION);
    expect(loaded.inbox).toEqual([]);
    expect(loaded.inboxSeq).toBe(1);
    expect(loaded.actionLog).toEqual([]);
    expect(loaded.noFeedDays).toBe(0);
    expect(loaded.over).toBeNull();
    expect(loaded.priceHistory).toEqual([]);
    expect(loaded.years).toEqual([]);
    expect(loaded.energiser).toBe(false);
    expect(loaded.ledger).toEqual(emptyLedger());
    for (const m of loaded.mobs) {
      expect([m.lastBreak, m.join, m.st, m.markNote, m.calvNote, m.openNote]).toEqual([
        null,
        null,
        null,
        null,
        null,
        null,
      ]);
    }
    expect(loaded.pasture.grown).toEqual(new Float32Array(GRID_N));
    expect(loaded.crops.regen).toEqual([]);
    expect(loaded.crops.rotBlocks).toEqual([]);
    expect(loaded.layout.tapeOnRoll).toBe(0);
    // The next portable trough id carries on past the ones on the farm.
    expect(loaded.layout.water.nextPortId).toBe(farm.layout.water.ports[0]!.id + 1);
    // Everything else is as it was, and the farm runs.
    expect(loaded.cash).toBe(farm.cash);
    expect(loaded.pasture.G).toEqual(farm.pasture.G);
    expect(loaded.mobs.map((m) => m.animals)).toEqual(farm.mobs.map((m) => m.animals));
    for (let d = 0; d < 30; d++) stepDay(loaded);
    expect(notFinite(loaded)).toEqual([]);
    expect(loaded.day).toBe(35);
    expect(applyInstantly(loaded, { type: 'placePortable', cell: 9 }).ok).toBe(true);
  });

  it('keeps what an old save does have, and numbers the inbox on from it', () => {
    const farm = running(3);
    for (let d = 0; d < 40; d++) stepDay(farm);
    const old = JSON.parse(JSON.stringify(saveFarm(farm))) as OldSave;
    delete old.inboxSeq;
    delete old.saveFormat;
    old.ledger = { pipe: 720 };
    const loaded = loadFarm(old as unknown as SavedFarm);
    expect(loaded.inbox).toEqual(farm.inbox);
    expect(loaded.inboxSeq).toBe(farm.inboxSeq);
    expect(loaded.ledger).toEqual({ ...emptyLedger(), pipe: 720 });
  });

  it('a save from a newer game is refused', () => {
    const saved = saveFarm(running(3));
    saved.saveFormat = SAVE_FORMAT_VERSION + 1;
    expect(() => loadFarm(saved)).toThrow(/newer version/);
  });
});

describe('the farm hash', () => {
  it('is 16 hex digits, the same for the same farm and different for any change', () => {
    const farm = running(3);
    for (let d = 0; d < 10; d++) stepDay(farm);
    const hash = farmHash(farm);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(farmHash(cloneFarm(farm))).toBe(hash);
    const changes: ((f: FarmState) => void)[] = [
      (f) => (f.cash += 1e-9),
      (f) => (f.day += 1),
      (f) => (f.pasture.G[517] = f.pasture.G[517]! + 0.001),
      (f) => (f.pasture.lastG[3] = 7),
      (f) => (f.pasture.land[900] = 4),
      (f) => (f.crops.yieldT[5] = 0.5),
      (f) => (f.layout.fences.hE[300] = EDGE.tape),
      (f) => (f.layout.tapeOnRoll = 1),
      (f) => (f.mobs[0]!.animals[7]!.wt += 1e-9),
      (f) => (f.mobs[0]!.animals[7]!.barren = !f.mobs[0]!.animals[7]!.barren),
      (f) => (f.mobs[0]!.animals[7]!.sex = 'M'),
      (f) => (f.mobs[0]!.animals[7]!.preg += 1),
      (f) => (f.mobs[0]!.supp = 'pellet'),
      (f) => (f.mobs[0]!.dry = 1),
      (f) => (f.mobs[0]!.name = 'Other'),
      (f) => (f.mobs[0]!.where = { kind: 'lot' }),
      (f) => (f.rng.deaths = [1, 2, 3, 4]),
      (f) => (asStandIn(f.market).noise += 1e-12),
      (f) => (asStandIn(f.market).drift.cow += 1e-12),
      (f) => (f.year.grown += 1),
      (f) => (f.ledger.pipe = 1),
      (f) => (f.ledger.edges.h5 = 350),
      (f) => (f.noFeedDays = 1),
      (f) => (f.over = { reason: 'feed', day: 3 }),
      (f) => f.inbox.pop(),
      (f) => f.actionLog.push({ day: 1, action: { type: 'markCalves', mob: 1 } }),
      (f) => (f.energiser = !f.energiser),
      (f) => (f.seed += 1),
      (f) => (f.engineVersion = '9.9.9'),
    ];
    const seen = new Set([hash]);
    for (const change of changes) {
      const f = cloneFarm(farm);
      change(f);
      const h = farmHash(f);
      expect(seen.has(h), change.toString()).toBe(false);
      seen.add(h);
    }
    expect(farmHash(farm)).toBe(hash);
  });

  it('does not depend on the order the farm object was put together in', () => {
    const farm = running(3);
    const shuffled = {} as Record<string, unknown>;
    for (const k of Object.keys(farm).reverse())
      shuffled[k] = (farm as unknown as Record<string, unknown>)[k];
    expect(Object.keys(shuffled)[0]).not.toBe(Object.keys(farm)[0]);
    expect(farmHash(shuffled as unknown as FarmState)).toBe(farmHash(farm));
  });
});
