/**
 * Draws on head counts from a seeded stream (milestone 2.3, second pass).
 *
 * A sheep record stands for a number of like animals, so a death risk, a
 * conception or a strike is drawn as how many of the record it happens to,
 * not one draw an animal. The draws are deterministic for a stream's state,
 * so the same seed still gives the same farm.
 */

import type { Rng } from '../rng';

/** Under this many head, one draw an animal (exact). */
const EXACT_HEAD = 40;
/** Under this mean, the exact count by walking the distribution from 0. */
const WALK_MEAN = 30;

/**
 * How many of `n` it happens to, each with chance `p`. Exact for small
 * counts and small means; the normal approximation (rounded, held to 0 to
 * n) for large means. Uses one draw unless `n` is small.
 */
export function binomial(n: number, p: number, rng: Rng): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n <= EXACT_HEAD) {
    let k = 0;
    for (let i = 0; i < n; i++) if (rng.next() < p) k++;
    return k;
  }
  if (p > 0.5) return n - binomial(n, 1 - p, rng);
  const mean = n * p;
  if (mean <= WALK_MEAN) {
    // Walk the distribution: P(0) = (1 − p)^n, P(k+1) = P(k) × (n − k)/(k + 1) × p/(1 − p).
    const u = rng.next();
    const r = p / (1 - p);
    let pk = Math.exp(n * Math.log1p(-p));
    let cdf = pk;
    let k = 0;
    while (u > cdf && k < n) {
      pk *= ((n - k) / (k + 1)) * r;
      k++;
      cdf += pk;
    }
    return k;
  }
  const k = Math.round(mean + Math.sqrt(mean * (1 - p)) * rng.gauss());
  return k < 0 ? 0 : k > n ? n : k;
}

/** Share `n` among outcomes with chances `ps` (summing to 1): sequential binomials. */
export function multinomial(n: number, ps: readonly number[], rng: Rng): number[] {
  const out = new Array<number>(ps.length).fill(0);
  let left = n;
  let rest = 1;
  for (let i = 0; i < ps.length; i++) {
    if (left <= 0) break;
    if (i === ps.length - 1) {
      out[i] = left;
      break;
    }
    const p = rest > 0 ? Math.min(1, ps[i]! / rest) : 0;
    const k = binomial(left, p, rng);
    out[i] = k;
    left -= k;
    rest -= ps[i]!;
  }
  return out;
}
