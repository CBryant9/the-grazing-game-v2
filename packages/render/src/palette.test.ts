import { PADDOCK_LABELS, VIEW_LAND } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { contrast, lit, luminance } from './colour';
import { squareLook } from './grass';
import { lightTint, mapTint, weatherTint } from './light';
import { CATTLE, NATURAL, THEMES, breedFor, paletteFor } from './palette';
import { cell, sampleView, setSquare } from './testing/sampleView';

/*
 * Cattle must never blur into the grass (PRD 7, CLAUDE.md rule 4).
 *
 * Every beast is drawn with a dark outline and, outside that, a thin pale
 * rim. On pale ground (straw, stubble) the dark line carries it. On dark
 * ground (old leaf, fallow, shaded soil) the pale rim does. The figure held
 * here: against every colour the ground or grass can be, the better of the
 * two is at least 3 to 1 (the WCAG figure for graphics), in every light the
 * map is played in.
 */
const CATTLE_CONTRAST = 3;

/** Every colour a square can be drawn in: ground, field, leaf and dry tops, across the view's range. */
function grassColours(): number[] {
  const out = new Set<number>();
  const view = sampleView();
  const i = cell(8, 8);
  for (const land of [
    VIEW_LAND.native,
    VIEW_LAND.sown,
    VIEW_LAND.annual,
    VIEW_LAND.crop,
    VIEW_LAND.fallow,
    VIEW_LAND.stubble,
  ]) {
    for (const green of [0, 5, 10, 15, 20]) {
      for (const cover of [0, 5, 10]) {
        for (const leafAge of [0, 5, 10]) {
          for (const weathered of [0, 5, 10]) {
            for (const seedHeads of [0, 1]) {
              setSquare(view, i, {
                land,
                heightCm: 40,
                green,
                cover,
                leafAge,
                weathered,
                seedHeads,
              });
              const l = squareLook(view, i);
              out.add(l.ground).add(l.field).add(l.leaf).add(l.straw);
            }
          }
        }
      }
    }
  }
  for (const c of [NATURAL.soil, NATURAL.litter, NATURAL.shaded, NATURAL.fallow, NATURAL.stubble]) {
    out.add(c);
  }
  return [...out];
}

/** The lights the map is played in: the day, first and last light, and under cloud and rain. */
const LIGHTS: [string, number][] = [
  ['midday', NATURAL.lightDay],
  ['first light', NATURAL.lightFirst],
  ['last light', NATURAL.lightLast],
  ['overcast', NATURAL.lightOvercast],
  ['rain', NATURAL.lightRain],
  ['rain at first light', lit(NATURAL.lightFirst, NATURAL.lightRain)],
  ['rain at last light', lit(NATURAL.lightLast, NATURAL.lightRain)],
];

describe('cattle never blur into the grass', () => {
  const grass = grassColours();

  it('the test covers a wide spread of ground and grass colours, dark and pale', () => {
    expect(grass.length).toBeGreaterThan(150);
    const lums = grass.map(luminance);
    expect(Math.min(...lums)).toBeLessThan(0.1);
    expect(Math.max(...lums)).toBeGreaterThan(0.5);
  });

  it.each(LIGHTS)(
    'the outline or the pale rim stands out at 3 to 1 or better on every grass colour: %s',
    (_name, light) => {
      const outline = lit(NATURAL.cattleOutline, light);
      const halo = lit(NATURAL.cattleHalo, light);
      let worst = Infinity;
      for (const g of grass) {
        const ground = lit(g, light);
        const best = Math.max(contrast(outline, ground), contrast(halo, ground));
        worst = Math.min(worst, best);
      }
      expect(worst).toBeGreaterThanOrEqual(CATTLE_CONTRAST);
    },
  );

  it('the colours are the same in both themes: only the map surround and labels change', () => {
    expect(paletteFor('light').natural).toBe(paletteFor('dark').natural);
    expect(paletteFor('light').cattle).toBe(paletteFor('dark').cattle);
    expect(paletteFor('light').ui).not.toEqual(paletteFor('dark').ui);
  });

  it('the dark outline stands out from every pale body, and the pale rim from every dark one', () => {
    for (const breed of ['british', 'brahman'] as const) {
      for (const [kind, c] of Object.entries(CATTLE[breed])) {
        const best = Math.max(
          contrast(NATURAL.cattleOutline, c.body),
          contrast(NATURAL.cattleHalo, c.body),
        );
        expect(best, `${breed} ${kind}`).toBeGreaterThanOrEqual(CATTLE_CONTRAST);
      }
    }
  });

  it('within a breed, each kind of beast has its own body colour', () => {
    for (const breed of ['british', 'brahman'] as const) {
      const bodies = Object.values(CATTLE[breed]).map((c) => c.body);
      expect(new Set(bodies).size).toBe(bodies.length);
    }
  });

  it('Central Queensland runs Brahman-style cattle and the south British breeds', () => {
    expect(breedFor('cq')).toBe('brahman');
    for (const d of ['nsw', 'cw', 'wv']) expect(breedFor(d)).toBe('british');
    // Brahman cows are pale grey. British cows are black.
    expect(luminance(CATTLE.brahman.cow.body)).toBeGreaterThan(0.4);
    expect(luminance(CATTLE.british.cow.body)).toBeLessThan(0.03);
  });
});

describe('labels and markers can be read in both themes (WCAG AA, 4.5 to 1)', () => {
  it.each(['dark', 'light'] as const)('%s theme', (theme) => {
    const ui = THEMES[theme];
    expect(contrast(ui.labelText, ui.labelBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ui.labelMuted, ui.labelBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ui.noWater, ui.labelBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ui.markerText, ui.markerBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ui.noWater, ui.markerBg)).toBeGreaterThanOrEqual(4.5);
    // The marker's border stands out from its own background.
    expect(contrast(ui.markerLine, ui.markerBg)).toBeGreaterThanOrEqual(3);
    for (const label of Object.values(PADDOCK_LABELS)) {
      const chip = Number.parseInt(label.colour.slice(1), 16);
      expect(contrast(ui.chipText, chip), label.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the paddock labels are the four neutral words', () => {
    expect(Object.values(PADDOCK_LABELS).map((l) => l.name)).toEqual([
      'Green',
      'Mixed',
      'Dry & rank',
      'Short',
    ]);
  });
});

describe('fences read against the ground', () => {
  it('every wire has a dark casing under it that stands out from pale ground, and a colour that stands out from the casing', () => {
    for (const wire of [NATURAL.fencePermanent, NATURAL.fenceElectric, NATURAL.fenceTape]) {
      expect(contrast(wire, NATURAL.fenceCasing)).toBeGreaterThanOrEqual(3);
    }
    for (const pale of [NATURAL.strawFresh, NATURAL.stubble, NATURAL.litter, NATURAL.leafYoung]) {
      expect(contrast(NATURAL.fenceCasing, pale)).toBeGreaterThanOrEqual(4.5);
    }
    // The three fence kinds are told apart by colour.
    expect(contrast(NATURAL.fenceElectric, NATURAL.fencePermanent)).toBeGreaterThan(2);
    expect(contrast(NATURAL.fenceTape, NATURAL.fencePermanent)).toBeGreaterThan(3);
  });
});

describe('time of day and weather', () => {
  const first = 330;
  const last = 1110;

  it('the middle of the day is plain white light', () => {
    expect(lightTint(720, first, last)).toBe(0xffffff);
    expect(mapTint(null, first, last, 'clear')).toBe(0xffffff);
  });

  it('first light and last light are warm and low: more red than blue, dimmer than midday', () => {
    for (const t of [first, last]) {
      const c = lightTint(t, first, last);
      expect((c >> 16) & 255).toBeGreaterThan(c & 255);
      expect(luminance(c)).toBeLessThan(0.75);
      expect(luminance(c)).toBeGreaterThan(0.4);
    }
  });

  it('outside the day it is dark blue', () => {
    for (const t of [0, first - 60, last + 60, 1439]) {
      const c = lightTint(t, first, last);
      expect(c).toBe(NATURAL.lightNight);
      expect(c & 255).toBeGreaterThan((c >> 16) & 255);
    }
    expect(luminance(NATURAL.lightNight)).toBeLessThan(0.2);
  });

  it('the light changes smoothly across the whole day, with no jump', () => {
    let prev = lightTint(first - 90, first, last);
    for (let t = first - 89; t <= last + 90; t++) {
      const now = lightTint(t, first, last);
      for (const shift of [16, 8, 0]) {
        expect(Math.abs(((now >> shift) & 255) - ((prev >> shift) & 255))).toBeLessThanOrEqual(6);
      }
      prev = now;
    }
  });

  it('it gets steadily brighter from first light to full day, and dimmer again to last light', () => {
    let prev = luminance(lightTint(first, first, last));
    for (let t = first + 10; t <= first + 110; t += 10) {
      const now = luminance(lightTint(t, first, last));
      expect(now).toBeGreaterThanOrEqual(prev);
      prev = now;
    }
    expect(lightTint(first + 110, first, last)).toBe(0xffffff);
    expect(lightTint(last - 110, first, last)).toBe(0xffffff);
    expect(luminance(lightTint(last - 30, first, last))).toBeLessThan(1);
  });

  it('a short winter day still has a warm start and end', () => {
    const c = lightTint(500, 480, 620);
    expect(c).not.toBe(0xffffff);
    expect(lightTint(550, 480, 620)).toBe(0xffffff);
  });

  it('cloud dims the map and rain dims it more, at any time of day', () => {
    expect(weatherTint('clear')).toBe(0xffffff);
    const clear = luminance(mapTint(720, first, last, 'clear'));
    const overcast = luminance(mapTint(720, first, last, 'overcast'));
    const rain = luminance(mapTint(720, first, last, 'rain'));
    expect(overcast).toBeLessThan(clear);
    expect(rain).toBeLessThan(overcast);
    expect(luminance(mapTint(first, first, last, 'rain'))).toBeLessThan(
      luminance(mapTint(first, first, last, 'clear')),
    );
  });
});
