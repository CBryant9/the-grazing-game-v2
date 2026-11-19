import { VIEW_FENCE, type FarmView } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import {
  ANIMAL_MIN_PX,
  CATTLE_EXAGGERATION,
  CATTLE_MAX_PX,
  CATTLE_MIN_PX,
  FARM_DRAWN_MAX,
  HERD_M2_PER_HEAD,
  MOB_DRAWN_MAX,
  STAND_BACK,
  YARDS_DRAWN,
  animalPx,
  cowPx,
  herdSquares,
  placeCattle,
  placementKey,
  standingBox,
  type MobPlacement,
} from './cattle';
import {
  RANK,
  SHORT,
  cell,
  fenceBox,
  hEdge,
  mob,
  sampleView,
  setSquare,
  vEdge,
} from './testing/sampleView';

const squareOf = (b: { x: number; y: number }): number => cell(Math.floor(b.x), Math.floor(b.y));

/** A view with one mob of steers in the left paddock. */
function withMob(head = 40): FarmView {
  const view = sampleView();
  view.mobs = [
    mob({
      head,
      cattle: [{ kind: 'steer', n: head, thin: 0, fat: 0 }],
      classes: { yearlingSteer: head },
    }),
  ];
  return view;
}

function only(view: FarmView): MobPlacement {
  const all = placeCattle(view);
  expect(all.length).toBe(1);
  return all[0]!;
}

describe('cattle stand in the same place every time', () => {
  it('the same view gives the same places, to the last decimal', () => {
    const view = withMob(180);
    expect(placeCattle(view)).toEqual(placeCattle(view));
    expect(placeCattle(JSON.parse(JSON.stringify(view)) as FarmView)).toEqual(placeCattle(view));
  });

  it('they do not move when the grass changes, or the day', () => {
    const view = withMob(180);
    const before = placeCattle(view);
    const key = placementKey(view);
    for (let i = 0; i < 1040; i += 3) setSquare(view, i, i % 2 ? RANK : SHORT);
    view.squares.grazed.fill(7);
    view.squares.me10.fill(70);
    view.day += 1;
    view.date.date += 1;
    expect(placeCattle(view)).toEqual(before);
    expect(placementKey(view)).toBe(key);
  });

  it('they do move when the mob is moved, bought into, or a fence in their area changes', () => {
    const view = withMob(40);
    const key = placementKey(view);

    const moved = withMob(40);
    moved.mobs[0]!.anchor = cell(12, 20);
    expect(placementKey(moved)).not.toBe(key);
    expect(placeCattle(moved)).not.toEqual(placeCattle(view));

    const bigger = withMob(41);
    expect(placementKey(bigger)).not.toBe(key);

    const fenced = withMob(40);
    fenced.fences.h[hEdge(6, 5)] = VIEW_FENCE.electric;
    expect(placementKey(fenced)).not.toBe(key);
  });

  it('two mobs with different seeds stand differently', () => {
    const a = withMob(30);
    const b = withMob(30);
    b.mobs[0]!.seed = 999;
    expect(only(a).beasts).not.toEqual(only(b).beasts);
  });
});

describe('cattle stay inside their grazing area', () => {
  it('every beast is on a square of its own area, on a farm cut up by fences', () => {
    const view = sampleView();
    const box = fenceBox(view, 24, 4, 27, 8, VIEW_FENCE.tape);
    view.mobs = [
      mob({ id: 1, seed: 11, area: 0, anchor: cell(5, 5), head: 300 }),
      mob({ id: 2, seed: 22, area: 1, anchor: cell(33, 20), head: 150 }),
      mob({ id: 3, seed: 33, area: box, anchor: cell(25, 6), head: 90 }),
    ];
    for (const m of view.mobs) m.cattle = [{ kind: 'steer', n: m.head, thin: 0, fat: 0 }];
    const placed = placeCattle(view);
    expect(placed.length).toBe(3);
    for (const p of placed) {
      const m = view.mobs.find((x) => x.id === p.mob)!;
      expect(p.beasts.length).toBeGreaterThan(0);
      for (const b of p.beasts) expect(view.squares.area[squareOf(b)]).toBe(m.area);
      for (const c of p.cells) expect(view.squares.area[c]).toBe(m.area);
      // The marker sits on one of the mob's own squares.
      expect(p.cells).toContain(squareOf(p.centre));
    }
  });

  it('a mob spreads out without crossing a fence: the far side of a fence line is reached only round its end', () => {
    const view = sampleView();
    // A fence across the left paddock at row 6, from the boundary to column 15. The gap is at 16 to 19.
    for (let x = 0; x < 16; x++) view.fences.h[hEdge(6, x)] = VIEW_FENCE.electric;
    view.mobs = [
      mob({ head: 250, anchor: cell(3, 5), cattle: [{ kind: 'steer', n: 250, thin: 0, fat: 0 }] }),
    ];
    const p = only(view);
    // 250 head at 400 m² a head take ten 1 ha squares. All ten are on the mob's side of the fence, not just across it.
    expect(p.cells.length).toBe(10);
    for (const c of p.cells) expect(Math.floor(c / 40)).toBeLessThan(6);
  });

  it('an open gate lets them through, a shut gate does not', () => {
    const make = (open: boolean): MobPlacement => {
      const view = sampleView();
      const box = fenceBox(view, 2, 10, 3, 10, VIEW_FENCE.permanent);
      // The box and the square under it are one grazing area when the gate is open.
      const gate = hEdge(11, 2);
      view.fences.h[gate] = VIEW_FENCE.gate;
      view.gates = [{ line: 'h', index: gate, open, kind: 'swing' }];
      if (open) {
        view.squares.area[cell(2, 11)] = box;
        view.squares.area[cell(3, 11)] = box;
        // Close those two squares off from the rest so the area is just four squares.
        view.fences.h[hEdge(12, 2)] = VIEW_FENCE.permanent;
        view.fences.h[hEdge(12, 3)] = VIEW_FENCE.permanent;
        view.fences.v[vEdge(11, 2)] = VIEW_FENCE.permanent;
        view.fences.v[vEdge(11, 4)] = VIEW_FENCE.permanent;
        view.fences.h[hEdge(11, 3)] = VIEW_FENCE.permanent;
      }
      // 100 head at 400 m² a head want four 1 ha squares.
      view.mobs = [mob({ area: box, anchor: cell(2, 10), head: 100 })];
      return only(view);
    };
    const shut = make(false);
    expect([...shut.cells].sort((a, b) => a - b)).toEqual([cell(2, 10), cell(3, 10)]);
    const open = make(true);
    // Through the gate at (2, 11), and on from there to (3, 11).
    expect([...open.cells].sort((a, b) => a - b)).toEqual([
      cell(2, 10),
      cell(3, 10),
      cell(2, 11),
      cell(3, 11),
    ]);
  });

  it('no beast stands on a square with a trough, the bore or a building', () => {
    const view = withMob(600);
    view.mobs[0]!.anchor = cell(5, 5); // the trough's own square
    const p = only(view);
    const taken = new Set(p.beasts.map(squareOf));
    expect(taken.has(cell(5, 5))).toBe(false); // trough
    expect(taken.has(cell(2, 2))).toBe(false); // bore
    expect(taken.has(cell(2, 22))).toBe(false); // yards
    // They gather round the trough: its neighbours are taken.
    expect(taken.has(cell(4, 5)) || taken.has(cell(6, 5))).toBe(true);
  });

  it('they stand back from fence lines: 0.2 of a square at the sides, 0.35 under a fence above', () => {
    const view = sampleView();
    const box = fenceBox(view, 10, 10, 10, 10, VIEW_FENCE.electric);
    view.mobs = [mob({ area: box, anchor: cell(10, 10), head: 6 })];
    expect(standingBox(view, cell(10, 10))).toEqual([10.2, 10.35, 10.8, 10.97]);
    for (const b of only(view).beasts) {
      expect(b.x).toBeGreaterThanOrEqual(10 + 0.2);
      expect(b.x).toBeLessThanOrEqual(11 - 0.2);
      expect(b.y).toBeGreaterThanOrEqual(10 + 0.35);
      expect(b.y).toBeLessThanOrEqual(11 - 0.03);
    }
    // In open country they can use nearly the whole square.
    expect(standingBox(sampleView(), cell(10, 10))).toEqual([
      10 + STAND_BACK.open,
      10 + STAND_BACK.open,
      11 - STAND_BACK.open,
      11 - STAND_BACK.bottom,
    ]);
  });
});

describe('how many cattle are drawn, and over how much ground', () => {
  it('a mob takes up its true ground: 400 m² a head, one sprite a head', () => {
    expect(HERD_M2_PER_HEAD).toBe(400);
    const p = only(withMob(180));
    expect(p.total).toBe(180);
    expect(p.beasts.length).toBe(180);
    expect(p.sampled).toBe(false);
    // 180 x 400 m² is 7.2 ha: eight squares of 1 ha.
    expect(p.cells.length).toBe(8);
    expect(p.herdM2).toBe(180 * 400);
  });

  it('a mob that takes up less than a square stands in part of it', () => {
    const p = only(withMob(5));
    expect(p.cells.length).toBe(1);
    const xs = p.beasts.map((b) => b.x);
    const ys = p.beasts.map((b) => b.y);
    // 2,000 m² of a 10,000 m² square: under half the width and depth.
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.5);
  });

  it('a big mob draws a sample, spread over its true ground, and keeps its real count', () => {
    const view = sampleView();
    view.mobs = [
      mob({ id: 1, seed: 5, area: 0, anchor: cell(5, 5), head: 2000 }),
      mob({ id: 2, seed: 6, area: 1, anchor: cell(30, 10), head: 2200 }),
    ];
    for (const m of view.mobs) m.cattle = [{ kind: 'steer', n: m.head, thin: 0, fat: 0 }];
    for (const p of placeCattle(view)) {
      const m = view.mobs.find((x) => x.id === p.mob)!;
      const squares = view.squares.area.filter((a) => a === m.area).length;
      expect(p.beasts.length).toBe(MOB_DRAWN_MAX);
      expect(p.sampled).toBe(true);
      expect(p.total).toBe(m.head);
      // Its ground is its true ground (2,000 head take 80 ha), or the whole area if that is less.
      expect(p.cells.length).toBe(Math.min(squares, Math.ceil((m.head * 400) / 10000)));
      // The sample is spread over all of it, not bunched at the start.
      const used = new Set(p.beasts.map(squareOf));
      expect(used.size).toBeGreaterThan(p.cells.length * 0.9);
    }
  });

  it('the farm draws no more than its budget, and each mob keeps a share', () => {
    const view = sampleView();
    view.mobs = [];
    for (let k = 0; k < 12; k++) {
      view.mobs.push(
        mob({
          id: k + 1,
          seed: 100 + k,
          area: k % 2,
          anchor: k % 2 ? cell(30, 5 + k) : cell(5, 5 + k),
          head: 900,
          cattle: [{ kind: 'cow', n: 900, thin: 0, fat: 0 }],
        }),
      );
    }
    const placed = placeCattle(view);
    const drawn = placed.reduce((t, p) => t + p.beasts.length, 0);
    expect(FARM_DRAWN_MAX).toBe(3000);
    expect(drawn).toBeLessThanOrEqual(FARM_DRAWN_MAX);
    for (const p of placed) {
      expect(p.beasts.length).toBeGreaterThanOrEqual(200);
      expect(p.total).toBe(900);
    }
  });

  it('the speed test can ask for every beast: 4,200 head are all drawn', () => {
    const view = sampleView();
    view.mobs = [
      mob({ id: 1, seed: 5, area: 0, anchor: cell(5, 5), head: 2000 }),
      mob({ id: 2, seed: 6, area: 1, anchor: cell(30, 10), head: 2200 }),
    ];
    for (const m of view.mobs) m.cattle = [{ kind: 'steer', n: m.head, thin: 0, fat: 0 }];
    const placed = placeCattle(view, { everyBeast: true });
    expect(placed.reduce((t, p) => t + p.beasts.length, 0)).toBe(4200);
    expect(placed.every((p) => !p.sampled)).toBe(true);
    // Still inside their own areas.
    for (const p of placed) {
      const area = view.mobs.find((m) => m.id === p.mob)!.area;
      for (const b of p.beasts) expect(view.squares.area[squareOf(b)]).toBe(area);
    }
  });

  it('the same mob fills a small strip, so high density looks crowded', () => {
    const view = sampleView();
    const box = fenceBox(view, 24, 4, 25, 5, VIEW_FENCE.tape); // four squares
    view.mobs = [
      mob({
        area: box,
        anchor: cell(24, 4),
        head: 4000,
        cattle: [{ kind: 'steer', n: 4000, thin: 0, fat: 0 }],
      }),
    ];
    const p = only(view);
    expect(p.cells.length).toBe(4);
    expect(p.beasts.length).toBe(MOB_DRAWN_MAX);
    expect(p.herdM2).toBe(4 * 10000);
    expect(p.sampled).toBe(true);
    expect(p.total).toBe(4000);
  });

  it('900 head on a 3,000 ha farm take up about 36 ha, not a quarter of the farm (Claudia, 19 Nov 2026)', () => {
    const sideM = Math.sqrt(3000 / 1040) * 100;
    const squares = herdSquares(900, sideM, 1040);
    expect(squares).toBe(13);
    expect(squares / 1040).toBeLessThan(0.02);
    // On a 200 ha farm the same mob needs 187 squares: a paddock or more.
    expect(herdSquares(900, Math.sqrt(200 / 1040) * 100, 1040)).toBeGreaterThan(150);
  });

  it('thin and fat cattle are drawn in their share of the mob', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 100, cattle: [{ kind: 'steer', n: 100, thin: 20, fat: 30 }] })];
    const shapes = only(view).beasts.map((b) => b.shape);
    expect(shapes.filter((s) => s === 'thin').length).toBe(20);
    expect(shapes.filter((s) => s === 'fat').length).toBe(30);
    expect(shapes.filter((s) => s === 'normal').length).toBe(50);
  });

  it('every kind in the mob shows, and calves stand beside cows', () => {
    const view = sampleView();
    view.mobs = [
      mob({
        head: 103,
        calves: 60,
        cattle: [
          { kind: 'cow', n: 100, thin: 0, fat: 0 },
          { kind: 'bull', n: 3, thin: 0, fat: 0 },
          { kind: 'calf', n: 60, thin: 0, fat: 0 },
        ],
      }),
    ];
    const p = only(view);
    const count = (k: string): number => p.beasts.filter((b) => b.kind === k).length;
    expect(count('cow')).toBe(100);
    expect(count('bull')).toBe(3);
    expect(count('calf')).toBe(60);
    const cows = p.beasts.filter((b) => b.kind === 'cow');
    for (const calf of p.beasts.filter((b) => b.kind === 'calf')) {
      const nearest = Math.min(...cows.map((c) => Math.hypot(c.x - calf.x, c.y - calf.y)));
      expect(nearest).toBeLessThan(0.35);
    }
  });

  it('a sampled mob still shows its bulls', () => {
    const view = sampleView();
    const box = fenceBox(view, 24, 4, 25, 4, VIEW_FENCE.tape); // two squares
    view.mobs = [
      mob({
        area: box,
        anchor: cell(24, 4),
        head: 1000,
        cattle: [
          { kind: 'cow', n: 990, thin: 0, fat: 0 },
          { kind: 'bull', n: 10, thin: 0, fat: 0 },
        ],
      }),
    ];
    const p = only(view);
    expect(p.beasts.length).toBe(MOB_DRAWN_MAX);
    expect(p.beasts.filter((b) => b.kind === 'bull').length).toBe(4);
  });
});

describe('where mobs are not drawn in a paddock', () => {
  it('a mob in the feedlot is not drawn at all: the map has no feedlot', () => {
    const view = sampleView();
    view.mobs = [mob({ where: 'lot', area: -1, anchor: -1 })];
    expect(placeCattle(view)).toEqual([]);
  });

  it('a mob in the stock yards is drawn at the yards, a few at a time', () => {
    const view = sampleView();
    view.mobs = [mob({ where: 'yards', area: -1, anchor: -1, head: 200 })];
    view.mobs[0]!.cattle = [{ kind: 'steer', n: 200, thin: 0, fat: 0 }];
    const p = only(view);
    expect(p.beasts.length).toBe(YARDS_DRAWN);
    expect(p.total).toBe(200);
    for (const b of p.beasts) expect(squareOf(b)).toBe(cell(2, 22));
  });

  it('an empty mob is not drawn', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 0, cattle: [] })];
    expect(placeCattle(view)).toEqual([]);
  });
});

describe('how big a beast is drawn', () => {
  const side = (ha: number): number => Math.sqrt(ha / 1040) * 100;

  it('a cow is its real 2.4 m times the exaggeration, between the least and most', () => {
    expect(CATTLE_EXAGGERATION).toBe(4);
    // 1,040 ha (100 m squares) at 60 px a square: 2.4 x 0.6 x 4 = 5.76 px.
    expect(cowPx(60, 100)).toBeCloseTo(5.76, 5);
    expect(cowPx(1, 100)).toBe(CATTLE_MIN_PX);
    expect(cowPx(500, 100)).toBe(CATTLE_MAX_PX);
  });

  it('at full zoom on a 200 ha farm a cow is clearly a cow, 18 px long', () => {
    expect(cowPx(96, side(200))).toBe(CATTLE_MAX_PX);
    expect(CATTLE_MAX_PX).toBe(18);
    // Half way in, still about ten pixels.
    expect(cowPx(44, side(200))).toBeGreaterThan(9);
  });

  it('on a 3,000 ha farm cattle are small against the paddock at every zoom', () => {
    expect(cowPx(25, side(3000))).toBe(CATTLE_MIN_PX);
    expect(cowPx(96, side(3000))).toBeLessThan(6);
  });

  it('calves, heifers and bulls are in proportion to the cow, and nothing is a speck', () => {
    const cow = cowPx(96, side(200));
    expect(animalPx(2.7, 96, side(200))).toBeCloseTo((cow * 2.7) / 2.4, 5);
    expect(animalPx(1.3, 96, side(200))).toBeCloseTo((cow * 1.3) / 2.4, 5);
    expect(animalPx(1.3, 25, side(6000))).toBe(ANIMAL_MIN_PX);
  });
});
