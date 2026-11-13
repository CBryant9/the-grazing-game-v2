import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  act,
  actWith,
  boxEdges,
  cellAt,
  expectOneMobPerArea,
  farCorner,
  fixedRng,
  headOn,
  notFinite,
  openFarm,
  refused,
  twoPaddockFarm,
} from '../../test-support/wholeFarm';
import { applyAction } from '../actions/apply';
import type { Action, FenceKind } from '../actions/types';
import { EDGE, getEdge, hEdge, vEdge, type EdgeRef } from '../farm/topology';
import { GRID_N, GRID_W } from '../grid';
import { LAND } from '../pasture/state';
import { rngStream } from '../rng';
import { farmHash } from '../save/save';
import { createFarm } from './create';
import { surveyOf } from './derived';
import type { FarmState } from './state';
import {
  BREAKOUT_CHANCE,
  BREAKOUT_COOLDOWN_DAYS,
  BREAKOUT_FEED_SHARE,
  EATEN_OUT_DAYS,
  stepDay,
} from './tick';

/*
 * The rules of the whole farm, each as a test (BUILD_PLAN 1.2; CLAUDE.md,
 * "things only happen for a reason").
 */

vi.setConfig({ testTimeout: 600_000 });

/** A mob that gets under 85% of the pasture it wants is hungry. Written out here, not read from the engine. */
const HUNGRY_UNDER = 0.85;

const count = (farm: FarmState, code: number): number => {
  let n = 0;
  for (const v of farm.layout.fences.hE) if (v === code) n++;
  for (const v of farm.layout.fences.vE) if (v === code) n++;
  return n;
};

const boreXY = (farm: FarmState): [number, number] => [
  farm.layout.water.bore % GRID_W,
  (farm.layout.water.bore / GRID_W) | 0,
];

// ---------------------------------------------------------------------------
describe('no water kills everything on day 4', () => {
  it.each(DISTRICT_IDS)('%s: cows, calves, steers and bulls all die on the fourth day', (id) => {
    let farm = twoPaddockFarm(id);
    const bore = farm.layout.water.bore;
    const topo = surveyOf(farm).topology;
    const dry = topo.paddocks.find((p) => p.id !== topo.paddockOf[bore])!;
    farm = act(farm, { type: 'buyCattle', cls: 'weanerSteer', qty: 20, to: { cell: bore } });
    const wet = farm.mobs[0]!.id;

    // The warning comes with the action that put them there, as data.
    const first = actWith(farm, {
      type: 'buyCattle',
      cls: 'cowCalf',
      qty: 15,
      to: { cell: dry.cells[0]! },
    });
    farm = first.farm;
    const mob = farm.mobs.find((m) => m.id !== wet)!.id;
    expect(first.events).toContainEqual({
      type: 'no-water',
      mob,
      mobName: farm.mobs.find((m) => m.id === mob)!.name,
      area: dry.name,
    });
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 20, to: { mob } });
    farm = act(farm, { type: 'buyCattle', cls: 'bull', qty: 2, to: { mob } });
    farm = act(farm, { type: 'buyCattle', cls: 'ptic', qty: 10, to: { mob } });
    const head = farm.mobs.find((m) => m.id === mob)!.animals.length;
    expect(head).toBe(15 * 2 + 20 + 2 + 10);

    const notes = (r: ReturnType<typeof stepDay>): number[] =>
      r.events.flatMap((e) =>
        e.type === 'cattle' && e.mob === mob && e.note.type === 'noWater' ? [e.note.days] : [],
      );
    const d1 = stepDay(farm);
    expect(notes(d1)).toEqual([1]);
    const d2 = stepDay(farm);
    expect(notes(d2)).toEqual([]);
    const d3 = stepDay(farm);
    expect(notes(d3)).toEqual([3]);
    // Three days in, they are thirsty and losing 4% of their weight a day, but alive.
    const left = farm.mobs.find((m) => m.id === mob)!;
    expect(left.dry).toBe(3);
    expect(left.animals.length).toBeGreaterThan(head - 3);
    const alive = left.animals.length;

    const d4 = stepDay(farm);
    expect(d4.deaths.length).toBe(alive);
    expect(d4.deaths.every((x) => x.cause === 'noWater' && x.mob === mob)).toBe(true);
    expect(farm.mobs.map((m) => m.id)).toEqual([wet]);
    expect(farm.mobs[0]!.animals.length).toBe(20);
    expect(farm.mobs[0]!.dry).toBe(0);
    expect(farm.year.deaths).toBe(head);
    // The deaths are in the day's events, by mob and cause.
    expect(d4.events).toContainEqual(
      expect.objectContaining({ type: 'deaths', mob, cause: 'noWater', count: alive }),
    );
  });

  it('a mob moved to water, or sent to the feedlot, on day 3 lives', () => {
    for (const to of ['water', 'lot'] as const) {
      let farm = twoPaddockFarm('cw');
      const bore = farm.layout.water.bore;
      const topo = surveyOf(farm).topology;
      const dry = topo.paddocks.find((p) => p.id !== topo.paddockOf[bore])!;
      farm = act(farm, {
        type: 'buyCattle',
        cls: 'yearSteer',
        qty: 30,
        to: { cell: dry.cells[0]! },
      });
      const mob = farm.mobs[0]!.id;
      for (let d = 0; d < 3; d++) stepDay(farm);
      expect(farm.mobs[0]!.dry).toBe(3);
      const moved = actWith(farm, {
        type: 'moveMob',
        mob,
        to: to === 'lot' ? 'lot' : { cell: bore },
      });
      farm = moved.farm;
      expect(moved.events.some((e) => e.type === 'no-water')).toBe(false);
      for (let d = 0; d < 10; d++) stepDay(farm);
      expect(farm.mobs[0]!.dry).toBe(0);
      expect(farm.mobs[0]!.animals.length).toBeGreaterThan(28);
      expect(farm.year.deaths).toBeLessThan(2);
    }
  });

  it('moving a mob onto dry country warns with the paddock, and moving it back does not', () => {
    let farm = twoPaddockFarm('wv');
    const bore = farm.layout.water.bore;
    const topo = surveyOf(farm).topology;
    const dry = topo.paddocks.find((p) => p.id !== topo.paddockOf[bore])!;
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 10, to: { cell: bore } });
    const mob = farm.mobs[0]!.id;
    const out = actWith(farm, { type: 'moveMob', mob, to: { cell: dry.cells[5]! } });
    expect(out.events.map((e) => e.type)).toEqual(['mob-moved', 'no-water']);
    expect(out.events[1]).toMatchObject({ type: 'no-water', mob, area: dry.name });
    const back = actWith(out.farm, { type: 'moveMob', mob, to: { cell: bore } });
    expect(back.events.map((e) => e.type)).toEqual(['mob-moved']);
  });
});

// ---------------------------------------------------------------------------
describe('breakouts: only through tape, only when hungry or thirsty', () => {
  /** A 3 by 3 box of one kind of fence round the bore and its trough, with too many steers in it. */
  function crowded(kind: FenceKind, id: DistrictId = 'nsw', head = 60): FarmState {
    let farm = openFarm(id);
    const [bx, by] = boreXY(farm);
    farm = act(farm, {
      type: 'buildFence',
      edges: boxEdges(bx - 1, by - 1, bx + 1, by + 1),
      fence: kind,
    });
    return act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: head,
      to: { cell: farm.layout.water.bore },
    });
  }

  it.each(DISTRICT_IDS)('%s: hungry cattle push through tape, one segment at a time', (id) => {
    const farm = crowded('tape', id);
    const tape0 = count(farm, EDGE.tape);
    expect(tape0).toBe(12);
    const last = new Map<number, number>();
    let breakouts = 0;
    for (let d = 0; d < 150; d++) {
      const down = count(farm, EDGE.tapeDown);
      const before = farm.layout.fences;
      const hungry = new Map(farm.mobs.map((m) => [m.id, m] as const));
      const r = stepDay(farm);
      const events = r.events.flatMap((e) => (e.type === 'breakout' ? [e] : []));
      // One segment for each mob that broke out, and nothing else changed.
      expect(count(farm, EDGE.tapeDown) - down).toBe(events.length);
      expect(count(farm, EDGE.tape) + count(farm, EDGE.tapeDown)).toBe(tape0);
      for (const e of events) {
        breakouts++;
        expect(getEdge(before, e.edge)).toBe(EDGE.tape);
        expect(getEdge(farm.layout.fences, e.edge)).toBe(EDGE.tapeDown);
        const m = farm.mobs.find((x) => x.id === e.mob) ?? hungry.get(e.mob)!;
        // It was short of feed or out of water: a reason, never for nothing.
        expect(m.st!.f < HUNGRY_UNDER || m.dry > 0).toBe(true);
        expect(e.reason).toBe(m.dry > 0 ? 'thirsty' : 'hungry');
        if (last.has(e.mob)) expect(r.day - last.get(e.mob)!).toBeGreaterThanOrEqual(21);
        last.set(e.mob, r.day);
        expect(m.lastBreak).toBe(r.day);
      }
      expectOneMobPerArea(farm);
    }
    expect(breakouts).toBeGreaterThan(0);
  });

  it.each(['permanent', 'electric'] as const)('%s fence holds, however hungry they get', (kind) => {
    const farm = crowded(kind);
    const fences = farmHash({ ...farm, mobs: [] } as FarmState);
    const hE = farm.layout.fences.hE.slice();
    const vE = farm.layout.fences.vE.slice();
    let hungryDays = 0;
    for (let d = 0; d < 150 && farm.mobs.length; d++) {
      const r = stepDay(farm, { rng: { breakouts: fixedRng(0) } });
      if (farm.mobs[0] && farm.mobs[0].st!.f < HUNGRY_UNDER) hungryDays++;
      expect(r.events.some((e) => e.type === 'breakout')).toBe(false);
      expect(farm.mobs[0]?.lastBreak ?? null).toBeNull();
    }
    expect(hungryDays).toBeGreaterThan(50);
    expect(farm.layout.fences.hE).toEqual(hE);
    expect(farm.layout.fences.vE).toEqual(vE);
    expect(fences).toMatch(/^[0-9a-f]{16}$/);
  });

  it('well-fed cattle with water never push through tape, and the stream is never drawn on', () => {
    let farm = openFarm('wv');
    const [bx, by] = boreXY(farm);
    const x0 = Math.max(0, bx - 6);
    const y0 = Math.max(0, by - 6);
    farm = act(farm, {
      type: 'buildFence',
      edges: boxEdges(x0, y0, x0 + 12, y0 + 12),
      fence: 'tape',
    });
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 6,
      to: { cell: farm.layout.water.bore },
    });
    const stream = farm.rng.breakouts.join();
    for (let d = 0; d < 300; d++) {
      const r = stepDay(farm);
      expect(farm.mobs[0]!.st!.f).toBeGreaterThanOrEqual(HUNGRY_UNDER);
      expect(r.events.some((e) => e.type === 'breakout')).toBe(false);
    }
    expect(count(farm, EDGE.tapeDown)).toBe(0);
    expect(farm.rng.breakouts.join()).toBe(stream);
    expect(farm.mobs[0]!.lastBreak).toBeNull();
  });

  it('thirsty cattle push through tape within days, and the reason given is thirst', () => {
    let out = 0;
    for (let seed = 1; seed <= 12; seed++) {
      let farm = openFarm('cq', { seed });
      const [x0, y0] = farCorner(farm);
      farm = act(farm, {
        type: 'buildFence',
        edges: boxEdges(x0, y0, x0 + 5, y0 + 5),
        fence: 'tape',
      });
      farm = act(farm, {
        type: 'buyCattle',
        cls: 'yearSteer',
        qty: 30,
        to: { cell: cellAt(x0 + 2, y0 + 2) },
      });
      for (let d = 0; d < 3; d++) {
        const r = stepDay(farm);
        for (const e of r.events) {
          if (e.type !== 'breakout') continue;
          expect(e.reason).toBe('thirsty');
          out++;
        }
      }
      expect(count(farm, EDGE.tapeDown)).toBeLessThanOrEqual(1);
    }
    // 37.5% a day for a mob of 30 with no water: most are out inside 3 days.
    expect(out).toBeGreaterThan(5);
    expect(out).toBeLessThan(12);
  });

  it('happens on the first day they are short of feed, not before, when the draw allows', () => {
    const farm = crowded('tape', 'nsw', 30);
    let seen = false;
    for (let d = 0; d < 60 && !seen; d++) {
      const r = stepDay(farm, { rng: { breakouts: fixedRng(0) } });
      const f = farm.mobs[0]!.st!.f;
      const broke = r.events.some((e) => e.type === 'breakout');
      expect(broke).toBe(f < HUNGRY_UNDER);
      seen = broke;
    }
    expect(seen).toBe(true);
  });

  it.each([
    [4, 'hungry', 0.035 * (4 / 20 + 0.3)],
    [24, 'hungry', 0.035 * 1.5],
    [60, 'hungry', 0.035 * 1.5],
    [10, 'thirsty', 0.25 * (10 / 20 + 0.3)],
    [60, 'thirsty', 0.25 * 1.5],
  ] as const)(
    'a mob of %s that is %s breaks out when the draw is up to %s',
    (head, why, chance) => {
      for (const [draw, expected] of [
        [chance - 1e-9, true],
        [chance + 1e-9, false],
      ] as const) {
        let farm: FarmState;
        if (why === 'hungry') {
          farm = crowded('tape', 'nsw', head);
          // A bare box: nothing to eat. One day with breakouts held off.
          farm.pasture.land.fill(LAND.fallow);
          farm.pasture.G.fill(0);
          farm.pasture.D.fill(200);
          stepDay(farm, { rng: { breakouts: fixedRng(1) } });
          expect(farm.mobs[0]!.st!.f).toBeLessThan(HUNGRY_UNDER);
          expect(farm.mobs[0]!.dry).toBe(0);
        } else {
          farm = openFarm('nsw');
          const [x0, y0] = farCorner(farm);
          farm = act(farm, {
            type: 'buildFence',
            edges: boxEdges(x0, y0, x0 + 5, y0 + 5),
            fence: 'tape',
          });
          farm = act(farm, {
            type: 'buyCattle',
            cls: 'yearSteer',
            qty: head,
            to: { cell: cellAt(x0 + 2, y0 + 2) },
          });
        }
        expect(farm.mobs[0]!.animals.length).toBe(head);
        const r = stepDay(farm, { rng: { breakouts: fixedRng(draw) } });
        expect(
          r.events.some((e) => e.type === 'breakout'),
          `${head} head, draw ${draw}`,
        ).toBe(expected);
      }
      expect(BREAKOUT_CHANCE).toEqual({ hungry: 0.035, thirsty: 0.25 });
    },
  );

  it('a mob waits 21 days before it pushes through tape again', () => {
    // Three 2 by 2 cells in a row inside a permanent fence, divided by tape.
    let farm = openFarm('nsw');
    const [bx, by] = boreXY(farm);
    const x0 = Math.min(GRID_W - 7, Math.max(1, bx - 1));
    const y0 = by;
    farm = act(farm, {
      type: 'buildFence',
      edges: boxEdges(x0, y0, x0 + 5, y0 + 1),
      fence: 'permanent',
    });
    const dividers: EdgeRef[] = [
      vEdge(y0, x0 + 2),
      vEdge(y0 + 1, x0 + 2),
      vEdge(y0, x0 + 4),
      vEdge(y0 + 1, x0 + 4),
    ];
    farm = act(farm, { type: 'buildFence', edges: dividers, fence: 'tape' });
    expect(surveyOf(farm).topology.areas.length).toBe(4);
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 80,
      to: { cell: farm.layout.water.bore },
    });
    // Bare ground inside the fence, so they are hungry every day.
    for (let y = y0; y <= y0 + 1; y++) {
      for (let x = x0; x <= x0 + 5; x++) {
        farm.pasture.land[cellAt(x, y)] = LAND.fallow;
        farm.pasture.G[cellAt(x, y)] = 0;
        farm.pasture.D[cellAt(x, y)] = 200;
      }
    }
    const days: number[] = [];
    for (let d = 0; d < 60; d++) {
      const r = stepDay(farm, { rng: { breakouts: fixedRng(0) } });
      // Hungry every day, and the draw would always let them out.
      expect(farm.mobs[0]!.st!.f).toBeLessThan(HUNGRY_UNDER);
      if (r.events.some((e) => e.type === 'breakout')) days.push(r.day);
    }
    expect(days).toEqual([0, 21]);
    expect(BREAKOUT_COOLDOWN_DAYS).toBe(21);
    expect(BREAKOUT_FEED_SHARE).toBe(0.85);
    expect(farm.mobs[0]!.animals.length).toBeGreaterThan(70);
    expect(count(farm, EDGE.tapeDown)).toBe(2);
    expect(count(farm, EDGE.tape)).toBe(2);
    // The permanent fence round them never moved.
    expect(count(farm, EDGE.permanent)).toBe(16);
  });

  it('when tape goes down between two mobs they run as one', () => {
    let farm = openFarm('nsw');
    const [bx, by] = boreXY(farm);
    const x0 = Math.min(GRID_W - 7, Math.max(1, bx - 1));
    farm = act(farm, {
      type: 'buildFence',
      edges: boxEdges(x0, by, x0 + 3, by + 1),
      fence: 'permanent',
    });
    const left = bx - x0 < 2;
    farm = act(farm, {
      type: 'buildFence',
      edges: [vEdge(by, x0 + 2), vEdge(by + 1, x0 + 2)],
      fence: 'tape',
    });
    const other = cellAt(left ? x0 + 3 : x0, by);
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 50,
      to: { cell: farm.layout.water.bore },
    });
    farm = act(farm, { type: 'buyCattle', cls: 'weanerSteer', qty: 8, to: { cell: other } });
    expect(farm.mobs.length).toBe(2);
    const big = farm.mobs[0]!.id;
    const ids = farm.mobs.flatMap((m) => m.animals.map((a) => a.id)).sort((a, b) => a - b);
    const r = stepDay(farm, { rng: { breakouts: fixedRng(0) } });
    const types = r.events.map((e) => e.type);
    expect(types).toContain('breakout');
    expect(types).toContain('mobs-joined');
    expect(farm.mobs.length).toBe(1);
    // The bigger mob keeps its name, and nobody is lost.
    expect(farm.mobs[0]!.id).toBe(big);
    expect(farm.mobs[0]!.animals.map((a) => a.id).sort((a, b) => a - b)).toEqual(ids);
    expectOneMobPerArea(farm);
  });
});

// ---------------------------------------------------------------------------
describe('one mob per grazing area after any gate or fence change', () => {
  it.each(DISTRICT_IDS)('%s: 150 random jobs and days on a running farm', (id) => {
    let farm = createFarm({
      seed: 60 + DISTRICT_IDS.indexOf(id),
      district: id,
      size: 'small',
      start: { year: 2023, month: 2 },
      startType: 'running',
      difficulty: 'easy',
      money: { cash: 5e6, overdraft: -5e6, broke: -1e7 },
    });
    const rng = rngStream(3, 'jobs:' + id);
    const everyone = (): string =>
      farm.mobs
        .flatMap((m) => m.animals.map((a) => a.id))
        .sort((a, b) => a - b)
        .join();
    const edgesWith = (codes: readonly number[]): EdgeRef[] => {
      const out: EdgeRef[] = [];
      farm.layout.fences.hE.forEach((v, index) => {
        if (codes.includes(v)) out.push({ line: 'h', index });
      });
      farm.layout.fences.vE.forEach((v, index) => {
        if (codes.includes(v)) out.push({ line: 'v', index });
      });
      return out;
    };
    const line = (): EdgeRef[] => {
      // One line in three runs right across the farm, so it divides whatever it crosses.
      if (rng.chance(0.33)) {
        if (rng.chance(0.5)) {
          const vy = rng.int(1, 25);
          return Array.from({ length: GRID_W }, (_, x) => hEdge(vy, x));
        }
        const vx = rng.int(1, 39);
        return Array.from({ length: 26 }, (_, y) => vEdge(y, vx));
      }
      const len = rng.int(2, 14);
      if (rng.chance(0.5)) {
        const vy = rng.int(1, 25);
        const x = rng.int(0, GRID_W - len);
        return Array.from({ length: len }, (_, k) => hEdge(vy, x + k));
      }
      const vx = rng.int(1, 39);
      const y = rng.int(0, 26 - len);
      return Array.from({ length: Math.min(len, 26 - y) }, (_, k) => vEdge(y + k, vx));
    };
    const done = new Map<string, number>();
    let splits = 0;
    let joins = 0;
    for (let k = 0; k < 150; k++) {
      const gates = edgesWith([EDGE.gateShut, EDGE.gateOpen]);
      const fence = edgesWith([EDGE.permanent, EDGE.electric, EDGE.tape]);
      const down = edgesWith([EDGE.tapeDown, EDGE.electricDown]);
      const jobs: Action[] = [
        { type: 'buildFence', edges: line(), fence: rng.pick(['permanent', 'electric', 'tape']) },
        { type: 'removeFence', edges: line() },
      ];
      if (gates.length) {
        const edge = rng.pick(gates);
        jobs.push({ type: 'setGate', edge, open: getEdge(farm.layout.fences, edge) === 4 });
        jobs.push({ type: 'setGate', edge: rng.pick(gates), open: rng.chance(0.5) });
        jobs.push({ type: 'removeGate', edge: rng.pick(gates) });
      }
      if (fence.length) {
        jobs.push({ type: 'placeGate', edge: rng.pick(fence) });
        jobs.push({ type: 'removeFence', edges: [rng.pick(fence)] });
      }
      if (down.length) jobs.push({ type: 'fixFence', edge: rng.pick(down) });
      const tape = edgesWith([EDGE.tape, EDGE.tapeDown]);
      if (tape.length) jobs.push({ type: 'rollUpTape', edge: rng.pick(tape) });
      jobs.push({ type: 'placeSquareHub', cell: rng.pick(farm.layout.water.troughs) });
      const job = rng.pick(jobs);
      const before = everyone();
      const out = applyAction(farm, job);
      if (out.ok) {
        farm = out.farm;
        done.set(job.type, (done.get(job.type) ?? 0) + 1);
        for (const e of out.events) {
          if (e.type === 'mob-split') splits++;
          if (e.type === 'mobs-joined') joins++;
        }
        expect(everyone(), `after ${job.type} ${k}`).toBe(before);
      }
      expectOneMobPerArea(farm, `after ${job.type} ${k}`);
      // A calf is with its dam.
      for (const m of farm.mobs) {
        const here = new Set(m.animals.map((a) => a.id));
        for (const a of m.animals) {
          if (a.kind === 'calf' && a.dam) expect(here.has(a.dam), `calf ${a.id}`).toBe(true);
        }
      }
      if (k % 5 === 4) {
        stepDay(farm);
        expectOneMobPerArea(farm, `after day ${farm.day}`);
      }
    }
    // The run did real work: fences built and pulled down, gates opened and shut, mobs split and joined.
    for (const type of ['buildFence', 'removeFence', 'setGate', 'placeGate']) {
      expect(done.get(type) ?? 0, type).toBeGreaterThan(3);
    }
    expect(splits).toBeGreaterThan(2);
    expect(joins).toBeGreaterThan(2);
    expect(headOn(farm)).toBeGreaterThan(50);
    expect(notFinite(farm)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('fallow only after a crop, and a finished crop never regrows', () => {
  it.each(DISTRICT_IDS)(
    '%s: two years on a mixed farm, some crops harvested and some left',
    (id) => {
      let farm = createFarm({
        seed: 30 + DISTRICT_IDS.indexOf(id),
        district: id,
        size: 'small',
        start: { year: 2022, month: [10, 4, 5, 4][DISTRICT_IDS.indexOf(id)]! },
        startType: 'running',
        mixed: { arablePct: id === 'nsw' ? 20 : 40, croppedPct: 60 },
        difficulty: 'easy',
        money: { cash: 5e6, overdraft: -5e6, broke: -1e7 },
      });
      const startFallow = new Set<number>();
      for (let i = 0; i < GRID_N; i++) if (farm.pasture.land[i] === LAND.fallow) startFallow.add(i);
      expect(startFallow.size).toBeGreaterThan(0);
      const cropped = new Uint8Array(GRID_N);
      for (let i = 0; i < GRID_N; i++) if (farm.pasture.land[i]! >= LAND.annual) cropped[i] = 1;

      let toStubble = 0;
      let toFallow = 0;
      let harvests = 0;
      let lost = 0;
      let selfSown = 0;
      for (let d = 0; d < 730; d++) {
        const before = farm.pasture.land.slice();
        const r = stepDay(farm);
        const after = farm.pasture.land;
        const regen = r.events.some((e) => e.type === 'crop' && e.event.type === 'self-sown');
        if (regen) selfSown++;
        for (let i = 0; i < GRID_N; i++) {
          const a = after[i]!;
          const b = before[i]!;
          if (a >= LAND.fallow && farm.crops.fid[i]! < 0) {
            // Fallow and stubble with nothing sown: no green feed and no growth, ever.
            expect(farm.pasture.G[i], `G on square ${i}, day ${r.day}`).toBe(0);
            expect(farm.pasture.grown[i], `growth on square ${i}, day ${r.day}`).toBe(0);
          }
          if (a === b) continue;
          if (a === LAND.fallow) {
            // Fallow only comes from stubble that has broken down.
            expect(b, `square ${i} went fallow on day ${r.day}`).toBe(LAND.stubble);
            toFallow++;
          } else if (a === LAND.stubble) {
            // Stubble only comes from a forage or crop that finished.
            expect(b === LAND.annual || b === LAND.crop, `square ${i} day ${r.day}`).toBe(true);
            expect(cropped[i]).toBe(1);
            toStubble++;
          } else if (a === LAND.annual || a === LAND.crop) {
            // Nothing is sown by the tick but seed coming up, and only on bare cropping country or native.
            expect(regen, `square ${i} day ${r.day}`).toBe(true);
            expect(b === LAND.native || b >= LAND.fallow).toBe(true);
            cropped[i] = 1;
          } else {
            // Back to native pasture only off arable land.
            expect(a).toBe(LAND.native);
            expect(farm.crops.arable[i]).toBe(0);
          }
        }
        for (const e of r.events) {
          if (e.type !== 'crop') continue;
          if (e.event.type === 'not-harvested') lost++;
          if (e.event.type === 'harvest-ready' && e.event.fieldId % 2 === 0) {
            const field = e.event.fieldId;
            farm = act(farm, { type: 'harvest', field });
            harvests++;
            // No crop is left where it was harvested, and none of its notices come later.
            expect(farm.crops.fields.some((f) => f.id === field)).toBe(false);
          }
        }
        // Re-sow the district's first rotation crop when its window opens, so the rotation carries on.
        for (const e of r.events) {
          if (e.type === 'crop' && e.event.type === 'sowing-window') {
            const cells: number[] = [];
            for (let i = 0; i < GRID_N; i++) {
              if (farm.pasture.land[i]! >= LAND.fallow && i % 3 === 0) cells.push(i);
            }
            const out = applyAction(farm, { type: 'sow', species: e.event.sp, cells });
            if (out.ok) {
              farm = out.farm;
              for (const i of cells) if (farm.crops.fid[i]! >= 0) cropped[i] = 1;
            }
          }
        }
      }
      // Land that was never cropped is never fallow or stubble.
      for (let i = 0; i < GRID_N; i++) {
        if (!cropped[i] && !startFallow.has(i))
          expect(farm.pasture.land[i]).toBeLessThan(LAND.annual);
      }
      expect(toStubble).toBeGreaterThan(0);
      expect(toFallow + harvests + lost).toBeGreaterThan(0);
      expect(notFinite(farm)).toEqual([]);
      expect(selfSown).toBeGreaterThanOrEqual(0);
    },
  );

  it('after a harvest the stubble grows nothing and gives no crop notices', () => {
    let farm = createFarm({
      seed: 4,
      district: 'cw',
      size: 'small',
      start: { year: 2022, month: 5 },
      startType: 'scratch',
      mixed: { arablePct: 40, croppedPct: 50 },
      difficulty: 'easy',
      money: { cash: 5e6, overdraft: -5e6, broke: -1e7 },
    });
    let cells: number[] = [];
    let field = -1;
    for (let d = 0; d < 260 && field < 0; d++) {
      for (const e of stepDay(farm).events) {
        if (e.type === 'crop' && e.event.type === 'harvest-ready') field = e.event.fieldId;
      }
    }
    expect(field).toBeGreaterThan(0);
    cells = farm.crops.fields.find((f) => f.id === field)!.cells.slice();
    farm = act(farm, { type: 'harvest', field });
    for (const i of cells) {
      expect(farm.pasture.land[i]).toBe(LAND.stubble);
      expect(farm.pasture.G[i]).toBe(0);
      expect(farm.pasture.D[i]).toBeGreaterThanOrEqual(1500);
      expect(farm.pasture.D[i]).toBeLessThanOrEqual(3500);
    }
    let dead = farm.pasture.D[cells[0]!]!;
    for (let d = 0; d < 200; d++) {
      const r = stepDay(farm);
      for (const e of r.events) {
        if (e.type === 'crop' && 'fieldId' in e.event) expect(e.event.fieldId).not.toBe(field);
      }
      for (const i of cells) expect(farm.pasture.G[i]).toBe(0);
      // The straw only breaks down.
      expect(farm.pasture.D[cells[0]!]!).toBeLessThan(dead);
      dead = farm.pasture.D[cells[0]!]!;
    }
    // A harvested crop can't be harvested twice.
    expect(refused(farm, { type: 'harvest', field }).reason).toBe('no-such-planting');
  });
});

// ---------------------------------------------------------------------------
describe('the same seed and the same actions give the same farm', () => {
  const script = (seed: number): string[] => {
    let farm = createFarm({
      seed,
      district: 'cw',
      size: 'small',
      start: { year: 2024, month: 3 },
      startType: 'running',
      mixed: { arablePct: 20, croppedPct: 50 },
      difficulty: 'easy',
    });
    const hashes = [farmHash(farm)];
    const bore = farm.layout.water.bore;
    const [x0, y0] = farCorner(farm);
    const jobs: [number, Action][] = [
      [3, { type: 'buyCattle', cls: 'weanerSteer', qty: 40, to: { cell: bore } }],
      [10, { type: 'buildFence', edges: boxEdges(x0, y0, x0 + 3, y0 + 3), fence: 'tape' }],
      [11, { type: 'placePortable', cell: cellAt(x0 + 1, y0 + 1) }],
      [20, { type: 'sellClass', cls: 'wean', qty: 10 }],
      [30, { type: 'setGate', edge: gateOf(farm), open: true }],
      [45, { type: 'setGate', edge: gateOf(farm), open: false }],
      [60, { type: 'sellClass', cls: 'cow', qty: 5 }],
    ];
    for (let d = 0; d < 120; d++) {
      for (const [day, job] of jobs) {
        if (day === d) farm = act(farm, job);
      }
      stepDay(farm);
      if (d % 10 === 0) hashes.push(farmHash(farm));
    }
    hashes.push(farmHash(farm));
    return hashes;
  };
  const gateOf = (farm: FarmState): EdgeRef => {
    const v = farm.layout.fences.vE.indexOf(EDGE.gateShut);
    return v >= 0
      ? { line: 'v', index: v }
      : { line: 'h', index: farm.layout.fences.hE.indexOf(EDGE.gateShut) };
  };

  it('the hash is the same at every step of a second run, and different for another seed', () => {
    const a = script(5);
    const b = script(5);
    const c = script(6);
    expect(b).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
    for (let k = 0; k < a.length; k++) expect(c[k]).not.toBe(a[k]);
  });

  it('an action never changes the farm it was given', () => {
    const farm = createFarm({
      seed: 9,
      district: 'nsw',
      size: 'small',
      start: { year: 2024, month: 3 },
      startType: 'running',
      difficulty: 'easy',
    });
    const before = farmHash(farm);
    const mob = farm.mobs[0]!.id;
    const jobs: Action[] = [
      { type: 'buyCattle', cls: 'bull', qty: 1, to: { mob } },
      { type: 'sellGroup', mob, group: 'cowP', qty: 3 },
      { type: 'moveMob', mob, to: 'lot' },
      { type: 'setSupplement', mob, supp: 'hay' },
      { type: 'markCalves', mob },
      { type: 'placePortable', cell: 5 },
      { type: 'buildFence', edges: boxEdges(3, 3, 6, 6), fence: 'electric' },
      { type: 'buyCattle', cls: 'bull', qty: 100000, to: { mob } },
    ];
    let ok = 0;
    for (const job of jobs) {
      const out = applyAction(farm, job);
      if (out.ok) {
        ok++;
        expect(farmHash(out.farm)).not.toBe(before);
        expect(out.farm.actionLog.at(-1)).toEqual({ day: 0, action: job });
      }
      expect(farmHash(farm), job.type).toBe(before);
    }
    expect(ok).toBeGreaterThan(5);
    expect(farm.actionLog).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('game over', () => {
  it('the bank takes the farm when cash reaches its limit, to the dollar', () => {
    for (const [cash, over] of [
      [-99_965, true],
      [-99_960, false],
    ] as const) {
      const farm = openFarm('nsw', { money: { cash, overdraft: -80_000, broke: -100_000 } });
      // One day's overheads and interest on a 260 ha farm come to about $37.
      const r = stepDay(farm);
      expect(farm.cash).toBeLessThan(cash - 30);
      expect(farm.cash).toBeGreaterThan(cash - 45);
      expect(farm.cash <= farm.broke).toBe(over);
      expect(farm.over).toEqual(over ? { reason: 'bank', day: 1 } : null);
      expect(r.events.some((e) => e.type === 'game-over' && e.reason === 'bank')).toBe(over);
    }
    // Exactly on the limit counts.
    const farm = openFarm('nsw', { money: { cash: 0, overdraft: -80_000, broke: -100_000 } });
    stepDay(farm);
    const cost = -farm.cash;
    const edge = openFarm('nsw', { money: { cash: 0, overdraft: -80_000, broke: -cost } });
    stepDay(edge);
    expect(edge.cash).toBe(edge.broke);
    expect(edge.over).toEqual({ reason: 'bank', day: 1 });
  });

  it('nothing more happens on a farm once the game is over', () => {
    const farm = openFarm('nsw', { money: { cash: -99_990, overdraft: -80_000, broke: -100_000 } });
    stepDay(farm);
    expect(farm.over).not.toBeNull();
    const hash = farmHash(farm);
    const r = stepDay(farm);
    expect(r.ran).toBe(false);
    expect(r.events).toEqual([]);
    expect(farmHash(farm)).toBe(hash);
    const no = refused(farm, { type: 'placePortable', cell: 3 });
    expect(no.reason).toBe('game-over');
  });

  /** A bare farm: every square fallow with a set amount of dead feed, and cattle in one small box. */
  function bare(dead: number, head = 5): FarmState {
    let farm = openFarm('nsw');
    const [bx, by] = boreXY(farm);
    farm = act(farm, { type: 'buildFence', edges: boxEdges(bx, by, bx, by), fence: 'permanent' });
    if (head) {
      farm = act(farm, {
        type: 'buyCattle',
        cls: 'yearSteer',
        qty: head,
        to: { cell: farm.layout.water.bore },
      });
    }
    farm.pasture.land.fill(LAND.fallow);
    farm.pasture.G.fill(0);
    farm.pasture.D.fill(dead);
    return farm;
  }

  it('the farm counts as eaten out when the feed cattle can reach averages under 40 kg DM/ha', () => {
    // Fallow loses 3% of its dead feed a day, so after a day D x 0.97 - 250 is what can be reached.
    const under = bare(298.4);
    const r = stepDay(under);
    expect(under.noFeedDays).toBe(1);
    expect(r.events).toContainEqual({ type: 'out-of-feed', daysLeft: 9 });
    const over = bare(299.6);
    const r2 = stepDay(over);
    expect(over.noFeedDays).toBe(0);
    expect(r2.events.some((e) => e.type === 'out-of-feed')).toBe(false);
  });

  it('ten days eaten out with cattle on the farm ends the game, and the warning comes on day 1', () => {
    const farm = bare(260);
    const warned: number[] = [];
    for (let d = 1; d <= 10; d++) {
      const r = stepDay(farm);
      if (r.events.some((e) => e.type === 'out-of-feed')) warned.push(d);
      expect(farm.noFeedDays).toBe(d);
      expect(farm.over).toEqual(d < 10 ? null : { reason: 'feed', day: 10 });
      expect(r.events.some((e) => e.type === 'game-over' && e.reason === 'feed')).toBe(d === 10);
    }
    expect(warned).toEqual([1]);
    expect(EATEN_OUT_DAYS).toBe(10);
  });

  it('the count starts again when the cattle go to the feedlot, are sold, or the feed comes back', () => {
    for (const way of ['lot', 'sold', 'feed'] as const) {
      let farm = bare(260);
      for (let d = 0; d < 9; d++) stepDay(farm);
      expect(farm.noFeedDays).toBe(9);
      const mob = farm.mobs[0]!.id;
      if (way === 'lot') farm = act(farm, { type: 'moveMob', mob, to: 'lot' });
      if (way === 'sold') farm = act(farm, { type: 'sellGroup', mob, group: 'steer', qty: 99 });
      if (way === 'feed') farm.pasture.D.fill(2000);
      stepDay(farm);
      expect(farm.noFeedDays, way).toBe(0);
      expect(farm.over, way).toBeNull();
      for (let d = 0; d < 12; d++) stepDay(farm);
      expect(farm.over, way).toBeNull();
    }
  });

  it('a bare farm with no cattle on it is never eaten out', () => {
    const farm = bare(100, 0);
    for (let d = 0; d < 15; d++) stepDay(farm);
    expect(farm.noFeedDays).toBe(0);
    expect(farm.over).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('a year in each district finishes with no NaN anywhere', () => {
  it.each(DISTRICT_IDS)('%s: 400 days on running farms, a mixed one and a hard one', (id) => {
    const k = DISTRICT_IDS.indexOf(id);
    for (const [seed, mixed, difficulty] of [
      [70 + k, undefined, 'medium'],
      [80 + k, { arablePct: id === 'nsw' ? 20 : 40, croppedPct: 50 }, 'hard'],
    ] as const) {
      const farm = createFarm({
        seed,
        district: id,
        size: 'medium',
        start: { year: 2023, month: (seed * 5) % 12 },
        startType: 'running',
        mixed,
        difficulty,
      });
      let events = 0;
      for (let d = 0; d < 400 && !farm.over; d++) {
        const r = stepDay(farm);
        events += r.events.length;
        if (d % 50 === 0) expect(notFinite(farm), `${id} seed ${seed} day ${d}`).toEqual([]);
        expect(notFinite(r.events, 'events')).toEqual([]);
      }
      expect(notFinite(farm), `${id} seed ${seed}`).toEqual([]);
      expect(farm.day === 400 || farm.over !== null).toBe(true);
      if (!farm.over) {
        expect(farm.years.length).toBe(1);
        expect(farm.years[0]!.end).toBe(365);
        expect(farm.year.start).toBe(365);
        expect(farm.years[0]!.grown).toBeGreaterThan(0);
        expect(farm.years[0]!.eaten).toBeGreaterThan(0);
        expect(farm.years[0]!.covers.length).toBe(12);
      }
      expect(events).toBeGreaterThan(5);
      expect(farm.inbox.length).toBeLessThanOrEqual(120);
    }
  });
});

// ---------------------------------------------------------------------------
describe('stock held in the yards (a stand-in until yard work is built)', () => {
  it('have water, graze only the square the yards are on, and stay apart from the paddock mob', () => {
    let farm = openFarm('nsw');
    const bore = farm.layout.water.bore;
    farm = act(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 80, to: { cell: bore } });
    farm = act(farm, {
      type: 'moveCattle',
      picks: [{ mob: farm.mobs[0]!.id, cls: 'yearlingSteer', qty: 60 }],
      to: 'lot',
    });
    const held = farm.mobs.find((m) => m.where.kind === 'lot')!;
    held.where = { kind: 'yards' };
    const yards = farm.buildings.yards;
    const grazedBefore = farm.pasture.lastG.slice();
    for (let d = 0; d < 6; d++) {
      const r = stepDay(farm);
      expect(r.deaths).toEqual([]);
      expect(r.events.some((e) => e.type === 'cattle' && e.note.type === 'noWater')).toBe(false);
    }
    // Six days in the yards and nobody has gone thirsty.
    expect(farm.mobs.length).toBe(2);
    const m = farm.mobs.find((x) => x.where.kind === 'yards')!;
    expect(m.dry).toBe(0);
    expect(m.animals.length).toBe(60);
    expect(m.st!.me).not.toBe(11.6);
    // They grazed the yards square down to what cattle leave behind. The rest of the farm still has its feed.
    expect(grazedBefore[yards]).toBeLessThan(0);
    expect(farm.pasture.lastG[yards]).toBeGreaterThanOrEqual(0);
    const mass = (i: number): number => farm.pasture.G[i]! + farm.pasture.D[i]!;
    expect(mass(yards)).toBeLessThan(450);
    expect(mass(farm.buildings.homestead)).toBeGreaterThan(2 * mass(yards));
    expectOneMobPerArea(farm);
    // One square is not enough for 60 steers: they are short of feed.
    expect(m.st!.f).toBeLessThan(0.5);
  });
});
