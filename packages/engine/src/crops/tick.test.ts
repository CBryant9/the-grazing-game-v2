import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { firstDifference } from '../../test-support/farms';
import { seededRandom } from '../../test-support/mvp';
import {
  cropsFromMvp,
  expectSameCrops,
  loadMvpFarm,
  logSince,
  mvpNewGame,
} from '../../test-support/mvpFarm';
import { dateAt } from '../calendar';
import { LAND_OPTIONS } from '../data/crops';
import { DISTRICTS } from '../data/districts';
import { SPECIES } from '../data/species';
import { GRID_N } from '../grid';
import { growGrass } from '../pasture/grow';
import { LAND } from '../pasture/state';
import { rngStream } from '../rng';
import { randomSeasons } from '../season/randomSeasons';
import {
  addField,
  createCropState,
  harvestField,
  plantingsOn,
  sow,
  squareGrazed,
  type GrazeDamageEvent,
} from './fields';
import { fieldTick, type CropEvent } from './tick';
import { createPastureState } from '../pasture/state';

/*
 * The daily crop step against the MVP's own fieldTick, day by day.
 *
 * A mixed farm runs for more than two years in the MVP and in the engine.
 * Each day both run the crop step and then the pasture step. Along the way
 * crops are sown when their windows open, some are grazed at the wrong
 * time, some are harvested and some are left standing. After every step the
 * pasture, the plantings, the stand density, the yield in prospect and the
 * seed waiting must be equal, exactly. Every MVP diary line must have its
 * matching event, in the same order.
 */

// The MVP runs slowly in its sandbox, more so when test files run side by side.
vi.setConfig({ testTimeout: 180000 });

const loaded = loadMvpFarm();
const { mvp } = loaded;

const seenEvents = new Set<string>();
const sownSpecies = new Set<string>();

/** What the MVP's diary line for an event must say. */
function matches(e: CropEvent | GrazeDamageEvent, line: string): boolean {
  if (e.type === 'sowing-window') {
    return line.startsWith(
      `If you want to plant ${SPECIES[e.sp].name.toLowerCase()}, now's the time`,
    );
  }
  const name = SPECIES[e.sp].name.toLowerCase();
  if (e.type === 'grazed-before-established') {
    return line.includes(`grazing the ${name}`) && line.includes("before it's established");
  }
  if (e.type === 'grain-crop-grazed') {
    return line.includes(`eating the ${name}`) && line.includes("It's a grain crop");
  }
  if (e.type === 'grazed-after-lock-up') {
    return line.includes(`grazing the ${name}`) && line.includes('after lock-up');
  }
  if (e.type === 'self-sown') {
    return line.startsWith(`Some ${name} has come back from seed`) && line.includes('about 10%');
  }
  const who = (e.selfSown ? 'self-sown ' : '') + name;
  if (!line.toLowerCase().startsWith(who)) return false;
  switch (e.type) {
    case 'pasture-established':
      return line.includes('is established. Graze it lightly at first.');
    case 'pasture-thinning':
      return line.includes(`is ${e.years} years old and thinning`);
    case 'crop-established':
      return e.keepOff
        ? line.includes('is established. Keep stock off it until after harvest.')
        : line.includes(
            `is established and ready to graze (ME ${e.me.toFixed(1)}, ${Math.round(e.cp)}% protein)`,
          );
    case 'lock-up-soon':
      return line.includes(`locks up for grain in about ${e.days} days`);
    case 'harvest-ready':
      return line.includes(`is ready to harvest: about ${e.estimate.tha.toFixed(1)} t/ha`);
    case 'grain-shedding':
      return line.includes('is still standing. Grain is starting to shed');
    case 'forage-finished':
      return (
        line.includes('has finished for the season.') &&
        line.includes('About 10% may come back from seed next year.') === e.mayRegrow
      );
    case 'not-harvested':
      return line.includes('was never harvested. The grain is gone');
  }
}

function expectEvents(
  events: (CropEvent | GrazeDamageEvent)[],
  lines: string[],
  where: string,
): void {
  expect(
    events.length,
    `events ${where}: ${JSON.stringify(events)} against ${lines.join(' | ')}`,
  ).toBe(lines.length);
  events.forEach((e, k) => {
    expect(matches(e, lines[k]!), `${e.type} against "${lines[k]}" ${where}`).toBe(true);
    seenEvents.add(e.type);
    if ('selfSown' in e && e.selfSown) seenEvents.add(`${e.type} (self-sown)`);
    if (e.type === 'crop-established') seenEvents.add(`crop-established keepOff=${e.keepOff}`);
    if (e.type === 'forage-finished') seenEvents.add(`forage-finished mayRegrow=${e.mayRegrow}`);
  });
}

/** Run a mixed farm for `days` in both, comparing after every step. */
function runFarm(id: DistrictId, month: number, seed: number, days: number): void {
  const arable = { cq: 40, nsw: 20, cw: 60, wv: 35 }[id];
  mvpNewGame(
    loaded,
    { region: id, year: 2021, month, ha: 2000, mixed: true, arable, cropped: 50 },
    seededRandom(seed),
  );
  const S = mvp.S;
  const rng = rngStream(seed, `crop-season-${id}`);
  // An old pasture that reaches the end of its life during the run, on land that is not arable.
  const firstPasture = LAND_OPTIONS[id].find(
    (k) => !SPECIES[k].oversow && SPECIES[k].type === 'pasture',
  )!;
  const old: number[] = [];
  for (let i = 0; i < GRID_N && old.length < 10; i++)
    if (!S.arable[i] && S.fid[i]! < 0) old.push(i);
  mvp.addField(firstPasture, old, 100 - SPECIES[firstPasture].life! * 365, { keep: true });
  if (LAND_OPTIONS[id].includes('stylo')) {
    // Old oversown stylo too. It thins, but gives no notice.
    const more: number[] = [];
    for (let i = 0; i < GRID_N && more.length < 6; i++)
      if (!S.arable[i] && S.fid[i]! < 0) more.push(i);
    mvp.addField('stylo', more, 200 - SPECIES.stylo.life! * 365, { keep: true });
  }

  const e = cropsFromMvp(mvp);
  const district = DISTRICTS[id];
  const seasons = randomSeasons({ seed, start: e.ctx.start });
  const arableCells: number[] = [];
  e.crops.arable.forEach((v, i) => {
    if (v) arableCells.push(i);
  });

  for (let day = 0; day < days; day++) {
    const where = `${id} start month ${month} day ${day}`;
    const f = seasons.factorsOn(day);
    S.day = day;
    S.monthF = f.monthF;
    S.rainF = f.seasonF;

    // The crop step.
    let seq = S.logSeq ?? 0;
    mvp.fieldTick();
    const events = fieldTick(e.crops, e.pasture, e.ctx, day, f.monthF, f.seasonF);
    expectEvents(events, logSince(mvp, seq), where);
    expectSameCrops(e, mvp, `after the crop step, ${where}`);
    // The MVP stops the clock when a crop is ready.
    if (events.some((x) => x.type === 'harvest-ready')) expect(mvp.U.playing).toBe(false);

    // Sow something whose window is open, now and then.
    const date = dateAt(e.ctx.start, day);
    for (const key of LAND_OPTIONS[id]) {
      const first = !sownSpecies.has(`${id}:${key}`);
      if (!SPECIES[key].sow.includes(date.month) || !rng.chance(first ? 0.3 : 0.02)) continue;
      const cells = [
        ...Array.from({ length: 10 }, () => rng.pick(arableCells)),
        ...Array.from({ length: 3 }, () => rng.int(0, GRID_N - 1)),
      ].filter((v, k, a) => a.indexOf(v) === k);
      const info = mvp.sowInfo(key, cells);
      const r = sow(e.crops, e.pasture, e.ctx, key, cells, day);
      expect(r.ok, `sowing ${key} ${where}`).toBe(info.now && info.use.length > 0);
      if (r.ok) {
        mvp.addField(key, Array.from(info.use), day);
        sownSpecies.add(`${id}:${key}`);
        expectSameCrops(e, mvp, `after sowing ${key}, ${where}`);
      }
    }

    // The pasture step, reading each planting's record for today.
    mvp.growGrass(false);
    growGrass(e.pasture, {
      district,
      date,
      seasonF: f.seasonF,
      monthF: f.monthF,
      plantings: plantingsOn(e.crops, day, f.monthF, e.ctx),
      haPerSquare: e.ctx.haPerSquare,
    });
    expect(firstDifference(e.pasture.grown, mvp.GRW), `grown ${where}`).toBeNull();
    expectSameCrops(e, mvp, `after the pasture step, ${where}`);

    // Stock get onto a few planted squares, as the MVP's grazing calls it.
    seq = S.logSeq ?? 0;
    const damage: GrazeDamageEvent[] = [];
    for (let k = 0; k < 4; k++) {
      const i = rng.chance(0.8) ? rng.pick(arableCells) : rng.int(0, GRID_N - 1);
      if (!rng.chance(0.15)) continue;
      const g = S.G[i]!;
      const r = rng.pick([2, 8, 60, 300, 900]);
      const rg = Math.min(g, r * rng.next());
      if (S.fid[i]! >= 0 && r > 3) {
        const fl = mvp.FMAP.get(S.fid[i]!);
        if (fl) mvp.cropGrazed(fl, i, r, rg, g);
      }
      const ev = squareGrazed(e.crops, i, r, rg, g, day);
      if (ev) damage.push(ev);
    }
    expectEvents(damage, logSince(mvp, seq), `grazing, ${where}`);

    // Harvest some ripe crops. The rest are left standing.
    for (const fl of S.fields.slice()) {
      const sp = SPECIES[fl.sp as keyof typeof SPECIES];
      if (sp.type !== 'crop' || day - fl.sown < sp.mature! || !rng.chance(0.03)) continue;
      const est = mvp.fieldYield(fl);
      mvp.harvestField(fl);
      const h = harvestField(e.crops, e.pasture, e.ctx, fl.id, day, f.seasonF);
      if (!h.ok) throw new Error(`harvest refused: ${h.reason} ${where}`);
      expect([h.tha, h.t, h.ha, h.value, h.cost]).toEqual([
        est.tha,
        est.t,
        est.ha,
        est.value,
        est.cost,
      ]);
      seenEvents.add('harvested');
    }
    expectSameCrops(e, mvp, `at the end of the day, ${where}`);
  }
}

describe('the daily crop step, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: 800 days from an autumn start', { timeout: 120000 }, (id) => {
    runFarm(id, 3, 101, 800);
  });

  it.each(DISTRICT_IDS)('%s: 800 days from a spring start', { timeout: 120000 }, (id) => {
    runFarm(id, 9, 202, 800);
  });

  it('seed comes up on fallow, native pasture and stubble, but not under another planting', () => {
    mvpNewGame(
      loaded,
      { region: 'wv', year: 2021, month: 2, ha: 2000, mixed: true, arable: 35, cropped: 50 },
      seededRandom(7),
    );
    const S = mvp.S;
    const cells: number[] = [];
    S.arable.forEach((v, i) => {
      if (v && S.fid[i]! < 0 && cells.length < 8) cells.push(i);
    });
    mvp.addField('annrye', cells, 0);
    const e = cropsFromMvp(mvp);
    const step = (day: number): CropEvent[] => {
      S.day = day;
      S.monthF = 1;
      S.rainF = 1;
      const seq = S.logSeq ?? 0;
      mvp.fieldTick();
      const events = fieldTick(e.crops, e.pasture, e.ctx, day, 1, 1);
      expectEvents(events, logSince(mvp, seq), `day ${day}`);
      expectSameCrops(e, mvp, `day ${day}`);
      return events;
    };
    step(250);
    step(280);
    const mine = (r: { cells: number[] }): boolean => r.cells.includes(cells[0]!);
    expect(e.crops.regen.filter(mine).map((r) => r.day)).toEqual([379]);
    // By the time the seed comes up, two squares have been worked to
    // fallow, two have gone back to native pasture, and one is under a new pasture.
    for (const [i, land] of [
      [cells[0]!, LAND.fallow],
      [cells[1]!, LAND.fallow],
      [cells[2]!, LAND.native],
      [cells[3]!, LAND.native],
    ] as const) {
      S.land[i] = land;
      e.pasture.land[i] = land;
    }
    S.day = 300;
    mvp.addField('rye', [cells[4]!], 300);
    addField(e.crops, e.pasture, e.ctx, 'rye', [cells[4]!], 300);
    expect(step(378).some((x) => x.type === 'self-sown')).toBe(false);
    expect(step(379).some((x) => x.type === 'self-sown')).toBe(true);
    const stand = e.crops.fields.find((f) => f.regen && mine(f))!;
    expect(stand.cells).toEqual([
      cells[0],
      cells[1],
      cells[2],
      cells[3],
      cells[5],
      cells[6],
      cells[7],
    ]);
    expect(stand).toMatchObject({ sp: 'annrye', sown: 379, str: 0.12, regen: true });
    expect(e.crops.regen.filter(mine)).toEqual([]);
  });

  afterAll(() => {
    // Every event the crop step can give came up, and every species was sown.
    expect([...seenEvents].sort()).toEqual(
      [
        'crop-established',
        'crop-established keepOff=false',
        'crop-established keepOff=true',
        'forage-finished',
        'forage-finished mayRegrow=false',
        'forage-finished mayRegrow=true',
        'forage-finished (self-sown)',
        'grain-crop-grazed',
        'grain-shedding',
        'grazed-after-lock-up',
        'grazed-before-established',
        'harvest-ready',
        'harvested',
        'lock-up-soon',
        'not-harvested',
        'pasture-established',
        'pasture-thinning',
        'self-sown',
        'self-sown (self-sown)',
        'sowing-window',
      ].sort(),
    );
    for (const id of DISTRICT_IDS) {
      for (const key of LAND_OPTIONS[id]) {
        expect(sownSpecies.has(`${id}:${key}`), `${key} sown in ${id}`).toBe(true);
      }
    }
  });
});

describe('things only happen for a reason', () => {
  const ctx = { district: 'cw' as const, start: { year: 2021, month: 3 }, haPerSquare: 2 };
  const farm = (): {
    crops: ReturnType<typeof createCropState>;
    pasture: ReturnType<typeof createPastureState>;
  } => {
    const crops = createCropState();
    const pasture = createPastureState();
    for (let i = 0; i < 200; i++) crops.arable[i] = 1;
    pasture.G.fill(900);
    pasture.D.fill(600);
    return { crops, pasture };
  };

  it('a farm with nothing sown has no events and no fallow, however long it runs', () => {
    const { crops, pasture } = farm();
    const before = Array.from(pasture.land);
    for (let day = 0; day < 800; day++) {
      expect(fieldTick(crops, pasture, ctx, day, 1, 1)).toEqual([]);
    }
    expect(Array.from(pasture.land)).toEqual(before);
    expect(pasture.land.some((v) => v === LAND.fallow || v === LAND.stubble)).toBe(false);
  });

  it('a harvested crop gives no more events and never comes back', () => {
    const { crops, pasture } = farm();
    const f = addField(crops, pasture, ctx, 'barley', [3, 4, 5], 0);
    const events: CropEvent[] = [];
    for (let day = 0; day <= 180; day++) events.push(...fieldTick(crops, pasture, ctx, day, 1, 1));
    expect(events.filter((x) => x.type !== 'sowing-window').map((x) => x.type)).toEqual([
      'crop-established',
      'harvest-ready',
    ]);
    const h = harvestField(crops, pasture, ctx, f.id, 181, 1);
    expect(h.ok).toBe(true);
    expect(crops.fields).toEqual([]);
    expect(Array.from(pasture.land.slice(3, 6))).toEqual([
      LAND.stubble,
      LAND.stubble,
      LAND.stubble,
    ]);
    expect(Array.from(pasture.G.slice(3, 6))).toEqual([0, 0, 0]);
    const after: CropEvent[] = [];
    for (let day = 182; day < 900; day++) after.push(...fieldTick(crops, pasture, ctx, day, 1, 1));
    // Only sowing reminders, because there is stubble on the farm.
    expect(after.every((x) => x.type === 'sowing-window')).toBe(true);
    expect(after.length).toBeGreaterThan(0);
    expect(crops.fields).toEqual([]);
    expect(crops.regen).toEqual([]);
  });

  it('grain sheds 0.2% a day for 30 days after it is ready, then 3% a day, and is lost at 60', () => {
    const { crops, pasture } = farm();
    addField(crops, pasture, ctx, 'barley', [3], 0);
    const y0 = crops.yieldT[3]!;
    const types: string[] = [];
    let y = y0;
    for (let day = 0; day <= 240; day++) {
      const ev = fieldTick(crops, pasture, ctx, day, 1, 1).filter(
        (x) => x.type !== 'sowing-window',
      );
      types.push(...ev.map((x) => `${x.type}@${day}`));
      if (day > 180 && day < 240) y = Math.fround(y * (day > 210 ? 0.97 : 0.998));
      if (day === 180) expect(crops.yieldT[3]).toBe(y0);
      if (day === 181) expect(crops.yieldT[3]).toBe(Math.fround(y0 * 0.998));
      if (day === 211) expect(crops.yieldT[3]).toBe(y);
      if (day === 239) expect(crops.yieldT[3]).toBe(y);
    }
    expect(types).toEqual([
      'crop-established@50',
      'harvest-ready@180',
      'grain-shedding@210',
      'not-harvested@240',
    ]);
    expect(pasture.land[3]).toBe(LAND.stubble);
    expect(crops.yieldT[3]).toBe(0);
    expect(crops.fields).toEqual([]);
  });

  it('a crop off arable land goes back to native pasture, not stubble', () => {
    const { crops, pasture } = farm();
    addField(crops, pasture, ctx, 'phal', [500], 0);
    const f = addField(crops, pasture, ctx, 'millet', [500, 3], 0);
    expect(crops.fields.map((x) => x.sp)).toEqual(['millet']);
    for (let day = 0; day <= 160; day++) fieldTick(crops, pasture, ctx, day, 1, 1);
    expect(crops.fields).toEqual([]);
    expect(pasture.land[500]).toBe(LAND.native);
    expect(pasture.land[3]).toBe(LAND.stubble);
    expect(f.cells).toEqual([500, 3]);
  });

  it('self-sown ryegrass comes back once, at 12%, only where nothing else is sown', () => {
    const { crops, pasture } = farm();
    addField(crops, pasture, ctx, 'annrye', [3, 4, 5, 6], 0);
    const seen: string[] = [];
    for (let day = 0; day < 1100; day++) {
      if (day === 300) addField(crops, pasture, ctx, 'lucerne', [6], 300);
      for (const ev of fieldTick(crops, pasture, ctx, day, 1, 1)) {
        if (ev.type === 'self-sown') {
          expect(ev.share).toBe(0.12);
          expect(crops.fields.find((x) => x.id === ev.fieldId)).toMatchObject({
            str: 0.12,
            regen: true,
            cells: [3, 4, 5],
          });
        }
        if (ev.type !== 'sowing-window') seen.push(ev.type);
      }
    }
    // The self-sown stand gives no "established" notice, and leaves no seed of its own.
    expect(seen).toEqual([
      'crop-established',
      'forage-finished',
      'self-sown',
      'pasture-established',
      'forage-finished',
    ]);
    expect(crops.regen).toEqual([]);
    expect(crops.fields.map((x) => x.sp)).toEqual(['lucerne']);
  });

  it('sowing reminders come on the 1st of the month a window opens, only with fallow, stubble or a mixed farm', () => {
    const { crops, pasture } = farm();
    const windows = (mixed: boolean): string[] => {
      const out: string[] = [];
      for (let day = 0; day < 365; day++) {
        for (const ev of fieldTick(crops, pasture, { ...ctx, mixed }, day, 1, 1)) {
          if (ev.type === 'sowing-window') out.push(`${ev.sp}@${dateAt(ctx.start, day).month}`);
          expect(dateAt(ctx.start, day).date).toBe(1);
        }
      }
      return out;
    };
    expect(windows(false)).toEqual([]);
    // Central West, from April: barley in May, forage sorghum in October, oats in February, wheat in March.
    const expected = ['barley@4', 'forsorg@9', 'oats@1', 'wheat@2'];
    expect(windows(true)).toEqual(expected);
    pasture.land[7] = LAND.fallow;
    expect(windows(false)).toEqual(expected);
  });
});
