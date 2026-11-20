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

// ---------------------------------------------------------------------------
// Cattle zoomed out (19 Nov 2026: "I would like to see the cows when zoomed
// out if the densities aren't too large")
// ---------------------------------------------------------------------------

/**
 * Zoomed out, a mob too crowded for every beast to show as a dot is still
 * drawn as dots, but only every so many of its beasts, so the dots stand
 * about `DOT_MIN_SPACING_PX` apart (20 Nov 2026: the first version filled
 * its squares as a solid patch, which read as black blocks, not cattle).
 * Under those dots the ground it takes up gets this shade (0 to 1) of the
 * footprint colour, deeper than an open mob's 0.14, so a crowded mob reads
 * as dense. The dots carry the contrast; the palette test holds them to
 * 3 to 1 on the shaded ground too. Drawing figure (builder).
 */
export const HERD_CROWD_SHADE = 0.18;

/** The footprint colour laid under a mob zoomed out. */
export const HERD_FOOTPRINT = 0x281a0a;

/** Zoomed out, each beast drawn is a dot this many screen pixels across. */
export const DOT_PX = 3.5;

/**
 * Zoomed out, every beast drawn shows as a dot while its cattle stand at
 * least this many screen pixels apart (at their true density). Closer than
 * that the dots would run into a blob, so only every so many beasts are
 * dotted, keeping the dots about this far apart (`HERD_CROWD_SHADE`).
 */
export const DOT_MIN_SPACING_PX = 4.5;

/**
 * How far apart a mob's cattle stand on screen, in pixels, at their true
 * density: `herdM2` square metres for `head` head, at `pxPerSquare` on
 * squares `sideM` metres a side.
 */
export function herdSpacingPx(
  herdM2: number,
  head: number,
  pxPerSquare: number,
  sideM: number,
): number {
  if (head <= 0) return Infinity;
  return (Math.sqrt(herdM2 / head) * pxPerSquare) / Math.max(1, sideM);
}

/** Zoomed out: dot every beast (true), or thin the dots out because the mob is crowded (false). */
export const herdAsDots = (
  herdM2: number,
  head: number,
  pxPerSquare: number,
  sideM: number,
): boolean => herdSpacingPx(herdM2, head, pxPerSquare, sideM) >= DOT_MIN_SPACING_PX;
