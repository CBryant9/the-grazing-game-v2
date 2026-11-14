/**
 * Reads for the screens and the web server (milestone 2.3). Each returns
 * numbers and classes to show, never a formula or a table (PRD 5.16). The
 * doc comment on each field says what may be shown.
 */

import { aeOf } from '../cattle/animal';
import { DRESSING, DSE_PER_AE } from '../data/sheep';
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

/**
 * Dressing percentage (call C31): lambs 47.5% (crossbred) or 45% (Merino),
 * adults by fat score (taken as CS rounded). For the sale in milestone 2.4.
 */
export function dressingShare(s: Pick<Sheep, 'sex' | 'breed' | 'cond' | 'age' | 'weaned'>): number {
  if (s.age < 365) return DRESSING.lambXb - (s.breed === 'merino' ? DRESSING.merinoLambLess : 0);
  const fs = Math.min(5, Math.max(1, Math.round(s.cond)));
  return DRESSING.mutton[s.sex === 'F' ? 'F' : 'W'][fs - 1]!;
}

/** Hot standard carcase weight, kg: live weight × dressing percentage. The MLA indicators are quoted on it. */
export const carcaseKg = (
  s: Pick<Sheep, 'sex' | 'breed' | 'cond' | 'age' | 'weaned' | 'wt'>,
): number => s.wt * dressingShare(s);
