import { PADDOCK_LABELS, VIEW_FORM, VIEW_LAND } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { contrast, lit, luminance, mix, shade } from './colour';
import { squareLook } from './grass';
import { lightTint, mapTint, weatherTint } from './light';
import { HERD_PATCH } from './lod';
import { CATTLE, NATURAL, SHEEP, THEMES, THIN_FLEECE, breedFor, paletteFor } from './palette';
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
              out.add(l.bare).add(l.base).add(l.floor);
              // Each way a pasture can sit on the ground has its own base colour.
              for (const form of Object.values(VIEW_FORM)) {
                setSquare(view, i, { form, hidden: cover * 2 });
                const f = squareLook(view, i);
                out.add(f.bare).add(f.base).add(f.floor).add(f.field);
              }
              view.squares.form = undefined;
              view.squares.hidden = undefined;
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

describe('sheep never blur into the grass', () => {
  const grass = grassColours();

  it.each(LIGHTS)(
    'the outline or the pale rim stands out at 3 to 1 or better on every grass colour: %s',
    (_name, light) => {
      const outline = lit(NATURAL.sheepOutline, light);
      const halo = lit(NATURAL.sheepHalo, light);
      let worst = Infinity;
      for (const g of grass) {
        const ground = lit(g, light);
        worst = Math.min(worst, Math.max(contrast(outline, ground), contrast(halo, ground)));
      }
      expect(worst).toBeGreaterThanOrEqual(CATTLE_CONTRAST);
    },
  );

  it('the outline stands out from every fleece, thin ones too, and from every head and leg', () => {
    for (const [kind, c] of Object.entries(SHEEP)) {
      for (const wool of [c.fleece, shade(c.fleece, THIN_FLEECE)]) {
        expect(contrast(NATURAL.sheepOutline, wool), `${kind} fleece`).toBeGreaterThanOrEqual(
          CATTLE_CONTRAST,
        );
      }
      // The face and legs are dark, so it is the pale rim that carries them.
      expect(contrast(NATURAL.sheepHalo, c.head), `${kind} head`).toBeGreaterThanOrEqual(
        CATTLE_CONTRAST,
      );
      expect(contrast(NATURAL.sheepHalo, c.legs), `${kind} legs`).toBeGreaterThanOrEqual(
        CATTLE_CONTRAST,
      );
      // The dark face stands out from the wool beside it.
      expect(contrast(c.head, c.fleece), `${kind} face`).toBeGreaterThanOrEqual(CATTLE_CONTRAST);
    }
  });

  it('wool is pale and a thin sheep is drawn darker than a sound one', () => {
    for (const c of Object.values(SHEEP)) {
      expect(luminance(c.fleece)).toBeGreaterThan(0.7);
      expect(luminance(shade(c.fleece, THIN_FLEECE))).toBeLessThan(luminance(c.fleece));
    }
  });

  it('uses the same outline and rim as the cattle, in both themes', () => {
    expect(NATURAL.sheepOutline).toBe(NATURAL.cattleOutline);
    expect(NATURAL.sheepHalo).toBe(NATURAL.cattleHalo);
    expect(paletteFor('light').sheep).toBe(paletteFor('dark').sheep);
  });
});

describe('zoomed out, herds never blur into the grass', () => {
  const grass = grassColours();
  /** The daytime lights: the day, first and last light, and under cloud. */
  const DAY = LIGHTS.slice(0, 4);

  it.each(DAY)(
    "a crowded mob's patch, or its rim, stands out at 3 to 1 or better on every ground and grass colour: %s",
    (_name, light) => {
      const P = HERD_PATCH;
      for (const [what, fill, alpha, rim] of [
        ['cattle', P.cattleFill, P.cattleAlpha, P.cattleRim],
        ['sheep', P.sheepFill, P.sheepAlpha, P.sheepRim],
      ] as const) {
        let worst = Infinity;
        for (const g of grass) {
          const ground = lit(g, light);
          // The patch is the fill laid over the ground at its opacity.
          const patch = lit(mix(g, fill, alpha), light);
          worst = Math.min(
            worst,
            Math.max(contrast(patch, ground), contrast(lit(rim, light), ground)),
          );
          // The rim stands out from the patch it goes round.
          expect(contrast(lit(rim, light), patch), what).toBeGreaterThanOrEqual(CATTLE_CONTRAST);
        }
        expect(worst, what).toBeGreaterThanOrEqual(CATTLE_CONTRAST);
      }
    },
  );

  it.each(DAY)(
    'a dot (dark middle and pale rim for cattle, the other way for sheep) stands out at 3 to 1: %s',
    (_name, light) => {
      for (const [inner, outer] of [
        [NATURAL.cattleOutline, NATURAL.cattleHalo],
        [NATURAL.sheepHalo, NATURAL.sheepOutline],
      ] as const) {
        expect(contrast(inner, outer)).toBeGreaterThanOrEqual(CATTLE_CONTRAST);
        for (const g of grass) {
          const ground = lit(g, light);
          const best = Math.max(
            contrast(lit(inner, light), ground),
            contrast(lit(outer, light), ground),
          );
          expect(best).toBeGreaterThanOrEqual(CATTLE_CONTRAST);
        }
      }
    },
  );

  it('the patch is filled more than half way, so it reads as a herd and not a shadow', () => {
    expect(HERD_PATCH.cattleAlpha).toBeGreaterThanOrEqual(0.7);
    expect(HERD_PATCH.sheepAlpha).toBeGreaterThanOrEqual(0.7);
    expect(HERD_PATCH.rimPx).toBeGreaterThanOrEqual(1);
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

describe('red means one thing: the part of a line that does not fit today (Claudia, 14 Nov 2026)', () => {
  /** Strongly red: a red channel well above green and blue. */
  const isRed = (c: number): boolean => {
    const r = (c >> 16) & 255;
    const g = (c >> 8) & 255;
    const b = c & 255;
    return r >= 170 && g <= 110 && b <= 110;
  };
  /** Every colour drawn as a line, a square tint or a marker on a line or square. */
  const onLinesAndSquares: Record<string, number> = {
    fencePermanent: NATURAL.fencePermanent,
    fenceElectric: NATURAL.fenceElectric,
    fenceTape: NATURAL.fenceTape,
    fenceDown: NATURAL.fenceDown,
    removeMark: NATURAL.removeMark,
    fenceContract: NATURAL.fenceContract,
    fenceNetting: NATURAL.fenceNetting,
    fencePostTape: NATURAL.fencePostTape,
    gateOpen: NATURAL.gateOpen,
    gateShut: NATURAL.gateShut,
    pipe: NATURAL.pipe,
    pipeDry: NATURAL.pipeDry,
    levelLow: NATURAL.levelLow,
    layerWaterNear: NATURAL.layerWaterNear,
    layerWaterMid: NATURAL.layerWaterMid,
    layerWaterFar: NATURAL.layerWaterFar,
    layerWaterNone: NATURAL.layerWaterNone,
    layerQualityLow: NATURAL.layerQualityLow,
    layerGrazed: NATURAL.layerGrazed,
  };

  it('the "does not fit today" colour is red, and nothing else on a line or square is', () => {
    expect(isRed(NATURAL.notToday)).toBe(true);
    for (const [name, colour] of Object.entries(onLinesAndSquares)) {
      expect(isRed(colour), name).toBe(false);
    }
  });

  it('a knocked-down fence is amber, told apart from "does not fit today" and from the casing', () => {
    const r = (NATURAL.fenceDown >> 16) & 255;
    const g = (NATURAL.fenceDown >> 8) & 255;
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(130);
    expect(contrast(NATURAL.fenceDown, NATURAL.notToday)).toBeGreaterThan(1.5);
    expect(contrast(NATURAL.fenceDown, NATURAL.fenceCasing)).toBeGreaterThanOrEqual(3);
    expect(contrast(NATURAL.notToday, NATURAL.fenceCasing)).toBeGreaterThanOrEqual(3);
    // The take-away mark stands out from the casing too.
    expect(contrast(NATURAL.removeMark, NATURAL.fenceCasing)).toBeGreaterThanOrEqual(3);
  });

  it("the contractor's fence under way has its own colour: not red, not purple, not amber, and apart from every other line", () => {
    const hue = (c: number): number => {
      const r = ((c >> 16) & 255) / 255;
      const g = ((c >> 8) & 255) / 255;
      const b = (c & 255) / 255;
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (d === 0) return 0;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const apart = (a: number, b: number): number => {
      const d = Math.abs(hue(a) - hue(b));
      return Math.min(d, 360 - d);
    };
    const mine = NATURAL.fenceContract;
    expect(isRed(mine)).toBe(false);
    // Readable on the dark casing every wire sits on, whichever theme the page is in.
    expect(contrast(mine, NATURAL.fenceCasing)).toBeGreaterThanOrEqual(3);
    // Told apart by hue from the red "does not fit", the knocked-down amber, the no-water
    // purples (both themes), the take-away lilac and the water blues.
    const others: Record<string, number> = {
      notToday: NATURAL.notToday,
      fenceDown: NATURAL.fenceDown,
      noWaterDark: THEMES.dark.noWater,
      noWaterLight: THEMES.light.noWater,
      layerWaterNone: NATURAL.layerWaterNone,
      removeMark: NATURAL.removeMark,
      pipe: NATURAL.pipe,
      water: NATURAL.water,
      gateOpen: NATURAL.gateOpen,
      fenceElectric: NATURAL.fenceElectric,
      fencePermanent: NATURAL.fencePermanent,
    };
    for (const [name, c] of Object.entries(others)) {
      expect(apart(mine, c), name).toBeGreaterThanOrEqual(30);
    }
    // And it stands out from the grass it is drawn on.
    for (const grass of [NATURAL.leafYoung, NATURAL.leafOld, NATURAL.strawFresh, NATURAL.soil]) {
      expect(contrast(mine, grass), String(grass)).toBeGreaterThan(1.3);
    }
  });

  it('sheep netting has its own colour: not red, not purple, not amber, not pink, and apart from every other line', () => {
    const hue = (c: number): number => {
      const r = ((c >> 16) & 255) / 255;
      const g = ((c >> 8) & 255) / 255;
      const b = (c & 255) / 255;
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (d === 0) return 0;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const apart = (a: number, b: number): number => {
      const d = Math.abs(hue(a) - hue(b));
      return Math.min(d, 360 - d);
    };
    const mine = NATURAL.fenceNetting;
    expect(isRed(mine)).toBe(false);
    // Readable on the dark casing every wire sits on, and on the post.
    expect(contrast(mine, NATURAL.fenceCasing)).toBeGreaterThanOrEqual(3);
    expect(contrast(mine, NATURAL.fencePost)).toBeGreaterThanOrEqual(3);
    const others: Record<string, number> = {
      notToday: NATURAL.notToday,
      fenceDown: NATURAL.fenceDown,
      fenceContract: NATURAL.fenceContract,
      noWaterDark: THEMES.dark.noWater,
      noWaterLight: THEMES.light.noWater,
      layerWaterNone: NATURAL.layerWaterNone,
      removeMark: NATURAL.removeMark,
      pipe: NATURAL.pipe,
      water: NATURAL.water,
      gateOpen: NATURAL.gateOpen,
      fenceElectric: NATURAL.fenceElectric,
      fencePermanent: NATURAL.fencePermanent,
    };
    for (const [name, c] of Object.entries(others)) {
      expect(apart(mine, c), name).toBeGreaterThanOrEqual(30);
    }
    // Not the white of tape, and not any line colour outright.
    expect(mine).not.toBe(NATURAL.fenceTape);
    for (const c of Object.values(others)) expect(c).not.toBe(mine);
    // On every ground it is drawn on it differs in brightness or in hue (a mid-tone colour
    // always meets some ground of its own brightness, so hue must then carry it).
    for (const ground of [
      NATURAL.leafYoung,
      NATURAL.leafOld,
      NATURAL.strawFresh,
      NATURAL.strawWeathered,
      NATURAL.soil,
      NATURAL.fallow,
      NATURAL.shaded,
    ]) {
      const differs = contrast(mine, ground) > 1.3 || apart(mine, ground) >= 45;
      expect(differs, String(ground)).toBe(true);
    }
    // And the casing carries it on every ground, as for every wire.
    for (const ground of [NATURAL.leafYoung, NATURAL.strawFresh, NATURAL.stubble, NATURAL.litter]) {
      expect(contrast(NATURAL.fenceCasing, ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('new tape is white, never red', () => {
    expect(NATURAL.fenceTape).toBe(0xffffff);
  });

  it('the no-water words on the map labels and markers are the map purple, not red', () => {
    // Inside the map picture red is saved for "can't do this" while drawing (Claudia, 14 Nov 2026).
    for (const theme of ['dark', 'light'] as const)
      expect(isRed(THEMES[theme].noWater)).toBe(false);
    expect(THEMES.light.noWater).toBe(0x7832aa);
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
