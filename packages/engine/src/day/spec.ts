/**
 * How much work is in each job (PRD 5.4).
 *
 * `specFor` reads the farm before an action and the farm as it would be
 * after it (the action tried all at once, with no clock), and gives the
 * job's work. It never decides whether the job fits today: the working
 * day does that (act.ts).
 *
 * A job's time is its work only. There is no driving, no drive home, no
 * walk to the yards and no place on the farm the player has to be
 * (Claudia, 14 Nov 2026: docs/REQUIREMENTS.md, "The working day made
 * simpler"). Stock work is done where the mob is.
 *
 * A job is one of three kinds:
 *
 *   - `line`: fence, tape or pipe, built piece by piece in the order it
 *     was drawn. Each piece is one segment of fence or one square of pipe.
 *   - `whole`: a job done in one go (a gate, a trough, a move, marking).
 *   - `free`: it takes none of the day (sowing and harvest, which cost
 *     money and happen at once; buying; taking a mob off a supplement).
 *
 * The times are in ../data/jobTimes.ts. Each rule here that the PRD does
 * not give is marked "builder's rule" and listed in docs/DATA.md.
 */

import type { Action, ActionDone, JobPiece, JobWorkPart } from '../actions/types';
import { JOB_TIMES, metresPerMinute, type Pace } from '../data/jobTimes';
import { tapeRun } from '../farm/layout';
import { EDGE, getEdge, type EdgeRef } from '../farm/topology';
import { areaIdOf, surveyOf } from '../sim/derived';
import type { FarmMob, FarmState } from '../sim/state';

/** The work in one piece of a line job. */
export type PieceWork =
  /** A length built at a pace: fence, tape or pipe. */
  | { metres: number; pace: Pace }
  /** A fixed time: a gate that comes out with the fence. */
  | { minutes: number };

/** One piece of a line job. */
export interface Piece {
  ref: JobPiece;
  work: PieceWork;
}

export type JobSpec =
  | { kind: 'free' }
  | { kind: 'whole'; parts: JobWorkPart[] }
  | { kind: 'line'; what: JobWorkPart['what']; pieces: Piece[] };

/** Minutes a piece takes on a day with `dayMin` minutes of light. */
export const pieceMinutes = (work: PieceWork, dayMin: number): number =>
  'minutes' in work ? work.minutes : work.metres / metresPerMinute(work.pace, dayMin);

const pieceKey = (ref: JobPiece): string =>
  'edge' in ref ? ref.edge.line + ref.edge.index : 'c' + ref.cell;

// ---------------------------------------------------------------------------
// Line jobs
// ---------------------------------------------------------------------------

/** What pulling down or rolling up a segment takes, by what stands there. Builder's rule: as long as building it. */
function removalWork(code: number, sideM: number): PieceWork {
  if (code === EDGE.gateShut || code === EDGE.gateOpen) return { minutes: JOB_TIMES.gateMin.value };
  if (code === EDGE.permanent) return { metres: sideM, pace: 'permanent' };
  if (code === EDGE.electric || code === EDGE.electricDown) {
    return { metres: sideM, pace: 'electric' };
  }
  return { metres: sideM, pace: 'tape' };
}

/** The fence segments or squares an action asks for, in the order they were drawn. */
function askedPieces(farm: FarmState, action: Action): JobPiece[] {
  switch (action.type) {
    case 'buildFence':
    case 'removeFence':
      return action.edges.map((edge) => ({ edge: { line: edge.line, index: edge.index } }));
    case 'rollUpTape':
      // The whole run, from one end to the other.
      return tapeRun(farm.layout.fences, action.edge)
        .sort((p, q) => p.index - q.index)
        .map((edge) => ({ edge: { line: edge.line, index: edge.index } }));
    case 'layPipe':
      return action.cells.map((cell) => ({ cell }));
    default:
      return [];
  }
}

/**
 * The pieces of a line job, in the order drawn: every piece the action
 * would change. Pieces that are already as the action leaves them (fence
 * of that kind, a gate in the run, pipe already laid) are not work, and a
 * piece drawn twice is one piece.
 */
function linePieces(before: FarmState, after: FarmState, action: Action): Piece[] {
  const sideM = before.layout.scale.sideM;
  const seen = new Set<string>();
  const out: Piece[] = [];
  for (const ref of askedPieces(before, action)) {
    const key = pieceKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    if ('edge' in ref) {
      const was = getEdge(before.layout.fences, ref.edge);
      if (was === getEdge(after.layout.fences, ref.edge)) continue;
      const work: PieceWork =
        action.type === 'buildFence'
          ? { metres: sideM, pace: action.fence }
          : removalWork(was, sideM);
      out.push({ ref, work });
    } else {
      if (before.layout.water.pipe[ref.cell] === after.layout.water.pipe[ref.cell]) continue;
      out.push({ ref, work: { metres: sideM, pace: 'pipe' } });
    }
  }
  return out;
}

/**
 * The action that does just some of a line job's pieces: the part that
 * fits today. Rolling up part of a run of tape is pulling down those
 * segments.
 */
export function partAction(action: Action, pieces: readonly JobPiece[]): Action {
  const edges: EdgeRef[] = [];
  const cells: number[] = [];
  for (const p of pieces) {
    if ('edge' in p) edges.push({ line: p.edge.line, index: p.edge.index });
    else cells.push(p.cell);
  }
  switch (action.type) {
    case 'buildFence':
      return { type: 'buildFence', edges, fence: action.fence };
    case 'layPipe':
      return { type: 'layPipe', cells };
    default:
      return { type: 'removeFence', edges };
  }
}

const LINE_WHAT: Partial<Record<Action['type'], JobWorkPart['what']>> = {
  buildFence: 'build',
  removeFence: 'pull-down',
  rollUpTape: 'pull-down',
  layPipe: 'pipe',
};

// ---------------------------------------------------------------------------
// Jobs done in one go
// ---------------------------------------------------------------------------

const part = (what: JobWorkPart['what'], minutes: number): JobWorkPart => ({ what, minutes });

const whole = (parts: JobWorkPart[]): JobSpec => ({ kind: 'whole', parts });

/** The mobs (as they were before) that lost cattle to the action, with how many each lost. */
function mobsThatLost(before: FarmState, after: FarmState): { mob: FarmMob; head: number }[] {
  const survey = surveyOf(after);
  // Where every beast is after: its grazing area, the feedlot or the yards.
  const placeAfter = new Map<number, string>();
  for (const m of after.mobs) {
    const key = m.where.kind === 'paddock' ? 'a' + areaIdOf(survey, m) : m.where.kind;
    for (const a of m.animals) placeAfter.set(a.id, key);
  }
  const was = surveyOf(before);
  const out: { mob: FarmMob; head: number }[] = [];
  for (const m of before.mobs) {
    const key = m.where.kind === 'paddock' ? 'a' + areaIdOf(was, m) : m.where.kind;
    let head = 0;
    for (const a of m.animals) if (placeAfter.get(a.id) !== key) head++;
    if (head) out.push({ mob: m, head });
  }
  return out;
}

/**
 * The job an action is: its kind and its work.
 *
 * `before` is the farm as it stands and `trial` the action tried on a
 * copy with no clock.
 */
export function specFor(before: FarmState, action: Action, trial: ActionDone): JobSpec {
  const T = JOB_TIMES;
  const sideM = before.layout.scale.sideM;
  const mobById = (id: number): FarmMob => before.mobs.find((m) => m.id === id)!;

  switch (action.type) {
    // ---- Line jobs
    case 'buildFence':
    case 'removeFence':
    case 'rollUpTape':
    case 'layPipe':
      return {
        kind: 'line',
        what: LINE_WHAT[action.type] ?? 'build',
        pieces: linePieces(before, trial.farm, action),
      };

    // ---- Things that take none of the player's day
    case 'sow':
    case 'harvest':
      // They cost money and happen at once, as in the MVP.
      return { kind: 'free' };
    case 'buyCattle':
      // There is no trip to the saleyard: buying is a decision.
      return { kind: 'free' };
    case 'cancelSale':
      // Taking stock off a sale is a decision too.
      return { kind: 'free' };
    case 'hireHand':
    case 'letHandGo':
    case 'orderContractFence':
    case 'cancelContractFence':
      // The workforce: decisions. Contract fencing uses none of the player's day (PRD 5.11).
      return { kind: 'free' };

    // ---- Stock, where the mob is
    case 'sellAnimals':
    case 'sellGroup':
    case 'sellClass': {
      // Done where the mob is, with no muster: draft and load.
      // The time is spent on the day the player asks, whether the stock are
      // sold today or booked onto the next sale.
      const booked = trial.events.find((e) => e.type === 'sale-booked');
      const lost = mobsThatLost(before, trial.farm);
      const head =
        booked?.type === 'sale-booked'
          ? booked.head + booked.calvesAtFoot
          : lost.reduce((n, l) => n + l.head, 0);
      return whole([
        part('draft-and-load', T.sellBaseMin.value),
        part('head', (head / 10) * T.sellMinPer10Head.value),
      ]);
    }
    case 'moveMob':
    case 'moveCattle': {
      // "Pick the paddock, done": 15 minutes for each mob cattle are taken
      // from, and a minute for each 100 head. No route and no walking time.
      const lost = mobsThatLost(before, trial.farm);
      const head = lost.reduce((n, l) => n + l.head, 0);
      return whole([
        part('settle', T.moveMobSettleMin.value * Math.max(1, lost.length)),
        part('head', (head / 100) * T.moveMobMinPer100Head.value),
      ]);
    }
    case 'pausePlan':
    case 'clearPlan':
      // Pausing and clearing a plan are decisions: they take none of the day.
      return { kind: 'free' };
    case 'setPlan':
    case 'resumePlan': {
      // Putting the mob on the plan's stop is a move: the ordinary move time, when the mob is
      // not already there. Making the plan is a decision. The moves a plan makes by itself
      // take none of the day (as in the old game).
      const lost = mobsThatLost(before, trial.farm);
      if (!lost.length) return { kind: 'free' };
      const head = lost.reduce((n, l) => n + l.head, 0);
      return whole([
        part('settle', T.moveMobSettleMin.value * Math.max(1, lost.length)),
        part('head', (head / 100) * T.moveMobMinPer100Head.value),
      ]);
    }
    case 'setSupplement':
      // Switching a supplement on or off is a decision at a daily price. It takes none of the
      // daylight (Claudia, 14 Nov 2026).
      return { kind: 'free' };
    case 'wean': {
      // "0.5 min per head": every head in the mob goes through the draft, calves included.
      const m = mobById(action.mob);
      return whole([
        part('draft-and-load', T.weanBaseMin.value),
        part('head', m.animals.length * T.weanMinPerHead.value),
      ]);
    }
    case 'markCalves': {
      // "2 min per calf": every calf at foot is handled, bull calf or heifer.
      const m = mobById(action.mob);
      const calves = m.animals.filter((a) => a.kind === 'calf').length;
      return whole([part('head', calves * T.markMinPerCalf.value)]);
    }

    // ---- Gates and repairs
    case 'placeGate':
    case 'removeGate':
      // Builder's rule: taking a gate out takes as long as hanging it.
      return whole([part('gate', T.gateMin.value)]);
    case 'setGate':
      return whole([part('gate', T.gateOpenShutMin.value)]);
    case 'fixFence': {
      // One segment put back up, at the pace of its kind.
      const pace: Pace =
        getEdge(before.layout.fences, action.edge) === EDGE.electricDown ? 'electric' : 'tape';
      return whole([part('build', sideM / metresPerMinute(pace, 1))]);
    }

    // ---- Water
    case 'placeTrough':
    case 'removeTrough':
    case 'moveTrough':
    case 'placeFenceHub':
    case 'removeHub':
    case 'moveHub':
    case 'removeSquareHub':
      // Builder's rules: taking a trough or hub out, or moving a trough or a fence-line hub,
      // takes as long as fitting one.
      return whole([part('trough', T.troughMin.value)]);
    case 'moveSquareHub': {
      // The trough moved, as long as fitting one, and a swing gate on each side that got one.
      const built = trial.events.find((e) => e.type === 'layout-job');
      const detail = built && built.type === 'layout-job' ? built.detail : {};
      return whole([
        part('trough', T.troughMin.value),
        part('gate', Number(detail.gates ?? 0) * T.gateMin.value),
      ]);
    }
    case 'placeSquareHub': {
      // A trough, if the square had none, and a swing gate on each side that got one.
      const built = trial.events.find((e) => e.type === 'layout-job');
      const detail = built && built.type === 'layout-job' ? built.detail : {};
      return whole([
        part('trough', detail.troughAdded ? T.troughMin.value : 0),
        part('gate', Number(detail.gates ?? 0) * T.gateMin.value),
      ]);
    }
    case 'placePortable':
    case 'movePortable':
    case 'refillPortable':
    case 'removePortable':
      return whole([part('portable-trough', T.portableTroughMin.value)]);
  }
}
