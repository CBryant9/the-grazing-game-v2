/**
 * Cattle, and the part of a mob the daily cattle step works on.
 *
 * The field names follow the MVP so the formulas can be checked against it
 * line by line. The MVP's drawing fields (where a beast stands on the map)
 * are left out: the engine draws nothing.
 */

import type { District } from '../data/districts';
import type { Supplement } from '../data/feed';
import type { Plantings } from '../pasture/plantings';
import type { PastureState } from '../pasture/state';
import type { Rng } from '../rng';

/**
 * What an animal is. A heifer becomes a cow when she calves. A calf becomes
 * a heifer, steer or bull when it is weaned.
 */
export type AnimalKind = 'steer' | 'heifer' | 'cow' | 'bull' | 'calf';

/** F female, M entire male, S steer (a marked male). */
export type Sex = 'F' | 'M' | 'S';

export interface Animal {
  /** The tag number. Unique on the farm, never 0. */
  id: number;
  kind: AnimalKind;
  sex: Sex;
  /** Live weight, kg. */
  wt: number;
  /** Age, days. */
  age: number;
  /** Condition score (CS), 1 to 5. */
  cond: number;
  /** A barren female never gets in calf. */
  barren: boolean;
  /** What was paid for the animal, dollars. 0 if bred on the farm. */
  paid: number;
  /** Running cost of the animal for the stock book, dollars: purchase, feed, health, marking. */
  cost: number;
  /**
   * Days pregnant. -1 means not in calf. NOT FOR THE PLAYER'S SCREENS: the
   * player knows only what a joining report or preg test has said
   * (`breedingReports`).
   */
  preg: number;
  /** Days since calving while she has a calf on her. -1 means dry. */
  lact: number;
  /** Calves she has had. */
  parity: number;
  /** A calf's dam, by tag number. 0 means none. */
  dam: number;
  /** A cow's calf at foot, by tag number. 0 means none. */
  calf: number;
  /** Milk energy she gave today, MJ. */
  milk: number;
  /** Weight change, kg a day, smoothed over about two weeks. */
  adg: number;
  /** A weaned male that was never marked: a young bull. */
  young: boolean;
  /** Died today. Dead animals are taken out of the mob at the end of the day. */
  dead: boolean;
  /** What it ate today, kg DM. Undefined until its first day on the farm. */
  di: number | undefined;
}

/** Every animal on the farm by tag number, built at the start of the day. */
export type AnimalLookup = ReadonlyMap<number, Animal>;

/** Hands out tag numbers. `next` is the next free number and counts up. */
export interface AnimalIds {
  next: number;
}

/** A joining period: the 9 weeks from when a bull is first with the females. */
export interface Joining {
  /** The farm day it started. */
  start: number;
  /** Females that have got in calf since it started. */
  conc: number;
  /** `conc` at the last 3-week note. */
  last: number;
  /** Females that were ready to get in calf when it started. */
  elig: number;
}

/** A mob's figures for the day. Averages leave out calves. */
export interface MobDay {
  /** Head, not counting calves. */
  n: number;
  /** Average live weight, kg. */
  wt: number;
  /** Average condition score. */
  cs: number;
  /** Average weight change, kg a day (smoothed). */
  adg: number;
  /** Diet energy, ME in MJ/kg DM. */
  me: number;
  /** Diet crude protein %. */
  cp: number;
  /** Average intake, kg DM a head, pasture plus hay, pellets or the lot ration. */
  intake: number;
  /** Intake as a share of what cattle of that weight could eat on good feed. */
  pct: number;
  /** Share of the pasture the mob wanted that the area supplied, 0 to 1. */
  f: number;
  /** Feed where the mob grazes, kg DM/ha, weighted by where they choose to graze. */
  mass: number;
  /** Pasture the mob wanted today, kg DM. */
  demand: number;
  /** Metres walked to water. */
  dist: number;
}

/**
 * The part of a mob the daily cattle step reads and changes. Where the mob
 * is, its name and its plan belong to the farm.
 */
export interface CattleMob {
  animals: Animal[];
  /** What the mob is fed in the paddock. */
  supp: Supplement;
  /** Days in a row without water. Everything dies on day 4. */
  dry: number;
  /** The mob's figures from its last day. Null until it has had one. */
  st: MobDay | null;
  /** Days in a row the mob has been losing more than 0.05 kg a head a day. */
  lossDays: number;
  /** The joining period under way, or null. */
  join: Joining | null;
  /** The farm day of the last "short of feed" note. 0 also means none yet. */
  lastShort: number;
  /** The farm day of the last "low condition" note. 0 also means none yet. */
  lastThin: number;
  /** The farm day of the last "bull calves to mark" note, or null. */
  markNote: number | null;
  /** The farm day young bulls were first noted as fertile. 0 means not noted. */
  youngNote: number;
  /** The farm day of the last "calving has started" note, or null. */
  calvNote: number | null;
  /** The farm day of the last "no bull" note, or null. */
  openNote: number | null;
}

/** A new, empty mob. */
export function createCattleMob(supp: Supplement = 'none'): CattleMob {
  return {
    animals: [],
    supp,
    dry: 0,
    st: null,
    lossDays: 0,
    join: null,
    lastShort: 0,
    lastThin: 0,
    markNote: null,
    youngNote: 0,
    calvNote: null,
    openNote: null,
  };
}

/** Every animal in the given mobs, by tag number. */
export function animalLookup(mobs: readonly CattleMob[]): Map<number, Animal> {
  const byId = new Map<number, Animal>();
  for (const m of mobs) for (const a of m.animals) byId.set(a.id, a);
  return byId;
}

/**
 * The ground a mob can reach: one paddock, or several joined by open gates.
 * The farm works this out and hands it in.
 */
export interface GrazingArea {
  /** The squares the mob can graze. */
  cells: readonly number[];
  /** Hectares in the area: its squares times the hectares in one square. */
  ha: number;
  /** True if the area has a working water point. */
  hasWater: boolean;
}

/** The farm's country, as the cattle formulas see it. */
export interface GrazingLand {
  /** The pasture on every square. Grazing changes it. */
  pasture: PastureState;
  district: District;
  /** Sown pastures and crops, or null if the farm has none. */
  plantings: Plantings | null;
  /** Hectares in one square. */
  haPerSquare: number;
  /** Metres along one side of a square. */
  sideM: number;
  /**
   * How far each square is from the nearest water point in its own grazing
   * area, in squares (straight line, square centre to square centre). 999
   * where the area has no water.
   */
  distToWater: Float32Array;
}

/** Year totals the cattle step adds to. They are changed in place, in the MVP's order. */
export interface CattleTotals {
  /** Live weight gained, kg, summed over every animal. Birth weights are added too. */
  gain: number;
  /** Pasture eaten, kg DM. */
  eaten: number;
  /** Calves born. */
  births: number;
  /** Cattle that died. */
  deaths: number;
  /** Dollars spent on supplements and the feedlot. */
  feed: number;
}

/** Totals starting from nothing. */
export const emptyCattleTotals = (): CattleTotals => ({
  gain: 0,
  eaten: 0,
  births: 0,
  deaths: 0,
  feed: 0,
});

/**
 * The random streams the cattle step draws from. Breeding and deaths have
 * their own streams, so a change in one never shifts the other.
 */
export interface CattleRngs {
  /** Conception, slipped calves, calving losses, the sex of a calf, barren females. */
  breeding: Rng;
  /** Daily deaths and orphaned calves. */
  deaths: Rng;
}
