/**
 * Things to do: what needs the player now, as facts (PRD 5.1; docs/MODEL.md,
 * section 9). Looking is free: nothing here changes the farm, except
 * `pruneTodoOff`, which the day's end runs on its working copy.
 */

import type { Action, ActionType } from '../actions/types';
import type { CalendarDate } from '../calendar';
import { marketClass } from '../cattle/animal';
import { MARK_NOTE_MIN_AGE, calvingFinished } from '../cattle/breeding';
import type { MarketClassId } from '../data/cattle';
import { SPECIES, type SpeciesId } from '../data/species';
import { EDGE, H_EDGES, V_EDGES, type EdgeRef } from '../farm/topology';
import { PORTABLE_CAPACITY_L, PORTABLE_LOW_SHARE } from '../farm/water';
import { bankLevel, headOnFarm } from '../money/bank';
import { FEED_FLOOR_KG_HA } from '../pasture/summary';
import { areaIdOf, nextSaleDay, surveyOf, type SourceEnv } from '../sim/derived';
import { stepOf, templateOf } from '../sim/plans';
import { onRecordPtic } from '../sim/told';
import type { FarmState, PlanWaitReason } from '../sim/state';

/**
 * One thing that needs doing on the farm now, as a fact: what it is, the
 * mob or the place, and the count. It never says what the player should
 * do. `does` names the action that deals with it, and `action` is that
 * action ready to send when it needs no further choice (null when the
 * player has to pick something first, such as a paddock). A fact with no
 * job of its own (the bank, stock at sale weight, a mob's condition, calving,
 * feed under the floor) has `does` null.
 */
export type ThingToDo =
  /**
   * Bull calves of a drop to mark: listed once when most of the drop's bull calves are old
   * enough or 30 days after calving started; once the player has marked in the drop, not again
   * until calving in the mob has finished, then once more if unmarked calves remain.
   */
  (
    | {
        type: 'calves-to-mark';
        mob: number;
        mobName: string;
        area: string | null;
        /** Bull calves in the mob, whatever their age: marking marks them all. */
        count: number;
        /** Unmarked young bulls in the mob, which marking also deals with. */
        youngBulls: number;
        /** Days since the mob's calving started, or null when the farm does not know (calves it started with). */
        sinceCalving: number | null;
      }
    /** A mob on ground with no water. `count` is its head, calves included. Everything dies on day 4. */
    | {
        type: 'no-water';
        mob: number;
        mobName: string;
        area: string | null;
        count: number;
        /** Days in a row without water so far. */
        dryDays: number;
      }
    /**
     * A grazing plan that can not move a mob: the area it wants next has no
     * water, or another mob is in it. `count` is the mob's head. `step`
     * counts the stops of the plan from the first stop of the first leg.
     * The plan tries again each day by itself.
     */
    | {
        type: 'plan-waiting';
        mob: number;
        mobName: string;
        area: string;
        why: PlanWaitReason;
        step: number;
        count: number;
      }
    /** A grain crop ready to harvest. `count` is its hectares. */
    | { type: 'crop-ready'; fieldId: number; sp: SpeciesId; count: number }
    /**
     * A mob in the stock yards, where bought cattle arrive. `count` is its
     * head, calves at foot included, and `days` is how many days it has
     * been there. The player picks the paddock to move it to.
     */
    | {
        type: 'in-yards';
        mob: number;
        mobName: string;
        count: number;
        days: number;
        /** The yards have water. */
        hasWater: true;
        /**
         * What the mob can graze there: almost none. Stock in the yards graze
         * only the square the yards stand on, so a mob left there runs short
         * of feed.
         */
        feed: 'almost-none';
        /** Hectares the mob can graze in the yards: the one square they stand on. */
        grazingHa: number;
      }
    /** A fence segment that has been knocked down. `count` is 1. */
    | { type: 'fence-down'; edge: EdgeRef; fence: 'electric' | 'tape'; count: number }
    /** A portable trough that is empty, or under a quarter full. `count` is the litres left. */
    | { type: 'trough-empty' | 'trough-low'; portId: number; cell: number; count: number }
    /**
     * Cash is below zero (`level` 1), or past three quarters of the way to the
     * bank's limit (`level` 2). `limit` is where the bank takes the farm
     * (negative dollars). `count` is the head on the farm (`headOnFarm`).
     */
    | { type: 'bank'; level: 1 | 2; cash: number; limit: number; count: number }
    /**
     * Head of one market class at sale weight (`MARKET_WEIGHTS`) on the farm and not booked,
     * with the next cattle sale. A fact about the stock, not the date: one item for each class,
     * there while the class has head at sale weight. Breeding females (heifers in a mob with a
     * joining under way, and heifers PTIC on the record) are not counted. `count` is the head.
     * `saleDay` and `date` are null when the next sale is not known (a real-year farm read
     * without its data).
     */
    | {
        type: 'sale-weight';
        cls: MarketClassId;
        saleDay: number | null;
        date: CalendarDate | null;
        /** Days from today to the next sale, or null when it is not known. */
        daysAway: number | null;
        count: number;
      }
    /**
     * A mob's average condition score is under `LOW_CS`. `count` is its head. `adg` is what it
     * gained (or lost, below 0) on its last day, kg a head a day, or null before its first day.
     */
    | {
        type: 'low-condition';
        mob: number;
        mobName: string;
        area: string | null;
        cs: number;
        adg: number | null;
        count: number;
      }
    /** Calving has started in a mob. `count` is the calves born so far. Shown for `CALVING_SHOWN_DAYS`. */
    | {
        type: 'calving';
        mob: number;
        mobName: string;
        area: string | null;
        days: number;
        count: number;
      }
    /** A mob grazes an area with under `FEED_FLOOR_KG_HA` of feed. `count` is its head. */
    | {
        type: 'feed-floor';
        mob: number;
        mobName: string;
        area: string;
        massKgHa: number;
        floorKgHa: number;
        count: number;
      }
  ) & {
    does: ActionType | null;
    action: Action | null;
  };

/** A mob whose average condition score is under this is listed. A stand-in. */
export const LOW_CS = 2.5;
/** Marking is listed this many days after a mob's calving started, if most of the drop is not old enough by then. */
export const MARK_AFTER_CALVING_DAYS = 30;
/** Calving is listed for this many days after it starts. Marking takes over from then. */
export const CALVING_SHOWN_DAYS = MARK_AFTER_CALVING_DAYS;
/** The market classes a sale-weight item counts: steers and heifers past weaner weight. */
const AT_SALE_WEIGHT: readonly MarketClassId[] = ['feed', 'heavy', 'heifer'];

/** A stable key for a thing to do, so the browser can name it and the server can find it again. */
export function todoKey(t: ThingToDo): string {
  switch (t.type) {
    case 'calves-to-mark':
    case 'no-water':
    case 'plan-waiting':
    case 'in-yards':
    case 'low-condition':
    case 'feed-floor':
    case 'calving':
      return `${t.type}:${t.mob}`;
    case 'crop-ready':
      return `${t.type}:${t.fieldId}`;
    case 'fence-down':
      return `${t.type}:${t.edge.line}${t.edge.index}`;
    case 'trough-empty':
    case 'trough-low':
      return `${t.type}:${t.portId}`;
    case 'bank':
      return `${t.type}:${t.level}`;
    case 'sale-weight':
      return `${t.type}:${t.cls}`;
  }
}

/**
 * What needs doing on the farm now, for the banner and the mob card, as
 * facts. It uses only what the model already knows and the player can see:
 * the calves, a mob's water, a crop's maturity, fences that are down, the
 * level in a portable trough, cash against the bank's limit, stock at sale weight,
 * a mob's condition, calving and the feed where a mob grazes. Weaning is
 * not listed, because the model weans a drop by itself when it is due.
 * Weaning earlier is the player's choice, offered on the mob card. In the
 * order: water, money, stock, crops, fences.
 *
 * Each thing is there while it is true, as one item; it is never raised
 * again as a new line. Things the player has put away (`dismissTodo`) are
 * left out while they stay true. A real-year farm needs the real data in
 * `env` for the sale day; without it, the sale is left out.
 */
export function thingsToDo(farm: FarmState, env: SourceEnv = {}): ThingToDo[] {
  const all = allThingsToDo(farm, env);
  const off = farm.todoOff;
  if (!off?.length) return all;
  const hidden = new Set(off);
  return all.filter((t) => !hidden.has(todoKey(t)));
}

/** Every thing to do that is true now, put away or not. */
export function allThingsToDo(farm: FarmState, env: SourceEnv = {}): ThingToDo[] {
  const out: ThingToDo[] = [];
  if (farm.over) return out;
  const survey = surveyOf(farm);
  const areaName = (id: number): string | null => (id < 0 ? null : survey.topology.areas[id]!.name);

  // Water.
  for (const m of farm.mobs) {
    if (m.where.kind !== 'paddock' || !m.animals.length) continue;
    const id = areaIdOf(survey, m);
    if (survey.points.areaTroughs[id]!.length) continue;
    out.push({
      type: 'no-water',
      mob: m.id,
      mobName: m.name,
      area: areaName(id),
      count: m.animals.length,
      dryDays: m.dry,
      does: 'moveMob',
      action: null,
    });
  }
  // Plans that are waiting. A paused plan is not waiting: it is stopped.
  for (const m of farm.mobs) {
    const run = m.plan;
    if (!run?.waiting || run.paused || !m.animals.length) continue;
    const tpl = templateOf(farm, run);
    if (!tpl) continue;
    const { target, why } = run.waiting;
    const next = stepOf(tpl, run.leg, run.idx);
    out.push({
      type: 'plan-waiting',
      mob: m.id,
      mobName: m.name,
      area: survey.topology.areas[survey.topology.areaOf[target]!]!.name,
      why,
      step: next,
      count: m.animals.length,
      does: 'pausePlan',
      action: { type: 'pausePlan', mob: m.id },
    });
  }
  for (const pt of farm.layout.water.ports) {
    // The model's own low-water mark: under a quarter full.
    if (pt.level >= PORTABLE_CAPACITY_L * PORTABLE_LOW_SHARE) continue;
    out.push({
      type: pt.level <= 0 ? 'trough-empty' : 'trough-low',
      portId: pt.id,
      cell: pt.cell,
      count: Math.max(0, pt.level),
      does: 'refillPortable',
      action: { type: 'refillPortable', port: pt.id },
    });
  }

  // Money: cash against the bank's limit.
  const level = bankLevel(farm);
  if (level > 0) {
    out.push({
      type: 'bank',
      level: level as 1 | 2,
      cash: farm.cash,
      limit: farm.broke,
      count: headOnFarm(farm),
      does: null,
      action: null,
    });
  }

  // Stock at sale weight that is not booked, by class, with the next sale.
  {
    const booked = new Set<number>();
    for (const b of farm.saleBookings) for (const id of b.animalIds) booked.add(id);
    const byClass = new Map<MarketClassId, number>();
    for (const m of farm.mobs) {
      for (const a of m.animals) {
        if (booked.has(a.id)) continue;
        // Breeding females are not sale stock: heifers joined or kept in a joining mob.
        if (a.kind === 'heifer' && (m.join !== null || onRecordPtic(a))) continue;
        const cls = marketClass(a);
        if (AT_SALE_WEIGHT.includes(cls)) byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
      }
    }
    if (byClass.size) {
      const sale =
        farm.seasons.kind !== 'real' || env.data ? nextSaleDay(farm, env, farm.day) : null;
      for (const cls of AT_SALE_WEIGHT) {
        const count = byClass.get(cls);
        if (!count) continue;
        out.push({
          type: 'sale-weight',
          cls,
          saleDay: sale ? sale.day : null,
          date: sale ? sale.date : null,
          daysAway: sale ? sale.day - farm.day : null,
          count,
          does: null,
          action: null,
        });
      }
    }
  }

  // Stock.
  for (const m of farm.mobs) {
    if (!m.animals.length) continue;
    const areaId = areaIdOf(survey, m);
    const area = areaName(areaId);
    if (m.where.kind === 'yards') {
      out.push({
        type: 'in-yards',
        mob: m.id,
        mobName: m.name,
        count: m.animals.length,
        days: Math.max(0, farm.day - (m.where.since ?? farm.day)),
        hasWater: true,
        feed: 'almost-none',
        grazingHa: farm.layout.scale.haPerSquare,
        does: 'moveMob',
        action: null,
      });
    }
    let calves = 0;
    let bullCalves = 0;
    let youngBulls = 0;
    let adults = 0;
    let cond = 0;
    for (const a of m.animals) {
      if (a.kind === 'calf') {
        calves++;
        if (a.sex === 'M') bullCalves++;
      } else {
        adults++;
        cond += a.cond;
        if (a.sex === 'M' && a.young) youngBulls++;
      }
    }
    const since = m.calvNote === null || m.calvNote === undefined ? null : farm.day - m.calvNote;
    // Calving, for the first weeks of a drop: then marking takes over.
    if (since !== null && since >= 0 && since < CALVING_SHOWN_DAYS && calves > 0) {
      const born = m.animals.filter((a) => a.kind === 'calf' && a.age <= since).length;
      out.push({
        type: 'calving',
        mob: m.id,
        mobName: m.name,
        area,
        days: since,
        count: born,
        does: null,
        action: null,
      });
    }
    // Marking: this drop's calves only (born since calving started; all calves when the farm
    // has no calving day for them). Last drop's calves, marked or not, never bring it back.
    const inDrop = (a: { kind: string; age: number }): boolean =>
      a.kind === 'calf' && (since === null || since < 0 || a.age <= since);
    let dropBulls = 0;
    let dropOldEnough = 0;
    let dropMarked = 0;
    for (const a of m.animals) {
      if (!inDrop(a)) continue;
      if (a.sex === 'M') {
        dropBulls++;
        if (a.age >= MARK_NOTE_MIN_AGE) dropOldEnough++;
      } else if (a.sex === 'S') dropMarked++;
    }
    // Before any marking in the drop: once most of its bull calves are old enough, or 30 days
    // after calving started. After the player has marked in the drop: not again until calving
    // in the mob has finished, then once more if unmarked calves remain. At most two a drop.
    const dropReady =
      dropBulls > 0 &&
      (dropMarked > 0
        ? calvingFinished(m, farm.day)
        : dropOldEnough * 2 > dropBulls || (since !== null && since >= MARK_AFTER_CALVING_DAYS));
    if (dropReady) {
      out.push({
        type: 'calves-to-mark',
        mob: m.id,
        mobName: m.name,
        area,
        count: bullCalves,
        youngBulls,
        sinceCalving: since,
        does: 'markCalves',
        action: { type: 'markCalves', mob: m.id },
      });
    }
    // Condition: the mob card's own figure (the mob's last day), or the animals' average before it.
    const cs = m.st ? m.st.cs : adults ? cond / adults : null;
    if (cs !== null && adults > 0 && cs < LOW_CS) {
      out.push({
        type: 'low-condition',
        mob: m.id,
        mobName: m.name,
        area,
        cs,
        adg: m.st ? m.st.adg : null,
        count: m.animals.length,
        does: null,
        action: null,
      });
    }
    // Feed under the floor where the mob grazes.
    if (m.where.kind === 'paddock' && areaId >= 0) {
      const cells = survey.topology.areas[areaId]!.cells;
      let mass = 0;
      for (const i of cells) mass += farm.pasture.G[i]! + farm.pasture.D[i]!;
      mass /= cells.length;
      if (mass < FEED_FLOOR_KG_HA) {
        out.push({
          type: 'feed-floor',
          mob: m.id,
          mobName: m.name,
          area: area!,
          massKgHa: mass,
          floorKgHa: FEED_FLOOR_KG_HA,
          count: m.animals.length,
          does: null,
          action: null,
        });
      }
    }
  }

  // Crops.
  for (const f of farm.crops.fields) {
    const sp = SPECIES[f.sp];
    if (sp.type !== 'crop' || farm.day - f.sown < sp.mature!) continue;
    out.push({
      type: 'crop-ready',
      fieldId: f.id,
      sp: f.sp,
      count: f.cells.length * farm.layout.scale.haPerSquare,
      does: 'harvest',
      action: { type: 'harvest', field: f.id },
    });
  }

  // Fences that are down.
  const down = (line: 'h' | 'v', codes: Uint8Array, n: number): void => {
    for (let index = 0; index < n; index++) {
      const c = codes[index];
      if (c !== EDGE.electricDown && c !== EDGE.tapeDown) continue;
      const edge: EdgeRef = { line, index };
      out.push({
        type: 'fence-down',
        edge,
        fence: c === EDGE.electricDown ? 'electric' : 'tape',
        count: 1,
        does: 'fixFence',
        action: { type: 'fixFence', edge },
      });
    }
  };
  down('h', farm.layout.fences.hE, H_EDGES);
  down('v', farm.layout.fences.vE, V_EDGES);
  return out;
}

/**
 * Cut the list of things put away back to those still true, so a thing
 * that stops being true and starts again shows again. Run at the end of
 * every day. Changes the farm it is given (a working copy).
 */
export function pruneTodoOff(farm: FarmState, env: SourceEnv = {}): void {
  const off = farm.todoOff;
  if (!off?.length) return;
  const live = new Set(allThingsToDo(farm, env).map(todoKey));
  const kept = off.filter((k) => live.has(k));
  if (kept.length) farm.todoOff = kept;
  else delete farm.todoOff;
}
