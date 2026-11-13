/**
 * What is worked out from a farm's state and never stored: paddocks,
 * grazing areas, watered squares, the season source and today's prices.
 *
 * The survey (paddocks, areas and water) is kept for as long as the farm's
 * layout object is the same one. The layout is replaced, never changed in
 * place, so a kept survey is never out of date.
 */

import type { GrazingArea, GrazingLand } from '../cattle/types';
import { plantingsOn, type CropContext } from '../crops/fields';
import { DISTRICTS } from '../data/districts';
import { surveyLayout, type FarmLayout, type Survey } from '../farm/layout';
import { areaWatered } from '../farm/water';
import type { Prices, PriceSource } from '../market/prices';
import { standInMarket } from '../market/standIn';
import type { Plantings } from '../pasture/plantings';
import type { GrowthFactorSource } from '../season/factors';
import { randomSeasons } from '../season/randomSeasons';
import type { FarmMob, FarmState, MarketState } from './state';

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

const seasonSources = new WeakMap<FarmState, GrowthFactorSource>();

/** Where the farm's growth factors come from. */
export function seasonsOf(farm: FarmState): GrowthFactorSource {
  let s = seasonSources.get(farm);
  if (!s) {
    s = randomSeasons({ seed: farm.seed, start: farm.start });
    seasonSources.set(farm, s);
  }
  return s;
}

/** The price source behind a farm's market. */
export function priceSourceOf(market: MarketState): PriceSource<MarketState> {
  switch (market.kind) {
    case 'standIn':
      return standInMarket;
  }
}

/** Today's prices on the farm. */
export const pricesOf = (farm: Pick<FarmState, 'market'>): Prices =>
  priceSourceOf(farm.market).prices(farm.market);

/** The facts the crop rules need about the farm. */
export const cropContextOf = (farm: FarmState): CropContext => ({
  district: farm.district,
  start: farm.start,
  haPerSquare: farm.layout.scale.haPerSquare,
  mixed: farm.mixed,
});

/** What the tick, an action or a summary can be given in place of the farm's own sources. */
export interface SourceEnv {
  /** Growth factors, in place of the farm's season source. */
  seasons?: GrowthFactorSource;
}

/** The plantings as the last daily tick left them, or null for a farm with nothing sown. */
export function plantingsNow(farm: FarmState, seasons?: GrowthFactorSource): Plantings | null {
  const day = farm.day > 0 ? farm.day - 1 : 0;
  const f = (seasons ?? seasonsOf(farm)).factorsOn(day);
  return plantingsOn(farm.crops, day, f.monthF, cropContextOf(farm));
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
