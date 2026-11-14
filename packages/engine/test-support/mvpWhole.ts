/**
 * The whole farm in the MVP and in the engine, side by side.
 *
 * A farm is built by the engine's createFarm and copied into an MVP game,
 * so both start from the same state. Each day the MVP's own stepDay runs,
 * then the engine's, and everything is compared exactly: pasture, crops,
 * fences and water, every mob and every animal, cash, the year's totals,
 * the market and the game-over counters.
 *
 * The MVP draws every random number from one unseeded source. Here each of
 * its draws is sent to the matching engine stream by which part of the MVP
 * asked for it. The MVP's functions are wrapped, in memory only, so each
 * one marks its draws: the cattle step, breakouts, the market, the season,
 * making a batch of cattle, and the draws that only place a beast on the
 * map (which the engine never makes). The file on disk is never changed.
 *
 * Test use only. Nothing in `src` may import this file.
 */

import { expect } from 'vitest';
import { applyInstantly } from './instant';
import type { Action, ActionResult } from '../src/actions/types';
import { dateAt, monthIndex } from '../src/calendar';
import type { Animal } from '../src/cattle/types';
import { asStandIn } from '../src/market/standIn';
import { infraInPlace } from '../src/money/worth';
import { rngFromState, rngStream, type Rng } from '../src/rng';
import { HERD_STREAM } from '../src/sim/create';
import { cropContextOf, seasonsOf, surveyOf } from '../src/sim/derived';
import type { FarmMob, FarmState } from '../src/sim/state';
import { stepDay, type DayResult } from '../src/sim/tick';
import { animalDifference, rngFrom, type MvpBeast, type MvpSt } from './cattle';
import { firstDifference } from './farms';
import { seededRandom } from './mvp';
import {
  expectSameCrops,
  expectSameLayout,
  expectSameSurvey,
  loadMvpFarm,
  putLayout,
  type MvpFarm,
  type MvpFarmField,
  type MvpFarmState,
  type MvpLogLine,
} from './mvpFarm';

/** One leg of the MVP's grazing plan. */
export interface MvpLeg {
  stops: number[];
  mode: 'days' | 'kg';
  every: number;
  kg: number;
  maxDays: number;
  rounds: number;
}

/** The MVP's grazing plan on a mob (`commitPlan` makes one, `planStep` moves it). */
export interface MvpPlan {
  legs: MvpLeg[];
  after: 'repeat' | 'stay';
  leg: number;
  idx: number;
  round: number;
  moved: number;
  noted: number;
  /** The stop the plan last said it was waiting for (no water), or -1. */
  dryNote?: number;
  rep: {
    start: number;
    moves: number;
    rounds: number;
    eaten: number;
    gain: number;
    headDays: number;
    paddocks: Record<string, number>;
  };
}

export interface MvpWholeMob {
  id: number;
  name: string;
  animals: MvpBeast[];
  loc: 'pad' | 'lot';
  anchor: number;
  supp: string;
  plan: MvpPlan | null;
  dry: number;
  st: MvpSt | null;
  wReg: number;
  lossDays?: number;
  join?: { start: number; conc: number; last: number; elig: number } | null;
  lastShort?: number;
  lastThin?: number;
  markNote?: number | null;
  youngNote?: number;
  calvNote?: number | null;
  openNote?: number | null;
  lastBreak?: number | null;
}

export interface MvpScore {
  profit: number;
  util: number;
  cover: number;
  profitPts: number;
  gainPts: number;
  utilPts: number;
  coverPts: number;
  deathPts: number;
  total: number;
}

export interface MvpYearTotals {
  start: number;
  grown: number;
  eaten: number;
  gain: number;
  births: number;
  deaths: number;
  sales: number;
  buys: number;
  feed: number;
  grain: number;
  crops: number;
  infra: number;
  running: number;
  interest: number;
  worth0: number;
  covers: number[];
  worth1?: number;
  score?: MvpScore;
  n?: number;
  end?: number;
}

export interface MvpWholeState extends Omit<MvpFarmState, 'mobs' | 'yr'> {
  mobs: MvpWholeMob[];
  yr: MvpYearTotals;
  years: MvpYearTotals[];
  startCash: number;
  broke: number;
  noFeed: number;
  over: boolean;
  mobSeq: number;
  noise: number;
  R: number;
  rainLabel: string;
  cn: Record<string, number>;
  ph: unknown[];
  ext: number[];
  log: MvpLogLine[];
}

/** The MVP with the whole-farm functions reachable and its random draws marked. */
export interface MvpWhole extends Omit<MvpFarm, 'S' | 'U'> {
  S: MvpWholeState;
  readonly U: { portMove: number | null; playing: boolean; queue: number; picked: Set<number> };
  /** Which wrapped MVP functions are running, outermost first. */
  readonly PHASE: string[];
  /** Model draws still to come inside makeAnimal. The draw after them is for the map. */
  readonly MAKING: { left: number };
  /** Draws made directly by startHerd so far. Only the first is the model's. */
  readonly HERD: { drawn: number };
  readonly MKT: number[];
  readonly COST: Record<string, number>;
  readonly PER_M: Record<string, number>;
  readonly SELL_COMM: number;
  readonly HEAD_FEE: number;
  readonly DIFF: Record<string, { cash: number; od: number; broke: number }>;
  readonly MCLS: Record<string, [string, number]>;
  stepDay(): void;
  normPlan(p: MvpPlan | null): MvpPlan | null;
  perDayOf(L: MvpLeg): number;
  planStep(m: MvpWholeMob, p: MvpPlan, why: string): void;
  mktBase(day: number): number;
  cpk(a: object): number;
  value(a: object): number;
  netSale(a: object): number;
  estBuy(key: string, qty: number): number;
  netWorth(): number;
  scoreYear(y: object): MvpScore;
  liveYear(): MvpYearTotals;
  newYear(): MvpYearTotals;
  spend(amt: number, what: string): boolean;
  startHerd(): void;
  buyCattle(key: string, qty: number, dest: string): void;
  sellGroup(m: MvpWholeMob, gk: string, qty: number): void;
  sellAnimals(list: MvpBeast[], what: string): void;
  sellClass(k: string, qty: number): void;
  moveMob(m: MvpWholeMob, cell: number, auto?: boolean): void;
  toLot(m: MvpWholeMob): void;
  movePicked(target: number | 'lot'): void;
  weanMob(m: MvpWholeMob, dest: number | 'lot' | undefined, fromSim?: boolean): void;
  autoWeanDest(m: MvpWholeMob): number | null;
  mergeShared(): void;
  newMob(loc: string, anchor: number, name?: string, supp?: string): MvpWholeMob;
  placeAnchor(r: object): number;
  diffMoney(
    reg: string,
    ha: number,
    diff: string,
    herd: boolean,
  ): { cash: number; overdraft: number; broke: number };
  ccAEfor(reg: string, ha: number): number;
  cashBase(reg: string, ha: number): number;
  segCost(t: number | string): number;
  overheads(): number;
  markCalves(m: MvpWholeMob): void;
  harvestField(f: MvpFarmField): void;
  breakouts(): void;
}

// Added after the farm hook, in memory only. Function declarations in the
// MVP script can be given a new value, so each is wrapped to mark its draws.
const WHOLE_HOOK = `
{
  const P=[],MK={left:0},HD={drawn:0};
  const wrap=(name,fn)=>function(){P.push(name);try{return fn.apply(this,arguments);}finally{P.pop();}};
  simMob=wrap('cattle',simMob);
  breakouts=wrap('breakout',breakouts);
  drawSeason=wrap('season',drawSeason);
  gauss=wrap('market',gauss);
  series=wrap('market',series);
  herdInto=wrap('map',herdInto);
  pickTarget=wrap('map',pickTarget);
  spotIn=wrap('map',spotIn);
  makeBatch=wrap('batch',makeBatch);
  {const f=makeAnimal;makeAnimal=function(kind,sex){MK.left=(sex==='F'?1:0)+(kind==='cow'?1:0);P.push('making');try{return f.apply(this,arguments);}finally{P.pop();}};}
  {const f=startHerd;startHerd=function(){HD.drawn=0;P.push('herd');try{return f.apply(this,arguments);}finally{P.pop();}};}
  stepDay=wrap('tick',stepDay);
  Object.defineProperties(globalThis.__mvp,Object.getOwnPropertyDescriptors({
    PHASE:P,MAKING:MK,HERD:HD,MKT,COST,PER_M,SELL_COMM,HEAD_FEE,DIFF,MCLS,
    stepDay,normPlan,perDayOf,planStep,mktBase,cpk,value,netSale,estBuy,netWorth,scoreYear,liveYear,newYear,spend,
    startHerd,buyCattle,sellGroup,sellAnimals,sellClass,moveMob,toLot,movePicked,weanMob,autoWeanDest,
    mergeShared,newMob,placeAnchor,diffMoney,ccAEfor,cashBase,segCost,overheads,markCalves,harvestField,breakouts
  }));
}
`;

type Source = () => number;

/** Where each kind of MVP draw comes from. A kind with no source is an error if the MVP asks for it. */
export interface DrawSources {
  /** The cattle step: breeding and deaths, in the MVP's one order. */
  cattle?: Source;
  breakout?: Source;
  market?: Source;
  /** A new season (1 July). */
  season?: Source;
  /** A new month factor (the 1st of each month). */
  month?: Source;
  /** Cattle made for a purchase. */
  buying?: Source;
  /** The starting herd: its size, then its cattle. */
  herd?: Source;
}

export interface LoadedMvpWhole {
  mvp: MvpWhole;
  /** Replace the MVP's Math.random outright (for its own newGame). */
  setRandom(next: () => number): void;
  /** Send each MVP draw to the source for the part of the MVP that asked. */
  route(sources: DrawSources): void;
  /** Draws the MVP has made of each kind since the last call to `route`. */
  counts: Record<string, number>;
}

/** Load a fresh copy of the MVP for whole-farm runs. */
export function loadMvpWhole(): LoadedMvpWhole {
  const loaded = loadMvpFarm(WHOLE_HOOK);
  const mvp = loaded.mvp as unknown as MvpWhole;
  const counts: Record<string, number> = {};
  const out: LoadedMvpWhole = {
    mvp,
    setRandom: loaded.setRandom,
    counts,
    route(sources) {
      for (const k of Object.keys(counts)) delete counts[k];
      loaded.setRandom(() => {
        const P = mvp.PHASE;
        let kind = P[P.length - 1] ?? 'none';
        if (kind === 'making') {
          // makeAnimal draws "barren" and "calves so far" for the model,
          // then a spot on the map.
          if (mvp.MAKING.left > 0) {
            mvp.MAKING.left--;
            kind = P[P.length - 2] ?? 'none';
          } else kind = 'map';
        }
        if (kind === 'herd') kind = mvp.HERD.drawn++ === 0 ? 'herd' : 'map';
        else if (kind === 'batch') kind = P.includes('herd') ? 'herd' : 'buying';
        else if (kind === 'tick') kind = 'month';
        counts[kind] = (counts[kind] ?? 0) + 1;
        if (kind === 'map') return 0.5;
        const source = sources[kind as keyof DrawSources];
        if (!source)
          throw new Error(`The MVP asked for a random number for "${kind}" (${P.join(' > ')})`);
        return source();
      });
    },
  };
  return out;
}

/** Start any game in the MVP, so it has a state for its helpers to read. */
export function mvpAnyGame(loaded: LoadedMvpWhole): void {
  loaded.setRandom(seededRandom(5));
  loaded.mvp.newGame({ region: 'cq', year: 2022, month: 0, ha: 260, herd: false });
  loaded.route({});
}

/** An engine animal as the MVP shapes one. It stands off the map, so the MVP never counts it as a stray. */
function toMvpBeast(a: Animal): MvpBeast {
  return {
    ...a,
    x: 1e6,
    y: 0,
    tx: 0,
    ty: 0,
    idle: 0,
    dir: -1,
    rush: true,
  } as unknown as MvpBeast;
}

function toMvpMob(m: FarmMob): MvpWholeMob {
  if (m.where.kind === 'yards') throw new Error('The MVP has no stock yards');
  return {
    id: m.id,
    name: m.name,
    animals: m.animals.map(toMvpBeast),
    loc: m.where.kind === 'lot' ? 'lot' : 'pad',
    anchor: m.where.kind === 'paddock' ? m.where.anchor : 0,
    supp: m.supp,
    plan: null,
    dry: m.dry,
    st: m.st ? { ...m.st } : null,
    wReg: -1,
    lossDays: m.lossDays,
    join: m.join ? { ...m.join } : null,
    lastShort: m.lastShort,
    lastThin: m.lastThin,
    markNote: m.markNote,
    youngNote: m.youngNote,
    calvNote: m.calvNote,
    openNote: m.openNote,
    lastBreak: m.lastBreak,
  };
}

/**
 * Give the MVP the engine's farm: start one of its own games for a complete
 * state, then put the engine's pasture, crops, fences, water, cattle, money
 * and market over the top.
 */
export function putWholeFarm(loaded: LoadedMvpWhole, farm: FarmState): void {
  const { mvp } = loaded;
  loaded.setRandom(seededRandom(99));
  mvp.newGame({
    region: farm.district,
    year: farm.start.year,
    month: farm.start.month,
    ha: farm.layout.scale.farmHa,
    cash: farm.cash,
    overdraft: farm.overdraft,
    broke: farm.broke,
    herd: false,
  });
  loaded.route({});
  const S = mvp.S;
  S.mixed = farm.mixed;
  S.G.set(farm.pasture.G);
  S.D.set(farm.pasture.D);
  S.A.set(farm.pasture.A);
  S.X.set(farm.pasture.X);
  S.F.set(farm.pasture.F);
  S.land.set(farm.pasture.land);
  S.graz.set(farm.pasture.graz);
  S.lastG.set(farm.pasture.lastG);
  (mvp.GRW as Float32Array).set(farm.pasture.grown);
  S.fid.set(farm.crops.fid);
  S.CD.set(farm.crops.density);
  S.Y.set(farm.crops.yieldT);
  S.arable.set(farm.crops.arable);
  S.fields = farm.crops.fields.map((f) => {
    const out: MvpFarmField = { id: f.id, sp: f.sp, sown: f.sown, cells: f.cells.slice() };
    if (f.str !== undefined) out.str = f.str;
    if (f.regen) out.regen = true;
    if (f.dmgNote) out.dmgNote = 1;
    if (f.lockNote) out.lockNote = 1;
    return out;
  });
  S.regen = farm.crops.regen.map((r) => ({ sp: r.sp, cells: r.cells.slice(), day: r.day }));
  S.rotBlocks = farm.crops.rotBlocks.map((b) => b.slice());
  // The MVP hands out tag numbers, planting ids and portable trough ids
  // from one counter. The engine has one for each.
  S.nid = Math.max(farm.animalIds.next, farm.crops.nextFieldId, farm.layout.water.nextPortId);
  S.mobSeq = farm.nextMobId;
  S.cash = farm.cash;
  S.startCash = farm.startCash;
  S.overdraft = farm.overdraft;
  S.broke = farm.broke;
  S.energiser = farm.energiser;
  S.infra = infraInPlace(farm);
  const market = asStandIn(farm.market);
  S.R = market.indicator;
  S.noise = market.noise;
  S.cn = { ...market.drift };
  S.ext = market.ext.slice();
  S.ph = [];
  const f0 = seasonsOf(farm).factorsOn(0);
  S.rainF = f0.seasonF;
  S.rainLabel = f0.label;
  S.monthF = f0.seasonF;
  S.day = farm.day;
  S.noFeed = farm.noFeedDays;
  S.over = false;
  S.years = [];
  S.mobs = farm.mobs.map(toMvpMob);
  mvp.rebuildFields();
  putLayout(mvp as unknown as MvpFarm, farm.layout);
  S.yr = mvp.newYear();
}

/** A stream's state as four unsigned 32-bit words, however it was written down. */
const words = (state: readonly number[]): number[] => state.map((v) => v >>> 0);

const YEAR_KEYS = [
  'start',
  'grown',
  'eaten',
  'gain',
  'births',
  'deaths',
  'sales',
  'buys',
  'feed',
  'grain',
  'crops',
  'infra',
  'running',
  'interest',
  'worth0',
] as const;

const SCORE_KEYS = [
  'profit',
  'util',
  'cover',
  'profitPts',
  'gainPts',
  'utilPts',
  'coverPts',
  'deathPts',
  'total',
] as const;

export interface CompareOptions {
  /**
   * Leave out the plan's round counts (`round`, `leg` and the report's rounds).
   * The MVP counts a round every day a plan is stuck at a stop with no water;
   * the rebuild counts rounds only when the mob moves (BUILD_PLAN 2.4).
   */
  skipPlanRounds?: boolean;
  /** Leave these year totals out (where the rebuild charges differently on purpose). */
  skipYear?: readonly (typeof YEAR_KEYS)[number][];
  /** Leave out the tag number counter (the MVP shares it with plantings and portable troughs). */
  skipNextTag?: boolean;
}

/** Every way the engine's farm differs from the MVP's game. An empty list means none. */
export function farmDifferences(farm: FarmState, mvp: MvpWhole, o: CompareOptions = {}): string[] {
  const S = mvp.S;
  const diffs: string[] = [];
  const same = (what: string, mine: unknown, theirs: unknown): void => {
    if (!Object.is(mine, theirs)) {
      diffs.push(`${what}: engine ${String(mine)}, MVP ${String(theirs)}`);
    }
  };
  const sameArray = (what: string, mine: ArrayLike<number>, theirs: ArrayLike<number>): void => {
    const d = firstDifference(mine, theirs);
    if (d) diffs.push(`${what}: ${d}`);
  };
  same('day', farm.day, S.day);
  sameArray('G', farm.pasture.G, S.G);
  sameArray('D', farm.pasture.D, S.D);
  sameArray('A', farm.pasture.A, S.A);
  sameArray('X', farm.pasture.X, S.X);
  sameArray('F', farm.pasture.F, S.F);
  sameArray('land', farm.pasture.land, S.land);
  sameArray('graz', farm.pasture.graz, S.graz);
  sameArray('lastG', farm.pasture.lastG, S.lastG);
  sameArray('grown', farm.pasture.grown, mvp.GRW);

  same('cash', farm.cash, S.cash);
  same('days eaten out', farm.noFeedDays, S.noFeed);
  same('game over', !!farm.over, !!S.over);
  same('indicator', farm.market.indicator, S.R);
  const market = asStandIn(farm.market);
  same('market noise', market.noise, S.noise);
  for (const k of Object.keys(market.drift)) {
    same(`class drift ${k}`, market.drift[k as keyof typeof market.drift], S.cn[k]);
  }
  sameArray('market series past 2025', market.ext, S.ext);
  same('next mob id', farm.nextMobId, S.mobSeq);
  if (!o.skipNextTag) same('next tag', farm.animalIds.next, S.nid);

  for (const k of YEAR_KEYS) {
    if (o.skipYear?.includes(k)) continue;
    same(`year ${k}`, farm.year[k], S.yr[k]);
  }
  sameArray('year covers', farm.year.covers, S.yr.covers);
  same('years closed', farm.years.length, S.years.length);
  farm.years.forEach((y, i) => {
    const t = S.years[i];
    if (!t) return;
    for (const k of YEAR_KEYS) {
      if (o.skipYear?.includes(k)) continue;
      same(`year ${i + 1} ${k}`, y[k], t[k]);
    }
    same(`year ${i + 1} worth1`, y.worth1, t.worth1);
    same(`year ${i + 1} n`, y.n, t.n);
    same(`year ${i + 1} end`, y.end, t.end);
    for (const k of SCORE_KEYS) same(`year ${i + 1} score ${k}`, y.score[k], t.score?.[k]);
  });

  same('mobs', farm.mobs.length, S.mobs.length);
  for (let i = 0; i < Math.min(farm.mobs.length, S.mobs.length); i++) {
    const e = farm.mobs[i]!;
    const m = S.mobs[i]!;
    const who = `mob ${i} (${m.name})`;
    same(`${who} id`, e.id, m.id);
    same(`${who} name`, e.name, m.name);
    same(`${who} place`, e.where.kind === 'lot' ? 'lot' : 'pad', m.loc);
    if (e.where.kind === 'paddock') same(`${who} anchor`, e.where.anchor, m.anchor);
    same(`${who} supplement`, e.supp, m.supp);
    same(`${who} dry`, e.dry, m.dry);
    same(`${who} lossDays`, e.lossDays, m.lossDays ?? 0);
    same(`${who} lastBreak`, e.lastBreak, m.lastBreak ?? null);
    same(`${who} lastShort`, e.lastShort, m.lastShort ?? 0);
    same(`${who} lastThin`, e.lastThin, m.lastThin ?? 0);
    same(`${who} markNote`, e.markNote, m.markNote ?? null);
    same(`${who} youngNote`, e.youngNote, m.youngNote ?? 0);
    same(`${who} calvNote`, e.calvNote, m.calvNote ?? null);
    same(`${who} openNote`, e.openNote, m.openNote ?? null);
    same(`${who} joining`, !!e.join, !!m.join);
    if (e.join && m.join) {
      for (const k of ['start', 'conc', 'last', 'elig'] as const) {
        same(`${who} join.${k}`, e.join[k], m.join[k]);
      }
    }
    // A plan: the engine's paused plan is the MVP's broken one (null).
    const ep = e.plan && !e.plan.paused ? e.plan : null;
    same(`${who} plan running`, !!ep, !!m.plan);
    if (ep && m.plan) {
      const p = m.plan;
      same(`${who} plan idx`, ep.idx, p.idx);
      same(`${who} plan moved`, ep.moved, p.moved);
      same(`${who} plan noted`, ep.noted, p.noted ?? 0);
      same(`${who} plan waiting`, ep.waiting?.target ?? -1, p.dryNote ?? -1);
      same(`${who} plan moves`, ep.moves, p.rep.moves);
      same(`${who} plan eaten`, ep.eatenKg, p.rep.eaten);
      same(`${who} plan head-days`, ep.headDays, p.rep.headDays);
      same(`${who} plan start`, ep.start, p.rep.start);
      if (!o.skipPlanRounds) {
        same(`${who} plan leg`, ep.leg, p.leg);
        same(`${who} plan round`, ep.round, p.round);
        same(`${who} plan rounds`, ep.rounds, p.rep.rounds);
      }
    }
    same(`${who} has figures`, !!e.st, !!m.st);
    if (e.st && m.st) {
      for (const k of Object.keys(m.st) as (keyof MvpSt)[])
        same(`${who} st.${k}`, e.st[k], m.st[k]);
    }
    same(`${who} head`, e.animals.length, m.animals.length);
    for (let k = 0; k < Math.min(e.animals.length, m.animals.length); k++) {
      const d = animalDifference(e.animals[k]!, m.animals[k]!);
      if (d) {
        diffs.push(`${who} ${d}`);
        break;
      }
    }
  }
  return diffs;
}

/** Assert the engine's farm equals the MVP's game, exactly. */
export function expectSameFarm(
  farm: FarmState,
  mvp: MvpWhole,
  where: string,
  o: CompareOptions = {},
): void {
  expect(farmDifferences(farm, mvp, o), where).toEqual([]);
  expectSameCrops(
    { crops: farm.crops, pasture: farm.pasture, ctx: cropContextOf(farm) },
    mvp as unknown as MvpFarm,
    where,
  );
  expectSameLayout(farm.layout, mvp as unknown as MvpFarm, where);
}

/**
 * The same farm in the MVP and in the engine. `day` runs one day in both
 * and checks everything is equal. `act` does an action in both.
 */
export class WholeFarmRun {
  farm: FarmState;
  readonly mvp: MvpWhole;
  /** Cows the engine dried off where the MVP left them milking (a fixed MVP fault). */
  driedOff = 0;
  /** Every engine event type seen so far. */
  readonly seen = new Set<string>();
  compare: CompareOptions = {};
  private readonly loaded: LoadedMvpWhole;
  private readonly cattleMvp: Source;
  private readonly cattleEngine: Rng;
  private engineCattleDraws = 0;
  private mvpCattleDraws = 0;

  constructor(loaded: LoadedMvpWhole, farm: FarmState, cattleSeed = 1) {
    this.loaded = loaded;
    this.mvp = loaded.mvp;
    this.farm = farm;
    // Two copies of one sequence for the cattle step. The engine's breeding
    // and deaths streams both read the engine's copy, so the draws come in
    // the MVP's one order.
    const a = seededRandom(cattleSeed);
    const b = seededRandom(cattleSeed);
    this.cattleMvp = () => {
      this.mvpCattleDraws++;
      return a();
    };
    this.cattleEngine = rngFrom(() => {
      this.engineCattleDraws++;
      return b();
    });
    putWholeFarm(loaded, farm);
    expectSameFarm(farm, this.mvp, 'at the start');
    expectSameSurvey(surveyOf(farm), this.mvp as unknown as MvpFarm, 'at the start');
    expect(farm.year.worth0, 'net worth at the start').toBe(this.mvp.S.yr.worth0);
  }

  private where(): string {
    return `${this.farm.district} day ${this.farm.day}`;
  }

  /** The numbers the engine's own season streams give for the MVP's draws today. */
  private seasonSources(): Pick<DrawSources, 'season' | 'month'> {
    const { farm } = this;
    const mi = monthIndex(farm.start, dateAt(farm.start, farm.day));
    const julys =
      Math.floor((farm.start.month + mi - 6) / 12) - Math.floor((farm.start.month - 6) / 12);
    return {
      season: () => rngStream(farm.seed, `season:${julys}`).next(),
      month: () => rngStream(farm.seed, `month:${mi}`).next(),
    };
  }

  /**
   * Where the MVP left a cow milking for a calf that died or was weaned in
   * another mob, check the engine has dried her off, then dry her off in
   * the MVP too so the two can carry on side by side.
   */
  private settleDriedOff(): void {
    const S = this.mvp.S;
    const nowM = new Map<number, MvpBeast>();
    for (const m of S.mobs) for (const a of m.animals) nowM.set(a.id, a);
    const nowE = new Map<number, Animal>();
    for (const m of this.farm.mobs) for (const a of m.animals) nowE.set(a.id, a);
    for (const cow of nowM.values()) {
      if (!cow.calf) continue;
      const calf = nowM.get(cow.calf);
      if (calf && calf.kind === 'calf' && calf.dam === cow.id) continue;
      const mine = nowE.get(cow.id);
      expect(mine && [mine.calf, mine.lact], `#${cow.id} dried off in the engine`).toEqual([0, -1]);
      cow.calf = 0;
      cow.lact = -1;
      this.driedOff++;
    }
  }

  /** Run one day in both and compare everything. */
  day(): DayResult {
    const { farm, mvp, loaded } = this;
    const where = this.where();
    const S = mvp.S;
    // Net worth follows the rebuild's rule. The MVP's sum is given the
    // engine's figure for infrastructure, so the two agree on what a year made.
    S.infra = infraInPlace(farm);
    const breakout = rngFromState(farm.rng.breakouts);
    const market = rngFromState(farm.rng.market);
    loaded.route({
      cattle: this.cattleMvp,
      breakout: () => breakout.next(),
      market: () => market.next(),
      ...this.seasonSources(),
    });
    mvp.stepDay();
    const result = stepDay(farm, {
      rng: { breeding: this.cattleEngine, deaths: this.cattleEngine },
    });
    for (const e of result.events) {
      this.seen.add(e.type === 'cattle' ? `cattle:${e.note.type}` : e.type);
    }
    // The season the MVP drew is the one the engine ran on.
    const f = seasonsOf(farm).factorsOn(result.day);
    expect([S.rainF, S.monthF], `season and month factor, ${where}`).toEqual([f.seasonF, f.monthF]);
    this.settleDriedOff();
    expectSameFarm(farm, mvp, where, this.compare);
    expect(this.engineCattleDraws, `cattle draws, ${where}`).toBe(this.mvpCattleDraws);
    expect(words(breakout.state()), `breakout draws, ${where}`).toEqual(words(farm.rng.breakouts));
    expect(words(market.state()), `market draws, ${where}`).toEqual(words(farm.rng.market));
    return result;
  }

  /** Run several days. */
  days(n: number): void {
    for (let i = 0; i < n && !this.farm.over; i++) this.day();
  }

  /**
   * Do an action in the engine and its match in the MVP, then compare.
   * `mvpDo` is given the MVP and does the same thing with the MVP's own
   * functions. `after` runs before the compare, to assert a difference the
   * rebuild makes on purpose and bring the MVP into line with it.
   */
  act(
    action: Action,
    mvpDo: (mvp: MvpWhole) => void,
    after?: (farm: FarmState, mvp: MvpWhole) => void,
  ): Extract<ActionResult, { ok: true }> {
    const { mvp, loaded } = this;
    const buying = rngFromState(this.farm.rng.buying);
    loaded.route({ buying: () => buying.next() });
    const done = applyInstantly(this.farm, action);
    if (!done.ok) throw new Error(`${action.type} was refused: ${done.message}`);
    this.farm = done.farm;
    for (const e of done.events) this.seen.add(e.type);
    mvpDo(mvp);
    after?.(this.farm, mvp);
    expectSameFarm(this.farm, mvp, `after ${action.type}, ${this.where()}`, this.compare);
    expect(words(buying.state()), `buying draws after ${action.type}`).toEqual(
      words(this.farm.rng.buying),
    );
    return done;
  }

  /** The MVP mob with an id. */
  mvpMob(id: number): MvpWholeMob {
    const m = this.mvp.S.mobs.find((x) => x.id === id);
    if (!m) throw new Error(`The MVP has no mob ${id}`);
    return m;
  }
}

/** The MVP's starting herd from the engine's herd stream, for a farm already in the MVP. */
export function mvpStartHerd(loaded: LoadedMvpWhole, seed: number): void {
  const rng = rngStream(seed, HERD_STREAM);
  loaded.route({ herd: () => rng.next() });
  loaded.mvp.startHerd();
}
