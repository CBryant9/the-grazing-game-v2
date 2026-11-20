import { describe, expect, it, vi } from 'vitest';
import {
  CALL_AT_S,
  DAY_CLOCK_KEY,
  DAY_SECONDS,
  DUSK_HOLD_S,
  IDLE_PAUSE_MS,
  IDLE_WORDS,
  LIGHT_SECONDS,
  dayLine,
  minutesAt,
  nextSpeed,
  parseSaved,
  shouldCall,
  stepClock,
  useDayClock,
  type ClockPos,
} from './dayclock';
import type { SummaryWire } from './types';

const light = { first: 360, last: 1110 };
const at = (s: number, called = false, waiting = false): ClockPos => ({ s, called, waiting });

describe('the Fast Farm day on screen (Claudia, 19 Nov 2026)', () => {
  it('is about 16 seconds at 1×, about 12 of them light, in named constants', () => {
    expect(DAY_SECONDS).toBe(16);
    expect(LIGHT_SECONDS).toBe(12);
    expect(DUSK_HOLD_S).toBeGreaterThan(LIGHT_SECONDS);
    expect(CALL_AT_S).toBeGreaterThan(DUSK_HOLD_S);
    expect(CALL_AT_S).toBeLessThan(DAY_SECONDS);
  });

  it('lights the map from first light to last light, then dusk, night and the next dawn', () => {
    expect(minutesAt(0, light, 362)).toBe(360);
    expect(minutesAt(LIGHT_SECONDS / 2, light, 362)).toBeCloseTo(735, 6);
    expect(minutesAt(LIGHT_SECONDS, light, 362)).toBe(1110);
    // After last light it gets later, into the night.
    expect(minutesAt(LIGHT_SECONDS + 1, light, 362)).toBeGreaterThan(1110);
    // Before the end it is the small hours before tomorrow's first light, reaching it at the end.
    expect(minutesAt(DAY_SECONDS - 0.5, light, 362)).toBeLessThan(362);
    expect(minutesAt(DAY_SECONDS, light, 362)).toBe(362);
  });

  it('moves at the speed picked, and stops when stopped', () => {
    expect(stepClock(at(1), 0.5, 1, 'run')).toBeCloseTo(1.5, 9);
    expect(stepClock(at(1), 0.5, 2, 'run')).toBeCloseTo(2, 9);
    expect(stepClock(at(1), 0.5, 4, 'run')).toBeCloseTo(3, 9);
    expect(stepClock(at(5), 1, 4, 'stop')).toBe(5);
  });

  it('holds the sun at dusk while something is open, and never ends the day under it', () => {
    let s = 10;
    for (let i = 0; i < 100; i++) s = stepClock(at(s), 0.25, 4, 'hold');
    expect(s).toBe(DUSK_HOLD_S);
    expect(shouldCall(at(s), 'hold')).toBe(false);
    // Already past dusk when the hold began: it waits right there.
    expect(stepClock(at(13), 1, 1, 'hold')).toBe(13);
    // Let go: the day goes on to the night, and only then asks for tomorrow.
    const on = stepClock(at(s), 2, 1, 'run');
    expect(on).toBe(CALL_AT_S);
    expect(shouldCall(at(on), 'run')).toBe(true);
  });

  it('asks for tomorrow once, waits in the dark for the answer, then plays the dawn', () => {
    expect(shouldCall(at(CALL_AT_S - 0.01), 'run')).toBe(false);
    expect(shouldCall(at(CALL_AT_S, true, true), 'run')).toBe(false);
    // Waiting: the sun does not move past the dark.
    expect(stepClock(at(CALL_AT_S, true, true), 3, 4, 'run')).toBe(CALL_AT_S);
    // The answer came: on to the end of the night, no further.
    expect(stepClock(at(CALL_AT_S, true, false), 3, 4, 'run')).toBe(DAY_SECONDS);
  });

  it('runs a day in 16 s at 1×, 8 s at 2× and 4 s at 4×, with one call each', () => {
    for (const [speed, secs] of [
      [1, 16],
      [2, 8],
      [4, 4],
    ] as const) {
      let pos = at(0);
      let calls = 0;
      let t = 0;
      while (t < 100) {
        pos = { ...pos, s: stepClock(pos, 1 / 60, speed, 'run') };
        t += 1 / 60;
        if (shouldCall(pos, 'run')) {
          calls++;
          pos = { ...pos, called: true, waiting: false };
        }
        if (pos.called && pos.s >= DAY_SECONDS) break;
      }
      expect(calls).toBe(1);
      expect(t).toBeCloseTo(secs, 0);
    }
  });

  it('steps the speed 1×, 2×, 4× and round again', () => {
    expect(nextSpeed(1)).toBe(2);
    expect(nextSpeed(2)).toBe(4);
    expect(nextSpeed(4)).toBe(1);
  });

  it('reads the saved pause and speed back, or plays at 1×', () => {
    expect(parseSaved(null)).toEqual({ paused: false, speed: 1 });
    expect(parseSaved('not json')).toEqual({ paused: false, speed: 1 });
    expect(parseSaved('{"paused":true,"speed":4}')).toEqual({ paused: true, speed: 4 });
    expect(parseSaved('{"paused":"yes","speed":3}')).toEqual({ paused: false, speed: 1 });
  });
});

describe('the one line for a day that passed while playing', () => {
  const change = (before: number, after: number) => ({ before, after });
  const summary = (over: Partial<SummaryWire> = {}): SummaryWire =>
    ({
      kind: 'day',
      cash: change(10000, 9700),
      births: 0,
      deaths: 0,
      arrived: { head: 0, calves: 0 },
      bookedSold: { head: 0, net: 0 },
      planMoves: [],
      stops: [],
      ...over,
    }) as SummaryWire;

  it('states what changed overnight as facts', () => {
    expect(dayLine(summary(), 0)).toBe('Overnight: cash -$300');
    expect(dayLine(summary({ births: 2, cash: change(0, 0) }), 12)).toBe(
      'Overnight: 12 mm rain · 2 calves born',
    );
    expect(
      dayLine(summary({ arrived: { head: 40, calves: 0 }, planMoves: ['Cows to Creek'] }), null),
    ).toBe('Overnight: cash -$300 · 40 head arrived · 1 plan move');
    expect(dayLine(summary({ cash: change(5, 5) }), null)).toBe('Overnight: no change');
  });

  it('never praises or blames', () => {
    const line = dayLine(summary({ deaths: 3, births: 1 }), 4).toLowerCase();
    for (const w of ['good', 'bad', 'well done', 'should', 'poor', 'great']) {
      expect(line).not.toContain(w);
    }
  });
});

describe("pauses the day makes itself are not the player's choice (CALLS B207)", () => {
  const saved: Record<string, string> = {};
  const storage = {
    getItem: (k: string) => saved[k] ?? null,
    setItem: (k: string, v: string) => {
      saved[k] = v;
    },
  };

  it('no one at the farm for 3 minutes pauses the day, with a plain fact', () => {
    expect(IDLE_PAUSE_MS).toBe(3 * 60 * 1000);
    expect(IDLE_WORDS).toBe('Paused: no one at the farm for 3 minutes. Play to carry on.');
  });

  it('an idle, stop or failed pause is never written to the device; Play clears it; Pause is saved', () => {
    vi.stubGlobal('localStorage', storage);
    try {
      useDayClock.setState({ paused: false, autoPaused: null, speed: 1, loaded: true });
      for (const why of ['idle', 'stop', 'failed'] as const) {
        delete saved[DAY_CLOCK_KEY];
        useDayClock.getState().pauseFor(why);
        expect(useDayClock.getState().autoPaused).toBe(why);
        expect(saved[DAY_CLOCK_KEY]).toBeUndefined();
        // Play lets the day run again, and clears the pause it made.
        useDayClock.getState().togglePlay();
        expect(useDayClock.getState().autoPaused).toBeNull();
        expect(useDayClock.getState().paused).toBe(false);
      }
      // The player's own Pause is kept.
      useDayClock.getState().togglePlay();
      expect(parseSaved(saved[DAY_CLOCK_KEY] ?? null).paused).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
