import { describe, expect, it } from 'vitest';
import {
  currentStep,
  endTour,
  noteProgress,
  observe,
  parseTour,
  serializeTour,
  skipStep,
  startTour,
  stepLabel,
  tourFinished,
  tourOnOpen,
  tourSteps,
  TOUR_TEXT,
  type TourObservation,
  type TourReadState,
} from './tour';

const none: TourObservation = {
  paddockOpen: false,
  moved: false,
  fenceBuilt: false,
  marketOpen: false,
  day: 0,
};

const quiet: TourReadState = {
  paddockId: null,
  move: null,
  build: null,
  tab: 'farm',
  snapshot: { day: 0 },
};

describe('the steps a farm gets', () => {
  it('has five steps with cattle, in the order of the PRD', () => {
    expect(tourSteps(true)).toEqual(['paddock', 'move', 'fence', 'market', 'day']);
  });

  it('leaves the move step out of a farm with no cattle', () => {
    expect(tourSteps(false)).toEqual(['paddock', 'fence', 'market', 'day']);
  });

  it('has words for every step', () => {
    for (const s of tourSteps(true)) {
      expect(TOUR_TEXT[s].title.length).toBeGreaterThan(0);
      expect(TOUR_TEXT[s].body.length).toBeGreaterThan(0);
    }
  });
});

describe('reading what the player did', () => {
  it('sees nothing on a quiet farm', () => {
    expect(observe(quiet)).toEqual(none);
  });

  it('sees a paddock open', () => {
    expect(observe({ ...quiet, paddockId: 3 }).paddockOpen).toBe(true);
  });

  it('sees a move that is done, and not one that is only picked', () => {
    expect(observe({ ...quiet, move: { phase: 'confirm' } }).moved).toBe(false);
    expect(observe({ ...quiet, move: { phase: 'done' } }).moved).toBe(true);
  });

  it('sees a fence that is built, and not another tool or a fence still being drawn', () => {
    expect(observe({ ...quiet, build: { tool: 'fence', phase: 'confirm' } }).fenceBuilt).toBe(
      false,
    );
    expect(observe({ ...quiet, build: { tool: 'pipe', phase: 'done' } }).fenceBuilt).toBe(false);
    expect(observe({ ...quiet, build: { tool: 'fence', phase: 'done' } }).fenceBuilt).toBe(true);
  });

  it('sees the market open', () => {
    expect(observe({ ...quiet, tab: 'market' }).marketOpen).toBe(true);
    expect(observe({ ...quiet, tab: 'herd' }).marketOpen).toBe(false);
  });

  it('gives the day, or null with no farm', () => {
    expect(observe({ ...quiet, snapshot: { day: 4 } }).day).toBe(4);
    expect(observe({ ...quiet, snapshot: null }).day).toBeNull();
  });
});

describe('walking through the tour', () => {
  it('starts on the first step', () => {
    const p = startTour(0);
    expect(currentStep(p, true)).toBe('paddock');
    expect(stepLabel(p, true)).toBe('Step 1 of 5');
    expect(stepLabel(p, false)).toBe('Step 1 of 4');
  });

  it('moves on when the step is really done', () => {
    let p = startTour(0);
    p = noteProgress(p, { ...none, paddockOpen: true });
    expect(currentStep(p, true)).toBe('move');
    p = noteProgress(p, { ...none, moved: true });
    expect(currentStep(p, true)).toBe('fence');
    p = noteProgress(p, { ...none, fenceBuilt: true });
    expect(currentStep(p, true)).toBe('market');
    p = noteProgress(p, { ...none, marketOpen: true });
    expect(currentStep(p, true)).toBe('day');
    p = noteProgress(p, { ...none, day: 1 });
    expect(currentStep(p, true)).toBeNull();
    expect(tourFinished(p, true)).toBe(true);
  });

  it('gives no credit for a step the player has not done', () => {
    const p = startTour(0);
    expect(noteProgress(p, none)).toBe(p);
  });

  it('counts a step done early, whatever the order', () => {
    let p = startTour(0);
    p = noteProgress(p, { ...none, marketOpen: true });
    expect(currentStep(p, true)).toBe('paddock');
    p = noteProgress(p, { ...none, paddockOpen: true });
    expect(currentStep(p, true)).toBe('move');
  });

  it('does not count the day until the farm is past the day the tour began', () => {
    const p = startTour(5);
    expect(noteProgress(p, { ...none, day: 5 })).toBe(p);
    expect(noteProgress(p, { ...none, day: 6 }).done).toEqual(['day']);
  });

  it('keeps a step done once it is seen, and gives back the same object for nothing new', () => {
    const a = noteProgress(startTour(0), { ...none, paddockOpen: true });
    const b = noteProgress(a, { ...none, paddockOpen: true });
    expect(b).toBe(a);
    const c = noteProgress(a, none);
    expect(c.done).toEqual(['paddock']);
  });

  it('has no move step to wait for on a farm with no cattle', () => {
    let p = startTour(0);
    p = noteProgress(p, { ...none, paddockOpen: true });
    expect(currentStep(p, false)).toBe('fence');
    expect(currentStep(p, true)).toBe('move');
  });

  it('skips one step and goes on to the next', () => {
    let p = startTour(0);
    p = skipStep(p, 'paddock');
    expect(currentStep(p, true)).toBe('move');
    expect(p.skipped).toEqual(['paddock']);
    expect(skipStep(p, 'paddock')).toBe(p);
  });

  it('does not skip a step that is already done', () => {
    const p = noteProgress(startTour(0), { ...none, paddockOpen: true });
    expect(skipStep(p, 'paddock')).toBe(p);
  });

  it('finishes when every step is done or skipped', () => {
    let p = startTour(0);
    for (const s of tourSteps(false)) p = skipStep(p, s);
    expect(tourFinished(p, false)).toBe(true);
    expect(currentStep(p, false)).toBeNull();
    expect(stepLabel(p, false)).toBeNull();
  });

  it('can be skipped at any time, and then shows nothing and notices nothing', () => {
    const p = endTour(startTour(0));
    expect(p.status).toBe('off');
    expect(currentStep(p, true)).toBeNull();
    expect(noteProgress(p, { ...none, paddockOpen: true })).toBe(p);
    expect(tourFinished(p, true)).toBe(false);
    expect(endTour(p)).toBe(p);
  });

  it('can be played again from a new start', () => {
    const old = endTour(noteProgress(startTour(0), { ...none, paddockOpen: true }));
    const again = startTour(9);
    expect(old.done).toEqual(['paddock']);
    expect(again).toEqual({ v: 1, status: 'active', done: [], skipped: [], startDay: 9 });
  });
});

describe('keeping the place in the browser', () => {
  it('round-trips', () => {
    const p = skipStep(noteProgress(startTour(2), { ...none, paddockOpen: true }), 'move');
    expect(parseTour(serializeTour(p))).toEqual(p);
  });

  it('gives null for nothing, damage or another shape', () => {
    expect(parseTour(null)).toBeNull();
    expect(parseTour('')).toBeNull();
    expect(parseTour('{not json')).toBeNull();
    expect(parseTour('42')).toBeNull();
    expect(parseTour('null')).toBeNull();
    expect(
      parseTour(JSON.stringify({ v: 2, status: 'active', done: [], skipped: [], startDay: 0 })),
    ).toBeNull();
    expect(
      parseTour(JSON.stringify({ v: 1, status: 'maybe', done: [], skipped: [], startDay: 0 })),
    ).toBeNull();
    expect(
      parseTour(JSON.stringify({ v: 1, status: 'active', done: 'x', skipped: [], startDay: 0 })),
    ).toBeNull();
    expect(
      parseTour(JSON.stringify({ v: 1, status: 'active', done: [], skipped: [], startDay: 'a' })),
    ).toBeNull();
  });

  it('drops step names it does not know', () => {
    const raw = JSON.stringify({
      v: 1,
      status: 'active',
      done: ['paddock', 'rubbish'],
      skipped: [7, 'market'],
      startDay: 0,
    });
    expect(parseTour(raw)).toEqual({
      v: 1,
      status: 'active',
      done: ['paddock'],
      skipped: ['market'],
      startDay: 0,
    });
  });

  it('uses a saved tour as it is, including one that was skipped', () => {
    const off = endTour(startTour(0));
    expect(tourOnOpen(off, 50)).toBe(off);
  });

  it('starts a tour for a farm that has not seen a day, and not for an older farm', () => {
    expect(tourOnOpen(null, 0)).toEqual(startTour(0));
    expect(tourOnOpen(null, 1)).toEqual(startTour(1));
    expect(tourOnOpen(null, 30)).toBeNull();
  });
});
