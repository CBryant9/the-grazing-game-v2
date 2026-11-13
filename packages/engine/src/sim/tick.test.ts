import { describe, expect, it, vi } from 'vitest';
import { PLENTY, act, boxCells, boxEdges, fixedRng, openFarm } from '../../test-support/wholeFarm';
import { dateAt } from '../calendar';
import { EDGE, getEdge, hEdge, vEdge } from '../farm/topology';
import { GRID_W } from '../grid';
import { LAND } from '../pasture/state';
import { createFarm } from './create';
import { seasonsOf } from './derived';
import type { FarmEvent } from './events';
import { cloneFarm, type FarmState } from './state';
import { stepDay } from './tick';

/*
 * Details of the daily tick that a long random run only meets by luck:
 * the day a new season is reported, the inbox, and both sides of the line
 * between "hungry" and "not hungry".
 */

vi.setConfig({ testTimeout: 600_000 });

const boreXY = (farm: FarmState): [number, number] => [
  farm.layout.water.bore % GRID_W,
  (farm.layout.water.bore / GRID_W) | 0,
];

describe('the new season', () => {
  it('is reported on 1 July, and on no other day', () => {
    const farm = openFarm('nsw', { start: { year: 2023, month: 8 } });
    const days: number[] = [];
    const reported: FarmEvent[] = [];
    for (let d = 0; d < 700; d++) {
      const r = stepDay(farm);
      for (const e of r.events) {
        if (e.type !== 'new-season') continue;
        days.push(r.day);
        reported.push(e);
      }
    }
    expect(days.map((d) => dateAt(farm.start, d))).toEqual([
      { year: 2024, month: 6, date: 1 },
      { year: 2025, month: 6, date: 1 },
    ]);
    // The event carries the season the farm now runs on.
    const f = seasonsOf(farm).factorsOn(days[0]!);
    expect(reported[0]).toEqual({ type: 'new-season', label: f.label, factor: f.seasonF });
    const before = seasonsOf(farm).factorsOn(days[0]! - 1);
    const after = seasonsOf(farm).factorsOn(days[1]!);
    expect(new Set([before.label, f.label, after.label]).size).toBeGreaterThan(0);
  });

  it('is not reported on the first day of a farm that starts on 1 July', () => {
    const farm = openFarm('nsw', { start: { year: 2023, month: 6 } });
    const first = stepDay(farm);
    expect(first.day).toBe(0);
    expect(first.events.some((e) => e.type === 'new-season')).toBe(false);
    const days: number[] = [];
    for (let d = 1; d < 400; d++) {
      const r = stepDay(farm);
      if (r.events.some((e) => e.type === 'new-season')) days.push(r.day);
    }
    // 1 July 2024 is 366 days on: 2024 is a leap year.
    expect(days).toEqual([366]);
  });
});

describe('the inbox', () => {
  const running = (): FarmState =>
    createFarm({
      seed: 12,
      district: 'cw',
      size: 'small',
      start: { year: 2023, month: 5 },
      startType: 'running',
      mixed: { arablePct: 40, croppedPct: 50 },
      difficulty: 'easy',
      money: { ...PLENTY },
    });

  it('gets every event of every day, with its day, numbered on from the last', () => {
    const farm = running();
    const all: { day: number; event: FarmEvent }[] = [];
    for (let d = 0; d < 40 && all.length < 100; d++) {
      const r = stepDay(farm);
      for (const event of r.events) all.push({ day: r.day, event });
    }
    expect(all.length).toBeGreaterThan(5);
    expect(farm.inbox.length).toBe(all.length + 1);
    expect(farm.inbox[0]!.event.type).toBe('farm-started');
    expect(farm.inbox.slice(1).map((m) => ({ day: m.day, event: m.event }))).toEqual(all);
    expect(farm.inbox.map((m) => m.seq)).toEqual(farm.inbox.map((_, k) => k + 1));
    expect(farm.inboxSeq).toBe(farm.inbox.length + 1);
  });

  it('keeps the newest 120', () => {
    const farm = running();
    let last: FarmEvent | null = null;
    let total = 1;
    for (let d = 0; d < 3000 && total < 200; d++) {
      const r = stepDay(farm);
      total += r.events.length;
      if (r.events.length) last = r.events.at(-1)!;
    }
    expect(total).toBeGreaterThan(150);
    expect(farm.inbox.length).toBe(120);
    expect(farm.inbox.at(-1)!.event).toEqual(last);
    expect(farm.inbox.at(-1)!.seq).toBe(total);
    expect(farm.inbox[0]!.seq).toBe(total - 119);
    expect(farm.inboxSeq).toBe(total + 1);
  });
});

describe('hungry is under 85% of the pasture a mob wanted', () => {
  /** Steers in a 3 by 3 box of tape round the bore. The box is bare, with a set amount of dead feed. */
  function boxed(): { farm: FarmState; cells: number[] } {
    let farm = openFarm('nsw');
    const [bx, by] = boreXY(farm);
    farm = act(farm, {
      type: 'buildFence',
      edges: boxEdges(bx - 1, by - 1, bx + 1, by + 1),
      fence: 'tape',
    });
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 30,
      to: { cell: farm.layout.water.bore },
    });
    return { farm, cells: boxCells(bx - 1, by - 1, bx + 1, by + 1) };
  }

  /** One day in the box with `dead` kg DM/ha on it, the draw always letting a hungry mob out. */
  const base = boxed();
  function dayWith(dead: number): { f: number; broke: boolean } {
    const farm = cloneFarm(base.farm);
    const cells = base.cells;
    for (const i of cells) {
      farm.pasture.land[i] = LAND.fallow;
      farm.pasture.G[i] = 0;
      farm.pasture.D[i] = dead;
    }
    const r = stepDay(farm, { rng: { breakouts: fixedRng(0) } });
    return { f: farm.mobs[0]!.st!.f, broke: r.events.some((e) => e.type === 'breakout') };
  }

  /** The dead feed that leaves the mob with just over `share` of what it wanted. */
  function deadFor(share: number): number {
    let lo = 250;
    let hi = 900;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (dayWith(mid).f < share) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  it('a mob that got 85.5% stays in, and a mob that got 84.5% pushes through', () => {
    const fed = dayWith(deadFor(0.855));
    expect(fed.f).toBeGreaterThan(0.85);
    expect(fed.f).toBeLessThan(0.86);
    expect(fed.broke).toBe(false);
    const short = dayWith(deadFor(0.845));
    expect(short.f).toBeGreaterThan(0.84);
    expect(short.f).toBeLessThan(0.85);
    expect(short.broke).toBe(true);
  });

  it('they go through the tape, never the electric fence beside it, whichever segment the draw picks', () => {
    // A box with electric fence top and bottom and tape down the sides.
    let farm = openFarm('nsw');
    const [bx, by] = boreXY(farm);
    const sides = [-1, 0, 1].flatMap((k) => [vEdge(by + k, bx - 1), vEdge(by + k, bx + 2)]);
    const ends = [-1, 0, 1].flatMap((k) => [hEdge(by - 1, bx + k), hEdge(by + 2, bx + k)]);
    farm = act(farm, { type: 'buildFence', edges: ends, fence: 'electric' });
    farm = act(farm, { type: 'buildFence', edges: sides, fence: 'tape' });
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 30,
      to: { cell: farm.layout.water.bore },
    });
    for (const i of boxCells(bx - 1, by - 1, bx + 1, by + 1)) {
      farm.pasture.land[i] = LAND.fallow;
      farm.pasture.G[i] = 0;
      farm.pasture.D[i] = 200;
    }
    const picked = new Set<string>();
    for (const pick of [0, 0.09, 0.2, 0.34, 0.5, 0.61, 0.75, 0.88, 0.999]) {
      const f = cloneFarm(farm);
      // The first number decides whether they break out (0: yes). The second picks the segment.
      let n = 0;
      const rng = {
        ...fixedRng(0),
        pick: <T>(items: readonly T[]): T => {
          n++;
          return items[Math.floor(pick * items.length)] as T;
        },
      };
      const r = stepDay(f, { rng: { breakouts: rng } });
      const out = r.events.flatMap((e) => (e.type === 'breakout' ? [e] : []));
      expect(out.length, `pick ${pick}`).toBe(1);
      expect(n).toBe(1);
      expect(getEdge(farm.layout.fences, out[0]!.edge)).toBe(EDGE.tape);
      expect(getEdge(f.layout.fences, out[0]!.edge)).toBe(EDGE.tapeDown);
      picked.add(out[0]!.edge.line + out[0]!.edge.index);
      // The electric fence is as it was.
      for (const e of ends) expect(getEdge(f.layout.fences, e)).toBe(EDGE.electric);
    }
    // Across the picks every one of the six tape segments went down at some time.
    expect(picked.size).toBe(6);
  });
});
