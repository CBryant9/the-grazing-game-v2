import { describe, expect, it } from 'vitest';
import {
  DOT_MIN_SPACING_PX,
  DOT_PX,
  LOD_FADE_MS,
  easeFade,
  fadeStep,
  herdAsDots,
  herdSpacingPx,
  lodMode,
} from './lod';
import { DEFAULT_LAYERS, MAP_LAYER_IDS, MAP_LAYER_INFO, toggleLayer, withLayers } from './layers';

describe('cattle zoomed out: dots, or a patch where they are too close to read', () => {
  const side = (ha: number): number => Math.sqrt(ha / 1040) * 100;

  it('spacing follows the true density on screen', () => {
    // 100 head on 4 ha is 20 m apart. On 100 m squares at 25 px a square that is 5 px.
    expect(herdSpacingPx(40000, 100, 25, 100)).toBeCloseTo(5, 5);
    expect(herdSpacingPx(40000, 0, 25, 100)).toBe(Infinity);
  });

  it('a 200 ha farm seen whole shows each mob as dots', () => {
    expect(herdAsDots(900 * 400, 900, 25, side(200))).toBe(true);
  });

  it('900 head at grazing density on 3,000 ha seen whole is a patch; spread over a big paddock, dots', () => {
    expect(herdAsDots(900 * 400, 900, 25, side(3000))).toBe(false);
    expect(herdAsDots(900 * 2000, 900, 25, side(3000))).toBe(true);
  });

  it('the dots are a few pixels across, and need a little room between them', () => {
    expect(DOT_PX).toBeGreaterThanOrEqual(3);
    expect(DOT_MIN_SPACING_PX).toBeGreaterThan(DOT_PX);
  });
});

describe('level of detail by zoom', () => {
  it('at 26 pixels a square or less, mobs are markers. Above it, cattle are drawn', () => {
    expect(lodMode(26)).toBe('far');
    expect(lodMode(25.9)).toBe('far');
    expect(lodMode(9)).toBe('far');
    expect(lodMode(26.1)).toBe('near');
    expect(lodMode(96)).toBe('near');
  });

  it('a pinch that hovers at the switch point does not flicker: each picture holds for a pixel past it', () => {
    // Zooming in from the clean map: it holds to 27, then the detail shows.
    expect(lodMode(26.5, 'far')).toBe('far');
    expect(lodMode(27, 'far')).toBe('far');
    expect(lodMode(27.1, 'far')).toBe('near');
    // Zooming out from the detail: it holds down to 25, then the clean map shows.
    expect(lodMode(25.5, 'near')).toBe('near');
    expect(lodMode(25.1, 'near')).toBe('near');
    expect(lodMode(25, 'near')).toBe('far');
    // Well clear of the switch point the last picture does not matter.
    expect(lodMode(12, 'near')).toBe('far');
    expect(lodMode(60, 'far')).toBe('near');
  });

  it('the hand-over is a fade over about a fifth of a second, never a pop', () => {
    expect(LOD_FADE_MS).toBe(220);
    // One frame at 60 a second moves the fade a small step.
    const one = fadeStep(0, 'near', 16.7);
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(0.1);
    // It gets there in about 14 frames and stops exactly at the end.
    let near = 0;
    let frames = 0;
    while (near < 1 && frames < 100) {
      const next = fadeStep(near, 'near', 16.7);
      expect(next - near).toBeLessThan(0.1);
      near = next;
      frames++;
    }
    expect(near).toBe(1);
    expect(frames).toBe(14);
    // And back again.
    expect(fadeStep(1, 'far', 110)).toBeCloseTo(0.5, 10);
    expect(fadeStep(0.2, 'far', 1000)).toBe(0);
    // Once it is there, it stays there.
    expect(fadeStep(1, 'near', 16.7)).toBe(1);
    expect(fadeStep(0, 'far', 16.7)).toBe(0);
  });

  it('with reduce motion the change is made at once', () => {
    expect(fadeStep(0, 'near', 16.7, true)).toBe(1);
    expect(fadeStep(1, 'far', 16.7, true)).toBe(0);
    expect(fadeStep(0.4, 'far', 0, true)).toBe(0);
  });

  it('the fade eases in and out and never overshoots', () => {
    expect(easeFade(0)).toBe(0);
    expect(easeFade(1)).toBe(1);
    expect(easeFade(0.5)).toBeCloseTo(0.5, 10);
    expect(easeFade(-1)).toBe(0);
    expect(easeFade(2)).toBe(1);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      expect(easeFade(t)).toBeGreaterThanOrEqual(last);
      last = easeFade(t);
    }
  });
});

describe('map layers', () => {
  it('labels start on and every wash starts off', () => {
    expect(DEFAULT_LAYERS).toEqual({
      waterReach: false,
      quality: false,
      grazed: false,
      arable: false,
      pipe: false,
      labels: true,
      profit: false,
    });
  });

  it('the layers are the ones docs/VISUALS.md lists, each with a name', () => {
    expect([...MAP_LAYER_IDS].sort()).toEqual(
      ['arable', 'grazed', 'labels', 'pipe', 'profit', 'quality', 'waterReach'].sort(),
    );
    expect(MAP_LAYER_INFO.waterReach.name).toBe('Water reach');
    expect(MAP_LAYER_INFO.quality.name).toBe('Pasture quality');
    expect(MAP_LAYER_INFO.grazed.name).toBe('Recently grazed');
    expect(MAP_LAYER_INFO.arable.name).toBe('Arable land');
    expect(MAP_LAYER_INFO.pipe.name).toBe('Pipe');
    expect(MAP_LAYER_INFO.labels.name).toBe('Labels');
    // The profit layer needs figures for each beast, which the view does not carry yet.
    expect(MAP_LAYER_INFO.profit.drawn).toBe(false);
  });

  it('a change sets only what it names', () => {
    const next = withLayers(DEFAULT_LAYERS, { quality: true, labels: false });
    expect(next.quality).toBe(true);
    expect(next.labels).toBe(false);
    expect(next.waterReach).toBe(false);
    // The layers passed in are not changed.
    expect(DEFAULT_LAYERS.quality).toBe(false);
  });

  it('names it does not know, and values that are not on or off, are ignored', () => {
    const odd = { nonsense: true, quality: 'yes' } as unknown as Partial<typeof DEFAULT_LAYERS>;
    expect(withLayers(DEFAULT_LAYERS, odd)).toEqual(DEFAULT_LAYERS);
  });

  it('a toggle flips one layer and flips it back', () => {
    const on = toggleLayer(DEFAULT_LAYERS, 'grazed');
    expect(on.grazed).toBe(true);
    expect(toggleLayer(on, 'grazed')).toEqual(DEFAULT_LAYERS);
  });
});
