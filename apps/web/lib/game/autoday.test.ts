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
    tab: 'farm',
    morePage: 'menu',
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

  it('while the day is out: a confirm waits, Next day and skips are busy, and "New day coming" shows', async () => {
    let done!: (r: DayResponse) => void;
    api.day.mockImplementation(() => new Promise((r) => (done = r)));
    const card = { action: 'moveMob', notes: [] } as never;
    useGame.setState({
      jobs: {
        wean: {
          key: 'wean',
          text: 'Calves to wean',
          button: 'Wean',
          phase: 'confirm',
          card,
          shown: { req: { todo: 'wean' }, version: 'v4', requestId: 'r1' },
        },
      },
    });
    const day = useGame.getState().autoDay();
    expect(useGame.getState().dayComing).toBe(true);
    // Confirm in that window sends nothing: it can not race the day's request.
    await useGame.getState().confirmJob('wean');
    expect(api.act).not.toHaveBeenCalled();
    expect(useGame.getState().jobs.wean?.phase).toBe('confirm');
    done(reply(5, summary()));
    expect(await day).toBe('next');
    expect(useGame.getState().dayComing).toBe(false);
  });

  it('a job card opened while the day is out is kept, and asked again against the new day', async () => {
    let done!: (r: DayResponse) => void;
    api.day.mockImplementation(() => new Promise((r) => (done = r)));
    const day = useGame.getState().autoDay();
    // The player opens a job card while the request is out. Its card comes from the old day.
    api.preview.mockResolvedValueOnce({ ok: true, card: { notes: ['old'] }, version: 'v4' });
    const later = { ...snap(5), todo: [{ key: 'wean', text: 'Calves to wean', button: 'Wean' }] };
    useGame.setState({
      snapshot: { ...snap(4), todo: later.todo } as unknown as Snapshot,
    });
    await useGame.getState().startJob('wean');
    expect(useGame.getState().jobs.wean?.shown?.version).toBe('v4');
    // The new day comes in: the card is not lost, and is asked for again on the new day.
    api.preview.mockResolvedValueOnce({ ok: true, card: { notes: ['new'] }, version: 'v5' });
    done({ ...reply(5, summary()), snapshot: later as unknown as Snapshot });
    expect(await day).toBe('next');
    await vi.waitFor(() => expect(useGame.getState().jobs.wean?.shown?.version).toBe('v5'));
    expect(useGame.getState().jobs.wean?.phase).toBe('confirm');
    expect(api.preview).toHaveBeenCalledTimes(2);
  });

  it('a build tool, a move and a plan opened while the day is out stay open', async () => {
    let done!: (r: DayResponse) => void;
    api.day.mockImplementation(() => new Promise((r) => (done = r)));
    const day = useGame.getState().autoDay();
    useGame.setState({
      build: { tool: 'fence', phase: 'pick', corners: [], cells: [] } as never,
      move: { mobId: 1, target: null, part: false, qtys: {}, phase: 'pick' },
      plan: { draft: {} as never, phase: 'edit' },
      sow: { paddockId: 3 } as never,
    });
    done(reply(5, summary()));
    await day;
    const s = useGame.getState();
    expect(s.build?.tool).toBe('fence');
    expect(s.move?.mobId).toBe(1);
    expect(s.plan?.phase).toBe('edit');
    expect(s.sow).not.toBeNull();
    // Nothing had a card yet, so nothing was asked again.
    expect(api.preview).not.toHaveBeenCalled();
  });

  it('the Scores are not fetched again every day, only on a day that stops', async () => {
    const record = vi.fn(async () => undefined);
    useGame.setState({ tab: 'more', morePage: 'scores', loadRecord: record });
    api.day.mockResolvedValue(reply(5, summary()));
    await useGame.getState().autoDay();
    expect(record).not.toHaveBeenCalled();
    api.day.mockResolvedValue(reply(6, summary({ stops: ['Mob 1 has no water.'] })));
    await useGame.getState().autoDay();
    expect(record).toHaveBeenCalledTimes(1);
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
