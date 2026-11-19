import { VIEW_FENCE, type FarmView } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { placeCattle } from './cattle';
import { Herd, IDLE_SECONDS, feedPull } from './herd';
import { cell, fenceBox, hEdge, mob, sampleView, setSquare, SHORT } from './testing/sampleView';

const squareOf = (x: number, y: number): number => cell(Math.floor(x), Math.floor(y));

/** A herd synced to a view. */
function herdFor(view: FarmView): Herd {
  const h = new Herd();
  h.sync(view, placeCattle(view));
  return h;
}

/** Run the herd for `seconds` at 60 frames a second. Calls `each` after every frame. */
function run(h: Herd, seconds: number, pace = 1, walk = 0.3, each?: () => void): number {
  let moved = 0;
  for (let t = 0; t < seconds * 60; t++) {
    if (h.step(1 / 60, pace, walk).moved) moved++;
    each?.();
  }
  return moved;
}

const positions = (h: Herd): number[] => [...h.x, ...h.y];

describe('cattle walk and graze', () => {
  it('stand a while, then walk, and stop again', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 60 })];
    const h = herdFor(view);
    const before = positions(h);
    // Each stands for at most four seconds before it sets off.
    expect(IDLE_SECONDS[1]).toBe(4);
    run(h, 5);
    const after = positions(h);
    const movedCount = before.filter((v, k) => Math.abs(v - after[k]!) > 1e-6).length;
    expect(movedCount).toBeGreaterThan(before.length * 0.5);
  });

  it('never leave their grazing area or cross a fence, whatever they walk to', () => {
    const view = sampleView();
    const box = fenceBox(view, 10, 10, 13, 12, VIEW_FENCE.tape);
    // A fence spur inside the box: they must walk round it, not through.
    view.fences.v[10 * 41 + 12] = VIEW_FENCE.electric;
    view.fences.v[11 * 41 + 12] = VIEW_FENCE.electric;
    view.mobs = [
      mob({ id: 1, area: box, anchor: cell(10, 10), head: 300, calves: 40 }),
      mob({ id: 2, seed: 9, area: 0, anchor: cell(5, 5), head: 200 }),
    ];
    view.mobs[0]!.cattle = [
      { kind: 'cow', n: 300, thin: 0, fat: 0 },
      { kind: 'calf', n: 40, thin: 0, fat: 0 },
    ];
    const h = herdFor(view);
    const side = new Int8Array(h.n);
    for (let i = 0; i < h.n; i++) side[i] = Math.floor(h.x[i]!) >= 12 ? 1 : 0;
    let outside = 0;
    run(h, 90, 2, 0.4, () => {
      for (let i = 0; i < h.n; i++) {
        const m = h.mobs[h.mobOf[i]!]!;
        if (view.squares.area[squareOf(h.x[i]!, h.y[i]!)] !== m.area) outside++;
      }
    });
    expect(outside).toBe(0);
    // Something did cross the spur's line, by going round its end at row 12.
    let crossed = 0;
    for (let i = 0; i < h.mobs[0]!.to; i++) {
      if ((Math.floor(h.x[i]!) >= 12 ? 1 : 0) !== side[i]) crossed++;
    }
    expect(crossed).toBeGreaterThan(0);
  });

  it('calves keep close to their mothers', () => {
    const view = sampleView();
    view.mobs = [
      mob({
        head: 80,
        calves: 60,
        cattle: [
          { kind: 'cow', n: 80, thin: 0, fat: 0 },
          { kind: 'calf', n: 60, thin: 0, fat: 0 },
        ],
      }),
    ];
    const h = herdFor(view);
    run(h, 60);
    let far = 0;
    let calves = 0;
    for (let i = 0; i < h.n; i++) {
      const d = h.dam[i]!;
      if (d < 0) continue;
      calves++;
      if (Math.hypot(h.x[i]! - h.x[d]!, h.y[i]! - h.y[d]!) > 1.5) far++;
    }
    expect(calves).toBe(60);
    expect(far / calves).toBeLessThan(0.15);
  });

  it('face the way they walk', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 40 })];
    const h = herdFor(view);
    let checked = 0;
    for (let t = 0; t < 600; t++) {
      const x0 = Float32Array.from(h.x);
      h.step(1 / 60, 1, 0.3);
      for (let i = 0; i < h.n; i++) {
        const dx = h.x[i]! - x0[i]!;
        if (Math.abs(dx) > 1e-3) {
          expect(Math.sign(dx)).toBe(h.dir[i]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('are drawn to better feed: more cattle end up on the good half', () => {
    const view = sampleView();
    const box = fenceBox(view, 20, 4, 29, 5, VIEW_FENCE.tape); // twenty squares
    for (let x = 25; x <= 29; x++) {
      setSquare(view, cell(x, 4), SHORT);
      setSquare(view, cell(x, 5), SHORT);
    }
    // The left half: thick, green and good. The right: short and bare.
    for (let x = 20; x <= 24; x++) {
      for (const y of [4, 5]) {
        view.squares.cover[cell(x, y)] = 10;
        view.squares.green[cell(x, y)] = 18;
        view.squares.me10[cell(x, y)] = 100;
      }
    }
    for (let x = 25; x <= 29; x++) {
      for (const y of [4, 5]) {
        view.squares.cover[cell(x, y)] = 2;
        view.squares.me10[cell(x, y)] = 70;
      }
    }
    const pull = feedPull(view);
    expect(pull[cell(21, 4)]!).toBeGreaterThan(pull[cell(27, 4)]! * 10);
    // 600 head want 24 ha: they fill the box, so where they stand is their pick.
    view.mobs = [mob({ area: box, anchor: cell(27, 4), head: 600 })];
    const h = herdFor(view);
    run(h, 120, 4, 0.5);
    let good = 0;
    for (let i = 0; i < h.n; i++) if (h.x[i]! < 25) good++;
    expect(good / h.n).toBeGreaterThan(0.6);
  });

  it('walk faster when the days run faster, and stand still when paused', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 60 })];
    const a = herdFor(view);
    const b = herdFor(view);
    const before = positions(a);
    // How far they walk in all, step by step.
    const walked = (h: Herd, pace: number): number => {
      let d = 0;
      for (let t = 0; t < 600; t++) {
        const x0 = Float32Array.from(h.x);
        const y0 = Float32Array.from(h.y);
        h.step(1 / 60, pace, 0.3);
        for (let i = 0; i < h.n; i++) d += Math.hypot(h.x[i]! - x0[i]!, h.y[i]! - y0[i]!);
      }
      return d;
    };
    expect(walked(b, 4)).toBeGreaterThan(walked(a, 1) * 2);
    const c = herdFor(view);
    expect(run(c, 10, 0)).toBe(0);
    expect(positions(c)).toEqual(before);
  });
});

describe('places carry over from one view to the next', () => {
  it('a new day with new grass leaves every beast where it stood', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 90 })];
    const h = herdFor(view);
    run(h, 20);
    const before = positions(h);
    const next = structuredClone(view);
    next.day += 1;
    for (let i = 0; i < 1040; i += 2) setSquare(next, i, SHORT);
    h.sync(next, placeCattle(next));
    expect(positions(h)).toEqual(before);
  });

  it('a mob that loses a few head keeps the rest where they stood', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 90, cattle: [{ kind: 'steer', n: 90, thin: 0, fat: 0 }] })];
    const h = herdFor(view);
    run(h, 10);
    const keep = new Set<string>();
    for (let i = 0; i < h.n; i++) keep.add(`${h.x[i]},${h.y[i]}`);
    const fewer = structuredClone(view);
    fewer.mobs[0]!.head = 85;
    fewer.mobs[0]!.cattle = [{ kind: 'steer', n: 85, thin: 0, fat: 0 }];
    h.sync(fewer, placeCattle(fewer));
    expect(h.n).toBe(85);
    for (let i = 0; i < h.n; i++) expect(keep.has(`${h.x[i]},${h.y[i]}`)).toBe(true);
  });

  it('a mob moved to another paddock walks there from where it was, and ends up inside', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 50 })];
    const h = herdFor(view);
    const from = positions(h);
    const moved = structuredClone(view);
    moved.mobs[0]!.area = 1;
    moved.mobs[0]!.anchor = cell(30, 10);
    h.sync(moved, placeCattle(moved));
    // Still where they were, on their way.
    expect(positions(h)).toEqual(from);
    expect(h.mobs[0]!.rushing).toBe(h.n);
    let arrived = false;
    for (let t = 0; t < 60 * 8 && !arrived; t++) arrived = h.step(1 / 60, 1, 0.3).arrived;
    expect(arrived).toBe(true);
    for (let i = 0; i < h.n; i++) {
      expect(moved.squares.area[squareOf(h.x[i]!, h.y[i]!)]).toBe(1);
    }
  });

  it('a moved mob still gets there when the days are paused', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 20 })];
    const h = herdFor(view);
    const moved = structuredClone(view);
    moved.mobs[0]!.area = 1;
    moved.mobs[0]!.anchor = cell(30, 10);
    h.sync(moved, placeCattle(moved));
    run(h, 8, 0);
    expect(h.mobs[0]!.rushing).toBe(0);
  });

  it('bought cattle walk out from the yards', () => {
    const view = sampleView();
    view.mobs = [mob({ id: 1, head: 30 })];
    const h = herdFor(view);
    const bought = structuredClone(view);
    bought.mobs.push(mob({ id: 2, seed: 77, head: 20, area: 1, anchor: cell(30, 10) }));
    h.sync(bought, placeCattle(bought));
    const m = h.mob(2)!;
    expect(m.rushing).toBe(20);
    for (let i = m.from; i < m.to; i++) expect(squareOf(h.x[i]!, h.y[i]!)).toBe(cell(2, 22));
  });

  it('with reduce motion a moved mob is put straight in its new paddock', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 20 })];
    const h = herdFor(view);
    const moved = structuredClone(view);
    moved.mobs[0]!.area = 1;
    moved.mobs[0]!.anchor = cell(30, 10);
    h.sync(moved, placeCattle(moved));
    h.settle();
    for (let i = 0; i < h.n; i++) {
      expect(moved.squares.area[squareOf(h.x[i]!, h.y[i]!)]).toBe(1);
    }
  });
});

describe('the herd moves about a big paddock', () => {
  it('its patch drifts over time, and stays inside its area', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 100 })];
    const h = herdFor(view);
    const start = h.mobs[0]!.start;
    const starts = new Set<number>([start]);
    for (let t = 0; t < 60 * 300; t++) {
      if (h.step(1 / 60, 4, 0.3).shifted) starts.add(h.mobs[0]!.start);
    }
    expect(starts.size).toBeGreaterThan(2);
    for (const s of starts) expect(view.squares.area[s]).toBe(0);
  });

  it('only mobs on screen walk, unless they are on their way somewhere', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 40 })];
    const h = herdFor(view);
    const before = positions(h);
    for (let t = 0; t < 600; t++) h.step(1 / 60, 1, 0.3, [30, 15, 39, 25]);
    expect(positions(h)).toEqual(before);
  });

  it('a fence put up through the herd: those on the far side walk back into their area', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 200 })];
    const h = herdFor(view);
    const cut = structuredClone(view);
    // Rows 0 to 4 of the left paddock become their own area.
    for (let x = 0; x < 20; x++) cut.fences.h[hEdge(5, x)] = VIEW_FENCE.electric;
    for (let i = 0; i < 1040; i++)
      if (cut.squares.area[i] === 0 && i < 5 * 40) cut.squares.area[i] = 7;
    cut.mobs[0]!.anchor = cell(5, 8);
    h.sync(cut, placeCattle(cut));
    run(h, 8);
    for (let i = 0; i < h.n; i++) expect(cut.squares.area[squareOf(h.x[i]!, h.y[i]!)]).toBe(0);
  });
});
