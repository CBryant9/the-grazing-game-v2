import { VIEW_FENCE, VIEW_LAND } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { green, red } from './colour';
import { columnsSpanned, fenceRuns, outlineOf } from './fences';
import { paintWash, washAt } from './overlays';
import { NATURAL } from './palette';
import { cell, hEdge, sampleView, vEdge } from './testing/sampleView';

describe('the water reach layer', () => {
  it('blue fading out to 1.5 km, yellow to 3 km, orange past it, red for no water', () => {
    const view = sampleView();
    const set = (i: number, hundredsOfMetres: number): void => {
      view.squares.waterDist[i] = hundredsOfMetres;
    };
    set(0, 0);
    set(1, 5);
    set(2, 15);
    set(3, 16);
    set(4, 30);
    set(5, 31);
    set(6, -1);
    expect(washAt(view, 'waterReach', 0)).toEqual({ colour: NATURAL.layerWaterNear, alpha: 0.3 });
    expect(washAt(view, 'waterReach', 1).alpha).toBeCloseTo(0.2, 10);
    // Right at 1.5 km the blue has faded to nothing.
    expect(washAt(view, 'waterReach', 2)).toEqual({ colour: NATURAL.layerWaterNear, alpha: 0 });
    expect(washAt(view, 'waterReach', 3)).toEqual({ colour: NATURAL.layerWaterMid, alpha: 0.18 });
    expect(washAt(view, 'waterReach', 4)).toEqual({ colour: NATURAL.layerWaterMid, alpha: 0.18 });
    expect(washAt(view, 'waterReach', 5)).toEqual({ colour: NATURAL.layerWaterFar, alpha: 0.28 });
    expect(washAt(view, 'waterReach', 6)).toEqual({ colour: NATURAL.layerWaterNone, alpha: 0.32 });
  });
});

describe('the pasture quality layer', () => {
  it('red at ME 6.5 and below, green at ME 9.8 and above, at 45%', () => {
    const view = sampleView();
    view.squares.me10[0] = 65;
    view.squares.me10[1] = 98;
    view.squares.me10[2] = 40;
    view.squares.me10[3] = 120;
    view.squares.me10[4] = 82;
    expect(washAt(view, 'quality', 0)).toEqual({ colour: NATURAL.layerQualityLow, alpha: 0.45 });
    expect(washAt(view, 'quality', 1)).toEqual({ colour: NATURAL.layerQualityHigh, alpha: 0.45 });
    expect(washAt(view, 'quality', 2).colour).toBe(NATURAL.layerQualityLow);
    expect(washAt(view, 'quality', 3).colour).toBe(NATURAL.layerQualityHigh);
    const mid = washAt(view, 'quality', 4).colour;
    expect(red(mid)).toBeLessThan(red(NATURAL.layerQualityLow));
    expect(green(mid)).toBeGreaterThan(green(NATURAL.layerQualityLow));
  });
});

describe('the recently grazed and arable layers', () => {
  it('grazed: nothing where nothing was eaten, stronger where more was', () => {
    const view = sampleView();
    view.squares.grazed[1] = 2;
    view.squares.grazed[2] = 8;
    view.squares.grazed[3] = 10;
    expect(washAt(view, 'grazed', 0).alpha).toBe(0);
    expect(washAt(view, 'grazed', 1).alpha).toBeCloseTo(0.12, 10);
    expect(washAt(view, 'grazed', 2).alpha).toBeCloseTo(0.48, 10);
    // Never stronger than 55%, so the grass still shows through.
    expect(washAt(view, 'grazed', 3).alpha).toBe(0.55);
    expect(washAt(view, 'grazed', 2).colour).toBe(NATURAL.layerGrazed);
  });

  it('arable: a pale wash on arable land, stronger where it is cropped now', () => {
    const view = sampleView();
    view.squares.arable[1] = 1;
    view.squares.arable[2] = 1;
    view.squares.land[2] = VIEW_LAND.crop;
    view.squares.land[3] = VIEW_LAND.crop; // cropped but not marked arable
    expect(washAt(view, 'arable', 0).alpha).toBe(0);
    expect(washAt(view, 'arable', 1)).toEqual({ colour: NATURAL.layerArable, alpha: 0.2 });
    expect(washAt(view, 'arable', 2)).toEqual({ colour: NATURAL.layerArableCropped, alpha: 0.28 });
    expect(washAt(view, 'arable', 3).alpha).toBe(0);
  });

  it('a wash paints one pixel for each square', () => {
    const view = sampleView();
    view.squares.grazed[cell(3, 2)] = 10;
    const out = new Uint8ClampedArray(40 * 26 * 4);
    paintWash(view, 'grazed', out);
    const p = cell(3, 2) * 4;
    expect([out[p], out[p + 1], out[p + 2], out[p + 3]]).toEqual([255, 60, 40, 140]);
    expect(out[3]).toBe(0);
  });
});

describe('fence lines as runs', () => {
  it('lines of one kind that follow on are one run', () => {
    const runs = fenceRuns(sampleView());
    // The boundary's four sides and the fence down the middle.
    expect(runs.length).toBe(5);
    expect(runs.filter((r) => r.code === VIEW_FENCE.boundary).length).toBe(4);
    expect(runs).toContainEqual({
      code: VIEW_FENCE.permanent,
      across: false,
      x0: 20,
      y0: 0,
      x1: 20,
      y1: 26,
    });
  });

  it('a gate breaks a run, and is not in any run', () => {
    const view = sampleView();
    view.fences.v[vEdge(10, 20)] = VIEW_FENCE.gate;
    const middle = fenceRuns(view).filter((r) => r.code === VIEW_FENCE.permanent);
    expect(middle.map((r) => [r.y0, r.y1])).toEqual([
      [0, 10],
      [11, 26],
    ]);
    expect(fenceRuns(view).some((r) => r.code === VIEW_FENCE.gate)).toBe(false);
  });

  it('a change of kind along a line starts a new run', () => {
    const view = sampleView();
    for (let x = 3; x < 9; x++) view.fences.h[hEdge(8, x)] = VIEW_FENCE.tape;
    view.fences.h[hEdge(8, 6)] = VIEW_FENCE.tapeDown;
    const on8 = fenceRuns(view).filter((r) => r.across && r.y0 === 8);
    expect(on8.map((r) => [r.code, r.x0, r.x1])).toEqual([
      [VIEW_FENCE.tape, 3, 6],
      [VIEW_FENCE.tapeDown, 6, 7],
      [VIEW_FENCE.tape, 7, 9],
    ]);
  });

  it('the outline of a block of squares is its edge and nothing inside', () => {
    const inBox = (i: number): boolean => i % 40 >= 4 && i % 40 <= 6 && i >= 80 && i < 160;
    // Three squares wide and two deep: ten lengths of edge.
    expect(outlineOf(inBox).length).toBe(10);
    expect(outlineOf(() => false)).toEqual([]);
  });

  it('counts the columns a paddock spans, for fitting its label', () => {
    expect(columnsSpanned([cell(4, 1), cell(9, 7), cell(6, 3)])).toBe(6);
    expect(columnsSpanned([])).toBe(0);
  });
});
