/**
 * Small number helpers.
 *
 * They are written exactly as the MVP wrote them, because the grass formulas
 * must give the same numbers bit for bit. Do not "tidy" the arithmetic.
 */

/** Hold a value between two limits. */
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Straight-line mix of two values. t = 0 gives a, t = 1 gives b. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
