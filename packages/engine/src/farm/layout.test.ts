import { describe, expect, it, vi } from 'vitest';
import {
  bareLayout,
  edgesWith,
  hRun,
  randomEdge,
  randomLayout,
  vRun,
} from '../../test-support/layouts';
import { seededRandom } from '../../test-support/mvp';
import {
  expectSameLayout,
  expectSameSurvey,
  fromMvpEdge,
  layoutFromMvp,
  loadMvpFarm,
  mvpNewGame,
  putLayout,
  toMvpEdge,
} from '../../test-support/mvpFarm';
import { GRID_H, GRID_N, GRID_W } from '../grid';
import { rngStream, type Rng } from '../rng';
import {
  buildFence,
  canTrough,
  fenceLine,
  fixFence,
  knockDownTape,
  layPipe,
  movePortable,
  moveTrough,
  pipeLine,
  placeFenceHub,
  placeGate,
  placePortable,
  placeSquareHub,
  placeTrough,
  refillPortable,
  removeFence,
  removeGate,
  removeHub,
  removePortable,
  removeTrough,
  setGate,
  surveyLayout,
  tapeRun,
  toggleGate,
  touchesFence,
  vertexOnFence,
  type FarmLayout,
  type Outcome,
} from './layout';
import { EDGE, getEdge, hEdge, vEdge, vIdx, type EdgeRef, type FenceType } from './topology';
import { PORTABLE_CAPACITY_L, pipeReach, vertexId } from './water';

/*
 * Changes to the layout against the MVP's own buildFence, removeFence,
 * tapeRun, placeGate, toggleGate, fixFence, layPipe, placeTrough,
 * moveTrough, placeHub, placeFenceHub, placePort and refillPort.
 *
 * The same job is done in the MVP and in the engine, starting from the same
 * layout. Afterwards every edge, pipe, trough, hub and portable trough must
 * be the same, and so must every paddock, grazing area and distance to
 * water. Where the MVP does nothing, the engine must refuse and change
 * nothing. The MVP is given all the money it wants, so it never refuses a
 * job for lack of cash.
 */

// The MVP runs slowly in its sandbox, more so when test files run side by side.
vi.setConfig({ testTimeout: 180000 });

const loaded = loadMvpFarm();
const { mvp } = loaded;
mvpNewGame(loaded, { region: 'cw', year: 2022, month: 3, ha: 2000 }, seededRandom(11));

const frozen = (l: FarmLayout): string =>
  JSON.stringify([
    Array.from(l.fences.hE),
    Array.from(l.fences.vE),
    Array.from(l.water.pipe),
    l.water,
    l.tapeOnRoll,
  ]);

/** The last line the MVP wrote to its diary. */
const lastLog = (): string => mvp.S.log[0]?.msg ?? '';

/** The MVP's pixel position for a grid corner, placed so its snapping lands on that corner. */
const px = (vx: number, vy: number): { x: number; y: number } => ({ x: vx * 10, y: vy * 10 - 4 });

interface Tally {
  done: Record<string, number>;
  refused: Record<string, number>;
}

/** Do one random job in both, and compare. Returns the engine's new layout. */
function randomJob(layout: FarmLayout, rng: Rng, tally: Tally, where: string): FarmLayout {
  const S = mvp.S;
  const f = layout.fences;
  const w = layout.water;
  const before = frozen(layout);
  let result: Outcome<object> | null = null;
  let mvpChanged: boolean | null = null;
  const pickEdge = (codes: readonly number[]): EdgeRef | null => {
    const list = edgesWith(f, codes);
    return list.length ? rng.pick(list) : null;
  };
  const randomCell = (): number => rng.int(0, GRID_N - 1);
  const reachedCell = (): number => {
    const reach = pipeReach(w);
    const list: number[] = [];
    reach.forEach((v, i) => {
      if (v) list.push(i);
    });
    return rng.pick(list);
  };
  const job = rng.pick([
    'fence',
    'fence',
    'fence',
    'remove-run',
    'roll-up',
    'remove-one',
    'gate',
    'gate',
    'toggle',
    'toggle',
    'fix',
    'knock-down',
    'pipe',
    'pipe',
    'trough',
    'trough',
    'move-trough',
    'remove-trough',
    'fence-hub',
    'square-hub',
    'remove-hub',
    'portable',
    'move-portable',
    'refill-portable',
    'remove-portable',
  ] as const);

  if (job === 'fence' || job === 'remove-run') {
    const a = { vx: rng.int(0, GRID_W), vy: rng.int(0, GRID_H) };
    const b = rng.chance(0.5)
      ? { vx: rng.int(0, GRID_W), vy: a.vy + rng.int(-2, 2) }
      : { vx: a.vx + rng.int(-2, 2), vy: rng.int(0, GRID_H) };
    b.vx = Math.min(GRID_W, Math.max(0, b.vx));
    b.vy = Math.min(GRID_H, Math.max(0, b.vy));
    const line = fenceLine(f, a, b)!;
    const pa = px(a.vx, a.vy);
    const pb = px(b.vx, b.vy);
    const theirs = mvp.lineFrom({ x0: pa.x, y0: pa.y, x1: pb.x, y1: pb.y });
    // The same run of edges, the same squared-up ends, and the same "on a fence" answers.
    expect(line.edges, `run ${where}`).toEqual(theirs.edges.map(fromMvpEdge));
    expect([line.a.vx, line.a.vy, line.b.vx, line.b.vy]).toEqual(
      [theirs.ax, theirs.ay, theirs.bx, theirs.by].map((v) => v + 0),
    );
    expect([line.aOn, line.bOn], `ends ${where}`).toEqual([theirs.aOn, theirs.bOn]);
    if (job === 'fence') {
      const type = rng.pick([EDGE.permanent, EDGE.electric, EDGE.tape] as const);
      const q = mvp.fenceQuote(theirs, type);
      mvp.buildFence(theirs, type);
      const r = buildFence(layout, line.edges, type);
      result = r;
      mvpChanged = q.n > 0;
      if (r.ok) {
        expect(r.segments, `segments ${where}`).toBe(q.n);
        expect(r.metres).toBe(q.n * layout.scale.sideM);
        expect(r.tapeFromRoll, `tape off the roll ${where}`).toBe(type === 3 ? q.use : 0);
        expect(r.tapeNew, `new tape ${where}`).toBe(type === 3 ? q.buyN : 0);
        expect(r.tapeFromRoll + r.tapeNew).toBe(type === 3 ? r.segments : 0);
        const replaced = Object.values(r.replaced).reduce((s, v) => s + v, 0);
        expect(replaced).toBeLessThanOrEqual(r.segments);
        // The MVP says when a fence closes off a paddock, and when an end is loose.
        const closed = r.paddocksAfter > r.paddocksBefore;
        expect(lastLog().startsWith('That closes off a new paddock'), `closes ${where}`).toBe(
          closed,
        );
        expect(lastLog().startsWith("That fence doesn't close off a paddock yet")).toBe(
          !closed && (!line.aOn || !line.bOn),
        );
      } else expect(r.reason).toBe('nothing-to-build');
    } else {
      const tapeBefore = S.tape || 0;
      mvp.removeFence(theirs);
      const r = removeFence(layout, line.edges);
      result = r;
      if (r.ok) {
        expect(r.tapeToRoll).toBe((S.tape || 0) - tapeBefore);
        expect(r.removed.tape + r.removed.tapeDown).toBe(r.tapeToRoll);
        expect(Object.values(r.removed).reduce((s, v) => s + v, 0)).toBe(r.segments);
      } else expect(r.reason).toBe('nothing-to-remove');
    }
  } else if (job === 'roll-up') {
    const e = pickEdge([EDGE.tape, EDGE.tapeDown]) ?? randomEdge(rng);
    const run = tapeRun(f, e);
    expect(run, `tape run ${where}`).toEqual(mvp.tapeRun(toMvpEdge(e)).map(fromMvpEdge));
    mvp.removeFence({ edges: run.map(toMvpEdge) });
    result = removeFence(layout, run);
    if (result.ok) {
      const r = result as Extract<ReturnType<typeof removeFence>, { ok: true }>;
      const isTape = getEdge(f, e) === EDGE.tape || getEdge(f, e) === EDGE.tapeDown;
      if (isTape) expect(r.tapeToRoll).toBe(run.length);
    }
  } else if (job === 'remove-one') {
    const e = rng.chance(0.8)
      ? (pickEdge([1, 2, 3, 4, 5, 6, 7]) ?? randomEdge(rng))
      : randomEdge(rng);
    const code = getEdge(f, e);
    if (code >= 1 && code <= 7) mvp.removeFence({ edges: [toMvpEdge(e)] });
    result =
      code === EDGE.gateShut || code === EDGE.gateOpen
        ? removeGate(layout, e)
        : removeFence(layout, [e]);
    if (code === EDGE.gateShut || code === EDGE.gateOpen) {
      // Pulling down a gate is the same job as pulling down that one edge.
      const viaFence = removeFence(layout, [e]);
      expect(viaFence.ok && result.ok && frozen(viaFence.layout) === frozen(result.layout)).toBe(
        true,
      );
    } else expect(removeGate(layout, e).ok).toBe(false);
  } else if (job === 'gate') {
    const e = rng.chance(0.75)
      ? (pickEdge([1, 2, 3, 4, 5, 6, 7, 9]) ?? randomEdge(rng))
      : randomEdge(rng);
    const code = getEdge(f, e);
    mvp.placeGate(toMvpEdge(e));
    // The MVP's gate tool also opens or shuts a gate that is there and
    // fixes a knocked-down fence. In the engine those are their own jobs.
    const r = placeGate(layout, e);
    if (r.ok) {
      expect([1, 2, 3]).toContain(code);
      expect(r.replaced).toBe(code);
      result = r;
    } else if (r.reason === 'gate-already-there') {
      expect([4, 5]).toContain(code);
      result = toggleGate(layout, e);
    } else if (r.reason === 'fence-is-down') {
      expect([6, 7]).toContain(code);
      result = fixFence(layout, e);
    } else {
      expect(r.reason).toBe(code === 9 ? 'gate-on-boundary' : 'gate-needs-fence');
      expect(code === 9 || code === 0).toBe(true);
      result = r;
    }
  } else if (job === 'toggle') {
    const e = pickEdge([EDGE.gateShut, EDGE.gateOpen]);
    if (e) {
      const wasShut = getEdge(f, e) === EDGE.gateShut;
      mvp.toggleGate(toMvpEdge(e));
      const r = rng.chance(0.5) ? toggleGate(layout, e) : setGate(layout, e, wasShut);
      expect(r.ok && r.open).toBe(wasShut);
      result = r;
    } else {
      const any = randomEdge(rng);
      result = toggleGate(layout, any);
      expect(result.ok).toBe(false);
      expect(setGate(layout, any, true).ok).toBe(false);
    }
  } else if (job === 'fix') {
    const e = pickEdge([EDGE.electricDown, EDGE.tapeDown]);
    if (e) {
      const code = getEdge(f, e);
      mvp.fixFence(toMvpEdge(e));
      const r = fixFence(layout, e);
      expect(r.ok && r.type).toBe(code === EDGE.electricDown ? EDGE.electric : EDGE.tape);
      result = r;
    } else {
      result = fixFence(layout, randomEdge(rng));
      expect(result.ok).toBe(false);
    }
  } else if (job === 'knock-down') {
    const e = pickEdge([EDGE.tape]);
    if (e) {
      // What the MVP does when a hungry mob pushes through tape.
      mvp.setE(toMvpEdge(e), 7);
      mvp.recompute(false);
      result = knockDownTape(layout, e);
      expect(result.ok).toBe(true);
    } else {
      const other = pickEdge([1, 2, 4, 5, 6, 7, 9]) ?? randomEdge(rng);
      result = knockDownTape(layout, other);
      expect(result.ok).toBe(false);
    }
  } else if (job === 'pipe') {
    const from = rng.chance(0.6) ? reachedCell() : randomCell();
    const to = randomCell();
    const cells = pipeLine(from, to);
    const centre = (i: number): { x: number; y: number } => ({
      x: (i % GRID_W) * 10 + 5,
      y: ((i / GRID_W) | 0) * 10 + 5,
    });
    const theirs = mvp.pipeCells({
      x0: centre(from).x,
      y0: centre(from).y,
      x1: centre(to).x,
      y1: centre(to).y,
    });
    expect(cells, `pipe run ${where}`).toEqual(Array.from(theirs));
    const fresh = cells.filter((i) => !w.pipe[i] && i !== w.bore).length;
    mvp.layPipe(theirs);
    const r = layPipe(layout, cells);
    result = r;
    if (r.ok) {
      expect(r.segments).toBe(fresh);
      expect(r.metres).toBe(fresh * layout.scale.sideM);
      expect(lastLog().includes("isn't connected to water yet"), `connected ${where}`).toBe(
        !r.connected,
      );
    } else {
      expect(fresh).toBe(0);
      expect(r.reason).toBe('pipe-already-there');
    }
  } else if (job === 'trough') {
    const i = rng.chance(0.7) ? reachedCell() : randomCell();
    expect(canTrough(w, i)).toBe(mvp.canTrough(i));
    mvp.placeTrough(i);
    const r = placeTrough(layout, i);
    result = r;
    if (!r.ok) {
      expect(r.reason).toBe(w.troughs.includes(i) ? 'trough-already-there' : 'trough-needs-water');
    }
  } else if (job === 'move-trough') {
    if (w.troughs.length) {
      const from = rng.pick(w.troughs);
      const to = rng.chance(0.7) ? reachedCell() : randomCell();
      const moved = mvp.moveTrough(from, to);
      const r = moveTrough(layout, from, to);
      expect(r.ok, `move trough ${where}`).toBe(moved);
      result = r;
    } else {
      result = moveTrough(layout, randomCell(), reachedCell());
      expect(result.ok).toBe(false);
    }
  } else if (job === 'remove-trough') {
    const i = w.troughs.length && rng.chance(0.8) ? rng.pick(w.troughs) : randomCell();
    if (S.troughs.includes(i)) {
      S.troughs = S.troughs.filter((x) => x !== i);
      mvp.recompute();
    }
    result = removeTrough(layout, i);
  } else if (job === 'fence-hub') {
    const fenced = edgesWith(f, [1, 2, 3, 4, 5, 6, 7]);
    let v = vertexId(rng.int(0, GRID_W), rng.int(0, GRID_H));
    if (fenced.length && rng.chance(0.8)) {
      // A corner at one end of a fence segment, often near water.
      const e = rng.pick(fenced);
      v =
        e.line === 'h'
          ? vertexId(e.index % GRID_W, Math.floor(e.index / GRID_W))
          : vertexId(e.index % (GRID_W + 1), Math.floor(e.index / (GRID_W + 1)));
    }
    expect(vertexOnFence(f, v)).toBe(mvp.vertexOnFence(v));
    const r = placeFenceHub(layout, v);
    result = r;
    if (mvp.vertexOnFence(v)) {
      mvp.placeFenceHub(v);
      if (r.ok) {
        const names = [...new Set(r.paddocks.map((p) => mvp.PADS[p]!.name))];
        expect(lastLog()).toContain(`It waters ${names.join(', ')}.`);
      }
    } else if (!w.hubs.includes(v)) {
      expect(!r.ok && r.reason).toBe('hub-needs-fence');
    }
  } else if (job === 'square-hub') {
    const i = rng.chance(0.8) ? reachedCell() : randomCell();
    const infra = S.infra;
    mvp.placeHub(i);
    const r = placeSquareHub(layout, i);
    result = r;
    if (r.ok) {
      // The MVP charged a trough if one went in, and a gate for each side.
      expect(S.infra - infra).toBe((r.troughAdded ? 1500 : 0) + r.gates * 450);
    } else expect(S.infra).toBe(infra);
  } else if (job === 'remove-hub') {
    const v = w.hubs.length && rng.chance(0.8) ? rng.pick(w.hubs) : vertexId(3, 3);
    if (S.hubs.includes(v)) {
      S.hubs = S.hubs.filter((x) => x !== v);
      mvp.recompute();
    }
    result = removeHub(layout, v);
  } else if (job === 'portable') {
    const i = randomCell();
    mvp.U.portMove = null;
    mvp.placePort(i);
    const r = placePortable(layout, i);
    expect(r.ok && r.port.level).toBe(PORTABLE_CAPACITY_L);
    result = r;
  } else if (job === 'move-portable') {
    if (w.ports.length) {
      const pt = rng.pick(w.ports);
      const to = randomCell();
      mvp.U.portMove = pt.id;
      mvp.placePort(to);
      result = movePortable(layout, pt.id, to);
      expect(result.ok).toBe(true);
    } else {
      result = movePortable(layout, 12345, randomCell());
      expect(result.ok).toBe(false);
    }
  } else if (job === 'refill-portable') {
    if (w.ports.length) {
      const pt = rng.pick(w.ports);
      mvp.refillPort(S.ports.find((p) => p.id === pt.id)!);
      const r = refillPortable(layout, pt.id);
      expect(r.ok && r.litres).toBe(PORTABLE_CAPACITY_L - pt.level);
      expect(r.ok && r.wasEmpty).toBe(pt.level <= 0);
      result = r;
    } else {
      result = refillPortable(layout, 12345);
      expect(result.ok).toBe(false);
    }
  } else {
    if (w.ports.length) {
      const pt = rng.pick(w.ports);
      S.ports = S.ports.filter((p) => p.id !== pt.id);
      mvp.recompute();
      result = removePortable(layout, pt.id);
      expect(result.ok).toBe(true);
    } else {
      result = removePortable(layout, 12345);
      expect(result.ok).toBe(false);
    }
  }

  // The layout passed in is never changed, whatever happened.
  expect(frozen(layout), `input unchanged by ${job} ${where}`).toBe(before);
  if (mvpChanged !== null) expect(result.ok, `${job} done ${where}`).toBe(mvpChanged);
  const next = result.ok ? result.layout : layout;
  if (result.ok) tally.done[job] = (tally.done[job] ?? 0) + 1;
  else {
    tally.refused[job] = (tally.refused[job] ?? 0) + 1;
    expect(result.message.length).toBeGreaterThan(10);
  }
  expectSameLayout(next, mvp, `after ${job} ${where}`);
  const survey = surveyLayout(next);
  expectSameSurvey(survey, mvp, `after ${job} ${where}`);
  if (result.ok && 'topology' in result) {
    // The report carries the same paddocks and areas as a fresh survey.
    expect(result.topology).toEqual(survey.topology);
  }
  return next;
}

describe('layout jobs, against the MVP', () => {
  it('40 farms, 150 random jobs each, compared after every job', { timeout: 240000 }, () => {
    const tally: Tally = { done: {}, refused: {} };
    for (let farm = 0; farm < 40; farm++) {
      const rng = rngStream(farm, 'layout-jobs');
      let layout =
        farm % 4 === 0
          ? bareLayout([200, 2000, 12000][farm % 3]!)
          : randomLayout(rng, [200, 2000, 12000][farm % 3]!, [0.2, 0.5, 0.9][farm % 3]!);
      putLayout(mvp, layout);
      mvp.S.nid = layout.water.nextPortId;
      layout = layoutFromMvp(mvp);
      for (let k = 0; k < 150; k++) layout = randomJob(layout, rng, tally, `farm ${farm} job ${k}`);
    }
    // Every job was both done and refused many times.
    for (const job of [
      'fence',
      'remove-run',
      'roll-up',
      'remove-one',
      'gate',
      'toggle',
      'fix',
      'knock-down',
      'pipe',
      'trough',
      'move-trough',
      'remove-trough',
      'fence-hub',
      'square-hub',
      'remove-hub',
      'portable',
      'move-portable',
      'refill-portable',
      'remove-portable',
    ]) {
      expect(tally.done[job] ?? 0, `${job} done`).toBeGreaterThan(20);
    }
    for (const job of [
      'fence',
      'remove-run',
      'gate',
      'pipe',
      'trough',
      'move-trough',
      'remove-trough',
      'fence-hub',
      'square-hub',
    ]) {
      expect(tally.refused[job] ?? 0, `${job} refused`).toBeGreaterThan(5);
    }
  });
});

describe('the rules, one at a time', () => {
  const withFence = (): FarmLayout => {
    const l = bareLayout(2000);
    vRun(l.fences, 20, 0, GRID_H, EDGE.permanent);
    return l;
  };
  const ok = <T>(r: Outcome<T>): Extract<Outcome<T>, { ok: true }> => {
    if (!r.ok) throw new Error(`refused: ${r.reason}`);
    return r;
  };

  it('gates only go on fences', () => {
    const l = withFence();
    const r = placeGate(l, vEdge(5, 10));
    expect(r).toMatchObject({ ok: false, reason: 'gate-needs-fence' });
    expect(!r.ok && r.message).toBe('Gates only go on fences.');
    expect(placeGate(l, vEdge(5, 0))).toMatchObject({ ok: false, reason: 'gate-on-boundary' });
    const g = ok(placeGate(l, vEdge(5, 20)));
    expect(g.layout.fences.vE[vIdx(5, 20)]).toBe(EDGE.gateShut);
    expect(g.replaced).toBe(EDGE.permanent);
    expect(placeGate(g.layout, vEdge(5, 20))).toMatchObject({
      ok: false,
      reason: 'gate-already-there',
    });
  });

  it('a gate starts shut, opening it joins the grazing, shutting it splits it again', () => {
    const g = ok(placeGate(withFence(), vEdge(5, 20)));
    expect(g.areas).toEqual({ splits: [], joins: [] });
    const open = ok(toggleGate(g.layout, vEdge(5, 20)));
    expect(open.open).toBe(true);
    expect(open.areas.joins).toEqual([{ from: [0, 1], into: 0 }]);
    expect(open.topology.paddocks).toHaveLength(2);
    expect(open.topology.areas).toHaveLength(1);
    const shut = ok(toggleGate(open.layout, vEdge(5, 20)));
    expect(shut.open).toBe(false);
    // The former area is split into two. The caller shares the mob out.
    expect(shut.areas.splits).toEqual([{ from: 0, into: [0, 1] }]);
  });

  it('a fence built through a grazing area reports the areas it was split into', () => {
    const l = bareLayout(2000);
    const line = fenceLine(l.fences, { vx: 12, vy: 0 }, { vx: 12, vy: GRID_H })!;
    expect(line.edges).toHaveLength(GRID_H);
    const r = ok(buildFence(l, line.edges, EDGE.electric));
    expect(r.segments).toBe(GRID_H);
    expect(r.paddocksBefore).toBe(1);
    expect(r.paddocksAfter).toBe(2);
    expect(r.areas.splits).toEqual([{ from: 0, into: [0, 1] }]);
    // A fence that stops short of the boundary splits nothing.
    const short = fenceLine(l.fences, { vx: 12, vy: 0 }, { vx: 12, vy: GRID_H - 1 })!;
    expect(short.bOn).toBe(false);
    const s = ok(buildFence(l, short.edges, EDGE.permanent));
    expect(s.paddocksAfter).toBe(1);
    expect(s.areas.splits).toEqual([]);
  });

  it('a run goes along the row or down the column, never both', () => {
    const f = bareLayout().fences;
    const across = fenceLine(f, { vx: 3, vy: 4 }, { vx: 9, vy: 6 })!;
    expect(across.edges).toEqual([3, 4, 5, 6, 7, 8].map((x) => hEdge(4, x)));
    expect(across.b).toEqual({ vx: 9, vy: 4 });
    const down = fenceLine(f, { vx: 3, vy: 4 }, { vx: 5, vy: 9 })!;
    expect(down.edges).toEqual([4, 5, 6, 7, 8].map((y) => vEdge(y, 3)));
    expect(down.b).toEqual({ vx: 3, vy: 9 });
    // A tie goes along the row. The run is the same from either end.
    expect(fenceLine(f, { vx: 3, vy: 4 }, { vx: 5, vy: 6 })!.edges).toEqual([
      hEdge(4, 3),
      hEdge(4, 4),
    ]);
    expect(fenceLine(f, { vx: 9, vy: 4 }, { vx: 3, vy: 4 })!.edges).toEqual(across.edges);
    expect(fenceLine(f, { vx: -1, vy: 4 }, { vx: 3, vy: 4 })).toBeNull();
    expect(fenceLine(f, { vx: 1, vy: 4 }, { vx: 3, vy: GRID_H + 1 })).toBeNull();
    expect(touchesFence(f, 0, 5)).toBe(true);
    expect(touchesFence(f, 5, 5)).toBe(false);
  });

  it('building leaves gates and the boundary alone, and counts only new fence', () => {
    const l = withFence();
    l.fences.vE[vIdx(3, 20)] = EDGE.gateShut;
    l.fences.vE[vIdx(4, 20)] = EDGE.gateOpen;
    l.fences.vE[vIdx(5, 20)] = EDGE.tapeDown;
    const edges = Array.from({ length: GRID_H }, (_, y) => vEdge(y, 20));
    expect(buildFence(l, edges.slice(6), EDGE.permanent)).toMatchObject({
      ok: false,
      reason: 'nothing-to-build',
    });
    const r = ok(buildFence(l, edges, EDGE.electric));
    expect(r.segments).toBe(GRID_H - 2);
    expect(r.replaced).toMatchObject({ permanent: GRID_H - 3, tapeDown: 1 });
    expect(r.layout.fences.vE[vIdx(3, 20)]).toBe(EDGE.gateShut);
    expect(r.layout.fences.vE[vIdx(4, 20)]).toBe(EDGE.gateOpen);
    expect(r.layout.fences.vE[vIdx(5, 20)]).toBe(EDGE.electric);
    // Along the boundary there is nothing to build.
    const top = Array.from({ length: 5 }, (_, x) => hEdge(0, x));
    expect(buildFence(l, top, EDGE.permanent).ok).toBe(false);
    expect(buildFence(l, [{ line: 'h', index: 99999 }], EDGE.permanent)).toMatchObject({
      ok: false,
      reason: 'off-the-farm',
    });
    expect(buildFence(l, edges, 4 as FenceType).ok).toBe(false);
  });

  it('tape comes off the roll first, and goes back on when it is rolled up', () => {
    let l = bareLayout(2000);
    const side = l.scale.sideM;
    const first = Array.from({ length: 6 }, (_, y) => vEdge(y, 8));
    const a = ok(buildFence(l, first, EDGE.tape));
    expect([a.tapeFromRoll, a.tapeNew]).toEqual([0, 6]);
    expect([a.tapeFromRollM, a.tapeNewM, a.metres]).toEqual([0, 6 * side, 6 * side]);
    l = a.layout;
    const up = ok(removeFence(l, tapeRun(l.fences, vEdge(2, 8))));
    expect(up.tapeToRoll).toBe(6);
    expect(up.tapeToRollM).toBe(6 * side);
    expect(up.layout.tapeOnRoll).toBe(6);
    const second = Array.from({ length: 10 }, (_, x) => hEdge(5, x));
    const b = ok(buildFence(up.layout, second, EDGE.tape));
    expect([b.tapeFromRoll, b.tapeNew]).toEqual([6, 4]);
    expect([b.tapeFromRollM, b.tapeNewM]).toEqual([6 * side, 4 * side]);
    expect(b.layout.tapeOnRoll).toBe(0);
    // Permanent and electric fence never touch the roll.
    const c = ok(buildFence({ ...b.layout, tapeOnRoll: 9 }, first, EDGE.electric));
    expect([c.tapeFromRoll, c.tapeNew, c.layout.tapeOnRoll]).toEqual([0, 0, 9]);
  });

  it('pulling down reports what came down, gates included', () => {
    const l = withFence();
    l.fences.vE[vIdx(3, 20)] = EDGE.gateShut;
    l.fences.vE[vIdx(4, 20)] = EDGE.gateOpen;
    hRun(l.fences, 10, 0, 20, EDGE.tape);
    const edges = Array.from({ length: GRID_H }, (_, y) => vEdge(y, 20));
    const r = ok(removeFence(l, edges));
    expect(r.removed).toEqual({
      permanent: GRID_H - 2,
      electric: 0,
      tape: 0,
      gateShut: 1,
      gateOpen: 1,
      electricDown: 0,
      tapeDown: 0,
    });
    expect(r.segments).toBe(GRID_H);
    expect(r.paddocksAfter).toBe(1);
    expect(removeFence(r.layout, edges)).toMatchObject({ ok: false, reason: 'nothing-to-remove' });
    // The boundary can't be pulled down.
    expect(removeFence(l, [vEdge(3, 0)]).ok).toBe(false);
    const gate = ok(removeGate(l, vEdge(4, 20)));
    expect(gate.wasOpen).toBe(true);
    expect(gate.layout.fences.vE[vIdx(4, 20)]).toBe(EDGE.none);
  });

  it('only knocked-down fences are fixed, and only tape is knocked down', () => {
    const l = withFence();
    expect(fixFence(l, vEdge(3, 20))).toMatchObject({ ok: false, reason: 'nothing-to-fix' });
    expect(knockDownTape(l, vEdge(3, 20))).toMatchObject({ ok: false, reason: 'not-tape' });
    l.fences.vE[vIdx(3, 20)] = EDGE.tape;
    const down = ok(knockDownTape(l, vEdge(3, 20)));
    expect(down.layout.fences.vE[vIdx(3, 20)]).toBe(EDGE.tapeDown);
    expect(down.areas.joins).toHaveLength(1);
    expect(down.paddocksAfter).toBe(2);
    const up = ok(fixFence(down.layout, vEdge(3, 20)));
    expect(up.type).toBe(EDGE.tape);
    expect(up.areas.splits).toHaveLength(1);
  });

  it('a trough on the bore needs no pipe; anywhere else needs water', () => {
    const l = bareLayout(2000);
    const bore = l.water.bore;
    expect(ok(placeTrough(l, bore)).layout.water.troughs).toEqual([bore]);
    expect(placeTrough(l, bore + 3)).toMatchObject({ ok: false, reason: 'trough-needs-water' });
    const piped = ok(layPipe(l, pipeLine(bore, bore + 3)));
    expect(piped.segments).toBe(3);
    expect(piped.connected).toBe(true);
    expect(ok(placeTrough(piped.layout, bore + 3)).cell).toBe(bore + 3);
    // Pipe laid away from the bore is not connected yet.
    const loose = ok(layPipe(l, pipeLine(3, 9)));
    expect(loose.connected).toBe(false);
    expect(placeTrough(loose.layout, 5).ok).toBe(false);
    expect(layPipe(piped.layout, pipeLine(bore, bore + 3))).toMatchObject({
      ok: false,
      reason: 'pipe-already-there',
    });
    expect(layPipe(l, [GRID_N])).toMatchObject({ ok: false, reason: 'off-the-farm' });
    expect(placeTrough(l, -1)).toMatchObject({ ok: false, reason: 'off-the-farm' });
  });

  it('a trough moves only onto water, and only if it is there', () => {
    const l = ok(placeTrough(bareLayout(2000), bareLayout(2000).water.bore)).layout;
    const bore = l.water.bore;
    expect(moveTrough(l, bore, 5)).toMatchObject({ ok: false, reason: 'trough-needs-water' });
    expect(moveTrough(l, 7, bore)).toMatchObject({ ok: false, reason: 'no-trough-there' });
    const piped = ok(layPipe(l, pipeLine(bore, bore + 4))).layout;
    const moved = ok(moveTrough(piped, bore, bore + 4));
    expect(moved.layout.water.troughs).toEqual([bore + 4]);
    expect(moveTrough(moved.layout, bore + 4, bore + 4)).toMatchObject({
      ok: false,
      reason: 'trough-already-there',
    });
    expect(removeTrough(moved.layout, bore)).toMatchObject({
      ok: false,
      reason: 'no-trough-there',
    });
    expect(ok(removeTrough(moved.layout, bore + 4)).layout.water.troughs).toEqual([]);
  });

  it('a square hub turns every side that is not the boundary into an open gate', () => {
    const l = bareLayout(2000);
    const c = l.water.bore;
    const x = c % GRID_W;
    const y = (c / GRID_W) | 0;
    // One side already has a fence. The other three have nothing.
    l.fences.vE[vIdx(y, x)] = EDGE.permanent;
    const r = ok(placeSquareHub(l, c));
    expect(r.troughAdded).toBe(true);
    expect(r.gates).toBe(4);
    expect(r.replaced).toMatchObject({ permanent: 1 });
    for (const e of [hEdge(y, x), hEdge(y + 1, x), vEdge(y, x), vEdge(y, x + 1)]) {
      expect(getEdge(r.layout.fences, e)).toBe(EDGE.gateOpen);
    }
    // The square is now its own paddock, joined to the rest for grazing.
    expect(r.paddocksAfter).toBe(2);
    expect(r.topology.areas).toHaveLength(1);
    expect(placeSquareHub(r.layout, c)).toMatchObject({ ok: false, reason: 'hub-already-there' });
    expect(placeSquareHub(l, c + 5)).toMatchObject({ ok: false, reason: 'hub-needs-water' });
    // On a square that already has a trough, only the gates are added.
    const withTrough = ok(placeTrough(l, c)).layout;
    expect(ok(placeSquareHub(withTrough, c)).troughAdded).toBe(false);
  });

  it('a square hub against the boundary leaves the boundary alone', () => {
    const l = bareLayout(2000, 0);
    const r = ok(placeSquareHub(l, 0));
    expect(r.gates).toBe(2);
    expect(r.layout.fences.hE[0]).toBe(EDGE.boundary);
    expect(r.layout.fences.vE[0]).toBe(EDGE.boundary);
  });

  it('a fence hub goes on a fence, needs water beside it, and waters the squares it touches', () => {
    const l = withFence();
    // The bore is at column 20, row 13: the square just right of the fence.
    const v = vertexId(20, 13);
    expect(placeFenceHub(l, vertexId(5, 5))).toMatchObject({
      ok: false,
      reason: 'hub-needs-fence',
    });
    expect(placeFenceHub(l, vertexId(20, 3))).toMatchObject({
      ok: false,
      reason: 'hub-needs-water',
    });
    const r = ok(placeFenceHub(l, v));
    expect(r.cells).toHaveLength(4);
    expect(r.paddocks.sort()).toEqual([0, 1]);
    const { points } = surveyLayout(r.layout);
    expect(points.areaTroughs.every((t) => t.length === 2)).toBe(true);
    expect(placeFenceHub(r.layout, v)).toMatchObject({ ok: false, reason: 'hub-already-there' });
    expect(removeHub(l, v)).toMatchObject({ ok: false, reason: 'no-hub-there' });
    expect(ok(removeHub(r.layout, v)).layout.water.hubs).toEqual([]);
    expect(placeFenceHub(l, 99999)).toMatchObject({ ok: false, reason: 'off-the-farm' });
  });

  it('portable troughs go anywhere, keep their water when moved, and are refilled to full', () => {
    const l = bareLayout(2000);
    const a = ok(placePortable(l, 77));
    expect(a.port).toEqual({ id: 1, cell: 77, level: 6000, warned: false, lastUse: 0 });
    const b = ok(placePortable(a.layout, 78));
    expect(b.port.id).toBe(2);
    const low = {
      ...b.layout,
      water: {
        ...b.layout.water,
        ports: b.layout.water.ports.map((p) =>
          p.id === 1 ? { ...p, level: 40, warned: true } : p,
        ),
      },
    };
    const moved = ok(movePortable(low, 1, 500));
    expect(moved.layout.water.ports[0]).toMatchObject({ cell: 500, level: 40, warned: true });
    expect([moved.from, moved.to]).toEqual([77, 500]);
    const filled = ok(refillPortable(moved.layout, 1));
    expect(filled.litres).toBe(5960);
    expect(filled.wasEmpty).toBe(false);
    expect(filled.layout.water.ports[0]).toMatchObject({ level: 6000, warned: false });
    const gone = ok(removePortable(filled.layout, 1));
    expect(gone.port.id).toBe(1);
    expect(gone.layout.water.ports.map((p) => p.id)).toEqual([2]);
    expect(movePortable(l, 1, 5)).toMatchObject({ ok: false, reason: 'no-portable-trough' });
    expect(placePortable(l, GRID_N)).toMatchObject({ ok: false, reason: 'off-the-farm' });
  });
});
