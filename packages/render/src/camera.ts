/**
 * The camera: which part of the farm is on screen, and how big.
 *
 * Plain arithmetic, no drawing. The camera is the world point at the middle
 * of the screen and a zoom in screen pixels per square. Every change goes
 * through `clampCamera`, so the zoom stays in range and the farm can never
 * be lost off screen.
 */

import { WORLD_H, WORLD_W } from './grid';

export interface Viewport {
  /** Width and height of the map on screen, in CSS pixels. */
  width: number;
  height: number;
}

export interface Camera {
  /** Screen pixels per square. */
  zoom: number;
  /** The world point at the middle of the screen. */
  x: number;
  y: number;
}

/** Space kept round the farm, in squares. The top is taller for the windmill and trees. */
export const FARM_MARGIN = { side: 0.8, top: 2.4, bottom: 0.8 } as const;

/** The closest zoom, in screen pixels per square. */
export const MAX_ZOOM = 96;

/** The farm with its margins, in world units. */
const BOX = {
  x0: -FARM_MARGIN.side,
  x1: WORLD_W + FARM_MARGIN.side,
  y0: -FARM_MARGIN.top,
  y1: WORLD_H + FARM_MARGIN.bottom,
} as const;
const BOX_W = BOX.x1 - BOX.x0;
const BOX_H = BOX.y1 - BOX.y0;

/** The zoom at which the whole farm, with its margins, just fits. */
export function containZoom(vp: Viewport): number {
  return Math.min(vp.width / BOX_W, vp.height / BOX_H);
}

/** The zoom at which the farm fills the screen's height. On a phone held upright it runs past the sides. */
export function fillHeightZoom(vp: Viewport): number {
  return vp.height / BOX_H;
}

/** The furthest out the camera goes: the whole farm in view. Never closer than the closest zoom. */
export const minZoom = (vp: Viewport): number => Math.min(containZoom(vp), MAX_ZOOM);

/** Hold a zoom between the furthest and the closest. */
export function clampZoom(zoom: number, vp: Viewport): number {
  const lo = minZoom(vp);
  if (!Number.isFinite(zoom)) return lo;
  return zoom < lo ? lo : zoom > MAX_ZOOM ? MAX_ZOOM : zoom;
}

/** One axis: centre the farm if it is smaller than the screen, otherwise keep the screen inside it. */
function clampAxis(centre: number, span: number, lo: number, hi: number): number {
  if (span >= hi - lo) return (lo + hi) / 2;
  const min = lo + span / 2;
  const max = hi - span / 2;
  return centre < min ? min : centre > max ? max : centre;
}

/** A camera held in range: zoom between the limits, and the screen never off the farm. */
export function clampCamera(cam: Camera, vp: Viewport): Camera {
  const zoom = clampZoom(cam.zoom, vp);
  const x = Number.isFinite(cam.x) ? cam.x : WORLD_W / 2;
  const y = Number.isFinite(cam.y) ? cam.y : WORLD_H / 2;
  return {
    zoom,
    x: clampAxis(x, vp.width / zoom, BOX.x0, BOX.x1),
    y: clampAxis(y, vp.height / zoom, BOX.y0, BOX.y1),
  };
}

/** Where a world point lands on screen. */
export function worldToScreen(
  cam: Camera,
  vp: Viewport,
  wx: number,
  wy: number,
): { x: number; y: number } {
  return {
    x: (wx - cam.x) * cam.zoom + vp.width / 2,
    y: (wy - cam.y) * cam.zoom + vp.height / 2,
  };
}

/** The world point under a screen point. */
export function screenToWorld(
  cam: Camera,
  vp: Viewport,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return {
    x: (sx - vp.width / 2) / cam.zoom + cam.x,
    y: (sy - vp.height / 2) / cam.zoom + cam.y,
  };
}

/** The part of the world on screen: [x0, y0, x1, y1]. */
export function visibleWorld(cam: Camera, vp: Viewport): [number, number, number, number] {
  const hw = vp.width / cam.zoom / 2;
  const hh = vp.height / cam.zoom / 2;
  return [cam.x - hw, cam.y - hh, cam.x + hw, cam.y + hh];
}

export type FitMode = 'contain' | 'fill-height' | 'auto';

/**
 * A camera that shows the farm. `contain` shows all of it. `fill-height`
 * fills the screen's height. `auto` fills the height on a screen taller
 * than it is wide (a phone held upright, PRD 6.1) and shows it all otherwise.
 */
export function fitFarm(vp: Viewport, mode: FitMode = 'auto'): Camera {
  const fill = mode === 'fill-height' || (mode === 'auto' && vp.height > vp.width);
  return clampCamera(
    {
      zoom: fill ? fillHeightZoom(vp) : containZoom(vp),
      x: (BOX.x0 + BOX.x1) / 2,
      y: (BOX.y0 + BOX.y1) / 2,
    },
    vp,
  );
}

/** Move the camera by a drag of (dx, dy) screen pixels. The farm follows the finger. */
export function panBy(cam: Camera, vp: Viewport, dx: number, dy: number): Camera {
  return clampCamera({ zoom: cam.zoom, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom }, vp);
}

/**
 * Zoom to a new level, keeping the world point under a screen point where
 * it is (the mouse pointer, or the middle of a pinch).
 */
export function zoomAt(cam: Camera, vp: Viewport, zoom: number, sx: number, sy: number): Camera {
  const z = clampZoom(zoom, vp);
  const anchor = screenToWorld(cam, vp, sx, sy);
  return clampCamera(
    {
      zoom: z,
      x: anchor.x - (sx - vp.width / 2) / z,
      y: anchor.y - (sy - vp.height / 2) / z,
    },
    vp,
  );
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A two-finger move. The fingers went from (a0, b0) to (a1, b1), in screen
 * pixels. The camera zooms by how far they spread and pans by how far their
 * middle moved, so the ground stays under the fingers.
 */
export function pinch(
  cam: Camera,
  vp: Viewport,
  a0: Point,
  b0: Point,
  a1: Point,
  b1: Point,
): Camera {
  const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
  const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const factor = d0 > 1 ? d1 / d0 : 1;
  const z = clampZoom(cam.zoom * factor, vp);
  // The world point that was under the middle of the fingers stays under it.
  const anchor = screenToWorld(cam, vp, m0.x, m0.y);
  return clampCamera(
    {
      zoom: z,
      x: anchor.x - (m1.x - vp.width / 2) / z,
      y: anchor.y - (m1.y - vp.height / 2) / z,
    },
    vp,
  );
}

/** A camera centred on a world point at a zoom. */
export function lookAt(vp: Viewport, zoom: number, wx: number, wy: number): Camera {
  return clampCamera({ zoom, x: wx, y: wy }, vp);
}

/** After the screen changes size or turns: the same middle and zoom, held in range. */
export function resized(cam: Camera, vp: Viewport): Camera {
  return clampCamera(cam, vp);
}
