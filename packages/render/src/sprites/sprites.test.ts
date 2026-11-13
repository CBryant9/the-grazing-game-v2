import { describe, expect, it } from 'vitest';
import { frameStats, struggling } from '../bench';
import { swardCaption, swardParts, swardPlan } from '../sward';
import { SWARD, sampleView } from '../testing/sampleView';
import { cattleSprite, defaultSprites } from './painters';
import { SpriteRegistry, packAtlas } from './registry';

describe('the sprite registry', () => {
  const reg = defaultSprites();

  it('has a sprite for every kind of beast, in both breed styles and three body shapes', () => {
    for (const breed of ['british', 'brahman'] as const) {
      for (const kind of ['cow', 'heifer', 'steer', 'bull'] as const) {
        for (const shape of ['thin', 'normal', 'fat'] as const) {
          expect(reg.has(cattleSprite(breed, kind, shape)), `${breed} ${kind} ${shape}`).toBe(true);
        }
      }
      // Calves have one shape, whatever their condition.
      expect(cattleSprite(breed, 'calf', 'thin')).toBe(`cattle.${breed}.calf.normal`);
      expect(reg.has(`cattle.${breed}.calf.normal`)).toBe(true);
    }
  });

  it('has everything else the map stamps down', () => {
    for (const id of [
      'tuft.dry.0',
      'tuft.dry.1',
      'tuft.dry.2',
      'tuft.leaf.0',
      'tuft.leaf.1',
      'tuft.leaf.2',
      'tuft.crop',
      'tuft.stubble',
      'tuft.seed',
      'tuft.clover',
      'trough.fixed',
      'trough.portable',
      'hub',
      'windmill.tower',
      'windmill.fan',
      'tree',
      'building.homestead',
      'building.yards',
      'building.shed',
      'building.silo',
      'building.feedBin',
      'gate.across.shut',
      'gate.across.open',
      'gate.down.shut',
      'gate.down.open',
      'mark.alert',
      'marker.cow',
      'rain',
    ]) {
      expect(reg.has(id), id).toBe(true);
    }
  });

  it('has no saleyard and no feedlot: neither is ever drawn on the map', () => {
    for (const id of reg.ids()) {
      expect(id.toLowerCase()).not.toMatch(/sale|feedlot|lot\b/);
    }
  });

  it('every sprite has a size, an anchor inside it and a scale', () => {
    for (const id of reg.ids()) {
      const d = reg.get(id)!;
      expect(d.w, id).toBeGreaterThan(0);
      expect(d.h, id).toBeGreaterThan(0);
      expect(d.ppu, id).toBeGreaterThan(0);
      expect(d.ax, id).toBeGreaterThanOrEqual(0);
      expect(d.ax, id).toBeLessThanOrEqual(1);
      expect(d.ay, id).toBeGreaterThanOrEqual(0);
      expect(d.ay, id).toBeLessThanOrEqual(1);
      expect(typeof d.paint, id).toBe('function');
    }
  });

  it('a bull is drawn bigger than a cow, and a calf smaller', () => {
    const cow = reg.get('cattle.british.cow.normal')!;
    expect(reg.get('cattle.british.bull.normal')!.w).toBeGreaterThan(cow.w);
    expect(reg.get('cattle.british.calf.normal')!.w).toBeLessThan(cow.w * 0.7);
  });

  it('one sprite can be swapped for exported art without touching the rest', () => {
    const mine = reg.clone();
    const art = {} as CanvasImageSource;
    const was = mine.get('tree')!;
    mine.replace('tree', art);
    const now = mine.get('tree')!;
    expect(now.image).toBe(art);
    expect(now.paint).toBeUndefined();
    // Art drawn to the same size drops straight in: size, anchor and scale are kept.
    expect([now.w, now.h, now.ax, now.ay, now.ppu]).toEqual([
      was.w,
      was.h,
      was.ax,
      was.ay,
      was.ppu,
    ]);
    // Art at another size says so.
    mine.replace('tree', art, { w: 280, h: 312, ppu: 248 });
    expect(mine.get('tree')!.w).toBe(280);
    // Nothing else changed, and the registry it was copied from is untouched.
    expect(mine.get('building.homestead')).toEqual(reg.get('building.homestead'));
    expect(reg.get('tree')!.image).toBeUndefined();
    expect(mine.ids()).toEqual(reg.ids());
  });

  it('swapping a sprite that does not exist is an error, not a silent new sprite', () => {
    expect(() => new SpriteRegistry().replace('cow', {} as CanvasImageSource)).toThrow(/No sprite/);
  });
});

describe('packing the sprites onto one sheet', () => {
  const reg = defaultSprites();
  const sprites = reg.ids().map((id) => ({ id, w: reg.get(id)!.w, h: reg.get(id)!.h }));
  const layout = packAtlas(sprites, 2048, 3);

  it('every sprite gets its own place, inside the sheet', () => {
    expect(layout.frames.size).toBe(sprites.length);
    expect(layout.width).toBeLessThanOrEqual(2048);
    expect(layout.height).toBeLessThanOrEqual(2048);
    for (const s of sprites) {
      const f = layout.frames.get(s.id)!;
      expect([f.w, f.h]).toEqual([s.w, s.h]);
      expect(f.x).toBeGreaterThanOrEqual(3);
      expect(f.y).toBeGreaterThanOrEqual(3);
      expect(f.x + f.w).toBeLessThanOrEqual(layout.width);
      expect(f.y + f.h).toBeLessThanOrEqual(layout.height);
    }
  });

  it('no two sprites touch: there are at least 3 pixels between them', () => {
    const frames = [...layout.frames.values()];
    for (let a = 0; a < frames.length; a++) {
      for (let b = a + 1; b < frames.length; b++) {
        const p = frames[a]!;
        const q = frames[b]!;
        const apart =
          p.x + p.w + 3 <= q.x ||
          q.x + q.w + 3 <= p.x ||
          p.y + p.h + 3 <= q.y ||
          q.y + q.h + 3 <= p.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('the same sprites always pack the same way', () => {
    expect(packAtlas([...sprites].reverse(), 2048, 3)).toEqual(layout);
  });

  it('a sprite wider than the sheet is refused', () => {
    expect(() => packAtlas([{ id: 'wide', w: 300, h: 10 }], 256)).toThrow(/wider/);
  });
});

describe('the side-view pasture picture', () => {
  it('stem count follows ground cover', () => {
    const full = swardPlan({ ...SWARD, coverPct: 100, greenPct: 50 });
    const thin = swardPlan({ ...SWARD, coverPct: 30, greenPct: 50 });
    expect(full.dryStems + full.greenLeaves).toBeGreaterThan(
      (thin.dryStems + thin.greenLeaves) * 2,
    );
  });

  it('dry stems stand to the full height and green leaf to the leaf height', () => {
    const plan = swardPlan({ ...SWARD, heightCm: 45, leafCm: 9 });
    expect(plan.dryCm).toBe(45);
    expect(plan.greenCm).toBe(9);
  });

  it('rank grass of the same weight is drawn taller than leafy grass, because the view says it is taller', () => {
    const leafy = swardPlan({ ...SWARD, massKgHa: 2500, heightCm: 26, seedHeads: 0 });
    const rank = swardPlan({ ...SWARD, massKgHa: 2500, heightCm: 48, seedHeads: 7 });
    expect(rank.dryCm).toBeGreaterThan(leafy.dryCm);
  });

  it('a dry paddock is mostly dry stems, a green one mostly leaf', () => {
    const dry = swardPlan({ ...SWARD, greenPct: 10 });
    const green = swardPlan({ ...SWARD, greenPct: 90 });
    expect(dry.dryStems).toBeGreaterThan(dry.greenLeaves * 3);
    expect(green.greenLeaves).toBeGreaterThan(green.dryStems * 3);
  });

  it('seed heads show only where the view says they do', () => {
    // The threshold is on the server. The picture holds none.
    expect(swardPlan({ ...SWARD, seedHeads: 1 }).seedHeads).toBe(true);
    expect(swardPlan({ ...SWARD, seedHeads: 0 }).seedHeads).toBe(false);
  });

  it('the litter layer thickens with the dead feed, up to 3,000 kg DM/ha', () => {
    expect(swardPlan({ ...SWARD, deadKgHa: 1500 }).litter).toBeCloseTo(0.5, 10);
    expect(swardPlan({ ...SWARD, deadKgHa: 6000 }).litter).toBe(1);
    // Bare ground has no litter.
    expect(swardPlan({ ...SWARD, deadKgHa: 1500, coverPct: 4 }).litter).toBe(0);
  });

  it('the caption gives height, green leaf height, % green and kg DM/ha', () => {
    expect(
      swardCaption({ ...SWARD, heightCm: 12.4, leafCm: 8.6, greenPct: 64, massKgHa: 1850 }),
    ).toBe('About 12 cm tall. Green leaf to about 9 cm. 64% green. 1,850 kg DM/ha.');
  });

  it('a paddock that is part crop and part pasture shows two pictures, crop then pasture, each with its area', () => {
    const view = sampleView();
    view.plantings = [
      {
        id: 4,
        name: 'oats',
        kind: 'crop',
        stage: 'veg',
        squares: 200,
        labelCell: 5,
        selfSown: false,
        oversown: false,
        ready: false,
      },
    ];
    const pad = view.paddocks[0]!;
    pad.parts = [
      { kind: 'pasture', ha: 320, planting: -1, sward: { ...SWARD, heightCm: 15 } },
      { kind: 'crop', ha: 200, planting: 0, sward: { ...SWARD, heightCm: 40 } },
    ];
    const parts = swardParts(pad, view.plantings);
    expect(parts.map((p) => [p.title, p.ha])).toEqual([
      ['oats', 200],
      ['pasture', 320],
    ]);
    expect(parts[0]!.sward.heightCm).toBe(40);
  });

  it('any other paddock shows one picture', () => {
    const view = sampleView();
    const pad = view.paddocks[1]!;
    expect(swardParts(pad, [])).toEqual([{ title: 'Paddock 2', ha: 520, sward: pad.sward }]);
    // Pasture beside stubble is still one picture of the paddock.
    pad.parts = [
      { kind: 'pasture', ha: 400, planting: -1, sward: SWARD },
      { kind: 'stubble', ha: 120, planting: -1, sward: SWARD },
    ];
    expect(swardParts(pad, []).length).toBe(1);
  });
});

describe('frame time figures', () => {
  it('sums up a run of frames', () => {
    const times = [...new Array<number>(95).fill(16), 20, 20, 20, 40, 60];
    const s = frameStats(times);
    expect(s.frames).toBe(100);
    expect(s.meanMs).toBe(16.8);
    expect(s.p50Ms).toBe(16);
    expect(s.p95Ms).toBe(20);
    expect(s.p99Ms).toBe(60);
    expect(s.maxMs).toBe(60);
    expect(s.fps).toBe(59.52);
    // Five frames were slower than 60 a second allows, and one was over 50 ms.
    expect(s.slowShare).toBe(0.05);
    expect(s.over50).toBe(1);
  });

  it('a frame of 17.7 ms counts as on time and one of 17.8 as slow', () => {
    expect(frameStats([17.7]).slowShare).toBe(0);
    expect(frameStats([17.8]).slowShare).toBe(1);
    expect(frameStats([50]).over50).toBe(0);
    expect(frameStats([50.1]).over50).toBe(1);
  });

  it('a screen is struggling when the middle frame of 45 in a row is over 25 ms', () => {
    const run = (ms: number, n = 45): number[] => new Array<number>(n).fill(ms);
    expect(struggling(run(16.7))).toBe(false);
    expect(struggling(run(25))).toBe(false);
    expect(struggling(run(25.1))).toBe(true);
    expect(struggling(run(33))).toBe(true);
    // A few slow frames among fast ones do not count.
    expect(struggling([...run(16.7, 30), ...run(60, 15)])).toBe(false);
    // A short run says nothing either way.
    expect(struggling(run(40, 44))).toBe(false);
  });

  it('no frames gives zeros, not a broken number', () => {
    const s = frameStats([]);
    expect(s.frames).toBe(0);
    expect(s.fps).toBe(0);
    expect(Object.values(s).every((v) => Number.isFinite(v))).toBe(true);
  });
});
