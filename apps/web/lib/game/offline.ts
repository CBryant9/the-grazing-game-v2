import { SNAPSHOT_VERSION, type Snapshot } from './types';

/**
 * Looking at the farm offline (PRD 14.10, "Errors and offline").
 *
 * The last snapshot the server sent is kept in this browser. It is numbers to
 * show and nothing else: the rules and data tables never reach the browser
 * (CLAUDE.md, rule 14). When the game can not be reached, /play shows it
 * read-only. All storage is wrapped, so the page works without it (private
 * windows, blocked site data, a full disk).
 */

export const OFFLINE_KEY = 'gg-last-farm';

/** The one line shown while the farm is the saved copy. */
export const OFFLINE_LINE = 'You are offline. This is the farm as you last saw it.';

/** What is kept: the snapshot and when this browser saw it. */
interface Saved {
  v: typeof SNAPSHOT_VERSION;
  savedAt: number;
  snapshot: Snapshot;
}

/** The parts of a snapshot the play screen can not draw without. */
export function looksLikeSnapshot(x: unknown): x is Snapshot {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Partial<Snapshot>;
  return (
    s.version === SNAPSHOT_VERSION &&
    typeof s.farmVersion === 'string' &&
    typeof s.farm?.name === 'string' &&
    typeof s.day === 'number' &&
    Array.isArray(s.mobs) &&
    Array.isArray(s.paddocks) &&
    Array.isArray(s.todo) &&
    Array.isArray(s.inbox) &&
    typeof s.view === 'object' &&
    s.view !== null &&
    Array.isArray((s.view as { paddocks?: unknown }).paddocks) &&
    typeof s.clock === 'object' &&
    s.clock !== null &&
    typeof s.totals === 'object' &&
    s.totals !== null
  );
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Keep the snapshot. A failure (no storage, no room) is ignored: the farm just can not be seen offline. */
export function saveLastFarm(snapshot: Snapshot, store: Store | null = defaultStore()): void {
  if (!store) return;
  try {
    const saved: Saved = { v: SNAPSHOT_VERSION, savedAt: Date.now(), snapshot };
    store.setItem(OFFLINE_KEY, JSON.stringify(saved));
  } catch {
    // Too big for this browser's storage, or storage is off. Drop the old copy
    // so a stale farm is never shown as the last one seen.
    try {
      store.removeItem(OFFLINE_KEY);
    } catch {
      // Nothing more to do.
    }
  }
}

/** The kept snapshot, or null when there is none or it can not be trusted. */
export function loadLastFarm(store: Store | null = defaultStore()): Snapshot | null {
  if (!store) return null;
  try {
    const raw = store.getItem(OFFLINE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Saved> | null;
    if (!saved || saved.v !== SNAPSHOT_VERSION) return null;
    return looksLikeSnapshot(saved.snapshot) ? saved.snapshot : null;
  } catch {
    return null;
  }
}

/** Forget the kept farm: the farm was thrown away, or there is none. */
export function clearLastFarm(store: Store | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(OFFLINE_KEY);
  } catch {
    // Nothing to do.
  }
}
