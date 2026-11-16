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
/** Which player this browser last saw, so the offline view can find that player's copy without asking the server. */
export const SCOPE_KEY = 'gg-last-scope';

/**
 * The copy is kept for one player. A guest's copy is under `gg-last-farm`; an account's is under
 * `gg-last-farm:<account id>`. So on a phone or computer two people share, one never sees the
 * other's farm, and signing out clears every copy (`clearAllLastFarms`).
 */
export const GUEST = 'guest';
export const keyFor = (scope: string): string =>
  scope === GUEST ? OFFLINE_KEY : `${OFFLINE_KEY}:${scope}`;

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
export function saveLastFarm(
  snapshot: Snapshot,
  store: Store | null = defaultStore(),
  scope: string = GUEST,
): void {
  if (!store) return;
  try {
    const saved: Saved = { v: SNAPSHOT_VERSION, savedAt: Date.now(), snapshot };
    store.setItem(keyFor(scope), JSON.stringify(saved));
  } catch {
    // Too big for this browser's storage, or storage is off. Drop the old copy
    // so a stale farm is never shown as the last one seen.
    try {
      store.removeItem(keyFor(scope));
    } catch {
      // Nothing more to do.
    }
  }
}

/** The kept snapshot, or null when there is none or it can not be trusted. */
export function loadLastFarm(
  store: Store | null = defaultStore(),
  scope: string = GUEST,
): Snapshot | null {
  if (!store) return null;
  try {
    const raw = store.getItem(keyFor(scope));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Saved> | null;
    if (!saved || saved.v !== SNAPSHOT_VERSION) return null;
    return looksLikeSnapshot(saved.snapshot) ? saved.snapshot : null;
  } catch {
    return null;
  }
}

/** Forget the kept farm: the farm was thrown away, or there is none. */
export function clearLastFarm(store: Store | null = defaultStore(), scope: string = GUEST): void {
  if (!store) return;
  try {
    store.removeItem(keyFor(scope));
  } catch {
    // Nothing to do.
  }
}

type FullStore = Store & Pick<Storage, 'length' | 'key'>;

/** Forget every kept farm, guest's and accounts', and who was last seen. For signing out and deleting an account. */
export function clearAllLastFarms(
  store: FullStore | null = defaultStore() as FullStore | null,
): void {
  if (!store) return;
  try {
    const names: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && (k === OFFLINE_KEY || k.startsWith(`${OFFLINE_KEY}:`) || k === SCOPE_KEY)) {
        names.push(k);
      }
    }
    for (const k of names) store.removeItem(k);
  } catch {
    // Nothing to do.
  }
}

/** Remember who this browser last saw. */
export function rememberScope(scope: string, store: Store | null = defaultStore()): void {
  try {
    store?.setItem(SCOPE_KEY, scope);
  } catch {
    // Not kept: the offline view then looks for the guest's copy.
  }
}

/** Who this browser last saw: an account id or `guest`. Used only when the server can not be asked. */
export function lastScope(store: Store | null = defaultStore()): string {
  try {
    const v = store?.getItem(SCOPE_KEY);
    return v && /^[0-9a-f-]{36}$/.test(v) ? v : GUEST;
  } catch {
    return GUEST;
  }
}
