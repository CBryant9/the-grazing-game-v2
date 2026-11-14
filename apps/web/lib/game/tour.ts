/**
 * The guided first day: which step the player is on, and when a step is done.
 * Pure functions, so each can be tested without a screen. Nothing here knows a
 * rule or a number from the game; it only reads what the player has done.
 *
 * The steps (PRD 21a): open a paddock, move cattle, build a short fence and
 * watch the daylight bar move, open the market, end the day. A step is done
 * when the player really does it. Doing a step early counts. A farm with no
 * cattle has no move step.
 */

export type TourStepId = 'paddock' | 'move' | 'fence' | 'market' | 'day';

/** All the steps, in the order they are offered. */
export const TOUR_ORDER: readonly TourStepId[] = ['paddock', 'move', 'fence', 'market', 'day'];

export interface TourProgress {
  v: 1;
  /** 'active': the strip shows. 'off': skipped or finished, nothing shows. */
  status: 'active' | 'off';
  done: TourStepId[];
  skipped: TourStepId[];
  /** The farm's day when the tour began. "End the day" is done once the farm is past it. */
  startDay: number;
}

export interface TourStepText {
  title: string;
  body: string;
}

/** What the strip says for each step. Two short lines, plain words. */
export const TOUR_TEXT: Record<TourStepId, TourStepText> = {
  paddock: {
    title: 'Open a paddock',
    body: 'Tap a paddock on the map to see its feed, its water and the mob in it.',
  },
  move: {
    title: 'Move cattle',
    body: 'Open a paddock, tap Move a mob here, pick a mob, then press Move.',
  },
  fence: {
    title: 'Build a short fence',
    body: 'Pick Fence in the build tools, drag a short line, then press Build. Watch the daylight bar.',
  },
  market: {
    title: 'Open the market',
    body: 'Tap Market to see the next sale day and the prices.',
  },
  day: {
    title: 'End the day',
    body: 'Tap Next day. A summary shows what changed overnight.',
  },
};

/** What the strip says once every step is done or skipped. */
export const TOUR_FINISHED = 'That is the first day. The Help button has the rest.';

/** A fresh tour, starting on the farm's day `day`. */
export function startTour(day: number): TourProgress {
  return { v: 1, status: 'active', done: [], skipped: [], startDay: day };
}

/** The steps this farm gets. A farm with no cattle has no move step. */
export function tourSteps(hasCattle: boolean): TourStepId[] {
  return TOUR_ORDER.filter((s) => hasCattle || s !== 'move');
}

/** The step the player is on: the first one not done and not skipped. Null when there are none left. */
export function currentStep(p: TourProgress, hasCattle: boolean): TourStepId | null {
  if (p.status !== 'active') return null;
  return tourSteps(hasCattle).find((s) => !p.done.includes(s) && !p.skipped.includes(s)) ?? null;
}

/** "Step 2 of 4", counted over the steps this farm has. Null when there is no current step. */
export function stepLabel(p: TourProgress, hasCattle: boolean): string | null {
  const now = currentStep(p, hasCattle);
  if (!now) return null;
  const steps = tourSteps(hasCattle);
  return `Step ${steps.indexOf(now) + 1} of ${steps.length}`;
}

/** What the player has done, read from the game's state. */
export interface TourObservation {
  paddockOpen: boolean;
  moved: boolean;
  fenceBuilt: boolean;
  marketOpen: boolean;
  /** The farm's day now, or null when there is no farm on screen. */
  day: number | null;
}

/** The slice of the game's state the tour reads. Kept narrow so a test can make one. */
export interface TourReadState {
  paddockId: number | null;
  move: { phase: string } | null;
  build: { tool: string; phase: string } | null;
  tab: string;
  snapshot: { day: number } | null;
}

/** Read what the player is doing from the game's state. */
export function observe(s: TourReadState): TourObservation {
  return {
    paddockOpen: s.paddockId !== null,
    moved: s.move?.phase === 'done',
    fenceBuilt: s.build?.tool === 'fence' && s.build.phase === 'done',
    marketOpen: s.tab === 'market',
    day: s.snapshot?.day ?? null,
  };
}

const withStep = (list: TourStepId[], id: TourStepId): TourStepId[] =>
  list.includes(id) ? list : [...list, id];

/**
 * Note what the player has done. Returns the same object when nothing is new,
 * so a caller can tell whether anything changed. Does nothing once the tour
 * is off.
 */
export function noteProgress(p: TourProgress, o: TourObservation): TourProgress {
  if (p.status !== 'active') return p;
  let done = p.done;
  const add = (id: TourStepId, yes: boolean): void => {
    if (yes) done = withStep(done, id);
  };
  add('paddock', o.paddockOpen);
  add('move', o.moved);
  add('fence', o.fenceBuilt);
  add('market', o.marketOpen);
  add('day', o.day !== null && o.day > p.startDay);
  return done === p.done ? p : { ...p, done };
}

/** Skip one step. */
export function skipStep(p: TourProgress, id: TourStepId): TourProgress {
  if (p.status !== 'active' || p.skipped.includes(id) || p.done.includes(id)) return p;
  return { ...p, skipped: [...p.skipped, id] };
}

/** Skip the whole tour, or close it once it is finished. */
export function endTour(p: TourProgress): TourProgress {
  return p.status === 'off' ? p : { ...p, status: 'off' };
}

/** True when every step this farm has is done or skipped. */
export function tourFinished(p: TourProgress, hasCattle: boolean): boolean {
  return p.status === 'active' && currentStep(p, hasCattle) === null;
}

// ---- Keeping it in the browser

/** The key the tour's place is kept under in localStorage. */
export const TOUR_KEY = 'gg-tour';

const isStep = (x: unknown): x is TourStepId =>
  typeof x === 'string' && (TOUR_ORDER as readonly string[]).includes(x);

/** Read a saved tour back. Anything that is not a tour this code wrote gives null. */
export function parseTour(raw: string | null): TourProgress | null {
  if (!raw) return null;
  try {
    const x: unknown = JSON.parse(raw);
    if (typeof x !== 'object' || x === null) return null;
    const o = x as Record<string, unknown>;
    if (o.v !== 1 || (o.status !== 'active' && o.status !== 'off')) return null;
    if (!Array.isArray(o.done) || !Array.isArray(o.skipped)) return null;
    if (typeof o.startDay !== 'number' || !Number.isFinite(o.startDay)) return null;
    return {
      v: 1,
      status: o.status,
      done: o.done.filter(isStep),
      skipped: o.skipped.filter(isStep),
      startDay: o.startDay,
    };
  } catch {
    return null;
  }
}

export function serializeTour(p: TourProgress): string {
  return JSON.stringify(p);
}

/**
 * What to do when the farm opens. A saved tour is used as it is. With none,
 * a farm that has not seen a day yet gets a new tour; an older farm gets none.
 */
export function tourOnOpen(saved: TourProgress | null, day: number): TourProgress | null {
  if (saved) return saved;
  return day <= 1 ? startTour(day) : null;
}
