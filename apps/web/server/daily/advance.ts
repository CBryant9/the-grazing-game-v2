import 'server-only';
import {
  endDay,
  plansView,
  sheepPlansDue,
  worksOn,
  type DayEnd,
  type FarmState,
  type SourceEnv,
} from '@gg/engine';
import type { PlanDueWire } from '../../lib/game/types';

/*
 * One Daily Farm night, and the grazing plan moves that no hand will make (PRD 5.11 and 5.15).
 *
 * The night is the engine's own `endDay`: the tick, then first light with the hands' standing
 * duties. Nothing is added to the rules. The one thing the server decides is who moves a mob on
 * a grazing plan. The engine moves plans in the tick for every farm. On Daily Farm that is true
 * only when a hand works that day. With no hand, the night runs with plan moves left to the
 * player (the engine's `plansByHand`): every plan, cattle and sheep, stays live and counts the
 * night's grazing in its report, but nothing moves until the player does it from the plan card.
 */

/** True when a hand works on the farm's current day: the engine's own rule, which also credits the plan move in the worker report. */
export function handWorksToday(farm: FarmState): boolean {
  return (farm.labour?.hands ?? []).some((h) => worksOn(farm, h, farm.day));
}

/** Mobs on a live plan on pasture, cattle and sheep. */
function livePlans(farm: FarmState): number {
  let n = 0;
  for (const m of farm.mobs) if (m.plan && !m.plan.paused && m.where.kind === 'paddock') n++;
  for (const m of farm.sheep?.mobs ?? []) {
    if (m.plan && !m.plan.paused && m.where.kind === 'paddock') n++;
  }
  return n;
}

/**
 * Run the night that ends the farm's current day. The farm passed in is not changed. The
 * night is the same whether the player was there or not: only the hands and the plans decide
 * what moves. `plansHeld` is the number of live plans whose moves were left to the player.
 */
export function nightOf(farm: FarmState, env: SourceEnv): { end: DayEnd; plansHeld: number } {
  if (handWorksToday(farm)) return { end: endDay(farm, env), plansHeld: 0 };
  const plansHeld = livePlans(farm);
  return { end: endDay(farm, { ...env, plansByHand: true }), plansHeld };
}

/**
 * The plan moves due today that no hand will make, for the plan card (PRD 5.15). Empty when a
 * hand works today (they move the mob tonight, from their own hours). A move is due by the
 * tick's own rule, cattle and sheep alike; a move whose next area can not take the mob now (no
 * water, or the other kind of stock there) is not offered: the plan waits, as the tick's does.
 * A plan that moves several times a day offers at most that many moves a day, and the last says
 * when the next is due. A fact in each: where the plan said to move, and where from.
 */
export function plansDue(farm: FarmState): PlanDueWire[] {
  if (handWorksToday(farm)) return [];
  const out: PlanDueWire[] = [];
  for (const view of plansView(farm)) {
    for (const m of view.mobs) {
      const n = m.next;
      if (!m.due || m.blocked) continue;
      if (n.kind === 'finish') {
        // The move that closes the plan, for every kind of rule, so a plan with rounds can end.
        out.push({
          mob: m.mob,
          mobName: m.mobName,
          from: m.area,
          to: m.area ?? 'where it is',
          text: `Your grazing plan said today it is finished. ${m.mobName} would stay${m.area ? ` in ${m.area}` : ' where it is'}.`,
        });
        continue;
      }
      // A plan waiting for an area that can take the mob again offers the move it waited for.
      if (n.kind !== 'move' && n.kind !== 'waiting') continue;
      const from = m.area ? ` from ${m.area}` : '';
      const k = n.kind === 'move' ? n.movesADay : 1;
      const count =
        k > 1
          ? ` That is move ${m.movesToday + 1} of ${k} today.${m.movesToday + 1 >= k ? ' The next is due tomorrow.' : ''}`
          : '';
      out.push({
        mob: m.mob,
        mobName: m.mobName,
        from: m.area,
        to: n.area,
        text: `Your grazing plan said today you would move ${m.mobName}${from} to ${n.area}.${count}`,
      });
    }
  }
  for (const s of sheepPlansDue(farm)) {
    if (s.blocked) continue;
    const from = s.from ? ` from ${s.from}` : '';
    out.push(
      s.to === null
        ? {
            mob: s.mob,
            mobName: s.mobName,
            from: s.from,
            to: s.from ?? 'where it is',
            text: `Your grazing plan said today it is finished. ${s.mobName} would stay${s.from ? ` in ${s.from}` : ' where it is'}.`,
          }
        : {
            mob: s.mob,
            mobName: s.mobName,
            from: s.from,
            to: s.to,
            text: `Your grazing plan said today you would move ${s.mobName}${from} to ${s.to}.`,
          },
    );
  }
  return out;
}
