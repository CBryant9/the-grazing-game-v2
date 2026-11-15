/**
 * The feed forecast for the Feed panel (REQUIREMENTS, "A feed graph
 * forecasts the rest of the year, with crops showing as spikes").
 *
 * It runs the engine's own start of the day (crop stages, then grass growth:
 * `startOfDay`, the same code the tick runs) on a copy of the farm, a day at
 * a time for a year ahead, in an average season: every day grows at the
 * district curve (`averageYear`, season and month factor 1). A real-year
 * farm is forecast the same way, never on its real weather to come, so the
 * player never sees the future. Each day the stock on hand take what they
 * ate today from the pasture squares, shared over them by the feed on each
 * (green and dead alike). Nothing is bought, sold, born or moved, and the
 * cattle do not grow: it is the feed against the stock as they are now.
 *
 * Only the copy changes. The result is figures: feed on offer, crops and
 * what the stock eat, in kg DM over the farm. No curve or constant leaves
 * the engine.
 */

import { intakeOf } from '../cattle/graze';
import { dayDiet } from '../cattle/simMob';
import { GRID_N } from '../grid';
import { FEED_FLOOR_KG_HA } from '../pasture/summary';
import { averageYear } from '../season/factors';
import { dateAt, type CalendarDate } from '../calendar';
import {
  keepSources,
  landOf,
  plantingsNow,
  realSourcesOf,
  surveyOf,
  type SourceEnv,
} from './derived';
import { cloneCropState } from '../crops/fields';
import { LAND, clonePastureState } from '../pasture/state';
import type { FarmState } from './state';
import { placeFor, startOfDay } from './tick';

/** Days the forecast runs ahead. */
export const FORECAST_DAYS = 365;
/** Points on the chart: today, then one about every month. */
export const FORECAST_POINTS = 12;

export interface FeedForecastPoint {
  /** The farm day of the point. The first is today. */
  day: number;
  /** The farm's own calendar date for the day (on a real-year farm the month and day are the real ones). */
  date: CalendarDate;
  /** Feed on offer on the pasture squares (native and sown pasture), kg DM over the farm. */
  pastureKg: number;
  /** Feed on the crop squares (grain crops, forage crops and annual pasture), kg DM. */
  cropKg: number;
}

export interface FeedForecast {
  points: FeedForecastPoint[];
  /** Pasture hectares today (native and sown pasture). */
  pastureHa: number;
  /** Crop hectares today. */
  cropHa: number;
  /** The ground cover floor, kg DM/ha (`FEED_FLOOR_KG_HA`). */
  floorKgHa: number;
  /** What the stock on hand eat from pasture, kg DM a day. Cattle in the feedlot are left out. */
  eatKgDay: number;
  /** Head counted in `eatKgDay`: cattle (calves left out) and sheep. */
  head: number;
  /**
   * The first day feed on the pasture squares falls under the floor over the pasture
   * (`floorKgHa` × `pastureHa`), with its date, or null if it stays above it for the year.
   * Day 0 of the forecast is today: a farm already under the floor gives today.
   */
  underFloor: { day: number; date: CalendarDate } | null;
}

const isPasture = (lu: number): boolean => lu === LAND.native || lu === LAND.sown;
const isCrop = (lu: number): boolean => lu === LAND.annual || lu === LAND.crop;

/** What the stock on hand eat from pasture today, kg DM, and the head counted. */
function stockEat(farm: FarmState, env: SourceEnv): { kg: number; head: number } {
  const survey = surveyOf(farm);
  let land: ReturnType<typeof landOf> | null = null;
  let kg = 0;
  let head = 0;
  for (const m of farm.mobs) {
    if (m.where.kind === 'lot') continue;
    for (const a of m.animals) if (!a.dead && a.kind !== 'calf') head++;
    if (m.st) {
      // What the mob wanted today (after any supplement), as the cattle step worked it out.
      kg += m.st.demand;
      continue;
    }
    // A mob that has not had a day yet: its own intake with feed in front of it.
    land ??= landOf(farm, survey, plantingsNow(farm, env));
    const place = placeFor(farm, survey, m);
    if (place.kind === 'lot') continue;
    const diet = { ...dayDiet(place, land).diet, avail: 1 };
    for (const a of m.animals) if (!a.dead) kg += intakeOf(a, diet, m.supp, false).past;
  }
  for (const m of farm.sheep?.mobs ?? []) {
    if (m.where.kind === 'lot') continue;
    if (m.st) {
      kg += m.st.demand;
      head += m.st.n;
    } else {
      for (const s of m.sheep) if (s.weaned) head += s.n;
    }
  }
  return { kg, head };
}

/**
 * Feed on offer for the year ahead in an average season, against what the
 * stock on hand eat, with the crops apart. Reading it changes nothing.
 */
export function feedForecast(farm: FarmState, env: SourceEnv = {}): FeedForecast {
  // A real-year farm needs its real data for the copy, as the tick does. Its weather is not used.
  realSourcesOf(farm, env);
  const eat = stockEat(farm, env);
  // A copy of the parts the start of a day changes: the pasture, the crops and the year's tallies.
  const copy: FarmState = {
    ...farm,
    pasture: clonePastureState(farm.pasture),
    crops: cloneCropState(farm.crops),
    year: { ...farm.year, covers: [] },
  };
  keepSources(copy, farm);
  const avg: SourceEnv = { ...env, seasons: averageYear };
  const ps = copy.pasture;
  const haSq = farm.layout.scale.haPerSquare;

  // The pasture squares and the crop squares as they are today.
  const pasture: number[] = [];
  const crop: number[] = [];
  for (let i = 0; i < GRID_N; i++) {
    if (isPasture(ps.land[i]!)) pasture.push(i);
    else if (isCrop(ps.land[i]!)) crop.push(i);
  }
  const pastureHa = pasture.length * haSq;
  const floorKg = FEED_FLOOR_KG_HA * pastureHa;
  const kgOn = (cells: readonly number[]): number => {
    let t = 0;
    for (const i of cells) t += ps.G[i]! + ps.D[i]!;
    return t * haSq;
  };

  const step = FORECAST_DAYS / FORECAST_POINTS;
  const at = new Set<number>();
  for (let k = 1; k < FORECAST_POINTS; k++) at.add(Math.round(k * step));

  const start = farm.day;
  const dateOf = (day: number): CalendarDate => dateAt(farm.start, day);
  const points: FeedForecastPoint[] = [];
  let underFloor: FeedForecast['underFloor'] = null;
  const now = kgOn(pasture);
  points.push({ day: start, date: dateOf(start), pastureKg: now, cropKg: kgOn(crop) });
  if (pastureHa > 0 && now < floorKg) underFloor = { day: start, date: dateOf(start) };

  for (let k = 0; k < FORECAST_DAYS; k++) {
    // Day start + k, as the tick starts it: crop stages, then the grass grows.
    copy.day = start + k;
    startOfDay(copy, avg, []);
    // The stock take the day's feed from the pasture squares, shared by the feed on each.
    let left = kgOn(pasture);
    if (left > 0 && eat.kg > 0) {
      const keep = Math.max(0, 1 - eat.kg / left);
      for (const i of pasture) {
        ps.G[i] = ps.G[i]! * keep;
        ps.D[i] = ps.D[i]! * keep;
      }
      left *= keep;
    }
    // The farm as it stands on the morning of the next day.
    const day = start + k + 1;
    if (underFloor === null && pastureHa > 0 && left < floorKg) {
      underFloor = { day, date: dateOf(day) };
    }
    if (at.has(k + 1)) {
      points.push({ day, date: dateOf(day), pastureKg: kgOn(pasture), cropKg: kgOn(crop) });
    }
  }

  return {
    points,
    pastureHa,
    cropHa: crop.length * haSq,
    floorKgHa: FEED_FLOOR_KG_HA,
    eatKgDay: eat.kg,
    head: eat.head,
    underFloor,
  };
}
