import { VIEW_FENCE, type FarmView } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import {
  MAX_DRAWN_CROWDED,
  MAX_DRAWN_PER_SQUARE,
  MAX_SHARE_OF_AREA,
  STAND_BACK,
  YARDS_DRAWN,
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
    view.mobs = [mob({ head: 20, anchor: cell(3, 5) })];
    const p = only(view);
    // Twenty head take ten squares. All ten are on the mob's side of the fence, not just across it.
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
      view.mobs = [mob({ area: box, anchor: cell(2, 10), head: 60 })];
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

  it('they stand back from fence lines: 0.3 of a square at the sides, 0.55 under a fence above', () => {
    const view = sampleView();
    const box = fenceBox(view, 10, 10, 10, 10, VIEW_FENCE.electric);
    view.mobs = [mob({ area: box, anchor: cell(10, 10), head: 6 })];
    expect(standingBox(view, cell(10, 10))).toEqual([10.3, 10.55, 10.7, 10.94]);
    for (const b of only(view).beasts) {
      expect(b.x).toBeGreaterThanOrEqual(10 + 0.3);
      expect(b.x).toBeLessThanOrEqual(11 - 0.3);
      expect(b.y).toBeGreaterThanOrEqual(10 + 0.55);
      expect(b.y).toBeLessThanOrEqual(11 - 0.06);
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

describe('how many cattle are drawn', () => {
  it('a mob with room draws every beast, about two to a square', () => {
    const p = only(withMob(180));
    expect(p.total).toBe(180);
    expect(p.beasts.length).toBe(180);
    expect(p.sampled).toBe(false);
    expect(p.cells.length).toBe(90);
  });

  it('big mobs do not hide the pasture: on open country a mob stands on four squares in ten at most, three to a square', () => {
    const view = sampleView();
    view.mobs = [
      mob({ id: 1, seed: 5, area: 0, anchor: cell(5, 5), head: 2000 }),
      mob({ id: 2, seed: 6, area: 1, anchor: cell(30, 10), head: 2200 }),
    ];
    for (const m of view.mobs) m.cattle = [{ kind: 'steer', n: m.head, thin: 0, fat: 0 }];
    expect(MAX_SHARE_OF_AREA).toBe(0.4);
    expect(MAX_DRAWN_PER_SQUARE).toBe(3);
    for (const p of placeCattle(view)) {
      const area = view.mobs.find((m) => m.id === p.mob)!.area;
      const squares = view.squares.area.filter((a) => a === area).length;
      expect(p.cells.length).toBeLessThanOrEqual(Math.ceil(squares * 0.4));
      expect(p.beasts.length).toBeLessThanOrEqual(p.cells.length * 3);
      const perSquare = new Map<number, number>();
      for (const b of p.beasts) perSquare.set(squareOf(b), (perSquare.get(squareOf(b)) ?? 0) + 1);
      expect(Math.max(...perSquare.values())).toBeLessThanOrEqual(3);
      // The mob is sampled, and keeps its real head count for the marker.
      expect(p.sampled).toBe(true);
      expect(p.total).toBeGreaterThanOrEqual(2000);
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

  it('a very big mob on a small area uses every square, six to a square, and keeps its real count', () => {
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
    expect(MAX_DRAWN_CROWDED).toBe(6);
    expect(p.cells.length).toBe(4);
    expect(p.beasts.length).toBe(24);
    expect(p.sampled).toBe(true);
    expect(p.total).toBe(4000);
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
    const box = fenceBox(view, 24, 4, 25, 4, VIEW_FENCE.tape); // two squares: 12 drawn
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
    expect(p.beasts.length).toBe(12);
    expect(p.beasts.filter((b) => b.kind === 'bull').length).toBe(1);
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
