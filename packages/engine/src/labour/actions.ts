/**
 * The workforce actions: hiring a hand, letting one go, ordering contractor
 * fencing and cancelling it (PRD 5.11). They are decisions: they take none
 * of the player's day. Each works on the farm it is given (a working copy)
 * and returns a refusal, or null with its events pushed.
 */

import type { Action, ActionRefusal, ActionRefusalReason } from '../actions/types';
import { LABOUR } from '../data/labour';
import { buildFence } from '../farm/layout';
import { EDGE, edgeOnFarm, getEdge, type EdgeRef } from '../farm/topology';
import { reusedSegmentCost, segmentCost } from '../money/costs';
import type { FarmEvent } from '../sim/events';
import type { FarmState } from '../sim/state';
import { contractDone, runMetresLeft } from './contract';
import { earnedOn, labourOf } from './help';
import { labourPool } from './pool';
import type { ContractRun, Hand } from './types';

const refuse = (reason: ActionRefusalReason, message: string): ActionRefusal => ({
  ok: false,
  reason,
  message,
});

const dollars = (v: number): string =>
  '$' + Math.round(v).toLocaleString('en-AU', { maximumFractionDigits: 0 });

type Out = ActionRefusal | null;

/** Hire a person from today's list. They start the next day. */
export function hireHand(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'hireHand' }>,
): Out {
  const person = labourPool(farm).find((p) => p.id === a.person);
  if (!person) {
    return refuse(
      'no-such-person',
      'That person is not on the list of people looking for work today.',
    );
  }
  const labour = labourOf(farm);
  if (labour.hands.length >= LABOUR.maxHands.value) {
    return refuse(
      'too-many-hands',
      `The farm has ${labour.hands.length} hands, the most it can take on at once.`,
    );
  }
  const startDay = farm.day + 1;
  const hand: Hand = {
    id: person.id,
    name: person.name,
    kind: person.kind,
    level: person.level,
    skills: { ...person.skills },
    dogs: person.dogs,
    days: [...person.days],
    rate: person.rate,
    hired: farm.day,
    startDay,
    endDay: person.kind === 'contract' ? startDay + LABOUR.contractDays.value : null,
    owed: 0,
    offUntil: null,
  };
  labour.hands.push(hand);
  labour.taken.push(person.id);
  labour.taken.sort((x, y) => x - y);
  labour.nextPayDay ??= farm.day + LABOUR.payCycleDays.value;
  events.push({
    type: 'hand-hired',
    hand: hand.id,
    name: hand.name,
    kind: hand.kind,
    rate: hand.rate,
    startDay,
    endDay: hand.endDay,
  });
  return null;
}

/** Let a hand go. What they are owed, today included, is paid now. */
export function letHandGo(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'letHandGo' }>,
): Out {
  const labour = farm.labour;
  const hand = labour?.hands.find((h) => h.id === a.hand);
  if (!labour || !hand) return refuse('no-such-hand', 'There is no such hand on the farm.');
  // What they are owed to the end of today: wages are otherwise added at the next first light.
  const paid = hand.owed + earnedOn(farm, hand, farm.day);
  if (farm.cash - paid < farm.overdraft) {
    return refuse(
      'bank-limit',
      `The bank won't lend enough to pay what ${hand.name} is owed. It is ${dollars(paid)} and the overdraft limit is ${dollars(farm.overdraft)}.`,
    );
  }
  farm.cash -= paid;
  farm.year.running += paid;
  labour.hands = labour.hands.filter((h) => h.id !== hand.id);
  if (!labour.hands.length) labour.nextPayDay = null;
  events.push({
    type: 'hand-left',
    hand: hand.id,
    name: hand.name,
    why: 'let-go',
    paid,
    stillOwed: 0,
  });
  return null;
}

/** The segments of a line that contract fencing would build: not the boundary, a gate or permanent fence already. */
function piecesOf(farm: FarmState, edges: readonly EdgeRef[]): EdgeRef[] {
  const seen = new Set<string>();
  const out: EdgeRef[] = [];
  for (const e of edges) {
    const key = e.line + e.index;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = getEdge(farm.layout.fences, e);
    if (c === EDGE.boundary || c === EDGE.gateShut || c === EDGE.gateOpen || c === EDGE.permanent) {
      continue;
    }
    out.push({ line: e.line, index: e.index });
  }
  return out;
}

/** What contract fencing of `segments` would cost on this farm now: materials (materials on hand used first, at half price) and labour. */
export function contractQuote(
  farm: FarmState,
  segments: number,
): { materials: number; labour: number; total: number; ratePerM: number } {
  const side = farm.layout.scale.sideM;
  const fromStock = Math.min(segments, farm.layout.fenceOnHand.permanent);
  const materials =
    (segments - fromStock) * segmentCost('permanent', side) +
    fromStock * reusedSegmentCost('permanent', side);
  const ratePerM = LABOUR.labourPerMetre.value;
  const labour = segments * side * ratePerM;
  return { materials, labour, total: materials + labour, ratePerM };
}

/**
 * Order contract fencing: permanent fence only, by a 1-man or a 2-man
 * team. The team starts at first light on the next day it works, builds its
 * metres each working day, and charges for what it builds each day. The bank
 * must be able to cover the whole run when it is ordered.
 */
export function orderContractFence(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'orderContractFence' }>,
): Out {
  if (a.team !== 1 && a.team !== 2) return refuse('bad-request', 'A team is 1 or 2 people.');
  if (
    !Array.isArray(a.edges) ||
    !a.edges.every((e) => e && (e.line === 'h' || e.line === 'v') && edgeOnFarm(e))
  ) {
    return refuse('off-the-farm', 'That line runs off the farm.');
  }
  const check = buildFence(farm.layout, a.edges, EDGE.permanent);
  if (!check.ok) return check;
  const pieces = piecesOf(farm, a.edges);
  if (!pieces.length) {
    return refuse('nothing-to-build', 'There is no new fence to build along that line.');
  }
  const quote = contractQuote(farm, pieces.length);
  if (farm.cash - quote.total < farm.overdraft) {
    return refuse(
      'bank-limit',
      `The bank won't lend that much for contract fencing. It costs ${dollars(quote.total)} and the overdraft limit is ${dollars(farm.overdraft)}.`,
    );
  }
  const labour = labourOf(farm);
  const run: ContractRun = {
    id: labour.nextRunId++,
    team: a.team,
    handsHelp: a.handsHelp === true,
    ordered: farm.day,
    left: pieces,
    was: pieces.map((e) => getEdge(farm.layout.fences, e)),
    built: [],
    progressM: 0,
    spent: 0,
    ratePerM: quote.ratePerM,
  };
  labour.runs.push(run);
  const done = contractDone(farm, run);
  events.push({
    type: 'contract-ordered',
    run: run.id,
    team: run.team,
    handsHelp: run.handsHelp,
    metres: runMetresLeft(farm, run),
    materials: quote.materials,
    labour: quote.labour,
    cost: quote.total,
    ratePerM: quote.ratePerM,
    startDay: done.startDay,
    doneDay: done.doneDay,
  });
  return null;
}

/** Cancel contract fencing. What is built stays, and what was charged stays paid. Nothing more is owed. */
export function cancelContractFence(
  farm: FarmState,
  events: FarmEvent[],
  a: Extract<Action, { type: 'cancelContractFence' }>,
): Out {
  const labour = farm.labour;
  const run = labour?.runs.find((r) => r.id === a.run);
  if (!labour || !run) return refuse('no-such-run', 'There is no such contract fencing under way.');
  labour.runs = labour.runs.filter((r) => r.id !== run.id);
  const side = farm.layout.scale.sideM;
  events.push({
    type: 'contract-cancelled',
    run: run.id,
    metresBuilt: run.built.length * side,
    metresLeft: runMetresLeft(farm, run),
    spent: run.spent,
  });
  return null;
}
