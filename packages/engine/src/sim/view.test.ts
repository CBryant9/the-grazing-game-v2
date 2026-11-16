import {
  DISTRICT_IDS,
  FARM_GRID_N,
  FARM_VIEW_VERSION,
  VIEW_FENCE,
  VIEW_LABELS,
  VIEW_LAND,
  type FarmView,
} from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  act,
  boxCells,
  boxEdges,
  cellAt,
  farCorner,
  openFarm,
  scratchFarm,
  PLENTY,
} from '../../test-support/wholeFarm';
import { applyInstantly as applyAction } from '../../test-support/instant';
import { dateAt } from '../calendar';
import { DISTRICTS } from '../data/districts';
import { daylightFor } from '../daylight/daylight';
import { DISTRICT_PLACES } from '../daylight/places';
import { hEdge, vEdge } from '../farm/topology';
import { knockDownTape } from '../farm/layout';
import { paddockSummary } from '../pasture/summary';
import { LAND } from '../pasture/state';
import { farmHash } from '../save/save';
import { loadRealData } from '../server';
import { createFarm } from './create';
import { dateOn, plantingsNow, surveyOf } from './derived';
import { cloneFarm, type FarmState } from './state';
import { farmTotals, paddockSummaries } from './summary';
import { stepDay } from './tick';
import { farmView } from './view';

vi.setConfig({ testTimeout: 120_000 });

/*
 * The farm view is all the browser is sent about a farm's country. These
 * tests hold it to four things: it carries only the fields listed here, it
 * is plain JSON, it says what the model says, and it stays small.
 */

/** Every field the view may hold, by where it sits. A new field must be added here on purpose. */
const ALLOWED: Record<string, readonly string[]> = {
  view: [
    'viewVersion',
    'district',
    'day',
    'date',
    'light',
    'scale',
    'squares',
    'fences',
    'gates',
    'water',
    'trees',
    'buildings',
    'paddocks',
    'areas',
    'plantings',
    'mobs',
  ],
  'view.date': ['year', 'month', 'date'],
  'view.light': ['first', 'last'],
  'view.scale': ['farmHa', 'haPerSquare', 'sideM'],
  'view.squares': [
    'land',
    'heightCm',
    'green',
    'cover',
    'leafAge',
    'weathered',
    'seedHeads',
    'label',
    'planting',
    'me10',
    'grazed',
    'waterDist',
    'arable',
    'paddock',
    'area',
  ],
  'view.fences': ['h', 'v'],
  'view.gates[]': ['line', 'index', 'open', 'kind'],
  'view.water': ['bore', 'pipe', 'pipeDry', 'troughs', 'hubs', 'squareHubs'],
  'view.water.troughs[]': ['kind', 'cell', 'id', 'levelPct'],
  'view.buildings[]': ['kind', 'cell'],
  'view.paddocks[]': [
    'id',
    'name',
    'ha',
    'labelCell',
    'area',
    'label',
    'water',
    'mobs',
    'sward',
    'parts',
  ],
  'view.paddocks[].sward': [
    'massKgHa',
    'greenKgHa',
    'deadKgHa',
    'heightCm',
    'leafCm',
    'greenPct',
    'coverPct',
    'seedHeads',
    'leafAge',
  ],
  'view.paddocks[].parts[]': ['kind', 'ha', 'planting', 'sward'],
  'view.paddocks[].parts[].sward': [
    'massKgHa',
    'greenKgHa',
    'deadKgHa',
    'heightCm',
    'leafCm',
    'greenPct',
    'coverPct',
    'seedHeads',
    'leafAge',
  ],
  'view.areas[]': ['id', 'name', 'ha', 'labelCell', 'paddocks', 'hasWater'],
  'view.plantings[]': [
    'id',
    'name',
    'kind',
    'stage',
    'squares',
    'labelCell',
    'selfSown',
    'oversown',
    'ready',
  ],
  'view.mobs[]': [
    'id',
    'name',
    'where',
    'area',
    'anchor',
    'head',
    'calves',
    'ae',
    'classes',
    'cattle',
    'seed',
    'status',
  ],
  'view.mobs[].cattle[]': ['kind', 'n', 'thin', 'fat'],
  'view.mobs[].status': ['noWater', 'dryDays', 'toMark'],
};

/** Records whose keys are data (class ids), not fields. Their values must be whole numbers. */
const OPEN_RECORDS = new Set(['view.mobs[].classes']);

/** Walk the view. Returns every problem found: a field not on the list, or a value that is not plain JSON. */
function problems(v: unknown, path = 'view', out: string[] = []): string[] {
  if (out.length > 20) return out;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return out;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} is ${v}`);
    return out;
  }
  if (Array.isArray(v)) {
    v.forEach((x) => problems(x, path + '[]', out));
    return out;
  }
  if (typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) {
    out.push(`${path} is not plain JSON (${Object.prototype.toString.call(v)})`);
    return out;
  }
  const rec = v as Record<string, unknown>;
  if (OPEN_RECORDS.has(path)) {
    for (const [k, x] of Object.entries(rec)) {
      if (!Number.isInteger(x)) out.push(`${path}.${k} is not a whole number`);
    }
    return out;
  }
  const allowed = ALLOWED[path];
  if (!allowed) {
    out.push(`${path} is not on the list of allowed records`);
    return out;
  }
  for (const k of Object.keys(rec)) {
    if (!allowed.includes(k)) out.push(`${path}.${k} is not on the list of allowed fields`);
    else problems(rec[k], `${path}.${k}`, out);
  }
  return out;
}

/** A running farm with its herd, a few days in so the cattle have grazed. */
function runningFarm(seed = 3, district: 'cq' | 'nsw' | 'cw' | 'wv' = 'nsw', days = 5): FarmState {
  const farm = createFarm({
    seed,
    district,
    size: 'medium',
    start: { year: 2023, month: 8 },
    startType: 'running',
    difficulty: 'easy',
    money: { ...PLENTY },
  });
  for (let d = 0; d < days; d++) stepDay(farm);
  return farm;
}

/** The speed test's farm: more than 4,000 head on a large Central Queensland place. */
function bigHerdFarm(): FarmState {
  let farm = createFarm({
    seed: 5,
    district: 'cq',
    size: 'large',
    start: { year: 2024, month: 4 },
    startType: 'running',
    difficulty: 'easy',
    money: { cash: 1e8, overdraft: -1e8, broke: -1e9 },
  });
  const s = surveyOf(farm);
  for (const r of s.topology.areas) {
    if (!s.points.areaTroughs[r.id]!.length) continue;
    const done = applyAction(farm, {
      type: 'buyCattle',
      cls: 'weanerSteer',
      qty: 700,
      to: { cell: r.cells[0]! },
    });
    if (done.ok) farm = done.farm;
  }
  for (let d = 0; d < 3; d++) stepDay(farm);
  return farm;
}

describe('the farm view holds only what the map draws', () => {
  it.each(DISTRICT_IDS)('%s: every field is on the list, on a running mixed farm', (id) => {
    const farm = createFarm({
      seed: 11,
      district: id,
      size: 'medium',
      start: { year: 2023, month: 3 },
      startType: 'running',
      mixed: { arablePct: id === 'nsw' ? 20 : 40, croppedPct: 60 },
      difficulty: 'medium',
    });
    for (let d = 0; d < 40; d++) stepDay(farm);
    const view = farmView(farm);
    expect(problems(view)).toEqual([]);
    expect(view.viewVersion).toBe(FARM_VIEW_VERSION);
    expect(view.plantings.length).toBeGreaterThan(0);
  });

  it('a from-scratch farm with no cattle is on the list too', () => {
    expect(problems(farmView(scratchFarm()))).toEqual([]);
  });

  it('is plain JSON: it comes back the same after being written out and read in', () => {
    const view = farmView(runningFarm());
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('does not carry the seed, the random streams, the money or the market', () => {
    // A seed whose digits would stand out anywhere in the text.
    const seed = 987654321;
    const farm = runningFarm(seed);
    const text = JSON.stringify(farmView(farm));
    expect(text).not.toContain(String(seed));
    for (const state of Object.values(farm.rng)) {
      for (const word of state) {
        // Small words could match a square number by chance. The streams' words are large.
        if (word > 1e6) expect(text).not.toContain(String(word));
      }
    }
    for (const banned of [
      'rng',
      'cash',
      'overdraft',
      'market',
      'price',
      'indicator',
      'yield',
      'fertility',
      'season',
      'ledger',
      'actionLog',
      'inbox',
      'engineVersion',
    ]) {
      expect(text.toLowerCase(), `"${banned}" should not be in the view`).not.toContain(
        banned.toLowerCase(),
      );
    }
  });

  it("a mob's map seed comes from its id alone, not from the farm's seed", () => {
    const a = farmView(runningFarm(3));
    const b = farmView(runningFarm(77));
    expect(a.mobs.length).toBeGreaterThan(0);
    const seeds = new Map(a.mobs.map((m) => [m.id, m.seed]));
    let shared = 0;
    for (const m of b.mobs) {
      if (!seeds.has(m.id)) continue;
      shared++;
      expect(m.seed).toBe(seeds.get(m.id));
    }
    expect(shared).toBeGreaterThan(0);
    // Different mobs stand differently.
    expect(new Set(a.mobs.map((m) => m.seed)).size).toBe(a.mobs.length);
  });

  it('does not change the farm it reads', () => {
    const farm = runningFarm();
    const before = farmHash(farm);
    farmView(farm);
    expect(farmHash(farm)).toBe(before);
  });
});

describe('the farm view is the same for the same farm, and changes when the farm does', () => {
  it('the same farm gives the same view, text for text', () => {
    const farm = runningFarm();
    const a = JSON.stringify(farmView(farm));
    expect(JSON.stringify(farmView(farm))).toBe(a);
    expect(JSON.stringify(farmView(cloneFarm(farm)))).toBe(a);
    expect(JSON.stringify(farmView(runningFarm()))).toBe(a);
  });

  it('grazing a paddock shows on its squares', () => {
    let farm = openFarm('nsw');
    const [x0, y0] = farCorner(farm);
    const box = boxCells(x0, y0, x0 + 2, y0 + 2);
    farm = act(farm, {
      type: 'buildFence',
      edges: boxEdges(x0, y0, x0 + 2, y0 + 2),
      fence: 'tape',
    });
    farm = act(farm, { type: 'placePortable', cell: box[0]! });
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 300, to: { cell: box[4]! } });
    const before = farmView(farm);
    for (let d = 0; d < 6; d++) stepDay(farm);
    const after = farmView(farm);
    expect(farm.over).toBeNull();
    // Recent grazing shows inside the box and nowhere else.
    for (const i of box) expect(after.squares.grazed[i], `square ${i}`).toBeGreaterThan(0);
    const outside = cellAt(x0 + 5, y0 + 5);
    expect(after.squares.grazed[outside]).toBe(0);
    // 300 steers on nine squares take the feed down.
    const height = (v: FarmView): number => box.reduce((t, i) => t + v.squares.heightCm[i]!, 0);
    expect(height(after)).toBeLessThan(height(before));
    const pad = after.paddocks.find((p) => p.id === after.squares.paddock[box[4]!])!;
    const padBefore = before.paddocks.find((p) => p.id === before.squares.paddock[box[4]!])!;
    expect(pad.sward.massKgHa).toBeLessThan(padBefore.sward.massKgHa);
  });

  it('building a fence shows as new lines and a new paddock', () => {
    const farm = openFarm('nsw');
    const before = farmView(farm);
    const [x0, y0] = farCorner(farm);
    const edges = boxEdges(x0, y0, x0 + 2, y0 + 2);
    const after = farmView(act(farm, { type: 'buildFence', edges, fence: 'electric' }));
    expect(after.paddocks.length).toBe(before.paddocks.length + 1);
    for (const e of edges) {
      const list = e.line === 'h' ? after.fences.h : after.fences.v;
      const was = e.line === 'h' ? before.fences.h : before.fences.v;
      expect(was[e.index]).toBe(VIEW_FENCE.none);
      expect(list[e.index]).toBe(VIEW_FENCE.electric);
    }
    expect(JSON.stringify(after.squares.paddock)).not.toBe(JSON.stringify(before.squares.paddock));
  });

  it('moving a mob shows as a new grazing area and anchor', () => {
    let farm = openFarm('nsw');
    const [x0, y0] = farCorner(farm);
    farm = act(farm, {
      type: 'buildFence',
      edges: boxEdges(x0, y0, x0 + 3, y0 + 3),
      fence: 'permanent',
    });
    const bore = farm.layout.water.bore;
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 20, to: { cell: bore } });
    const before = farmView(farm);
    const mob = before.mobs[0]!;
    expect(mob.area).toBe(before.squares.area[bore]);
    const target = cellAt(x0 + 1, y0 + 1);
    const after = farmView(act(farm, { type: 'moveMob', mob: mob.id, to: { cell: target } }));
    const moved = after.mobs.find((m) => m.id === mob.id)!;
    expect(moved.area).toBe(after.squares.area[target]);
    expect(moved.area).not.toBe(mob.area);
    expect(after.squares.area[moved.anchor]).toBe(moved.area);
    // The box has no water, and the view says so for the map's pin.
    expect(moved.status.noWater).toBe(true);
    expect(mob.status.noWater).toBe(false);
  });
});

describe('the farm view says what the model says', () => {
  it("each square's height, green share, cover and label are the paddock summary of that square", () => {
    const farm = runningFarm(9, 'cw', 20);
    const view = farmView(farm);
    const plantings = plantingsNow(farm);
    for (const i of [0, 37, 250, 511, 799, FARM_GRID_N - 1]) {
      const s = paddockSummary(farm.pasture, {
        district: DISTRICTS[farm.district],
        plantings,
        cells: [i],
        ha: farm.layout.scale.haPerSquare,
        haPerSquare: farm.layout.scale.haPerSquare,
        day: farm.day,
      });
      expect(view.squares.heightCm[i]).toBe(Math.round(s.height));
      expect(view.squares.green[i]).toBe(Math.round(s.green * 20));
      expect(view.squares.cover[i]).toBe(Math.round(s.cover * 10));
      expect(VIEW_LABELS[view.squares.label[i]!]).toBe(s.label);
      expect(view.squares.me10[i]).toBe(Math.round(s.me * 10));
    }
  });

  it('every list of squares is 1,040 whole numbers inside its range', () => {
    const view = farmView(runningFarm(4, 'cq', 10));
    const ranges: Record<keyof FarmView['squares'], [number, number]> = {
      land: [0, 5],
      heightCm: [0, 90],
      green: [0, 20],
      cover: [0, 10],
      leafAge: [0, 10],
      weathered: [0, 10],
      seedHeads: [0, 1],
      label: [0, 3],
      planting: [0, view.plantings.length],
      me10: [30, 130],
      grazed: [0, 10],
      waterDist: [-1, 2000],
      arable: [0, 1],
      paddock: [0, view.paddocks.length - 1],
      area: [0, view.areas.length - 1],
    };
    for (const [name, [lo, hi]] of Object.entries(ranges)) {
      const list = view.squares[name as keyof FarmView['squares']];
      expect(list.length, name).toBe(FARM_GRID_N);
      for (const v of list) {
        expect(Number.isInteger(v), name).toBe(true);
        expect(v, name).toBeGreaterThanOrEqual(lo);
        expect(v, name).toBeLessThanOrEqual(hi);
      }
    }
    expect(view.fences.h.length).toBe(27 * 40);
    expect(view.fences.v.length).toBe(26 * 41);
  });

  it("each paddock's figures are the paddock summary's, with the neutral label", () => {
    const farm = runningFarm(6, 'wv', 12);
    const view = farmView(farm);
    const sums = paddockSummaries(farm);
    expect(view.paddocks.length).toBe(sums.length);
    for (const p of view.paddocks) {
      const s = sums.find((x) => x.id === p.id)!;
      expect(p.name).toBe(s.name);
      expect(p.label).toBe(s.label);
      expect(['green', 'mixed', 'rank', 'short']).toContain(p.label);
      expect(p.water).toBe(s.water);
      expect(p.mobs).toEqual(s.mobs);
      // The side-view figures are the paddock sheet's, rounded no finer
      // than the sheet shows: kg to the nearest 10, whole cm, whole %.
      expect(p.sward.massKgHa).toBe(Math.round(s.mass / 10) * 10);
      expect(p.sward.greenKgHa).toBe(Math.round(s.g / 10) * 10);
      expect(p.sward.deadKgHa).toBe(Math.round(s.d / 10) * 10);
      expect(p.sward.heightCm).toBe(Math.round(s.height));
      expect(p.sward.leafCm).toBe(Math.round(s.leafH));
      expect(p.sward.greenPct).toBe(Math.round(s.green * 100));
      expect(p.sward.seedHeads).toBe(
        s.x > 0.3 ? Math.max(1, Math.round(Math.min(1, s.x) * 10)) : 0,
      );
      expect(Number.isInteger(p.sward.leafAge)).toBe(true);
      expect(p.sward.leafAge).toBeGreaterThanOrEqual(0);
      expect(p.sward.leafAge).toBeLessThanOrEqual(10);
      // Every square in the paddock points back at it.
      expect(view.squares.paddock[p.labelCell]).toBe(p.id);
    }
    const totalHa = view.paddocks.reduce((t, p) => t + p.ha, 0);
    expect(totalHa).toBeCloseTo(view.scale.farmHa, 0);
  });

  it('seed heads show past rankness 0.35 with more than 1,800 kg DM/ha, and not either side', () => {
    const farm = scratchFarm();
    const set = (i: number, x: number, g: number, d: number): void => {
      farm.pasture.X[i] = x;
      farm.pasture.G[i] = g;
      farm.pasture.D[i] = d;
      farm.pasture.land[i] = LAND.native;
    };
    set(100, 0.36, 900, 910); // rank enough, 1,810 kg
    set(101, 0.34, 900, 910); // not rank enough
    set(102, 0.36, 900, 890); // rank, but 1,790 kg
    set(103, 0.9, 2000, 3000); // rank and heavy
    const view = farmView(farm);
    expect(view.squares.seedHeads[100]).toBe(1);
    expect(view.squares.seedHeads[101]).toBe(0);
    expect(view.squares.seedHeads[102]).toBe(0);
    expect(view.squares.seedHeads[103]).toBe(1);
  });

  it('fallow and stubble squares say so, and a finished crop shows seed heads', () => {
    const farm = scratchFarm();
    farm.pasture.land[200] = LAND.fallow;
    farm.pasture.land[201] = LAND.stubble;
    farm.pasture.X[201] = 0.9;
    farm.pasture.D[201] = 2500;
    farm.pasture.land[202] = LAND.crop;
    const view = farmView(farm);
    expect(view.squares.land[200]).toBe(VIEW_LAND.fallow);
    expect(view.squares.land[201]).toBe(VIEW_LAND.stubble);
    // Stubble never shows seed heads, however rank its figures.
    expect(view.squares.seedHeads[201]).toBe(0);
    expect(view.squares.seedHeads[200]).toBe(0);
    expect(view.squares.seedHeads[202]).toBe(1);
  });

  it('cattle under condition score 2 are thin, and at 3.6 or more are fat', () => {
    let farm = openFarm('nsw');
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 6,
      to: { cell: farm.layout.water.bore },
    });
    const conds = [1.9, 2.0, 3.0, 3.59, 3.6, 4.2];
    farm.mobs[0]!.animals.forEach((a, k) => (a.cond = conds[k]!));
    const mob = farmView(farm).mobs[0]!;
    expect(mob.cattle).toEqual([{ kind: 'steer', n: 6, thin: 1, fat: 2 }]);
    expect(mob.head).toBe(6);
    expect(mob.classes).toEqual({ yearlingSteer: 6 });
  });

  it('water: the bore, pipe joined and not joined, troughs, a portable trough with its level', () => {
    let farm = openFarm('nsw');
    const bore = farm.layout.water.bore;
    const bx = bore % 40;
    const by = Math.floor(bore / 40);
    const dir = bx < 20 ? 1 : -1;
    const run = [1, 2, 3].map((k) => cellAt(bx + dir * k, by));
    farm = act(farm, { type: 'layPipe', cells: run });
    farm = act(farm, { type: 'placeTrough', cell: run[2]! });
    const [x0, y0] = farCorner(farm);
    farm = act(farm, { type: 'placePortable', cell: cellAt(x0, y0) });
    farm.layout.water.ports[0]!.level = 1500;
    // A length of pipe that reaches nothing.
    farm.layout.water.pipe[cellAt(x0 + 4, y0 + 4)] = 1;
    const view = farmView(farm);
    expect(view.water.bore).toBe(bore);
    expect(view.water.pipe).toEqual([...run].sort((a, b) => a - b));
    expect(view.water.pipeDry).toEqual([cellAt(x0 + 4, y0 + 4)]);
    const fixed = view.water.troughs.filter((t) => t.kind === 'fixed');
    expect(fixed.map((t) => t.cell)).toContain(run[2]);
    expect(fixed.every((t) => t.levelPct === 100)).toBe(true);
    const port = view.water.troughs.find((t) => t.kind === 'portable')!;
    expect(port.cell).toBe(cellAt(x0, y0));
    expect(port.levelPct).toBe(25);
    expect(port.id).toBeGreaterThan(0);
    // Distance to water is in hundreds of metres, and 0 on a watered square.
    expect(view.squares.waterDist[run[2]!]).toBe(0);
    const far = cellAt(bx + dir * 8, by);
    const metres = 5 * farm.layout.scale.sideM;
    expect(view.squares.waterDist[far]).toBe(Math.round(metres / 100));
  });

  it('both kinds of water hub, so the map can draw and tap them, and they follow a move', () => {
    let farm = openFarm('nsw');
    const bore = farm.layout.water.bore;
    const bx = bore % 40;
    const by = Math.floor(bore / 40);
    const dir = bx < 20 ? 1 : -1;
    const run = [1, 2, 3, 4].map((k) => cellAt(bx + dir * k, by));
    farm = act(farm, { type: 'layPipe', cells: run });
    farm = act(farm, { type: 'placeSquareHub', cell: run[1]! });
    // A fence down the far side of the last piped square, and a hub on its corner.
    const fx = bx + dir * 4 + (dir > 0 ? 1 : 0);
    farm = act(farm, {
      type: 'buildFence',
      edges: [vEdge(by - 1, fx), vEdge(by, fx), vEdge(by + 1, fx)],
      fence: 'permanent',
    });
    const corner = by * 41 + fx;
    farm = act(farm, { type: 'placeFenceHub', vertex: corner });
    let view = farmView(farm);
    expect(view.water.squareHubs).toEqual([run[1]]);
    expect(view.water.hubs).toEqual([corner]);
    // The hub's trough is a fixed trough too. The plain trough on the bore is not a hub.
    const fixed = view.water.troughs.filter((t) => t.kind === 'fixed').map((t) => t.cell);
    expect(fixed).toContain(run[1]);
    expect(view.water.squareHubs).not.toContain(bore);
    farm = act(farm, { type: 'moveSquareHub', from: run[1]!, to: run[3]! });
    farm = act(farm, { type: 'moveHub', from: corner, to: corner + 41 });
    view = farmView(farm);
    expect(view.water.squareHubs).toEqual([run[3]]);
    expect(view.water.hubs).toEqual([corner + 41]);
    farm = act(farm, { type: 'removeSquareHub', cell: run[3]! });
    farm = act(farm, { type: 'removeHub', vertex: corner + 41 });
    view = farmView(farm);
    expect(view.water.squareHubs).toEqual([]);
    expect(view.water.hubs).toEqual([]);
  });

  it('a paddock with no water reads -1 for distance, and its area says it has none', () => {
    let farm = openFarm('nsw');
    const [x0, y0] = farCorner(farm);
    farm = act(farm, {
      type: 'buildFence',
      edges: boxEdges(x0, y0, x0 + 2, y0 + 2),
      fence: 'permanent',
    });
    const view = farmView(farm);
    const inside = cellAt(x0 + 1, y0 + 1);
    expect(view.squares.waterDist[inside]).toBe(-1);
    expect(view.areas[view.squares.area[inside]!]!.hasWater).toBe(false);
    expect(view.paddocks[view.squares.paddock[inside]!]!.water).toBe('none');
  });

  it('gates are listed open or shut, and tape lying down has its own code', () => {
    let farm = openFarm('nsw');
    const [x0, y0] = farCorner(farm);
    farm = act(farm, {
      type: 'buildFence',
      edges: boxEdges(x0, y0, x0 + 2, y0 + 2),
      fence: 'tape',
    });
    const gate = hEdge(y0, x0 + 1);
    farm = act(farm, { type: 'placeGate', edge: gate });
    let view = farmView(farm);
    expect(view.fences.h[gate.index]).toBe(VIEW_FENCE.gate);
    expect(view.gates).toContainEqual({ line: 'h', index: gate.index, open: false, kind: 'swing' });
    view = farmView(act(farm, { type: 'setGate', edge: gate, open: true }));
    expect(view.gates).toContainEqual({ line: 'h', index: gate.index, open: true, kind: 'swing' });

    const tape = vEdge(y0 + 1, x0);
    expect(view.fences.v[tape.index]).toBe(VIEW_FENCE.tape);
    const down = knockDownTape(farm.layout, tape);
    if (!down.ok) throw new Error(down.message);
    const lying = farmView({ ...farm, layout: down.layout });
    expect(lying.fences.v[tape.index]).toBe(VIEW_FENCE.tapeDown);
  });

  it('the yards are the only building in the list, on the yards square', () => {
    const farm = scratchFarm();
    const view = farmView(farm);
    expect(view.buildings).toHaveLength(1);
    expect(view.buildings[0]!.kind).toBe('yards');
    expect(view.buildings).toEqual([{ kind: 'yards', cell: farm.buildings.yards }]);
  });

  it('a mob in the feedlot is listed off pasture, so the map does not draw it', () => {
    let farm = openFarm('nsw');
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 10,
      to: { cell: farm.layout.water.bore },
    });
    farm = act(farm, { type: 'moveMob', mob: farm.mobs[0]!.id, to: 'lot' });
    const mob = farmView(farm).mobs[0]!;
    expect(mob.where).toBe('lot');
    expect(mob.area).toBe(-1);
    expect(mob.anchor).toBe(-1);
    expect(mob.status.noWater).toBe(false);
  });

  it("the date and the day's first and last light are today's", () => {
    const farm = runningFarm(2, 'wv', 30);
    const view = farmView(farm);
    const date = dateAt(farm.start, farm.day);
    expect(view.date).toEqual(date);
    const light = daylightFor(DISTRICT_PLACES.wv, date);
    expect(view.light.first).toBe(Math.round(light.firstLight));
    expect(view.light.last).toBe(Math.round(light.lastLight));
    expect(view.light.last).toBeGreaterThan(view.light.first);
  });

  it('a paddock that is part crop and part pasture lists both parts with their areas', () => {
    const farm = createFarm({
      seed: 21,
      district: 'cw',
      size: 'medium',
      start: { year: 2023, month: 4 },
      startType: 'running',
      mixed: { arablePct: 40, croppedPct: 60 },
      difficulty: 'medium',
    });
    for (let d = 0; d < 30; d++) stepDay(farm);
    const view = farmView(farm);
    const split = view.paddocks.filter((p) => p.parts.length > 1);
    expect(split.length).toBeGreaterThan(0);
    for (const p of split) {
      const ha = p.parts.reduce((t, part) => t + part.ha, 0);
      expect(ha).toBeCloseTo(p.ha, 0);
      for (const part of p.parts) {
        if (part.planting >= 0) expect(view.plantings[part.planting]).toBeDefined();
      }
    }
    // A paddock of one kind of country lists no parts: never a list of one.
    expect(view.paddocks.every((p) => p.parts.length !== 1)).toBe(true);
    const grazingOnly = farmView(runningFarm());
    expect(grazingOnly.paddocks.every((p) => p.parts.length === 0)).toBe(true);
  });
});

describe('the farm view of a farm that plays real years', () => {
  const data = loadRealData();
  const realFarm = (): FarmState =>
    createFarm(
      {
        seed: 7,
        district: 'cw',
        size: 'small',
        start: { year: 2025, month: 0 },
        startType: 'running',
        difficulty: 'medium',
        years: { kind: 'real', order: 'in-order' },
      },
      { data },
    );

  it('needs the real data, as every read of the weather does', () => {
    expect(() => farmView(realFarm())).toThrow(/real/);
  });

  it('reports the real date and the light of that date, not the farm calendar', () => {
    const farm = realFarm();
    // In order from 2025 the year after is 1997.
    for (let d = 0; d < 366; d++) stepDay(farm, { data });
    const view = farmView(farm, { data });
    expect(view.date).toEqual(dateOn(farm));
    expect(view.date.year).toBe(1997);
    expect(dateAt(farm.start, farm.day).year).toBe(2026);
    const light = daylightFor(DISTRICT_PLACES.cw, dateOn(farm));
    expect(view.light).toEqual({
      first: Math.round(light.firstLight),
      last: Math.round(light.lastLight),
    });
    expect(problems(view)).toEqual([]);
  });

  it('holds nothing about the years to come', () => {
    const text = JSON.stringify(farmView(realFarm(), { data }));
    for (const word of ['dataVersion', 'firstYear', 'order', 'seed":7', 'indicator']) {
      expect(text.includes(word), word).toBe(false);
    }
  });
});

describe('the farm view stays small', () => {
  /** The budget for a whole farm as JSON text, in bytes. The aim is well under 100 KB. */
  const BUDGET_BYTES = 64_000;

  it('a farm with more than 4,000 head is under 64 KB as JSON', () => {
    const farm = bigHerdFarm();
    const totals = farmTotals(farm);
    expect(totals.head).toBeGreaterThan(4000);
    const view = farmView(farm);
    const bytes = Buffer.byteLength(JSON.stringify(view), 'utf8');
    console.info(
      `Farm view: ${(bytes / 1024).toFixed(1)} KB as JSON with ${totals.head} head in ${view.mobs.length} mobs`,
    );
    expect(bytes).toBeLessThan(BUDGET_BYTES);
    // The herd costs little: the cattle are counted by kind, not listed.
    const mobsBytes = Buffer.byteLength(JSON.stringify(view.mobs), 'utf8');
    expect(mobsBytes).toBeLessThan(8_000);
    expect(view.mobs.reduce((t, m) => t + m.head, 0)).toBe(totals.head);
  });

  it.each(DISTRICT_IDS)('%s: a mixed farm with crops is under the budget too', (id) => {
    const farm = createFarm({
      seed: 8,
      district: id,
      size: 'large',
      start: { year: 2023, month: 5 },
      startType: 'running',
      mixed: { arablePct: id === 'nsw' ? 20 : 40, croppedPct: 60 },
      difficulty: 'medium',
    });
    for (let d = 0; d < 20; d++) stepDay(farm);
    expect(Buffer.byteLength(JSON.stringify(farmView(farm)), 'utf8')).toBeLessThan(BUDGET_BYTES);
  });
});
