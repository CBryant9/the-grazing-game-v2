import { describe, expect, it } from 'vitest';
import { blue, green, red } from './colour';
import { THEMES } from './palette';
import { SURROUND_TILE, paintSurround, surroundScale } from './surround';

const tile = (base: number, specks: readonly number[]): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(SURROUND_TILE * SURROUND_TILE * 4);
  paintSurround(base, specks, out);
  return out;
};

describe('the country round the farm', () => {
  it('is bush in both themes, the mockup colour in dark', () => {
    expect(THEMES.dark.surround).toBe(0x55653a);
    expect(THEMES.dark.surroundSpeck).toEqual([0x4a5832, 0x66753f, 0x5d6b3a]);
    // Light is a lighter bush, not a plain beige field.
    const lum = (c: number) => red(c) + green(c) + blue(c);
    expect(lum(THEMES.light.surround)).toBeGreaterThan(lum(THEMES.dark.surround));
    expect(green(THEMES.light.surround)).toBeGreaterThan(red(THEMES.light.surround));
  });

  it('paints the same tile every time, solid, in the theme colours only', () => {
    for (const theme of ['dark', 'light'] as const) {
      const { surround, surroundSpeck } = THEMES[theme];
      const a = tile(surround, surroundSpeck);
      expect(tile(surround, surroundSpeck)).toEqual(a);
      const all = [surround, ...surroundSpeck];
      const lo = [
        Math.min(...all.map(red)),
        Math.min(...all.map(green)),
        Math.min(...all.map(blue)),
      ];
      const hi = [
        Math.max(...all.map(red)),
        Math.max(...all.map(green)),
        Math.max(...all.map(blue)),
      ];
      let clumps = 0;
      for (let p = 0; p < a.length; p += 4) {
        expect(a[p + 3]).toBe(255);
        for (let k = 0; k < 3; k++) {
          expect(a[p + k]).toBeGreaterThanOrEqual(lo[k]! - 1);
          expect(a[p + k]).toBeLessThanOrEqual(hi[k]! + 1);
        }
        if (a[p] !== red(surround) || a[p + 1] !== green(surround)) clumps++;
      }
      // It has texture: a good part of the tile is under a clump.
      expect(clumps / (a.length / 4)).toBeGreaterThan(0.3);
    }
  });

  it('keeps its screen size zoomed out and grows with the farm zoomed in', () => {
    expect(surroundScale(4)).toBe(1);
    expect(surroundScale(10)).toBe(1);
    expect(surroundScale(96)).toBeGreaterThan(surroundScale(40));
  });
});
