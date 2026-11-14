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
import {
  draftAction,
  draftFromPlan,
  newDraft,
  moveStop,
  toggleStop,
  type PlanDraft,
} from './plans';
import { dragPick, newPick, type SowPick } from './sow';
import { choiceJob, moveHubJob, moveJob, tapOutcome, type TapInfo } from './taps';
import type {
  ActionRequest,
  ActResponse,
  EdgeWire,
  FenceKindId,
  JobCardWire,
  PreviewResponse,
  SetupChoices,
  SimpleAction,
  SkipRequestLength,
  Shown,
  Snapshot,
  StaleResponse,
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
  /** What the card on show was made for: Confirm sends exactly this. Set with the card. */
  shown?: Shown;
  /** The preview this job is waiting on: an answer to an older one is dropped. */
  ticket?: number;
}

/** A one-use id for a Confirm. */
export function newRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** The card and what Confirm will send, from a preview answer for `req`. */
const shownOf = (req: ActionRequest, version: string): Shown => ({
  req,
  version,
  requestId: newRequestId(),
});

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
  shown?: Shown;
  /** The preview this state is waiting on: an answer to an older one is dropped. */
  ticket?: number;
}

/** Making or changing a grazing plan: the form, then the server's card, then the result. */
export interface PlanState {
  draft: PlanDraft;
  phase: 'edit' | 'previewing' | 'confirm' | 'applying' | 'done' | 'refused';
  card?: JobCardWire;
  message?: string;
  shown?: Shown;
  ticket?: number;
  /** Kept for the result line, since the form is gone once it is done. */
  mobName?: string;
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
  /** 'broken': the farm is there and can't be opened. */
  phase: 'loading' | 'setup' | 'ready' | 'failed' | 'broken';
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
  /** The plan form, or null. */
  plan: PlanState | null;
  /** Squares picked for sowing on the paddock sheet, or null. */
  sow: SowPick | null;
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
  /** Sends exactly the job the card on show was made for. */
  confirmAct: (slot: string) => Promise<void>;
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
  /** Open the plan form on the farm: for a mob, or to change a plan. */
  startPlan: (from: { mobId?: number; planId?: number }) => void;
  planEdit: (patch: Partial<PlanDraft>) => void;
  /** A paddock tapped on the map or in the list: it joins the order, or leaves it. */
  planTap: (paddockId: number) => void;
  planMoveStop: (index: number, by: -1 | 1) => void;
  planCheck: () => Promise<void>;
  planConfirm: () => Promise<void>;
  /** Back from the card to the form, keeping what was picked. */
  planBack: () => void;
  planEnd: () => void;
  /** Start picking squares to sow on the map, or stop. */
  sowPicking: (paddockId: number, on: boolean) => void;
  sowDrag: (e: { phase: 'start' | 'move' | 'end'; square: number }) => void;
  sowClear: () => void;
  sowEnd: () => void;
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
  /** The player opened the inbox: tell the server how far they have read. */
  markInboxRead: () => Promise<void>;
  dismissSummary: () => void;
  dismissNotice: () => void;
}

const messageOf = (e: unknown): string =>
  e instanceof ApiError ? e.message : 'Something went wrong. Try again in a moment.';

let tickets = 0;
/** A number for each preview asked, so only the answer to the newest is used. */
const nextTicket = (): number => ++tickets;

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

  /** Fetch the farm again, quietly: after a failed or refused job, so the screen shows the farm as it is. */
  async function reload(): Promise<void> {
    try {
      const r = await api.farm();
      if (r.snapshot) set(adopt(r.snapshot));
    } catch {
      // The notice for the failed job is enough. The next request tries again.
    }
  }

  /** The version the screen shows, to send with Next day and skips. */
  const versionNow = (): string => get().snapshot?.farmVersion ?? '';

  /**
   * Send the job a card was made for: its request, the version it was made
   * on and its one-use id. Every answer carries the farm as it is now, which
   * the screen takes. After a failure the farm is fetched again.
   */
  async function sendAct(
    shown: Shown,
  ): Promise<
    | { ok: true; message: string; card: JobCardWire | null }
    | { ok: false; message: string; reason?: string }
  > {
    set((s) => ({ busy: s.busy + 1 }));
    try {
      const r: ActResponse = await api.act({
        ...shown.req,
        version: shown.version,
        requestId: shown.requestId,
      });
      if (r.snapshot) set(adopt(r.snapshot));
      if (r.ok) return { ok: true, message: r.message, card: r.card };
      return { ok: false, message: r.message, reason: r.reason };
    } catch (e) {
      void reload();
      return { ok: false, message: messageOf(e) };
    } finally {
      set((s) => ({ busy: s.busy - 1 }));
    }
  }

  /**
   * The farm changed since the screen was drawn (another tab, or a job just
   * done): nothing was run. Show the latest farm with the plain message, and
   * close any card made on the old one.
   */
  function staleNotice(r: StaleResponse): void {
    set({
      ...adopt(r.snapshot),
      notice: { message: r.message },
      jobs: {},
      acts: {},
      move: null,
      plan: null,
      sow: null,
      build: null,
    });
  }

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
    const ticket = nextTicket();
    setMove({
      phase: 'previewing',
      mobName: mob?.name,
      message: undefined,
      ticket,
      shown: undefined,
    });
    const mine = (): boolean => get().move?.ticket === ticket;
    try {
      const r = await api.preview({ action });
      if (!mine()) return;
      if (r.ok) setMove({ phase: 'confirm', card: r.card, shown: shownOf({ action }, r.version) });
      else setMove({ phase: 'refused', message: r.message });
    } catch (e) {
      if (mine()) setMove({ phase: 'refused', message: messageOf(e) });
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
    done: (r, action) => {
      const b = get().build;
      if (!b || !isLineTool(b.tool) || b.phase === 'applying' || b.phase === 'done') return;
      // Only an answer for the line as it is drawn now.
      if (JSON.stringify(lineAction(b)) !== JSON.stringify(action)) return;
      if (r.ok) {
        setBuild({
          phase: 'confirm',
          card: r.card,
          message: undefined,
          allLate: false,
          shown: shownOf({ action }, r.version),
        });
      } else {
        setBuild({
          phase: 'blocked',
          card: undefined,
          message: r.message,
          allLate: tooLate(r.reason),
          shown: undefined,
        });
      }
    },
    fail: (e) => {
      if (get().build) {
        setBuild({ phase: 'blocked', card: undefined, message: messageOf(e), allLate: false });
      }
    },
  });

  // A normal fence is the one a grazier goes for: electric is picked on purpose (Claudia, 14 Nov 2026).
  let lastFence: FenceKindId = 'permanent';
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
      shown: undefined,
    });
    try {
      const r = await api.preview({ action: job.action });
      if (get().build?.picked !== job) return;
      if (r.ok) {
        setBuild({
          phase: 'confirm',
          card: r.card,
          shown: shownOf({ action: job.action }, r.version),
        });
      } else setBuild({ phase: 'blocked', message: r.message });
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
    plan: null,
    sow: null,
    build: null,

    async load() {
      set({ phase: 'loading', notice: null });
      try {
        const { snapshot, broken } = await api.farm();
        if (broken) set({ phase: 'broken', snapshot: null, notice: { message: broken } });
        else set(snapshot ? adopt(snapshot) : { phase: 'setup', snapshot: null });
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
        plan: null,
        sow: null,
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
            plan: null,
            sow: null,
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
          const r = await api.day(versionNow());
          lineChecker.cancel();
          if (!r.ok) {
            staleNotice(r);
            return;
          }
          const { snapshot, summary } = r;
          set({
            ...adopt(snapshot),
            summary,
            jobs: {},
            acts: {},
            move: null,
            plan: null,
            sow: null,
            build: null,
          });
        },
      );
    },

    async skip(length, anyway = false) {
      if (get().busy > 0) return;
      await run(
        () => void get().skip(length, anyway),
        async () => {
          const r = await api.skip(length, anyway, versionNow());
          if (!r.ok) {
            lineChecker.cancel();
            staleNotice(r);
            return;
          }
          const { snapshot, summary } = r;
          const ran = summary.daysRun > 0;
          set({
            ...adopt(snapshot),
            summary,
            jobs: ran ? {} : get().jobs,
            acts: ran ? {} : get().acts,
            move: ran ? null : get().move,
            plan: ran ? null : get().plan,
            sow: ran ? null : get().sow,
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
      const ticket = nextTicket();
      setJob(key, { ticket });
      const mine = (): boolean => get().jobs[key]?.ticket === ticket;
      try {
        const r = await api.preview({ todo: key });
        if (!mine()) return;
        if (r.ok)
          setJob(key, { phase: 'confirm', card: r.card, shown: shownOf({ todo: key }, r.version) });
        else setJob(key, { phase: 'refused', message: r.message });
      } catch (e) {
        if (mine()) setJob(key, { phase: 'refused', message: messageOf(e) });
      }
    },

    async confirmJob(key) {
      const job = get().jobs[key];
      if (job?.phase !== 'confirm' || !job.shown || get().busy > 0) return;
      setJob(key, { phase: 'applying' });
      const r = await sendAct(job.shown);
      if (r.ok) setJob(key, { phase: 'done', message: r.message, card: r.card ?? job.card });
      else setJob(key, { phase: 'refused', message: r.message });
    },

    dismissJob: (key) => setJob(key, null),

    async startAct(slot, label, action) {
      const now = get().acts[slot]?.phase;
      // A new ask while one is out replaces it (its answer is dropped). Not while a job is being done.
      if (now === 'applying') return;
      const ticket = nextTicket();
      set((s) => ({
        acts: {
          ...s.acts,
          [slot]: { key: slot, text: label, button: label, phase: 'previewing', action, ticket },
        },
      }));
      // Asking again (supplement A, then B) makes the first answer stale: it is dropped.
      const mine = (): boolean => get().acts[slot]?.ticket === ticket;
      try {
        const r = await api.preview({ action });
        if (!mine()) return;
        if (r.ok) {
          setAct(slot, { phase: 'confirm', card: r.card, shown: shownOf({ action }, r.version) });
        } else setAct(slot, { phase: 'refused', message: r.message });
      } catch (e) {
        if (mine()) setAct(slot, { phase: 'refused', message: messageOf(e) });
      }
    },

    async confirmAct(slot) {
      const act = get().acts[slot];
      if (act?.phase !== 'confirm' || !act.shown || get().busy > 0) return;
      setAct(slot, { phase: 'applying' });
      const r = await sendAct(act.shown);
      if (r.ok) setAct(slot, { phase: 'done', message: r.message, card: r.card ?? act.card });
      else setAct(slot, { phase: 'refused', message: r.message });
    },

    dismissAct: (slot) => setAct(slot, null),

    openPaddock: (id) => {
      lineChecker.cancel();
      set((s) => ({
        paddockId: id,
        mobId: null,
        tab: 'farm',
        build: null,
        plan: null,
        sow: s.sow?.paddockId === id ? s.sow : null,
      }));
    },
    closePaddock: () => set({ paddockId: null, sow: null }),
    openMob: (id) => {
      lineChecker.cancel();
      set({ mobId: id, tab: 'farm', acts: {}, build: null, plan: null, sow: null });
    },
    closeMob: () => set({ mobId: null, acts: {} }),

    async startMove({ mobId, paddockId }) {
      lineChecker.cancel();
      set({
        build: null,
        plan: null,
        sow: null,
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

    // A change to what is moved makes any card on show out of date: it goes back to picking.
    movePart: (on) =>
      setMove({
        part: on,
        message: undefined,
        ...(get().move?.phase === 'confirm'
          ? { phase: 'pick', card: undefined, shown: undefined, ticket: undefined }
          : {}),
      }),
    moveQty: (cls, qty) =>
      set((s) =>
        s.move
          ? {
              move: {
                ...s.move,
                qtys: { ...s.move.qtys, [cls]: qty },
                ...(s.move.phase === 'confirm'
                  ? { phase: 'pick' as const, card: undefined, shown: undefined, ticket: undefined }
                  : {}),
              },
            }
          : {},
      ),

    async moveConfirm() {
      const { move } = get();
      if (!move || move.phase !== 'confirm' || !move.shown || get().busy > 0) return;
      setMove({ phase: 'applying' });
      const r = await sendAct(move.shown);
      if (r.ok) setMove({ phase: 'done', message: r.message, card: r.card ?? move.card });
      else setMove({ phase: 'refused', message: r.message });
    },

    moveBack: () =>
      setMove({
        phase: 'pick',
        target: null,
        card: undefined,
        message: undefined,
        shown: undefined,
        ticket: undefined,
      }),
    moveEnd: () => set({ move: null }),

    startPlan({ mobId, planId }) {
      const snapshot = get().snapshot;
      if (!snapshot) return;
      lineChecker.cancel();
      const plan = planId === undefined ? undefined : snapshot.plans.find((p) => p.id === planId);
      const draft = plan
        ? draftFromPlan(
            snapshot.planForm,
            plan,
            mobId ?? plan.mobs[0]?.mob ?? null,
            snapshot.paddocks,
          )
        : newDraft(snapshot.planForm, mobId ?? null);
      set({
        plan: { draft, phase: 'edit' },
        build: null,
        move: null,
        sow: null,
        paddockId: null,
        mobId: null,
        tab: 'farm',
      });
    },

    planEdit(patch) {
      set((s) =>
        s.plan
          ? {
              plan: {
                ...s.plan,
                draft: { ...s.plan.draft, ...patch },
                phase: 'edit',
                card: undefined,
                message: undefined,
                shown: undefined,
                ticket: undefined,
              },
            }
          : {},
      );
    },

    planTap(paddockId) {
      const p = get().plan;
      if (!p || p.phase === 'applying' || p.phase === 'done') return;
      get().planEdit({ stops: toggleStop(p.draft.stops, paddockId) });
    },

    planMoveStop(index, by) {
      const p = get().plan;
      if (!p || p.phase === 'applying' || p.phase === 'done') return;
      get().planEdit({ stops: moveStop(p.draft.stops, index, by) });
    },

    async planCheck() {
      const { plan, snapshot } = get();
      if (!plan || !snapshot || plan.phase === 'previewing' || plan.phase === 'applying') return;
      const action = draftAction(plan.draft, snapshot.paddocks, snapshot.planForm);
      if (!action) return;
      const mobName = snapshot.mobs.find((m) => m.id === plan.draft.mobId)?.name;
      const ticket = nextTicket();
      set({ plan: { ...plan, phase: 'previewing', mobName, message: undefined, ticket } });
      try {
        const r = await api.preview({ action });
        const now = get().plan;
        if (!now || now.phase !== 'previewing' || now.ticket !== ticket) return;
        if (r.ok) {
          set({
            plan: { ...now, phase: 'confirm', card: r.card, shown: shownOf({ action }, r.version) },
          });
        } else set({ plan: { ...now, phase: 'refused', message: r.message } });
      } catch (e) {
        const now = get().plan;
        if (now && now.ticket === ticket) {
          set({ plan: { ...now, phase: 'refused', message: messageOf(e) } });
        }
      }
    },

    async planConfirm() {
      const { plan } = get();
      if (!plan || plan.phase !== 'confirm' || !plan.shown || get().busy > 0) return;
      set({ plan: { ...plan, phase: 'applying' } });
      const r = await sendAct(plan.shown);
      const now = get().plan;
      if (!now) return;
      if (r.ok)
        set({ plan: { ...now, phase: 'done', message: r.message, card: r.card ?? now.card } });
      else set({ plan: { ...now, phase: 'refused', message: r.message } });
    },

    planBack() {
      set((s) =>
        s.plan
          ? {
              plan: {
                ...s.plan,
                phase: 'edit',
                card: undefined,
                message: undefined,
                shown: undefined,
                ticket: undefined,
              },
            }
          : {},
      );
    },

    planEnd: () => set({ plan: null }),

    sowPicking(paddockId, on) {
      lineChecker.cancel();
      set((s) => ({
        sow: { ...(s.sow?.paddockId === paddockId ? s.sow : newPick(paddockId)), picking: on },
        build: null,
      }));
    },

    sowDrag(e) {
      const { sow, snapshot } = get();
      if (!sow || !snapshot) return;
      set({ sow: dragPick(sow, snapshot.view, e) });
    },

    sowClear() {
      set((s) => (s.sow ? { sow: { ...s.sow, cells: [], live: [], from: null } } : {}));
    },

    sowEnd: () => set({ sow: null }),

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
        plan: null,
        sow: null,
        tab: 'farm',
      });
    },

    setFence(fence) {
      lastFence = fence;
      const b = get().build;
      if (!b || b.tool !== 'fence') return;
      const action = lineAction({ ...b, fence });
      setBuild({
        fence,
        phase: action ? 'previewing' : 'pick',
        message: undefined,
        card: undefined,
        shown: undefined,
      });
      if (action) lineChecker.flush(action);
    },

    setHubOn(on) {
      lastHubOn = on;
      setBuild({
        hubOn: on,
        picked: null,
        phase: 'pick',
        card: undefined,
        message: undefined,
        shown: undefined,
      });
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
      set({
        build: {
          ...next,
          phase: enough ? 'previewing' : 'pick',
          message: undefined,
          shown: undefined,
        },
      });
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
        if (b.moving.kind === 'hub') {
          const job = tap.corner ? moveHubJob(b.moving, tap.corner) : null;
          if (job) await previewPicked(job);
          return;
        }
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
      if (!b || b.phase !== 'confirm' || !b.shown || get().busy > 0) return;
      lineChecker.cancel();
      setBuild({ phase: 'applying' });
      const r = await sendAct(b.shown);
      if (r.ok) {
        // Done: the tool is back to Look, and the result shows until it is dismissed.
        setBuild({ phase: 'done', message: r.message, card: r.card ?? b.card, allLate: false });
      } else {
        setBuild({
          phase: 'blocked',
          message: r.message,
          allLate: r.reason !== undefined && tooLate(r.reason),
          shown: undefined,
        });
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
      set({
        build: newBuild('fix'),
        paddockId: null,
        mobId: null,
        move: null,
        plan: null,
        sow: null,
        tab: 'farm',
      });
      await previewPicked(job);
    },

    async openGate(edge) {
      const snapshot = get().snapshot;
      if (!snapshot) return;
      lineChecker.cancel();
      set({
        build: newBuild('gate'),
        paddockId: null,
        mobId: null,
        move: null,
        plan: null,
        sow: null,
        tab: 'farm',
      });
      const out = tapOutcome('gate', 'corner', snapshot.view, {
        square: -1,
        edge,
        edgeCode: 7,
        edgeDistPx: 0,
        corner: null,
        hub: false,
        squareHub: false,
      });
      if (out.kind === 'job') await previewPicked(out.job);
    },

    setTab: (tab) => set({ tab }),

    async markInboxRead() {
      const snap = get().snapshot;
      if (!snap || snap.inboxUnread === 0) return;
      const upTo = snap.inbox.reduce((m, x) => Math.max(m, x.seq), 0);
      try {
        const { snapshot } = await api.inboxRead(upTo);
        // Only the read marks change. Keep whatever else the player has open.
        if (snapshot) set({ snapshot });
      } catch {
        // Not marking a message read is not worth a notice. It tries again next time.
      }
    },

    dismissSummary: () => set({ summary: null }),
    dismissNotice: () => set({ notice: null }),
  };
});
