import { describe, expect, it } from 'vitest';
import { FARM_GRID_H, FARM_GRID_W, VIEW_FENCE } from '@gg/shared';
import type { EdgeWire, SetupChoices, Snapshot } from '../../lib/game/types';
import { MAX_LINE_PIECES, parseBuildAction } from './build';
import { GameError, GameServer, parseAction } from './game';
import { MemoryFarmStore } from './store';

const A = 'a'.repeat(32);
const W = FARM_GRID_W;

const choices = (over: Partial<SetupChoices> = {}): SetupChoices => ({
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'scratch',
  difficulty: 'easy',
  name: 'Build Test',
  ...over,
});

const server = (): GameServer => new GameServer({ store: new MemoryFarmStore(), seed: () => 11 });

const h = (vy: number, x: number): EdgeWire => ({ line: 'h', index: vy * W + x });
const v = (y: number, vx: number): EdgeWire => ({ line: 'v', index: y * (W + 1) + vx });
const row = (vy: number, from: number, to: number): EdgeWire[] => {
  const out: EdgeWire[] = [];
  for (let x = from; x < to; x++) out.push(h(vy, x));
  return out;
};

describe('checking a build request', () => {
  it('accepts well formed fence, gate, pipe, trough, hub and portable actions', () => {
    expect(parseAction({ type: 'buildFence', edges: [h(3, 4)], fence: 'tape' })).toEqual({
      type: 'buildFence',
      edges: [{ line: 'h', index: 3 * W + 4 }],
      fence: 'tape',
    });
    expect(parseAction({ type: 'setGate', edge: v(2, 5), open: true })).toMatchObject({
      type: 'setGate',
      open: true,
    });
    expect(parseAction({ type: 'layPipe', cells: [1, 2, 3] })).toEqual({
      type: 'layPipe',
      cells: [1, 2, 3],
    });
    expect(parseAction({ type: 'placeTrough', cell: 5 })).toEqual({ type: 'placeTrough', cell: 5 });
    expect(parseAction({ type: 'placeFenceHub', vertex: 100 })).toEqual({
      type: 'placeFenceHub',
      vertex: 100,
    });
    expect(parseAction({ type: 'movePortable', port: 1, cell: 9 })).toEqual({
      type: 'movePortable',
      port: 1,
      cell: 9,
    });
    expect(parseAction({ type: 'removePortable', port: 1 })).toEqual({
      type: 'removePortable',
      port: 1,
    });
  });

  it('refuses anything out of range, fractional, the wrong shape or too long', () => {
    const tooMany = Array.from({ length: MAX_LINE_PIECES + 1 }, (_, i) => h(1, i % W));
    const bad: unknown[] = [
      { type: 'buildFence', edges: [], fence: 'tape' },
      { type: 'buildFence', edges: [h(3, 4)], fence: 'steel' },
      { type: 'buildFence', edges: [h(3, 4)] },
      { type: 'buildFence', edges: tooMany, fence: 'tape' },
      { type: 'buildFence', edges: [{ line: 'h', index: (FARM_GRID_H + 1) * W }], fence: 'tape' },
      { type: 'buildFence', edges: [{ line: 'v', index: FARM_GRID_H * (W + 1) }], fence: 'tape' },
      { type: 'buildFence', edges: [{ line: 'x', index: 1 }], fence: 'tape' },
      { type: 'buildFence', edges: [{ line: 'h', index: 1.5 }], fence: 'tape' },
      { type: 'buildFence', edges: [{ line: 'h', index: -1 }], fence: 'tape' },
      { type: 'buildFence', edges: 'h1', fence: 'tape' },
      { type: 'setGate', edge: h(1, 1), open: 'yes' },
      { type: 'placeGate', edge: null },
      { type: 'layPipe', cells: [] },
      { type: 'layPipe', cells: [1, 5000] },
      { type: 'layPipe', cells: 'abc' },
      { type: 'placeTrough', cell: 1040 },
      { type: 'placeTrough', cell: -1 },
      { type: 'placePortable', cell: '3' },
      { type: 'moveTrough', from: 1, to: 2000 },
      { type: 'placeFenceHub', vertex: 41 * 27 },
      { type: 'movePortable', port: 1.2, cell: 3 },
      { type: 'removePortable' },
    ];
    for (const b of bad)
      expect(
        parseBuildAction(b as Record<string, unknown>),
        JSON.stringify(b).slice(0, 80),
      ).toBeNull();
  });

  it('a line at the longest allowed still fits in a request body', () => {
    const edges = Array.from({ length: MAX_LINE_PIECES }, (_, i) => v(i % FARM_GRID_H, i % 41));
    const body = JSON.stringify({ action: { type: 'buildFence', edges, fence: 'permanent' } });
    expect(body.length).toBeLessThan(32 * 1024);
  });
});

/** Fence codes on the view along row line `vy`, for columns from to to. */
const codes = (s: Snapshot, vy: number, from: number, to: number): number[] =>
  s.view.fences.h.slice(vy * W + from, vy * W + to);

describe('the build tools through the server', () => {
  it('a short tape line: the card has its pieces, building puts it on the map, and says what it cost', async () => {
    const game = server();
    const s0 = await game.create(A, choices());
    const action = { type: 'buildFence', edges: row(5, 10, 14), fence: 'tape' } as const;
    const p = await game.preview(A, { action });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.card.line?.fits.edges).toHaveLength(4);
    expect(Math.abs(p.card.line!.fits.metres - 4 * s0.view.scale.sideM)).toBeLessThan(1.5);
    expect(p.card.line?.doesNotFit.edges).toEqual([]);
    expect(p.card.line?.words).toEqual([]);
    expect(p.card.outcome).toBe('done');
    const done = await game.act(A, { action });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.message).toMatch(/^Built \d[\d,]* m of tape\./);
    expect(codes(done.snapshot, 5, 10, 14)).toEqual([4, 4, 4, 4].map(() => VIEW_FENCE.tape));
    expect(done.snapshot.totals.cash).toBeLessThan(s0.totals.cash);
    // Looking is free: the preview changed nothing.
    expect(s0.view.fences.h.slice(5 * W + 10, 5 * W + 14).every((c) => c === 0)).toBe(true);
  });

  it('a permanent fence longer than the day: the part that fits is built, the rest is red and not remembered', async () => {
    const game = server();
    await game.create(A, choices());
    // A zig-zag of row lines, longer than one day's light.
    const edges: EdgeWire[] = [];
    for (let vy = 2; vy <= 22 && edges.length + 40 <= MAX_LINE_PIECES; vy += 2) {
      edges.push(...row(vy, 0, W));
    }
    const action = { type: 'buildFence', edges, fence: 'permanent' } as const;
    const p = await game.preview(A, { action });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const line = p.card.line!;
    expect(p.card.outcome).toBe('part');
    expect(p.card.usesRestOfDay).toBe(true);
    expect(line.doesNotFit.edges.length).toBeGreaterThan(0);
    expect(line.fits.edges.length).toBeGreaterThan(0);
    expect(line.fits.edges.length + line.doesNotFit.edges.length).toBe(edges.length);
    // The two messages: the owner's sentence, then the metres that fit and the metres that do not.
    expect(line.words[0]).toBe("You don't have enough time to do this today.");
    expect(line.words[1]).toContain(`${line.fits.metres.toLocaleString('en-AU')} m fits today`);
    expect(line.words[1]).toContain(`${line.doesNotFit.metres.toLocaleString('en-AU')} m does not`);
    // The pieces that fit are the first ones drawn.
    expect(line.fits.edges).toEqual(edges.slice(0, line.fits.edges.length));

    const done = await game.act(A, { action });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.card).toEqual(p.card);
    const built = (code: number): number =>
      done.snapshot.view.fences.h.filter((c) => c === code).length;
    // Only the part that fits is built (the boundary rows are not counted).
    expect(built(VIEW_FENCE.permanent)).toBe(line.fits.edges.length);
    for (const e of line.doesNotFit.edges) {
      expect(done.snapshot.view.fences.h[e.index]).toBe(VIEW_FENCE.none);
    }
    expect(done.message).toContain(`Built ${line.fits.metres.toLocaleString('en-AU')} m`);
    // The day is used up: the same line cannot be started again today.
    const again = await game.preview(A, { action });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.message).toMatch(/enough time/);
  }, 60_000);

  it('a refusal gives the server reason, and changes nothing', async () => {
    const game = server();
    const s0 = await game.create(A, choices());
    // Nothing new to build along a line that is already the boundary.
    const r = await game.act(A, {
      action: { type: 'buildFence', edges: row(0, 0, 4), fence: 'tape' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/^[A-Z].*\.$/);
    await expect(
      game.act(A, { action: { type: 'buildFence', edges: [], fence: 'tape' } as never }),
    ).rejects.toThrow(GameError);
    expect((await game.snapshot(A))!.totals.cash).toBe(s0.totals.cash);
    // A trough away from water says why.
    const far = await game.preview(A, { action: { type: 'placeTrough', cell: 1039 } });
    expect(far).toMatchObject({
      ok: false,
      message: 'A trough needs water. Put it on the bore or on pipe joined to the bore.',
    });
  });

  it('a gate: the card says which paddocks it joins, and opening and shutting it works', async () => {
    const game = server();
    await game.create(A, choices());
    // Cut the farm in two with a line of tape, then put a gate in it.
    const cut = await game.act(A, {
      action: { type: 'buildFence', edges: row(13, 0, W), fence: 'tape' },
    });
    expect(cut.ok).toBe(true);
    const gateAt = h(13, 20);
    const place = await game.preview(A, { action: { type: 'placeGate', edge: gateAt } });
    expect(place.ok).toBe(true);
    if (place.ok) expect(place.card.notes.join(' ')).toMatch(/joins Paddock \d and Paddock \d/);
    expect((await game.act(A, { action: { type: 'placeGate', edge: gateAt } })).ok).toBe(true);
    const open = await game.preview(A, {
      action: { type: 'setGate', edge: gateAt, open: true },
    });
    expect(open.ok).toBe(true);
    if (open.ok) {
      const note = open.card.notes.join(' ');
      expect(note).toMatch(/Opening it joins Paddock \d and Paddock \d into one grazing area/);
      expect(note).toContain('will join if both hold stock');
    }
    const opened = await game.act(A, { action: { type: 'setGate', edge: gateAt, open: true } });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.message).toBe('The gate is open.');
    expect(opened.snapshot.view.gates.find((g) => g.index === gateAt.index)?.open).toBe(true);
    // Shutting it keeps them apart.
    const shut = await game.preview(A, { action: { type: 'setGate', edge: gateAt, open: false } });
    if (shut.ok) expect(shut.card.notes.join(' ')).toMatch(/Shutting it keeps/);
  });

  it('pipe from the bore, a trough on it, a portable trough placed and sold back, a fence taken down', async () => {
    const game = server();
    const s0 = await game.create(A, choices());
    const bore = s0.view.water.bore;
    // Pipe along the row, away from the nearer edge of the farm.
    const dir = bore % W < W / 2 ? 1 : -1;
    const cells = [1, 2, 3, 4].map((k) => bore + dir * k);
    const pipe = await game.preview(A, { action: { type: 'layPipe', cells } });
    expect(pipe.ok).toBe(true);
    if (!pipe.ok) return;
    expect(pipe.card.line?.fits.cells).toEqual(cells);
    expect(pipe.card.line?.doesNotFit.cells).toEqual([]);
    const laid = await game.act(A, { action: { type: 'layPipe', cells } });
    expect(laid.ok).toBe(true);
    if (!laid.ok) return;
    expect(laid.message).toMatch(/^Laid [\d,]+ m of pipe\./);
    expect(laid.snapshot.view.water.pipe).toEqual(expect.arrayContaining(cells));

    const end = cells[3]!;
    const trough = await game.act(A, { action: { type: 'placeTrough', cell: end } });
    expect(trough.ok).toBe(true);
    if (!trough.ok) return;
    expect(
      trough.snapshot.view.water.troughs.some((t) => t.cell === end && t.kind === 'fixed'),
    ).toBe(true);

    const place = await game.act(A, { action: { type: 'placePortable', cell: cells[1]! } });
    expect(place.ok).toBe(true);
    if (!place.ok) return;
    const port = place.snapshot.view.water.troughs.find((t) => t.kind === 'portable')!;
    expect(port).toBeDefined();
    const sold = await game.act(A, { action: { type: 'removePortable', port: port.id } });
    expect(sold.ok).toBe(true);
    if (sold.ok) {
      expect(sold.message).toMatch(/^Sold the portable trough back for \$/);
      expect(sold.snapshot.view.water.troughs.some((t) => t.kind === 'portable')).toBe(false);
    }

    // Build a short tape line, then take it down: tape is rolled up.
    await game.act(A, { action: { type: 'buildFence', edges: row(8, 5, 9), fence: 'tape' } });
    const up = await game.act(A, { action: { type: 'rollUpTape', edge: h(8, 6) } });
    expect(up.ok).toBe(true);
    if (up.ok) {
      expect(up.message).toMatch(/^Rolled up [\d,]+ m of tape\./);
      expect(codes(up.snapshot, 8, 5, 9).every((c) => c === 0)).toBe(true);
    }
  });
});
