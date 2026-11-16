import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../../test-support/mvp';
import {
  cropsFromMvp,
  expectSameCrops,
  loadMvpFarm,
  mvpNewGame,
  type MvpFarmField,
} from '../../test-support/mvpFarm';
import { dateAt } from '../calendar';
import { CONVERT_COST_PER_HA, CROP_DISTRICT_FACTORS, LAND_OPTIONS } from '../data/crops';
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../data/species';
import { GRID_N } from '../grid';
import { LAND } from '../pasture/state';
import { rngStream } from '../rng';
import {
  addField,
  cropGrazed,
  cropRisks,
  endField,
  fieldAt,
  fieldById,
  fieldProgress,
  fieldState,
  fieldYield,
  harvestField,
  plantingsOn,
  sow,
  sowInfo,
  squareGrazed,
  type CropRisk,
  type Field,
  type FieldProgress,
} from './fields';

/*
 * Sown pastures, forages and crops against the MVP's own fieldState,
 * fieldYield, cropGrazed, addField, endField, harvestField, sowInfo,
 * cropRisks and stageText.
 *
 * Both get the same planting, the same day and the same factors. Every
 * figure must be the same number exactly. Nothing here uses a tolerance.
 */

// The MVP runs slowly in its sandbox, more so when test files run side by side.
vi.setConfig({ testTimeout: 180000 });

const loaded = loadMvpFarm();
const { mvp } = loaded;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Start a mixed farm in the MVP, so there is arable land and a rotation. */
function mixedFarm(district: DistrictId, month: number, seed: number, year = 2021): void {
  const arable = { cq: 40, nsw: 20, cw: 60, wv: 35 }[district];
  mvpNewGame(
    loaded,
    { region: district, year, month, ha: 2000, mixed: true, arable, cropped: 50 },
    seededRandom(seed),
  );
}

/** Where two records first differ, or null. Numbers must be the same exactly. */
function recordDifference(mine: object, theirs: object): string | null {
  const a = mine as Record<string, unknown>;
  const b = theirs as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!Object.is(a[k], b[k])) return `${k}: engine ${String(a[k])}, MVP ${String(b[k])}`;
  }
  return null;
}

mixedFarm('cw', 3, 1);

describe('what a planting is doing today, against the MVP', () => {
  it.each(DISTRICT_IDS)(
    '%s: every species, every day of its life, every start month',
    { timeout: 120000 },
    (id) => {
      mvp.S.region = id;
      let compared = 0;
      const stages = new Set<string>();
      for (const key of SPECIES_IDS) {
        const sp = SPECIES[key];
        // Days since sowing: from before it is sown to well past its end.
        const ages: number[] = [];
        if (sp.type === 'pasture') {
          const life = sp.life! * 365;
          for (let t = -3; t <= sp.estab + 3; t += 1) ages.push(t);
          ages.push(364, 365, 366, 1000, life - 1, life, life + 1, life + 200, life + 365);
          ages.push(life + 1094, life + 1095, life + 1096, life + 2000, life + 4000);
        } else {
          const life = (sp.type === 'crop' ? sp.mature : sp.life)!;
          for (let t = -3; t <= life + 70; t++) ages.push(t);
        }
        for (let month = 0; month < 12; month++) {
          mvp.S.startM = month;
          mvp.S.startY = 2020;
          const start = { year: 2020, month };
          for (const t of ages) {
            // The farm day moves through the month so every part of the curve is read.
            const day = (t * 7 + month * 3) % 400;
            const f = {
              id: 1,
              sp: key,
              sown: day - t,
              cells: [0],
              str: t % 5 === 0 ? 0.12 : undefined,
            };
            const monthF = [0.15, 0.6, 1, 1.35, 1.9][Math.abs(t) % 5]!;
            const theirs = mvp.fieldState(f as MvpFarmField, day, monthF);
            const mine = fieldState(f, day, monthF, { district: id, start });
            const diff = recordDifference(mine, theirs);
            if (diff) throw new Error(`${id} ${key} age ${t} month ${month}: ${diff}`);
            stages.add(`${sp.type}:${mine.stage}`);
            compared++;
          }
        }
      }
      expect(compared).toBeGreaterThan(20000);
      // Every stage of every kind of planting was reached.
      expect([...stages].sort()).toEqual(
        [
          'annual:done',
          'annual:est',
          'annual:head',
          'annual:none',
          'annual:veg',
          'crop:done',
          'crop:est',
          'crop:head',
          'crop:lock',
          'crop:none',
          'crop:veg',
          'pasture:est',
          'pasture:ok',
        ].sort(),
      );
    },
  );

  it('old sown pasture loses at most 0.045 DMD and 3.6 CP points', () => {
    const ctx = { district: 'wv' as const, start: { year: 2020, month: 0 } };
    const young = fieldState({ sp: 'rye', sown: -400 }, 0, 1, ctx);
    const old = fieldState({ sp: 'rye', sown: -365 * 40 }, 0, 1, ctx);
    expect(young.pf).toBe(1);
    expect(old.pf).toBe(0.55);
    expect(young.dmd - old.dmd).toBeCloseTo(0.045, 12);
    expect(young.cp - old.cp).toBeCloseTo(3.6, 12);
    expect(old.pot).toBeCloseTo(young.pot * 0.55, 10);
  });

  it('a finished crop has no growth potential, so it never regrows', () => {
    for (const key of SPECIES_IDS) {
      const sp = SPECIES[key];
      if (sp.type === 'pasture') continue;
      const life = (sp.type === 'crop' ? sp.mature : sp.life)!;
      for (const district of DISTRICT_IDS) {
        for (let t = life; t < life + 80; t += 7) {
          const now = fieldState({ sp: key, sown: 0 }, t, 1.9, {
            district,
            start: { year: 2020, month: 0 },
          });
          expect(now.stage).toBe('done');
          expect(now.pot).toBe(0);
        }
      }
    }
  });

  it('stage senescence is 1.5% a day while heading and 4% a day once finished', () => {
    const ctx = { district: 'cw' as const, start: { year: 2020, month: 3 } };
    const at = (t: number): number => fieldState({ sp: 'oats', sown: 0 }, t, 1, ctx).sen;
    expect([at(0), at(60), at(120), at(149)]).toEqual([0, 0, 0, 0]);
    expect([at(150), at(199)]).toEqual([0.015, 0.015]);
    expect([at(200), at(400)]).toEqual([0.04, 0.04]);
  });

  it('hands the pasture step one record for each planting', () => {
    mixedFarm('wv', 5, 9);
    const e = cropsFromMvp(mvp);
    const p = plantingsOn(e.crops, 0, 0.8, e.ctx)!;
    expect(p.byId.size).toBe(mvp.S.fields.length);
    expect(p.byId.size).toBeGreaterThan(0);
    for (const f of mvp.S.fields) {
      const theirs = mvp.fieldState(f, 0, 0.8);
      expect(recordDifference(p.byId.get(f.id)!.now, theirs)).toBeNull();
      expect(p.byId.get(f.id)!.kind).toBe(mvp.SPECIES[f.sp]!.type);
    }
    expect(p.fid).toBe(e.crops.fid);
    expect(p.density).toBe(e.crops.density);
    e.crops.fields = [];
    expect(plantingsOn(e.crops, 0, 1, e.ctx)).toBeNull();
  });
});

describe('yield, against the MVP', () => {
  it('every grain crop, damaged and whole, in seasons from drought to wet', () => {
    const rng = rngStream(1, 'yield');
    for (const id of DISTRICT_IDS) {
      mixedFarm(id, 4, 20 + id.length);
      for (const key of ['oats', 'wheat', 'barley', 'grsorg', 'forsorg', 'phal'] as const) {
        const cells = Array.from({ length: 37 }, (_, k) => k * 3 + 100);
        const f = mvp.addField(key, cells, mvp.S.day);
        for (const i of cells) if (rng.chance(0.5)) mvp.S.Y[i] = mvp.S.Y[i]! * rng.next();
        const e = cropsFromMvp(mvp);
        for (const seasonF of [0.2, 0.4, 0.5, 0.7, 0.85, 1, 1.15, 1.35, 1.4, 1.8]) {
          mvp.S.rainF = seasonF;
          const theirs = mvp.fieldYield(f);
          const mine = fieldYield(e.crops, fieldById(e.crops, f.id)!, seasonF, e.ctx.haPerSquare);
          expect(recordDifference(mine, theirs), `${id} ${key} season ${seasonF}`).toBeNull();
        }
      }
    }
  });

  it('a full stand in an average season yields the species figure times the district factor', () => {
    mixedFarm('cw', 4, 5);
    const e = cropsFromMvp(mvp);
    const f = addField(e.crops, e.pasture, e.ctx, 'barley', [5, 6, 7], 0);
    const y = fieldYield(e.crops, f, 1, e.ctx.haPerSquare);
    expect(y.tha).toBe(Math.fround(3.2 * CROP_DISTRICT_FACTORS.cw));
    expect(y.ha).toBe(3 * e.ctx.haPerSquare);
    expect(y.t).toBe(y.tha * y.ha);
    expect(y.value).toBe(y.t * 280);
    expect(y.cost).toBe(y.ha * 60);
    // The season is held between 0.4 and 1.4 before it is counted.
    expect(fieldYield(e.crops, f, 0.1, 1).tha).toBe(fieldYield(e.crops, f, 0.4, 1).tha);
    expect(fieldYield(e.crops, f, 3, 1).tha).toBe(fieldYield(e.crops, f, 1.4, 1).tha);
    expect(fieldYield(e.crops, f, 0.5, 1).tha).toBe(y.tha * Math.pow(0.5, 0.8));
  });
});

describe('grazing damage, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: every species it can plant, at every stage', (id) => {
    mixedFarm(id, 2, 31);
    const rng = rngStream(2, `graze-${id}`);
    const kinds = new Set<string>();
    for (const key of LAND_OPTIONS[id]) {
      const sp = SPECIES[key];
      const end = sp.type === 'pasture' ? sp.estab + 40 : (sp.mature ?? sp.life)! + 40;
      for (let t = 0; t <= end; t += 3) {
        const cells = [200, 201, 202, 203, 204, 205];
        const f = mvp.addField(key, cells, mvp.S.day - t);
        const e = cropsFromMvp(mvp);
        const mine = fieldById(e.crops, f.id)!;
        for (const i of cells) {
          // Feed taken from the square, the green part of it, and the green that was there.
          const r = rng.pick([0.5, 3, 3.01, 20, 120, 400, 499, 500, 650, 800, 1000, 2500]);
          const g = rng.pick([0, 5, 300, 2000]);
          const rg = Math.min(g, r * rng.next());
          mvp.cropGrazed(f, i, r, rg, g);
          const ev = cropGrazed(e.crops, mine, i, r, rg, g, mvp.S.day);
          if (ev) kinds.add(ev.type);
          expect(mine.dmgNote ?? false).toBe(!!f.dmgNote);
          expect(mine.lockNote ?? false).toBe(!!f.lockNote);
        }
        expectSameCrops(e, mvp, `${id} ${key} age ${t}`);
        mvp.endField(f);
        mvp.S.regen = [];
      }
    }
    expect(kinds.has('grazed-before-established')).toBe(true);
    if (id !== 'nsw') expect(kinds.has('grain-crop-grazed')).toBe(true);
    expect(kinds.has('grazed-after-lock-up')).toBe(true);
  });

  it('gives each notice once for a planting', () => {
    mixedFarm('cw', 2, 4);
    const e = cropsFromMvp(mvp);
    const f = addField(e.crops, e.pasture, e.ctx, 'barley', [300, 301], 0);
    const first = cropGrazed(e.crops, f, 300, 100, 50, 400, 10);
    expect(first).toEqual({
      type: 'grazed-before-established',
      fieldId: f.id,
      sp: 'barley',
      cell: 300,
    });
    expect(cropGrazed(e.crops, f, 301, 100, 50, 400, 11)).toBeNull();
    // Established, and a grain-only crop: the yield falls again but no second notice.
    const before = e.crops.yieldT[300]!;
    expect(cropGrazed(e.crops, f, 300, 400, 100, 900, 100)).toBeNull();
    expect(e.crops.yieldT[300]).toBe(Math.fround(before * (1 - 400 / 800)));
    // After maturity grazing costs nothing more.
    const ripe = e.crops.yieldT[300]!;
    expect(cropGrazed(e.crops, f, 300, 400, 100, 900, 180)).toBeNull();
    expect(e.crops.yieldT[300]).toBe(ripe);
  });

  it('the limits: 60% of the stand, 80% of a grain crop, 90% after lock-up, 4% before', () => {
    mixedFarm('cw', 2, 4);
    const e = cropsFromMvp(mvp);
    const oats = addField(e.crops, e.pasture, e.ctx, 'oats', [400, 401, 402], 0);
    const barley = addField(e.crops, e.pasture, e.ctx, 'barley', [403], 0);
    const y0 = e.crops.yieldT[400]!;
    cropGrazed(e.crops, oats, 400, 5000, 100, 100, 10);
    expect(e.crops.density[400]).toBe(Math.fround(1 - 0.6));
    expect(e.crops.yieldT[400]).toBe(Math.fround(y0 * (1 - 0.6)));
    cropGrazed(e.crops, oats, 401, 5000, 100, 100, 60);
    expect(e.crops.yieldT[401]).toBe(Math.fround(y0 * (1 - 0.04)));
    expect(e.crops.density[401]).toBe(1);
    cropGrazed(e.crops, oats, 402, 5000, 5000, 100, 120);
    expect(e.crops.yieldT[402]).toBe(Math.fround(y0 * (1 - 0.9)));
    const b0 = e.crops.yieldT[403]!;
    cropGrazed(e.crops, barley, 403, 5000, 100, 100, 60);
    expect(e.crops.yieldT[403]).toBe(Math.fround(b0 * (1 - 0.8)));
  });

  it('only squares with a planting and more than 3 kg DM/ha taken are touched', () => {
    mixedFarm('cw', 2, 4);
    const e = cropsFromMvp(mvp);
    const bare = e.crops.fid.findIndex((v) => v < 0);
    expect(squareGrazed(e.crops, bare, 500, 100, 100, 0)).toBeNull();
    const f = addField(e.crops, e.pasture, e.ctx, 'oats', [bare], 0);
    const y = e.crops.yieldT[bare];
    expect(squareGrazed(e.crops, bare, 3, 1, 100, 5)).toBeNull();
    expect(e.crops.yieldT[bare]).toBe(y);
    expect(squareGrazed(e.crops, bare, 3.5, 1, 100, 5)?.type).toBe('grazed-before-established');
    expect(e.crops.yieldT[bare]).not.toBe(y);
    expect(f.dmgNote).toBe(true);
  });
});

describe('sowing, ending and harvesting, against the MVP', () => {
  it.each(DISTRICT_IDS)(
    '%s: what a sowing covers and costs, for every option, every month',
    (id) => {
      mixedFarm(id, 0, 44);
      const rng = rngStream(3, `sow-${id}`);
      // Put a pasture and a forage in the ground so some squares are taken.
      mvp.addField(LAND_OPTIONS[id][0]!, [10, 11, 12, 50, 51], 0);
      const arableCells: number[] = [];
      mvp.S.arable.forEach((v, i) => {
        if (v) arableCells.push(i);
      });
      expect(arableCells.length).toBeGreaterThan(50);
      for (let day = 0; day < 365; day += 16) {
        mvp.S.day = day;
        const e = cropsFromMvp(mvp);
        for (const key of LAND_OPTIONS[id]) {
          const cells = [
            ...Array.from({ length: 30 }, () => rng.int(0, GRID_N - 1)),
            ...Array.from({ length: 30 }, () => rng.pick(arableCells)),
          ].filter((v, k, a) => a.indexOf(v) === k);
          const theirs = mvp.sowInfo(key, cells);
          const mine = sowInfo(e.crops, e.pasture, e.ctx, key, cells, day);
          expect(mine.use).toEqual(Array.from(theirs.use));
          expect([mine.conv, mine.ha, mine.cost, mine.now, mine.crop]).toEqual([
            theirs.conv,
            theirs.ha,
            theirs.cost,
            theirs.now,
            theirs.crop,
          ]);
          expect(mine.convHa).toBe(theirs.conv * mvp.HA);
          expect(mine.now).toBe(SPECIES[key].sow.includes(dateAt(e.ctx.start, day).month));
        }
      }
    },
  );

  it.each(DISTRICT_IDS)(
    '%s: sowing, a self-sown stand, ending and harvest change the farm the same way',
    (id) => {
      mixedFarm(id, 3, 52);
      const rng = rngStream(4, `fields-${id}`);
      const e = cropsFromMvp(mvp);
      expectSameCrops(e, mvp, 'at the start');
      const S = mvp.S;
      const free = (n: number, arable: boolean): number[] => {
        const out: number[] = [];
        while (out.length < n) {
          const i = rng.int(0, GRID_N - 1);
          if (!!S.arable[i] === arable && !out.includes(i)) out.push(i);
        }
        return out;
      };
      let made = 0;
      for (const key of LAND_OPTIONS[id]) {
        const sp = SPECIES[key];
        // Sow it in its window, over whatever is there, pasture and old plantings included.
        let day = 0;
        while (!sp.sow.includes(dateAt(e.ctx.start, day).month)) day += 5;
        S.day = day;
        const cells = [...free(12, true), ...free(6, false)];
        const info = mvp.sowInfo(key, cells);
        const r = sow(e.crops, e.pasture, e.ctx, key, cells, day);
        if (!info.use.length) {
          expect(r).toMatchObject({ ok: false, reason: 'no-usable-land' });
          continue;
        }
        const theirs = mvp.addField(key, Array.from(info.use), day);
        if (!r.ok) throw new Error(`sow refused: ${r.reason}`);
        expect(r.field.id).toBe(theirs.id);
        expect(r.cost).toBe(info.cost);
        expect(r.skipped).toBe(cells.length - info.use.length);
        expectSameCrops(e, mvp, `after sowing ${key}`);
        made++;

        if (sp.type === 'crop') {
          // Too early is refused. From maturity it can be harvested.
          expect(
            harvestField(e.crops, e.pasture, e.ctx, theirs.id, day + sp.mature! - 1, 1),
          ).toMatchObject({
            ok: false,
            reason: 'not-ready',
          });
          S.day = day + sp.mature! + rng.int(0, 50);
          S.rainF = rng.pick([0.5, 0.85, 1, 1.35]);
          const est = mvp.fieldYield(theirs);
          mvp.harvestField(theirs);
          const h = harvestField(e.crops, e.pasture, e.ctx, theirs.id, S.day, S.rainF);
          if (!h.ok) throw new Error(`harvest refused: ${h.reason}`);
          expect(
            recordDifference({ tha: h.tha, t: h.t, ha: h.ha, value: h.value, cost: h.cost }, est),
          ).toBeNull();
          expect(h.cells).toEqual(Array.from(info.use));
          expectSameCrops(e, mvp, `after harvesting ${key}`);
          // Stubble on arable land, and a harvested crop can't be harvested again.
          for (const i of h.cells)
            expect(e.pasture.land[i]).toBe(S.arable[i] ? LAND.stubble : LAND.native);
          expect(harvestField(e.crops, e.pasture, e.ctx, theirs.id, S.day, 1)).toMatchObject({
            ok: false,
            reason: 'no-such-planting',
          });
        } else if (sp.type === 'annual') {
          S.day = day + sp.life! + 30;
          mvp.endField(theirs);
          endField(e.crops, e.pasture, e.ctx, fieldById(e.crops, theirs.id)!, S.day);
          expectSameCrops(e, mvp, `after ${key} ended`);
        }
      }
      expect(made).toBeGreaterThanOrEqual(LAND_OPTIONS[id].length - 1);
      // A self-sown stand keeps the feed that is there and has its own strength.
      S.day = 900;
      const cells = free(8, true).filter((i) => S.fid[i]! < 0);
      const key = id === 'cq' ? 'forsorg' : 'annrye';
      const theirs = mvp.addField(key, cells, 900, { str: 0.12, regen: true, keep: true });
      const mine = addField(e.crops, e.pasture, e.ctx, key, cells, 900, {
        str: 0.12,
        regen: true,
        keep: true,
      });
      expect(mine.id).toBe(theirs.id);
      expectSameCrops(e, mvp, 'after a self-sown stand');
      // It does not leave seed a second time.
      mvp.endField(theirs);
      endField(e.crops, e.pasture, e.ctx, mine, 900);
      expectSameCrops(e, mvp, 'after the self-sown stand ended');
    },
  );

  it('sowing rules: in the window, in the district, on land that can take it', () => {
    mixedFarm('cw', 3, 60);
    const e = cropsFromMvp(mvp);
    const arable = e.crops.arable.findIndex((v, i) => v === 1 && e.crops.fid[i]! < 0);
    const notArable = e.crops.arable.findIndex((v) => v === 0);
    const frozen = (): string =>
      JSON.stringify([
        Array.from(e.crops.fid),
        e.crops.fields,
        Array.from(e.pasture.land),
        Array.from(e.pasture.G),
      ]);
    const before = frozen();
    // April in Central West: wheat can be sown, grain sorghum is not grown there.
    expect(sow(e.crops, e.pasture, e.ctx, 'grsorg', [arable], 0)).toMatchObject({
      ok: false,
      reason: 'not-grown-here',
    });
    expect(sow(e.crops, e.pasture, e.ctx, 'wheat', [notArable], 0)).toMatchObject({
      ok: false,
      reason: 'no-usable-land',
    });
    expect(sow(e.crops, e.pasture, e.ctx, 'wheat', [arable], 200)).toMatchObject({
      ok: false,
      reason: 'out-of-window',
    });
    expect(sow(e.crops, e.pasture, e.ctx, 'wheat', [arable, GRID_N], 0)).toMatchObject({
      ok: false,
      reason: 'off-the-farm',
    });
    // A refusal changes nothing.
    expect(frozen()).toBe(before);
    const r = sow(e.crops, e.pasture, e.ctx, 'wheat', [arable, notArable, arable], 0);
    if (!r.ok) throw new Error(r.reason);
    expect(r.use).toEqual([arable]);
    expect(r.skipped).toBe(1);
    expect(fieldAt(e.crops, arable)).toBe(r.field);
    expect(e.pasture.land[arable]).toBe(LAND.crop);
    // Pasture can go anywhere, but not over a crop that is in the ground.
    const p = sow(e.crops, e.pasture, e.ctx, 'lucerne', [arable, notArable], 0);
    if (!p.ok) throw new Error(p.reason);
    expect(p.use).toEqual([notArable]);
    expect(p.conv).toBe(0);
  });

  it('converting pasture to cropping country is flagged and costed at $150 a hectare', () => {
    mixedFarm('cw', 3, 61);
    const e = cropsFromMvp(mvp);
    const HA = e.ctx.haPerSquare;
    const native: number[] = [];
    const fallow: number[] = [];
    e.crops.arable.forEach((v, i) => {
      if (!v || e.crops.fid[i]! >= 0) return;
      if (e.pasture.land[i] === LAND.native && native.length < 4) native.push(i);
      if (e.pasture.land[i] === LAND.fallow && fallow.length < 3) fallow.push(i);
    });
    expect([native.length, fallow.length]).toEqual([4, 3]);
    const info = sowInfo(e.crops, e.pasture, e.ctx, 'wheat', [...native, ...fallow], 0);
    expect(info.conv).toBe(4);
    expect(info.convHa).toBe(4 * HA);
    expect(info.cost).toBe(7 * HA * 320 + 4 * HA * CONVERT_COST_PER_HA);
    expect(sowInfo(e.crops, e.pasture, e.ctx, 'wheat', fallow, 0).conv).toBe(0);
  });

  it('an annual pasture leaves seed for the 15th of the first month of its next window', () => {
    mixedFarm('wv', 2, 62);
    const e = cropsFromMvp(mvp);
    const cells = [5, 6, 7];
    const f = addField(e.crops, e.pasture, e.ctx, 'annrye', cells, 0);
    endField(e.crops, e.pasture, e.ctx, f, 280);
    expect(e.crops.regen).toHaveLength(1);
    const date = dateAt(e.ctx.start, e.crops.regen[0]!.day);
    expect([date.month, date.date]).toEqual([2, 15]);
    expect(e.crops.regen[0]!.day).toBeGreaterThanOrEqual(310);
    expect(e.crops.regen[0]!.cells).toEqual(cells);
    // A forage with no seed bank leaves nothing.
    const g = addField(e.crops, e.pasture, e.ctx, 'brass', [8, 9], 300);
    endField(e.crops, e.pasture, e.ctx, g, 470);
    expect(e.crops.regen).toHaveLength(1);
  });

  it('only a grain crop can be harvested', () => {
    mixedFarm('wv', 2, 63);
    const e = cropsFromMvp(mvp);
    const forage = addField(e.crops, e.pasture, e.ctx, 'brass', [5, 6], 0);
    const pasture = addField(e.crops, e.pasture, e.ctx, 'rye', [7], 0);
    for (const f of [forage, pasture]) {
      expect(harvestField(e.crops, e.pasture, e.ctx, f.id, 500, 1)).toMatchObject({
        ok: false,
        reason: 'not-a-grain-crop',
      });
    }
    expect(e.crops.fields).toContain(forage);
    expect(e.crops.fields).toContain(pasture);
  });

  it.each(DISTRICT_IDS)('%s: the cases a season seldom reaches', (id) => {
    mixedFarm(id, 3, 90);
    const S = mvp.S;
    const arable: number[] = [];
    const notArable: number[] = [];
    S.arable.forEach((v, i) => {
      if (S.fid[i]! >= 0) return;
      if (v) arable.push(i);
      else notArable.push(i);
    });
    const pastureKey = LAND_OPTIONS[id].find(
      (k) => SPECIES[k].type === 'pasture' && !SPECIES[k].oversow,
    )!;
    const dual = 'oats';
    let e = cropsFromMvp(mvp);
    const same = (where: string): void => expectSameCrops(e, mvp, `${id}: ${where}`);
    const both = (
      key: SpeciesId,
      cells: number[],
      sown: number,
      o?: { str?: number; regen?: boolean; keep?: boolean },
    ): { theirs: MvpFarmField; mine: Field } => ({
      theirs: mvp.addField(key, cells, sown, o),
      mine: addField(e.crops, e.pasture, e.ctx, key, cells, sown, o),
    });
    const graze = (
      f: { theirs: MvpFarmField; mine: Field },
      i: number,
      r: number,
      rg: number,
      g: number,
    ) => {
      mvp.cropGrazed(f.theirs, i, r, rg, g);
      return cropGrazed(e.crops, f.mine, i, r, rg, g, S.day);
    };

    // A pasture grazed before it is established has a thin stand. Sowing a
    // crop over all of it starts a full stand, and the old pasture is gone.
    const a = arable.slice(0, 5);
    S.day = 0;
    const thin = both(pastureKey, a, 0);
    S.day = 10;
    for (const i of a) graze(thin, i, 300, 100, 120);
    expect(e.crops.density[a[0]!]).toBeLessThan(1);
    same('pasture grazed early');
    const over = both(dual, a, 20);
    expect(e.crops.fields).not.toContain(thin.mine);
    expect(e.crops.density[a[0]!]).toBe(1);
    same('crop sown over the thin pasture');

    // The crop is grazed before it is established, then again at lock-up to
    // the day. Each gives its own notice. Left standing, it ends as a full stand of stubble.
    S.day = 30;
    expect(graze(over, a[0]!, 200, 30, 40)?.type).toBe('grazed-before-established');
    S.day = 20 + SPECIES[dual].lock!;
    expect(graze(over, a[1]!, 200, 150, 900)?.type).toBe('grazed-after-lock-up');
    expect(graze(over, a[2]!, 200, 150, 900)).toBeNull();
    same('grazed at lock-up');
    S.day = 20 + SPECIES[dual].mature! + 60;
    mvp.endField(over.theirs);
    endField(e.crops, e.pasture, e.ctx, over.mine, S.day);
    expect(e.crops.density[a[0]!]).toBe(1);
    same('left standing and ended');

    // A forage that ends off arable land goes back to native pasture as it stands.
    const off = both('millet', notArable.slice(0, 4), 400);
    S.day = 600;
    mvp.endField(off.theirs);
    endField(e.crops, e.pasture, e.ctx, off.mine, 600);
    expect(e.pasture.land[notArable[0]!]).toBe(LAND.native);
    same('ended off arable land');

    // A grain crop harvested on the very day it is ready, over heavy dead
    // feed: the stubble is held to 3,500 kg DM/ha.
    const grain = both(
      id === 'nsw' ? 'oats' : id === 'cq' ? 'grsorg' : 'barley',
      arable.slice(5, 9),
      700,
    );
    for (const i of arable.slice(5, 9)) {
      S.D[i] = 9000;
      e.pasture.D[i] = 9000;
    }
    S.day = 700 + SPECIES[grain.mine.sp].mature!;
    S.rainF = 1;
    mvp.harvestField(grain.theirs);
    const h = harvestField(e.crops, e.pasture, e.ctx, grain.mine.id, S.day, 1);
    expect(h.ok).toBe(true);
    expect(e.pasture.D[arable[5]!]).toBe(3500);
    same('harvested on the day, heavy dead feed');

    // Seed from an annual pasture: the day it comes up, for every day the stand could end.
    const seedCells = arable.slice(9, 11);
    for (let end = 1000; end < 1400; end++) {
      S.regen = [];
      e = cropsFromMvp(mvp);
      const rye = both('annrye', seedCells, end - 280);
      S.day = end;
      mvp.endField(rye.theirs);
      endField(e.crops, e.pasture, e.ctx, rye.mine, end);
      expect(e.crops.regen.map((r) => r.day)).toEqual(S.regen.map((r) => r.day));
      expect(e.crops.regen).toHaveLength(1);
    }
  });
});

describe('what stock would meet, against the MVP', () => {
  const kindOf = (line: string): CropRisk['type'] =>
    line.startsWith('This paddock is a mix')
      ? 'mixed-paddock'
      : line.includes("isn't established yet")
        ? 'not-established'
        : line.includes('is a grain crop')
          ? 'grain-crop'
          : line.includes('is locked up for grain')
            ? 'locked-up'
            : 'stubble';

  it.each(DISTRICT_IDS)('%s: the same notes, in the same order, through two years', (id) => {
    mixedFarm(id, 3, 70);
    const seen = new Set<string>();
    // A few more plantings, so every note comes up.
    const arable: number[] = [];
    mvp.S.arable.forEach((v, i) => {
      if (v && mvp.S.fid[i]! < 0) arable.push(i);
    });
    mvp.addField(id === 'cq' ? 'grsorg' : id === 'nsw' ? 'oats' : 'barley', arable.slice(0, 6), 0);
    mvp.addField('oats', arable.slice(6, 12), -100);
    for (const i of arable.slice(12, 20)) mvp.S.land[i] = 5;
    const fallow = arable.slice(20).filter((i) => mvp.S.land[i] === 4);
    expect(fallow.length).toBeGreaterThan(0);
    const areas = [
      ...mvp.PADS,
      { cells: arable.slice(0, 30) },
      { cells: [0, 1, 2] },
      // Crop and nothing else, and crop beside bare fallow: neither is "a mix".
      { cells: arable.slice(0, 6) },
      { cells: [...arable.slice(0, 6), ...fallow] },
    ];
    for (let day = 0; day < 260; day += 9) {
      mvp.S.day = day;
      const e = cropsFromMvp(mvp);
      for (const area of areas) {
        const theirs = mvp.cropRisks(area);
        const mine = cropRisks(e.crops, e.pasture, e.ctx, Array.from(area.cells), day);
        expect(mine.map((r) => r.type)).toEqual(Array.from(theirs).map(kindOf));
        mine.forEach((r, k) => {
          seen.add(r.type);
          if (r.type === 'not-established') {
            const d = dateAt(e.ctx.start, r.readyDay);
            expect(theirs[k]).toContain(`${d.date} ${MONTHS[d.month]} ${d.year}`);
          }
        });
      }
    }
    expect([...seen].sort()).toEqual(
      ['grain-crop', 'locked-up', 'mixed-paddock', 'not-established', 'stubble']
        .filter((k) => !(id === 'nsw' && k === 'grain-crop'))
        .sort(),
    );
  });
});

describe('where a planting is up to, against the MVP', () => {
  const TEXT: Record<FieldProgress['code'], (s: string) => boolean> = {
    'pasture-establishing': (s) => s.startsWith('establishing (sown'),
    'pasture-established': (s) => / old(,|$)/.test(s),
    'establishing-keep-off': (s) => s.startsWith('establishing, keep stock off'),
    establishing: (s) => s.startsWith('establishing, not ready to graze'),
    'growing-keep-off': (s) => s.startsWith('growing, keep stock off'),
    vegetative: (s) => s.startsWith('vegetative, good to graze until lock-up'),
    'locked-up': (s) => s.startsWith('locked up for grain'),
    heading: (s) => s.startsWith('heading and filling grain'),
    'ready-to-harvest': (s) => s === 'ready to harvest',
    finished: (s) => s === 'finished',
    grazing: (s) => s.startsWith('vegetative, good grazing'),
    'going-to-head': (s) => s.startsWith('going to head'),
    'finished-for-season': (s) => s === 'finished for the season',
    'not-sown': () => false,
  };

  it('every species at every age reads the same as the MVP', () => {
    mixedFarm('cw', 3, 80);
    const start = { year: mvp.S.startY, month: mvp.S.startM };
    const seen = new Set<string>();
    for (const key of SPECIES_IDS) {
      const sp = SPECIES[key];
      const end = sp.type === 'pasture' ? sp.life! * 365 + 800 : (sp.mature ?? sp.life)! + 80;
      const ages: number[] = [];
      for (let t = 0; t <= end; t += sp.type === 'pasture' ? 37 : 1) ages.push(t);
      if (sp.type === 'pasture') {
        // The days either side of established, and of the end of its life.
        ages.push(sp.estab - 1, sp.estab, sp.estab + 1);
        ages.push(sp.life! * 365 - 1, sp.life! * 365, sp.life! * 365 + 1);
      }
      for (const t of ages) {
        const day = 400;
        mvp.S.day = day;
        const f: Field = { id: 1, sp: key as SpeciesId, sown: day - t, cells: [0] };
        const theirs = { ...f, now: mvp.fieldState(f, day, 1) } as MvpFarmField;
        const text = mvp.stageText(theirs);
        const mine = fieldProgress(f, day, { district: 'cw', start });
        expect(TEXT[mine.code](text), `${key} age ${t}: ${mine.code} against "${text}"`).toBe(true);
        seen.add(mine.code);
        if ('day' in mine) {
          const d = dateAt(start, mine.day);
          expect(text).toContain(`${d.date} ${MONTHS[d.month]} ${d.year}`);
        }
        if (mine.code === 'pasture-established') {
          expect(mine.thinning).toBe(text.includes('thinning'));
          expect(mine.ageDays).toBe(t);
        }
      }
    }
    expect(seen.size).toBe(13);
    expect(fieldProgress({ sp: 'oats', sown: 10 }, 5, { district: 'cw', start })).toEqual({
      code: 'not-sown',
    });
  });
});
