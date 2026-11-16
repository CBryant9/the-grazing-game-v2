import { describe, expect, it } from 'vitest';
import { GameServer, farmIdFor } from './game';
import { MemoryFarmStore } from './store';
import type { SetupChoices } from '../../lib/game/types';

/*
 * What one server process holds in memory stays bounded however many farms it serves (m5.5 load
 * test). Before the fix the "last marked opened" list kept one entry for every farm ever loaded.
 */

const choices: SetupChoices = {
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'Held',
} as SetupChoices;

const session = (n: number): string => n.toString(16).padStart(32, '0');

describe('what a server holds', () => {
  it('stays bounded when many farms are opened one after another', async () => {
    const store = new MemoryFarmStore();
    const game = new GameServer({ store, seed: () => 7, saveRetryMs: [0, 0] });
    await game.create(session(1), choices);
    const text = JSON.stringify(await store.get(farmIdFor(session(1))));
    // 300 farms with the same save, each opened once.
    for (let n = 2; n <= 300; n++) store.putRaw(farmIdFor(session(n)), text);
    for (let n = 1; n <= 300; n++) expect(await game.snapshot(session(n))).not.toBeNull();
    const held = game.heldCounts();
    expect(held.cache).toBeLessThanOrEqual(64);
    expect(held.touched).toBeLessThanOrEqual(128);
    expect(held.queues).toBe(0);
  }, 120_000);
});
