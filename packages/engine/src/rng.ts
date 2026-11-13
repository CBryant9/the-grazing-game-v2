/**
 * Seeded random numbers.
 *
 * Every farm is repeatable from its seed. Each part of the simulation draws
 * from its own named stream, so a change in one part (say, the workforce)
 * never shifts the numbers in another (say, breeding). See BUILD_PLAN 2.3.
 *
 * Nothing in the engine may call Math.random or read the clock.
 */

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** A float in [lo, hi). */
  range(lo: number, hi: number): number;
  /** An integer in [lo, hi], both ends included. */
  int(lo: number, hi: number): number;
  /** True with the given chance (0 to 1). */
  chance(p: number): boolean;
  /** One item of a non-empty list. */
  pick<T>(items: readonly T[]): T;
  /** A normally distributed number (mean 0, standard deviation 1). */
  gauss(): number;
  /** The stream's state, for saving. */
  state(): RngState;
}

/** Four 32-bit words. Small enough to store with every farm save. */
export type RngState = readonly [number, number, number, number];

/** 32-bit string hash (FNV-1a), used to turn a stream name into numbers. */
export function hash32(text: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** splitmix32: spreads one 32-bit seed into well-mixed words. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/** Build a generator (sfc32) from a saved state. */
export function rngFromState(saved: RngState): Rng {
  let [a, b, c, d] = saved;
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;

  const next = (): number => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t / 4294967296;
  };

  const rng: Rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick: empty list');
      return items[Math.floor(next() * items.length)] as T;
    },
    gauss: () => {
      // Box-Muller. 1 - next() keeps the log away from zero.
      const u = 1 - next();
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    state: () => [a, b, c, d] as const,
  };
  return rng;
}

/**
 * A named stream for a farm. The same seed and name always give the same
 * numbers, and different names give unrelated numbers.
 */
export function rngStream(farmSeed: number, name: string): Rng {
  const mix = splitmix32((farmSeed ^ hash32(name)) >>> 0);
  const rng = rngFromState([mix(), mix(), mix(), mix()]);
  // Warm up, as recommended for sfc32, so early draws are well mixed.
  for (let i = 0; i < 12; i++) rng.next();
  return rng;
}
