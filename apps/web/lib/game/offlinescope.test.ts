import { describe, expect, it } from 'vitest';
import {
  GUEST,
  OFFLINE_KEY,
  SCOPE_KEY,
  clearAllLastFarms,
  clearLastFarm,
  keyFor,
  lastScope,
  loadLastFarm,
  rememberScope,
  saveLastFarm,
} from './offline';
import { SNAPSHOT_VERSION, type Snapshot } from './types';

/** A small in-memory Storage. */
function storage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    keys: () => [...m.keys()],
  };
}

const snap = (name: string): Snapshot =>
  ({
    version: SNAPSHOT_VERSION,
    farmVersion: 'v1',
    farm: { name, district: 'wv', setup: {} },
    day: 3,
    mobs: [],
    paddocks: [],
    todo: [],
    inbox: [],
    view: { paddocks: [] },
    clock: {},
    totals: {},
  }) as unknown as Snapshot;

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('the offline copy is kept for one player', () => {
  it('a guest keeps the old key, an account its own', () => {
    expect(keyFor(GUEST)).toBe(OFFLINE_KEY);
    expect(keyFor(A)).toBe(`${OFFLINE_KEY}:${A}`);
  });

  it("one player never sees another player's farm on a shared device", () => {
    const s = storage();
    saveLastFarm(snap('Annie Farm'), s, A);
    saveLastFarm(snap('Guest Farm'), s, GUEST);
    expect(loadLastFarm(s, A)?.farm.name).toBe('Annie Farm');
    expect(loadLastFarm(s, GUEST)?.farm.name).toBe('Guest Farm');
    expect(loadLastFarm(s, B)).toBeNull();
    clearLastFarm(s, A);
    expect(loadLastFarm(s, A)).toBeNull();
    expect(loadLastFarm(s, GUEST)?.farm.name).toBe('Guest Farm');
  });

  it('signing out clears every copy and who was last seen', () => {
    const s = storage();
    saveLastFarm(snap('One'), s, A);
    saveLastFarm(snap('Two'), s, B);
    saveLastFarm(snap('Three'), s, GUEST);
    rememberScope(A, s);
    s.setItem('some-other-setting', 'keep');
    clearAllLastFarms(s);
    expect(s.keys()).toEqual(['some-other-setting']);
    expect(lastScope(s)).toBe(GUEST);
  });

  it('remembers who was last seen, for the offline view to find their copy', () => {
    const s = storage();
    expect(lastScope(s)).toBe(GUEST);
    rememberScope(A, s);
    expect(lastScope(s)).toBe(A);
    // Nothing odd is trusted as a scope: it would become part of a storage key.
    s.setItem(SCOPE_KEY, '../../x');
    expect(lastScope(s)).toBe(GUEST);
  });

  it('works with no storage at all', () => {
    expect(() => clearAllLastFarms(null)).not.toThrow();
    expect(lastScope(null)).toBe(GUEST);
  });
});
