import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SetupChoices } from '../../lib/game/types';
import { FARM_STALE_DAYS, GameServer, farmIdFor } from './game';
import { FileFarmStore, MemoryFarmStore, STORED_FORMAT, upgradeStored } from './store';

const choices: SetupChoices = {
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'scratch',
  difficulty: 'medium',
  name: 'Cap Test',
};
const session = (n: number): string => n.toString(16).padStart(32, '0');
const DAY = 86_400_000;

describe('how many farms are kept', () => {
  it('refuses a new farm once the cap is reached, with a plain message', async () => {
    const store = new MemoryFarmStore();
    const game = new GameServer({ store, seed: () => 3, maxFarms: 3 });
    for (let i = 1; i <= 3; i++) await game.create(session(i), choices);
    await expect(game.create(session(4), choices)).rejects.toMatchObject({
      status: 503,
      message: 'The game is full right now. Try again later.',
    });
    expect(await store.count()).toBe(3);
  });

  it('removes farms not used for the set number of days, which makes room', async () => {
    let now = 1_000 * DAY;
    const store = new MemoryFarmStore();
    store.now = () => now;
    const game = new GameServer({ store, seed: () => 3, maxFarms: 2, now: () => now });
    await game.create(session(1), choices);
    await game.create(session(2), choices);
    // Farm 2 is used again later. Farm 1 is left.
    now += (FARM_STALE_DAYS - 1) * DAY;
    await game.endDay(session(2));
    now += 2 * DAY;
    await game.create(session(3), choices);
    expect(await store.count()).toBe(2);
    // Farm 1 is gone (not used for more than the set days). Farm 2 is kept.
    const fresh = new GameServer({ store, seed: () => 3 });
    expect(await fresh.snapshot(session(1))).toBeNull();
    expect(await fresh.snapshot(session(2))).not.toBeNull();
  });

  it('the file store counts farms and removes stale ones by when they were last used', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gg-cap-'));
    try {
      const store = new FileFarmStore(dir);
      const game = new GameServer({ store, seed: () => 3 });
      await game.create(session(1), choices);
      await game.create(session(2), choices);
      expect(await store.count()).toBe(2);
      const old = new Date(Date.now() - (FARM_STALE_DAYS + 1) * DAY);
      utimesSync(join(dir, `${farmIdFor(session(1))}.json`), old, old);
      // A file that is not a farm is never touched.
      writeFileSync(join(dir, 'notes.txt'), 'x');
      utimesSync(join(dir, 'notes.txt'), old, old);
      expect(await store.prune(Date.now() - FARM_STALE_DAYS * DAY)).toBe(1);
      expect(readdirSync(dir).sort()).toEqual([`${farmIdFor(session(2))}.json`, 'notes.txt']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('a stored farm that is old or broken', () => {
  it('brings a farm kept before the format number up to date, with defaults', () => {
    const up = upgradeStored(
      { name: 'Old', setup: { district: 'wv' }, saved: { format: 7 }, inboxRead: 4 },
      () => 'v0',
    );
    expect(up).toMatchObject({
      format: STORED_FORMAT,
      name: 'Old',
      version: 'v0',
      done: [],
      inboxRead: 4,
    });
  });

  it('refuses what is not a farm, and a farm from a newer game', () => {
    for (const bad of [null, 'x', [], { name: 'x' }, { name: 1, setup: {}, saved: {} }]) {
      expect(() => upgradeStored(bad, () => 'v')).toThrow();
    }
    expect(() =>
      upgradeStored({ format: STORED_FORMAT + 1, name: 'x', setup: {}, saved: {} }, () => 'v'),
    ).toThrow(/newer/);
  });

  it('a corrupt save: plain message, the file set aside on Start a new farm, then a new farm', async () => {
    const store = new MemoryFarmStore();
    const game = new GameServer({ store, seed: () => 3 });
    const id = farmIdFor(session(9));
    store.putRaw(id, '{"name":"Broken","setup":{},"saved":{"not":"a save"}}');
    expect(await game.snapshot(session(9), true)).toBe('broken');
    await expect(game.snapshot(session(9))).rejects.toMatchObject({ status: 409 });
    await expect(game.endDay(session(9))).rejects.toThrow(/could not be opened/);
    await expect(game.create(session(9), choices)).rejects.toMatchObject({ status: 409 });
    await game.remove(session(9));
    expect(store.setAsideCount()).toBe(1);
    expect(await game.snapshot(session(9))).toBeNull();
    expect((await game.create(session(9), choices)).farm.name).toBe('Cap Test');
  });

  it('a save that is not JSON at all is broken too', async () => {
    const store = new MemoryFarmStore();
    const game = new GameServer({ store, seed: () => 3 });
    store.putRaw(farmIdFor(session(8)), 'not json');
    expect(await game.snapshot(session(8), true)).toBe('broken');
  });
});
