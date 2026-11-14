import { create } from 'zustand';
import { api, UNREACHABLE } from './api';
import { clearLastFarm, loadLastFarm, saveLastFarm } from './offline';
import { useGame } from './store';
import type { Snapshot } from './types';

/**
 * Offline viewing, kept apart from the game store so the store stays small.
 *
 * - Every snapshot the server sends is kept in this browser (offline.ts).
 * - When the game can not be reached on opening /play, the kept farm is
 *   shown, read-only, with one plain line.
 * - While offline, every action, Next day and skip is switched off. They
 *   already switch off while a request is under way (the store's `busy`
 *   count), so being offline holds that count up by one. Looking at the farm
 *   (the map, paddocks, mobs, tabs) keeps working, as it does while busy.
 * - A quiet check every 15 seconds, and one when the browser says it is back
 *   online, brings the live farm back and releases the buttons.
 */

interface OfflineState {
  offline: boolean;
}
export const useOffline = create<OfflineState>()(() => ({ offline: false }));

const CHECK_EVERY_MS = 15_000;
const SAVE_AFTER_MS = 400;

let holding = false;
let timer: ReturnType<typeof setInterval> | null = null;
let checking = false;

/** Hold the buttons off, or let them go. Counted once, so it can never run the count down by mistake. */
function hold(on: boolean): void {
  if (on === holding) return;
  holding = on;
  useGame.setState((s) => ({ busy: s.busy + (on ? 1 : -1) }));
}

function enter(): void {
  useOffline.setState({ offline: true });
  hold(true);
  if (!timer) timer = setInterval(() => void check(), CHECK_EVERY_MS);
}

function leave(): void {
  if (timer) clearInterval(timer);
  timer = null;
  hold(false);
  useOffline.setState({ offline: false });
}

/** Show a farm that was kept, as the live one. Read-only until the game answers. */
function showKept(kept: Snapshot): void {
  useGame.setState({ phase: 'ready', snapshot: kept, notice: null });
  enter();
}

/** Ask the server for the farm. If it answers, the live farm replaces the kept one. */
async function check(): Promise<void> {
  if (checking || !useOffline.getState().offline) return;
  checking = true;
  try {
    const r = await api.farm();
    if (!r.snapshot) {
      // The farm is gone or can not be opened: let the normal screens say so.
      leave();
      void useGame.getState().load();
      return;
    }
    const { paddockId, mobId } = useGame.getState();
    const snapshot = r.snapshot;
    leave();
    useGame.setState({
      snapshot,
      phase: 'ready',
      paddockId:
        paddockId !== null && snapshot.view.paddocks.some((p) => p.id === paddockId)
          ? paddockId
          : null,
      mobId: mobId !== null && snapshot.mobs.some((m) => m.id === mobId) ? mobId : null,
    });
  } catch {
    // Still not reachable. Try again at the next check.
  } finally {
    checking = false;
  }
}

/**
 * Start watching. Call once when /play is on the screen. Returns the function
 * that stops it.
 */
export function startOfflineWatch(): () => void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: Snapshot | null = null;

  const flush = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (pending && !useOffline.getState().offline) saveLastFarm(pending);
    pending = null;
  };

  // The game could not be reached on opening, and a farm was kept: show it.
  const reached = (): boolean => {
    const s = useGame.getState();
    if (s.phase !== 'failed') return false;
    if (navigator.onLine !== false && s.notice?.message !== UNREACHABLE) return false;
    const kept = loadLastFarm();
    if (!kept) return false;
    showKept(kept);
    return true;
  };

  const unsubscribe = useGame.subscribe((s, prev) => {
    if (s.phase === 'failed' && prev.phase !== 'failed') {
      reached();
      return;
    }
    if ((s.phase === 'setup' || s.phase === 'broken') && prev.phase !== s.phase) {
      // No farm to keep: it was thrown away, or never started.
      if (!useOffline.getState().offline) clearLastFarm();
      return;
    }
    if (s.snapshot && s.snapshot !== prev.snapshot && !useOffline.getState().offline) {
      pending = s.snapshot;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, SAVE_AFTER_MS);
    }
  });

  const onOffline = (): void => {
    // Only a farm on the screen is held. The loading and failed screens have their own words.
    if (useGame.getState().phase === 'ready') enter();
  };
  const onOnline = (): void => void check();
  const onHide = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onHide);

  // The page may already be offline, or the load may already have failed.
  if (!reached() && navigator.onLine === false && useGame.getState().phase === 'ready') enter();

  return () => {
    unsubscribe();
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onHide);
    flush();
    if (timer) clearInterval(timer);
    timer = null;
    if (useOffline.getState().offline) leave();
  };
}
