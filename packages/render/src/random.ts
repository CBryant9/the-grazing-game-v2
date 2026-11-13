/**
 * Repeatable scatter for the drawing: where a tuft sits in its square, where
 * a beast stands. The same inputs always give the same numbers, so nothing
 * on the map jumps about between frames or days for no reason.
 *
 * This is for looks only. It has nothing to do with the game's own random
 * numbers, which never leave the server.
 */

/** Mix two whole numbers into one well-spread 32-bit number. */
export function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

export const hash3 = (a: number, b: number, c: number): number => hash2(hash2(a, b), c);

/** A 32-bit number as a fraction in [0, 1). */
export const unit = (h: number): number => (h >>> 0) / 4294967296;

/** A small repeatable generator (mulberry32). Each call gives the next number in [0, 1). */
export function scatter(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
