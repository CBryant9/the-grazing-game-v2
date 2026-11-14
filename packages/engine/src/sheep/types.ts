/**
 * Sheep, and a sheep mob (milestone 2.3).
 *
 * The sheep model has the cattle model's shape (docs/MODEL.md, section 3,
 * and the sheep section): each animal is kept on its own, eats from the one
 * grass model, and gains, breeds, grows wool and may die. A sheep mob is
 * kept apart from the cattle mobs (`farm.sheep`), so a farm with no sheep
 * plays exactly as it did before sheep existed.
 */

import type { SheepBreed } from '../data/sheep';
import type { Rng, RngState } from '../rng';
import type { MobWhere } from '../sim/state';

/** F ewe (or ewe lamb), M ram (or ram lamb), W wether (a marked male). */
export type SheepSex = 'F' | 'M' | 'W';

/**
 * A sheep's class, worked out from its age, sex and history (`sheepClassOf`).
 * A lamb is at foot (not weaned). A weaner is weaned and under a year old. A
 * hogget is a year to two years old and, for a ewe, has not lambed.
 */
export type SheepClass = 'lamb' | 'weaner' | 'hogget' | 'ewe' | 'wether' | 'ram';

export interface Sheep {
  /** Tag number. Shares the farm's tag numbers with the cattle. Never 0. */
  id: number;
  sex: SheepSex;
  breed: SheepBreed;
  /** Standard reference weight, kg: the mature weight of a ewe of its kind at CS 3. */
  srw: number;
  /** Live weight, kg. */
  wt: number;
  /** Age, days. */
  age: number;
  /** Condition score, 1 to 5. */
  cond: number;
  /** False while a lamb is at foot. */
  weaned: boolean;
  /** A lamb's dam, by tag number. 0 means none. */
  dam: number;
  /**
   * Days pregnant, -1 when not. NOT FOR THE PLAYER'S SCREENS: the reads show
   * pregnancy only as the scanning record (`sheepMobRecord`).
   */
  preg: number;
  /** Lambs she is carrying, 0 when not pregnant. NOT FOR THE SCREENS (as `preg`). */
  litter: number;
  /** Days since lambing while she has lambs at foot. -1 means dry. */
  lact: number;
  /** Lambs she has had at foot at the last lambing (for her milk). */
  reared: number;
  /** Times she has lambed. */
  parity: number;
  /** Her day of the 17-day cycle when joining started (0 to 16), -1 when not joining. */
  oes: number;
  /** CS when she got in lamb, for the birth weight. 0 when not pregnant. */
  csJoin: number;
  /** CS at scanning (day 80 of the joining), for the toxaemia risk. 0 when not known. */
  csScan: number;
  /** Milk energy she gave today, MJ. */
  milk: number;
  /** Weight change, kg a day, smoothed over about two weeks. */
  adg: number;
  /** Weight at weaning, kg. 0 until weaned (and for sheep bought in as adults). */
  wwt: number;
  /** Age when weaned, days. 0 until weaned. */
  wage: number;
  /** Clean wool grown since last shorn, kg. */
  fleece: number;
  /** Fleece kg × micron, summed as it grew: divide by `fleece` for the fleece's micron. */
  micronKg: number;
  /** Days of wool since last shorn (or since birth). */
  woolDays: number;
  /** Days of cover from flystrike left after shearing or crutching. */
  flyCover: number;
  /** Days since a flystrike, 0 to 6, or -1 when not struck in the last 7 days. */
  struck: number;
  /** A newborn lamb that will die in its first 3 days: the days it has left, else -1. */
  doomed: number;
  /** A lamb's daily death risk from 3 days old to marking, worked out at birth. 0 for others. */
  lambRisk: number;
  /** What was paid for the sheep, dollars. 0 if bred on the farm. */
  paid: number;
  /** Running cost for the stock book, dollars. */
  cost: number;
  /** Died today. Taken out of the mob at the end of the day. */
  dead: boolean;
  /** What it ate today, kg DM, pasture only. Undefined until its first day. */
  di: number | undefined;
}

/** A sheep mob's figures for the day. Averages leave out lambs at foot. */
export interface SheepMobDay {
  /** Head, not counting lambs at foot. */
  n: number;
  /** Lambs at foot. */
  lambs: number;
  wt: number;
  cs: number;
  adg: number;
  /** Diet energy, ME in MJ/kg DM. */
  me: number;
  /** Diet crude protein %. */
  cp: number;
  /** Average intake, kg DM a head (lambs left out). */
  intake: number;
  /** Intake as a share of what they could eat on good, plentiful feed. */
  pct: number;
  /** Share of the pasture wanted that the area supplied, 0 to 1. */
  f: number;
  /** Feed where they graze, kg DM/ha. */
  mass: number;
  /** Green feed where they graze, kg DM/ha. */
  green: number;
  /** Pasture the mob wanted today, kg DM. */
  demand: number;
  /** Metres walked to water. */
  dist: number;
  /** The mob's DSE today (energy needed ÷ 8.3 MJ), lambs inside their ewes. */
  dse: number;
}

/** One joining, from rams in to lambs weaned: the figures behind the marking and weaning percentages. */
export interface SheepJoining {
  /** The farm day joining started. */
  start: number;
  /** Ewes joined (ready to join when it started). */
  joined: number;
  /** Rams in the mob when it started. */
  rams: number;
  /** The rams' breed and SRW (ewe-equivalent), for the lambs. */
  sireBreed: SheepBreed;
  sireSrw: number;
  /** Ewes that got in lamb, and the lambs they carried. Model figures, shown only from scanning. */
  pregnant: number;
  foetuses: number;
  /** True once the scanning count has been taken (`LAMBING_TIMES.scanDays` after joining started). */
  scanned: boolean;
  /** The farm day the first lamb was born, or -1. */
  lambingStart: number;
  /** Lambs born, and the ewes that lambed. */
  born: number;
  ewesLambed: number;
  /** Lambs alive at the marking count, or -1 before it. */
  marked: number;
  /** Lambs weaned, or -1 before weaning. */
  weaned: number;
  /** Ewes of this joining that died from the start of lambing to the marking count. */
  eweDeathsLambing: number;
}

/** A sheep mob on the farm. One mob per grazing area, as for cattle. */
export interface SheepMob {
  /** What lets a farm hold sheep mobs beside its cattle mobs. Always 'sheep'. */
  species: 'sheep';
  /** Unique on the farm, from the same count as the cattle mobs. Never reused. */
  id: number;
  name: string;
  where: MobWhere;
  sheep: Sheep[];
  /** Days in a row without water. Every sheep dies on day 4. */
  dry: number;
  st: SheepMobDay | null;
  /** The day and month joining starts each year (the district's by default, call C27). */
  joinOn: { month: number; date: number };
  /** The joining under way or the last one, or null. */
  join: SheepJoining | null;
  /** The farm day the mob was last shorn and last crutched, or -1. */
  shorn: number;
  crutched: number;
  /** The farm day of the last "short of feed" and "low condition" notes, or -99. */
  lastShort: number;
  lastThin: number;
  /** Days in a row losing more than 20 g a head a day. */
  lossDays: number;
}

/** A farm's sheep. Left off the farm until the first sheep come, so a cattle farm is unchanged. */
export interface SheepState {
  mobs: SheepMob[];
  /** The sheep's own random streams, saved with the farm, so sheep never shift the cattle's draws. */
  rng: { breeding: RngState; deaths: RngState; flies: RngState };
}

/** The random streams the sheep step draws from. */
export interface SheepRngs {
  /** Joining, litter size, lamb survival. */
  breeding: Rng;
  /** Daily deaths, lambing deaths, orphans. */
  deaths: Rng;
  /** Flystrike. */
  flies: Rng;
}
