'use client';

import { useEffect, useId, useSyncExternalStore } from 'react';
import type { AdSlotId } from '@gg/shared';
import { visibleSlots, type AdLayout, type AdScreen } from './registry';

/**
 * Who may be on screen right now. Every ad with something to show registers here, and `visibleSlots`
 * (the registry) decides which of them may draw: on a phone only one, and none under a summary
 * or the year end card. A slot that is not let through draws nothing and counts no view. This is
 * the one place the "never two ad units on one phone screen" rule is applied in the browser.
 */

interface Entry {
  key: string;
  id: AdSlotId;
  screen: AdScreen;
}

let entries: Entry[] = [];
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = (): Entry[] => entries;

/** For tests. */
export function resetLeases(): void {
  entries = [];
  emit();
}

export function register(key: string, id: AdSlotId, screen: AdScreen): () => void {
  entries = [...entries.filter((e) => e.key !== key), { key, id, screen }];
  emit();
  return () => {
    entries = entries.filter((e) => e.key !== key);
    emit();
  };
}

/** The keys of the entries allowed on screen in this layout. */
export function allowedKeys(list: readonly Entry[], layout: AdLayout): Set<string> {
  const ok = new Set(visibleSlots(list, layout));
  // A slot id can only be mounted once per screen in practice; the first entry for an id wins.
  const keys = new Set<string>();
  const seen = new Set<AdSlotId>();
  for (const e of list) {
    if (ok.has(e.id) && !seen.has(e.id)) {
      seen.add(e.id);
      keys.add(e.key);
    }
  }
  return keys;
}

/**
 * Register while `active` (the slot has something to show) and answer whether it may draw.
 * `layout` is the player's layout now.
 */
export function useAdLease(
  id: AdSlotId,
  screen: AdScreen,
  layout: AdLayout,
  active: boolean,
): boolean {
  const key = useId();
  useEffect(() => (active ? register(key, id, screen) : undefined), [active, key, id, screen]);
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  return active && allowedKeys(list, layout).has(key);
}
