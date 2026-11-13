/**
 * One day on the farm.
 *
 * This is the MVP's stepDay, in the MVP's order (docs/MODEL.md, the day's
 * order):
 *
 *   1. season and month factor; ground cover is read on the 1st of a month
 *   2. crop events
 *   3. grass growth
 *   4. each mob in turn: wean the drop if it is due, then the mob eats,
 *      gains or loses, breeds and may die (a mob made today by weaning goes
 *      on the end and has its day too)
 *   5. deaths are settled
 *   6. portable troughs drain, hungry or thirsty mobs may push through tape,
 *      and mobs that share an area join
 *   7. running costs and interest
 *   8. grazing plans move mobs (a later milestone; see plans.ts)
 *   9. the market moves and the day ends
 *  10. the year closes every 365 days
 *  11. game-over checks
 *
 * The tick changes the farm in place and returns what happened as events.
 * It never stops a clock or opens a dialog: the screens decide that.
 */

import { dateAt, type CalendarDate } from '../calendar';
import { weanMob, weaningDue } from '../cattle/breeding';
import { settleDeaths, simMob, type Death, type DeathCause, type MobPlace } from '../cattle/simMob';
import { animalLookup, type AnimalKind } from '../cattle/types';
import { plantingsOn, squareGrazed } from '../crops/fields';
import { fieldTick } from '../crops/tick';
import { HEALTH_COST_PER_HEAD_YEAR } from '../data/cattle';
import { DISTRICTS } from '../data/districts';
import { knockDownTape, type Survey } from '../farm/layout';
import { EDGE, areaEdges } from '../farm/topology';
import { drainPortables, waterNeedPerHead } from '../farm/water';
import { GRID_N } from '../grid';
import { INTEREST, overheadsPerYear } from '../money/costs';
import { closeYear } from '../money/worth';
import { growGrass } from '../pasture/grow';
import { coverPct } from '../pasture/summary';
import { rngFromState, type Rng } from '../rng';
import {
  areaNameOf,
  cropContextOf,
  grazingArea,
  keepSurvey,
  landOf,
  priceSourceOf,
  seasonsOf,
  surveyOf,
  type SourceEnv,
} from './derived';
import type { TickEvent } from './events';
import { autoWeanDest, mergeShared, newMob } from './mobs';
import { stopsToday } from './plans';
import {
  PLAY_STREAMS,
  PRICE_HISTORY_DAYS,
  toInbox,
  type FarmMob,
  type FarmState,
  type PlayStream,
} from './state';

/** A mob must get this share of the pasture it wants, or it may push through tape. */
export const BREAKOUT_FEED_SHARE = 0.85;
/** A mob pushes through tape at most once in this many days. */
export const BREAKOUT_COOLDOWN_DAYS = 21;
/** The chance a day that a hungry mob, or a thirsty one, pushes through tape. */
export const BREAKOUT_CHANCE = { hungry: 0.035, thirsty: 0.25 } as const;
/** The chance is scaled by the mob's size: head / 20 + 0.3, up to 1.5. */
export const BREAKOUT_SIZE = { headDivisor: 20, base: 0.3, max: 1.5 } as const;

/** The farm counts as eaten out when the feed cattle can reach averages under this, kg DM/ha. */
export const EATEN_OUT_KG = 40;
/** Feed under this on a square, kg DM/ha, can't be grazed. */
const UNGRAZEABLE_KG = 250;
/** The game ends after this many days in a row eaten out with cattle on the farm. */
export const EATEN_OUT_DAYS = 10;

/** What the tick can be given in place of the farm's own sources. For tests and later milestones. */
export interface TickEnv extends SourceEnv {
  /** Random streams, in place of the farm's saved ones. A stream given here is not saved back. */
  rng?: Partial<Record<PlayStream, Rng>>;
}

export interface DayResult {
  /** The farm day that was run. */
  day: number;
  date: CalendarDate;
  /** False when the game was already over and nothing ran. */
  ran: boolean;
  /** Everything that happened, in order. */
  events: TickEvent[];
  /** Every animal that died today. */
  deaths: { id: number; kind: AnimalKind; mob: number; cause: DeathCause }[];
  /** Every calf born today. */
  births: { id: number; mob: number }[];
}

function placeFor(farm: FarmState, survey: Survey, m: FarmMob): MobPlace {
  if (m.where.kind === 'lot') return { kind: 'lot' };
  if (m.where.kind === 'yards') {
    // A stand-in until yard work is built (milestone 1.5): the yards have
    // water, and stock held there graze only the square the yards are on.
    return {
      kind: 'paddock',
      area: {
        cells: [farm.buildings.yards],
        ha: farm.layout.scale.haPerSquare,
        hasWater: true,
      },
    };
  }
  const areaOf = survey.topology.areaOf;
  const stops = stopsToday(farm, m);
  return {
    kind: 'paddock',
    area: grazingArea(survey, areaOf[m.where.anchor]!),
    shifts: stops ? stops.map((c) => grazingArea(survey, areaOf[c]!)) : undefined,
  };
}

/** Run one day. Changes the farm in place. */
export function stepDay(farm: FarmState, env: TickEnv = {}): DayResult {
  const day = farm.day;
  const date = dateAt(farm.start, day);
  const events: TickEvent[] = [];
  const result: DayResult = { day, date, ran: false, events, deaths: [], births: [] };
  if (farm.over) return result;
  result.ran = true;

  const stream = (name: PlayStream): Rng => env.rng?.[name] ?? rngFromState(farm.rng[name]);
  const rng = {
    breeding: stream('breeding'),
    deaths: stream('deaths'),
    breakouts: stream('breakouts'),
    market: stream('market'),
  };
  const district = DISTRICTS[farm.district];
  const scale = farm.layout.scale;

  // 1. Season and month factor.
  const factors = (env.seasons ?? seasonsOf(farm)).factorsOn(day);
  if (date.date === 1) {
    if (date.month === 6 && day > 0) {
      events.push({ type: 'new-season', label: factors.label, factor: factors.seasonF });
    }
    farm.year.covers.push(coverPct(farm.pasture));
  }

  // 2. Crop events.
  const ctx = cropContextOf(farm);
  for (const event of fieldTick(
    farm.crops,
    farm.pasture,
    ctx,
    day,
    factors.monthF,
    factors.seasonF,
  )) {
    events.push({ type: 'crop', event });
  }

  // 3. Grass growth.
  const plantings = plantingsOn(farm.crops, day, factors.monthF, ctx);
  farm.year.grown += growGrass(farm.pasture, {
    district,
    date,
    seasonF: factors.seasonF,
    monthF: factors.monthF,
    plantings,
    haPerSquare: scale.haPerSquare,
  });

  // 4. Each mob's day.
  let survey = surveyOf(farm);
  const land = landOf(farm, survey, plantings);
  const byId = animalLookup(farm.mobs);
  const deaths: Death[] = [];
  const healthPerHeadYear = HEALTH_COST_PER_HEAD_YEAR[farm.district];
  for (let i = 0; i < farm.mobs.length; i++) {
    const m = farm.mobs[i]!;
    if (weaningDue(m, byId)) {
      const calves = weanMob(m, byId);
      const avgKg = Math.round(calves.reduce((s, c) => s + c.wt, 0) / calves.length);
      const dest = autoWeanDest(farm, survey, plantings, m);
      if (dest === null) {
        events.push({
          type: 'weaned',
          mob: m.id,
          mobName: m.name,
          count: calves.length,
          avgKg,
          into: null,
        });
      } else {
        const gone = new Set(calves.map((c) => c.id));
        m.animals = m.animals.filter((a) => !gone.has(a.id));
        const t = newMob(
          farm,
          { kind: 'paddock', anchor: dest },
          'Weaners ' + farm.nextMobId,
          m.supp,
        );
        t.animals = calves;
        events.push({
          type: 'weaned',
          mob: m.id,
          mobName: m.name,
          count: calves.length,
          avgKg,
          into: { mob: t.id, mobName: t.name, where: t.where, area: areaNameOf(survey, t) },
        });
      }
    }
    const res = simMob(m, {
      place: placeFor(farm, survey, m),
      land,
      day,
      byId,
      ids: farm.animalIds,
      rng,
      healthPerHeadYear,
      totals: farm.year,
    });
    if (res.feedCost > 0) farm.cash -= res.feedCost;
    const area = areaNameOf(survey, m);
    for (const note of res.notes) {
      events.push({ type: 'cattle', mob: m.id, mobName: m.name, area, note });
    }
    for (const g of res.plantingGrazes) {
      const event = squareGrazed(farm.crops, g.square, g.eaten, g.greenEaten, g.greenBefore, day);
      if (event) events.push({ type: 'crop-grazed', mob: m.id, mobName: m.name, event });
    }
    if (res.births.length) {
      events.push({ type: 'births', mob: m.id, mobName: m.name, count: res.births.length });
      for (const c of res.births) result.births.push({ id: c.id, mob: m.id });
    }
    if (res.deaths.length) {
      const by = new Map<DeathCause, number>();
      for (const d of res.deaths) {
        deaths.push(d);
        by.set(d.cause, (by.get(d.cause) ?? 0) + 1);
        result.deaths.push({ id: d.animal.id, kind: d.animal.kind, mob: m.id, cause: d.cause });
      }
      for (const [cause, count] of by) {
        events.push({ type: 'deaths', mob: m.id, mobName: m.name, cause, count });
      }
    }
  }

  // 5. Deaths are settled.
  settleDeaths(farm.mobs, deaths, byId, farm.year);

  // 6. Water use, breakouts and mobs joining.
  if (farm.layout.water.ports.length) {
    const areaOf = survey.topology.areaOf;
    const need = (areaId: number): number => {
      let litres = 0;
      for (const mb of farm.mobs) {
        if (mb.where.kind !== 'paddock' || areaOf[mb.where.anchor] !== areaId) continue;
        for (const a of mb.animals) litres += waterNeedPerHead(a.wt, date.month);
      }
      return litres;
    };
    const drained = drainPortables(farm.layout.water, survey.topology, survey.points, need);
    farm.layout = { ...farm.layout, water: drained.water };
    for (const event of drained.events) {
      events.push({
        type: 'water',
        event,
        paddock: survey.topology.paddocks[survey.topology.paddockOf[event.cell]!]!.name,
      });
    }
    if (drained.changed) {
      survey = surveyOf(farm);
      mergeShared(farm, survey, events);
    } else keepSurvey(farm.layout, survey);
  }

  // Hungry or thirsty mobs push through temporary tape, one segment at a
  // time. Permanent and electric fences hold. The areas are the ones from
  // before today's breakouts.
  let brokeOut = false;
  for (const m of farm.mobs) {
    if (m.where.kind !== 'paddock' || !m.st || !m.animals.length) continue;
    const hungry = m.st.f < BREAKOUT_FEED_SHARE || m.dry > 0;
    if (!hungry || day - (m.lastBreak ?? -99) < BREAKOUT_COOLDOWN_DAYS) continue;
    const chance =
      (m.dry > 0 ? BREAKOUT_CHANCE.thirsty : BREAKOUT_CHANCE.hungry) *
      Math.min(
        BREAKOUT_SIZE.max,
        m.animals.length / BREAKOUT_SIZE.headDivisor + BREAKOUT_SIZE.base,
      );
    if (rng.breakouts.next() > chance) continue;
    const areaId = survey.topology.areaOf[m.where.anchor]!;
    const edges = areaEdges(survey.topology, farm.layout.fences, areaId, [EDGE.tape]);
    if (!edges.length) continue;
    const edge = rng.breakouts.pick(edges);
    const down = knockDownTape(farm.layout, edge);
    if (!down.ok) continue;
    farm.layout = down.layout;
    brokeOut = true;
    m.lastBreak = day;
    events.push({
      type: 'breakout',
      mob: m.id,
      mobName: m.name,
      reason: m.dry > 0 ? 'thirsty' : 'hungry',
      edge,
      area: survey.topology.areas[areaId]!.name,
    });
  }
  if (brokeOut) survey = surveyOf(farm);
  mergeShared(farm, survey, events);

  // 7. Running costs and interest.
  let head = 0;
  for (const m of farm.mobs) head += m.animals.length;
  const run = overheadsPerYear(scale.farmHa) / 365 + (head * healthPerHeadYear) / 365;
  const interest =
    farm.cash < 0 ? (farm.cash * INTEREST.overdraft) / 365 : (farm.cash * INTEREST.credit) / 365;
  farm.cash -= run;
  farm.cash += interest;
  farm.year.running += run;
  farm.year.interest += interest;

  // 8. Grazing plans move mobs here (a later milestone; see plans.ts).

  // 9. The market moves and the day ends.
  farm.day++;
  const source = priceSourceOf(farm.market);
  source.step(farm.market, farm.start, farm.day, rng.market);
  farm.priceHistory.push({ day: farm.day, c: { ...source.prices(farm.market).classes } });
  if (farm.priceHistory.length > PRICE_HISTORY_DAYS) farm.priceHistory.shift();
  farm.mobs = farm.mobs.filter((m) => m.animals.length);

  // 10. The year closes.
  if (farm.day % 365 === 0) events.push({ type: 'year-end', year: closeYear(farm) });

  // 11. Game over: the bank's limit, or the whole farm eaten out for 10
  // days with cattle still on it.
  if (farm.cash <= farm.broke) {
    farm.over = { reason: 'bank', day: farm.day };
    events.push({ type: 'game-over', reason: 'bank' });
  }
  let onPasture = 0;
  for (const m of farm.mobs) if (m.where.kind === 'paddock') onPasture += m.animals.length;
  if (onPasture && !farm.over) {
    const { G, D } = farm.pasture;
    let av = 0;
    for (let i = 0; i < GRID_N; i++) av += Math.max(0, G[i]! + D[i]! - UNGRAZEABLE_KG);
    if (av / GRID_N < EATEN_OUT_KG) {
      farm.noFeedDays++;
      if (farm.noFeedDays === 1) {
        events.push({ type: 'out-of-feed', daysLeft: EATEN_OUT_DAYS - 1 });
      }
    } else farm.noFeedDays = 0;
    if (farm.noFeedDays >= EATEN_OUT_DAYS) {
      farm.over = { reason: 'feed', day: farm.day };
      events.push({ type: 'game-over', reason: 'feed' });
    }
  } else farm.noFeedDays = 0;

  // Save the random streams the farm owns.
  for (const name of Object.keys(PLAY_STREAMS) as PlayStream[]) {
    if (name in rng && !env.rng?.[name]) {
      farm.rng[name] = rng[name as keyof typeof rng].state();
    }
  }
  toInbox(farm, day, events);
  return result;
}
