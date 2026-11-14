/**
 * Moving sheep (milestone 2.3, third pass): a whole mob or part of one to a
 * paddock, and grazing plans, through the same player actions as cattle,
 * with the species rules:
 *
 * - Sheep are never put where cattle graze (`cattle-there`), and cattle are
 *   never put where sheep graze (`sheep-there`, actions/apply.ts).
 * - Any paddock may take sheep. What holds them there is the fence: netting,
 *   gates and the boundary hold them; cattle fences (permanent, electric,
 *   tape) do not. Sheep leave through a cattle fence only for a reason, one
 *   fence at a time, as hungry cattle push through tape: when they are short
 *   of feed or water (`sheepBreakouts` in the tick).
 * - Sheep put with a sheep mob join it.
 * - A move costs the player's day as a cattle move does (day/spec.ts).
 */

import type { Action, ActionRefusal, ActionRefusalReason } from '../actions/types';
import type { GrazingLand } from '../cattle/types';
import type { Survey } from '../farm/layout';
import { areaIdOf, grazingArea, placeAnchor, surveyOf } from '../sim/derived';
import type { FarmEvent, TickEvent } from '../sim/events';
import { newRun, perDay, positionOf, templateOf } from '../sim/plans';
import type { FarmState } from '../sim/state';
import { sheepClassOf } from './energy';
import { createSheepMob, mergeSheepShared, sheepMobsOf } from './farm';
import { headOf, lambsByDam, splitOff } from './simFlock';
import type { SheepClass, SheepMob } from './types';

const refuse = (reason: ActionRefusalReason, message: string): ActionRefusal => ({
  ok: false,
  reason,
  message,
});

type Out = ActionRefusal | null;

const sheepMob = (farm: FarmState, id: number): SheepMob | undefined =>
  sheepMobsOf(farm).find((m) => m.id === id);

/** The grazing area a square is in, or a refusal; refused where cattle graze. */
function sheepTarget(farm: FarmState, s: Survey, cell: unknown): number | ActionRefusal {
  if (typeof cell !== 'number' || !Number.isInteger(cell)) {
    return refuse('bad-request', 'That square is off the farm.');
  }
  const areaId = s.topology.areaOf[cell];
  if (areaId === undefined || areaId < 0)
    return refuse('bad-request', 'That square is off the farm.');
  const cattle = farm.mobs.some(
    (m) =>
      m.where.kind === 'paddock' &&
      m.animals.length &&
      s.topology.areaOf[m.where.anchor] === areaId,
  );
  if (cattle) {
    return refuse(
      'cattle-there',
      'Cattle are grazing there. Cattle and sheep run in separate paddocks.',
    );
  }
  return areaId;
}

/** Say where sheep ended up, and warn when the area has no water. */
function arrived(s: Survey, m: SheepMob, head: number, events: FarmEvent[]): void {
  const id = areaIdOf(s, m);
  const area = s.topology.areas[id]!;
  events.push({ type: 'sheep-moved', mob: m.id, mobName: m.name, head, area: area.name });
  if (!s.points.areaTroughs[id]!.length) {
    events.push({ type: 'no-water', mob: m.id, mobName: m.name, area: area.name });
  }
}

/** Move a whole sheep mob to a paddock. It pauses the mob's plan, as a hand move of cattle does. */
export function moveSheep(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'moveSheep' }>,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  const s = surveyOf(farm);
  const to = sheepTarget(farm, s, a.to?.cell);
  if (typeof to !== 'number') return to;
  if (m.where.kind === 'paddock' && areaIdOf(s, m) === to) {
    return refuse('already-there', 'The mob is already in that paddock.');
  }
  m.where = { kind: 'paddock', anchor: placeAnchor(s, to) };
  if (m.plan) m.plan.paused = true;
  const head = headOf(m.sheep);
  mergeSheepShared(farm, s, events as TickEvent[]);
  const now = sheepMobsOf(farm).find((x) => x.sheep.some((y) => m.sheep.includes(y))) ?? m;
  arrived(s, now, head, events);
  return null;
}

/**
 * Move part of a sheep mob, by class and head, to a paddock: a new mob, or
 * joined to the sheep there. Ewes with lambs at foot take their share of
 * the lambs; lambs at foot do not go without their ewes.
 */
export function moveSheepPart(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'moveSheepPart' }>,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  if (!Number.isInteger(a.qty) || a.qty < 1) return refuse('bad-request', 'Pick how many to move.');
  if (a.cls === 'lamb') {
    return refuse('bad-request', 'Lambs at foot go with their ewes. Wean them to move them apart.');
  }
  const s = surveyOf(farm);
  const to = sheepTarget(farm, s, a.to?.cell);
  if (typeof to !== 'number') return to;
  if (m.where.kind === 'paddock' && areaIdOf(s, m) === to) {
    return refuse('already-there', 'Those sheep are already in that paddock.');
  }
  const pool = m.sheep.filter(
    (x) => x.weaned && x.n > 0 && sheepClassOf(x) === (a.cls as SheepClass),
  );
  if (!pool.length)
    return refuse('nothing-to-move', 'There are no sheep of that class in the mob.');
  const lambsOf = lambsByDam(m.sheep);
  const t = createSheepMob(
    farm.nextMobId++,
    '',
    { kind: 'paddock', anchor: placeAnchor(s, to) },
    farm.district,
  );
  t.name = m.name + ' part';
  t.joinOn = { ...m.joinOn };
  t.shearOn = m.shearOn ? { ...m.shearOn } : null;
  t.crutchOn = m.crutchOn ? { ...m.crutchOn } : null;
  t.feed = m.feed;
  let left = a.qty;
  let head = 0;
  for (const x of pool) {
    if (left <= 0) break;
    const k = Math.min(left, x.n);
    left -= k;
    head += k;
    const part = k >= x.n ? x : splitOff(x, k, farm.animalIds);
    if (part !== x) x.n -= k;
    t.sheep.push(part);
    // Their share of the lambs at foot goes with them, still with them.
    if (lambsOf.has(x.id)) {
      for (const l of m.sheep) {
        if (l.weaned || l.dam !== x.id || l.n <= 0) continue;
        const c = part === x ? l.n : Math.round((l.n * k) / (x.n + k));
        if (c <= 0) continue;
        const lp = c >= l.n ? l : splitOff(l, c, farm.animalIds);
        if (lp !== l) l.n -= c;
        lp.dam = part.id;
        t.sheep.push(lp);
      }
    }
  }
  const moved = new Set(t.sheep);
  m.sheep = m.sheep.filter((x) => !moved.has(x) && x.n > 0);
  const state = farm.sheep!;
  state.mobs.push(t);
  state.mobs = state.mobs.filter((x) => x.sheep.length);
  mergeSheepShared(farm, s, events as TickEvent[]);
  const now = sheepMobsOf(farm).find((x) => x.sheep.some((y) => moved.has(y))) ?? t;
  arrived(s, now, head, events);
  return null;
}

/** Put a sheep mob on a grazing plan template, from a step (the first if left out). */
export function setSheepPlan(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'setSheepPlan' }>,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  const tpl = farm.plans.find((p) => p.id === a.template);
  if (!tpl) return refuse('no-such-plan', 'There is no such plan.');
  const pos = positionOf(tpl, a.step ?? 0);
  if (!pos) return refuse('bad-request', 'That step is not in the plan.');
  const s = surveyOf(farm);
  const cell = tpl.legs[pos.leg]!.stops[pos.idx]!;
  const to = sheepTarget(farm, s, cell);
  if (typeof to !== 'number') return to;
  m.plan = newRun(farm, tpl, pos.leg, pos.idx);
  if (areaIdOf(s, m) !== to) {
    m.where = { kind: 'paddock', anchor: placeAnchor(s, to) };
    mergeSheepShared(farm, s, events as TickEvent[]);
  }
  events.push({ type: 'sheep-plan-set', mob: m.id, mobName: m.name, template: tpl.id });
  return null;
}

/** Take a sheep mob off its plan. */
export function clearSheepPlan(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'clearSheepPlan' }>,
): Out {
  const m = sheepMob(farm, a.mob);
  if (!m) return refuse('no-such-mob', 'That sheep mob is not on the farm.');
  if (!m.plan) return refuse('no-plan', 'The mob has no plan.');
  delete m.plan;
  events.push({ type: 'sheep-plan-cleared', mob: m.id, mobName: m.name });
  return null;
}

/** Feed on an area, kg DM/ha (green plus dead), as the cattle plans read it. */
function areaMass(farm: FarmState, cells: readonly number[]): number {
  const { G, D } = farm.pasture;
  let t = 0;
  for (const i of cells) t += G[i]! + D[i]!;
  return t / cells.length;
}

/**
 * Step 8b of the tick: sheep plans move sheep mobs, by the cattle plans'
 * rules (after N days on a stop, or when grazed down to a figure, or at a day
 * limit). A rule of several moves a day moves once a day for sheep (a
 * simplification). A stop with no water, or with cattle in it, waits, told
 * once a stop. A farm with no sheep plans skips this.
 */
export function runSheepPlans(
  farm: FarmState,
  survey: Survey,
  land: GrazingLand,
  events: TickEvent[],
): void {
  void land;
  for (const m of sheepMobsOf(farm)) {
    const run = m.plan;
    if (!run || run.paused || m.where.kind !== 'paddock' || !m.sheep.length) continue;
    const tpl = templateOf(farm, run);
    const leg = tpl?.legs[run.leg];
    if (!tpl || !leg) continue;
    const days = farm.day + 1 - run.moved;
    const area = survey.topology.areas[areaIdOf(survey, m)]!;
    const rule = leg.rule;
    const due =
      rule.mode === 'days'
        ? days >= Math.max(1, rule.every) || perDay(rule) > 1
        : days >= 1 &&
          (areaMass(farm, area.cells) <= rule.kg || (rule.maxDays > 0 && days >= rule.maxDays));
    if (!due) continue;
    let ni = run.idx + 1;
    let li = run.leg;
    if (ni >= leg.stops.length) {
      ni = 0;
      run.rounds++;
      if (leg.rounds > 0 && run.rounds >= leg.rounds) {
        li++;
        if (li >= tpl.legs.length) {
          if (tpl.after === 'repeat') li = 0;
          else {
            delete m.plan;
            events.push({ type: 'sheep-plan-finished', mob: m.id, mobName: m.name });
            continue;
          }
        }
      }
    }
    const target = tpl.legs[li]!.stops[ni]!;
    const to = survey.topology.areaOf[target]!;
    const cattle = farm.mobs.some(
      (x) =>
        x.where.kind === 'paddock' &&
        x.animals.length &&
        survey.topology.areaOf[x.where.anchor] === to,
    );
    const water = grazingArea(survey, to).hasWater;
    if (cattle || !water) {
      if (run.waiting?.target !== target) {
        run.waiting = { target, why: cattle ? 'cattle-there' : 'no-water' };
        events.push({
          type: 'sheep-plan-waiting',
          mob: m.id,
          mobName: m.name,
          why: run.waiting.why,
          area: survey.topology.areas[to]!.name,
        });
      }
      continue;
    }
    const from = area.name;
    m.where = { kind: 'paddock', anchor: target };
    run.leg = li;
    run.idx = ni;
    run.waiting = null;
    run.moved = farm.day + 1;
    run.moves++;
    events.push({
      type: 'sheep-plan-moved',
      mob: m.id,
      mobName: m.name,
      from,
      to: survey.topology.areas[to]!.name,
    });
  }
  mergeSheepShared(farm, survey, events);
}
