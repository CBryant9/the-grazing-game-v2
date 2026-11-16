import { describe, expect, it } from 'vitest';
import {
  clearLastFarm,
  loadLastFarm,
  looksLikeSnapshot,
  OFFLINE_KEY,
  saveLastFarm,
} from './offline';
import { SNAPSHOT_VERSION, type Snapshot } from './types';

/** Enough of a snapshot to pass the shape check. The check does not look any deeper. */
const snap = (patch: Record<string, unknown> = {}): Snapshot =>
  ({
    version: SNAPSHOT_VERSION,
    farmVersion: 'v1',
    farm: { name: 'Kooringa' },
    day: 12,
    totals: {},
    clock: {},
    view: { paddocks: [] },
    todo: [],
    mobs: [],
    paddocks: [],
    inbox: [],
    ...patch,
  }) as unknown as Snapshot;

function memory(limit = Infinity) {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > limit) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('the farm kept for offline viewing', () => {
  it('comes back as it was saved', () => {
    const store = memory();
    saveLastFarm(snap({ day: 40 }), store);
    expect(loadLastFarm(store)?.day).toBe(40);
  });

  it('is null when nothing was saved', () => {
    expect(loadLastFarm(memory())).toBeNull();
  });

  it('is null for text that is not a saved farm', () => {
    const store = memory();
    store.setItem(OFFLINE_KEY, '{not json');
    expect(loadLastFarm(store)).toBeNull();
    store.setItem(OFFLINE_KEY, JSON.stringify({ v: SNAPSHOT_VERSION, snapshot: { day: 3 } }));
    expect(loadLastFarm(store)).toBeNull();
  });

  it('is null when the snapshot format has moved on', () => {
    const store = memory();
    store.setItem(OFFLINE_KEY, JSON.stringify({ v: SNAPSHOT_VERSION + 1, snapshot: snap() }));
    expect(loadLastFarm(store)).toBeNull();
  });

  it('forgets the farm when asked', () => {
    const store = memory();
    saveLastFarm(snap(), store);
    clearLastFarm(store);
    expect(loadLastFarm(store)).toBeNull();
  });

  it('never throws without storage', () => {
    expect(() => saveLastFarm(snap(), null)).not.toThrow();
    expect(loadLastFarm(null)).toBeNull();
    expect(() => clearLastFarm(null)).not.toThrow();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveLastFarm(snap(), broken)).not.toThrow();
    expect(loadLastFarm(broken)).toBeNull();
    expect(() => clearLastFarm(broken)).not.toThrow();
  });

  it('drops the old copy when the new one does not fit, so a stale farm is never shown', () => {
    const store = memory(4000);
    saveLastFarm(snap({ day: 1 }), store);
    expect(loadLastFarm(store)?.day).toBe(1);
    saveLastFarm(
      snap({ day: 2, todo: Array.from({ length: 500 }, () => ({ text: 'x'.repeat(20) })) }),
      store,
    );
    expect(loadLastFarm(store)).toBeNull();
  });

  it('checks the parts the screen needs', () => {
    expect(looksLikeSnapshot(snap())).toBe(true);
    expect(looksLikeSnapshot(snap({ mobs: 'no' }))).toBe(false);
    expect(looksLikeSnapshot(snap({ view: null }))).toBe(false);
    expect(looksLikeSnapshot(null)).toBe(false);
    expect(looksLikeSnapshot('x')).toBe(false);
  });
});
