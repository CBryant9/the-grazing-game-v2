import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SetupChoices } from '../../lib/game/types';
import { GameServer, SAVE_FAILED_MESSAGE } from './game';
import { FileFarmStore, MemoryFarmStore, PAST_FILE_DAYS, StoreUnavailableError } from './store';

const choices: SetupChoices = {
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'scratch',
  difficulty: 'medium',
  name: 'Save Test',
};
const A = '0'.repeat(31) + 'a';

function make(store = new MemoryFarmStore(), retry: readonly number[] = [0, 0]) {
  store.enforceVersions = true;
  return { store, game: new GameServer({ store, seed: () => 3, saveRetryMs: retry }) };
}

describe('saving through the file store path', () => {
  it('retries a failed save with a growing wait, and goes through when the store recovers', async () => {
    const { store, game } = make(undefined, [20, 40]);
    await game.create(A, choices);
    store.failPuts = { times: 2, error: new Error('disk busy') };
    const t0 = Date.now();
    const day = await game.endDay(A);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(55);
    expect(day.snapshot.day).toBe(1);
    // It was written once, on the third try.
    expect((await new GameServer({ store }).snapshot(A))?.day).toBe(1);
  });

  it('a save that never goes through is never reported done, and the stored farm is the one before', async () => {
    const { store, game } = make();
    const made = await game.create(A, choices);
    store.failPuts = { times: 99, error: new StoreUnavailableError('gone') };
    const writesBefore = store.writes;
    await expect(game.endDay(A, made.farmVersion)).rejects.toMatchObject({
      status: 503,
      code: 'save_failed',
      message: SAVE_FAILED_MESSAGE,
    });
    expect(store.writes).toBe(writesBefore);
    store.failPuts = null;
    // The server did not keep the day it could not store: the farm is as it was, same version.
    const snap = await game.snapshot(A);
    expect(snap).toMatchObject({ day: 0, farmVersion: made.farmVersion });
    // And the same Next day now works.
    expect((await game.endDay(A, made.farmVersion)).ok).toBe(true);
  });

  it('a job that could not be saved is not on the farm and its request id is free to use again', async () => {
    const { store, game } = make();
    const made = await game.create(A, choices);
    store.failPuts = { times: 99, error: new Error('no space') };
    await expect(
      game.act(
        A,
        { action: { type: 'markCalves', mob: 9999 } },
        { version: made.farmVersion, requestId: 'req-nosave-01' },
      ),
    ).rejects.toMatchObject({ code: 'save_failed' });
    store.failPuts = null;
    const again = await game.act(
      A,
      { action: { type: 'markCalves', mob: 9999 } },
      { version: made.farmVersion, requestId: 'req-nosave-01' },
    );
    expect(again).toMatchObject({ ok: false });
    expect('repeat' in again).toBe(false);
  });

  it('two taps on Next day at once change one day, not two', async () => {
    const { game } = make();
    const made = await game.create(A, choices);
    const [x, y] = await Promise.all([
      game.endDay(A, made.farmVersion),
      game.endDay(A, made.farmVersion),
    ]);
    expect([x, y].filter((r) => r.ok)).toHaveLength(1);
    expect([x, y].find((r) => !r.ok)).toMatchObject({ reason: 'stale' });
    expect((await game.snapshot(A))?.day).toBe(1);
  });

  it('two tabs on two servers, one version: the second is told the farm changed and nothing is overwritten', async () => {
    const { store, game } = make();
    const other = new GameServer({ store, seed: () => 3, saveRetryMs: [0, 0] });
    const made = await game.create(A, choices);
    await other.snapshot(A); // the other tab's server has it cached
    const first = await game.endDay(A, made.farmVersion);
    expect(first.ok).toBe(true);
    const second = await other.endDay(A, made.farmVersion);
    expect(second).toMatchObject({ ok: false, reason: 'stale' });
    expect((await game.snapshot(A))?.day).toBe(1);
  });

  it('a stale cache on one server that tries to save over a newer farm loses to the version check', async () => {
    const { store, game } = make();
    const other = new GameServer({ store, seed: () => 3, saveRetryMs: [0, 0] });
    await game.create(A, choices);
    await other.snapshot(A);
    await game.endDay(A); // moves the stored farm on
    // The other server does a job with no version of its own (a script): its held farm is old.
    const res = await other.endDay(A);
    expect(res).toMatchObject({ ok: false, reason: 'stale' });
    expect((await other.snapshot(A))?.day).toBe(1);
  });
});

describe('the file store keeps a smaller history', () => {
  it(`keeps the last ${PAST_FILE_DAYS} days of pictures, in files beside the farm, and removes them with it`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gg-past-'));
    try {
      const store = new FileFarmStore(dir);
      const game = new GameServer({ store, seed: () => 3 });
      await game.create(A, choices);
      for (let i = 0; i < PAST_FILE_DAYS + 3; i++) await game.endDay(A);
      const days = await game.pastDays(A);
      expect(days).toHaveLength(PAST_FILE_DAYS);
      expect(days[0]).toBe(PAST_FILE_DAYS + 3);
      expect((await game.pastDay(A, days[0]!)).day).toBe(days[0]);
      await expect(game.pastDay(A, 1)).rejects.toMatchObject({ status: 404 });
      expect(readdirSync(dir).some((f) => f.endsWith('.past'))).toBe(true);
      await game.remove(A);
      expect(readdirSync(dir).filter((f) => f.endsWith('.past') || f.endsWith('.json'))).toEqual(
        [],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
