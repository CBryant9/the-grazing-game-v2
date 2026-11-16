import { describe, expect, it } from 'vitest';
import { hash32, rngFromState, rngStream } from './rng';

describe('seeded random numbers', () => {
  it('gives the same numbers for the same seed and stream', () => {
    const a = rngStream(12345, 'breeding');
    const b = rngStream(12345, 'breeding');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('gives different numbers for different streams of one farm', () => {
    const a = rngStream(12345, 'breeding');
    const b = rngStream(12345, 'deaths');
    const same = Array.from({ length: 50 }, () => a.next() === b.next()).filter(Boolean).length;
    expect(same).toBe(0);
  });

  it('gives different numbers for different farms', () => {
    const a = rngStream(1, 'generate');
    const b = rngStream(2, 'generate');
    expect(a.next()).not.toBe(b.next());
  });

  it('carries on exactly from a saved state', () => {
    const a = rngStream(99, 'weather');
    for (let i = 0; i < 37; i++) a.next();
    const b = rngFromState(a.state());
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });

  it('stays inside its ranges', () => {
    const r = rngStream(7, 'ranges');
    for (let i = 0; i < 5000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 9);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
      const x = r.range(-2, 5);
      expect(x).toBeGreaterThanOrEqual(-2);
      expect(x).toBeLessThan(5);
    }
  });

  it('is evenly spread and its bell curve is centred', () => {
    const r = rngStream(2026, 'spread');
    const n = 40000;
    let sum = 0;
    let gSum = 0;
    let gSq = 0;
    for (let i = 0; i < n; i++) {
      sum += r.next();
      const g = r.gauss();
      gSum += g;
      gSq += g * g;
    }
    expect(sum / n).toBeCloseTo(0.5, 2);
    expect(gSum / n).toBeCloseTo(0, 1);
    expect(gSq / n).toBeCloseTo(1, 1);
  });

  it('hashes text the same way every time', () => {
    expect(hash32('breeding')).toBe(hash32('breeding'));
    expect(hash32('breeding')).not.toBe(hash32('deaths'));
  });

  it('refuses to pick from an empty list', () => {
    expect(() => rngStream(1, 'x').pick([])).toThrow();
  });
});
