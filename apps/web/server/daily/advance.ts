import 'server-only';
import {
  endDay,
  plansView,
  worksOn,
  type DayEnd,
  type FarmState,
  type PlanView,
  type SourceEnv,
} from '@gg/engine';
import type { PlanDueWire } from '../../lib/game/types';

/*
 * One Daily Farm night, and the grazing plan moves that no hand will make (PRD 5.11 and 5.15).
 *
 * The night is the engine's own `endDay`: the tick, then first light with the hands' standing
 * duties. Nothing is added to the rules. The one thing the server decides is who moves a mob on
 * a grazing plan. The engine moves plans in the tick for every farm. On Daily Farm that is true
 * only when a hand works that day. With no hand, the plans are held for the night (paused, then
 * set back as they were), so nothing moves until the player does it from the plan card.
 */

/** True when a hand works on the farm's current day: the engine's own rule, which also credits the plan move in the worker report. */
export function handWorksToday(farm: FarmState): boolean {
  return (farm.labour?.hands ?? []).some((h) => worksOn(farm, h, farm.day));
}

/**
 * Run the night that ends the farm's current day. The farm passed in is not changed. The
 * night is the same whether the player was there or not: only the hands and the plans decide
 * what moves.
 */
export function nightOf(farm: FarmState, env: SourceEnv): { end: DayEnd; plansHeld: number } {
  const hold: number[] = [];
  if (!handWorksToday(farm)) {
    for (const m of farm.mobs) {
      if (m.plan && !m.plan.paused) {
        m.plan.paused = true;
        hold.push(m.id);
      }
    }
  }
  try {
    const end = endDay(farm, env);
    for (const m of end.farm.mobs) {
      if (hold.includes(m.id) && m.plan) m.plan.paused = false;
    }
    return { end, plansHeld: hold.length };
  } finally {
    // The farm passed in is a held copy other readers share: it is set back whatever happens.
    for (const m of farm.mobs) {
      if (hold.includes(m.id) && m.plan) m.plan.paused = false;
    }
  }
}

/** The step a plan goes to next, counted from the first stop of the first leg, worked out as the engine's own reading does. */
function nextStep(view: PlanView, leg: number, stop: number, roundInLeg: number): number | null {
  const here = view.legs[leg];
  if (!here) return null;
  let ni = stop + 1;
  let nl = leg;
  if (ni >= here.stops.length) {
    ni = 0;
    if (here.rounds > 0 && roundInLeg + 1 >= here.rounds) {
      nl++;
      if (nl >= view.legs.length) {
        if (view.after === 'repeat') nl = 0;
        else return null;
      }
    }
  }
  let step = ni;
  for (let l = 0; l < nl; l++) step += view.legs[l]!.stops.length;
  return step;
}

/**
 * The plan moves due today that no hand will make, for the plan card (PRD 5.15). Empty when a
 * hand works today (they move the mob tonight, from their own hours) or when no plan is due.
 * A fact in each: where the plan said to move, and where from.
 */
export function plansDue(farm: FarmState): PlanDueWire[] {
  if (handWorksToday(farm)) return [];
  const out: PlanDueWire[] = [];
  for (const view of plansView(farm)) {
    for (const m of view.mobs) {
      const n = m.next;
      if (m.paused || !m.onPasture || n.kind !== 'move') continue;
      const due =
        n.rule === 'days'
          ? n.onDay !== null && n.onDay <= farm.day
          : (n.massKgHa !== null && n.kg !== null && n.massKgHa <= n.kg) ||
            (n.latestDay !== null && n.latestDay <= farm.day);
      if (!due) continue;
      const step = nextStep(view, m.leg, m.stop, m.roundInLeg);
      if (step === null) continue;
      const from = m.area ? ` from ${m.area}` : '';
      out.push({
        mob: m.mob,
        mobName: m.mobName,
        from: m.area,
        to: n.area,
        step,
        text: `Your grazing plan said today you would move ${m.mobName}${from} to ${n.area}.`,
      });
    }
  }
  return out;
}
