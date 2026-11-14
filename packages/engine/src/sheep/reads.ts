/**
 * Reads for the screens and the web server (milestone 2.3). Each returns
 * numbers and classes to show, never a formula or a table (PRD 5.16). The
 * doc comment on each field says what may be shown.
 */

import { aeOf } from '../cattle/animal';
import { DSE_PER_AE, fenceHoldsSheep, sheepDistrict, type SheepFeed } from '../data/sheep';
import {
  SHEEP_INDICATORS_C_KG,
  SHEEP_PRICE_DATE,
  SHEEP_TRADE,
  WOOL_PRICE_C_KG,
  type SheepIndicatorId,
} from '../data/sheepMarket';
import { EDGE, type EdgeRef } from '../farm/topology';
import { COST_PER_M } from '../money/costs';
import { SHEEP_BUY_CLASSES, sheepBuyPrice, type SheepBuyClassId } from './market';
import { surveyOf, areaNameOf } from '../sim/derived';
import type { FarmState } from '../sim/state';
import { aeFromDse, dseOf, sheepClassOf } from './energy';
import { headOf, lambsByDam, lambsPerEwe } from './simFlock';
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
export function sheepMarketRead(farm: Pick<FarmState, 'district'>): SheepMarketRead {
  return {
    buy: (Object.keys(SHEEP_BUY_CLASSES) as SheepBuyClassId[]).map((cls) => ({
      cls,
      name: SHEEP_BUY_CLASSES[cls].name,
      perHead: Math.round(sheepBuyPrice(cls) + SHEEP_TRADE.headFee),
    })),
    indicators: { ...SHEEP_INDICATORS_C_KG },
    date: SHEEP_PRICE_DATE,
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
    perM: COST_PER_M[kind],
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
