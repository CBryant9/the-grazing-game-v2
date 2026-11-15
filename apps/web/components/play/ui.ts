'use client';

import { create } from 'zustand';
import type { Snapshot } from '@/lib/game/types';

/**
 * Screen-only state for the play screen's look (m8, matching the mockups): whether the build
 * tray is open on a phone, and which page of More is open beyond the ones the game store keeps.
 * Nothing here is a game rule or a figure.
 */
export type MoreExtra = 'inbox' | 'help' | 'farm' | 'account' | 'settings' | null;

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

/*
 * Fields the screens draw when the server sends them. Some are on the playability branch
 * (m8-playability) and arrive with the merge; until then they may be missing, so every read
 * here is optional. The game's own wire types are not changed on this branch.
 */
export interface PendingTotals {
  /** Where the bank takes the farm, dollars (negative). */
  bankLimit?: number;
  lendLimit?: number;
  /** Rain last night, mm. Not sent yet. */
  rainMm?: number | null;
}
export interface PendingPaddock {
  /** "About 12 days" or "Under 800 kg DM/ha". */
  feedText?: string | null;
  /** The neutral comment line on the paddock sheet. Not sent yet. */
  comment?: string | null;
  /** Days since stock last left, for the Rest sort. Not sent yet. */
  restDays?: number | null;
}
export interface PendingMob {
  /** Plain fact lines for a mob that is holding or gaining. Never a warning. */
  details?: string[];
}
export interface PendingBuyClass {
  /** This week's change in c/kg. Not sent yet. */
  weekChangeCKg?: number | null;
}

export const pendingTotals = (s: Snapshot): PendingTotals => s.totals as unknown as PendingTotals;
export const pendingPaddock = (p: object): PendingPaddock => p as unknown as PendingPaddock;
export const pendingMob = (m: object): PendingMob => m as unknown as PendingMob;
