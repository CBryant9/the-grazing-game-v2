import { describe, expect, it } from 'vitest';
import {
  FARM_MARGIN,
  MAX_ZOOM,
  clampCamera,
  clampZoom,
  containZoom,
  fillHeightZoom,
  fitFarm,
  lookAt,
  minZoom,
  panBy,
  pinch,
  resized,
  screenToWorld,
  visibleWorld,
  worldToScreen,
  zoomAt,
  type Camera,
  type Viewport,
} from './camera';
import { WORLD_H, WORLD_W } from './grid';
import { scatter } from './random';

const PHONE_UPRIGHT: Viewport = { width: 375, height: 620 };
const PHONE_ON_ITS_SIDE: Viewport = { width: 812, height: 375 };
const PC: Viewport = { width: 1440, height: 800 };

/** The farm with its margins, as the camera keeps it. */
const BOX = {
  x0: -FARM_MARGIN.side,
  x1: WORLD_W + FARM_MARGIN.side,
  y0: -FARM_MARGIN.top,
  y1: WORLD_H + FARM_MARGIN.bottom,
};

describe('fitting the farm to the screen', () => {
  it('the farm is 40 squares across and 18.2 down once the ground is squashed to 70%', () => {
    expect(WORLD_W).toBe(40);
    expect(WORLD_H).toBeCloseTo(26 * 0.7, 10);
  });

  it.each([
    ['a phone on its side', PHONE_ON_ITS_SIDE],
    ['a PC', PC],
    ['a phone held upright', PHONE_UPRIGHT],
  ])('at the furthest zoom the whole farm is on screen: %s', (_name, vp) => {
    const cam = clampCamera({ zoom: 0.001, x: 3, y: 3 }, vp);
    expect(cam.zoom).toBeCloseTo(containZoom(vp), 10);
    const [x0, y0, x1, y1] = visibleWorld(cam, vp);
    expect(x0).toBeLessThanOrEqual(0);
    expect(y0).toBeLessThanOrEqual(0);
    expect(x1).toBeGreaterThanOrEqual(WORLD_W);
    expect(y1).toBeGreaterThanOrEqual(WORLD_H);
  });

  it('held upright, the farm fills the height and runs past the sides (PRD 6.1)', () => {
    const cam = fitFarm(PHONE_UPRIGHT);
    expect(cam.zoom).toBeCloseTo(fillHeightZoom(PHONE_UPRIGHT), 10);
    const [x0, y0, x1, y1] = visibleWorld(cam, PHONE_UPRIGHT);
    // All of the height is in view.
    expect(y0).toBeLessThanOrEqual(0);
    expect(y1).toBeGreaterThanOrEqual(WORLD_H);
    // Only part of the width.
    expect(x1 - x0).toBeLessThan(WORLD_W);
  });

  it('on its side, the whole width of the farm fits (PRD 6.1a)', () => {
    const cam = fitFarm(PHONE_ON_ITS_SIDE);
    const [x0, , x1] = visibleWorld(cam, PHONE_ON_ITS_SIDE);
    expect(x0).toBeLessThanOrEqual(0);
    expect(x1).toBeGreaterThanOrEqual(WORLD_W);
  });

  it('"contain" shows it all even on a phone held upright', () => {
    const cam = fitFarm(PHONE_UPRIGHT, 'contain');
    const [x0, , x1] = visibleWorld(cam, PHONE_UPRIGHT);
    expect(x0).toBeLessThanOrEqual(0);
    expect(x1).toBeGreaterThanOrEqual(WORLD_W);
  });
});

describe('the zoom is held in range', () => {
  it('never further out than the whole farm, never closer than 96 pixels a square', () => {
    expect(MAX_ZOOM).toBe(96);
    for (const vp of [PHONE_UPRIGHT, PHONE_ON_ITS_SIDE, PC]) {
      expect(clampZoom(0, vp)).toBe(minZoom(vp));
      expect(clampZoom(-5, vp)).toBe(minZoom(vp));
      expect(clampZoom(1e9, vp)).toBe(96);
      expect(clampZoom(Number.NaN, vp)).toBe(minZoom(vp));
      expect(clampZoom(40, vp)).toBe(40);
    }
  });

  it('a huge screen that fits the farm at more than 96 pixels a square stays at 96', () => {
    const wall: Viewport = { width: 8000, height: 6000 };
    expect(minZoom(wall)).toBe(96);
    expect(clampCamera({ zoom: 500, x: 0, y: 0 }, wall).zoom).toBe(96);
  });
});

describe('the farm cannot be lost off screen', () => {
  it('zoomed in, the screen never shows past the margin round the farm', () => {
    const next = scatter(42);
    for (const vp of [PHONE_UPRIGHT, PHONE_ON_ITS_SIDE, PC]) {
      for (let k = 0; k < 400; k++) {
        const cam = clampCamera(
          { zoom: 5 + next() * 150, x: (next() - 0.5) * 400, y: (next() - 0.5) * 400 },
          vp,
        );
        const [x0, y0, x1, y1] = visibleWorld(cam, vp);
        const wide = x1 - x0;
        const tall = y1 - y0;
        if (wide <= BOX.x1 - BOX.x0 + 1e-9) {
          expect(x0).toBeGreaterThanOrEqual(BOX.x0 - 1e-9);
          expect(x1).toBeLessThanOrEqual(BOX.x1 + 1e-9);
        } else {
          // The farm is narrower than the screen: it sits in the middle.
          expect((x0 + x1) / 2).toBeCloseTo((BOX.x0 + BOX.x1) / 2, 9);
        }
        if (tall <= BOX.y1 - BOX.y0 + 1e-9) {
          expect(y0).toBeGreaterThanOrEqual(BOX.y0 - 1e-9);
          expect(y1).toBeLessThanOrEqual(BOX.y1 + 1e-9);
        } else {
          expect((y0 + y1) / 2).toBeCloseTo((BOX.y0 + BOX.y1) / 2, 9);
        }
      }
    }
  });

  it('however far it is dragged, some of the farm is still on screen', () => {
    let cam = lookAt(PC, 60, 20, 9);
    for (let k = 0; k < 50; k++) cam = panBy(cam, PC, 5000, 3000);
    let [x0, y0, x1, y1] = visibleWorld(cam, PC);
    expect(x1).toBeGreaterThan(0);
    expect(y1).toBeGreaterThan(0);
    for (let k = 0; k < 50; k++) cam = panBy(cam, PC, -5000, -3000);
    [x0, y0, x1, y1] = visibleWorld(cam, PC);
    expect(x0).toBeLessThan(WORLD_W);
    expect(y0).toBeLessThan(WORLD_H);
  });

  it('a camera with a broken number in it comes back to the farm', () => {
    const cam = clampCamera({ zoom: Number.NaN, x: Number.NaN, y: Infinity }, PC);
    expect(Number.isFinite(cam.zoom)).toBe(true);
    expect(Number.isFinite(cam.x)).toBe(true);
    expect(Number.isFinite(cam.y)).toBe(true);
  });
});

describe('moving the camera', () => {
  const start: Camera = lookAt(PC, 50, 20, 9);

  it('screen and world points turn into each other and back', () => {
    const w = screenToWorld(start, PC, 300, 500);
    const s = worldToScreen(start, PC, w.x, w.y);
    expect(s.x).toBeCloseTo(300, 9);
    expect(s.y).toBeCloseTo(500, 9);
    // The middle of the screen is the camera's point.
    expect(screenToWorld(start, PC, PC.width / 2, PC.height / 2)).toEqual({
      x: start.x,
      y: start.y,
    });
  });

  it('a drag carries the ground with the finger', () => {
    const under = screenToWorld(start, PC, 700, 400);
    const cam = panBy(start, PC, 120, -60);
    const now = worldToScreen(cam, PC, under.x, under.y);
    expect(now.x).toBeCloseTo(820, 9);
    expect(now.y).toBeCloseTo(340, 9);
  });

  it('the wheel zooms at the pointer: the ground under it stays put', () => {
    const under = screenToWorld(start, PC, 900, 300);
    const cam = zoomAt(start, PC, 80, 900, 300);
    expect(cam.zoom).toBe(80);
    const now = worldToScreen(cam, PC, under.x, under.y);
    expect(now.x).toBeCloseTo(900, 6);
    expect(now.y).toBeCloseTo(300, 6);
  });

  it('zooming past a limit stops at the limit', () => {
    expect(zoomAt(start, PC, 5000, 100, 100).zoom).toBe(96);
    expect(zoomAt(start, PC, 0.01, 100, 100).zoom).toBeCloseTo(minZoom(PC), 10);
  });

  it('a pinch that spreads the fingers to twice as far apart doubles the zoom', () => {
    const cam = lookAt(PHONE_UPRIGHT, 30, 20, 9);
    const a0 = { x: 150, y: 300 };
    const b0 = { x: 250, y: 300 };
    const a1 = { x: 100, y: 300 };
    const b1 = { x: 300, y: 300 };
    const under = screenToWorld(cam, PHONE_UPRIGHT, 200, 300);
    const next = pinch(cam, PHONE_UPRIGHT, a0, b0, a1, b1);
    expect(next.zoom).toBeCloseTo(60, 9);
    // The ground between the fingers is still between them.
    const now = worldToScreen(next, PHONE_UPRIGHT, under.x, under.y);
    expect(now.x).toBeCloseTo(200, 6);
    expect(now.y).toBeCloseTo(300, 6);
  });

  it('two fingers moving together pan without zooming', () => {
    const cam = lookAt(PHONE_UPRIGHT, 40, 20, 9);
    const next = pinch(
      cam,
      PHONE_UPRIGHT,
      { x: 100, y: 200 },
      { x: 200, y: 200 },
      { x: 130, y: 240 },
      { x: 230, y: 240 },
    );
    expect(next.zoom).toBeCloseTo(40, 9);
    expect(next.x).toBeCloseTo(cam.x - 30 / 40, 9);
    expect(next.y).toBeCloseTo(cam.y - 40 / 40, 9);
  });

  it('turning the phone keeps the same middle and zoom', () => {
    const cam = lookAt(PHONE_UPRIGHT, 48, 22, 10);
    const turned = resized(cam, PHONE_ON_ITS_SIDE);
    expect(turned.zoom).toBe(48);
    expect(turned.x).toBeCloseTo(22, 9);
    expect(turned.y).toBeCloseTo(10, 9);
  });
});
