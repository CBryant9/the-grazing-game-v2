/**
 * What is worked out from a farm's state and never stored: paddocks,
 * grazing areas, watered squares, the season source and today's prices.
 *
 * The survey (paddocks, areas and water) is kept for as long as the farm's
 * layout object is the same one. The layout is replaced, never changed in
 * place, so a kept survey is never out of date.
 */

import { dateAt, type CalendarDate } from '../calendar';
import type { GrazingArea, GrazingLand } from '../cattle/types';
import { plantingsOn, type CropContext } from '../crops/fields';
import { DISTRICTS } from '../data/districts';
import { surveyLayout, type FarmLayout, type Survey } from '../farm/layout';
import { areaWatered } from '../farm/water';
import type { Prices, PriceSource } from '../market/prices';
import { realMarket, type RealMarket } from '../market/realMarket';
import { weekdayOf, weeklySaleOn, type SaleDay, type SaleType } from '../market/saleCalendar';
import { standInMarket } from '../market/standIn';
import type { Plantings } from '../pasture/plantings';
import type { DistrictRealData, RealData } from '../real/realData';
import type { Rng } from '../rng';
import type { GrowthFactorSource } from '../season/factors';
import { randomSeasons } from '../season/randomSeasons';
import { planRealYears, type RealYearPlan } from '../season/realYears';
import { weatherSeasons, type WeatherSeasons } from '../season/weatherSeasons';
import type { FarmMob, FarmState, RealYearsSpec } from './state';

const surveys = new WeakMap<FarmLayout, Survey>();

/** The paddocks, grazing areas, watered squares and distance to water for the farm as it stands. */
export function surveyOf(farm: Pick<FarmState, 'layout'>): Survey {
  let s = surveys.get(farm.layout);
  if (!s) {
    s = surveyLayout(farm.layout);
    surveys.set(farm.layout, s);
  }
  return s;
}

/** Keep a survey for a new layout object whose fences and watered squares are unchanged. */
export function keepSurvey(layout: FarmLayout, survey: Survey): void {
  surveys.set(layout, survey);
}

/**
 * What the tick, an action or a summary is given from outside the farm.
 *
 * `data` is how the engine gets the real weather and price tables without
 * reading a file or keeping them in a save: the server builds the bundle
 * once (`loadRealData` in `@gg/engine/server`) and passes it in here.
 */
export interface SourceEnv {
  /** Growth factors, in place of the farm's season source. */
  seasons?: GrowthFactorSource;
  /**
   * The real data bundle. A real-year farm can't be made, stepped, acted
   * on or summed up without it. A farm with random seasons never reads it.
   */
  data?: RealData;
}

/** Lay out a real-year farm's years from what it saved. No tables are needed. */
function planFrom(spec: RealYearsSpec, seed: number, startMonth: number): RealYearPlan {
  const years: number[] = [];
  for (let y = spec.years.first; y <= spec.years.last; y++) years.push(y);
  return planRealYears({
    years,
    order: spec.order,
    seed,
    startMonth,
    firstYear: spec.firstYear,
  });
}

const realPlans = new WeakMap<FarmState, RealYearPlan>();

/** The real years a farm plays, or null for a farm with random seasons. */
export function realPlanOf(farm: FarmState): RealYearPlan | null {
  if (farm.seasons.kind !== 'real') return null;
  let plan = realPlans.get(farm);
  if (!plan) {
    plan = planFrom(farm.seasons, farm.seed, farm.start.month);
    realPlans.set(farm, plan);
  }
  return plan;
}

/**
 * The date the game reports for a farm day (today if no day is given). On
 * a real-year farm it is the real date behind the day. On a farm with
 * random seasons it is the farm's own calendar.
 */
export function dateOn(farm: FarmState, day: number = farm.day): CalendarDate {
  const plan = realPlanOf(farm);
  return plan ? plan.realDateOn(day) : dateAt(farm.start, day);
}

/** What a real-year farm reads from the real data: its years, weather, market and sale days. */
export interface RealSources {
  data: DistrictRealData;
  plan: RealYearPlan;
  seasons: WeatherSeasons;
  market: PriceSource<RealMarket>;
}

const realSources = new WeakMap<FarmState, { from: RealData; sources: RealSources }>();

/**
 * A real-year farm's sources, or null for a farm with random seasons.
 *
 * A real-year farm with no data, or with data of another version than the
 * one it started on, stops here with an error. It never falls back to
 * random seasons or the stand-in market.
 */
export function realSourcesOf(farm: FarmState, env: SourceEnv = {}): RealSources | null {
  const spec = farm.seasons;
  if (spec.kind !== 'real') return null;
  if (!env.data) {
    throw new Error(
      'This farm plays real years. It needs the real weather and price tables: pass the real data bundle as `data`.',
    );
  }
  const kept = realSources.get(farm);
  if (kept && kept.from === env.data) return kept.sources;
  const data = env.data.district(farm.district);
  if (data.version !== spec.dataVersion) {
    throw new Error(
      `This farm was started on real data version ${spec.dataVersion}. The data given is version ${data.version}. A farm is never moved to other data without being asked to.`,
    );
  }
  const plan = realPlanOf(farm)!;
  const sources: RealSources = {
    data,
    plan,
    seasons: weatherSeasons({ growth: data.weather, plan }),
    market: realMarket({ prices: data.prices, cpi: data.cpi, realDateOn: plan.realDateOn }),
  };
  realSources.set(farm, { from: env.data, sources });
  return sources;
}

/**
 * Give a copy of a real-year farm the sources already worked out for the
 * farm it was copied from. They depend only on the farm's seed, start and
 * years, which a copy shares.
 */
export function keepSources(copy: FarmState, from: FarmState): void {
  const plan = realPlans.get(from);
  if (plan) realPlans.set(copy, plan);
  const real = realSources.get(from);
  if (real) realSources.set(copy, real);
}

const seasonSources = new WeakMap<FarmState, GrowthFactorSource>();

/**
 * Where the farm's growth factors come from: the source given in `env`, or
 * the farm's own (random seasons from its seed, or its real weather).
 */
export function seasonsOf(farm: FarmState, env: SourceEnv = {}): GrowthFactorSource {
  if (env.seasons) return env.seasons;
  const real = realSourcesOf(farm, env);
  if (real) return real.seasons;
  let s = seasonSources.get(farm);
  if (!s) {
    s = randomSeasons({ seed: farm.seed, start: farm.start });
    seasonSources.set(farm, s);
  }
  return s;
}

/**
 * Today's prices on the farm. They are read from the farm's saved market,
 * so no tables are needed.
 */
export function pricesOf(farm: Pick<FarmState, 'market'>): Prices {
  const m = farm.market;
  switch (m.kind) {
    case 'standIn':
      return standInMarket.prices(m);
    case 'real':
      return { indicator: m.indicator, classes: m.classes };
  }
}

/** Move the farm's market on to a farm day. The real market reads the day's prices from the data. */
export function stepMarket(farm: FarmState, env: SourceEnv, toDay: number, rng: Rng): void {
  const m = farm.market;
  switch (m.kind) {
    case 'standIn':
      standInMarket.step(m, farm.start, toDay, rng);
      return;
    case 'real': {
      const real = realSourcesOf(farm, env);
      if (!real) throw new Error('A real market belongs to a real-year farm.');
      real.market.step(m, farm.start, toDay, rng);
      return;
    }
  }
}

/** The facts the crop rules need about the farm. */
export const cropContextOf = (farm: FarmState): CropContext => ({
  district: farm.district,
  start: farm.start,
  haPerSquare: farm.layout.scale.haPerSquare,
  mixed: farm.mixed,
});

/** The plantings as the last daily tick left them, or null for a farm with nothing sown. */
export function plantingsNow(farm: FarmState, env: SourceEnv = {}): Plantings | null {
  const day = farm.day > 0 ? farm.day - 1 : 0;
  const f = seasonsOf(farm, env).factorsOn(day);
  return plantingsOn(farm.crops, day, f.monthF, cropContextOf(farm));
}

/** A sale day at the district's cattle yard, as a farm day. */
export interface FarmSaleDay extends SaleDay {
  /** The farm day the sale falls on. */
  day: number;
}

/** How many farm days ahead `nextSaleDay` looks. Past the longest break any yard has had. */
const NEXT_SALE_LOOK_AHEAD_DAYS = 120;

/**
 * The cattle sale at the district yard on a farm day, or null when the
 * yard holds none that day. A farm that plays real years reads the yard's
 * real sale days (and needs the real data in `env`). A farm with random
 * seasons has a weekly prime sale on its district's weekday, with none from
 * 16 December to 7 January, and needs no data.
 */
export function saleDayOn(
  farm: FarmState,
  env: SourceEnv,
  day: number = farm.day,
): FarmSaleDay | null {
  const real = realSourcesOf(farm, env);
  const sale = real
    ? real.data.cattleSales.saleOn(real.plan.realDateOn(day))
    : weeklySaleOn(farm.district, dateOn(farm, day));
  return sale ? { ...sale, day } : null;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A sale day in words, for a message: "Thursday 14 March, in 3 days". */
export function saleDayText(now: Pick<FarmState, 'day'>, sale: FarmSaleDay): string {
  const away = sale.day - now.day;
  const when = away === 0 ? 'today' : away === 1 ? 'tomorrow' : `in ${away} days`;
  const { date } = sale;
  return `${WEEKDAY_NAMES[weekdayOf(date)]!} ${date.date} ${MONTH_NAMES[date.month]!}, ${when}`;
}

/**
 * The next cattle sale at the district yard on or after a farm day (today
 * if no day is given), of a given type if one is asked for. It follows the
 * farm's own days, so it carries on into the next game year whatever real
 * year that is. Null when the yard holds none in the next 120 days.
 * Both kinds of farm answer (see `saleDayOn`).
 */
export function nextSaleDay(
  farm: FarmState,
  env: SourceEnv,
  from: number = farm.day,
  type?: SaleType,
): FarmSaleDay | null {
  for (let day = from; day < from + NEXT_SALE_LOOK_AHEAD_DAYS; day++) {
    const sale = saleDayOn(farm, env, day);
    if (sale && (type === undefined || sale.types.includes(type))) return sale;
  }
  return null;
}

/** The farm's country as the cattle formulas see it. */
export function landOf(farm: FarmState, survey: Survey, plantings: Plantings | null): GrazingLand {
  return {
    pasture: farm.pasture,
    district: DISTRICTS[farm.district],
    plantings,
    haPerSquare: farm.layout.scale.haPerSquare,
    sideM: farm.layout.scale.sideM,
    distToWater: survey.points.dist,
  };
}

/** A grazing area as the cattle step takes it. */
export function grazingArea(survey: Survey, areaId: number): GrazingArea {
  const r = survey.topology.areas[areaId]!;
  return { cells: r.cells, ha: r.ha, hasWater: areaWatered(survey.points, areaId) };
}

/** The id of the grazing area a mob is on, or -1 for a mob that is not on pasture. */
export const areaIdOf = (survey: Survey, m: Pick<FarmMob, 'where'>): number =>
  m.where.kind === 'paddock' ? survey.topology.areaOf[m.where.anchor]! : -1;

/** The name of the grazing area a mob is on, or null for a mob that is not on pasture. */
export function areaNameOf(survey: Survey, m: Pick<FarmMob, 'where'>): string | null {
  const id = areaIdOf(survey, m);
  return id < 0 ? null : survey.topology.areas[id]!.name;
}

/** Where a mob's stock would be put in an area: its first watered square, or its middle. */
export function placeAnchor(survey: Survey, areaId: number): number {
  return survey.points.areaTroughs[areaId]![0] ?? survey.topology.areas[areaId]!.label;
}
