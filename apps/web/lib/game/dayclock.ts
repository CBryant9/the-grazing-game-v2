import { create } from 'zustand';
import { money, plural } from './format';
import type { SummaryWire } from './types';

/**
 * Fast Farm's day moves by itself (Claudia, 19 Nov 2026): "the day could just slowly move as
 * you're playing and you see a sunset and sunrise happen across time, so the individual days
 * move, not too fast, but they pass, and they can pause and play and still skip."
 *
 * The on-screen day is a number of seconds `s` from 0 (first light) to DAY_SECONDS. The light
 * part runs first light to last light. Then comes the night: dusk, dark, dawn. The next day is
 * asked for once, in the dark (CALL_AT_S), with the existing day endpoint, so the swap is not
 * seen. While the answer is on its way the sun waits in the dark; when it comes the dawn plays
 * and the new day starts at first light. One server call a day, no more.
 *
 * Nothing here knows a game rule. It is a clock for the screen. The engine's day is still the
 * server's Next day.
 */

/** Seconds a whole Fast Farm day takes on screen at 1×: light, then dusk, night and dawn. */
export const DAY_SECONDS = 16;
/** Seconds of that from first light to last light. The rest (4 s) is the night. */
export const LIGHT_SECONDS = 12;
/** The speeds the speed button steps through. */
export const SPEEDS = [1, 2, 4] as const;
export type DaySpeed = (typeof SPEEDS)[number];
/** Map minutes from last light to the darkest part of the night, and from there to first light. */
export const NIGHT_MINUTES = 60;
/** Where the sun waits while something is open: a little after last light, in the warm dusk. */
export const DUSK_HOLD_S = LIGHT_SECONDS + 0.4;
/** When the next day is asked for: the middle of the night, when the map is dark. */
export const CALL_AT_S = (LIGHT_SECONDS + DAY_SECONDS) / 2;

/** First and last light, minutes after midnight. */
export interface DayLight {
  first: number;
  last: number;
}

/**
 * The time of day the map is lit for, `s` seconds into the on-screen day. `nextFirst` is
 * tomorrow's first light (today's until the new day has come in).
 */
export function minutesAt(s: number, today: DayLight, nextFirst: number): number {
  if (s <= LIGHT_SECONDS) {
    return today.first + (Math.max(0, s) / LIGHT_SECONDS) * (today.last - today.first);
  }
  const n = Math.min(1, (s - LIGHT_SECONDS) / (DAY_SECONDS - LIGHT_SECONDS));
  if (n < 0.5) return today.last + n * 2 * NIGHT_MINUTES;
  return nextFirst - (1 - n) * 2 * NIGHT_MINUTES;
}

/**
 * What the clock may do now. 'run': the day moves. 'hold': something is open, so the sun runs on
 * to dusk and waits there; the day does not end. 'stop': the sun stands still (paused, the tour,
 * a card in front of the farm, the farm ended).
 */
export type ClockGate = 'run' | 'hold' | 'stop';

/** Where the on-screen day is: seconds in, whether tomorrow was asked for, and whether it has come. */
export interface ClockPos {
  s: number;
  /** The next day has been asked for. */
  called: boolean;
  /** It was asked for and has not come yet. */
  waiting: boolean;
}

/**
 * Move the on-screen day on by `dt` real seconds at `speed`. Pure: returns the new seconds.
 * The day never passes CALL_AT_S until tomorrow has been asked for and has come in.
 */
export function stepClock(pos: ClockPos, dt: number, speed: DaySpeed, gate: ClockGate): number {
  const { s, called, waiting } = pos;
  if (gate === 'stop' || dt <= 0) return s;
  let next = s + dt * speed;
  if (!called && gate === 'hold') next = Math.min(next, Math.max(s, DUSK_HOLD_S));
  if (!called || waiting) next = Math.min(next, Math.max(s, CALL_AT_S));
  return Math.min(next, DAY_SECONDS);
}

/** True when it is time to ask for tomorrow: the dark is reached and nothing holds the day. */
export const shouldCall = (pos: ClockPos, gate: ClockGate): boolean =>
  !pos.called && gate === 'run' && pos.s >= CALL_AT_S;

/** The next speed after `speed`, round to 1× again. */
export function nextSpeed(speed: DaySpeed): DaySpeed {
  const i = SPEEDS.indexOf(speed);
  return SPEEDS[(i + 1) % SPEEDS.length]!;
}

/**
 * The one line shown in the top bar for a day that passed while playing: what changed overnight,
 * as facts. No praise, no blame.
 */
export function dayLine(s: SummaryWire, rainMm: number | null | undefined): string {
  const parts: string[] = [];
  if (typeof rainMm === 'number' && rainMm > 0) parts.push(`${Math.round(rainMm)} mm rain`);
  const cash = Math.round(s.cash.after - s.cash.before);
  if (cash !== 0) parts.push(`cash ${cash > 0 ? '+' : ''}${money(cash)}`);
  if (s.births > 0) parts.push(`${plural(s.births, 'calf', 'calves')} born`);
  if (s.deaths > 0) parts.push(`${plural(s.deaths, 'death', 'deaths')}`);
  if (s.arrived.head > 0) parts.push(`${plural(s.arrived.head, 'head', 'head')} arrived`);
  if (s.bookedSold.head > 0) parts.push(`${plural(s.bookedSold.head, 'head', 'head')} sold`);
  if (s.planMoves.length > 0) parts.push(plural(s.planMoves.length, 'plan move', 'plan moves'));
  return parts.length ? `Overnight: ${parts.join(' · ')}` : 'Overnight: no change';
}

// ---- What the player chose, kept on this device

/** The key the clock's pause and speed are kept under in localStorage. */
export const DAY_CLOCK_KEY = 'gg-dayclock';

interface Saved {
  paused: boolean;
  speed: DaySpeed;
}

/** Read the saved choice back. Anything this code did not write gives the default: playing at 1×. */
export function parseSaved(raw: string | null): Saved {
  const fallback: Saved = { paused: false, speed: 1 };
  if (!raw) return fallback;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const speed = SPEEDS.find((x) => x === o.speed) ?? 1;
    return { paused: o.paused === true, speed };
  } catch {
    return fallback;
  }
}

function readSaved(): Saved {
  try {
    return parseSaved(localStorage.getItem(DAY_CLOCK_KEY));
  } catch {
    // Storage is blocked: the choice lasts for this visit only.
    return parseSaved(null);
  }
}

function writeSaved(v: Saved): void {
  try {
    localStorage.setItem(DAY_CLOCK_KEY, JSON.stringify(v));
  } catch {
    // Storage is blocked or full: nothing to do.
  }
}

export interface DayClockState {
  /** True once the saved choice has been read on this device. */
  loaded: boolean;
  paused: boolean;
  speed: DaySpeed;
  /** Things open that hold the sun at dusk, by name (a confirm the store does not know about). */
  holds: Record<string, true>;
  load: () => void;
  setPaused: (paused: boolean) => void;
  togglePlay: () => void;
  stepSpeed: () => void;
  /** Hold the sun at dusk while `name` is open. Returns the release. */
  hold: (name: string) => () => void;
}

export const useDayClock = create<DayClockState>()((set, get) => {
  const keep = (patch: Partial<Saved>): void => {
    const next = { paused: get().paused, speed: get().speed, ...patch };
    writeSaved(next);
    set(next);
  };
  return {
    loaded: false,
    paused: false,
    speed: 1,
    holds: {},
    load() {
      if (get().loaded) return;
      set({ ...readSaved(), loaded: true });
    },
    setPaused: (paused) => keep({ paused }),
    togglePlay: () => keep({ paused: !get().paused }),
    stepSpeed: () => keep({ speed: nextSpeed(get().speed) }),
    hold(name) {
      set((st) => ({ holds: { ...st.holds, [name]: true } }));
      return () =>
        set((st) => {
          const holds = { ...st.holds };
          delete holds[name];
          return { holds };
        });
    },
  };
});

/**
 * Minutes after midnight for the map, published by the running clock every frame. Kept out of
 * React so the light can move at 60 fps without drawing the screen again: the map listens here.
 */
type Listener = (minutes: number | null) => void;
const listeners = new Set<Listener>();
let lastMinutes: number | null = null;

export const mapClock = {
  publish(minutes: number | null): void {
    lastMinutes = minutes;
    for (const l of listeners) l(minutes);
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get now(): number | null {
    return lastMinutes;
  },
};
