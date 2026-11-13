/**
 * Growth from real weather: a soil-water tally and the growth factor it gives.
 *
 * The district growth curve stays as the average year. This module answers
 * one question for a real date: how did the soil water compare with the
 * average for that time of year, as a multiple of the curve.
 *
 *   1. The tally. The soil holds up to `capacityMm` of water the grass can
 *      reach. Rain goes in. What does not fit is lost. The grass takes water
 *      out at the day's evapotranspiration while the soil is moist, and more
 *      slowly as it dries.
 *   2. The index, 0 to 1: how freely the grass can draw water that day.
 *   3. The factor: the index over its own long-run average for the time of
 *      year, held under a ceiling. Over the scaling years it averages 1 in
 *      every calendar month, so the district curve is still the average year.
 *
 * The formulas, figures and sources are in docs/MODEL.md (section 1A) and
 * docs/DATA.md (Growth from real weather). Nothing here reads a file or the
 * clock. The same table always gives the same numbers.
 */

import type { CalendarDate } from '../calendar';
import type { District } from '../data/districts';
import { interpMonth } from '../pasture/potential';
import { PLAY_WOBBLE } from './randomSeasons';
import {
  dateOfSerial,
  daySerial,
  isoDate,
  tableDays,
  tableIndex,
  tableLast,
  type WeatherTable,
} from './weatherTable';

export interface SoilWater {
  /** Water the grass can reach when the soil is full, mm. */
  capacityMm: number;
  /**
   * The share of that water the grass can take before it starts to
   * struggle. Below the rest, growth slows in step with the water left.
   */
  easyShare: number;
}

/**
 * The soil every district uses (docs/DATA.md, Growth from real weather).
 *
 * 100 mm is a tuning value. It sits inside the 65 to 270 mm that FAO-56
 * gives for a loam under grazed pasture (tables 19 and 22). It was picked
 * over 150 mm because it follows the AussieGRASS shire series more closely
 * in Western Victoria and about as closely in the other three districts
 * (docs/CALIBRATION.md). 0.6 is FAO-56's figure for grazed pasture
 * (table 22). One soil for all four districts is a tuning choice.
 */
export const SOIL_WATER: SoilWater = { capacityMm: 100, easyShare: 0.6 };

/**
 * The most the weather can lift a day's growth, as a multiple of the
 * district curve. It is the MVP's own limit on the month factor. Sown
 * pastures and crops are multiplied by the same factor, so this keeps them
 * in the range they were tuned in. A tuning value.
 */
export const WEATHER_FACTOR_CEILING = PLAY_WOBBLE.max;

/**
 * The years the factor is scaled over. They are fixed, so a later weather
 * pull that adds a year does not shift the factors of past years. Changing
 * them is a model change.
 */
export const SCALING_YEARS = { first: 1997, last: 2025 } as const;

/** Two tallies agree, and the starting guess has stopped mattering, within this many mm. */
const SETTLED_MM = 1e-9;
/** The scaling is solved when every calendar month averages 1 to within this. */
const SCALING_TOLERANCE = 1e-10;
const SCALING_MAX_ROUNDS = 5000;
/**
 * The lowest scaling figure that still means something. Under it a month is
 * so nearly always dry that the factor would be reading the last millimetre
 * or two of soil water. A safety limit, not a model figure.
 */
const SCALING_FLOOR = 0.01;

/** How freely the grass can draw water, 0 to 1, with `water` mm in the soil. */
export function waterIndex(water: number, soil: SoilWater = SOIL_WATER): number {
  return Math.min(1, water / ((1 - soil.easyShare) * soil.capacityMm));
}

/**
 * One day of the tally: the soil water at the end of the day, mm, from the
 * water at the start, the day's rain and the day's evapotranspiration.
 */
export function soilWaterDay(
  water: number,
  rain: number,
  et0: number,
  soil: SoilWater = SOIL_WATER,
): number {
  const used = waterIndex(water, soil) * et0;
  return Math.min(soil.capacityMm, Math.max(0, water + rain - used));
}

export interface SoilWaterTally {
  /** Soil water at the end of each table day, mm. */
  water: Float64Array;
  /** The growth index for each table day, 0 to 1. */
  index: Float64Array;
  /**
   * The first table day the tally can be trusted from. The tally is run
   * from an empty soil and from a full one. From the day the two agree, the
   * starting guess no longer matters.
   */
  settledFrom: number;
}

/** Run the tally over a whole table. */
export function soilWaterTally(table: WeatherTable, soil: SoilWater = SOIL_WATER): SoilWaterTally {
  if (!(soil.capacityMm > 0) || !(soil.easyShare >= 0 && soil.easyShare < 1)) {
    throw new Error('Soil water needs a capacity above 0 mm and an easy share from 0 to under 1.');
  }
  const days = tableDays(table);
  if (table.et0.length !== days) {
    throw new Error(`The weather table has ${days} days of rain and ${table.et0.length} of et0.`);
  }
  const water = new Float64Array(days);
  const index = new Float64Array(days);
  let fromEmpty = 0;
  let fromFull = soil.capacityMm;
  let settledFrom = -1;
  for (let i = 0; i < days; i++) {
    const rain = table.rain[i]!;
    const et0 = table.et0[i]!;
    if (!(rain >= 0) || !(et0 >= 0)) {
      throw new Error(
        `The weather table has a figure missing on day ${i} (rain ${rain}, et0 ${et0}).`,
      );
    }
    fromEmpty = soilWaterDay(fromEmpty, rain, et0, soil);
    fromFull = soilWaterDay(fromFull, rain, et0, soil);
    if (settledFrom < 0 && fromFull - fromEmpty <= SETTLED_MM) settledFrom = i;
    water[i] = fromFull;
    index[i] = waterIndex(fromFull, soil);
  }
  if (settledFrom < 0) {
    throw new Error(
      'The weather table is too short for the soil-water tally to settle. It needs to start some years before the first year used.',
    );
  }
  return { water, index, settledFrom };
}

export interface WeatherGrowth {
  district: District;
  table: WeatherTable;
  soil: SoilWater;
  /** The first date growth factors can be asked for (the tally has settled). */
  first: CalendarDate;
  /** The last date in the table. */
  last: CalendarDate;
  /**
   * The scaling: one figure for the middle of each month, January to
   * December, read off between months the same way as the district curve.
   * A day's growth index is divided by it.
   */
  scaling: readonly number[];
  /**
   * The growth factor for a real date: that day's growth as a multiple of
   * the district curve. 0 to `WEATHER_FACTOR_CEILING`.
   */
  factorOn(date: CalendarDate): number;
  /** Rain on a real date, mm, straight from the table. */
  rainOn(date: CalendarDate): number;
  /** Water in the soil at the end of a real date, mm. */
  soilWaterOn(date: CalendarDate): number;
}

/**
 * Build a district's growth factors from its weather table. This does the
 * whole table once (about 13,000 days), so build it once per district and
 * share it between farms.
 */
export function buildWeatherGrowth(
  district: District,
  table: WeatherTable,
  soil: SoilWater = SOIL_WATER,
): WeatherGrowth {
  const tally = soilWaterTally(table, soil);
  const days = tableDays(table);
  const firstSerial = daySerial(table.first);

  // The scaling years must be whole and settled.
  const from = { year: SCALING_YEARS.first, month: 0, date: 1 };
  const to = { year: SCALING_YEARS.last, month: 11, date: 31 };
  const iFrom = daySerial(from) - firstSerial;
  const iTo = daySerial(to) - firstSerial;
  if (iFrom < tally.settledFrom || iTo >= days) {
    throw new Error(
      `The ${district.id} weather table must hold every day of ${SCALING_YEARS.first} to ${SCALING_YEARS.last}, with time before it for the soil water to settle. It runs from ${isoDate(table.first)} to ${isoDate(tableLast(table))}.`,
    );
  }

  // The calendar date of every scaling day, worked out once.
  const dates: CalendarDate[] = [];
  for (let i = iFrom; i <= iTo; i++) dates.push(dateOfSerial(firstSerial + i));

  const scaling = solveScaling(district, tally.index, iFrom, dates);

  const factor = new Float64Array(days);
  for (let i = tally.settledFrom; i < days; i++) {
    const f = factorFrom(tally.index[i]!, interpMonth(scaling, dateOfSerial(firstSerial + i)));
    if (!(f >= 0 && f <= WEATHER_FACTOR_CEILING)) {
      throw new Error(`The ${district.id} growth factor on table day ${i} is ${f}.`);
    }
    factor[i] = f;
  }

  const first = dateOfSerial(firstSerial + tally.settledFrom);
  const at = (date: CalendarDate): number => {
    const i = tableIndex(table, date);
    if (i < tally.settledFrom) {
      throw new RangeError(
        `The ${district.id} soil water has not settled by ${isoDate(date)}. The first day that can be used is ${isoDate(first)}.`,
      );
    }
    return i;
  };

  return {
    district,
    table,
    soil,
    first,
    last: tableLast(table),
    scaling,
    factorOn: (date) => factor[at(date)]!,
    rainOn: (date) => table.rain[tableIndex(table, date)]!,
    soilWaterOn: (date) => tally.water[at(date)]!,
  };
}

/** The factor for a day: its index over the long-run index, under the ceiling. */
function factorFrom(index: number, longRun: number): number {
  return Math.min(WEATHER_FACTOR_CEILING, index / longRun);
}

/**
 * Find the twelve mid-month scaling figures that make the factor average
 * exactly 1 in every calendar month of the scaling years.
 *
 * Each round works out the average factor for each month and moves that
 * month's figure by the square root of it. Months lean on their neighbours
 * (the figure for a day is read off between two mid-months), so it takes a
 * few hundred rounds to settle. Only +, ×, ÷ and square roots are used, so
 * every machine gets the same figures.
 */
function solveScaling(
  district: District,
  index: Float64Array,
  iFrom: number,
  dates: readonly CalendarDate[],
): number[] {
  const n = dates.length;
  const count = new Array<number>(12).fill(0);
  const scaling = new Array<number>(12).fill(0);
  for (let k = 0; k < n; k++) {
    const m = dates[k]!.month;
    count[m] = count[m]! + 1;
    scaling[m] = scaling[m]! + index[iFrom + k]!;
  }
  for (let m = 0; m < 12; m++) {
    scaling[m] = scaling[m]! / count[m]!;
    if (!(scaling[m]! > 0)) {
      throw new Error(
        `The ${district.id} soil was never wet in month ${m + 1} of the scaling years.`,
      );
    }
  }

  const mean = new Array<number>(12).fill(0);
  for (let round = 0; round < SCALING_MAX_ROUNDS; round++) {
    // A figure under the floor means the month is dry too often to scale.
    // Stop as soon as one gets there, not thousands of rounds later.
    const driest = Math.min(...scaling);
    if (!(driest >= SCALING_FLOOR)) {
      throw new Error(
        `The ${district.id} growth factor can't be scaled: month ${scaling.indexOf(driest) + 1} is dry too often for the ceiling of ${WEATHER_FACTOR_CEILING}.`,
      );
    }
    mean.fill(0);
    for (let k = 0; k < n; k++) {
      const date = dates[k]!;
      mean[date.month] =
        mean[date.month]! + factorFrom(index[iFrom + k]!, interpMonth(scaling, date));
    }
    let worst = 0;
    for (let m = 0; m < 12; m++) {
      mean[m] = mean[m]! / count[m]!;
      worst = Math.max(worst, Math.abs(mean[m]! - 1));
    }
    if (worst <= SCALING_TOLERANCE) return scaling;
    for (let m = 0; m < 12; m++) scaling[m] = scaling[m]! * Math.sqrt(mean[m]!);
  }
  throw new Error(
    `The ${district.id} growth factor could not be scaled to average 1 in every month. A month may be dry too often for the ceiling of ${WEATHER_FACTOR_CEILING}.`,
  );
}
