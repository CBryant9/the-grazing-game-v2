import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayResponse, Snapshot, SummaryWire } from './types';

const api = vi.hoisted(() => ({
  farm: vi.fn(),
  day: vi.fn(),
  skip: vi.fn(),
  preview: vi.fn(),
  act: vi.fn(),
}));
vi.mock('./api', () => {
  class ApiError extends Error {
    status = 500;
  }
  return { api, ApiError };
});

import { useGame } from './store';

/*
 * Fast Farm's moving day asks for tomorrow with the same day endpoint as Next day (Claudia,
 * 19 Nov 2026). It shows one line of facts unless the day should stop for the player.
 */

const snap = (day: number): Snapshot =>
  ({
    day,
    farmVersion: `v${day}`,
    view: { paddocks: [] },
    mobs: [],
    todo: [],
    totals: { rainMm: 6 },
    clock: { daylightLimit: false, firstLight: 360, lastLight: 1100 },
  }) as unknown as Snapshot;

const summary = (over: Partial<SummaryWire> = {}): SummaryWire =>
  ({
    kind: 'day',
    cash: { before: 1000, after: 900 },
    births: 0,
    deaths: 0,
    arrived: { head: 0, calves: 0 },
    bookedSold: { head: 0, net: 0 },
    planMoves: [],
    stops: [],
    reportFirst: false,
    ...over,
  }) as SummaryWire;

const reply = (day: number, s: SummaryWire): DayResponse => ({
  ok: true,
  snapshot: snap(day),
  summary: s,
  yearEnd: null,
  yearsClosed: 0,
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  useGame.setState({
    phase: 'ready',
    snapshot: snap(4),
    busy: 0,
    notice: null,
    summary: null,
    dayNote: null,
    yearEnd: null,
    jobs: {},
    acts: {},
    move: null,
    plan: null,
    sow: null,
    build: null,
  });
});

describe('the moving day asking for tomorrow', () => {
  it('a plain day: one line of facts, no summary card, and the clock carries on', async () => {
    api.day.mockResolvedValue(reply(5, summary()));
    expect(await useGame.getState().autoDay()).toBe('next');
    expect(api.day).toHaveBeenCalledTimes(1);
    expect(api.day).toHaveBeenCalledWith('v4');
    const s = useGame.getState();
    expect(s.snapshot!.day).toBe(5);
    expect(s.summary).toBeNull();
    expect(s.dayNote).toBe('Overnight: 6 mm rain · cash -$100');
    // The day's own request does not grey out the time buttons.
    expect(s.busy).toBe(0);
  });

  it('a day with something a skip stops for: the full summary, and the clock pauses', async () => {
    const stopped = summary({ stops: ['Mob 1 has no water.'] });
    api.day.mockResolvedValue(reply(5, stopped));
    expect(await useGame.getState().autoDay()).toBe('pause');
    expect(useGame.getState().summary).toBe(stopped);
    expect(useGame.getState().dayNote).toBeNull();
  });

  it('a worker report that needs the eye pauses too', async () => {
    api.day.mockResolvedValue(reply(5, summary({ reportFirst: true })));
    expect(await useGame.getState().autoDay()).toBe('pause');
  });

  it('another tab moved the farm on: the latest farm is shown and the day starts again', async () => {
    api.day.mockResolvedValue({
      ok: false,
      reason: 'stale',
      message: 'Changed.',
      snapshot: snap(9),
    });
    expect(await useGame.getState().autoDay()).toBe('stale');
    expect(useGame.getState().snapshot!.day).toBe(9);
  });

  it('a failure stops the clock with a notice, so nothing is asked again by itself', async () => {
    api.day.mockRejectedValue(new Error('offline'));
    expect(await useGame.getState().autoDay()).toBe('failed');
    expect(useGame.getState().notice?.retry).toBeTypeOf('function');
  });

  it('one request at a time: a second ask, Next day or a skip while one is out does nothing', async () => {
    let done!: (r: DayResponse) => void;
    api.day.mockImplementation(() => new Promise((r) => (done = r)));
    const first = useGame.getState().autoDay();
    expect(await useGame.getState().autoDay()).toBe('busy');
    await useGame.getState().nextDay();
    await useGame.getState().skip('week');
    expect(api.day).toHaveBeenCalledTimes(1);
    expect(api.skip).not.toHaveBeenCalled();
    done(reply(5, summary()));
    expect(await first).toBe('next');
  });

  it('a Done result being read stays into the next day; a half-done card would have held the day', async () => {
    useGame.setState({
      build: { phase: 'done', message: 'Built 784 m of permanent fence.' } as never,
    });
    api.day.mockResolvedValue(reply(5, summary()));
    await useGame.getState().autoDay();
    expect(useGame.getState().build?.phase).toBe('done');
  });

  it('a manual Next day still shows the full summary and clears the line', async () => {
    useGame.setState({ dayNote: 'Overnight: cash -$100' });
    const s = summary();
    api.day.mockResolvedValue(reply(5, s));
    await useGame.getState().nextDay();
    expect(useGame.getState().summary).toBe(s);
    expect(useGame.getState().dayNote).toBeNull();
  });
});
