import { VIEW_LAND } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { blue, green, red } from './colour';
import {
  CROP_MAX_HEIGHT,
  RAISE_MAX,
  STUBBLE_HEIGHT,
  TUFTS_PER_SQUARE,
  TUFT_MAX_HEIGHT,
  farFrontBands,
  farSeedFlecks,
  squareLook,
  squareTufts,
  tuftHeight,
} from './grass';
import { GROUND_H, GROUND_PX, GROUND_W, paintGround } from './ground';
import { allLooks } from './grass';
import { NATURAL } from './palette';
import {
  FALLOW,
  LEAFY,
  RANK,
  SHORT,
  STUBBLE,
  cell,
  sampleView,
  setSquare,
} from './testing/sampleView';

/*
 * The picture must match the model (docs/VISUALS.md). These tests set a
 * square's figures and check what would be drawn: how tall, what colour,
 * where the green sits, whether seed heads show, how much ground is covered.
 */

const A = cell(10, 10);

function look(spec: Parameters<typeof setSquare>[2]) {
  const view = sampleView();
  setSquare(view, A, spec);
  return squareLook(view, A);
}

const greener = (c: number): boolean => green(c) > red(c) && green(c) > blue(c);
const strawish = (c: number): boolean => red(c) > green(c) && green(c) > blue(c);

describe('height comes from the model', () => {
  it('taller feed is drawn as taller tufts, up to the tallest', () => {
    expect(tuftHeight(20)).toBeGreaterThan(tuftHeight(10));
    expect(tuftHeight(80)).toBeGreaterThan(tuftHeight(40));
    expect(tuftHeight(90)).toBeCloseTo(TUFT_MAX_HEIGHT, 10);
    expect(tuftHeight(500)).toBeCloseTo(TUFT_MAX_HEIGHT, 10);
  });

  it('rank grass stands clearly taller than short grass, zoomed in and zoomed out', () => {
    const rank = look(RANK);
    const short = look(SHORT);
    expect(rank.height).toBeGreaterThan(short.height * 5);
    // Zoomed out the square itself is raised by its height.
    expect(rank.raise).toBeGreaterThan(short.raise * 5);
    expect(rank.raise).toBeLessThanOrEqual(RAISE_MAX);
    expect(look({ ...RANK, heightCm: 40 }).raise).toBeCloseTo((40 / 90) * RAISE_MAX, 10);
  });

  it("each tuft's height is the square's height, give or take a third", () => {
    const l = look(RANK);
    const tufts = squareTufts(A, l);
    expect(tufts.length).toBe(TUFTS_PER_SQUARE);
    for (const t of tufts) {
      expect(t.h).toBeGreaterThanOrEqual(l.height * 0.65 - 1e-9);
      expect(t.h).toBeLessThanOrEqual(l.height * 1.35 + 1e-9);
    }
  });
});

describe('green at the base of rank grass', () => {
  it('a sward that is all green is green to the tip', () => {
    const l = look({ ...LEAFY, green: 20 });
    expect(l.greenReach).toBe(1);
    for (const t of squareTufts(A, l)) expect(t.greenH).toBe(t.h);
  });

  it('a leafy sward that is nine parts green is green to the tip on most tufts, and nearly so on the rest', () => {
    let full = 0;
    let all = 0;
    for (let i = 0; i < 100; i++) {
      for (const t of squareTufts(i, look(LEAFY))) {
        all++;
        if (t.greenH === t.h) full++;
        // height x 0.9 x 0.65 x 1.25 at the least
        expect(t.greenH).toBeGreaterThanOrEqual(t.h * 0.73);
      }
    }
    expect(full / all).toBeGreaterThan(0.55);
  });

  it('a rank tussock is green only at the bottom, with dry tops above', () => {
    const l = look(RANK);
    // 20% green: the green reaches a quarter of the way up.
    expect(l.greenReach).toBeCloseTo(0.25, 10);
    for (const t of squareTufts(A, l)) {
      expect(t.greenH).toBeGreaterThan(0);
      expect(t.greenH).toBeLessThan(t.h * 0.4);
    }
  });

  it('feed with no green at all has no green part', () => {
    const l = look({ ...RANK, green: 0 });
    for (const t of squareTufts(A, l)) expect(t.greenH).toBe(0);
  });

  it('from a distance rank grass reads as straw and leafy grass as green', () => {
    expect(strawish(look(RANK).field)).toBe(true);
    expect(greener(look(LEAFY).field)).toBe(true);
  });
});

describe('colour comes from the model', () => {
  it('young leaf is the bright green and old leaf the dark green of docs/VISUALS.md', () => {
    expect(look({ ...LEAFY, leafAge: 0 }).leaf).toBe(NATURAL.leafYoung);
    expect(look({ ...LEAFY, leafAge: 10 }).leaf).toBe(NATURAL.leafOld);
  });

  it('dry feed goes from light straw to grey as it weathers', () => {
    expect(look({ ...RANK, weathered: 0 }).straw).toBe(NATURAL.strawFresh);
    expect(look({ ...RANK, weathered: 10 }).straw).toBe(NATURAL.strawWeathered);
  });

  it('sown pasture is a deeper green than native at the same leaf age', () => {
    const native = look(LEAFY).leaf;
    const sown = look({ ...LEAFY, land: VIEW_LAND.sown }).leaf;
    expect(red(sown)).toBeLessThan(red(native));
    expect(green(sown)).toBeGreaterThanOrEqual(green(native));
  });

  it('seed heads show only where the view says so, and only on tufts tall enough to carry them', () => {
    expect(look(RANK).seed).toBe(NATURAL.seedHead);
    expect(look({ ...RANK, seedHeads: 0 }).seed).toBe(-1);
    expect(squareTufts(A, look(RANK)).every((t) => t.seed === NATURAL.seedHead)).toBe(true);
    // Very short feed flagged with seed heads: the tufts are too short to show them.
    const stumpy = look({ ...RANK, heightCm: 6 });
    expect(squareTufts(A, stumpy).every((t) => t.seed === -1)).toBe(true);
  });
});

describe('ground cover', () => {
  it('full cover stands all nine tufts. Low cover shows soil between them', () => {
    expect(squareTufts(A, look({ ...LEAFY, cover: 10 })).length).toBe(9);
    let standing = 0;
    for (let i = 0; i < 200; i++) standing += squareTufts(i, look({ ...SHORT, cover: 4 })).length;
    // About four in ten spots stand.
    expect(standing / 200).toBeGreaterThan(2.5);
    expect(standing / 200).toBeLessThan(5);
    expect(squareTufts(A, look({ ...SHORT, cover: 0 })).length).toBe(0);
  });

  it('bare ground is soil, and the ground under dry grass is straw litter, not soil (LESSONS 4)', () => {
    expect(look({ ...SHORT, cover: 0 }).ground).toBe(NATURAL.soil);
    const underDry = look({ ...RANK, green: 0 }).ground;
    expect(underDry).toBe(NATURAL.litter);
    expect(underDry).not.toBe(NATURAL.soil);
    // Under living grass the ground is shaded.
    expect(look({ ...LEAFY, green: 20 }).ground).toBe(NATURAL.shaded);
  });

  it('an ungrazed dry paddock does not look bare from a distance: it is straw, far from soil', () => {
    const field = look({ ...RANK, green: 0 }).field;
    expect(strawish(field)).toBe(true);
    expect(red(field)).toBeGreaterThan(red(NATURAL.soil) + 30);
  });

  it('a tuft never moves when the grass changes: it only changes size and colour', () => {
    const a = squareTufts(A, look(LEAFY));
    const b = squareTufts(A, look(RANK));
    expect(a.map((t) => [t.x, t.y])).toEqual(b.map((t) => [t.x, t.y]));
    expect(a.map((t) => t.h)).not.toEqual(b.map((t) => t.h));
  });

  it('every tuft stands inside its own square', () => {
    for (const i of [0, 39, 517, 1039]) {
      const view = sampleView();
      setSquare(view, i, RANK);
      for (const t of squareTufts(i, squareLook(view, i))) {
        expect(Math.floor(t.x)).toBe(i % 40);
        expect(Math.floor(t.y)).toBe(Math.floor(i / 40));
      }
    }
  });
});

describe('crops, fallow and stubble', () => {
  it('fallow is worked brown soil with no tufts', () => {
    const l = look(FALLOW);
    expect(l.kind).toBe('fallow');
    expect(l.ground).toBe(NATURAL.fallow);
    expect(l.field).toBe(NATURAL.fallow);
    expect(l.raise).toBe(0);
    expect(squareTufts(A, l)).toEqual([]);
  });

  it('stubble is pale straw rows, very short, fully covered, with no green', () => {
    const l = look(STUBBLE);
    expect(l.kind).toBe('stubble');
    expect(l.rows).toBe(true);
    expect(l.ground).toBe(NATURAL.stubble);
    const tufts = squareTufts(A, l);
    expect(tufts.length).toBe(9);
    for (const t of tufts) {
      expect(t.shape).toBe('stubble');
      expect(t.greenH).toBe(0);
      expect(t.h).toBeLessThanOrEqual(STUBBLE_HEIGHT * 1.06);
      expect(t.seed).toBe(-1);
    }
    // However tall the view's figure, stubble stays very short.
    expect(look({ ...STUBBLE, heightCm: 80 }).height).toBe(STUBBLE_HEIGHT);
  });

  it('a leafy crop is bright green. Once heading or done it is golden with seed heads', () => {
    const veg = look({ land: VIEW_LAND.crop, heightCm: 30, green: 20, cover: 10, seedHeads: 0 });
    expect(veg.kind).toBe('crop');
    expect(veg.leaf).toBe(NATURAL.cropGreen);
    expect(veg.seed).toBe(-1);
    const ripe = look({ land: VIEW_LAND.crop, heightCm: 60, green: 6, cover: 10, seedHeads: 1 });
    expect(ripe.leaf).toBe(NATURAL.cropGold);
    expect(ripe.seed).toBe(NATURAL.cropSeed);
  });

  it('crop plants sit in three cultivated rows to a square', () => {
    const l = look({ land: VIEW_LAND.annual, heightCm: 30, green: 20, cover: 10 });
    expect(l.rows).toBe(true);
    const tufts = squareTufts(A, l);
    const rows = [...new Set(tufts.map((t) => Math.round((t.y - 10) * 6)))].sort();
    expect(rows).toEqual([1, 3, 5]);
    expect(tufts.every((t) => t.shape === 'crop')).toBe(true);
  });

  it('crops are capped a little under the tallest grass', () => {
    expect(look({ land: VIEW_LAND.crop, heightCm: 90, green: 20, cover: 10 }).height).toBe(
      CROP_MAX_HEIGHT,
    );
  });
});

describe('the ground picture', () => {
  const pixel = (out: Uint8ClampedArray, px: number, py: number): [number, number, number] => {
    const p = (py * GROUND_W + px) * 4;
    return [out[p]!, out[p + 1]!, out[p + 2]!];
  };

  function painted(change: (view: ReturnType<typeof sampleView>) => void = () => {}) {
    const view = sampleView();
    change(view);
    const out = new Uint8ClampedArray(GROUND_W * GROUND_H * 4);
    paintGround(view, allLooks(view), out);
    return out;
  }

  it('is 9 pixels to a square, and the same every time', () => {
    expect(GROUND_PX).toBe(9);
    expect(GROUND_W).toBe(360);
    expect(GROUND_H).toBe(234);
    expect(painted()).toEqual(painted());
    // Every pixel is solid.
    const out = painted();
    for (let p = 3; p < out.length; p += 4 * 997) expect(out[p]).toBe(255);
  });

  it('keeps a sharp line at a fence: nothing blends across from the paddock next door', () => {
    // The left paddock is rank (straw litter), the right one leafy (shaded green ground).
    const out = painted((view) => {
      for (let i = 0; i < 1040; i++) if (i % 40 < 20) setSquare(view, i, { ...RANK, green: 0 });
    });
    const y = 10 * GROUND_PX + 4;
    const lastLeft = pixel(out, 20 * GROUND_PX - 1, y);
    const deepLeft = pixel(out, 15 * GROUND_PX + 4, y);
    const firstRight = pixel(out, 20 * GROUND_PX, y);
    const deepRight = pixel(out, 25 * GROUND_PX + 4, y);
    const near = (a: number[], b: number[]): boolean => a.every((v, k) => Math.abs(v - b[k]!) < 36);
    // Right up to the fence each side is its own paddock's colour (give or take the speckle).
    expect(near(lastLeft, deepLeft)).toBe(true);
    expect(near(firstRight, deepRight)).toBe(true);
    expect(lastLeft[0]).toBeGreaterThan(firstRight[0] + 60);
  });

  it('blends softly between squares inside one paddock', () => {
    const out = painted((view) => {
      for (let i = 0; i < 1040; i++) {
        if (i % 40 < 10) setSquare(view, i, { ...RANK, green: 0 });
      }
    });
    // Averaged down a column to smooth the speckle: at the join between
    // columns 9 and 10 the colour is in between the two.
    const column = (px: number): number => {
      let t = 0;
      for (let py = 36; py < 198; py++) t += pixel(out, px, py)[0];
      return t / 162;
    };
    const dry = column(5 * GROUND_PX + 4);
    const leafy = column(15 * GROUND_PX + 4);
    const join = column(10 * GROUND_PX);
    expect(dry).toBeGreaterThan(leafy + 60);
    expect(join).toBeLessThan(dry - 20);
    expect(join).toBeGreaterThan(leafy + 20);
  });

  it('cropping country has three darker furrows to a square, and fallow a few lighter clods', () => {
    const out = painted((view) => {
      for (let i = 0; i < 1040; i++) if (i % 40 < 20) setSquare(view, i, FALLOW);
    });
    const rowMean = (py: number): number => {
      let t = 0;
      for (let px = 9; px < 170; px++) t += pixel(out, px, py)[0];
      return t / 161;
    };
    const base = 10 * GROUND_PX;
    // Furrows at pixel rows 0, 3 and 6 of each square.
    for (const dark of [0, 3, 6]) {
      expect(rowMean(base + dark)).toBeLessThan(rowMean(base + 4) - 12);
    }
    // A few pixels are lighter than the plain fallow colour: the clods.
    let clods = 0;
    for (let py = base + 1; py < base + 36; py++) {
      if ((py % GROUND_PX) % 3 === 0) continue;
      for (let px = 9; px < 170; px++) {
        if (pixel(out, px, py)[0] > red(NATURAL.fallow) + 15) clods++;
      }
    }
    // About six pixels in a hundred.
    expect(clods).toBeGreaterThan(100);
    expect(clods).toBeLessThan(400);
  });
});

describe('the zoomed-out map shows the sward in profile on the front of a raised square', () => {
  it('rank grass with green at its base shows a green band under a straw band', () => {
    const l = look({ ...RANK, heightCm: 60, green: 6 });
    const bands = farFrontBands(l, 0);
    expect(bands).toHaveLength(2);
    // Green from the ground up, as far as the green reaches.
    expect(bands[0]!.from).toBe(0);
    expect(bands[0]!.to).toBeCloseTo(l.greenReach * l.raise, 10);
    expect(greener(bands[0]!.colour)).toBe(true);
    // Dry feed above it, to the top.
    expect(bands[1]!.from).toBeCloseTo(bands[0]!.to, 10);
    expect(bands[1]!.to).toBe(l.raise);
    expect(strawish(bands[1]!.colour)).toBe(true);
  });

  it('a leafy sward is green to the top, and an all-dry one is straw to the ground', () => {
    const leafy = farFrontBands(look({ ...LEAFY, green: 20 }), 0);
    expect(leafy).toHaveLength(1);
    expect(greener(leafy[0]!.colour)).toBe(true);
    const dry = farFrontBands(look({ ...RANK, green: 0 }), 0);
    expect(dry).toHaveLength(1);
    expect(strawish(dry[0]!.colour)).toBe(true);
  });

  it('only shows what stands above the square in front', () => {
    const l = look({ ...RANK, heightCm: 60, green: 6 });
    // A square in front as tall as this one hides the whole front.
    expect(farFrontBands(l, l.raise)).toEqual([]);
    // One that stands above the green band leaves only dry feed showing.
    const over = l.greenReach * l.raise + 0.01;
    const bands = farFrontBands(l, over);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.from).toBe(over);
    expect(strawish(bands[0]!.colour)).toBe(true);
  });

  it('flecks a pasture square that carries seed heads, and no other', () => {
    expect(farSeedFlecks(look({ ...RANK, seedHeads: 1 }))).toBe(true);
    expect(farSeedFlecks(look({ ...RANK, seedHeads: 0 }))).toBe(false);
    // A heading crop turns gold and keeps its rows. It gets no flecks.
    expect(
      farSeedFlecks(
        look({ land: VIEW_LAND.crop, heightCm: 60, green: 6, cover: 10, seedHeads: 1 }),
      ),
    ).toBe(false);
    expect(farSeedFlecks(look(STUBBLE))).toBe(false);
  });
});
