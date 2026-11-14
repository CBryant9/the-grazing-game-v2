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
  record: vi.fn(),
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
    mobId: null,
    summary: null,
    yearEnd: null,
    morePage: 'menu',
    record: null,
    jobs: {},
    acts: {},
    move: null,
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
    api.day.mockResolvedValueOnce({
      ok: true,
      snapshot: snap({ day: 1 }),
      summary,
      yearEnd: null,
      yearsClosed: 0,
    } satisfies DayResponse);
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
    release({ ok: true, snapshot: snap({ day: 1 }), summary, yearEnd: null, yearsClosed: 0 });
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
    api.skip.mockResolvedValueOnce({ ok: true, snapshot: snap({ day: 7 }), summary });
    s.notice?.retry?.();
    await vi.waitFor(() => expect(useGame.getState().snapshot?.day).toBe(7));
    expect(useGame.getState().notice).toBeNull();
  });

  it('runs a job: card first, result on the same row after it is done and gone from the list', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap() });
    const card = { action: 'markCalves', workMin: 30, cost: 72 } as never;
    api.preview.mockResolvedValueOnce({ ok: true, card, version: 'v1' } satisfies PreviewResponse);
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
      version: 'v1',
    });
    await useGame.getState().startJob('calves-to-mark:1');
    api.act.mockResolvedValueOnce({
      ok: false,
      reason: 'not-enough-daylight',
      message: "You don't have enough time to do this today.",
      snapshot: snap(),
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
      version: 'v1',
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
      ok: true,
      snapshot: snap({ view: { paddocks: [{ id: 0 }] } as never }),
      summary,
    });
    await useGame.getState().nextDay();
    expect(useGame.getState().paddockId).toBeNull();
  });

  describe('the mob card and moving cattle', () => {
    const farm = (over: Partial<Snapshot> = {}): Snapshot =>
      snap({
        paddocks: [
          { id: 0, name: 'Paddock 1', cell: 10, mobs: [1] },
          { id: 1, name: 'Paddock 2', cell: 20, mobs: [] },
        ] as never,
        mobs: [
          {
            id: 1,
            name: 'Steers A',
            head: 10,
            calves: 0,
            classes: [
              {
                id: 'weanerSteer',
                label: 'Weaner steer',
                head: 10,
                weightKg: 250,
                cs: 3,
                calf: false,
              },
            ],
          },
        ] as never,
        ...over,
      });
    const card = { action: 'moveMob', workMin: 30, cost: 0, notes: [] } as never;

    it('opens a mob card, and closes one that has left the farm', async () => {
      useGame.setState({ phase: 'ready', snapshot: farm() });
      useGame.getState().openMob(1);
      expect(useGame.getState().mobId).toBe(1);
      api.day.mockResolvedValueOnce({ ok: true, snapshot: farm({ mobs: [] }), summary });
      await useGame.getState().nextDay();
      expect(useGame.getState().mobId).toBeNull();
    });

    it('runs a husbandry job on the card: job card, then confirm, then the result there', async () => {
      useGame.setState({ phase: 'ready', snapshot: farm() });
      const action = { type: 'markCalves', mob: 1 } as const;
      api.preview.mockResolvedValueOnce({
        ok: true,
        card,
        version: 'v1',
      } satisfies PreviewResponse);
      await useGame.getState().startAct('1:mark', 'Mark calves', action);
      expect(api.preview).toHaveBeenCalledWith({ action });
      expect(useGame.getState().acts['1:mark']).toMatchObject({ phase: 'confirm', card });
      expect(api.act).not.toHaveBeenCalled();
      api.act.mockResolvedValueOnce({
        ok: true,
        message: '4 calves marked in Steers A.',
        card,
        snapshot: farm(),
      } satisfies ActResponse);
      await useGame.getState().confirmAct('1:mark');
      expect(useGame.getState().acts['1:mark']).toMatchObject({
        phase: 'done',
        message: '4 calves marked in Steers A.',
      });
      useGame.getState().dismissAct('1:mark');
      expect(useGame.getState().acts).toEqual({});
    });

    it('shows a refusal right there, with its reason', async () => {
      useGame.setState({ phase: 'ready', snapshot: farm() });
      api.preview.mockResolvedValueOnce({
        ok: false,
        reason: 'nothing-to-mark',
        message: 'There are no calves to mark in this mob.',
        version: 'v1',
      });
      await useGame.getState().startAct('1:mark', 'Mark calves', { type: 'markCalves', mob: 1 });
      expect(useGame.getState().acts['1:mark']).toMatchObject({
        phase: 'refused',
        message: 'There are no calves to mark in this mob.',
      });
    });

    it('moves a mob: pick the mob, pick the paddock, the card, confirm, and the tool ends', async () => {
      useGame.setState({ phase: 'ready', snapshot: farm() });
      await useGame.getState().startMove({ mobId: 1 });
      expect(useGame.getState().move).toMatchObject({ mobId: 1, target: null, phase: 'pick' });
      expect(api.preview).not.toHaveBeenCalled();

      api.preview.mockResolvedValueOnce({
        ok: true,
        card,
        version: 'v1',
      } satisfies PreviewResponse);
      await useGame.getState().moveTargetPicked(1);
      expect(api.preview).toHaveBeenCalledWith({
        action: { type: 'moveMob', mob: 1, cell: 20 },
      });
      expect(useGame.getState().move).toMatchObject({ phase: 'confirm', target: 1, card });

      api.act.mockResolvedValueOnce({
        ok: true,
        message: 'Steers A moved (10 head).',
        card,
        snapshot: farm(),
      } satisfies ActResponse);
      await useGame.getState().moveConfirm();
      expect(useGame.getState().move).toMatchObject({
        phase: 'done',
        message: 'Steers A moved (10 head).',
      });
      useGame.getState().moveEnd();
      expect(useGame.getState().move).toBeNull();
    });

    it('starts from a paddock: pick the mob, and the card follows', async () => {
      useGame.setState({ phase: 'ready', snapshot: farm() });
      await useGame.getState().startMove({ paddockId: 1 });
      expect(useGame.getState().move).toMatchObject({ mobId: null, target: 1 });
      api.preview.mockResolvedValueOnce({
        ok: true,
        card,
        version: 'v1',
      } satisfies PreviewResponse);
      await useGame.getState().moveMobPicked(1);
      expect(useGame.getState().move).toMatchObject({ mobId: 1, target: 1, phase: 'confirm' });
    });

    it('moves part of a mob by class and number, and asks for a number first', async () => {
      useGame.setState({ phase: 'ready', snapshot: farm() });
      await useGame.getState().startMove({ mobId: 1 });
      useGame.getState().movePart(true);
      await useGame.getState().moveTargetPicked(1);
      expect(api.preview).not.toHaveBeenCalled();
      expect(useGame.getState().move?.message).toBe('Pick how many head to move first.');
      useGame.getState().moveQty('weanerSteer', 4);
      api.preview.mockResolvedValueOnce({
        ok: true,
        card,
        version: 'v1',
      } satisfies PreviewResponse);
      await useGame.getState().moveTargetPicked(1);
      expect(api.preview).toHaveBeenCalledWith({
        action: {
          type: 'moveCattle',
          picks: [{ mob: 1, cls: 'weanerSteer', qty: 4 }],
          cell: 20,
        },
      });
    });

    it('shows a refused move with its reason, and lets the player pick another paddock', async () => {
      useGame.setState({ phase: 'ready', snapshot: farm() });
      await useGame.getState().startMove({ mobId: 1 });
      api.preview.mockResolvedValueOnce({
        ok: false,
        reason: 'no-daylight',
        message: 'Today is done.',
        version: 'v1',
      });
      await useGame.getState().moveTargetPicked(1);
      expect(useGame.getState().move).toMatchObject({
        phase: 'refused',
        message: 'Today is done.',
      });
      useGame.getState().moveBack();
      expect(useGame.getState().move).toMatchObject({ phase: 'pick', target: null, mobId: 1 });
    });

    it('ends the move tool when the day moves on', async () => {
      useGame.setState({ phase: 'ready', snapshot: farm() });
      await useGame.getState().startMove({ mobId: 1 });
      api.day.mockResolvedValueOnce({ ok: true, snapshot: farm(), summary });
      await useGame.getState().nextDay();
      expect(useGame.getState().move).toBeNull();
    });
  });
  describe('the card and the job agree', () => {
    const cardFor = (price: number) =>
      ({ action: 'setSupplement', workMin: 0, cost: 0, perDay: price, notes: [] }) as never;
    const farmSnap = (over: Partial<Snapshot> = {}) =>
      snap({ farmVersion: 'v1', mobs: [{ id: 1, name: 'Mob 1' }] as never, ...over });

    it('switching A then B quickly never shows A while Confirm sends B: the old answer is dropped', async () => {
      useGame.setState({ phase: 'ready', snapshot: farmSnap() });
      let answerA: (r: PreviewResponse) => void = () => {};
      api.preview.mockReturnValueOnce(new Promise<PreviewResponse>((r) => (answerA = r)));
      const a = useGame.getState().startAct('1:supp', 'Switch on Lick', {
        type: 'setSupplement',
        mob: 1,
        supp: 'lick',
      });
      api.preview.mockResolvedValueOnce({ ok: true, card: cardFor(9), version: 'v1' });
      await useGame.getState().startAct('1:supp', 'Switch on Hay', {
        type: 'setSupplement',
        mob: 1,
        supp: 'hay',
      });
      // A's answer comes last. It is dropped.
      answerA({ ok: true, card: cardFor(2), version: 'v1' });
      await a;
      const job = useGame.getState().acts['1:supp']!;
      expect(job.card).toEqual(cardFor(9));
      api.act.mockResolvedValueOnce({
        ok: true,
        message: 'Hay on.',
        card: null,
        snapshot: farmSnap(),
      });
      await useGame.getState().confirmAct('1:supp');
      expect(api.act).toHaveBeenCalledWith({
        action: { type: 'setSupplement', mob: 1, supp: 'hay' },
        version: 'v1',
        requestId: expect.any(String),
      });
    });

    it('Confirm sends the version the card was made on and a one-use id; a double click sends once', async () => {
      useGame.setState({ phase: 'ready', snapshot: farmSnap() });
      api.preview.mockResolvedValueOnce({ ok: true, card: cardFor(1), version: 'v7' });
      await useGame.getState().startJob('calves-to-mark:1');
      let release: (r: ActResponse) => void = () => {};
      api.act.mockReturnValueOnce(new Promise<ActResponse>((r) => (release = r)));
      const one = useGame.getState().confirmJob('calves-to-mark:1');
      const two = useGame.getState().confirmJob('calves-to-mark:1');
      release({
        ok: true,
        message: 'Done.',
        card: null,
        snapshot: farmSnap({ farmVersion: 'v8' }),
      });
      await Promise.all([one, two]);
      expect(api.act).toHaveBeenCalledTimes(1);
      expect(api.act.mock.calls[0]![0]).toMatchObject({ todo: 'calves-to-mark:1', version: 'v7' });
      expect(api.act.mock.calls[0]![0].requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
      expect(useGame.getState().snapshot?.farmVersion).toBe('v8');
    });

    it('a refused act shows the farm the server sent; a failed one fetches the farm again', async () => {
      useGame.setState({ phase: 'ready', snapshot: farmSnap() });
      api.preview.mockResolvedValue({ ok: true, card: cardFor(1), version: 'v1' });
      await useGame.getState().startJob('calves-to-mark:1');
      api.act.mockResolvedValueOnce({
        ok: false,
        reason: 'stale',
        message: 'The farm has changed since this was shown. Here is the latest.',
        snapshot: farmSnap({ farmVersion: 'v2', day: 3 }),
      });
      await useGame.getState().confirmJob('calves-to-mark:1');
      expect(useGame.getState().snapshot?.day).toBe(3);
      expect(useGame.getState().jobs['calves-to-mark:1']).toMatchObject({
        phase: 'refused',
        message: 'The farm has changed since this was shown. Here is the latest.',
      });
      // The reply is lost: the farm is fetched again.
      useGame.setState({ snapshot: farmSnap({ day: 3, todo: snap().todo }) });
      await useGame.getState().startJob('calves-to-mark:1');
      api.act.mockRejectedValueOnce(new ApiError('Offline.'));
      api.farm.mockResolvedValueOnce({ snapshot: farmSnap({ farmVersion: 'v3', day: 4 }) });
      await useGame.getState().confirmJob('calves-to-mark:1');
      await vi.waitFor(() => expect(useGame.getState().snapshot?.day).toBe(4));
      expect(api.farm).toHaveBeenCalled();
    });

    it('Next day sends the version on screen; a stale answer shows the latest farm and the plain message', async () => {
      useGame.setState({ phase: 'ready', snapshot: farmSnap({ farmVersion: 'v5' }) });
      api.day.mockResolvedValueOnce({
        ok: false,
        reason: 'stale',
        message: 'The farm has changed since this was shown. Here is the latest.',
        snapshot: farmSnap({ farmVersion: 'v6', day: 2 }),
      });
      await useGame.getState().nextDay();
      expect(api.day).toHaveBeenCalledWith('v5');
      expect(useGame.getState().snapshot?.day).toBe(2);
      expect(useGame.getState().notice?.message).toMatch(/has changed/);
      expect(useGame.getState().summary).toBeNull();
    });

    it('a farm that can not be opened shows its message, not the setup', async () => {
      api.farm.mockResolvedValueOnce({ snapshot: null, broken: 'Your farm could not be opened.' });
      await useGame.getState().load();
      expect(useGame.getState().phase).toBe('broken');
      expect(useGame.getState().notice?.message).toBe('Your farm could not be opened.');
    });
  });
});

describe('the year end card and the record panels', () => {
  const year = {
    n: 3,
    title: 'Year 3',
    total: 1200,
    parts: [],
    facts: [],
    money: [],
  };
  const rec = (diary: { day: number }[] = [], earlier: number | null = null) => ({
    soFar: year,
    years: [],
    diary: diary.map((d) => ({ ...d, date: { year: 1997, month: 8, date: 1 }, lines: ['x'] })),
    earlier,
  });

  it('keeps the year that closed beside the summary, and closing it leaves the summary', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap() });
    api.skip.mockResolvedValueOnce({
      ok: true,
      snapshot: snap({ day: 365 }),
      summary,
      yearEnd: year,
      yearsClosed: 2,
    } satisfies DayResponse);
    await useGame.getState().skip('year');
    let s = useGame.getState();
    expect(s.yearEnd).toEqual({ view: year, closed: 2 });
    expect(s.summary).toEqual(summary);
    s.dismissYearEnd();
    s = useGame.getState();
    expect(s.yearEnd).toBeNull();
    expect(s.summary).toEqual(summary);
  });

  it('fetches only when Scores or Diary is opened, and again after a day while one is open', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap(), tab: 'more' });
    api.record.mockResolvedValue(rec([{ day: 1 }]));
    api.day.mockResolvedValue({
      ok: true,
      snapshot: snap({ day: 1 }),
      summary,
      yearEnd: null,
      yearsClosed: 0,
    } satisfies DayResponse);
    await useGame.getState().nextDay();
    expect(api.record).not.toHaveBeenCalled();
    useGame.getState().openMore('diary');
    await vi.waitFor(() => expect(useGame.getState().record?.status).toBe('ready'));
    expect(api.record).toHaveBeenCalledTimes(1);
    await useGame.getState().nextDay();
    await vi.waitFor(() => expect(api.record).toHaveBeenCalledTimes(2));
    // Back at the menu, a day fetches nothing.
    useGame.getState().openMore('menu');
    await useGame.getState().nextDay();
    expect(api.record).toHaveBeenCalledTimes(2);
  });

  it('adds older diary days to the end, and stops when there are none', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap(), tab: 'more' });
    api.record.mockResolvedValueOnce(rec([{ day: 9 }, { day: 8 }], 8));
    useGame.getState().openMore('diary');
    await vi.waitFor(() => expect(useGame.getState().record?.status).toBe('ready'));
    api.record.mockResolvedValueOnce(rec([{ day: 7 }], null));
    await useGame.getState().loadEarlier();
    expect(api.record).toHaveBeenLastCalledWith(8);
    const r = useGame.getState().record!;
    expect(r.diary.map((d) => d.day)).toEqual([9, 8, 7]);
    expect(r.earlier).toBeNull();
    await useGame.getState().loadEarlier();
    expect(api.record).toHaveBeenCalledTimes(2);
  });

  it('shows a plain message with a retry when the record can not be fetched', async () => {
    useGame.setState({ phase: 'ready', snapshot: snap(), tab: 'more' });
    api.record.mockRejectedValueOnce(new ApiError('The game could not be reached.'));
    useGame.getState().openMore('scores');
    await vi.waitFor(() => expect(useGame.getState().record?.status).toBe('failed'));
    expect(useGame.getState().record?.message).toBe('The game could not be reached.');
    api.record.mockResolvedValueOnce(rec());
    await useGame.getState().loadRecord();
    expect(useGame.getState().record?.status).toBe('ready');
  });
});
