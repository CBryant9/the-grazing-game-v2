/**
 * The workforce at first light (PRD 5.11; docs/MODEL.md, section 11).
 *
 * Called from `dawn` after the daily tick, for each new day. On a farm with
 * no labour state (never a hand, never a contractor) it does nothing and
 * draws nothing, so such a farm plays exactly as it did before hands
 * existed. In order:
 *
 *   1. Yesterday's wages are added to what each hand is owed, and each hand
 *      who worked yesterday may have been hurt (a seeded draw at the
 *      published rate for agriculture, likelier on a day of fencing).
 *   2. Hands back from an injury are back.
 *   3. Contracts that end today end. The hand is paid what they are owed.
 *   4. On pay day every hand is paid what they are owed. A hand who can't be
 *      paid leaves and the farm's standing falls. Paying everyone brings it
 *      back a little.
 *   5. The hands' standing duties, from their own day: a portable trough
 *      under its low mark is filled, and a knocked-down fence is put back up.
 *   6. Contractor fencing under way builds its day's metres.
 */

// The workforce does its jobs in its own time, by the same rules and prices as the player.
import { workByOthers, type ActionEnv } from '../actions/apply';
import { JOB_TIMES, metresPerMinute } from '../data/jobTimes';
import { LABOUR, dayHours } from '../data/labour';
import { PORTABLE_CAPACITY_L, PORTABLE_LOW_SHARE } from '../farm/water';
import { EDGE, getEdge, H_EDGES, V_EDGES, type EdgeRef } from '../farm/topology';
import { rngFromState } from '../rng';
import { dayMinutes } from '../sim/clock';
import type { FarmEvent, HandDuty } from '../sim/events';
import type { FarmState } from '../sim/state';
import { contractDone, contractorWorks, runMetresLeft } from './contract';
import { earnedOn, handsCan, useHands, weeklyWage, worksOn } from './help';
import type { ContractRun, Hand, LabourState } from './types';

function clampStanding(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** Pay a hand what they are owed, if the bank allows. True if paid. */
function payOwed(farm: FarmState, hand: Hand): boolean {
  if (hand.owed <= 0) return true;
  if (farm.cash - hand.owed < farm.overdraft) return false;
  farm.cash -= hand.owed;
  farm.year.running += hand.owed;
  hand.owed = 0;
  return true;
}

/**
 * Money the farm owes and could not pay: it is kept as wages owed on the
 * farm (never forgiven) and paid by itself at first light as soon as the
 * bank can cover it.
 */
function owe(labour: LabourState, amount: number): void {
  labour.wagesOwed += amount;
}

/** Pay what the farm still owes from before, if the bank can cover it all now. */
function payDebt(farm: FarmState, labour: LabourState, events: FarmEvent[]): void {
  const owed = labour.wagesOwed;
  if (owed <= 0 || farm.cash - owed < farm.overdraft) return;
  farm.cash -= owed;
  farm.year.running += owed;
  labour.wagesOwed = 0;
  events.push({ type: 'wages-owed-paid', amount: owed });
}

/** A hand's wages could not be paid: the standing falls, and what they are owed stays owed by the farm. */
function missed(farm: FarmState, labour: LabourState, hand: Hand, events: FarmEvent[]): void {
  const before = labour.standing;
  labour.standing = clampStanding(before - LABOUR.standingMissedPay.value);
  events.push({
    type: 'wages-missed',
    hand: hand.id,
    name: hand.name,
    owed: hand.owed,
    standingBefore: before,
    standingAfter: labour.standing,
  });
  owe(labour, hand.owed);
  hand.owed = 0;
}

// ---------------------------------------------------------------------------
// 1 to 4: wages, injuries, contracts ending, pay day
// ---------------------------------------------------------------------------

function yesterday(farm: FarmState, labour: LabourState, events: FarmEvent[]): void {
  const y = farm.day - 1;
  if (y < 0) return;
  const rng = rngFromState(labour.rng);
  const fenced = labour.help.day === y ? labour.help.fenced : {};
  for (const hand of labour.hands) {
    const worked = worksOn(farm, hand, y);
    hand.owed += earnedOn(farm, hand, y);
    if (!worked) continue;
    // One draw for each hand-day worked, so the stream is the same whatever the result.
    const fencing = fenced[String(hand.id)] === true;
    const p = LABOUR.injuryPerHour.value * dayHours() * (fencing ? LABOUR.fencingRisk.value : 1);
    if (rng.next() >= p) continue;
    const backDay = farm.day + LABOUR.injuryDaysOff.value;
    const cost = weeklyWage(hand) * LABOUR.injuryCostWeeks.value;
    hand.offUntil = backDay;
    // The farm's share of the claim goes the same way as wages: paid if the bank can cover it,
    // otherwise owed by the farm and paid as soon as it can.
    const paidNow = farm.cash - cost >= farm.overdraft;
    if (paidNow) {
      farm.cash -= cost;
      farm.year.running += cost;
    } else owe(labour, cost);
    events.push({
      type: 'hand-injured',
      hand: hand.id,
      name: hand.name,
      day: y,
      fencing,
      backDay,
      cost,
      paidNow,
    });
  }
  labour.rng = rng.state();
}

/** The worker report keeps this many plan moves credited to a hand. */
const PLAN_MOVES_KEPT = 120;

/**
 * The plan moves yesterday's tick made, credited to the first hand (in hire
 * order) who worked yesterday. Recorded now, as it happened, so the worker
 * report never credits a hand on a day off, injured, or gone.
 */
function creditPlanMoves(farm: FarmState, labour: LabourState): void {
  const y = farm.day - 1;
  const by = labour.hands.find((h) => worksOn(farm, h, y));
  if (by) {
    const known = new Set(labour.planMoves.map((p) => p.seq));
    for (const m of farm.inbox) {
      if (m.day !== y || m.event.type !== 'plan-moved' || known.has(m.seq)) continue;
      labour.planMoves.push({ seq: m.seq, hand: by.id, name: by.name });
    }
  }
  if (labour.planMoves.length > PLAN_MOVES_KEPT) {
    labour.planMoves.splice(0, labour.planMoves.length - PLAN_MOVES_KEPT);
  }
}

function backs(farm: FarmState, labour: LabourState, events: FarmEvent[]): void {
  for (const hand of labour.hands) {
    if (hand.offUntil !== null && hand.offUntil <= farm.day) {
      hand.offUntil = null;
      events.push({ type: 'hand-back', hand: hand.id, name: hand.name });
    }
  }
}

function contractsEnd(farm: FarmState, labour: LabourState, events: FarmEvent[]): void {
  for (const hand of [...labour.hands]) {
    if (hand.endDay === null || hand.endDay > farm.day) continue;
    const owed = hand.owed;
    const paid = payOwed(farm, hand);
    if (!paid) missed(farm, labour, hand, events);
    labour.hands = labour.hands.filter((h) => h.id !== hand.id);
    events.push({
      type: 'hand-left',
      hand: hand.id,
      name: hand.name,
      why: 'contract-finished',
      paid: paid ? owed : 0,
      stillOwed: paid ? 0 : owed,
    });
  }
}

function payDay(farm: FarmState, labour: LabourState, events: FarmEvent[]): void {
  if (labour.nextPayDay === null || farm.day < labour.nextPayDay) return;
  while (labour.nextPayDay <= farm.day) labour.nextPayDay += LABOUR.payCycleDays.value;
  let total = 0;
  let paidHands = 0;
  let anyMissed = false;
  for (const hand of [...labour.hands]) {
    if (hand.owed <= 0) continue;
    const owed = hand.owed;
    if (payOwed(farm, hand)) {
      total += owed;
      paidHands++;
      continue;
    }
    anyMissed = true;
    missed(farm, labour, hand, events);
    labour.hands = labour.hands.filter((h) => h.id !== hand.id);
    events.push({
      type: 'hand-left',
      hand: hand.id,
      name: hand.name,
      why: 'not-paid',
      paid: 0,
      stillOwed: owed,
    });
  }
  if (paidHands) {
    const wages = total / (1 + LABOUR.superRate.value);
    events.push({
      type: 'wages-paid',
      hands: paidHands,
      wages,
      superannuation: total - wages,
      total,
    });
    if (!anyMissed) {
      labour.standing = clampStanding(labour.standing + LABOUR.standingPaidOnTime.value);
    }
  }
}

// ---------------------------------------------------------------------------
// 5: standing duties
// ---------------------------------------------------------------------------

function knockedDown(farm: FarmState): EdgeRef[] {
  const out: EdgeRef[] = [];
  const scan = (line: 'h' | 'v', codes: Uint8Array, n: number): void => {
    for (let index = 0; index < n; index++) {
      const c = codes[index];
      if (c === EDGE.electricDown || c === EDGE.tapeDown) out.push({ line, index });
    }
  };
  scan('h', farm.layout.fences.hE, H_EDGES);
  scan('v', farm.layout.fences.vE, V_EDGES);
  return out;
}

/** Do one duty if a hand has the time and the bank allows. The hands' day is used as the player's would be. */
function duty(
  farm: FarmState,
  env: ActionEnv,
  events: FarmEvent[],
  action: { type: 'refillPortable'; port: number } | { type: 'fixFence'; edge: EdgeRef },
  minutes: number,
  skill: 'water' | 'fencing',
  what: (cost: number) => HandDuty,
): void {
  const dayMin = dayMinutes(farm);
  const can = handsCan(farm, skill, dayMin).reduce((t, p) => t + p.minutes, 0);
  if (can + 1e-9 < minutes) return;
  const res = workByOthers(farm, action, env);
  if (!res.ok) return;
  const cost = farm.cash - res.farm.cash;
  res.farm.labour = farm.labour;
  Object.assign(farm, res.farm);
  const parts = useHands(farm, skill, dayMin, minutes);
  const hand = farm.labour!.hands.find((h) => h.id === parts[0]!.hand)!;
  events.push({ type: 'hand-duty', hand: hand.id, name: hand.name, duty: what(cost) });
}

function duties(farm: FarmState, env: ActionEnv, events: FarmEvent[]): void {
  const labour = farm.labour!;
  if (!labour.hands.some((h) => worksOn(farm, h, farm.day))) return;
  for (const pt of [...farm.layout.water.ports]) {
    if (pt.level >= PORTABLE_CAPACITY_L * PORTABLE_LOW_SHARE) continue;
    duty(
      farm,
      env,
      events,
      { type: 'refillPortable', port: pt.id },
      JOB_TIMES.portableTroughMin.value,
      'water',
      (cost) => ({ type: 'refill-trough', port: pt.id, cell: pt.cell, cost }),
    );
  }
  const side = farm.layout.scale.sideM;
  for (const edge of knockedDown(farm)) {
    const pace = getEdge(farm.layout.fences, edge) === EDGE.electricDown ? 'electric' : 'tape';
    duty(
      farm,
      env,
      events,
      { type: 'fixFence', edge },
      side / metresPerMinute(pace, 1),
      'fencing',
      (cost) => ({ type: 'fix-fence', edge, cost }),
    );
  }
}

// ---------------------------------------------------------------------------
// 6: contractor fencing
// ---------------------------------------------------------------------------

function stopRun(
  farm: FarmState,
  run: ContractRun,
  why: 'no-money' | 'line-changed',
  events: FarmEvent[],
): void {
  const labour = farm.labour!;
  labour.runs = labour.runs.filter((r) => r.id !== run.id);
  events.push({
    type: 'contract-stopped',
    run: run.id,
    why,
    metresBuilt: run.built.length * farm.layout.scale.sideM,
    metresLeft: runMetresLeft(farm, run),
    spent: run.spent,
  });
}

function finishRun(farm: FarmState, run: ContractRun, events: FarmEvent[]): void {
  const labour = farm.labour!;
  labour.runs = labour.runs.filter((r) => r.id !== run.id);
  events.push({
    type: 'contract-finished',
    run: run.id,
    metres: run.built.length * farm.layout.scale.sideM,
    spent: run.spent,
  });
}

const settled = (c: number): boolean =>
  c === EDGE.permanent || c === EDGE.gateShut || c === EDGE.gateOpen || c === EDGE.boundary;

function runDay(
  farm: FarmState,
  env: ActionEnv,
  run: ContractRun,
  handsFree: boolean,
  events: FarmEvent[],
): void {
  const side = farm.layout.scale.sideM;
  const dayMin = dayMinutes(farm);
  const teamM = LABOUR.teamMetresPerDay.value[run.team];
  let handsM = 0;
  let handsMin = 0;
  if (run.handsHelp && handsFree) {
    // The hands' fencing day, in metres of permanent fence at the player's pace. It is used only
    // if something is built today.
    handsMin = handsCan(farm, 'fencing', dayMin).reduce((t, p) => t + p.minutes, 0);
    handsM = handsMin * metresPerMinute('permanent', dayMin);
  }
  let progress = run.progressM + teamM + handsM;
  const left = [...run.left];
  const was = [...run.was];
  const build: EdgeRef[] = [];
  let dayCost = 0;
  let changed = false;
  while (left.length) {
    const c = getEdge(farm.layout.fences, left[0]!);
    if (settled(c)) {
      // Built already (by the player), or a gate: nothing to do there.
      left.shift();
      was.shift();
      continue;
    }
    if (c !== was[0]) {
      changed = true;
      break;
    }
    if (progress + 1e-9 < side) break;
    build.push(left.shift()!);
    was.shift();
    progress -= side;
  }
  if (build.length) {
    const res = workByOthers(farm, { type: 'buildFence', edges: build, fence: 'permanent' }, env);
    if (!res.ok) {
      stopRun(farm, run, res.reason === 'bank-limit' ? 'no-money' : 'line-changed', events);
      return;
    }
    const materials = farm.cash - res.farm.cash;
    const labourCost = build.length * side * run.ratePerM;
    if (res.farm.cash - labourCost < farm.overdraft) {
      stopRun(farm, run, 'no-money', events);
      return;
    }
    res.farm.labour = farm.labour;
    Object.assign(farm, res.farm);
    if (handsMin > 0) useHands(farm, 'fencing', dayMin, handsMin);
    farm.cash -= labourCost;
    farm.year.infra += labourCost;
    dayCost = materials + labourCost;
    run.spent += dayCost;
    run.built.push(...build);
    events.push(...res.events);
  }
  // With nothing built today, the hands' day was not used, so it does not count.
  if (!build.length) progress -= handsM;
  run.left = left;
  run.was = was;
  run.progressM = left.length ? progress : 0;
  if (build.length) {
    events.push({
      type: 'contract-built',
      run: run.id,
      metres: build.length * side,
      byHandsM: Math.min(handsM, build.length * side),
      metresLeft: runMetresLeft(farm, run),
      cost: dayCost,
      doneDay: left.length ? contractDone(farm, run).doneDay : farm.day,
    });
  }
  if (changed) stopRun(farm, run, 'line-changed', events);
  else if (!left.length) finishRun(farm, run, events);
}

function contracts(farm: FarmState, env: ActionEnv, events: FarmEvent[]): void {
  const labour = farm.labour!;
  if (!labour.runs.length || !contractorWorks(farm, farm.day)) return;
  let handsFree = true;
  for (const run of [...labour.runs]) {
    runDay(farm, env, run, handsFree, events);
    if (run.handsHelp) handsFree = false;
  }
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

/**
 * The workforce's first light. Changes the farm in place and returns what
 * happened, in order. Does nothing on a farm with no labour state.
 */
export function labourDawn(farm: FarmState, env: ActionEnv = {}): FarmEvent[] {
  const events: FarmEvent[] = [];
  const labour = farm.labour;
  if (!labour || farm.over) return events;
  creditPlanMoves(farm, labour);
  yesterday(farm, labour, events);
  backs(farm, labour, events);
  contractsEnd(farm, labour, events);
  payDebt(farm, labour, events);
  payDay(farm, labour, events);
  if (!labour.hands.length) labour.nextPayDay = null;
  labour.help = { day: farm.day, used: {}, fenced: {} };
  duties(farm, env, events);
  contracts(farm, env, events);
  return events;
}
