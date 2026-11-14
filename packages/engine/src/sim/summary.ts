/**
 * The figures the screens and the calibration runs read from a farm.
 *
 * These only read the farm. They describe what is there and leave the
 * wording to the screens. The browser gets these numbers, never the
 * formulas behind them (PRD 5.16).
 */

import type { CalendarDate } from '../calendar';
import { DSE_PER_AE, aeOf, classOf, stockOn } from '../cattle/animal';
import type { MobDay } from '../cattle/types';
import type { CattleClassId } from '../data/cattle';
import { DISTRICTS } from '../data/districts';
import type { Supplement } from '../data/feed';
import { GRID_N } from '../grid';
import { netSaleValue } from '../market/prices';
import { carryingCapacityAE } from '../money/costs';
import { netWorthParts } from '../money/worth';
import { coverPct, paddockSummary, type PaddockSummary } from '../pasture/summary';
import {
  areaIdOf,
  dateOn,
  plantingsNow,
  pricesOf,
  seasonsOf,
  surveyOf,
  type SourceEnv,
} from './derived';
import type { FarmEvent } from './events';
import type { FarmState, MobWhere, YearRecord, YearTotals } from './state';
import { onRecordPtic, recordClassOf } from './told';

export interface MobSummary {
  id: number;
  name: string;
  where: MobWhere;
  /** The grazing area's name, or null off pasture. */
  area: string | null;
  /** True in the feedlot and the yards, and on an area with a working water point. */
  hasWater: boolean;
  supp: Supplement;
  /** Head, not counting calves. */
  head: number;
  calves: number;
  /** Adult equivalents, and dry sheep equivalents (AE x 8). */
  ae: number;
  dse: number;
  /**
   * Head in each class. NOT FOR THE PLAYER'S SCREENS: it counts a female as
   * PTIC from the day she conceives, which a grazier can't know. It is for
   * tests and calibration. Screens use `breedingReports` (classes as the
   * player knows them).
   */
  classes: Partial<Record<CattleClassId, number>>;
  /** Days in a row without water. Everything dies on day 4. */
  dryDays: number;
  /** The mob's figures from its last day: weight, CS, gain, diet ME and CP, intake. Null before its first day. */
  day: MobDay | null;
  /**
   * What the mob would put in the bank if sold today, dollars. It carries
   * the pregnancy premium from a female's 50th day in calf, the day she goes
   * on the record as PTIC (`PTIC_DAYS`), so it agrees with the record
   * (docs/MODEL.md, section 3, "The herd record").
   */
  saleValue: number;
  /** Head in the mob (calves at foot included) that are booked onto a sale, so a screen can mark them. */
  booked: number;
}

/**
 * Every mob's figures, in the farm's order. Built for tests and calibration:
 * `classes` and `saleValue` show live pregnancy and are not for the player's
 * screens (see each field).
 */
export function mobSummaries(farm: FarmState): MobSummary[] {
  const survey = surveyOf(farm);
  const prices = pricesOf(farm);
  const booked = new Set<number>();
  for (const b of farm.saleBookings) for (const id of b.animalIds) booked.add(id);
  return farm.mobs.map((m) => {
    const areaId = areaIdOf(survey, m);
    let head = 0;
    let calves = 0;
    let ae = 0;
    let saleValue = 0;
    const classes: Partial<Record<CattleClassId, number>> = {};
    for (const a of m.animals) {
      if (a.kind === 'calf') calves++;
      else head++;
      ae += aeOf(a);
      saleValue += Math.max(0, netSaleValue(a, prices));
      const c = classOf(a);
      classes[c] = (classes[c] ?? 0) + 1;
    }
    return {
      id: m.id,
      name: m.name,
      where: m.where,
      area: areaId < 0 ? null : survey.topology.areas[areaId]!.name,
      hasWater: areaId < 0 || survey.points.areaTroughs[areaId]!.length > 0,
      supp: m.supp,
      head,
      calves,
      ae,
      dse: ae * DSE_PER_AE,
      classes,
      dryDays: m.dry,
      day: m.st,
      saleValue,
      booked: m.animals.reduce((n, a) => n + (booked.has(a.id) ? 1 : 0), 0),
    };
  });
}

/** One mob's breeding on the record. */
export interface MobBreedingReport {
  mob: number;
  name: string;
  /** The joining under way: the farm day the bulls went in. Null with none. */
  joining: { start: number } | null;
  /** Females on the record as PTIC: `PTIC_DAYS` or more in calf. */
  ptic: { cows: number; heifers: number };
  /** How far along the PTIC females are, whole months in calf, least and most. Null with none. */
  months: { least: number; most: number } | null;
  /** Head in each class on the record (`recordClassOf`). */
  classes: Partial<Record<CattleClassId, number>>;
}

/** Days in a month of pregnancy, for "months in calf" on the record. */
const MONTH_DAYS = 30;

/**
 * Each mob's breeding on the record, in the farm's order: the joining under
 * way, the head PTIC (`PTIC_DAYS` or more in calf, by the one rule in
 * `sim/told.ts`) and how far along they are in whole months, and the class
 * table. The only read of pregnancy for the player's screens. A female less
 * than `PTIC_DAYS` in calf shows exactly as one not in calf.
 */
export function breedingReports(farm: FarmState): MobBreedingReport[] {
  return farm.mobs.map((m) => {
    let cows = 0;
    let heifers = 0;
    let least = Infinity;
    let most = -Infinity;
    const classes: Partial<Record<CattleClassId, number>> = {};
    for (const a of m.animals) {
      if (onRecordPtic(a)) {
        if (a.kind === 'cow') cows++;
        else heifers++;
        const months = Math.floor(a.preg / MONTH_DAYS);
        least = Math.min(least, months);
        most = Math.max(most, months);
      }
      const c = recordClassOf(a);
      classes[c] = (classes[c] ?? 0) + 1;
    }
    return {
      mob: m.id,
      name: m.name,
      joining: m.join ? { start: m.join.start } : null,
      ptic: { cows, heifers },
      months: cows + heifers > 0 ? { least, most } : null,
      classes,
    };
  });
}

/** Fence materials on hand, in metres, by kind. */
export interface MaterialsOnHand {
  /** Permanent fence taken down and kept to use again. */
  permanentM: number;
  /** Electric fence taken down and kept to use again. */
  electricM: number;
  /** Tape on the roll. */
  tapeM: number;
}

/**
 * The fence materials on hand. Permanent and electric fence taken down is
 * kept, and fence of that kind is built from it first, at half price.
 */
export function materialsOnHand(farm: FarmState): MaterialsOnHand {
  const { fenceOnHand, tapeOnRoll, scale } = farm.layout;
  return {
    permanentM: fenceOnHand.permanent * scale.sideM,
    electricM: fenceOnHand.electric * scale.sideM,
    tapeM: tapeOnRoll * scale.sideM,
  };
}

/** A paddock's pasture and stock, with its name and water. */
export interface PaddockView extends PaddockSummary {
  id: number;
  /** "Paddock 1", "Paddock 2" and so on. */
  name: string;
  /** The grazing area it is part of, and that area's name. */
  areaId: number;
  area: string;
  /** 'own' for a water point in the paddock, 'gate' for water through an open gate, 'none'. */
  water: 'own' | 'gate' | 'none';
  /** The mobs on the paddock's grazing area, by id. */
  mobs: number[];
  /** DSE per hectare (AE x 8). */
  dsePerHa: number;
}

/** Every paddock's summary, with the cattle on it. */
export function paddockSummaries(farm: FarmState, env: SourceEnv = {}): PaddockView[] {
  const survey = surveyOf(farm);
  const { topology, points } = survey;
  const plantings = plantingsNow(farm, env);
  const district = DISTRICTS[farm.district];
  return topology.paddocks.map((pd) => {
    const areaId = topology.areaOf[pd.cells[0]!]!;
    const area = topology.areas[areaId]!;
    const here = farm.mobs.filter(
      (m) => m.where.kind === 'paddock' && topology.areaOf[m.where.anchor] === areaId,
    );
    const s = paddockSummary(farm.pasture, {
      district,
      plantings,
      cells: pd.cells,
      ha: pd.ha,
      haPerSquare: farm.layout.scale.haPerSquare,
      day: farm.day,
      stock: stockOn(here, pd.ha / area.ha),
    });
    return {
      ...s,
      id: pd.id,
      name: pd.name,
      areaId,
      area: area.name,
      water: points.paddockTroughs[pd.id]!.length
        ? 'own'
        : points.areaTroughs[areaId]!.length
          ? 'gate'
          : 'none',
      mobs: here.map((m) => m.id),
      dsePerHa: s.rate * DSE_PER_AE,
    };
  });
}

export interface FarmTotals {
  day: number;
  date: CalendarDate;
  /** The season the last day ran on, and its growth as a multiple of a normal season. */
  season: { label: string; factor: number };
  /** Head on the farm, not counting calves. */
  head: number;
  calves: number;
  ae: number;
  dse: number;
  /** Long-term carrying capacity of the farm, AE. */
  carryingCapacityAE: number;
  /** Green, dead and total feed, kg DM/ha, averaged over every square. */
  greenKgHa: number;
  deadKgHa: number;
  massKgHa: number;
  /** Ground cover across the pasture, %. Cropping country is left out. */
  coverPct: number;
  cash: number;
  /** Net worth and its parts: cash, stock at net sale value, and 80% of infrastructure still in place. */
  netWorth: { cash: number; stock: number; infrastructure: number; total: number };
  /** The young cattle indicator, c/kg live weight. */
  indicator: number;
}

/** The whole farm's figures. */
export function farmTotals(farm: FarmState, env: SourceEnv = {}): FarmTotals {
  let head = 0;
  let calves = 0;
  let ae = 0;
  for (const m of farm.mobs) {
    for (const a of m.animals) {
      if (a.kind === 'calf') calves++;
      else head++;
      ae += aeOf(a);
    }
  }
  let g = 0;
  let d = 0;
  for (let i = 0; i < GRID_N; i++) {
    g += farm.pasture.G[i]!;
    d += farm.pasture.D[i]!;
  }
  const f = seasonsOf(farm, env).factorsOn(farm.day > 0 ? farm.day - 1 : 0);
  return {
    day: farm.day,
    date: dateOn(farm),
    season: { label: f.label, factor: f.seasonF },
    head,
    calves,
    ae,
    dse: ae * DSE_PER_AE,
    carryingCapacityAE: carryingCapacityAE(farm.district, farm.layout.scale.farmHa),
    greenKgHa: g / GRID_N,
    deadKgHa: d / GRID_N,
    massKgHa: (g + d) / GRID_N,
    coverPct: coverPct(farm.pasture),
    cash: farm.cash,
    netWorth: netWorthParts(farm),
    indicator: farm.market.indicator,
  };
}

/** What a calibration run reads from a farm (the MVP's tests/calibrate.js). */
export interface CalibrationView {
  day: number;
  /** Head, not counting calves, and their total live weight, kg. */
  head: number;
  liveWeightKg: number;
  /** Fixed water points on the farm. */
  waters: number;
  /** The year under way, and the years finished. */
  year: YearTotals;
  years: YearRecord[];
}

export function calibrationView(farm: FarmState): CalibrationView {
  let head = 0;
  let kg = 0;
  for (const m of farm.mobs) {
    for (const a of m.animals) {
      if (a.kind === 'calf') continue;
      head++;
      kg += a.wt;
    }
  }
  return {
    day: farm.day,
    head,
    liveWeightKg: kg,
    waters: farm.layout.water.troughs.length,
    year: farm.year,
    years: farm.years,
  };
}

/** A preg test result against the rate expected at the females' condition. */
export interface PregTestResult {
  mob: number;
  inCalf: number;
  females: number;
  /** Share in calf, 0 to 1, and the share expected at their condition. */
  rate: number;
  expected: number;
  cs: number;
}

/** The preg tests in a day's events (or in the inbox's). */
export function pregTests(events: readonly FarmEvent[]): PregTestResult[] {
  const out: PregTestResult[] = [];
  for (const e of events) {
    if (e.type === 'cattle' && e.note.type === 'pregTest') {
      const n = e.note;
      out.push({
        mob: e.mob,
        inCalf: n.inCalf,
        females: n.females,
        rate: n.rate,
        expected: n.expected,
        cs: n.cs,
      });
    }
  }
  return out;
}
