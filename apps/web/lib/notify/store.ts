import { create } from 'zustand';
import { notifyApi, NotifyApiError, type InboxPage, type NotifyState } from './api';
import { needsHomeScreenGuide, thisDeviceRef } from './device';

/**
 * What the notifications page shows, as the server says. The browser works nothing out from it
 * beyond showing or hiding a control: every rule is checked again on the server.
 */
interface NotifyStore {
  state: NotifyState | null;
  inbox: InboxPage | null;
  error: string | null;
  /** The short code of this browser's own push address, or null. */
  here: string | null;
  /** True on an iPhone or iPad that has not had the game added to the Home Screen. */
  guide: boolean;
  load: () => Promise<void>;
  setInbox: (inbox: InboxPage) => void;
  fail: (message: string) => void;
}

export const useNotify = create<NotifyStore>()((set) => ({
  state: null,
  inbox: null,
  error: null,
  here: null,
  guide: false,
  async load() {
    try {
      const [state, inbox] = await Promise.all([notifyApi.state(), notifyApi.inbox(null)]);
      set({
        state,
        inbox,
        error: null,
        here: await thisDeviceRef(),
        guide: needsHomeScreenGuide(),
      });
    } catch (e) {
      set({
        error:
          e instanceof NotifyApiError ? e.message : 'Something went wrong. Try again in a moment.',
      });
    }
  },
  setInbox: (inbox) => set({ inbox }),
  fail: (message) => set({ error: message }),
}));
