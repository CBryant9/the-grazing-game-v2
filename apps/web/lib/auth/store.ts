import { create } from 'zustand';
import { authApi } from './api';
import type { MeResponse } from './types';

/**
 * Who the player is, as the server says. Loaded once when a screen needs it. The browser never
 * works anything out from it beyond showing or hiding a link: every rule is checked again on the
 * server for each request.
 */
interface MeState {
  me: MeResponse | null;
  /** True once the server has answered (or failed to). Offline copies wait for this. */
  settled: boolean;
  /** True when the server could not say who the player is. Nothing is then kept for offline. */
  unknown: boolean;
  load: () => Promise<MeResponse | null>;
  reset: () => void;
}

export const useMe = create<MeState>()((set) => ({
  me: null,
  settled: false,
  unknown: false,
  async load() {
    try {
      const me = await authApi.me();
      set({ me, settled: true, unknown: false });
      return me;
    } catch {
      // Not reachable, or no sign-in on this copy: the game plays as a guest. No notice.
      set({ me: null, settled: true, unknown: true });
      return null;
    }
  },
  reset: () => set({ me: null, settled: false, unknown: false }),
}));
