'use client';

import { create } from 'zustand';

/**
 * Screen-only state for the play screen's look (m8, matching the mockups): whether the build
 * tray is open on a phone, and which page of More is open beyond the ones the game store keeps.
 * Nothing here is a game rule or a figure.
 */
export type MoreExtra = 'inbox' | 'help' | 'farm' | 'account' | 'settings' | 'feed' | null;

interface UiState {
  /** The build tray on a phone (upright or on its side). A PC's tools are always in the panel. */
  trayOpen: boolean;
  moreExtra: MoreExtra;
  setTray: (open: boolean) => void;
  setMoreExtra: (page: MoreExtra) => void;
}

export const useUi = create<UiState>()((set) => ({
  trayOpen: false,
  moreExtra: null,
  setTray: (trayOpen) => set({ trayOpen }),
  setMoreExtra: (moreExtra) => set({ moreExtra }),
}));
