import { VIEW_FENCE, type FarmView } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { placeCattle, placementKey } from './cattle';
import { GROUND_SQUASH as K } from './grid';
import { squareAtWorld } from './hit';
import {
  FLOCK_DRAWN_MAX,
  SHEEP_M2_PER_HEAD,
  SHEEP_STAND_BACK,
  SHEEP_YARDS_DRAWN,
  placeSheep,
  sheepBox,
  sheepPlacementKey,
  type FlockPlacement,
} from './sheep';
import { defaultSprites, sheepSprite } from './sprites/painters';
import {
  cell,
  fenceBox,
  flock,
  hEdge,
  mob,
  sampleView,
  setSquare,
  sheepView,
  vEdge,
  RANK,
  SHORT,
} from './testing/sampleView';

const squareOf = (s: { x: number; y: number }): number => cell(Math.floor(s.x), Math.floor(s.y));

function withFlock(over: Parameters<typeof flock>[0] = {}): FarmView {
  const view = sampleView();
  view.flocks = [flock(over)];
  return view;
}

function only(view: FarmView): FlockPlacement {
  const all = placeSheep(view);
  expect(all.length).toBe(1);
  return all[0]!;
}

describe('a view with no flocks is drawn as it always was', () => {
  it('gives no sheep and an empty key, and does not change the cattle', () => {
    const view = sampleView();
    expect(view.flocks).toBeUndefined();
    expect(placeSheep(view)).toEqual([]);
    expect(sheepPlacementKey(view)).toBe('');
    view.flocks = [];
    expect(placeSheep(view)).toEqual([]);
    expect(sheepPlacementKey(view)).toBe('');
  });

  it('adding a flock leaves the cattle where they stood', () => {
    const view = sampleView();
    view.mobs = [mob({ head: 60, cattle: [{ kind: 'steer', n: 60, thin: 0, fat: 0 }] })];
    const before = placeCattle(view);
    const key = placementKey(view);
    view.flocks = [flock({ area: 1, anchor: cell(30, 15) })];
    expect(placeCattle(view)).toEqual(before);
    expect(placementKey(view)).toBe(key);
  });
});

describe('sheep stand in the same place every time', () => {
  it('the same view gives the same places, to the last decimal', () => {
    const view = withFlock({ head: 900, lambs: 100 });
    expect(placeSheep(view)).toEqual(placeSheep(view));
    expect(placeSheep(JSON.parse(JSON.stringify(view)) as FarmView)).toEqual(placeSheep(view));
  });

  it('they do not move when the grass changes, or the day', () => {
    const view = withFlock({ head: 500 });
    const before = placeSheep(view);
    const key = sheepPlacementKey(view);
    for (let i = 0; i < 1040; i += 3) setSquare(view, i, i % 2 ? RANK : SHORT);
    view.day += 1;
    expect(placeSheep(view)).toEqual(before);
    expect(sheepPlacementKey(view)).toBe(key);
  });

  it('they do move when the flock is moved or its numbers change', () => {
    const key = sheepPlacementKey(withFlock());
    expect(sheepPlacementKey(withFlock({ anchor: cell(12, 20) }))).not.toBe(key);
    expect(sheepPlacementKey(withFlock({ head: 201 }))).not.toBe(key);
    expect(sheepPlacementKey(withFlock({ lambs: 5 }))).not.toBe(key);
  });

  it('two flocks with different seeds stand differently', () => {
    expect(only(withFlock({ seed: 1 })).sheep).not.toEqual(only(withFlock({ seed: 2 })).sheep);
  });
});

describe('sheep stand where a flock can stand', () => {
  it('every sheep is inside its own grazing area, back from the fences', () => {
    const view = withFlock({ head: 1500 });
    const p = only(view);
    expect(p.sheep.length).toBeGreaterThan(50);
    for (const s of p.sheep) {
      const sq = squareOf(s);
      expect(view.squares.area[sq], `sheep at ${s.x},${s.y}`).toBe(0);
      const [x0, y0, x1, y1] = sheepBox(view, sq);
      expect(s.x).toBeGreaterThanOrEqual(x0 - 1e-9);
      expect(s.x).toBeLessThanOrEqual(x1 + 1e-9);
      expect(s.y).toBeGreaterThanOrEqual(y0 - 1e-9);
      expect(s.y).toBeLessThanOrEqual(y1 + 1e-9);
    }
  });

  it('stand back from a fence on the side that has one, and are closer than cattle would stand', () => {
    const view = withFlock();
    const sq = cell(19, 5);
    const [x0, , x1] = sheepBox(view, sq);
    // The fence is on the right side of column 19.
    expect(x1).toBeCloseTo(20 - SHEEP_STAND_BACK.side, 9);
    expect(x0).toBeCloseTo(19 + SHEEP_STAND_BACK.open, 9);
    expect(SHEEP_STAND_BACK.side).toBeLessThan(0.2);
  });

  it('never stand on a square with a trough, the bore or the yards', () => {
    const view = withFlock({ head: 1200, anchor: cell(5, 5) });
    const blocked = new Set([view.water.bore, cell(5, 5), cell(2, 22)]);
    for (const s of only(view).sheep) expect(blocked.has(squareOf(s))).toBe(false);
  });

  it('never cross a fence, whatever it is made of', () => {
    for (const code of [
      VIEW_FENCE.permanent,
      VIEW_FENCE.electric,
      VIEW_FENCE.tape,
      VIEW_FENCE.netting,
    ]) {
      const view = sampleView();
      // One grazing area, with a pen fenced inside it by this code.
      view.areas.length = 1;
      view.squares.area.fill(0);
      for (let x = 26; x <= 30; x++) {
        view.fences.h[hEdge(8, x)] = code;
        view.fences.h[hEdge(13, x)] = code;
      }
      for (let y = 8; y <= 12; y++) {
        view.fences.v[vEdge(y, 26)] = code;
        view.fences.v[vEdge(y, 31)] = code;
      }
      view.flocks = [flock({ area: 0, anchor: cell(28, 10), head: 400 })];
      const p = only(view);
      for (const s of p.sheep) {
        const col = Math.floor(s.x);
        const row = Math.floor(s.y);
        expect(col >= 26 && col <= 30 && row >= 8 && row <= 12, `${code} at ${s.x},${s.y}`).toBe(
          true,
        );
      }
      expect(p.sampled).toBe(true);
    }
  });

  it('spread outside the pen when there is no fence to stop them', () => {
    const view = sampleView();
    view.areas.length = 1;
    view.squares.area.fill(0);
    // 6,000 sheep at 60 m² a head take 36 ha: more than the 25 squares of the pen.
    view.flocks = [
      flock({ area: 0, anchor: cell(28, 10), head: 6000, sheep: [{ kind: 'ewe', n: 6000, thin: 0 }] }),
    ];
    const outside = only(view).sheep.filter((s) => {
      const col = Math.floor(s.x);
      const row = Math.floor(s.y);
      return !(col >= 26 && col <= 30 && row >= 8 && row <= 12);
    });
    expect(outside.length).toBeGreaterThan(0);
  });

  it('netting stops cattle as a permanent fence does', () => {
    const view = sampleView();
    view.areas.length = 1;
    view.squares.area.fill(0);
    for (let x = 26; x <= 30; x++) {
      view.fences.h[hEdge(8, x)] = VIEW_FENCE.netting;
      view.fences.h[hEdge(13, x)] = VIEW_FENCE.netting;
    }
    for (let y = 8; y <= 12; y++) {
      view.fences.v[vEdge(y, 26)] = VIEW_FENCE.netting;
      view.fences.v[vEdge(y, 31)] = VIEW_FENCE.netting;
    }
    view.mobs = [
      mob({
        area: 0,
        anchor: cell(28, 10),
        head: 300,
        cattle: [{ kind: 'steer', n: 300, thin: 0, fat: 0 }],
      }),
    ];
    for (const b of placeCattle(view)[0]!.beasts) {
      const col = Math.floor(b.x);
      const row = Math.floor(b.y);
      expect(col >= 26 && col <= 30 && row >= 8 && row <= 12).toBe(true);
    }
  });

  it('a flock in a netted pen uses its own paddock', () => {
    const view = sheepView();
    const pen = view.flocks![1]!;
    const p = placeSheep(view).find((f) => f.flock === pen.id)!;
    expect(p.total).toBe(80);
    for (const s of p.sheep) {
      const col = Math.floor(s.x);
      const row = Math.floor(s.y);
      expect(col >= 26 && col <= 30 && row >= 8 && row <= 12).toBe(true);
    }
  });

  it('a flock in the stock yards stands in the yards square, 24 at most', () => {
    const view = sampleView();
    view.flocks = [flock({ where: 'yards', area: -1, anchor: -1, head: 600 })];
    const p = only(view);
    expect(p.sheep.length).toBe(SHEEP_YARDS_DRAWN);
    expect(p.total).toBe(600);
    for (const s of p.sheep) expect(squareOf(s)).toBe(cell(2, 22));
  });

  it('a flock with no sheep is not drawn', () => {
    const view = sampleView();
    view.flocks = [flock({ head: 0, lambs: 0, sheep: [] })];
    expect(placeSheep(view)).toEqual([]);
  });
});

describe('a flock takes up its true ground', () => {
  it('a flock of 7,000 draws a sample over its true ground and keeps its real head count', () => {
    const view = sheepView();
    const big = view.flocks![0]!;
    const p = placeSheep(view).find((f) => f.flock === big.id)!;
    const area = view.squares.area.filter((a) => a === big.area).length;
    expect(p.total).toBe(7900);
    expect(p.sampled).toBe(true);
    expect(p.sheep.length).toBeLessThan(p.total);
    expect(SHEEP_M2_PER_HEAD).toBe(60);
    // 7,000 adults at 60 m² a head is 42 ha, or the whole area if that is less.
    expect(p.cells.length).toBe(Math.min(area, Math.ceil((7000 * 60) / 10000)));
    // Nowhere near one sprite for each sheep.
    expect(p.sheep.length).toBeLessThanOrEqual(FLOCK_DRAWN_MAX);
    // The sample is spread over all of its ground.
    const used = new Set(p.sheep.map(squareOf));
    expect(used.size).toBeGreaterThan(p.cells.length * 0.9);
  });

  it('the sample keeps every kind in the flock and the share of thin and lambs', () => {
    const view = sheepView();
    const p = placeSheep(view)[0]!;
    const kinds = new Set(p.sheep.map((s) => s.kind));
    for (const k of ['ewe', 'wether', 'ram', 'young', 'lamb'] as const)
      expect(kinds.has(k)).toBe(true);
    const thin = p.sheep.filter((s) => s.thin).length;
    expect(thin).toBeGreaterThan(0);
    // 440 of 7,000 adults are thin, about 6%. The sample is within a few points of that.
    const adults = p.sheep.filter((s) => s.kind !== 'lamb').length;
    expect(thin / adults).toBeGreaterThan(0.03);
    expect(thin / adults).toBeLessThan(0.1);
    const lambs = p.sheep.filter((s) => s.kind === 'lamb').length;
    expect(lambs / p.sheep.length).toBeGreaterThan(0.08);
    expect(lambs / p.sheep.length).toBeLessThan(0.15);
  });

  it('a small flock is drawn whole, close together on part of a square', () => {
    const p = only(withFlock({ head: 24, sheep: [{ kind: 'ewe', n: 24, thin: 0 }] }));
    expect(p.sampled).toBe(false);
    expect(p.sheep.length).toBe(24);
    // 24 x 60 m² is 1,440 m² of a 1 ha square.
    expect(p.cells.length).toBe(1);
    expect(p.herdM2).toBe(24 * 60);
  });

  it('a flock in a small pen is drawn whole over as much of it as its numbers need', () => {
    const view = sampleView();
    const id = fenceBox(view, 10, 20, 11, 21, VIEW_FENCE.netting);
    view.flocks = [
      flock({
        area: id,
        anchor: cell(10, 20),
        head: 400,
        sheep: [{ kind: 'ewe', n: 400, thin: 0 }],
      }),
    ];
    const p = only(view);
    // 400 x 60 m² is 2.4 ha: three of the pen's four squares.
    expect(p.cells.length).toBe(3);
    expect(p.sheep.length).toBe(400);
    expect(p.total).toBe(400);
  });
});

describe('lambs and thin sheep', () => {
  it('lambs stand beside a ewe', () => {
    const p = only(
      withFlock({
        head: 60,
        lambs: 30,
        sheep: [
          { kind: 'ewe', n: 50, thin: 0 },
          { kind: 'ram', n: 10, thin: 0 },
        ],
      }),
    );
    const ewes = p.sheep.filter((s) => s.kind === 'ewe');
    const lambs = p.sheep.filter((s) => s.kind === 'lamb');
    expect(lambs.length).toBe(30);
    for (const l of lambs) {
      const near = ewes.some((e) => Math.abs(e.x - l.x) < 0.2 && Math.abs(e.y - l.y) < 0.12);
      expect(near, `lamb at ${l.x},${l.y}`).toBe(true);
    }
  });

  it('thin sheep are flagged for the leaner picture, in the share the view gives', () => {
    const p = only(withFlock({ head: 40, sheep: [{ kind: 'ewe', n: 40, thin: 10 }] }));
    expect(p.sheep.filter((s) => s.thin).length).toBe(10);
    const none = only(withFlock({ head: 40, sheep: [{ kind: 'ewe', n: 40, thin: 0 }] }));
    expect(none.sheep.some((s) => s.thin)).toBe(false);
  });

  it('the marker sits on one of the flock squares', () => {
    const p = only(withFlock({ head: 900 }));
    const squares = new Set(p.cells);
    expect(squares.has(cell(Math.floor(p.centre.x), Math.floor(p.centre.y)))).toBe(true);
  });
});

describe('tapping a sheep opens the paddock', () => {
  it('the point under every sheep belongs to its paddock', () => {
    const view = withFlock({ head: 300 });
    for (const s of only(view).sheep) {
      const sq = squareAtWorld(s.x, s.y * K);
      expect(view.squares.paddock[sq]).toBe(0);
    }
  });
});

describe('sheep art', () => {
  const reg = defaultSprites();

  it('has a sprite for every kind and each body shape, and a flock marker', () => {
    for (const kind of ['ewe', 'wether', 'ram', 'young'] as const) {
      for (const thin of [false, true])
        expect(reg.has(sheepSprite(kind, thin)), `${kind} ${thin}`).toBe(true);
    }
    // Lambs have one shape.
    expect(sheepSprite('lamb', true)).toBe(sheepSprite('lamb', false));
    expect(reg.has(sheepSprite('lamb', false))).toBe(true);
    expect(reg.has('marker.sheep')).toBe(true);
  });

  it('sheep are drawn smaller than cattle, and a lamb smaller than a ewe', () => {
    const ewe = reg.get(sheepSprite('ewe', false))!;
    const cow = reg.get('cattle.british.cow.normal')!;
    // Texture width over pixels to a square: how wide it stands on the map.
    expect(ewe.w / ewe.ppu).toBeLessThan((cow.w / cow.ppu) * 0.75);
    expect(reg.get(sheepSprite('lamb', false))!.w).toBeLessThan(ewe.w * 0.6);
    expect(reg.get(sheepSprite('ram', false))!.w).toBeGreaterThan(ewe.w);
  });
});
