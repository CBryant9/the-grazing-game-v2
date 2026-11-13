import { describe, expect, it, vi } from 'vitest';
import {
  bareLayout,
  box,
  handMadeLayouts,
  hRun,
  randomLayout,
  vRun,
} from '../../test-support/layouts';
import { seededRandom } from '../../test-support/mvp';
import {
  expectSameSurvey,
  fromMvpEdge,
  loadMvpFarm,
  mvpNewGame,
  putLayout,
} from '../../test-support/mvpFarm';
import { firstDifference } from '../../test-support/farms';
import { GRID_H, GRID_N, GRID_W } from '../grid';
import { rngStream } from '../rng';
import { surveyLayout } from './layout';
import {
  EDGE,
  PADDOCK_BLOCK,
  STOCK_BLOCK,
  areaChanges,
  areaEdges,
  buildTopology,
  createFences,
  edgeOnFarm,
  flood,
  hIdx,
  labelSquare,
  vIdx,
} from './topology';
import { NO_WATER_DISTANCE, areaWatered, hubCells, pipeReach, vertexId } from './water';

/*
 * Paddocks, grazing areas and water against the MVP's own recompute, flood,
 * labelCell, pipeReach and hubCells.
 *
 * The MVP is given the same edges, pipe, troughs, hubs and portable troughs.
 * Every square must then have the same paddock id and grazing area id, the
 * same watered squares in the same order, and the same distance to water
 * bit for bit. Nothing here uses a tolerance.
 */

// The MVP runs slowly in its sandbox, more so when test files run side by side.
vi.setConfig({ testTimeout: 180000 });

const loaded = loadMvpFarm();
const { mvp } = loaded;
mvpNewGame(loaded, { region: 'cw', year: 2022, month: 3, ha: 2000 }, seededRandom(7));

describe('edge indexes and the boundary', () => {
  it('index the same lines as the MVP', () => {
    for (let vy = 0; vy <= GRID_H; vy++) {
      for (let x = 0; x < GRID_W; x++) expect(hIdx(vy, x)).toBe(mvp.hIdx(vy, x));
    }
    for (let y = 0; y < GRID_H; y++) {
      for (let vx = 0; vx <= GRID_W; vx++) expect(vIdx(y, vx)).toBe(mvp.vIdx(y, vx));
    }
  });

  it('a new farm has the boundary and nothing else, as in the MVP', () => {
    const f = createFences();
    const S = mvp.S;
    // The MVP's scratch farm may have one old fence line. Compare the boundary edges only.
    const boundary = (a: Uint8Array): number[] => Array.from(a, (v) => (v === 9 ? 9 : 0));
    expect(Array.from(f.hE)).toEqual(boundary(S.hE));
    expect(Array.from(f.vE)).toEqual(boundary(S.vE));
    expect(f.hE.length).toBe(S.hE.length);
    expect(f.vE.length).toBe(S.vE.length);
  });

  it('what blocks stock and what bounds a paddock are the MVP sets', () => {
    expect(Array.from(STOCK_BLOCK)).toEqual(Array.from(mvp.BLOCK));
    expect(Array.from(PADDOCK_BLOCK)).toEqual(Array.from(mvp.ALLB));
  });

  it('knows which edges are on the farm', () => {
    expect(edgeOnFarm({ line: 'h', index: 0 })).toBe(true);
    expect(edgeOnFarm({ line: 'h', index: (GRID_H + 1) * GRID_W - 1 })).toBe(true);
    expect(edgeOnFarm({ line: 'h', index: (GRID_H + 1) * GRID_W })).toBe(false);
    expect(edgeOnFarm({ line: 'v', index: GRID_H * (GRID_W + 1) - 1 })).toBe(true);
    expect(edgeOnFarm({ line: 'v', index: GRID_H * (GRID_W + 1) })).toBe(false);
    expect(edgeOnFarm({ line: 'v', index: -1 })).toBe(false);
    expect(edgeOnFarm({ line: 'h', index: 1.5 })).toBe(false);
  });
});

describe('paddocks, grazing areas and water, against the MVP', () => {
  const cases = handMadeLayouts();

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    putLayout(mvp, c.layout);
    expectSameSurvey(surveyLayout(c.layout), mvp);
    expect(firstDifference(pipeReach(c.layout.water), mvp.pipeReach()), 'water reach').toBeNull();
  });

  it('300 random layouts, light to busy, on small and large farms', { timeout: 60000 }, () => {
    const rng = rngStream(20261113, 'random-layouts');
    let paddocks = 0;
    let joined = 0;
    let dry = 0;
    for (let k = 0; k < 300; k++) {
      const layout = randomLayout(rng, [200, 2000, 12000][k % 3]!, [0.2, 0.5, 1][k % 3]!);
      putLayout(mvp, layout);
      const survey = surveyLayout(layout);
      expectSameSurvey(survey, mvp, `random layout ${k}`);
      expect(
        firstDifference(pipeReach(layout.water), mvp.pipeReach()),
        `water reach, random layout ${k}`,
      ).toBeNull();
      paddocks += survey.topology.paddocks.length;
      joined += survey.topology.areas.filter((a) => a.paddocks.length > 1).length;
      dry += survey.points.areaTroughs.filter((t) => !t.length).length;
    }
    // The random layouts really do exercise joined paddocks and dry areas.
    expect(paddocks).toBeGreaterThan(1500);
    expect(joined).toBeGreaterThan(100);
    expect(dry).toBeGreaterThan(100);
  });

  it('flood and the label square match the MVP on their own', () => {
    const rng = rngStream(5, 'flood');
    for (let k = 0; k < 40; k++) {
      const layout = randomLayout(rng, 2000, 0.8);
      putLayout(mvp, layout);
      for (const [mine, theirs] of [
        [STOCK_BLOCK, mvp.BLOCK],
        [PADDOCK_BLOCK, mvp.ALLB],
      ] as const) {
        const a = flood(layout.fences, mine);
        const [of, groups] = mvp.flood(theirs);
        expect(firstDifference(a.of, of)).toBeNull();
        expect(a.groups).toEqual(groups.map((g) => Array.from(g)));
        for (const g of a.groups) expect(labelSquare(g)).toBe(mvp.labelCell(g));
      }
    }
  });

  it('hub squares match the MVP for every grid corner', () => {
    for (let vy = 0; vy <= GRID_H; vy++) {
      for (let vx = 0; vx <= GRID_W; vx++) {
        const v = vertexId(vx, vy);
        expect(hubCells(v)).toEqual(Array.from(mvp.hubCells(v)));
      }
    }
    expect(hubCells(vertexId(0, 0))).toEqual([0]);
    expect(hubCells(vertexId(5, 5))).toHaveLength(4);
    expect(hubCells(vertexId(5, 0))).toHaveLength(2);
  });

  it('the edges around a grazing area match the MVP', () => {
    const rng = rngStream(9, 'area-edges');
    let found = 0;
    for (let k = 0; k < 40; k++) {
      const layout = randomLayout(rng, 2000, 1);
      putLayout(mvp, layout);
      const { topology } = surveyLayout(layout);
      for (const area of topology.areas) {
        for (const codes of [[3], [1, 2], [4, 5, 9]]) {
          const mine = areaEdges(topology, layout.fences, area.id, codes);
          const theirs = mvp.boundaryEdges(mvp.REGS[area.id]!, codes).map(fromMvpEdge);
          expect(mine).toEqual(theirs);
          found += mine.length;
        }
      }
    }
    expect(found).toBeGreaterThan(1000);
  });
});

describe('paddock and area rules', () => {
  it('names paddocks "Paddock 1", never "P1"', () => {
    const l = bareLayout();
    vRun(l.fences, 20, 0, GRID_H, EDGE.permanent);
    l.fences.vE[vIdx(4, 20)] = EDGE.gateOpen;
    const t = buildTopology(l.fences, l.scale.haPerSquare);
    expect(t.paddocks.map((p) => p.name)).toEqual(['Paddock 1', 'Paddock 2']);
    expect(t.areas.map((a) => a.name)).toEqual(['Paddocks 1 + 2']);
    expect(JSON.stringify(t)).not.toMatch(/"P\d/);
  });

  it('a gate, open or shut, bounds a paddock; only an open one joins the grazing', () => {
    for (const [gate, areas] of [
      [EDGE.gateShut, 2],
      [EDGE.gateOpen, 1],
      [EDGE.tapeDown, 1],
      [EDGE.electricDown, 1],
      [EDGE.tape, 2],
      [EDGE.none, 1],
    ] as const) {
      const l = bareLayout();
      vRun(l.fences, 20, 0, GRID_H, EDGE.permanent);
      l.fences.vE[vIdx(4, 20)] = gate;
      const t = buildTopology(l.fences, l.scale.haPerSquare);
      expect(t.paddocks.length, `paddocks with code ${gate}`).toBe(gate === EDGE.none ? 1 : 2);
      expect(t.areas.length, `areas with code ${gate}`).toBe(areas);
    }
  });

  it('paddock areas add up to the farm', () => {
    const rng = rngStream(3, 'areas-add-up');
    for (let k = 0; k < 20; k++) {
      const l = randomLayout(rng, 6000, 0.7);
      const t = buildTopology(l.fences, l.scale.haPerSquare);
      const squares = t.paddocks.reduce((s, p) => s + p.cells.length, 0);
      expect(squares).toBe(GRID_N);
      expect(t.areas.reduce((s, a) => s + a.cells.length, 0)).toBe(GRID_N);
      for (const p of t.paddocks) expect(p.ha).toBe(p.cells.length * l.scale.haPerSquare);
    }
  });

  it('distance to water is in squares, straight line, and 999 with no water', () => {
    const l = bareLayout();
    vRun(l.fences, 20, 0, GRID_H, EDGE.permanent);
    l.water.troughs.push(3 * GRID_W + 4);
    const { topology, points } = surveyLayout(l);
    expect(points.dist[3 * GRID_W + 4]).toBe(0);
    expect(points.dist[3 * GRID_W + 7]).toBe(3);
    expect(points.dist[7 * GRID_W + 7]).toBe(5);
    expect(points.dist[0]).toBe(Math.fround(Math.hypot(4, 3)));
    // The far side of the fence has no water.
    expect(points.dist[3 * GRID_W + 30]).toBe(NO_WATER_DISTANCE);
    expect(areaWatered(points, topology.areaOf[0]!)).toBe(true);
    expect(areaWatered(points, topology.areaOf[30]!)).toBe(false);
  });

  it('an empty portable trough waters nothing', () => {
    const l = bareLayout();
    l.water.ports.push({ id: 1, cell: 50, level: 0, warned: true, lastUse: 0 });
    expect(surveyLayout(l).points.areaTroughs[0]).toEqual([]);
    l.water.ports[0]!.level = 1;
    expect(surveyLayout(l).points.areaTroughs[0]).toEqual([50]);
  });

  it('reports the grazing areas a change splits and joins', () => {
    const before = bareLayout();
    box(before.fences, 5, 5, 10, 10, EDGE.permanent);
    const a = buildTopology(before.fences, 1);
    const after = bareLayout();
    box(after.fences, 5, 5, 10, 10, EDGE.permanent);
    vRun(after.fences, 20, 0, GRID_H, EDGE.permanent);
    const b = buildTopology(after.fences, 1);
    // The outer area is cut in two. The box is untouched.
    expect(areaChanges(a, b)).toEqual({ splits: [{ from: 0, into: [0, 1] }], joins: [] });
    expect(areaChanges(b, a)).toEqual({ splits: [], joins: [{ from: [0, 1], into: 0 }] });
    expect(areaChanges(a, a)).toEqual({ splits: [], joins: [] });
    // A fence that splits one area in three, and a gate that joins two others.
    const c = bareLayout();
    hRun(c.fences, 8, 0, GRID_W, EDGE.permanent);
    hRun(c.fences, 16, 0, GRID_W, EDGE.permanent);
    const d = bareLayout();
    hRun(d.fences, 8, 0, GRID_W, EDGE.permanent);
    hRun(d.fences, 16, 0, GRID_W, EDGE.permanent);
    vRun(d.fences, 20, 0, 8, EDGE.tape);
    d.fences.hE[hIdx(16, 3)] = EDGE.gateOpen;
    const changes = areaChanges(buildTopology(c.fences, 1), buildTopology(d.fences, 1));
    expect(changes.splits).toEqual([{ from: 0, into: [0, 1] }]);
    expect(changes.joins).toEqual([{ from: [1, 2], into: 2 }]);
  });
});
