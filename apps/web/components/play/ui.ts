'use client';

import { create } from 'zustand';

/**
 * Screen-only state for the play screen's look (m8, matching the mockups): whether the build
 * tray is open on a phone, which page of More is open beyond the ones the game store keeps,
 * and where the map was last asked to look. Nothing here is a game rule or a figure.
 */
export type MoreExtra = 'inbox' | 'help' | 'farm' | 'account' | 'settings' | 'feed' | null;

/** A square for the map to frame. `seq` changes on every ask, so asking for the same square again still moves the map. */
export interface MapFocus {
  square: number;
  seq: number;
}

interface UiState {
  /** The build tray on a phone (upright or on its side). A PC's tools are always in the panel. */
  trayOpen: boolean;
  moreExtra: MoreExtra;
  /** Where a Things to do button or a first step asked the map to look. */
  focus: MapFocus | null;
  /** First steps put away, by farm name. Read from the browser's storage the first time. */
  firstOff: Record<string, string[]>;
  setTray: (open: boolean) => void;
  setMoreExtra: (page: MoreExtra) => void;
  /** Frame the map on a square (zoomed in enough to build there). */
  focusOn: (square: number) => void;
  setFirstOff: (farm: string, keys: string[]) => void;
}

export const useUi = create<UiState>()((set) => ({
  trayOpen: false,
  moreExtra: null,
  focus: null,
  firstOff: {},
  setTray: (trayOpen) => set({ trayOpen }),
  setMoreExtra: (moreExtra) => set({ moreExtra }),
  focusOn: (square) => set((s) => ({ focus: { square, seq: (s.focus?.seq ?? 0) + 1 } })),
  setFirstOff: (farm, keys) => set((s) => ({ firstOff: { ...s.firstOff, [farm]: keys } })),
}));
