import { create } from 'zustand';
import { extendPath, extendSquares, startPath, startSquares, type Corner } from '@gg/render/lines';
import { api, ApiError } from './api';
import {
  isLineTool,
  lineAction,
  newBuild,
  type BuildState,
  type BuildTool,
  type HubOn,
} from './build';
import { latestOnly } from './latest';
import { movePicks } from './lists';
import { choiceJob, moveJob, tapOutcome, type TapInfo } from './taps';
import type {
  EdgeWire,
  FenceKindId,
  JobCardWire,
  PreviewResponse,
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
  /** The job as it was checked, so Confirm sends exactly what the card showed. */
  action?: SimpleAction;
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

/** A drawing drag on the map: the corner (a fence) or the square (pipe) it has reached. */
export interface DragInfo {
  phase: 'start' | 'move' | 'end';
  corner: Corner | null;
  square: number;
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
  /** The build tool in use: null is Look. */
  build: BuildState | null;

  load: () => Promise<void>;
  created: (choices: SetupChoices) => Promise<void>;
  restart: () => Promise<void>;
  nextDay: () => Promise<void>;
  skip: (length: SkipRequestLength, anyway?: boolean) => Promise<void>;
  startJob: (key: string) => Promise<void>;
  confirmJob: (key: string) => Promise<void>;
  dismissJob: (key: string) => void;
  startAct: (slot: string, label: string, action: SimpleAction) => Promise<void>;
  /** With no action, it sends the one that was checked. */
  confirmAct: (slot: string, action?: SimpleAction) => Promise<void>;
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
  /** Pick a build tool. 'look' goes back to Look. */
  selectTool: (tool: BuildTool | 'look') => void;
  setFence: (fence: FenceKindId) => void;
  setHubOn: (on: HubOn) => void;
  /** A drawing drag on the map (a fence or pipe). */
  buildDrag: (e: DragInfo) => void;
  /** A tap on the map in a tool. */
  buildTap: (tap: TapInfo) => Promise<void>;
  buildConfirm: () => Promise<void>;
  /** Cancel: back to Look. */
  buildEnd: () => void;
  /** Dismiss a done result (back to Look), or a refusal on a picked job (back to picking). */
  buildOk: () => void;
  chooseRefill: () => Promise<void>;
  chooseRemove: () => Promise<void>;
  chooseMove: () => void;
  /** The card for putting a fallen fence back up. */
  startFix: (edge: EdgeWire) => Promise<void>;
  /** The card for opening or shutting a gate, from the paddock sheet. */
  openGate: (edge: EdgeWire) => Promise<void>;
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

  const setBuild = (patch: Partial<BuildState>): void =>
    set((s) => (s.build ? { build: { ...s.build, ...patch } } : {}));

  /** The server said none of today's light is left for the first piece of the line. */
  const tooLate = (reason: string): boolean =>
    reason === 'not-enough-daylight' || reason === 'no-daylight';

  /** The job card for a line as it is drawn, asked at most a few times a second. */
  const lineChecker = latestOnly<SimpleAction, PreviewResponse>({
    everyMs: 300,
    call: (action) => api.preview({ action }),
    done: (r) => {
      const b = get().build;
      if (!b || !isLineTool(b.tool) || b.phase === 'applying' || b.phase === 'done') return;
      if (r.ok) setBuild({ phase: 'confirm', card: r.card, message: undefined, allLate: false });
      else {
        setBuild({
          phase: 'blocked',
          card: undefined,
          message: r.message,
          allLate: tooLate(r.reason),
        });
      }
    },
    fail: (e) => {
      if (get().build) {
        setBuild({ phase: 'blocked', card: undefined, message: messageOf(e), allLate: false });
      }
    },
  });

  let lastFence: FenceKindId = 'electric';
  let lastHubOn: HubOn = 'corner';

  /** Ask for the card for a job picked with a tap. */
  async function previewPicked(job: NonNullable<BuildState['picked']>): Promise<void> {
    setBuild({
      picked: job,
      choice: null,
      moving: null,
      phase: 'previewing',
      card: undefined,
      message: undefined,
    });
    try {
      const r = await api.preview({ action: job.action });
      if (get().build?.picked !== job) return;
      if (r.ok) setBuild({ phase: 'confirm', card: r.card });
      else setBuild({ phase: 'blocked', message: r.message });
    } catch (e) {
      if (get().build?.picked === job) setBuild({ phase: 'blocked', message: messageOf(e) });
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
    build: null,

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
      lineChecker.cancel();
      set({
        ...adopt(snapshot),
        tab: 'farm',
        jobs: {},
        acts: {},
        move: null,
        build: null,
        summary: null,
      });
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
            build: null,
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
          lineChecker.cancel();
          set({ ...adopt(snapshot), summary, jobs: {}, acts: {}, move: null, build: null });
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
            build: ran ? null : get().build,
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
        acts: {
          ...s.acts,
          [slot]: { key: slot, text: label, button: label, phase: 'previewing', action },
        },
      }));
      try {
        const r = await api.preview({ action });
        if (r.ok) setAct(slot, { phase: 'confirm', card: r.card });
        else setAct(slot, { phase: 'refused', message: r.message });
      } catch (e) {
        setAct(slot, { phase: 'refused', message: messageOf(e) });
      }
    },

    async confirmAct(slot, given) {
      const send = given ?? get().acts[slot]?.action;
      if (!send || get().acts[slot]?.phase !== 'confirm' || get().busy > 0) return;
      setAct(slot, { phase: 'applying' });
      set((s) => ({ busy: s.busy + 1 }));
      try {
        const r = await api.act({ action: send });
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

    openPaddock: (id) => {
      lineChecker.cancel();
      set({ paddockId: id, mobId: null, tab: 'farm', build: null });
    },
    closePaddock: () => set({ paddockId: null }),
    openMob: (id) => {
      lineChecker.cancel();
      set({ mobId: id, tab: 'farm', acts: {}, build: null });
    },
    closeMob: () => set({ mobId: null, acts: {} }),

    async startMove({ mobId, paddockId }) {
      lineChecker.cancel();
      set({
        build: null,
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

    selectTool(tool) {
      lineChecker.cancel();
      if (tool === 'look') {
        set({ build: null });
        return;
      }
      set({
        build: newBuild(tool, { fence: lastFence, hubOn: lastHubOn }),
        paddockId: null,
        mobId: null,
        move: null,
        tab: 'farm',
      });
    },

    setFence(fence) {
      lastFence = fence;
      const b = get().build;
      if (!b || b.tool !== 'fence') return;
      const action = lineAction({ ...b, fence });
      setBuild({ fence, phase: action ? 'previewing' : 'pick', message: undefined });
      if (action) lineChecker.flush(action);
    },

    setHubOn(on) {
      lastHubOn = on;
      setBuild({ hubOn: on, picked: null, phase: 'pick', card: undefined, message: undefined });
    },

    buildDrag(e) {
      const b = get().build;
      if (!b || !isLineTool(b.tool) || b.phase === 'applying' || b.phase === 'done') return;
      let { corners, cells } = b;
      if (b.tool === 'fence') {
        if (!e.corner) return;
        corners =
          e.phase === 'start' ? startPath(b.corners, e.corner) : extendPath(b.corners, e.corner);
      } else {
        if (e.square < 0) return;
        cells =
          e.phase === 'start' ? startSquares(b.cells, e.square) : extendSquares(b.cells, e.square);
      }
      const next = { ...b, corners, cells };
      const action = lineAction(next);
      const enough = b.tool === 'fence' ? corners.length > 1 : cells.length > 0;
      set({ build: { ...next, phase: enough ? 'previewing' : 'pick', message: undefined } });
      if (!action || !enough) {
        lineChecker.cancel();
        return;
      }
      if (e.phase === 'end') lineChecker.flush(action);
      else lineChecker.schedule(action);
    },

    async buildTap(tap) {
      const { build: b, snapshot } = get();
      if (!b || !snapshot || b.phase === 'applying' || b.phase === 'done') return;
      if (b.moving) {
        if (tap.square < 0) return;
        await previewPicked(moveJob(b.moving, tap.square));
        return;
      }
      const out = tapOutcome(b.tool, b.hubOn, snapshot.view, tap);
      if (out.kind === 'none') {
        setBuild({
          picked: null,
          choice: null,
          phase: 'pick',
          card: undefined,
          message: out.message,
        });
      } else if (out.kind === 'choice') {
        setBuild({
          choice: out.choice,
          picked: null,
          phase: 'pick',
          card: undefined,
          message: undefined,
        });
      } else {
        await previewPicked(out.job);
      }
    },

    async buildConfirm() {
      const b = get().build;
      if (!b || b.phase !== 'confirm' || get().busy > 0) return;
      const action = isLineTool(b.tool) ? lineAction(b) : (b.picked?.action ?? null);
      if (!action) return;
      lineChecker.cancel();
      setBuild({ phase: 'applying' });
      set((s) => ({ busy: s.busy + 1 }));
      try {
        const r = await api.act({ action });
        if (r.ok) {
          set({ ...adopt(r.snapshot) });
          // Done: the tool is back to Look, and the result shows until it is dismissed.
          setBuild({ phase: 'done', message: r.message, card: r.card ?? b.card, allLate: false });
        } else {
          setBuild({ phase: 'blocked', message: r.message, allLate: tooLate(r.reason) });
        }
      } catch (e) {
        setBuild({ phase: 'blocked', message: messageOf(e) });
      } finally {
        set((s) => ({ busy: s.busy - 1 }));
      }
    },

    buildEnd() {
      lineChecker.cancel();
      set({ build: null });
    },

    buildOk() {
      const b = get().build;
      if (!b) return;
      if (b.phase === 'done') {
        set({ build: null });
        return;
      }
      if (b.phase === 'blocked' && !isLineTool(b.tool)) {
        // A fallen fence has no tool to go back to: Look.
        if (b.tool === 'fix') set({ build: null });
        else setBuild({ picked: null, phase: 'pick', card: undefined, message: undefined });
      }
    },

    async chooseRefill() {
      const c = get().build?.choice;
      if (c) await previewPicked(choiceJob(c, 'refill'));
    },

    async chooseRemove() {
      const c = get().build?.choice;
      if (c) await previewPicked(choiceJob(c, 'remove'));
    },

    chooseMove() {
      const c = get().build?.choice;
      if (c) setBuild({ moving: c, choice: null, message: undefined });
    },

    async startFix(edge) {
      lineChecker.cancel();
      const job = {
        action: { type: 'fixFence', edge } as SimpleAction,
        title: 'Put this fence back up',
        confirm: 'Put it up',
        edges: [edge],
        cells: [],
        corner: null,
        style: 'ok' as const,
      };
      set({ build: newBuild('fix'), paddockId: null, mobId: null, move: null, tab: 'farm' });
      await previewPicked(job);
    },

    async openGate(edge) {
      const snapshot = get().snapshot;
      if (!snapshot) return;
      lineChecker.cancel();
      set({ build: newBuild('gate'), paddockId: null, mobId: null, move: null, tab: 'farm' });
      const out = tapOutcome('gate', 'corner', snapshot.view, {
        square: -1,
        edge,
        edgeCode: 7,
        edgeDistPx: 0,
        corner: null,
        hub: false,
      });
      if (out.kind === 'job') await previewPicked(out.job);
    },

    setTab: (tab) => set({ tab }),
    dismissSummary: () => set({ summary: null }),
    dismissNotice: () => set({ notice: null }),
  };
});
