/**
 * Sheep on the farm (milestone 2.3): the farm's sheep mobs, putting sheep on
 * a farm, and their part of the daily tick.
 *
 * A farm's sheep live in `farm.sheep`, which is left off a farm that has
 * never had sheep: such a farm saves and plays exactly as it did before
 * sheep existed. Each sheep mob carries `species: 'sheep'`. Sheep mobs and
 * cattle mobs graze the same pasture arrays with the same grass model. One
 * mob to a grazing area still holds: sheep are never put where any mob is,
 * and cattle are never moved where sheep are (actions refuse it).
 *
 * Putting sheep on a farm is an engine helper for now (`addSheepMob`); the
 * market and the setup choice come in milestone 2.4.
 */

import type { DistrictId } from '@gg/shared';
import type { CalendarDate } from '../calendar';
import type { GrazingLand } from '../cattle/types';
import { squareGrazed } from '../crops/fields';
import type { Survey } from '../farm/layout';
import {
  BOUGHT,
  GESTATION_DAYS,
  JOIN_START,
  KG_PER_CS_SHARE,
  SHEEP_WATER_L,
  SRW,
  sheepDistrict,
  type SheepBreed,
} from '../data/sheep';
import { rngFromState, rngStream } from '../rng';
import { areaIdOf, areaNameOf, grazingArea, placeAnchor } from '../sim/derived';
import type { TickEvent } from '../sim/events';
import type { FarmState, MobWhere } from '../sim/state';
import { SHEARING_RATE, SHEEP_HEALTH_PER_HEAD_YEAR } from '../data/sheepMarket';
import { isAdultRam, matureKg } from './energy';
import { woolValue } from './market';
import { crutchMob, shearMob } from './wool';
import type { SheepDeathCause } from './notes';
import {
  headOf,
  lambsByDam,
  lambsPerEwe,
  settleSheepDeaths,
  sheepWeaningDue,
  simFlock,
  weanLambs,
  type SheepDeath,
} from './simFlock';
import type { Sheep, SheepMob, SheepRngs, SheepSex, SheepState } from './types';

/** The sheep's named random streams, drawn from the farm's seed. */
export const SHEEP_STREAMS = {
  breeding: 'sheep:breeding',
  deaths: 'sheep:deaths',
  flies: 'sheep:flies',
} as const;

/** The farm's sheep, made the first time sheep come onto the farm. */
export function ensureSheepState(farm: FarmState): SheepState {
  if (!farm.sheep) {
    farm.sheep = {
      mobs: [],
      rng: {
        breeding: rngStream(farm.seed, SHEEP_STREAMS.breeding).state(),
        deaths: rngStream(farm.seed, SHEEP_STREAMS.deaths).state(),
        flies: rngStream(farm.seed, SHEEP_STREAMS.flies).state(),
      },
    };
  }
  return farm.sheep;
}

/** The sheep mobs on a farm (none on a farm that has never had sheep). */
export const sheepMobsOf = (farm: Pick<FarmState, 'sheep'>): readonly SheepMob[] =>
  farm.sheep?.mobs ?? [];

/** The day joining starts each year in a district (call C27). */
export function joinOnFor(district: DistrictId): { month: number; date: number } {
  return JOIN_START[district] ?? { month: 3, date: 1 };
}

/** What a group of sheep put on the farm is. */
export interface SheepGroupSpec {
  /** Ewes, wethers and rams are adults; weaners and hoggets are young. */
  cls: 'ewe' | 'wether' | 'ram' | 'weaner' | 'hogget';
  head: number;
  /** Ewe weaners and hoggets are ewes unless `sex` says otherwise. */
  sex?: SheepSex;
  /** Condition score, 3 if left out. */
  cs?: number;
  /** Age in days. Adults 3 years, hoggets 15 months, weaners 5 months if left out. */
  ageDays?: number;
  /** Live weight, kg. Adults: their mature weight at that CS. Young sheep: 60% (weaners) or 80% (hoggets) of it. */
  wt?: number;
}

export interface AddSheepSpec {
  /** A square in the grazing area the mob goes into. */
  cell: number;
  name?: string;
  breed: SheepBreed;
  /** SRW, kg. The breed's (`SRW`) if left out. */
  srw?: number;
  groups: SheepGroupSpec[];
}

export type AddSheepResult =
  | { ok: true; mob: SheepMob }
  | { ok: false; reason: 'not-a-sheep-district' | 'area-occupied' | 'bad-request' };

/** Make a sheep record of `n` like animals (1 if left out). Uses no random numbers. */
export function makeSheep(
  id: number,
  o: {
    sex: SheepSex;
    breed: SheepBreed;
    srw: number;
    age: number;
    cs: number;
    wt: number;
    weaned: boolean;
    n?: number;
  },
): Sheep {
  return {
    id,
    n: o.n ?? 1,
    sex: o.sex,
    breed: o.breed,
    srw: o.srw,
    wt: o.wt,
    age: o.age,
    cond: o.cs,
    weaned: o.weaned,
    dam: 0,
    preg: -1,
    litter: 0,
    lact: -1,
    reared: 0,
    parity: o.sex === 'F' && o.age >= 730 ? 1 : 0,
    oes: -1,
    csJoin: 0,
    csScan: 0,
    milk: 0,
    adg: 0,
    wwt: 0,
    wage: 0,
    fleece: 0,
    micronKg: 0,
    woolDays: 0,
    flyCover: 0,
    struck: -1,
    doomed: 0,
    doomed2: 0,
    lambRisk: 0,
    paid: 0,
    cost: 0,
    dead: false,
    di: undefined,
  };
}

/**
 * When contractors shear and crutch by default, worked out from the joining
 * date (sourced, 15 Nov 2026): the NSW sheep calendar (NSW Government,
 * "Sheep calendar of operations", 12 Nov 2025) crutches ewes in mid-June
 * before an August lambing and shears in November, so crutching is
 * `CRUTCH_BEFORE_LAMBING` days before lambing starts and shearing
 * `SHEAR_AFTER_LAMBING` days after (my arithmetic from those months); the
 * Tasmanian guide (S48) puts crutching six to eight months after shearing,
 * which this fits.
 */
export const CRUTCH_BEFORE_LAMBING = 60;
export const SHEAR_AFTER_LAMBING = 80;

/** The calendar day a number of days after a day and month (a year with no 29 February). */
function dayAfter(
  on: { month: number; date: number },
  days: number,
): { month: number; date: number } {
  const d = new Date(Date.UTC(2021, on.month, on.date) + days * 86400000);
  return { month: d.getUTCMonth(), date: d.getUTCDate() };
}

/** The default shearing and crutching days for a joining date. */
export function sheepJobDates(joinOn: { month: number; date: number }): {
  shearOn: { month: number; date: number };
  crutchOn: { month: number; date: number };
} {
  return {
    shearOn: dayAfter(joinOn, GESTATION_DAYS + SHEAR_AFTER_LAMBING),
    crutchOn: dayAfter(joinOn, GESTATION_DAYS - CRUTCH_BEFORE_LAMBING),
  };
}

/** A new, empty sheep mob. */
export function createSheepMob(
  id: number,
  name: string,
  where: MobWhere,
  district: DistrictId,
): SheepMob {
  return {
    species: 'sheep',
    id,
    name,
    where,
    sheep: [],
    dry: 0,
    st: null,
    joinOn: joinOnFor(district),
    ...sheepJobDates(joinOnFor(district)),
    join: null,
    shorn: -1,
    crutched: -1,
    lastShort: -99,
    lastThin: -99,
    lossDays: 0,
    feed: 'none',
    lastBreak: null,
  };
}

/** The grazing areas that hold a mob of either species. */
export function occupiedAreas(farm: FarmState, survey: Survey): Set<number> {
  const out = new Set<number>();
  for (const m of farm.mobs)
    if (m.where.kind === 'paddock' && m.animals.length) out.add(areaIdOf(survey, m));
  for (const m of sheepMobsOf(farm))
    if (m.where.kind === 'paddock' && m.sheep.length) out.add(areaIdOf(survey, m));
  return out;
}

/** The grazing areas that hold sheep. */
export function sheepAreas(farm: FarmState, survey: Survey): Set<number> {
  const out = new Set<number>();
  for (const m of sheepMobsOf(farm))
    if (m.where.kind === 'paddock' && m.sheep.length) out.add(areaIdOf(survey, m));
  return out;
}

/** One record for a group of like sheep put on the farm (bought, or a start flock). No random numbers. */
export function groupRecord(
  ids: { next: number },
  breed: SheepBreed,
  srw: number,
  g: SheepGroupSpec,
): Sheep {
  const sex: SheepSex = g.sex ?? (g.cls === 'wether' ? 'W' : g.cls === 'ram' ? 'M' : 'F');
  const adult = g.cls === 'ewe' || g.cls === 'wether' || g.cls === 'ram';
  const young = g.cls === 'hogget' ? 'hogget' : 'weaner';
  const age = g.ageDays ?? (adult ? BOUGHT.ageDays.adult : BOUGHT.ageDays[young]);
  const cs = g.cs ?? 3;
  const mature = matureKg({ srw, sex });
  const atCs = mature * (1 + KG_PER_CS_SHARE * (cs - 3));
  const wt = g.wt ?? (adult ? atCs : atCs * BOUGHT.wtShare[young]);
  const s = makeSheep(ids.next++, { sex, breed, srw, age, cs, wt, weaned: true, n: g.head });
  if (!adult) {
    s.wwt = BOUGHT.weanShareOfSrw * srw;
    s.wage = Math.max(1, age - BOUGHT.weanedDaysAgo[young]);
  }
  return s;
}

/**
 * Put a mob of sheep on the farm (an engine and test helper until the
 * market sells sheep in milestone 2.4). Refused in Central Queensland, and
 * where any mob already grazes. Costs nothing and draws no random numbers.
 */
export function addSheepMob(farm: FarmState, survey: Survey, spec: AddSheepSpec): AddSheepResult {
  if (!sheepDistrict(farm.district)) return { ok: false, reason: 'not-a-sheep-district' };
  const areaOf = survey.topology.areaOf;
  const areaId = areaOf[spec.cell];
  if (areaId === undefined || areaId < 0 || !spec.groups.length)
    return { ok: false, reason: 'bad-request' };
  if (spec.groups.some((g) => !Number.isInteger(g.head) || g.head <= 0))
    return { ok: false, reason: 'bad-request' };
  if (occupiedAreas(farm, survey).has(areaId)) return { ok: false, reason: 'area-occupied' };
  const state = ensureSheepState(farm);
  const id = farm.nextMobId++;
  const m = createSheepMob(
    id,
    spec.name || 'Sheep ' + id,
    { kind: 'paddock', anchor: placeAnchor(survey, areaId) },
    farm.district,
  );
  const srw = spec.srw ?? (spec.breed === 'xb' ? SRW.xb : SRW.merino);
  for (const g of spec.groups) m.sheep.push(groupRecord(farm.animalIds, spec.breed, srw, g));
  state.mobs.push(m);
  return { ok: true, mob: m };
}

/** Litres a sheep mob drinks today (call C17): its sheep by class, the summer figure from December to February. */
export function sheepWaterLitres(m: SheepMob, month: number): number {
  const summer = month === 11 || month <= 1;
  const lambsOf = lambsByDam(m.sheep);
  const pick = (row: { average: number; summer: number }): number =>
    summer ? row.summer : row.average;
  let l = 0;
  for (const s of m.sheep) {
    if (s.dead || !s.weaned || s.n <= 0) continue;
    if (s.age < 365) {
      l += pick(SHEEP_WATER_L.weaner) * s.n;
      continue;
    }
    // The share of the record's ewes with a lamb at foot drinks the ewes-with-lambs figure.
    const withLambs = Math.min(1, lambsPerEwe(s, lambsOf));
    l +=
      (pick(SHEEP_WATER_L.ewesWithLambs) * withLambs + pick(SHEEP_WATER_L.dry) * (1 - withLambs)) *
      s.n;
  }
  return l;
}

/** Shear a mob today: contractors' cost, and the wool sold at the stand-in price (call C20). */
export function shearToday(farm: FarmState, m: SheepMob, events: TickEvent[]): void {
  let rams = 0;
  for (const x of m.sheep) if (x.weaned && isAdultRam(x)) rams += x.n;
  const r = shearMob(m, farm.day);
  if (!r.head) return;
  const cost = (r.head - rams) * SHEARING_RATE.sheep + rams * SHEARING_RATE.ram;
  const income = woolValue(r.cleanKg, r.micron);
  farm.cash += income - cost;
  farm.year.wool = (farm.year.wool ?? 0) + income;
  farm.year.running += cost;
  events.push({
    type: 'sheep-shorn',
    mob: m.id,
    mobName: m.name,
    head: r.head,
    cleanKg: r.cleanKg,
    greasyKg: r.greasyKg,
    micron: r.micron,
    months: r.months,
    woolIncome: income,
    cost,
  });
}

/** Crutch a mob today: the contractors' cost. */
export function crutchToday(farm: FarmState, m: SheepMob, events: TickEvent[]): void {
  const head = crutchMob(m, farm.day);
  if (!head) return;
  const cost = head * SHEARING_RATE.crutch;
  farm.cash -= cost;
  farm.year.running += cost;
  events.push({ type: 'sheep-crutched', mob: m.id, mobName: m.name, head, cost });
}

/** What the sheep step reports back to the tick. */
export interface SheepDayResult {
  /** Head that died today, by record, mob and cause. */
  deaths: { id: number; mob: number; cause: SheepDeathCause; count: number }[];
  /** Lambs born today, by record and mob. */
  births: { id: number; mob: number; count: number }[];
}

/** Where a sheep mob's weaners go: another empty grazing area with water, the best feed first. Null when there is none. */
function sheepWeanDest(farm: FarmState, survey: Survey, m: SheepMob): number | null {
  const here = areaIdOf(survey, m);
  const occupied = occupiedAreas(farm, survey);
  const opts = survey.topology.areas.filter(
    (r) => r.id !== here && !occupied.has(r.id) && survey.points.areaTroughs[r.id]!.length > 0,
  );
  if (!opts.length) return null;
  // The most feed first; the lowest id breaks a tie.
  const G = farm.pasture.G;
  const greenOf = (cells: readonly number[]): number => {
    let t = 0;
    for (const c of cells) t += G[c]!;
    return t / Math.max(1, cells.length);
  };
  opts.sort((a, b) => greenOf(b.cells) - greenOf(a.cells) || a.id - b.id);
  return placeAnchor(survey, opts[0]!.id);
}

/**
 * The sheep's part of the day (step 4b, after the cattle's deaths are
 * settled): for each sheep mob in turn, wean the lambs if due, then the
 * mob's day; then the dead are taken out. A farm with no sheep skips this.
 */
export function sheepDay(
  farm: FarmState,
  survey: Survey,
  land: GrazingLand,
  date: CalendarDate,
  events: TickEvent[],
): SheepDayResult {
  const out: SheepDayResult = { deaths: [], births: [] };
  const state = farm.sheep;
  if (!state || !state.mobs.length) return out;
  const day = farm.day;
  const rng: SheepRngs = {
    breeding: rngFromState(state.rng.breeding),
    deaths: rngFromState(state.rng.deaths),
    flies: rngFromState(state.rng.flies),
  };
  const byId = new Map<number, Sheep>();
  for (const m of state.mobs) for (const s of m.sheep) byId.set(s.id, s);
  const deaths: SheepDeath[] = [];
  for (let i = 0; i < state.mobs.length; i++) {
    const m = state.mobs[i]!;
    if (m.where.kind !== 'paddock') continue;
    if (sheepWeaningDue(m, day)) {
      const lambs = weanLambs(m);
      const weaned = headOf(lambs);
      const avgKg = weaned ? Math.round(lambs.reduce((t, s) => t + s.wt * s.n, 0) / weaned) : 0;
      const dest = lambs.length ? sheepWeanDest(farm, survey, m) : null;
      if (dest === null) {
        events.push({
          type: 'sheep-weaned',
          mob: m.id,
          mobName: m.name,
          count: weaned,
          avgKg,
          into: null,
        });
      } else {
        const gone = new Set(lambs.map((s) => s.id));
        m.sheep = m.sheep.filter((s) => !gone.has(s.id));
        const t = createSheepMob(
          farm.nextMobId++,
          '',
          { kind: 'paddock', anchor: dest },
          farm.district,
        );
        t.name = 'Weaners ' + t.id;
        t.sheep = lambs;
        state.mobs.push(t);
        events.push({
          type: 'sheep-weaned',
          mob: m.id,
          mobName: m.name,
          count: weaned,
          avgKg,
          into: { mob: t.id, mobName: t.name, where: t.where, area: areaNameOf(survey, t) },
        });
      }
    }
    // Contractors shear and crutch on the mob's days, by themselves (none of the player's day).
    if (m.shearOn && date.month === m.shearOn.month && date.date === m.shearOn.date) {
      shearToday(farm, m, events);
    }
    if (m.crutchOn && date.month === m.crutchOn.month && date.date === m.crutchOn.date) {
      crutchToday(farm, m, events);
    }
    // Animal health, a head a day.
    const health = (headOf(m.sheep.filter((x) => x.weaned)) * SHEEP_HEALTH_PER_HEAD_YEAR) / 365;
    if (health > 0) {
      farm.cash -= health;
      farm.year.running += health;
    }
    const areaId = areaIdOf(survey, m);
    const res = simFlock(m, {
      place: { kind: 'paddock', area: grazingArea(survey, areaId) },
      land,
      day,
      date,
      byId,
      ids: farm.animalIds,
      rng,
    });
    // Pasture eaten and weight gained count in the year's totals as the cattle's do.
    farm.year.eaten += res.eatenKg;
    farm.year.gain += res.gainKg;
    if (res.feedCost > 0) {
      farm.cash -= res.feedCost;
      farm.year.feed += res.feedCost;
    }
    const area = areaNameOf(survey, m);
    for (const note of res.notes)
      events.push({ type: 'sheep', mob: m.id, mobName: m.name, area, note });
    for (const g of res.plantingGrazes) {
      const event = squareGrazed(farm.crops, g.square, g.eaten, g.greenEaten, g.greenBefore, day);
      if (event) events.push({ type: 'crop-grazed', mob: m.id, mobName: m.name, event });
    }
    if (res.births.length) {
      let born = 0;
      for (const s of res.births) {
        byId.set(s.id, s);
        born += s.n;
        out.births.push({ id: s.id, mob: m.id, count: s.n });
      }
      events.push({ type: 'lambs-born', mob: m.id, mobName: m.name, count: born });
    }
    if (res.deaths.length) {
      const by = new Map<SheepDeathCause, number>();
      for (const d of res.deaths) {
        deaths.push(d);
        farm.year.sheepDeaths = (farm.year.sheepDeaths ?? 0) + d.count;
        farm.year.sheepDeathAe =
          (farm.year.sheepDeathAe ?? 0) + d.count * Math.pow(d.sheep.wt / 450, 0.75);
        by.set(d.cause, (by.get(d.cause) ?? 0) + d.count);
        out.deaths.push({ id: d.sheep.id, mob: m.id, cause: d.cause, count: d.count });
      }
      for (const [cause, count] of by) {
        events.push({ type: 'sheep-deaths', mob: m.id, mobName: m.name, cause, count });
      }
    }
  }
  // Sheep deaths are counted in the year's `sheepDeaths` (the score counts each as one DSE's
  // share of a beast).
  settleSheepDeaths(state.mobs, deaths, byId, farm.animalIds, rng.deaths);
  state.mobs = state.mobs.filter((m) => m.sheep.length);
  state.rng = {
    breeding: rng.breeding.state(),
    deaths: rng.deaths.state(),
    flies: rng.flies.state(),
  };
  return out;
}

/**
 * One sheep mob per grazing area: sheep mobs that come to share an area (a
 * fence taken down, a gate opened) join the biggest. Sheep and cattle never
 * join: if a change puts them in one area, both graze it until one is moved.
 */
export function mergeSheepShared(farm: FarmState, survey: Survey, events?: TickEvent[]): void {
  const state = farm.sheep;
  if (!state || state.mobs.length < 2) return;
  const groups = new Map<number, SheepMob[]>();
  for (const m of state.mobs) {
    if (!m.sheep.length || m.where.kind !== 'paddock') continue;
    const k = areaIdOf(survey, m);
    const list = groups.get(k);
    if (list) list.push(m);
    else groups.set(k, [m]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.sheep.length - a.sheep.length || a.id - b.id);
    const t = list[0]!;
    for (const o of list.slice(1)) {
      for (const s of o.sheep) t.sheep.push(s);
      o.sheep = [];
      events?.push({
        type: 'mobs-joined',
        from: o.id,
        fromName: o.name,
        into: t.id,
        intoName: t.name,
        area: survey.topology.areas[areaIdOf(survey, t)]!.name,
      });
    }
  }
  state.mobs = state.mobs.filter((m) => m.sheep.length);
}
