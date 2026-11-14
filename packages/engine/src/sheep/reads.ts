/**
 * Reads for the screens and the web server (milestone 2.3). Each returns
 * numbers and classes to show, never a formula or a table (PRD 5.16). The
 * doc comment on each field says what may be shown.
 */

import { aeOf } from '../cattle/animal';
import { dateAt, type CalendarDate } from '../calendar';
import { daysSince } from './start';
import {
  DSE_PER_AE,
  JOIN_DAYS,
  SHEEP_FEEDS,
  fenceHoldsSheep,
  sheepDistrict,
  type SheepFeed,
} from '../data/sheep';
import {
  SHEEP_PRICE_DATE,
  SHEEP_TRADE,
  WOOL_PRICE_C_KG,
  type SheepIndicatorId,
} from '../data/sheepMarket';
import { EDGE, type EdgeRef } from '../farm/topology';
import { COST_PER_M, NETTING_PER_M } from '../money/costs';
import {
  SHEEP_BUY_CLASSES,
  sheepBuyPrice,
  sheepIndicatorsOf,
  type SheepBuyClassId,
} from './market';
import {
  areaNameOf,
  dateOn,
  grazingArea,
  landOf,
  plantingsNow,
  surveyOf,
  type SourceEnv,
} from '../sim/derived';
import { deepCopy } from '../sim/state';
import { rngFromState } from '../rng';
import type { FarmState } from '../sim/state';
import { aeFromDse, dseOf, sheepClassOf } from './energy';
import { headOf, lambsByDam, lambsPerEwe, simFlock } from './simFlock';
import { fleeceMicron } from './wool';
import { sheepMobsOf, sheepWaterLitres } from './farm';
import type { Sheep, SheepClass, SheepMob } from './types';

/** One class in a sheep mob. */
export interface SheepClassRow {
  /** The class (lamb, weaner, hogget, ewe, wether, ram). May be shown. */
  cls: SheepClass;
  /** Head. May be shown. */
  head: number;
  /** Average live weight, kg. May be shown. */
  avgKg: number;
  /** Average condition score. May be shown. */
  avgCs: number;
}

/** A sheep mob's joining record, as far as the player has been told. */
export interface SheepJoiningRecord {
  /** The farm day joining started. May be shown. */
  start: number;
  /** Ewes joined and rams in. May be shown. */
  joined: number;
  rams: number;
  /** From the scanning count on (80 days after joining started): ewes in lamb and lambs carried. Null before. May be shown. */
  scanned: { pregnant: number; foetuses: number; pct: number } | null;
  /** Lambs born so far. May be shown. */
  born: number;
  /** From the marking count on: lambs marked and lambs marked per 100 ewes joined. Null before. May be shown. */
  marked: { lambs: number; pct: number } | null;
  /** From weaning on: lambs weaned and per 100 ewes joined. Null before. May be shown. */
  weaned: { lambs: number; pct: number } | null;
}

/** A sheep mob for the mob card. */
export interface SheepMobRead {
  id: number;
  /** Always 'sheep'. */
  species: 'sheep';
  name: string;
  /** The grazing area's name, or null. May be shown. */
  area: string | null;
  /** Head, not counting lambs at foot. May be shown. */
  head: number;
  /** Lambs at foot. May be shown. */
  lambs: number;
  /** By class, largest first. May be shown. */
  classes: SheepClassRow[];
  /** The mob's DSE and AE today (lambs inside their ewes). May be shown. */
  dse: number;
  ae: number;
  /** Clean wool on the sheep's backs, kg a head (weaned sheep), its micron, and months of wool. May be shown. */
  fleeceKgHead: number;
  micron: number;
  woolMonths: number;
  /** Litres the mob drinks today. May be shown. */
  waterLitres: number;
  /** Average weight change, kg a day, and intake as a share of potential, 0 to 1. May be shown. */
  adg: number;
  intakePct: number;
  /** Days without water. May be shown. */
  dryDays: number;
  /** The joining record, or null before the first joining. May be shown. */
  joining: SheepJoiningRecord | null;
  /** What the mob is fed: none, lick, grain or hay. May be shown. */
  feed: SheepFeed;
  /** The contractors' shearing and crutching days each year, or null when not booked. May be shown. */
  shearOn: { month: number; date: number } | null;
  crutchOn: { month: number; date: number } | null;
  /** The day and month joining starts each year (month 0 is January). May be shown. */
  joinOn: { month: number; date: number };
}

const CLASS_ORDER: SheepClass[] = ['ewe', 'wether', 'ram', 'hogget', 'weaner', 'lamb'];

/** The joining record a player may see: scanning only from the scanning count. */
export function sheepJoiningRecord(m: SheepMob): SheepJoiningRecord | null {
  const j = m.join;
  if (!j) return null;
  const per = (x: number): number => (j.joined ? (x / j.joined) * 100 : 0);
  return {
    start: j.start,
    joined: j.joined,
    rams: j.rams,
    scanned: j.scanned
      ? { pregnant: j.pregnant, foetuses: j.foetuses, pct: per(j.foetuses) }
      : null,
    born: j.born,
    marked: j.marked >= 0 ? { lambs: j.marked, pct: per(j.marked) } : null,
    weaned: j.weaned >= 0 ? { lambs: j.weaned, pct: per(j.weaned) } : null,
  };
}

/** Every sheep mob on the farm, for the mob cards. Empty on a farm with no sheep. */
export function sheepMobsRead(farm: FarmState, month: number): SheepMobRead[] {
  const mobs = sheepMobsOf(farm);
  if (!mobs.length) return [];
  const survey = surveyOf(farm);
  return mobs.map((m) => {
    const lambsOf = lambsByDam(m.sheep);
    const by = new Map<SheepClass, Sheep[]>();
    let dse = 0;
    let fleece = 0;
    let micronKg = 0;
    let days = 0;
    let head = 0;
    let lambs = 0;
    let adg = 0;
    for (const s of m.sheep) {
      const c = sheepClassOf(s);
      const list = by.get(c);
      if (list) list.push(s);
      else by.set(c, [s]);
      if (!s.weaned) {
        lambs += s.n;
        continue;
      }
      head += s.n;
      dse += dseOf(s, lambsPerEwe(s, lambsOf)) * s.n;
      fleece += s.fleece * s.n;
      micronKg += s.micronKg * s.n;
      days += s.woolDays * s.n;
      adg += s.adg * s.n;
    }
    const classes = CLASS_ORDER.filter((c) => by.has(c)).map((c) => {
      const l = by.get(c)!;
      const h = headOf(l);
      return {
        cls: c,
        head: h,
        avgKg: l.reduce((t, s) => t + s.wt * s.n, 0) / h,
        avgCs: l.reduce((t, s) => t + s.cond * s.n, 0) / h,
      };
    });
    return {
      id: m.id,
      species: 'sheep' as const,
      name: m.name,
      area: areaNameOf(survey, m),
      head,
      lambs,
      classes,
      dse,
      ae: aeFromDse(dse),
      fleeceKgHead: head ? fleece / head : 0,
      micron: fleece > 0 ? micronKg / fleece : 0,
      woolMonths: head ? days / head / (365 / 12) : 0,
      waterLitres: sheepWaterLitres(m, month),
      adg: head ? adg / head : 0,
      intakePct: m.st?.pct ?? 0,
      dryDays: m.dry,
      joining: sheepJoiningRecord(m),
      joinOn: m.joinOn,
      feed: m.feed,
      shearOn: m.shearOn,
      crutchOn: m.crutchOn,
    };
  });
}

/** The farm's stocking, cattle and sheep, in both units. */
export interface StockingRead {
  /** Cattle AE (the cattle model's `aeOf`). May be shown. */
  cattleAe: number;
  /** Sheep DSE (energy ÷ 8.3 MJ). May be shown. */
  sheepDse: number;
  /** Everything in AE, sheep at 8.4 DSE to the AE (call C3). May be shown. */
  totalAe: number;
  /** Everything in DSE, cattle at 8.4 DSE to the AE (call C3). May be shown. */
  totalDse: number;
}

/** The farm's stocking in AE and DSE. A farm with no sheep has 0 sheep DSE. */
export function stockingRead(farm: FarmState): StockingRead {
  let cattleAe = 0;
  for (const m of farm.mobs) for (const a of m.animals) cattleAe += aeOf(a);
  let sheepDse = 0;
  for (const m of sheepMobsOf(farm)) {
    const lambsOf = lambsByDam(m.sheep);
    for (const s of m.sheep) if (s.weaned) sheepDse += dseOf(s, lambsPerEwe(s, lambsOf)) * s.n;
  }
  return {
    cattleAe,
    sheepDse,
    totalAe: cattleAe + sheepDse / DSE_PER_AE,
    totalDse: sheepDse + cattleAe * DSE_PER_AE,
  };
}

/** One sheep's wool for the shed and the sale: clean kg, micron and months of wool. */
export function fleeceOf(s: Pick<Sheep, 'fleece' | 'micronKg' | 'woolDays'>): {
  cleanKg: number;
  micron: number;
  months: number;
} {
  return { cleanKg: s.fleece, micron: fleeceMicron(s), months: s.woolDays / (365 / 12) };
}

/** Dressing percentage and carcase weight, for the sale (call C31). */
export { carcaseKg, dressingShare } from './market';

/** A class of sheep for sale, for the market screen. */
export interface SheepBuyRead {
  cls: SheepBuyClassId;
  /** The class's name. May be shown. */
  name: string;
  /** Dollars a head, the head fee included. May be shown. */
  perHead: number;
}

/** The sheep for sale today and the prices they are worth, for the market screen. */
export interface SheepMarketRead {
  /** Classes to buy, with their price a head. May be shown. */
  buy: SheepBuyRead[];
  /** MLA's indicators the sheep sell on, c/kg carcase, and their date. May be shown. */
  indicators: Record<SheepIndicatorId, number>;
  date: string;
  /** Clean wool, c/kg, by micron (the dated stand-in). May be shown. */
  wool: { micron: number; cKg: number }[];
  /** False in a district that does not run sheep: show no sheep market there. */
  offered: boolean;
}

/** The sheep market as a screen may show it. Prices are figures to show, not formulas. */
export function sheepMarketRead(
  farm: Pick<FarmState, 'district'> & Partial<Pick<FarmState, 'sheep'>>,
): SheepMarketRead {
  const prices = sheepIndicatorsOf(farm);
  return {
    buy: (Object.keys(SHEEP_BUY_CLASSES) as SheepBuyClassId[]).map((cls) => ({
      cls,
      name: SHEEP_BUY_CLASSES[cls].name,
      perHead: Math.round(sheepBuyPrice(cls, prices) + SHEEP_TRADE.headFee),
    })),
    indicators: { ...prices },
    date: farm.sheep?.prices?.date ?? SHEEP_PRICE_DATE,
    wool: WOOL_PRICE_C_KG.map(([micron, cKg]) => ({ micron, cKg })),
    offered: sheepDistrict(farm.district),
  };
}

/** A kind of fence for the build tool. */
export interface FenceKindRead {
  kind: 'permanent' | 'electric' | 'tape' | 'netting';
  /** Dollars a metre, new. May be shown. */
  perM: number;
  /** Whether it holds cattle and whether it holds sheep. May be shown. */
  holdsCattle: boolean;
  holdsSheep: boolean;
}

/** The fences the build tool offers, what they cost and what they hold. */
export function fenceKindsRead(): FenceKindRead[] {
  return (['permanent', 'electric', 'tape', 'netting'] as const).map((kind) => ({
    kind,
    perM: kind === 'netting' ? NETTING_PER_M : COST_PER_M[kind],
    holdsCattle: true,
    holdsSheep: fenceHoldsSheep(kind),
  }));
}

/**
 * The netting fence on the farm, edge by edge, for the map (the map's
 * fence codes draw netting as permanent fence until they have their own).
 */
export function nettingEdges(farm: Pick<FarmState, 'layout'>): EdgeRef[] {
  const out: EdgeRef[] = [];
  const f = farm.layout.fences;
  for (let i = 0; i < f.hE.length; i++)
    if (f.hE[i] === EDGE.netting) out.push({ line: 'h', index: i });
  for (let i = 0; i < f.vE.length; i++)
    if (f.vE[i] === EDGE.netting) out.push({ line: 'v', index: i });
  return out;
}

/** The farm's sheep money this year so far: wool sold, for the money screen. May be shown. */
export function sheepYearRead(farm: Pick<FarmState, 'year'>): {
  wool: number;
  sheepDeaths: number;
} {
  return { wool: farm.year.wool ?? 0, sheepDeaths: farm.year.sheepDeaths ?? 0 };
}

/**
 * The CS a stage should not fall under, from the document's sources:
 * Lifetime Wool's targets for Merino ewes (southern slopes handbook, S19):
 * joining 2.6, early to mid pregnancy 2.3, lambing 2.6, weaning 2.4; and for
 * sheep that are not breeding, CS 2 (Agriculture Victoria S7: CS 2 or less
 * carries a significant risk of death).
 */
export const CS_FLOOR = {
  joining: 2.6,
  pregnancy: 2.3,
  lambing: 2.6,
  lactation: 2.4,
  other: 2,
} as const;
export type SheepStage = keyof typeof CS_FLOOR;

/** A sheep mob under the floor for its stage: a fact for the to-do list, not advice. */
export interface SheepConditionFact {
  mob: number;
  /** The mob's name. May be shown. */
  mobName: string;
  /** The stage most of its sheep are at, the mob's average CS, and the floor. May be shown. */
  stage: SheepStage;
  cs: number;
  floor: number;
}

/**
 * A dry ewe is at the joining stage from this many days before the mob's
 * joining day to its end; out of season she is a dry sheep (floor 2).
 * STAND-IN: Lifetime Wool's target is condition at joining; six weeks is
 * about what it takes to put on half a score.
 */
export const JOINING_PREP_DAYS = 42;

/** The stage most of a mob's weaned sheep are at, by head, on a date (farm day `day`). */
function stageOf(m: SheepMob, date: CalendarDate, day: number): SheepStage {
  const sinceJoin = m.join ? day - m.join.start : -1;
  const toJoin = (365 - daysSince(date, m.joinOn)) % 365;
  const inSeason = (sinceJoin >= 0 && sinceJoin < JOIN_DAYS) || toJoin <= JOINING_PREP_DAYS;
  const lambsOf = lambsByDam(m.sheep);
  const by: Record<SheepStage, number> = {
    joining: 0,
    pregnancy: 0,
    lambing: 0,
    lactation: 0,
    other: 0,
  };
  for (const s of m.sheep) {
    if (!s.weaned || s.n <= 0) continue;
    const st: SheepStage =
      s.sex !== 'F' || s.age < 365
        ? 'other'
        : s.preg >= 0
          ? s.preg >= 117
            ? 'lambing'
            : 'pregnancy'
          : lambsPerEwe(s, lambsOf) > 0
            ? 'lactation'
            : inSeason
              ? 'joining'
              : 'other';
    by[st] += s.n;
  }
  return (Object.keys(by) as SheepStage[]).reduce((a, b) => (by[b] > by[a] ? b : a));
}

/**
 * Sheep mobs whose average CS is under the floor for their stage
 * (`CS_FLOOR`). Facts only: the screens word them, and what to do is the
 * player's.
 */
export function sheepConditionFacts(
  farm: Pick<FarmState, 'sheep' | 'day' | 'start'>,
): SheepConditionFact[] {
  const out: SheepConditionFact[] = [];
  const date = dateAt(farm.start, farm.day);
  for (const m of sheepMobsOf(farm)) {
    const w = m.sheep.filter((s) => s.weaned && s.n > 0);
    const h = headOf(w);
    if (!h) continue;
    const cs = w.reduce((t, s) => t + s.cond * s.n, 0) / h;
    const stage = stageOf(m, date, farm.day);
    const floor = CS_FLOOR[stage];
    if (cs < floor) out.push({ mob: m.id, mobName: m.name, stage, cs, floor });
  }
  return out;
}

/** What each feed would cost a sheep mob today, dollars, for the feed chooser. */
export interface SheepFeedCost {
  mob: number;
  /** Dollars today for each feed on today's pasture. May be shown. */
  perDay: Record<SheepFeed, number>;
}

/**
 * What a day of each feed would cost each sheep mob on today's pasture: the
 * mob's day tried on a copy with each feed. The farm is not changed.
 */
export function sheepFeedCosts(farm: FarmState, env: SourceEnv = {}): SheepFeedCost[] {
  const mobs = sheepMobsOf(farm);
  if (!mobs.length) return [];
  const survey = surveyOf(farm);
  const date = dateOn(farm);
  return mobs.map((m) => {
    const perDay: Record<SheepFeed, number> = { none: 0, lick: 0, grain: 0, hay: 0 };
    if (m.where.kind !== 'paddock') return { mob: m.id, perDay };
    const areaId = survey.topology.areaOf[m.where.anchor]!;
    for (const feed of SHEEP_FEEDS) {
      if (feed === 'none') continue;
      const copy = deepCopy({ pasture: farm.pasture, mob: m });
      copy.mob.feed = feed;
      const land = landOf({ ...farm, pasture: copy.pasture }, survey, plantingsNow(farm, env));
      const byId = new Map<number, Sheep>();
      for (const s of copy.mob.sheep) byId.set(s.id, s);
      const r = simFlock(copy.mob, {
        place: { kind: 'paddock', area: grazingArea(survey, areaId) },
        land,
        day: farm.day,
        date,
        byId,
        ids: { next: farm.animalIds.next },
        rng: {
          breeding: rngFromState(farm.sheep!.rng.breeding),
          deaths: rngFromState(farm.sheep!.rng.deaths),
          flies: rngFromState(farm.sheep!.rng.flies),
        },
      });
      perDay[feed] = r.feedCost;
    }
    return { mob: m.id, perDay };
  });
}
