'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clockText } from '@/lib/game/format';
import {
  CALL_AT_S,
  DAY_SECONDS,
  DUSK_HOLD_S,
  IDLE_PAUSE_MS,
  IDLE_WORDS,
  mapClock,
  minutesAt,
  shouldCall,
  stepClock,
  useDayClock,
  type ClockGate,
  type ClockPos,
  type DayLight,
} from '@/lib/game/dayclock';
import { useReducedMotion } from '@/lib/game/hooks';
import { useHelp } from '@/lib/game/helpstore';
import { useGame, type GameState, type JobState } from '@/lib/game/store';
import { currentStep } from '@/lib/game/tour';
import type { Snapshot } from '@/lib/game/types';
import { Icon } from './Icon';
import styles from './play.module.css';

/** A job card that is being asked about, shown, or done: the day must not end under it. */
const midJob = (j: JobState): boolean =>
  j.phase === 'previewing' || j.phase === 'confirm' || j.phase === 'applying';

/**
 * Something open that the day must not end under: a build tool or its card, a move, a plan,
 * squares picked to sow, a job or market card mid-confirm, a request under way, or a confirm a
 * panel registered (`useHoldDay`). The sun runs on to dusk and waits. `busy` false leaves out
 * requests under way (the day's own request is one), for the words on screen.
 */
export function holdsDay(s: GameState, holds: Record<string, true>, busy = true): boolean {
  return (
    // A result that is only being read (Done) does not hold the day: the next day keeps it.
    (s.build !== null && s.build.phase !== 'done') ||
    (s.move !== null && s.move.phase !== 'done') ||
    s.plan !== null ||
    s.sow !== null ||
    (busy && s.busy > 0) ||
    Object.values(s.jobs).some(midJob) ||
    Object.values(s.acts).some(midJob) ||
    Object.keys(holds).length > 0
  );
}

/** Hold the sun at dusk while `active` (a confirm kept in a component's own state). */
export function useHoldDay(name: string, active: boolean): void {
  const hold = useDayClock((s) => s.hold);
  useEffect(() => (active ? hold(name) : undefined), [active, hold, name]);
}

/** The first-day tour: the sun stands still until its last step, "Let the day run". */
function useTouring(
  hasCattle: boolean,
  tour: ReturnType<typeof useHelp.getState>['tour'],
): boolean {
  const step = tour && tour.status === 'active' ? currentStep(tour, hasCattle) : null;
  return step !== null && step !== 'day';
}

/** What the clock may do now, from everything on screen. */
function useGate(hasCattle: boolean): ClockGate {
  const paused = useDayClock((s) => s.paused || s.autoPaused !== null);
  const holds = useDayClock((s) => s.holds);
  const tour = useHelp((s) => s.tour);
  const held = useGame((s) => holdsDay(s, holds));
  // A card in front of the farm, or a farm that has ended: the sun stands still.
  const front = useGame(
    (s) => s.phase !== 'ready' || s.summary !== null || s.yearEnd !== null || !!s.snapshot?.over,
  );
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = (): void => setHidden(document.hidden);
    on();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const touring = useTouring(hasCattle, tour);
  if (paused || front || touring) return 'stop';
  if (held || hidden) return 'hold';
  return 'run';
}

/**
 * The Fast Farm's moving day. Draws nothing: it moves the light on the map (through `mapClock`,
 * outside React, so it costs no screen redraw) and asks for the next day once a day, in the dark.
 * The frame loop runs only while the sun is moving: it stops when paused, held at dusk, or
 * waiting for the server, and starts again when that changes.
 */
export function DayClockRunner({ snapshot }: { snapshot: Snapshot }) {
  const load = useDayClock((s) => s.load);
  const speed = useDayClock((s) => s.speed);
  const pauseFor = useDayClock((s) => s.pauseFor);
  const autoDay = useGame((s) => s.autoDay);
  const reduceMotion = useReducedMotion();
  const gate = useGate(snapshot.mobs.length > 0);

  useEffect(() => load(), [load]);

  // No one at the farm: with no pointer, key or touch for IDLE_PAUSE_MS the day pauses itself,
  // so a tab left open does not run the farm (and the server) on for nothing (CALLS B207).
  useEffect(() => {
    let last = Date.now();
    const seen = (): void => {
      last = Date.now();
    };
    const kinds = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const;
    for (const k of kinds) window.addEventListener(k, seen, { capture: true, passive: true });
    const timer = setInterval(() => {
      const st = useDayClock.getState();
      if (st.paused || st.autoPaused !== null) {
        last = Date.now();
        return;
      }
      if (Date.now() - last >= IDLE_PAUSE_MS) pauseFor('idle');
    }, 5000);
    return () => {
      clearInterval(timer);
      for (const k of kinds) window.removeEventListener(k, seen, { capture: true });
    };
  }, [pauseFor]);

  const pos = useRef<ClockPos>({ s: 0, called: false, waiting: false });
  const light = useRef<DayLight>({
    first: snapshot.clock.firstLight,
    last: snapshot.clock.lastLight,
  });
  const nextFirst = useRef(snapshot.clock.firstLight);
  /** The farm day the clock asked for: when it comes in, the night plays on into its dawn. */
  const expectDay = useRef<number | null>(null);
  const shownDay = useRef(snapshot.day);
  const live = useRef({ gate, speed, reduceMotion });
  // The frame loop reads what is on screen now. Set before the loop's own effect runs.
  useLayoutEffect(() => {
    live.current = { gate, speed, reduceMotion };
  }, [gate, speed, reduceMotion]);
  const kick = useRef<() => void>(() => {});

  const publish = (): void => {
    const m = minutesAt(pos.current.s, light.current, nextFirst.current);
    mapClock.publish(live.current.reduceMotion ? null : m);
  };

  // A new farm day on screen. The one this clock asked for carries on into its dawn. Any other
  // (Next day, a skip, another tab, a farm loaded) starts at first light.
  useEffect(() => {
    if (snapshot.day === shownDay.current) return;
    shownDay.current = snapshot.day;
    nextFirst.current = snapshot.clock.firstLight;
    if (expectDay.current === snapshot.day && pos.current.called) return;
    expectDay.current = null;
    pos.current = { s: 0, called: false, waiting: false };
    light.current = { first: snapshot.clock.firstLight, last: snapshot.clock.lastLight };
    publish();
    kick.current();
  }, [snapshot.day, snapshot.clock.firstLight, snapshot.clock.lastLight]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const ask = (): void => {
      const p = pos.current;
      p.called = true;
      p.waiting = true;
      expectDay.current = shownDay.current + 1;
      void autoDay().then((outcome) => {
        const q = pos.current;
        if (outcome === 'next') {
          q.waiting = false;
        } else if (outcome === 'busy') {
          // Something started at the same moment: wait in the dark and ask again.
          q.called = false;
          q.waiting = false;
          expectDay.current = null;
        } else {
          // Paused for the player, a failure (paused so nothing is asked again), or another tab
          // moved the farm on: the day on screen starts again at first light. A pause the day
          // makes is not the player's choice, so it is not kept on the device.
          if (outcome === 'pause') pauseFor('stop');
          else if (outcome === 'failed') pauseFor('failed');
          expectDay.current = null;
          pos.current = {
            s: outcome === 'failed' ? DUSK_HOLD_S : 0,
            called: false,
            waiting: false,
          };
          const c = useGame.getState().snapshot?.clock;
          if (c) {
            light.current = { first: c.firstLight, last: c.lastLight };
            nextFirst.current = c.firstLight;
          }
          publish();
        }
        // The loop that is current now (the gate may have changed while the server answered).
        kick.current();
      });
    };
    const frame = (now: number): void => {
      raf = 0;
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
      last = now;
      const { gate: g, speed: v } = live.current;
      const p = pos.current;
      const before = p.s;
      p.s = stepClock(p, dt, v, g);
      if (shouldCall(p, g)) ask();
      // Tomorrow is in and its dawn has played: the new day starts at first light.
      if (p.called && !p.waiting && p.s >= DAY_SECONDS) {
        pos.current = { s: 0, called: false, waiting: false };
        const c = useGame.getState().snapshot?.clock;
        if (c) light.current = { first: c.firstLight, last: c.lastLight };
      }
      publish();
      // Keep going while the sun moves; stop when it stands (held, paused, or waiting).
      const moved = pos.current.s !== before || dt === 0;
      if (moved && g !== 'stop') raf = requestAnimationFrame(frame);
      else last = 0;
    };
    const start = (): void => {
      if (raf || live.current.gate === 'stop') return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    kick.current = start;
    publish();
    start();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      kick.current = () => {};
    };
    // Starts again when the gate, the speed or reduce motion changes.
  }, [gate, speed, reduceMotion, autoDay, pauseFor]);

  // Off the Fast Farm (or the screen closes): the map goes back to the farm's own clock.
  useEffect(() => () => mapClock.publish(null), []);
  return null;
}

/** Play or pause, and the speed, beside the skips (Fast Farm only). */
export function DayControls() {
  const paused = useDayClock((s) => s.paused || s.autoPaused !== null);
  const speed = useDayClock((s) => s.speed);
  const togglePlay = useDayClock((s) => s.togglePlay);
  const stepSpeed = useDayClock((s) => s.stepSpeed);
  const over = useGame((s) => s.snapshot?.over != null);
  return (
    <>
      <button
        type="button"
        className={`${styles.tb} ${styles.tbicon}`}
        aria-label={paused ? 'Play: let the day run' : 'Pause the day'}
        aria-pressed={!paused}
        title={paused ? 'Play' : 'Pause'}
        disabled={over}
        onClick={togglePlay}
      >
        <Icon name={paused ? 'play' : 'pause'} size={12} />
      </button>
      <button
        type="button"
        className={`${styles.tb} ${styles.tbicon}`}
        aria-label={`Speed ${speed} times. Change speed`}
        title="Speed"
        disabled={over}
        onClick={stepSpeed}
      >
        {speed}×
      </button>
    </>
  );
}

/** What the line under the sun says: the night just passed, or why the sun is standing still. */
function useDayWords(): string {
  const paused = useDayClock((s) => s.paused || s.autoPaused !== null);
  const idle = useDayClock((s) => s.autoPaused === 'idle');
  const holds = useDayClock((s) => s.holds);
  const held = useGame((s) => holdsDay(s, holds, false));
  const note = useGame((s) => s.dayNote);
  const hasCattle = useGame((s) => (s.snapshot?.mobs.length ?? 0) > 0);
  const touring = useTouring(
    hasCattle,
    useHelp((s) => s.tour),
  );
  if (idle) return IDLE_WORDS;
  if (paused) return note ? `Paused. ${note}` : 'Paused';
  if (touring) return 'The day starts moving at the last tour step';
  if (held) return 'The sun waits at dusk until you finish';
  return note ?? 'The day moves by itself';
}

/**
 * The Fast Farm's slim day bar, in the daylight bar's place: first light to last light, with the
 * sun moving along it. The sun is moved straight on the page each frame, not through React.
 */
export function SunTrack({ clock, labels = true }: { clock: Snapshot['clock']; labels?: boolean }) {
  const sun = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const words = useDayWords();
  const { firstLight: first, lastLight: last } = clock;
  useEffect(() => {
    const place = (m: number | null): void => {
      const el = sun.current;
      if (!el) return;
      if (m === null) {
        el.style.opacity = '0';
        return;
      }
      const p = (m - first) / Math.max(1, last - first);
      el.style.transform = `translateX(${(Math.min(1, Math.max(0, p)) * 100).toFixed(2)}%)`;
      // Before first light and after last light the sun is down.
      el.style.opacity = p < 0 || p > 1 ? '0.25' : '1';
    };
    place(mapClock.now);
    return mapClock.subscribe(place);
  }, [first, last]);
  return (
    <div className={styles.daylight}>
      <div
        className={`${styles.dltrack} ${styles.suntrack}`}
        role="img"
        title={labels ? undefined : words}
        aria-label={`The day runs from first light at ${clockText(first)} to last light at ${clockText(last)}.`}
      >
        {!reduceMotion && <span ref={sun} className={styles.suncar} />}
      </div>
      {labels ? (
        <p className={styles.dlnote}>
          <span aria-hidden="true">{clockText(first)}</span>
          <b role="status">{words}</b>
          <span aria-hidden="true">{clockText(last)}</span>
        </p>
      ) : (
        // A phone on its side has no room for the words: they are read out, and shown on hover.
        <p className="sr-only" role="status">
          {words}
        </p>
      )}
    </div>
  );
}

// Re-exported for tests that check where the sun waits.
export { CALL_AT_S, DUSK_HOLD_S };
