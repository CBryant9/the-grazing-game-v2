/**
 * Helpers for the sheep tests and the sheep calibration
 * (docs/SHEEP_BENCHMARKS.md, docs/CALIBRATION.md, the sheep section).
 * Test use only.
 */

import type { DistrictId } from '@gg/shared';
import { dateAt, type FarmStart } from '../src/calendar';
import { DSE_PER_AE, SRW, type SheepBreed } from '../src/data/sheep';
import { carryingCapacityAE } from '../src/money/costs';
import { rngStream } from '../src/rng';
import type { GrowthFactorSource } from '../src/season/factors';
import { ramsNeeded } from '../src/sheep/breeding';
import { matureKg } from '../src/sheep/energy';
import {
  addSheepMob,
  createSheepMob,
  makeSheep,
  sheepMobsOf,
  type SheepGroupSpec,
} from '../src/sheep/farm';
import { crutchMob, shearMob, type ShearResult } from '../src/sheep/wool';
import { createFarm } from '../src/sim/create';
import { surveyOf } from '../src/sim/derived';
import type { FarmState } from '../src/sim/state';
import { stepDay } from '../src/sim/tick';
import type { SheepDiet } from '../src/sheep/graze';
import {
  settleSheepDeaths,
  simFlock,
  weanLambs,
  sheepWeaningDue,
  type FlockDayResult,
} from '../src/sheep/simFlock';
import type { Sheep, SheepJoining, SheepMob, SheepRngs, SheepSex } from '../src/sheep/types';

// ---------------------------------------------------------------------------
// A year on a district block (the benchmark rows of kind "Year")
// ---------------------------------------------------------------------------

/** The block the sheep year runs use: the cattle steer block, 260 ha with one water. */
export const SHEEP_BLOCK_HA = 260;

/** The average DSE of a breeding ewe over a year, for setting the stocking (lambs inside her). STAND-IN for the test. */
export const EWE_YEAR_DSE = 1.5;

export interface SheepYearCase {
  district: DistrictId;
  /** The month the run starts in, on the 1st (0 is January). */
  month: number;
  breed: SheepBreed;
  /** The rams' breed (terminal rams are 'xb'). The ewes' if left out. */
  ramBreed?: SheepBreed;
  /** What to stock: breeding ewes (with rams at 1% + 1), wethers, or weaners. */
  stock: 'ewes' | 'wethers' | 'weaners';
  /** Stocking as a share of the block's carrying capacity in DSE (8.4 DSE to the AE). */
  share: number;
  days: number;
  /** Farm days to shear and crutch on. Shorn on day 0 if left out. */
  shear?: number[];
  crutch?: number[];
  /** Called after each day, to read figures part way. */
  probe?: (day: number, farm: FarmState, startIds: ReadonlySet<number>) => void;
}

export interface SheepYearRun {
  seed: number;
  farm: FarmState;
  /** Head put on at the start (not lambs). */
  head: number;
  /** Sheep that came on at the start and died, % of `head`. */
  deathsPct: number;
  /** The first sheep mob's joining record at the end, or null. */
  join: SheepJoining | null;
  /** Average CS of the ewes on the day lambing started, or null. */
  csAtLambing: number | null;
  /** Shearings done, in order. */
  shorn: ShearResult[];
  /** Clean wool on the starting sheep at the end, kg a head, and its micron. */
  fleeceKg: number;
  micron: number;
}

/** Run a sheep case on the district block for `days` days, the run's seasons in place of the farm's. */
export function sheepYearRun(
  c: SheepYearCase,
  seed: number,
  seasons?: GrowthFactorSource,
): SheepYearRun {
  const env = seasons ? { seasons } : {};
  const farm = createFarm(
    {
      seed,
      district: c.district,
      size: SHEEP_BLOCK_HA,
      start: { year: 2021, month: c.month },
      startType: 'scratch',
      difficulty: 'medium',
      money: { cash: 5e6, overdraft: -5e6, broke: -1e7 },
    },
    env,
  );
  const dse = carryingCapacityAE(c.district, SHEEP_BLOCK_HA) * DSE_PER_AE * c.share;
  const groups: SheepGroupSpec[] = [];
  if (c.stock === 'ewes') {
    const ewes = Math.round(dse / EWE_YEAR_DSE);
    groups.push({ cls: 'ewe', head: ewes });
  } else if (c.stock === 'wethers') {
    groups.push({ cls: 'wether', head: Math.round(dse) });
  } else {
    // Weaners about 45% of SRW at weaning (S17), weaned 2 weeks ago.
    groups.push({
      cls: 'weaner',
      head: Math.round(dse / 0.7),
      ageDays: 112,
      wt: 0.45 * (c.breed === 'xb' ? SRW.xb : SRW.merino),
    });
  }
  const r = addSheepMob(farm, surveyOf(farm), {
    cell: farm.layout.water.bore,
    breed: c.breed,
    groups,
  });
  if (!r.ok) throw new Error('addSheepMob refused: ' + r.reason);
  const m = r.mob;
  if (c.stock === 'weaners') {
    for (const s of m.sheep) {
      s.wage = s.age - 14;
      s.wwt = s.wt;
    }
  }
  if (c.stock === 'ewes') {
    const ramBreed = c.ramBreed ?? c.breed;
    const n = ramsNeeded(m.sheep.length);
    for (let i = 0; i < n; i++) {
      m.sheep.push(
        makeSheep(farm.animalIds.next++, {
          sex: 'M',
          breed: ramBreed,
          srw: ramBreed === 'xb' ? SRW.xb : SRW.merino,
          age: 1095,
          cs: 3,
          wt: matureKg({ srw: ramBreed === 'xb' ? SRW.xb : SRW.merino, sex: 'M' }),
          weaned: true,
        }),
      );
    }
  }
  const start = new Set(m.sheep.filter((s) => s.sex !== 'M').map((s) => s.id));
  const head = start.size;
  const shorn: ShearResult[] = [];
  const shearDays = new Set(c.shear ?? [0]);
  const crutchDays = new Set(c.crutch ?? []);
  let csAtLambing: number | null = null;
  for (let d = 0; d < c.days; d++) {
    const mob = farm.sheep!.mobs.find((x) => x.id === m.id);
    if (mob) {
      if (shearDays.has(d)) shorn.push(shearMob(mob, d));
      if (crutchDays.has(d)) crutchMob(mob, d);
      if (csAtLambing === null && mob.join && mob.join.lambingStart >= 0) {
        const ewes = mob.sheep.filter((s) => s.sex === 'F' && start.has(s.id));
        csAtLambing = ewes.reduce((t, s) => t + s.cond, 0) / ewes.length;
      }
    }
    stepDay(farm, env);
    c.probe?.(d, farm, start);
  }
  const alive = sheepMobsOf(farm).flatMap((x) => x.sheep.filter((s) => start.has(s.id)));
  const fleece = alive.reduce((t, s) => t + s.fleece, 0);
  const mk = alive.reduce((t, s) => t + s.micronKg, 0);
  const own = sheepMobsOf(farm).find((x) => x.id === m.id) ?? null;
  return {
    seed,
    farm,
    head,
    deathsPct: ((head - alive.length) / head) * 100,
    join: own ? own.join : null,
    csAtLambing,
    shorn,
    fleeceKg: alive.length ? fleece / alive.length : 0,
    micron: fleece > 0 ? mk / fleece : 0,
  };
}

/** One sheep for a unit test: an adult at CS 3 at its mature weight unless told otherwise. */
export function testSheep(o: Partial<Sheep> & { sex?: SheepSex; breed?: SheepBreed } = {}): Sheep {
  const sex = o.sex ?? 'F';
  const breed = o.breed ?? 'merino';
  const srw = o.srw ?? (breed === 'xb' ? SRW.xb : SRW.merino);
  const cs = o.cond ?? 3;
  const wt = o.wt ?? matureKg({ srw, sex }) * (1 + 0.19 * (cs - 3));
  const s = makeSheep(o.id ?? 1, {
    sex,
    breed,
    srw,
    age: o.age ?? 1095,
    cs,
    wt,
    weaned: o.weaned ?? true,
  });
  return { ...s, ...o, sex, breed, srw, wt, cond: cs };
}

/** The sheep's random streams for a seed. */
export const testRngs = (seed: number): SheepRngs => ({
  breeding: rngStream(seed, 'sheep:breeding'),
  deaths: rngStream(seed, 'sheep:deaths'),
  flies: rngStream(seed, 'sheep:flies'),
});

/** A mob for a held paddock, joining on the given date. */
export function testMob(sheep: Sheep[], district: DistrictId = 'wv'): SheepMob {
  const m = createSheepMob(1, 'Test', { kind: 'paddock', anchor: 0 }, district);
  m.sheep = sheep;
  return m;
}

/**
 * A joining record for ewes put on the test already in lamb, so lambing,
 * marking and weaning are counted as on a farm.
 */
export function pastJoining(joined: number, start = -150): SheepJoining {
  return {
    start,
    joined,
    rams: 0,
    sireBreed: 'merino',
    sireSrw: SRW.merino,
    pregnant: joined,
    foetuses: 0,
    scanned: true,
    lambingStart: -1,
    born: 0,
    ewesLambed: 0,
    marked: -1,
    weaned: -1,
    eweDeathsLambing: 0,
  };
}

/** A flock of `n` sheep made by `make(i)`, with tag numbers from 1. */
export function flock(n: number, make: (i: number) => Partial<Sheep>): Sheep[] {
  const out: Sheep[] = [];
  for (let i = 0; i < n; i++) out.push(testSheep({ ...make(i), id: i + 1 }));
  return out;
}

export interface HeldRunOptions {
  /** The farm's start, for the calendar. 1 March 2021 if left out. */
  start?: FarmStart;
  /** The first farm day. 0 if left out. */
  day0?: number;
  seed?: number;
  /** The diet each day (it may change with the day). */
  diet: SheepDiet | ((day: number, m: SheepMob) => SheepDiet);
  /** Share of the wanted feed supplied (it may change with the day), 1 if left out. */
  f?: number | ((day: number, m: SheepMob) => number);
  hasWater?: boolean;
  /** Called after each day. */
  each?: (day: number, res: FlockDayResult, m: SheepMob) => void;
  /** Hold every adult's CS and weight where they started (a mob "held near CS 3"). */
  holdCs?: boolean;
  /** Wean the lambs when due. True if left out. */
  wean?: boolean;
}

/**
 * Run a mob on a held paddock for `days` days: the sheep step on its own,
 * with a set diet and as much of it as asked. Returns the next free tag
 * number holder, so a test can read how many were made.
 */
export function heldRun(m: SheepMob, days: number, o: HeldRunOptions): { ids: { next: number } } {
  const start = o.start ?? { year: 2021, month: 2 };
  const rng = testRngs(o.seed ?? 1);
  const ids = { next: m.sheep.reduce((x, s) => Math.max(x, s.id), 0) + 1 };
  const hold = o.holdCs ? new Map(m.sheep.map((s) => [s.id, { wt: s.wt, cond: s.cond }])) : null;
  for (let k = 0; k < days; k++) {
    const day = (o.day0 ?? 0) + k;
    if (o.wean !== false && sheepWeaningDue(m, day)) weanLambs(m);
    const byId = new Map<number, Sheep>();
    for (const s of m.sheep) byId.set(s.id, s);
    const diet = typeof o.diet === 'function' ? o.diet(day, m) : o.diet;
    const res = simFlock(m, {
      place: {
        kind: 'held',
        diet,
        f: typeof o.f === 'function' ? o.f(day, m) : (o.f ?? 1),
        hasWater: o.hasWater ?? true,
      },
      land: null,
      day,
      date: dateAt(start, day),
      byId,
      ids,
      rng,
    });
    settleSheepDeaths([m], res.deaths, byId);
    if (hold) {
      for (const s of m.sheep) {
        const h = hold.get(s.id);
        if (h) {
          s.wt = h.wt;
          s.cond = h.cond;
        }
      }
    }
    o.each?.(day, res, m);
  }
  return { ids };
}
