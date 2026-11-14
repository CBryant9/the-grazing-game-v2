/**
 * Three scripted players for the 180-day play test (BUILD_PLAN row 1.5: "A
 * test plays ordinary, careless and absent players for 180 days and reports
 * who goes under and why").
 *
 * Each player is a plain function over the engine's public API
 * (`applyAction`, `endDay`, `thingsToDo`, `marketView`, `plansView` and the
 * summaries). Nothing here reaches into the farm's own state to change it,
 * and nothing is random: the same farm gives the same play.
 *
 * The rules, written down (a player does nothing that is not listed):
 *
 *   ABSENT. Does nothing. Only Next day, every day.
 *
 *   CARELESS. Looks at the farm once every 21 days (days 0, 21, 42 and so
 *   on). On a day it looks it
 *     1. does each thing in `thingsToDo` that has an action ready to send
 *        (mark calves, harvest, refill a portable trough, fix a fence), and
 *     2. moves any mob that has no water to a paddock with water.
 *   On every other day it only presses Next day.
 *
 *   ORDINARY. Every day, in this order:
 *     1. On a sale day, sells every steer of 300 kg or more.
 *     2. Does each thing in `thingsToDo` that has an action ready to send,
 *        except pausing a plan (the plans are the player's own).
 *     3. Moves any mob that has no water to a paddock with water.
 *     4. Moves any mob in the stock yards out to a paddock with water.
 *     5. Puts each mob that has no plan, or a paused plan, on a rotation
 *        plan: every paddock with water, in order, a move every 7 days,
 *        for ever. It starts the mob on the stop it is standing on, or the
 *        first stop that will take it.
 *   Then Next day. It never builds, buys, weans or changes a supplement.
 *
 * "A paddock with water" is a grazing area with a trough, and a paddock to
 * move to is the watered area that has no mob in it with the most feed, the
 * lowest area number first if there is a tie. If every watered area has a
 * mob in it, the one with the most feed.
 *
 * The facts for a run (`RunFacts`) are what the play test reports. They
 * judge nothing.
 *
 * Test use only. Nothing in `src` may import this file.
 */

import type { DistrictId } from '@gg/shared';
import {
  applyAction,
  createFarm,
  endDay,
  farmHash,
  marketView,
  netWorth,
  placeAnchor,
  plansView,
  surveyOf,
  thingsToDo,
  type Action,
  type FarmState,
  type PlanSpec,
} from '../src/index';

export type PlayerName = 'absent' | 'careless' | 'ordinary';
export const PLAYER_NAMES: readonly PlayerName[] = ['absent', 'careless', 'ordinary'];

/** One player's day: what it does at first light, before Next day. */
export type Player = (farm: FarmState) => FarmState;

/** Do an action if it can be done. A refusal changes nothing and is not an error. */
function tryDo(farm: FarmState, action: Action): FarmState {
  const done = applyAction(farm, action);
  return done.ok ? done.farm : farm;
}

/** The mobs on pasture whose grazing area has no water, now. */
const dryMobs = (farm: FarmState): number[] =>
  thingsToDo(farm).flatMap((t) => (t.type === 'no-water' ? [t.mob] : []));

/** The squares to move a mob to: the watered area with no mob in it with the most feed. */
function waterSquare(farm: FarmState, self: number): number | null {
  const s = surveyOf(farm);
  const topo = s.topology;
  const occupied = new Set<number>();
  for (const m of farm.mobs) {
    if (m.id !== self && m.where.kind === 'paddock' && m.animals.length) {
      occupied.add(topo.areaOf[m.where.anchor]!);
    }
  }
  const G = farm.pasture.G;
  const D = farm.pasture.D;
  let best: { id: number; busy: number; feed: number } | null = null;
  for (const a of topo.areas) {
    if (!s.points.areaTroughs[a.id]!.length) continue;
    let feed = 0;
    for (const c of a.cells) feed += G[c]! + D[c]!;
    feed /= a.cells.length;
    const busy = occupied.has(a.id) ? 1 : 0;
    if (!best || busy < best.busy || (busy === best.busy && feed > best.feed)) {
      best = { id: a.id, busy, feed };
    }
  }
  return best ? placeAnchor(s, best.id) : null;
}

/** Move a mob to a paddock with water, if there is one. */
function toWater(farm: FarmState, mob: number): FarmState {
  const cell = waterSquare(farm, mob);
  return cell === null ? farm : tryDo(farm, { type: 'moveMob', mob, to: { cell } });
}

/** Each thing to do that has an action ready to send, except those the caller leaves out. */
function readyActions(farm: FarmState, skip: ReadonlySet<string> = new Set()): Action[] {
  return thingsToDo(farm).flatMap((t) => (t.action && !skip.has(t.action.type) ? [t.action] : []));
}

const absent: Player = (farm) => farm;

const careless: Player = (farm) => {
  if (farm.day % 21 !== 0) return farm;
  let f = farm;
  for (const a of readyActions(f)) f = tryDo(f, a);
  for (const mob of dryMobs(f)) f = toWater(f, mob);
  return f;
};

/** Steers at or over this weight are sold on a sale day, kg (a weaner steer reaches it in a few months). */
export const ORDINARY_SELL_KG = 300;
/** Days between the rotation's moves. */
export const ORDINARY_EVERY_DAYS = 7;

const ordinary: Player = (farm) => {
  let f = farm;
  // 1. A sale day: sell the steers that are heavy enough.
  if (marketView(f).isSaleDay) {
    const ids = f.mobs.flatMap((m) =>
      m.animals.filter((a) => a.kind === 'steer' && a.wt >= ORDINARY_SELL_KG).map((a) => a.id),
    );
    if (ids.length) f = tryDo(f, { type: 'sellAnimals', ids });
  }
  // 2. What needs doing, where the action is ready.
  for (const a of readyActions(f, new Set(['pausePlan']))) f = tryDo(f, a);
  // 3. Every mob on water.
  for (const mob of dryMobs(f)) f = toWater(f, mob);
  // 4. Bought stock out of the yards.
  for (const m of f.mobs.filter((x) => x.where.kind === 'yards')) f = toWater(f, m.id);
  // 5. A rotation plan for each mob without one.
  for (const m of f.mobs.slice()) {
    if (m.where.kind !== 'paddock' || !m.animals.length) continue;
    if (m.plan && !m.plan.paused) continue;
    f = planMob(f, m.id);
  }
  return f;
};

/** Put a mob on the rotation. The first plan is made from the paddocks with water; later mobs use it. */
function planMob(farm: FarmState, mob: number): FarmState {
  const s = surveyOf(farm);
  const topo = s.topology;
  const have = farm.plans[0];
  const stops = have
    ? have.legs.flatMap((l) => l.stops)
    : topo.areas.filter((a) => s.points.areaTroughs[a.id]!.length).map((a) => placeAnchor(s, a.id));
  if (!stops.length) return farm;
  const plan: PlanSpec | { template: number } = have
    ? { template: have.id }
    : {
        name: 'Rotation',
        legs: [{ stops, rule: { mode: 'days', every: ORDINARY_EVERY_DAYS }, rounds: 0 }],
        after: 'repeat',
      };
  const m = farm.mobs.find((x) => x.id === mob)!;
  const here = m.where.kind === 'paddock' ? topo.areaOf[m.where.anchor]! : -1;
  // Start on the stop the mob is standing on, then the others in order.
  const order = stops.map((_, i) => i);
  const at = stops.findIndex((c) => topo.areaOf[c] === here);
  if (at > 0) order.unshift(...order.splice(at, 1));
  for (const step of order) {
    const done = applyAction(farm, { type: 'setPlan', mob, plan, step });
    if (done.ok) return done.farm;
  }
  return farm;
}

/** The three players, by name. Each does its first-light work on a farm and gives the farm after it. */
export const PLAYERS: Record<PlayerName, Player> = { absent, careless, ordinary };

/** What a run came to. Facts only. */
export interface RunFacts {
  district: DistrictId;
  seed: number;
  player: PlayerName;
  days: number;
  headStart: number;
  headEnd: number;
  /** Deaths over the run, by cause. */
  deaths: Record<string, number>;
  /** Live weight gained over the run, kg, as the cattle step counts it. */
  gainKg: number;
  cashStart: number;
  cashEnd: number;
  worthStart: number;
  worthEnd: number;
  /** Set when the game ended: why, and the farm day. */
  over: { reason: string; day: number } | null;
  /** Days on which a mob was standing on ground with no water when the player had finished and pressed Next day. */
  dryDays: number;
  /** Things to do still listed at the end. */
  undone: number;
  /** Plan moves made, and plans waiting at the end. */
  planMoves: number;
  /** The farm at the end. */
  farm: FarmState;
  /** A hash of the farm at the end, for "the same run gives the same result". */
  hash: string;
}

const headOf = (farm: FarmState): number =>
  farm.mobs.reduce((n, m) => n + m.animals.length, 0) +
  farm.arrivals.reduce((n, a) => n + a.animals.length, 0);

const gainOf = (farm: FarmState): number =>
  farm.year.gain + farm.years.reduce((t, y) => t + y.gain, 0);

/** Play one farm for `days` days with one player. */
export function playRun(
  district: DistrictId,
  seed: number,
  player: PlayerName,
  days = 180,
): RunFacts {
  let farm = createFarm({
    seed,
    district,
    size: 'medium',
    start: { year: 2023, month: 8 },
    startType: 'running',
    difficulty: 'medium',
  });
  const act = PLAYERS[player];
  const facts = {
    headStart: headOf(farm),
    cashStart: farm.cash,
    worthStart: netWorth(farm),
    gainStart: gainOf(farm),
    deaths: {} as Record<string, number>,
    dryDays: 0,
    planMoves: 0,
  };
  let ran = 0;
  while (ran < days && !farm.over) {
    farm = act(farm);
    if (thingsToDo(farm).some((t) => t.type === 'no-water')) facts.dryDays++;
    const next = endDay(farm);
    for (const d of next.day.deaths) facts.deaths[d.cause] = (facts.deaths[d.cause] ?? 0) + 1;
    for (const e of next.day.events) if (e.type === 'plan-moved') facts.planMoves++;
    farm = next.farm;
    ran++;
  }
  return {
    district,
    seed,
    player,
    days: ran,
    headStart: facts.headStart,
    headEnd: headOf(farm),
    deaths: facts.deaths,
    gainKg: gainOf(farm) - facts.gainStart,
    cashStart: facts.cashStart,
    cashEnd: farm.cash,
    worthStart: facts.worthStart,
    worthEnd: netWorth(farm),
    over: farm.over ? { reason: farm.over.reason, day: farm.over.day } : null,
    dryDays: facts.dryDays,
    undone: thingsToDo(farm).length,
    planMoves: facts.planMoves,
    farm,
    hash: farmHash(farm),
  };
}

const dollars = (v: number): string =>
  (v < 0 ? '-$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-AU');

const deathsText = (d: Record<string, number>): string => {
  const parts = Object.entries(d)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cause, n]) => `${n} ${cause}`);
  return parts.length ? parts.join(', ') : 'none';
};

/** The facts for every run as a Markdown table, one row for each run. */
export function factsTable(runs: readonly RunFacts[]): string {
  const rows = runs.map((r) => {
    const ended = r.over ? `${r.over.reason}, day ${r.over.day}` : `no, ${r.days} days`;
    return [
      r.district,
      String(r.seed),
      r.player,
      `${r.headStart} to ${r.headEnd}`,
      deathsText(r.deaths),
      `${Math.round(r.gainKg).toLocaleString('en-AU')} kg`,
      `${dollars(r.cashStart)} to ${dollars(r.cashEnd)}`,
      `${dollars(r.worthStart)} to ${dollars(r.worthEnd)}`,
      ended,
      String(r.dryDays),
      String(r.undone),
      String(r.planMoves),
      waitingText(r.farm),
    ].join(' | ');
  });
  return [
    '| District | Seed | Player | Head, start to end | Deaths | Live weight gained | Cash, start to end | Net worth, start to end | Game ended | Days a mob was on dry ground at the end of the day | Things to do left | Plan moves made | Plans waiting at the end |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r} |`),
  ].join('\n');
}

/** The plans waiting at the end, with the reason, for the table: "none", or "1 no-water". */
export function waitingText(farm: FarmState): string {
  const why = plansView(farm).flatMap((p) =>
    p.mobs.flatMap((m) => (m.waiting ? [m.waiting.why] : [])),
  );
  if (!why.length) return 'none';
  const by: Record<string, number> = {};
  for (const w of why) by[w] = (by[w] ?? 0) + 1;
  return Object.entries(by)
    .map(([w, n]) => `${n} ${w}`)
    .join(', ');
}

/** The number of plans waiting at the end, for the report. */
export const plansWaiting = (farm: FarmState): number =>
  plansView(farm).reduce((n, p) => n + p.mobs.filter((m) => m.waiting).length, 0);
