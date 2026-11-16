import { describe, expect, it } from 'vitest';
import type { FarmView } from '@gg/shared';
import { choiceJob, moveHubJob, moveJob, tapOutcome, type TapInfo } from './taps';

const view = {
  squares: { paddock: new Array(1040).fill(0) },
  fences: { h: new Array(27 * 40).fill(0), v: new Array(26 * 41).fill(0) },
  gates: [
    { line: 'h', index: 200, open: false, kind: 'swing' },
    { line: 'h', index: 201, open: true, kind: 'swing' },
  ],
  water: {
    bore: 5,
    pipe: [],
    pipeDry: [],
    troughs: [
      { kind: 'fixed', cell: 50, id: 0, levelPct: 100 },
      { kind: 'portable', cell: 60, id: 3, levelPct: 40 },
    ],
    hubs: [],
    squareHubs: [],
  },
} as unknown as FarmView;

const tap = (over: Partial<TapInfo> = {}): TapInfo => ({
  square: 100,
  edge: null,
  edgeCode: 0,
  edgeDistPx: Infinity,
  corner: null,
  hub: false,
  squareHub: false,
  ...over,
});
const edge = { line: 'h' as const, index: 300 };

describe('what a tap picks', () => {
  it('Gate: a fence gets a gate, a shut gate is opened, an open gate is shut', () => {
    const put = tapOutcome('gate', 'corner', view, tap({ edge, edgeCode: 2, edgeDistPx: 4 }));
    expect(put).toMatchObject({ kind: 'job', job: { action: { type: 'placeGate', edge } } });
    const gate = (index: number) =>
      tapOutcome(
        'gate',
        'corner',
        view,
        tap({ edge: { line: 'h', index }, edgeCode: 7, edgeDistPx: 3 }),
      );
    expect(gate(200)).toMatchObject({
      job: { action: { type: 'setGate', open: true }, confirm: 'Open it' },
    });
    expect(gate(201)).toMatchObject({
      job: { action: { type: 'setGate', open: false }, confirm: 'Shut it' },
    });
  });

  it('Gate: a tap on no fence says what to tap', () => {
    expect(tapOutcome('gate', 'corner', view, tap())).toEqual({
      kind: 'none',
      message: 'Tap a fence line to put a gate in it.',
    });
  });

  it('Trough: an empty square gets a trough, a trough offers move or take out', () => {
    expect(tapOutcome('trough', 'corner', view, tap({ square: 100 }))).toMatchObject({
      job: { action: { type: 'placeTrough', cell: 100 } },
    });
    expect(tapOutcome('trough', 'corner', view, tap({ square: 50 }))).toEqual({
      kind: 'choice',
      choice: { kind: 'trough', cell: 50, port: 0 },
    });
  });

  it('Portable trough: place, or choose refill, move or sell back', () => {
    expect(tapOutcome('portable', 'corner', view, tap({ square: 100 }))).toMatchObject({
      job: { action: { type: 'placePortable', cell: 100 } },
    });
    expect(tapOutcome('portable', 'corner', view, tap({ square: 60 }))).toEqual({
      kind: 'choice',
      choice: { kind: 'portable', cell: 60, port: 3 },
    });
    const c = { kind: 'portable' as const, cell: 60, port: 3 };
    expect(choiceJob(c, 'refill').action).toEqual({ type: 'refillPortable', port: 3 });
    expect(choiceJob(c, 'remove').action).toEqual({ type: 'removePortable', port: 3 });
    expect(moveJob(c, 70).action).toEqual({ type: 'movePortable', port: 3, cell: 70 });
    const t = { kind: 'trough' as const, cell: 50, port: 0 };
    expect(moveJob(t, 71).action).toEqual({ type: 'moveTrough', from: 50, to: 71 });
    expect(choiceJob(t, 'remove').action).toEqual({ type: 'removeTrough', cell: 50 });
  });

  it('Water hub: a corner or a square, as the bar says', () => {
    const corner = { vx: 4, vy: 3 };
    expect(tapOutcome('hub', 'corner', view, tap({ corner }))).toMatchObject({
      job: { action: { type: 'placeFenceHub', vertex: 3 * 41 + 4 } },
    });
    expect(tapOutcome('hub', 'corner', view, tap())).toMatchObject({ kind: 'none' });
    expect(tapOutcome('hub', 'square', view, tap({ square: 88 }))).toMatchObject({
      job: { action: { type: 'placeSquareHub', cell: 88 } },
    });
    // Tapping a hub that is there offers to move it or take it out, as with a trough (Claudia, 14 Nov 2026).
    expect(tapOutcome('hub', 'corner', view, tap({ corner, hub: true }))).toMatchObject({
      kind: 'choice',
      choice: { kind: 'hub', corner },
    });
    expect(tapOutcome('hub', 'corner', view, tap({ square: 88, squareHub: true }))).toMatchObject({
      kind: 'choice',
      choice: { kind: 'squareHub', cell: 88 },
    });
  });

  it('a hub can be moved and taken out, both kinds, with the engine actions', () => {
    const corner = { vx: 4, vy: 3 };
    const onCorner = { kind: 'hub' as const, cell: 124, port: 0, corner };
    const onSquare = { kind: 'squareHub' as const, cell: 88, port: 0, corner: null };
    expect(choiceJob(onCorner, 'remove').action).toEqual({ type: 'removeHub', vertex: 3 * 41 + 4 });
    expect(choiceJob(onSquare, 'remove').action).toEqual({ type: 'removeSquareHub', cell: 88 });
    expect(moveHubJob(onCorner, { vx: 6, vy: 3 })!.action).toEqual({
      type: 'moveHub',
      from: 3 * 41 + 4,
      to: 3 * 41 + 6,
    });
    expect(moveJob(onSquare, 90).action).toEqual({ type: 'moveSquareHub', from: 88, to: 90 });
    // In Remove, a hub on a square comes out as a hub, not as a plain trough.
    expect(
      tapOutcome('remove', 'corner', view, tap({ square: 50, squareHub: true })),
    ).toMatchObject({ job: { action: { type: 'removeSquareHub', cell: 50 }, style: 'remove' } });
    // In the trough tool, a hub on a square opens the hub's choices.
    expect(
      tapOutcome('trough', 'corner', view, tap({ square: 50, squareHub: true })),
    ).toMatchObject({ kind: 'choice', choice: { kind: 'squareHub' } });
  });

  it('Remove never offers to take down the boundary', () => {
    const out = tapOutcome('remove', 'corner', view, tap({ edge, edgeCode: 1, edgeDistPx: 3 }));
    expect(out.kind).toBe('none');
    expect(JSON.stringify(out)).not.toMatch(/Take down the boundary/);
  });

  it('Remove: a fence is taken down, tape is rolled up, a gate is taken out', () => {
    expect(
      tapOutcome('remove', 'corner', view, tap({ edge, edgeCode: 2, edgeDistPx: 3 })),
    ).toMatchObject({ job: { action: { type: 'removeFence', edges: [edge] }, style: 'remove' } });
    expect(
      tapOutcome('remove', 'corner', view, tap({ edge, edgeCode: 4, edgeDistPx: 3 })),
    ).toMatchObject({ job: { action: { type: 'rollUpTape', edge }, confirm: 'Roll it up' } });
    expect(
      tapOutcome('remove', 'corner', view, tap({ edge, edgeCode: 7, edgeDistPx: 3 })),
    ).toMatchObject({ job: { action: { type: 'removeGate', edge } } });
  });

  it('Remove: a segment right under the finger beats a trough, a trough beats a segment further off', () => {
    const near = tapOutcome(
      'remove',
      'corner',
      view,
      tap({ square: 50, edge, edgeCode: 2, edgeDistPx: 6 }),
    );
    expect(near).toMatchObject({ job: { action: { type: 'removeFence' } } });
    const far = tapOutcome(
      'remove',
      'corner',
      view,
      tap({ square: 50, edge, edgeCode: 2, edgeDistPx: 18 }),
    );
    expect(far).toMatchObject({ job: { action: { type: 'removeTrough', cell: 50 } } });
    expect(tapOutcome('remove', 'corner', view, tap({ square: 60 }))).toMatchObject({
      job: { action: { type: 'removePortable', port: 3 } },
    });
  });

  it('Remove: a hub on a corner, and a tap on nothing', () => {
    expect(
      tapOutcome('remove', 'corner', view, tap({ corner: { vx: 2, vy: 2 }, hub: true })),
    ).toMatchObject({ job: { action: { type: 'removeHub', vertex: 2 * 41 + 2 } } });
    expect(tapOutcome('remove', 'corner', view, tap())).toMatchObject({ kind: 'none' });
  });

  it('every sentence the taps write is plain', () => {
    const jobs = [
      tapOutcome('gate', 'corner', view, tap({ edge, edgeCode: 2, edgeDistPx: 4 })),
      tapOutcome('trough', 'corner', view, tap()),
      tapOutcome('hub', 'corner', view, tap({ corner: { vx: 1, vy: 1 } })),
      tapOutcome('remove', 'corner', view, tap({ edge, edgeCode: 4, edgeDistPx: 2 })),
      tapOutcome('gate', 'corner', view, tap()),
    ];
    for (const o of jobs) {
      const text =
        o.kind === 'job' ? `${o.job.title} ${o.job.confirm}` : o.kind === 'none' ? o.message : '';
      expect(text).not.toMatch(/—|\bshould\b/);
    }
  });
});
