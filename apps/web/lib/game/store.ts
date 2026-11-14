import { create } from 'zustand';
import { api, ApiError } from './api';
import { movePicks } from './lists';
import type {
  JobCardWire,
  SetupChoices,
  SimpleAction,
  SkipRequestLength,
  Snapshot,
  SummaryWire,
} from './types';

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

/**
 * Moving cattle: "pick the paddock, done". The tool asks for a mob and a
 * paddock, shows the job card, then snaps back to Look (the state is
 * cleared when the result is dismissed).
 */
export interface MoveState {
  /** The mob being moved, or null while the player picks one (a paddock was picked first). */
  mobId: number | null;
  /** The paddock to move into, or null while the player picks one. */
  target: number | null;
  /** Moving part of the mob, by class and number. */
  part: boolean;
  qtys: Record<string, number>;
  phase: 'pick' | 'previewing' | 'confirm' | 'applying' | 'done' | 'refused';
  /** Kept for the result line, since a mob can join another and leave the list. */
  mobName?: string;
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
  /** The mob card that is open. It is never opened by tapping a cow on the map. */
  mobId: number | null;
  summary: SummaryWire | null;
  jobs: Record<string, JobState>;
  /** Husbandry jobs on the mob card, by slot ("12:mark"), the same flow as the things to do. */
  acts: Record<string, JobState>;
  move: MoveState | null;

  load: () => Promise<void>;
  created: (choices: SetupChoices) => Promise<void>;
  restart: () => Promise<void>;
  nextDay: () => Promise<void>;
  skip: (length: SkipRequestLength, anyway?: boolean) => Promise<void>;
  startJob: (key: string) => Promise<void>;
  confirmJob: (key: string) => Promise<void>;
  dismissJob: (key: string) => void;
  startAct: (slot: string, label: string, action: SimpleAction) => Promise<void>;
  confirmAct: (slot: string, action: SimpleAction) => Promise<void>;
  dismissAct: (slot: string) => void;
  openPaddock: (id: number) => void;
  closePaddock: () => void;
  openMob: (id: number) => void;
  closeMob: () => void;
  startMove: (from: { mobId?: number; paddockId?: number }) => Promise<void>;
  moveMobPicked: (mobId: number) => Promise<void>;
  moveTargetPicked: (paddockId: number) => Promise<void>;
  movePart: (on: boolean) => void;
  moveQty: (cls: string, qty: number) => void;
  moveConfirm: () => Promise<void>;
  /** Back to picking a paddock, keeping the mob. */
  moveBack: () => void;
  /** Leave the move tool: back to Look. */
  moveEnd: () => void;
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

  const adopt = (snapshot: Snapshot): Partial<GameState> => {
    const { paddockId, mobId } = get();
    return {
      snapshot,
      phase: 'ready',
      // A paddock or mob that is no longer on the farm closes itself.
      paddockId:
        paddockId !== null && snapshot.view.paddocks.some((p) => p.id === paddockId)
          ? paddockId
          : null,
      mobId: mobId !== null && snapshot.mobs.some((m) => m.id === mobId) ? mobId : null,
    };
  };

  const setJob = (key: string, patch: Partial<JobState> | null): void =>
    set((s) => {
      const jobs = { ...s.jobs };
      if (patch === null) delete jobs[key];
      else jobs[key] = { ...jobs[key]!, ...patch };
      return { jobs };
    });

  const setAct = (slot: string, patch: Partial<JobState> | null): void =>
    set((s) => {
      const acts = { ...s.acts };
      if (patch === null) delete acts[slot];
      else acts[slot] = { ...acts[slot]!, ...patch };
      return { acts };
    });

  const setMove = (patch: Partial<MoveState>): void =>
    set((s) => (s.move ? { move: { ...s.move, ...patch } } : {}));

  /** The action for the move being set up, or null if it is not ready. */
  function moveAction(): SimpleAction | null {
    const { move, snapshot } = get();
    if (!move || !snapshot || move.mobId === null || move.target === null) return null;
    const mob = snapshot.mobs.find((m) => m.id === move.mobId);
    const paddock = snapshot.paddocks.find((p) => p.id === move.target);
    if (!mob || !paddock) return null;
    if (move.part) {
      const picks = movePicks(mob, move.qtys);
      return picks.length ? { type: 'moveCattle', picks, cell: paddock.cell } : null;
    }
    return { type: 'moveMob', mob: mob.id, cell: paddock.cell };
  }

  async function previewMove(): Promise<void> {
    const action = moveAction();
    const mob = get().snapshot?.mobs.find((m) => m.id === get().move?.mobId);
    if (!action) {
      setMove({ phase: 'pick', message: 'Pick how many head to move first.' });
      return;
    }
    setMove({ phase: 'previewing', mobName: mob?.name, message: undefined });
    try {
      const r = await api.preview({ action });
      if (r.ok) setMove({ phase: 'confirm', card: r.card });
      else setMove({ phase: 'refused', message: r.message });
    } catch (e) {
      setMove({ phase: 'refused', message: messageOf(e) });
    }
  }

  return {
    phase: 'loading',
    snapshot: null,
    busy: 0,
    notice: null,
    tab: 'farm',
    paddockId: null,
    mobId: null,
    summary: null,
    jobs: {},
    acts: {},
    move: null,

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
      set({ ...adopt(snapshot), tab: 'farm', jobs: {}, acts: {}, move: null, summary: null });
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
            acts: {},
            move: null,
            summary: null,
            paddockId: null,
            mobId: null,
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
          set({ ...adopt(snapshot), summary, jobs: {}, acts: {}, move: null });
        },
      );
    },

    async skip(length, anyway = false) {
      if (get().busy > 0) return;
      await run(
        () => void get().skip(length, anyway),
        async () => {
          const { snapshot, summary } = await api.skip(length, anyway);
          const ran = summary.daysRun > 0;
          set({
            ...adopt(snapshot),
            summary,
            jobs: ran ? {} : get().jobs,
            acts: ran ? {} : get().acts,
            move: ran ? null : get().move,
          });
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

    async startAct(slot, label, action) {
      const now = get().acts[slot]?.phase;
      if (now === 'previewing' || now === 'applying') return;
      set((s) => ({
        acts: { ...s.acts, [slot]: { key: slot, text: label, button: label, phase: 'previewing' } },
      }));
      try {
        const r = await api.preview({ action });
        if (r.ok) setAct(slot, { phase: 'confirm', card: r.card });
        else setAct(slot, { phase: 'refused', message: r.message });
      } catch (e) {
        setAct(slot, { phase: 'refused', message: messageOf(e) });
      }
    },

    async confirmAct(slot, action) {
      if (get().acts[slot]?.phase !== 'confirm' || get().busy > 0) return;
      setAct(slot, { phase: 'applying' });
      set((s) => ({ busy: s.busy + 1 }));
      try {
        const r = await api.act({ action });
        if (r.ok) {
          set({ ...adopt(r.snapshot) });
          setAct(slot, {
            phase: 'done',
            message: r.message,
            card: r.card ?? get().acts[slot]?.card,
          });
        } else {
          setAct(slot, { phase: 'refused', message: r.message });
        }
      } catch (e) {
        setAct(slot, { phase: 'refused', message: messageOf(e) });
      } finally {
        set((s) => ({ busy: s.busy - 1 }));
      }
    },

    dismissAct: (slot) => setAct(slot, null),

    openPaddock: (id) => set({ paddockId: id, mobId: null, tab: 'farm' }),
    closePaddock: () => set({ paddockId: null }),
    openMob: (id) => set({ mobId: id, tab: 'farm', acts: {} }),
    closeMob: () => set({ mobId: null, acts: {} }),

    async startMove({ mobId, paddockId }) {
      set({
        move: {
          mobId: mobId ?? null,
          target: paddockId ?? null,
          part: false,
          qtys: {},
          phase: 'pick',
        },
        tab: 'farm',
      });
      if (mobId !== undefined && paddockId !== undefined) await previewMove();
    },

    async moveMobPicked(mobId) {
      const { move } = get();
      if (!move) return;
      setMove({ mobId, phase: 'pick', qtys: {}, part: false, message: undefined });
      if (move.target !== null) await previewMove();
    },

    async moveTargetPicked(paddockId) {
      const { move } = get();
      if (
        !move ||
        move.mobId === null ||
        (move.phase !== 'pick' && move.phase !== 'refused' && move.phase !== 'confirm')
      ) {
        return;
      }
      setMove({ target: paddockId, message: undefined });
      await previewMove();
    },

    movePart: (on) => setMove({ part: on, message: undefined }),
    moveQty: (cls, qty) =>
      set((s) => (s.move ? { move: { ...s.move, qtys: { ...s.move.qtys, [cls]: qty } } } : {})),

    async moveConfirm() {
      const { move } = get();
      const action = moveAction();
      if (!move || move.phase !== 'confirm' || !action || get().busy > 0) return;
      setMove({ phase: 'applying' });
      set((s) => ({ busy: s.busy + 1 }));
      try {
        const r = await api.act({ action });
        if (r.ok) {
          set({ ...adopt(r.snapshot) });
          setMove({ phase: 'done', message: r.message, card: r.card ?? move.card });
        } else {
          setMove({ phase: 'refused', message: r.message });
        }
      } catch (e) {
        setMove({ phase: 'refused', message: messageOf(e) });
      } finally {
        set((s) => ({ busy: s.busy - 1 }));
      }
    },

    moveBack: () => setMove({ phase: 'pick', target: null, card: undefined, message: undefined }),
    moveEnd: () => set({ move: null }),

    setTab: (tab) => set({ tab }),
    dismissSummary: () => set({ summary: null }),
    dismissNotice: () => set({ notice: null }),
  };
});
