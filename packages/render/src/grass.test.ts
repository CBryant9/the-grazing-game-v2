import { VIEW_FORM, VIEW_LAND } from '@gg/shared';
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

  it('is 18 pixels to a square, and the same every time', () => {
    expect(GROUND_PX).toBe(18);
    expect(GROUND_W).toBe(720);
    expect(GROUND_H).toBe(468);
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
    expect(lastLeft[0]).toBeGreaterThan(firstRight[0] + 50);
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
    // Furrows between the three drill rows: pixel rows 0 and 5, 6 and 11, 12 and 17.
    for (const dark of [0, 5, 6, 11, 12, 17]) {
      expect(rowMean(base + dark)).toBeLessThan(rowMean(base + 3) - 12);
    }
    // A few pixels are lighter than the plain fallow colour: the clods.
    let clods = 0;
    for (let py = base + 1; py < base + 36; py++) {
      const inRow = (py % GROUND_PX) % 6;
      if (inRow === 0 || inRow === 5) continue;
      for (let px = 9; px < 170; px++) {
        if (pixel(out, px, py)[0] > red(NATURAL.fallow) + 15) clods++;
      }
    }
    // About six pixels in a hundred.
    expect(clods).toBeGreaterThan(100);
    expect(clods).toBeLessThan(450);
  });
});

describe('the base of a paddock looks like what that pasture forms (19 Nov 2026)', () => {
  /** How close a pixel is to a colour: 0 is the same. */
  const dist = (px: [number, number, number], c: number): number =>
    Math.abs(px[0] - red(c)) + Math.abs(px[1] - green(c)) + Math.abs(px[2] - blue(c));

  /** The whole farm in one form at one hidden share, painted. */
  function farm(form: number, hidden: number, spec = LEAFY) {
    const view = sampleView();
    for (let i = 0; i < 1040; i++) setSquare(view, i, { ...spec, form, hidden });
    const looks = allLooks(view);
    const out = new Uint8ClampedArray(GROUND_W * GROUND_H * 4);
    paintGround(view, looks, out);
    return { view, looks, out };
  }

  /** For each pixel of a square, true where it shows the sward rather than open ground. */
  function hiddenMap(out: Uint8ClampedArray, look: ReturnType<typeof squareLook>, i: number) {
    const col = i % 40;
    const row = Math.floor(i / 40);
    const map: boolean[] = [];
    for (let ty = 0; ty < GROUND_PX; ty++) {
      for (let tx = 0; tx < GROUND_PX; tx++) {
        const p = ((row * GROUND_PX + ty) * GROUND_W + col * GROUND_PX + tx) * 4;
        const px: [number, number, number] = [out[p]!, out[p + 1]!, out[p + 2]!];
        map.push(dist(px, look.base) < dist(px, look.bare));
      }
    }
    return map;
  }

  // Hedgerows are laid over the buffel's clumps, so buffel (the same clumps) stands in for them here.
  const FORMS = Object.values(VIEW_FORM).filter(
    (f) => f !== VIEW_FORM.bare && f !== VIEW_FORM.hedgerow,
  );

  it.each(FORMS)('form %s: the share of the ground hidden is the share the server sent', (form) => {
    for (const hidden of [4, 10, 16]) {
      const { looks, out } = farm(form, hidden);
      let shown = 0;
      let all = 0;
      for (const i of [cell(5, 5), cell(12, 18), cell(30, 9), cell(33, 20)]) {
        for (const h of hiddenMap(out, looks[i]!, i)) {
          all++;
          if (h) shown++;
        }
      }
      expect(Math.abs(shown / all - hidden / 20), `hidden ${hidden}`).toBeLessThan(0.1);
    }
  });

  it('tussocks stand on their own clumps: hidden ground gathers round the tufts that stand', () => {
    const { looks, out } = farm(VIEW_FORM.openTussock, 6, RANK);
    let nearIn = 0;
    let nIn = 0;
    let nearOut = 0;
    let nOut = 0;
    for (let i = 300; i < 340; i++) {
      const tufts = squareTufts(i, looks[i]!);
      if (!tufts.length) continue;
      const map = hiddenMap(out, looks[i]!, i);
      map.forEach((h, k) => {
        const x = (i % 40) + ((k % GROUND_PX) + 0.5) / GROUND_PX;
        const y = Math.floor(i / 40) + (Math.floor(k / GROUND_PX) + 0.5) / GROUND_PX;
        const d = Math.min(...tufts.map((t) => Math.hypot(t.x - x, t.y - y)));
        if (h) {
          nearIn += d;
          nIn++;
        } else {
          nearOut += d;
          nOut++;
        }
      });
    }
    // Hidden pixels sit far closer to a standing tuft than open ground does.
    expect(nearIn / nIn).toBeLessThan((nearOut / nOut) * 0.6);
  });

  it("a carpet's gaps are small and scattered; between tussocks the open ground lies in patches", () => {
    const openPatchiness = (form: number): number => {
      const { looks, out } = farm(form, 10);
      let open = 0;
      let inside = 0;
      for (let i = 400; i < 440; i++) {
        const map = hiddenMap(out, looks[i]!, i);
        for (let ty = 1; ty < GROUND_PX - 1; ty++) {
          for (let tx = 1; tx < GROUND_PX - 1; tx++) {
            const k = ty * GROUND_PX + tx;
            if (map[k]) continue;
            open++;
            if (!map[k - 1] && !map[k + 1] && !map[k - GROUND_PX] && !map[k + GROUND_PX]) inside++;
          }
        }
      }
      return inside / open;
    };
    expect(openPatchiness(VIEW_FORM.openTussock)).toBeGreaterThan(
      openPatchiness(VIEW_FORM.carpet) + 0.25,
    );
  });

  it('crops fill out from their drill rows', () => {
    const { looks, out } = farm(VIEW_FORM.rows, 8, {
      land: VIEW_LAND.crop,
      heightCm: 20,
      green: 20,
      cover: 10,
    });
    const i = cell(10, 10);
    const map = hiddenMap(out, looks[i]!, i);
    const rowShare = (ty: number): number => {
      let n = 0;
      for (let tx = 0; tx < GROUND_PX; tx++) if (map[ty * GROUND_PX + tx]) n++;
      return n / GROUND_PX;
    };
    // The middle of each row is hidden well before the ground between rows.
    for (const [mid, between] of [
      [2, 0],
      [8, 6],
      [14, 12],
    ] as const) {
      expect(rowShare(mid)).toBeGreaterThan(rowShare(between) + 0.4);
    }
  });

  it('neighbouring squares in a paddock never jump: the hidden share runs smoothly across them', () => {
    const view = sampleView();
    // Across the left paddock the hidden share steps up by a twentieth a square.
    for (let i = 0; i < 1040; i++) {
      const col = i % 40;
      if (col < 20) setSquare(view, i, { ...LEAFY, form: VIEW_FORM.carpet, hidden: 2 + col });
    }
    const looks = allLooks(view);
    const out = new Uint8ClampedArray(GROUND_W * GROUND_H * 4);
    paintGround(view, looks, out);
    // The hidden share of each band of three pixels across, rows 4 to 21.
    const share: number[] = [];
    for (let x0 = GROUND_PX; x0 < 19 * GROUND_PX; x0 += 3) {
      let n = 0;
      let all = 0;
      for (let py = 4 * GROUND_PX; py < 22 * GROUND_PX; py++) {
        for (let px = x0; px < x0 + 3; px++) {
          const i = Math.floor(py / GROUND_PX) * 40 + Math.floor(px / GROUND_PX);
          const p = (py * GROUND_W + px) * 4;
          const c: [number, number, number] = [out[p]!, out[p + 1]!, out[p + 2]!];
          all++;
          if (dist(c, looks[i]!.base) < dist(c, looks[i]!.bare)) n++;
        }
      }
      share.push(n / all);
    }
    for (let k = 1; k < share.length; k++) {
      expect(Math.abs(share[k]! - share[k - 1]!)).toBeLessThan(0.1);
    }
    expect(share.at(-1)!).toBeGreaterThan(share[0]! + 0.6);
  });

  it('zoomed out, a square is the colour the zoomed-in ground averages to', () => {
    for (const form of [VIEW_FORM.openTussock, VIEW_FORM.carpet, VIEW_FORM.rows]) {
      const { looks, out } = farm(form, 9, RANK);
      const i = cell(10, 12);
      const sum = [0, 0, 0];
      for (let ty = 0; ty < GROUND_PX; ty++) {
        for (let tx = 0; tx < GROUND_PX; tx++) {
          const p = ((12 * GROUND_PX + ty) * GROUND_W + 10 * GROUND_PX + tx) * 4;
          for (let c = 0; c < 3; c++) sum[c] = sum[c]! + out[p + c]!;
        }
      }
      const mean = sum.map((v) => v / (GROUND_PX * GROUND_PX));
      const floor = looks[i]!.floor;
      expect(Math.abs(mean[0]! - red(floor)), `form ${form}`).toBeLessThan(14);
      expect(Math.abs(mean[1]! - green(floor)), `form ${form}`).toBeLessThan(14);
      expect(Math.abs(mean[2]! - blue(floor)), `form ${form}`).toBeLessThan(14);
    }
  });

  it('the open ground is soil only as far as the model says the ground is bare', () => {
    // Hidden nothing: the whole square is soil-coloured open ground.
    const bare = look({ ...SHORT, form: VIEW_FORM.carpet, hidden: 0 });
    expect(bare.cover).toBe(0);
    expect(bare.floor).toBe(NATURAL.soil);
    // Grazed down but still with feed, a carpet hides more than half its ground.
    const carpet = look({ ...SHORT, form: VIEW_FORM.carpet, hidden: 12 });
    expect(carpet.cover).toBeCloseTo(0.6, 10);
    expect(squareTufts(A, carpet).length).toBeGreaterThanOrEqual(4);
  });

  it('a view from before the forms were sent still draws, from the model cover and the district', () => {
    const l = look(SHORT);
    expect(l.cover).toBeCloseTo(0.4, 10);
    // The sample farm is on the Northern Tablelands: low tufts.
    expect(l.form).toBe(VIEW_FORM.lowTufts);
    expect(look({ ...LEAFY, land: VIEW_LAND.sown }).form).toBe(VIEW_FORM.carpet);
    expect(look({ land: VIEW_LAND.crop, heightCm: 30, green: 20, cover: 10 }).form).toBe(
      VIEW_FORM.rows,
    );
  });

  it('white clover flowers show only where a clover runs through the sward', () => {
    const flowers = (form: number): number => {
      let n = 0;
      for (let i = 0; i < 300; i++) {
        const view = sampleView();
        setSquare(view, i, { ...LEAFY, land: VIEW_LAND.sown, form, hidden: 20 });
        n += squareTufts(i, squareLook(view, i)).filter((t) => t.clover).length;
      }
      return n;
    };
    expect(flowers(VIEW_FORM.carpet)).toBeGreaterThan(0);
    expect(flowers(VIEW_FORM.tussockClover)).toBeGreaterThan(0);
    expect(flowers(VIEW_FORM.bunch)).toBe(0);
    expect(flowers(VIEW_FORM.crowns)).toBe(0);
  });

  it('tussocks are broad clumps, a carpet fine', () => {
    const w = (form: number): number =>
      squareTufts(A, look({ ...RANK, form, hidden: 20 })).reduce((a, t) => a + t.w, 0);
    expect(w(VIEW_FORM.bunch)).toBeGreaterThan(w(VIEW_FORM.carpet) * 1.3);
  });

  it('leucaena hedgerows show as dark green lines through the buffel', () => {
    const { out } = farm(VIEW_FORM.hedgerow, 14);
    // Brightness along a pixel row: red, green and blue together.
    const rowMean = (py: number): number => {
      let t = 0;
      for (let px = 0; px < 18 * GROUND_PX; px++) {
        const p = (py * GROUND_W + px) * 4;
        t += out[p]! + out[p + 1]! + out[p + 2]!;
      }
      return t / (18 * GROUND_PX);
    };
    const base = 10 * GROUND_PX;
    expect(rowMean(base + 4)).toBeLessThan(rowMean(base + 9) - 40);
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
