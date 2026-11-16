import { create } from 'zustand';
import { useGame } from './store';
import {
  endTour,
  noteProgress,
  observe,
  parseTour,
  serializeTour,
  skipStep,
  startTour,
  tourOnOpen,
  TOUR_KEY,
  type TourProgress,
  type TourStepId,
} from './tour';

/**
 * The help screen and the guided first day. Kept apart from the game's store:
 * nothing here is the farm, and nothing here is sent to the server. Where the
 * tour is up to is kept in this browser only, and the page works without it.
 */

function readSaved(): TourProgress | null {
  try {
    return parseTour(localStorage.getItem(TOUR_KEY));
  } catch {
    // Storage is blocked or full: the tour lasts for this visit only.
    return null;
  }
}

function write(p: TourProgress | null): void {
  try {
    if (p) localStorage.setItem(TOUR_KEY, serializeTour(p));
    else localStorage.removeItem(TOUR_KEY);
  } catch {
    // Not keeping the place is not worth a notice.
  }
}

interface HelpState {
  helpOpen: boolean;
  /** The tour's place, or null when there is none (not yet opened, or an older farm). */
  tour: TourProgress | null;
  /** True once the tour has been read for the farm on screen. */
  tourLoaded: boolean;

  openHelp: () => void;
  closeHelp: () => void;
  tourSkipStep: (id: TourStepId) => void;
  /** Skip the tour, or close it once it is finished. */
  tourEnd: () => void;
  /** Begin the tour again from the farm's day now. */
  tourReplay: () => void;
}

export const useHelp = create<HelpState>()((set, get) => {
  const keep = (tour: TourProgress | null): void => {
    write(tour);
    set({ tour });
  };
  return {
    helpOpen: false,
    tour: null,
    tourLoaded: false,

    openHelp: () => set({ helpOpen: true }),
    closeHelp: () => set({ helpOpen: false }),

    tourSkipStep(id) {
      const t = get().tour;
      if (t) keep(skipStep(t, id));
    },

    tourEnd() {
      const t = get().tour;
      if (t) keep(endTour(t));
    },

    tourReplay() {
      const day = useGame.getState().snapshot?.day;
      if (day === undefined) return;
      keep(startTour(day));
      // Back to the farm, where the strip is.
      set({ helpOpen: false });
      useGame.getState().setTab('farm');
    },
  };
});

type GameNow = ReturnType<typeof useGame.getState>;

/** True when the player has moved to something else on the farm, so the help screen steps aside. */
function leftHelp(s: GameNow, prev: GameNow): boolean {
  return (
    s.tab !== prev.tab ||
    (s.paddockId !== null && s.paddockId !== prev.paddockId) ||
    (s.mobId !== null && s.mobId !== prev.mobId) ||
    (s.move !== null && prev.move === null) ||
    (s.plan !== null && prev.plan === null) ||
    (s.build !== null && prev.build === null)
  );
}

let wired = false;

/**
 * Watch the game's store for the tour: start it for a new farm, read it back
 * for an open one, note what the player does, and close help when they go
 * somewhere else. Called once when /play opens (before the farm loads, so the
 * move from setup to a new farm is seen).
 */
export function wireTour(): void {
  if (wired) return;
  wired = true;
  useGame.subscribe((s, prev) => {
    const help = useHelp.getState();

    // A farm is being started or thrown away: the old tour goes with it.
    if (s.phase === 'setup' && prev.phase !== 'setup') {
      write(null);
      useHelp.setState({ tour: null, tourLoaded: false, helpOpen: false });
      return;
    }

    if (s.phase === 'ready' && s.snapshot && !help.tourLoaded) {
      const day = s.snapshot.day;
      const tour = prev.phase === 'setup' ? startTour(day) : tourOnOpen(readSaved(), day);
      write(tour);
      useHelp.setState({ tour, tourLoaded: true });
      return;
    }

    if (help.helpOpen && leftHelp(s, prev)) useHelp.setState({ helpOpen: false });

    const tour = help.tour;
    if (tour && tour.status === 'active') {
      const next = noteProgress(tour, observe(s));
      if (next !== tour) {
        write(next);
        useHelp.setState({ tour: next });
      }
    }
  });
}
