import { create } from 'zustand';
import { api, ApiError } from './api';
import type { JobCardWire, SetupChoices, SkipRequestLength, Snapshot, SummaryWire } from './types';

export type Tab = 'farm' | 'market' | 'herd' | 'paddocks' | 'plans' | 'more';

/** One thing to do, from asking about it to its result. The result stays on the row it came from. */
export interface JobState {
  key: string;
  /** The fact and the button, kept so the row can still show after the job is done and gone from the list. */
  text: string;
  button: string;
  phase: 'previewing' | 'confirm' | 'applying' | 'done' | 'refused';
  card?: JobCardWire;
  message?: string;
}

export interface Notice {
  message: string;
  retry?: () => void;
}

interface GameState {
  phase: 'loading' | 'setup' | 'ready' | 'failed';
  snapshot: Snapshot | null;
  /** Requests under way. The map can always be looked at while this is above zero. */
  busy: number;
  notice: Notice | null;
  tab: Tab;
  paddockId: number | null;
  summary: SummaryWire | null;
  jobs: Record<string, JobState>;

  load: () => Promise<void>;
  created: (choices: SetupChoices) => Promise<void>;
  restart: () => Promise<void>;
  nextDay: () => Promise<void>;
  skip: (length: SkipRequestLength, anyway?: boolean) => Promise<void>;
  startJob: (key: string) => Promise<void>;
  confirmJob: (key: string) => Promise<void>;
  dismissJob: (key: string) => void;
  openPaddock: (id: number) => void;
  closePaddock: () => void;
  setTab: (tab: Tab) => void;
  dismissSummary: () => void;
  dismissNotice: () => void;
}

const messageOf = (e: unknown): string =>
  e instanceof ApiError ? e.message : 'Something went wrong. Try again in a moment.';

export const useGame = create<GameState>()((set, get) => {
  /** Run a request with the quiet busy state, and turn a failure into a notice with a retry. */
  async function run<T>(retry: () => void, work: () => Promise<T>): Promise<T | undefined> {
    set((s) => ({ busy: s.busy + 1, notice: null }));
    try {
      return await work();
    } catch (e) {
      set({ notice: { message: messageOf(e), retry } });
      return undefined;
    } finally {
      set((s) => ({ busy: s.busy - 1 }));
    }
  }

  const adopt = (snapshot: Snapshot): Partial<GameState> => ({
    snapshot,
    phase: 'ready',
    // A paddock that is no longer on the farm closes itself.
    paddockId:
      get().paddockId !== null && snapshot.view.paddocks.some((p) => p.id === get().paddockId)
        ? get().paddockId
        : null,
  });

  const setJob = (key: string, patch: Partial<JobState> | null): void =>
    set((s) => {
      const jobs = { ...s.jobs };
      if (patch === null) delete jobs[key];
      else jobs[key] = { ...jobs[key]!, ...patch };
      return { jobs };
    });

  return {
    phase: 'loading',
    snapshot: null,
    busy: 0,
    notice: null,
    tab: 'farm',
    paddockId: null,
    summary: null,
    jobs: {},

    async load() {
      set({ phase: 'loading', notice: null });
      try {
        const { snapshot } = await api.farm();
        set(snapshot ? adopt(snapshot) : { phase: 'setup', snapshot: null });
      } catch (e) {
        set({ phase: 'failed', notice: { message: messageOf(e), retry: () => void get().load() } });
      }
    },

    async created(choices) {
      // Errors go to the setup screen, which has the choices to try again with.
      const { snapshot } = await api.create(choices);
      if (!snapshot) throw new ApiError('The farm could not be started. Try again.');
      set({ ...adopt(snapshot), tab: 'farm', jobs: {}, summary: null });
    },

    async restart() {
      await run(
        () => void get().restart(),
        async () => {
          await api.remove();
          set({
            phase: 'setup',
            snapshot: null,
            jobs: {},
            summary: null,
            paddockId: null,
            tab: 'farm',
          });
        },
      );
    },

    async nextDay() {
      if (get().busy > 0) return;
      await run(
        () => void get().nextDay(),
        async () => {
          const { snapshot, summary } = await api.day();
          set({ ...adopt(snapshot), summary, jobs: {} });
        },
      );
    },

    async skip(length, anyway = false) {
      if (get().busy > 0) return;
      await run(
        () => void get().skip(length, anyway),
        async () => {
          const { snapshot, summary } = await api.skip(length, anyway);
          set({ ...adopt(snapshot), summary, jobs: summary.daysRun > 0 ? {} : get().jobs });
        },
      );
    },

    async startJob(key) {
      const item = get().snapshot?.todo.find((t) => t.key === key);
      if (!item?.button) return;
      set((s) => ({
        jobs: {
          ...s.jobs,
          [key]: { key, text: item.text, button: item.button!, phase: 'previewing' },
        },
      }));
      try {
        const r = await api.preview({ todo: key });
        if (r.ok) setJob(key, { phase: 'confirm', card: r.card });
        else setJob(key, { phase: 'refused', message: r.message });
      } catch (e) {
        setJob(key, { phase: 'refused', message: messageOf(e) });
      }
    },

    async confirmJob(key) {
      if (get().jobs[key]?.phase !== 'confirm' || get().busy > 0) return;
      setJob(key, { phase: 'applying' });
      set((s) => ({ busy: s.busy + 1 }));
      try {
        const r = await api.act({ todo: key });
        if (r.ok) {
          set({ ...adopt(r.snapshot) });
          setJob(key, { phase: 'done', message: r.message, card: r.card ?? get().jobs[key]?.card });
        } else {
          setJob(key, { phase: 'refused', message: r.message });
        }
      } catch (e) {
        setJob(key, { phase: 'refused', message: messageOf(e) });
      } finally {
        set((s) => ({ busy: s.busy - 1 }));
      }
    },

    dismissJob: (key) => setJob(key, null),
    openPaddock: (id) => set({ paddockId: id, tab: 'farm' }),
    closePaddock: () => set({ paddockId: null }),
    setTab: (tab) => set({ tab }),
    dismissSummary: () => set({ summary: null }),
    dismissNotice: () => set({ notice: null }),
  };
});
