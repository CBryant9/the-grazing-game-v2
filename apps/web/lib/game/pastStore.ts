import { create } from 'zustand';
import { api, ApiError } from './api';
import type { PastDayWire } from './types';

/**
 * "See the farm on a past day" (milestone 3.2, PRD 5.2). Kept apart from the game store. Reading
 * a past day changes nothing on the farm: it only asks the server for the picture it kept.
 */
interface PastState {
  /** Farm days that have a picture kept, or null until asked. */
  days: number[] | null;
  /** The day being looked at, or null when the farm is shown as it is today. */
  viewing: PastDayWire | null;
  status: 'idle' | 'loading' | 'failed';
  message: string | null;
  loadDays: () => Promise<void>;
  view: (day: number) => Promise<void>;
  back: () => void;
}

const messageOf = (e: unknown): string =>
  e instanceof ApiError ? e.message : 'Something went wrong. Try again in a moment.';

export const usePast = create<PastState>()((set) => ({
  days: null,
  viewing: null,
  status: 'idle',
  message: null,
  async loadDays() {
    try {
      const r = await api.pastDays();
      set({ days: r.days });
    } catch {
      // The Diary still works without the buttons.
      set({ days: [] });
    }
  },
  async view(day) {
    set({ status: 'loading', message: null });
    try {
      const data = await api.pastDay(day);
      set({ viewing: data, status: 'idle' });
    } catch (e) {
      set({ status: 'failed', message: messageOf(e) });
    }
  },
  back: () => set({ viewing: null, status: 'idle', message: null }),
}));
