import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmView } from '@gg/shared';
import type { ActResponse, JobCardWire, PreviewResponse, Snapshot } from './types';

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

import { buildAnchor, buildDraft, mapToolFor } from './build';
import { useGame } from './store';

const W = 40;
const view = {
  scale: { sideM: 100 },
  squares: { paddock: new Array(1040).fill(0) },
  fences: { h: new Array(27 * 40).fill(0), v: new Array(26 * 41).fill(0) },
  gates: [],
  water: { bore: 5, pipe: [], pipeDry: [], troughs: [], hubs: [] },
  paddocks: [{ id: 0, name: 'Paddock 1' }],
} as unknown as FarmView;

const snap = (): Snapshot =>
  ({ view, todo: [], paddocks: [{ id: 0 }], mobs: [] }) as unknown as Snapshot;

const card = (over: Partial<JobCardWire> = {}): JobCardWire => ({
  action: 'buildFence',
  outcome: 'done',
  workMin: 60,
  leftAfterMin: 300,
  usesRestOfDay: false,
  fitsToday: true,
  cost: 100,
  costToday: 100,
  perDay: null,
  notes: [],
  line: null,
  ...over,
});

const okPreview = (c: JobCardWire): PreviewResponse => ({ ok: true, card: c });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(2_000_000);
  for (const fn of Object.values(api)) fn.mockReset();
  useGame.setState({
    phase: 'ready',
    snapshot: snap(),
    busy: 0,
    notice: null,
    tab: 'farm',
    paddockId: null,
    mobId: null,
    summary: null,
    jobs: {},
    acts: {},
    move: null,
    build: null,
  });
});
afterEach(() => {
  useGame.getState().buildEnd();
  vi.useRealTimers();
});

const corner = (vx: number, vy: number) => ({ vx, vy });
const build = () => useGame.getState().build!;

describe('picking a tool', () => {
  it('picks a build tool, and Look goes back', () => {
    useGame.getState().selectTool('fence');
    expect(build().tool).toBe('fence');
    expect(mapToolFor(build())).toBe('corners');
    useGame.getState().selectTool('look');
    expect(useGame.getState().build).toBeNull();
    expect(mapToolFor(null)).toBe('look');
  });

  it('closes a paddock sheet when a tool is picked, and a tool when a paddock is opened', () => {
    useGame.setState({ paddockId: 0 });
    useGame.getState().selectTool('gate');
    expect(useGame.getState().paddockId).toBeNull();
    expect(mapToolFor(build())).toBe('edge');
    useGame.getState().openPaddock(0);
    expect(useGame.getState().build).toBeNull();
  });

  it('each tool tells the map what a drag and a tap mean', () => {
    const kinds = {
      fence: 'corners',
      pipe: 'squares',
      gate: 'edge',
      remove: 'edge',
      trough: 'square',
      portable: 'square',
      hub: 'corner',
    } as const;
    for (const [tool, map] of Object.entries(kinds)) {
      useGame.getState().selectTool(tool as keyof typeof kinds);
      expect(mapToolFor(build())).toBe(map);
    }
    useGame.getState().setHubOn('square');
    expect(mapToolFor(build())).toBe('square');
  });

  it('remembers the kind of fence chosen', () => {
    useGame.getState().selectTool('fence');
    useGame.getState().setFence('tape');
    useGame.getState().selectTool('look');
    useGame.getState().selectTool('fence');
    expect(build().fence).toBe('tape');
  });
});

describe('drawing a fence', () => {
  const draw = (to: [number, number][]) => {
    const g = useGame.getState();
    g.buildDrag({ phase: 'start', corner: corner(2, 3), square: -1 });
    for (const [x, y] of to) g.buildDrag({ phase: 'move', corner: corner(x, y), square: -1 });
  };

  it('follows the grid, and asks the server for the card when the drag ends', async () => {
    useGame.getState().selectTool('fence');
    useGame.getState().setFence('electric');
    api.preview.mockResolvedValue(okPreview(card()));
    draw([
      [3, 3],
      [4, 3],
      [5, 3],
    ]);
    expect(build().corners).toEqual([corner(2, 3), corner(3, 3), corner(4, 3), corner(5, 3)]);
    expect(build().phase).toBe('previewing');
    useGame.getState().buildDrag({ phase: 'end', corner: corner(5, 3), square: -1 });
    const last = api.preview.mock.calls.at(-1)![0];
    expect(last.action).toEqual({
      type: 'buildFence',
      fence: 'electric',
      edges: [3, 4, 5].map((k) => ({ line: 'h', index: 3 * W + k - 1 })),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(build().phase).toBe('confirm');
  });

  it('does not ask on every pointer move: a few requests a second at most', async () => {
    useGame.getState().selectTool('fence');
    api.preview.mockResolvedValue(okPreview(card()));
    const g = useGame.getState();
    g.buildDrag({ phase: 'start', corner: corner(0, 5), square: -1 });
    for (let x = 1; x <= 40; x++) {
      g.buildDrag({ phase: 'move', corner: corner(x, 5), square: -1 });
      await vi.advanceTimersByTimeAsync(50);
    }
    // 40 moves over two seconds.
    expect(api.preview.mock.calls.length).toBeLessThanOrEqual(8);
    expect(api.preview.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('draws the part that fits in the fence colour and the part that does not in red', async () => {
    useGame.getState().selectTool('fence');
    useGame.getState().setFence('permanent');
    const edges = [0, 1, 2, 3].map((k) => ({ line: 'h' as const, index: 3 * W + 2 + k }));
    api.preview.mockResolvedValue(
      okPreview(
        card({
          outcome: 'part',
          usesRestOfDay: true,
          line: {
            fits: { edges: edges.slice(0, 2), cells: [], metres: 200 },
            doesNotFit: { edges: edges.slice(2), cells: [], metres: 200 },
            words: ["You don't have enough time to do this today."],
          },
        }),
      ),
    );
    const g = useGame.getState();
    g.buildDrag({ phase: 'start', corner: corner(2, 3), square: -1 });
    g.buildDrag({ phase: 'end', corner: corner(6, 3), square: -1 });
    await vi.advanceTimersByTimeAsync(0);
    const d = buildDraft(build(), view)!;
    expect(d.kind).toBe('permanent');
    expect(d.segments.map((s) => s.style)).toEqual(['ok', 'ok', 'late', 'late']);
    expect(d.dots).toHaveLength(2);
    expect(buildAnchor(build())).toEqual({ gx: 6, gy: 3 });
  });

  it('a job that cannot start today is all red, and the Build button has nothing to build', async () => {
    useGame.getState().selectTool('fence');
    api.preview.mockResolvedValue({
      ok: false,
      reason: 'not-enough-daylight',
      message: "You don't have enough time to do this today. The first piece takes 2 h.",
    } satisfies PreviewResponse);
    const g = useGame.getState();
    g.buildDrag({ phase: 'start', corner: corner(2, 3), square: -1 });
    g.buildDrag({ phase: 'end', corner: corner(5, 3), square: -1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(build().phase).toBe('blocked');
    expect(build().message).toMatch(/enough time/);
    expect(buildDraft(build(), view)!.segments.every((s) => s.style === 'late')).toBe(true);
    await useGame.getState().buildConfirm();
    expect(api.act).not.toHaveBeenCalled();
  });

  it('only the newest answer is used', async () => {
    useGame.getState().selectTool('fence');
    const resolvers: ((r: PreviewResponse) => void)[] = [];
    api.preview.mockImplementation(() => new Promise((r) => resolvers.push(r)));
    const g = useGame.getState();
    g.buildDrag({ phase: 'start', corner: corner(0, 5), square: -1 });
    g.buildDrag({ phase: 'move', corner: corner(2, 5), square: -1 });
    await vi.advanceTimersByTimeAsync(400);
    g.buildDrag({ phase: 'end', corner: corner(4, 5), square: -1 });
    expect(resolvers).toHaveLength(2);
    resolvers[1]!(okPreview(card({ cost: 400, costToday: 400 })));
    resolvers[0]!(okPreview(card({ cost: 200, costToday: 200 })));
    await vi.advanceTimersByTimeAsync(0);
    expect(build().card?.cost).toBe(400);
  });

  it('dragging back over the line undoes it, and a second drag from its end extends it', () => {
    useGame.getState().selectTool('fence');
    api.preview.mockResolvedValue(okPreview(card()));
    draw([
      [3, 3],
      [4, 3],
      [5, 3],
    ]);
    useGame.getState().buildDrag({ phase: 'move', corner: corner(3, 3), square: -1 });
    expect(build().corners).toHaveLength(2);
    useGame.getState().buildDrag({ phase: 'start', corner: corner(3, 3), square: -1 });
    useGame.getState().buildDrag({ phase: 'move', corner: corner(3, 5), square: -1 });
    expect(build().corners).toEqual([corner(2, 3), corner(3, 3), corner(3, 4), corner(3, 5)]);
  });

  it('builds the whole line as drawn, shows the result, and the tool is back to Look', async () => {
    useGame.getState().selectTool('fence');
    api.preview.mockResolvedValue(okPreview(card()));
    draw([
      [3, 3],
      [4, 3],
    ]);
    useGame.getState().buildDrag({ phase: 'end', corner: corner(4, 3), square: -1 });
    await vi.advanceTimersByTimeAsync(0);
    api.act.mockResolvedValue({
      ok: true,
      message: 'Built 200 m of electric fence. It cost $720.',
      card: card(),
      snapshot: snap(),
    } satisfies ActResponse);
    await useGame.getState().buildConfirm();
    expect(api.act.mock.calls[0]![0].action.type).toBe('buildFence');
    expect(build().phase).toBe('done');
    expect(build().message).toMatch(/^Built 200 m/);
    expect(mapToolFor(build())).toBe('look');
    expect(buildDraft(build(), view)).toBeNull();
    expect(useGame.getState().busy).toBe(0);
    useGame.getState().buildOk();
    expect(useGame.getState().build).toBeNull();
  });

  it('a refusal shows the server reason right there and keeps the line to change', async () => {
    useGame.getState().selectTool('fence');
    api.preview.mockResolvedValue(okPreview(card()));
    draw([
      [3, 3],
      [4, 3],
    ]);
    useGame.getState().buildDrag({ phase: 'end', corner: corner(4, 3), square: -1 });
    await vi.advanceTimersByTimeAsync(0);
    api.act.mockResolvedValue({
      ok: false,
      reason: 'bank-limit',
      message: 'The bank will not lend that much.',
    } satisfies ActResponse);
    await useGame.getState().buildConfirm();
    expect(build().phase).toBe('blocked');
    expect(build().message).toBe('The bank will not lend that much.');
    expect(build().corners.length).toBeGreaterThan(1);
  });

  it('Cancel goes back to Look and drops what was waiting', async () => {
    useGame.getState().selectTool('fence');
    api.preview.mockResolvedValue(okPreview(card()));
    draw([
      [3, 3],
      [4, 3],
    ]);
    useGame.getState().buildEnd();
    expect(useGame.getState().build).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.preview.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('Next day ends the tool', async () => {
    useGame.getState().selectTool('fence');
    api.day.mockResolvedValue({ snapshot: snap(), summary: { daysRun: 1 } });
    await useGame.getState().nextDay();
    expect(useGame.getState().build).toBeNull();
  });
});

describe('laying pipe', () => {
  it('runs over squares, and the part that does not fit is red', async () => {
    useGame.getState().selectTool('pipe');
    api.preview.mockResolvedValue(
      okPreview(
        card({
          action: 'layPipe',
          outcome: 'part',
          line: {
            fits: { edges: [], cells: [6, 7], metres: 200 },
            doesNotFit: { edges: [], cells: [8], metres: 100 },
            words: ['x'],
          },
        }),
      ),
    );
    const g = useGame.getState();
    g.buildDrag({ phase: 'start', corner: null, square: 6 });
    g.buildDrag({ phase: 'end', corner: null, square: 8 });
    expect(build().cells).toEqual([6, 7, 8]);
    expect(api.preview.mock.calls.at(-1)![0].action).toEqual({ type: 'layPipe', cells: [6, 7, 8] });
    await vi.advanceTimersByTimeAsync(0);
    const d = buildDraft(build(), view)!;
    expect(d.squares.map((s) => s.style)).toEqual(['ok', 'ok', 'late']);
  });
});

describe('a tap in a tool', () => {
  it('a gate: tap a fence, see the card, confirm, and the tool is back to Look', async () => {
    useGame.getState().selectTool('gate');
    api.preview.mockResolvedValue(
      okPreview(card({ action: 'placeGate', cost: 450, costToday: 450 })),
    );
    await useGame.getState().buildTap({
      square: 10,
      edge: { line: 'h', index: 100 },
      edgeCode: 2,
      edgeDistPx: 5,
      corner: null,
      hub: false,
    });
    expect(api.preview.mock.calls[0]![0].action).toEqual({
      type: 'placeGate',
      edge: { line: 'h', index: 100 },
    });
    expect(build().phase).toBe('confirm');
    expect(build().picked?.confirm).toBe('Put in a gate');
    api.act.mockResolvedValue({
      ok: true,
      message: 'Put in a gate. It cost $450.',
      card: card(),
      snapshot: snap(),
    } satisfies ActResponse);
    await useGame.getState().buildConfirm();
    expect(build().phase).toBe('done');
    expect(mapToolFor(build())).toBe('look');
  });

  it('a tap that cannot work shows the server reason on the card', async () => {
    useGame.getState().selectTool('trough');
    api.preview.mockResolvedValue({
      ok: false,
      reason: 'trough-needs-water',
      message: 'A trough needs water. Put it on the bore or on pipe joined to the bore.',
    });
    await useGame.getState().buildTap({
      square: 500,
      edge: null,
      edgeCode: 0,
      edgeDistPx: Infinity,
      corner: null,
      hub: false,
    });
    expect(build().phase).toBe('blocked');
    expect(build().message).toMatch(/^A trough needs water/);
    useGame.getState().buildOk();
    expect(build().phase).toBe('pick');
  });

  it('a tap on nothing says what to tap', async () => {
    useGame.getState().selectTool('gate');
    await useGame.getState().buildTap({
      square: 3,
      edge: null,
      edgeCode: 0,
      edgeDistPx: Infinity,
      corner: null,
      hub: false,
    });
    expect(build().message).toMatch(/fence line/);
    expect(api.preview).not.toHaveBeenCalled();
  });

  it('a fallen fence: tapping it in Look offers to put it back up', async () => {
    api.preview.mockResolvedValue(okPreview(card({ action: 'fixFence', cost: 25, costToday: 25 })));
    await useGame.getState().startFix({ line: 'v', index: 90 });
    expect(api.preview.mock.calls[0]![0].action).toEqual({
      type: 'fixFence',
      edge: { line: 'v', index: 90 },
    });
    expect(build().picked?.title).toBe('Put this fence back up');
    expect(mapToolFor(build())).toBe('look');
    expect(buildDraft(build(), view)!.segments).toHaveLength(1);
  });
});
