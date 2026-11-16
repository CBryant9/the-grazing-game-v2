/**
 * Level of detail: a clear map zoomed out, detail zoomed in (PRD 7, style S5).
 *
 * Zoomed out, each square is a clean field of colour and each mob is one
 * marker with a head count. Zoomed in, grass tufts and individual cattle
 * appear.
 *
 * The switch is by zoom, and the hand-over is a short fade in time, so
 * nothing pops and the map never sits half way between the two pictures.
 */

/** At or below about this many screen pixels per square, mobs become one marker (PRD 7). */
export const LOD_SWITCH_PX_PER_SQUARE = 26;

/**
 * Slack either side of the switch point, in pixels per square. Once zoomed
 * in, the detail stays until the zoom drops this far below the switch point,
 * and the other way about, so a pinch that hovers at the switch point does
 * not flicker between the two.
 */
export const LOD_SLACK = 1;

/** How long the fade between the two pictures takes, in milliseconds. */
export const LOD_FADE_MS = 220;

export type LodMode = 'far' | 'near';

/**
 * Which picture to show at a zoom, in screen pixels per square. `previous`
 * is the picture showing now, if any.
 */
export function lodMode(pxPerSquare: number, previous?: LodMode): LodMode {
  if (previous === 'near') {
    return pxPerSquare <= LOD_SWITCH_PX_PER_SQUARE - LOD_SLACK ? 'far' : 'near';
  }
  if (previous === 'far') {
    return pxPerSquare > LOD_SWITCH_PX_PER_SQUARE + LOD_SLACK ? 'near' : 'far';
  }
  return pxPerSquare > LOD_SWITCH_PX_PER_SQUARE ? 'near' : 'far';
}

/**
 * One step of the fade. `near` is how strongly the zoomed-in detail shows
 * now, 0 to 1. It moves towards the picture wanted at a steady rate and
 * stops there. `instant` (reduce motion) goes straight to it.
 */
export function fadeStep(near: number, mode: LodMode, elapsedMs: number, instant = false): number {
  const target = mode === 'near' ? 1 : 0;
  if (instant || near === target) return target;
  const step = Math.max(0, elapsedMs) / LOD_FADE_MS;
  return target > near ? Math.min(target, near + step) : Math.max(target, near - step);
}

/** Ease the fade in and out, so it does not start or stop with a jolt. */
export const easeFade = (t: number): number => {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * (3 - 2 * k);
};
