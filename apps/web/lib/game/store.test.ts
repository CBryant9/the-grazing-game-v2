import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActResponse, DayResponse, PreviewResponse, Snapshot } from './types';

// The store talks to the server only through `api`. Fake it, to test what the store does with answers.
const api = vi.hoisted(() => ({
  setup: vi.fn(),
  farm: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  preview: vi.fn(),
  act: vi.fn(),
  day: vi.fn(),
  skip: vi.fn(),
}));
vi.mock('./api', () => {
  class ApiError extends Error {}
  return { api, ApiError };
});

import { ApiError } from './api';
import { useGame } from './store';

const snap = (over: Partial<Snapshot> = {}): Snapshot =>
  ({
    version: 1,
    farm: { name: 'Test', district: 'cw', setup: {} },
    day: 0,
    date: { year: 1997, month: 8, date: 1 },
    season: 'Average',
    totals: { head: 1, calves: 0 },
    clock: { evening: false, leftMin: 600 },
    view: { paddocks: [{ id: 0 }, { id: 1 }] },
    todo: [
      {
        key: 'calves-to-mark:1',
        text: 'Mob 1 has 3 calves to mark.',
        button: 'Mark calves',
        urgent: false,
      },
    ],
    paddocks: [],
    mobs: [],
    inbox: [],
    over: null,
    ...over,
  }) as unknown as Snapshot;

const summary = { kind: 'day', daysRun: 1, daysAsked: 1 } as DayResponse['summary'];

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  useGame.setState({
    phase: 'loading',
    snapshot: null,
    busy: 0,
    notice: null,
    tab: 'farm',
    paddockId: null,
    summary: null,
    jobs: {},
  });
});

describe('the game store', () => {
  it('goes to setup when there is no farm, and to the screen when there is one', async () => {
    api.farm.mockResolvedValueOnce({ snapshot: null });
    await useGame.getState().load();
    expect(useGame.getState().phase).toBe('setup');
    api.farm.mockResolvedValueOnce({ snapshot: snap() });
    await useGame.getState().load();
    expect(useGame.getState().phase).toBe('ready');
    expect(useGame.getState().snapshot?.farm.name).toBe('Test');
  });

  it('shows a plain message with a retry when the first load fails, never a blank screen', async () => {
    api.farm.mockRejectedValueOnce(new ApiError('The game could not be reached.'));
    await useGame.getState().load();
    const s = useGame.getState();
    expect(s.phase).toBe('failed');
    expect(s.notice?.message).toBe('The game could not be reached.');
    api.farm.mockResolvedValueOnce({ snapshot: snap() });
    s.notice?.retry?.();
    await vi.waitFor(() => expect(useGame.getState().phase).toBe('ready'));
  });

  it('replaces the snapshot after Next day and keeps the summary to show', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap() });
    api.day.mockResolvedValueOnce({ snapshot: snap({ day: 1 }), summary } satisfies DayResponse);
    await useGame.getState().nextDay();
    const s = useGame.getState();
    expect(s.snapshot?.day).toBe(1);
    expect(s.summary).toEqual(summary);
    expect(s.busy).toBe(0);
    s.dismissSummary();
    expect(useGame.getState().summary).toBeNull();
  });

  it('is busy while a request is out, and ignores a second tap', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap() });
    let release: (v: DayResponse) => void = () => {};
    api.day.mockReturnValueOnce(new Promise<DayResponse>((r) => (release = r)));
    const first = useGame.getState().nextDay();
    expect(useGame.getState().busy).toBe(1);
    await useGame.getState().nextDay();
    expect(api.day).toHaveBeenCalledTimes(1);
    release({ snapshot: snap({ day: 1 }), summary });
    await first;
    expect(useGame.getState().busy).toBe(0);
  });

  it('turns a failed request into a notice with a retry, and keeps the old snapshot', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap() });
    api.skip.mockRejectedValueOnce(
      new ApiError('Something went wrong on the server. Try again in a moment.'),
    );
    await useGame.getState().skip('week');
    const s = useGame.getState();
    expect(s.snapshot?.day).toBe(0);
    expect(s.notice?.message).toMatch(/Try again/);
    api.skip.mockResolvedValueOnce({ snapshot: snap({ day: 7 }), summary });
    s.notice?.retry?.();
    await vi.waitFor(() => expect(useGame.getState().snapshot?.day).toBe(7));
    expect(useGame.getState().notice).toBeNull();
  });

  it('runs a job: card first, result on the same row after it is done and gone from the list', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap() });
    const card = { action: 'markCalves', workMin: 30, cost: 72 } as never;
    api.preview.mockResolvedValueOnce({ ok: true, card } satisfies PreviewResponse);
    await useGame.getState().startJob('calves-to-mark:1');
    expect(useGame.getState().jobs['calves-to-mark:1']).toMatchObject({ phase: 'confirm', card });
    expect(api.act).not.toHaveBeenCalled();

    api.act.mockResolvedValueOnce({
      ok: true,
      message: '9 calves marked in Mob 1.',
      card,
      snapshot: snap({ todo: [] }),
    } satisfies ActResponse);
    await useGame.getState().confirmJob('calves-to-mark:1');
    const s = useGame.getState();
    expect(s.snapshot?.todo).toEqual([]);
    expect(s.jobs['calves-to-mark:1']).toMatchObject({
      phase: 'done',
      message: '9 calves marked in Mob 1.',
      text: 'Mob 1 has 3 calves to mark.',
    });
    s.dismissJob('calves-to-mark:1');
    expect(useGame.getState().jobs).toEqual({});
  });

  it('shows a refusal with its reason on the row, and does not touch the snapshot', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap() });
    api.preview.mockResolvedValueOnce({
      ok: true,
      card: { action: 'markCalves' } as never,
    });
    await useGame.getState().startJob('calves-to-mark:1');
    api.act.mockResolvedValueOnce({
      ok: false,
      reason: 'not-enough-daylight',
      message: "You don't have enough time to do this today.",
    });
    await useGame.getState().confirmJob('calves-to-mark:1');
    expect(useGame.getState().jobs['calves-to-mark:1']).toMatchObject({
      phase: 'refused',
      message: "You don't have enough time to do this today.",
    });
    expect(useGame.getState().snapshot?.day).toBe(0);
  });

  it('shows a refused preview on the row too', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap() });
    api.preview.mockResolvedValueOnce({
      ok: false,
      reason: 'no-daylight',
      message: 'Today is done.',
    });
    await useGame.getState().startJob('calves-to-mark:1');
    expect(useGame.getState().jobs['calves-to-mark:1']).toMatchObject({
      phase: 'refused',
      message: 'Today is done.',
    });
  });

  it('opens and closes a paddock, and closes one that has left the farm', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap() });
    useGame.getState().openPaddock(1);
    expect(useGame.getState().paddockId).toBe(1);
    api.day.mockResolvedValueOnce({
      snapshot: snap({ view: { paddocks: [{ id: 0 }] } as never }),
      summary,
    });
    await useGame.getState().nextDay();
    expect(useGame.getState().paddockId).toBeNull();
  });
});
