/**
 * Where each job is and how much work is in it (PRD 5.4).
 *
 * `specFor` reads the farm before an action and the farm as it would be
 * after it (the action tried all at once, with no clock), and gives the
 * job's place and its work. It never decides whether the job fits today:
 * the working day does that (act.ts).
 *
 * A job is one of four kinds:
 *
 *   - `line`: fence, tape or pipe, built piece by piece in the order it
 *     was drawn. Each piece is one segment of fence or one square of pipe.
 *   - `whole`: a job that takes effect when its last minute is done (a
 *     gate, a trough, a move, a muster).
 *   - `contractor`: sowing and harvest. Booked, paid for, and done a few
 *     days on with none of the player's time.
 *   - `free`: it takes no time at all.
 *
 * The times are in ../data/jobTimes.ts. Each rule here that the PRD does
 * not give is marked "builder's rule" and listed in docs/DATA.md.
 */

import type { Action, ActionDone, JobWorkPart } from '../actions/types';
import {
  JOB_TIMES,
  gateMinutes,
  metresPerMinute,
  musterMinutes,
  type Pace,
} from '../data/jobTimes';
import { tapeRun, type Survey } from '../farm/layout';
import { EDGE, getEdge, type EdgeRef } from '../farm/topology';
import { homesteadPoint, squareCentre } from '../sim/clock';
import { areaIdOf, surveyOf } from '../sim/derived';
import type { FarmMob, FarmState, JobPiece, MapPoint } from '../sim/state';
import { edgeEnds, nearestSquare, squaresBetween, vertexPoint } from './travel';

/** The work in one piece of a line job. */
export type PieceWork =
  /** A length built at a pace: fence, tape or pipe. */
  | { metres: number; pace: Pace }
  /** A fixed time: a gate that comes out with the fence. */
  | { minutes: number };

/** One piece of a line job, with where it runs from and to. */
export interface Piece {
  ref: JobPiece;
  /** The end the work starts from, and the end it finishes at. The same point for a square of pipe. */
  a: MapPoint;
  b: MapPoint;
  work: PieceWork;
}

export type JobSpec =
  | { kind: 'free' }
  | { kind: 'contractor' }
  | {
      kind: 'whole';
      /** The places the job visits, in order. Empty for a job with no place on the map. */
      sites: MapPoint[];
      /** Where the player is when it is done. Null: at the last place visited, or where they were. */
      endAt: MapPoint | null;
      parts: JobWorkPart[];
      /** True for a job that can't be split over two days (a trip to the saleyard). */
      oneDay: boolean;
    }
  | { kind: 'line'; what: JobWorkPart['what']; pieces: Piece[] };

/** Minutes a piece takes on a day with `dayMin` minutes of light. */
export const pieceMinutes = (work: PieceWork, dayMin: number): number =>
  'minutes' in work ? work.minutes : work.metres / metresPerMinute(work.pace, dayMin);

export const pieceKey = (ref: JobPiece): string =>
  'edge' in ref ? ref.edge.line + ref.edge.index : 'c' + ref.cell;

// ---------------------------------------------------------------------------
// Line jobs
// ---------------------------------------------------------------------------

/** What pulling down or rolling up a segment takes, by what stands there. Builder's rule: as long as building it. */
function removalWork(code: number, sideM: number): PieceWork {
  if (code === EDGE.gateShut || code === EDGE.gateOpen) return { minutes: gateMinutes('swing') };
  if (code === EDGE.permanent) return { metres: sideM, pace: 'permanent' };
  if (code === EDGE.electric || code === EDGE.electricDown) {
    return { metres: sideM, pace: 'electric' };
  }
  return { metres: sideM, pace: 'tape' };
}

/**
 * The pieces of a line job, in order: every piece in `refs` that the
 * action would change. Pieces that are already as the action leaves them
 * (fence of that kind, a gate in the run, pipe already laid) are not work.
 */
export function linePieces(
  before: FarmState,
  after: FarmState,
  action: Action,
  refs: readonly JobPiece[],
): Piece[] {
  const sideM = before.layout.scale.sideM;
  const seen = new Set<string>();
  const out: Piece[] = [];
  for (const ref of refs) {
    const key = pieceKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    if ('edge' in ref) {
      const was = getEdge(before.layout.fences, ref.edge);
      if (was === getEdge(after.layout.fences, ref.edge)) continue;
      const [a, b] = edgeEnds(ref.edge);
      const work: PieceWork =
        action.type === 'buildFence'
          ? { metres: sideM, pace: action.fence }
          : removalWork(was, sideM);
      out.push({ ref, a, b, work });
    } else {
      if (before.layout.water.pipe[ref.cell] === after.layout.water.pipe[ref.cell]) continue;
      const c = squareCentre(ref.cell);
      out.push({ ref, a: c, b: { x: c.x, y: c.y }, work: { metres: sideM, pace: 'pipe' } });
    }
  }
  return out;
}

const samePoint = (p: MapPoint, q: MapPoint): boolean => p.x === q.x && p.y === q.y;

/**
 * Turn each fence piece so the work runs on from the piece before it.
 * `from` is where the line had got to (a job in progress), or null for a
 * new line. A new line starts at the end of its first piece that the
 * second piece does not touch, or, for a line of one piece, the end
 * nearer the player.
 */
export function orientPieces(pieces: Piece[], from: MapPoint | null, playerAt: MapPoint): void {
  let last = from;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    if (samePoint(p.a, p.b)) {
      last = p.b;
      continue;
    }
    let flip: boolean;
    if (last) flip = squaresBetween(p.b, last) < squaresBetween(p.a, last);
    else {
      const next = pieces[i + 1];
      if (next) {
        const mid = { x: (next.a.x + next.b.x) / 2, y: (next.a.y + next.b.y) / 2 };
        // Start at the end further from the next piece.
        flip = squaresBetween(p.a, mid) < squaresBetween(p.b, mid);
      } else flip = squaresBetween(p.b, playerAt) < squaresBetween(p.a, playerAt);
    }
    if (flip) [p.a, p.b] = [p.b, p.a];
    last = p.b;
  }
}

/** The fence segments or squares an action asks for, in the order they were drawn. */
export function askedPieces(farm: FarmState, action: Action, playerAt: MapPoint): JobPiece[] {
  switch (action.type) {
    case 'buildFence':
    case 'removeFence':
      return action.edges.map((edge) => ({ edge }));
    case 'rollUpTape': {
      // The whole run, from one end to the other, starting at the end nearer the player.
      const run = tapeRun(farm.layout.fences, action.edge).sort((p, q) => p.index - q.index);
      const first = edgeEnds(run[0]!)[0];
      const last = edgeEnds(run.at(-1)!)[1];
      if (squaresBetween(last, playerAt) < squaresBetween(first, playerAt)) run.reverse();
      return run.map((edge) => ({ edge }));
    }
    case 'layPipe':
      return action.cells.map((cell) => ({ cell }));
    default:
      return [];
  }
}

/** The action that does some of a line job's pieces, and the job name it reports under. */
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

/** True for the actions that are built piece by piece. */
export const isLineAction = (action: Action): boolean => action.type in LINE_WHAT;

/** What a line job's time is for. */
export const lineWhat = (action: Action): JobWorkPart['what'] => LINE_WHAT[action.type] ?? 'build';

// ---------------------------------------------------------------------------
// Jobs done in one piece
// ---------------------------------------------------------------------------

/** Where a mob is, as the nearest place to the player: a square of its grazing area, or the yards. Null in the feedlot. */
function mobPlace(farm: FarmState, survey: Survey, m: FarmMob, from: MapPoint): MapPoint | null {
  if (m.where.kind === 'lot') return null;
  if (m.where.kind === 'yards') return squareCentre(farm.buildings.yards);
  const area = survey.topology.areas[areaIdOf(survey, m)]!;
  return squareCentre(nearestSquare(area.cells, from));
}

/** Minutes to muster a mob. A mob in the yards or the feedlot is already in hand. */
function musterOf(survey: Survey, m: FarmMob): number {
  if (m.where.kind !== 'paddock') return 0;
  return musterMinutes(survey.topology.areas[areaIdOf(survey, m)]!.ha);
}

const part = (what: JobWorkPart['what'], minutes: number): JobWorkPart => ({ what, minutes });

/** A job at one place with one lot of work. */
const oneSite = (site: MapPoint | null, parts: JobWorkPart[]): JobSpec => ({
  kind: 'whole',
  sites: site ? [site] : [],
  endAt: null,
  parts,
  oneDay: false,
});

const midpoint = (e: EdgeRef): MapPoint => {
  const [a, b] = edgeEnds(e);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

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

/** The places a job on several mobs visits, each the nearest point of the mob's ground to the place before. */
function mobSites(
  farm: FarmState,
  survey: Survey,
  mobs: readonly FarmMob[],
  from: MapPoint,
): MapPoint[] {
  const sites: MapPoint[] = [];
  let at = from;
  for (const m of mobs) {
    const p = mobPlace(farm, survey, m, at);
    if (!p) continue;
    sites.push(p);
    at = p;
  }
  return sites;
}

/**
 * The job an action is: its kind, its place and its work.
 *
 * `before` is the farm as it stands, `trial` the action tried on a copy
 * with no clock, and `playerAt` where the player is.
 */
export function specFor(
  before: FarmState,
  action: Action,
  trial: ActionDone,
  playerAt: MapPoint,
): JobSpec {
  const T = JOB_TIMES;
  const survey = surveyOf(before);
  const sideM = before.layout.scale.sideM;
  const mobById = (id: number): FarmMob => before.mobs.find((m) => m.id === id)!;

  switch (action.type) {
    // ---- Line jobs
    case 'buildFence':
    case 'removeFence':
    case 'rollUpTape':
    case 'layPipe': {
      const pieces = linePieces(before, trial.farm, action, askedPieces(before, action, playerAt));
      orientPieces(pieces, null, playerAt);
      return { kind: 'line', what: lineWhat(action), pieces };
    }

    // ---- Contractors
    case 'sow':
    case 'harvest':
      return { kind: 'contractor' };

    // ---- Stock
    case 'buyCattle':
      // A day at the saleyard, travel included. It can't be split over two days.
      return {
        kind: 'whole',
        sites: [],
        endAt: homesteadPoint(before),
        parts: [part('saleyard', T.saleyardBuyMin.value)],
        oneDay: true,
      };
    case 'sellAnimals':
    case 'sellGroup':
    case 'sellClass': {
      // Muster each mob that has cattle going, then draft and load.
      const lost = mobsThatLost(before, trial.farm);
      const areas = new Set<number>();
      let muster = 0;
      let head = 0;
      for (const { mob, head: n } of lost) {
        head += n;
        if (mob.where.kind !== 'paddock') continue;
        const id = areaIdOf(survey, mob);
        if (areas.has(id)) continue;
        areas.add(id);
        muster += musterOf(survey, mob);
      }
      return {
        kind: 'whole',
        sites: mobSites(
          before,
          survey,
          lost.map((l) => l.mob),
          playerAt,
        ),
        endAt: null,
        parts: [
          part('muster', muster),
          part('yard-work', T.sellBaseMin.value),
          part('head', (head / 10) * T.sellMinPer10Head.value),
        ],
        oneDay: false,
      };
    }
    case 'moveMob':
    case 'moveCattle': {
      // Today's simple rule: drive out, 15 minutes for each mob cattle are
      // taken from, and a minute for each 100 head. Walking the route
      // through gates is the next part of this milestone: its time goes in
      // the 'walk' part, which is 0 until then.
      const lost = mobsThatLost(before, trial.farm);
      const head = lost.reduce((n, l) => n + l.head, 0);
      const moved = trial.events.find((e) => e.type === 'mob-moved');
      const endAt =
        moved && moved.type === 'mob-moved' && moved.where.kind === 'paddock'
          ? squareCentre(moved.where.anchor)
          : null;
      return {
        kind: 'whole',
        sites: mobSites(
          before,
          survey,
          lost.map((l) => l.mob),
          playerAt,
        ),
        endAt,
        parts: [
          part('settle', T.moveMobSettleMin.value * Math.max(1, lost.length)),
          part('head', (head / 100) * T.moveMobMinPer100Head.value),
          part('walk', 0),
        ],
        oneDay: false,
      };
    }
    case 'setSupplement': {
      // Taking a mob off its supplement is a decision, not a job. Builder's rule.
      if (action.supp === 'none') return { kind: 'free' };
      return oneSite(mobPlace(before, survey, mobById(action.mob), playerAt), [
        part('feed-out', T.feedOutMin.value),
      ]);
    }
    case 'wean': {
      // "0.5 min per head": every head in the mob goes through the draft, calves included.
      const m = mobById(action.mob);
      return oneSite(mobPlace(before, survey, m, playerAt), [
        part('muster', musterOf(survey, m)),
        part('yard-work', T.weanBaseMin.value),
        part('head', m.animals.length * T.weanMinPerHead.value),
      ]);
    }
    case 'markCalves': {
      const m = mobById(action.mob);
      const marked = trial.events.find((e) => e.type === 'calves-marked');
      const calves = marked && marked.type === 'calves-marked' ? marked.count : 0;
      return oneSite(mobPlace(before, survey, m, playerAt), [
        part('muster', musterOf(survey, m)),
        part('head', calves * T.markMinPerCalf.value),
      ]);
    }

    // ---- Gates and repairs
    case 'placeGate':
    case 'removeGate':
      // Builder's rule: taking a gate out takes as long as hanging it.
      return oneSite(midpoint(action.edge), [part('gate', gateMinutes('swing'))]);
    case 'setGate':
      return oneSite(midpoint(action.edge), [part('gate', T.gateOpenShutMin.value)]);
    case 'fixFence': {
      // One segment put back up, at the pace of its kind.
      const pace: Pace =
        getEdge(before.layout.fences, action.edge) === EDGE.electricDown ? 'electric' : 'tape';
      return oneSite(midpoint(action.edge), [part('build', sideM / metresPerMinute(pace, 1))]);
    }

    // ---- Water
    case 'placeTrough':
    case 'removeTrough':
      return oneSite(squareCentre(action.cell), [part('trough', T.troughMin.value)]);
    case 'moveTrough':
      // Builder's rule: moving a fixed trough takes as long as fitting one.
      return {
        kind: 'whole',
        sites: [squareCentre(action.from), squareCentre(action.to)],
        endAt: null,
        parts: [part('trough', T.troughMin.value)],
        oneDay: false,
      };
    case 'placeFenceHub':
    case 'removeHub':
      return oneSite(vertexPoint(action.vertex), [part('trough', T.troughMin.value)]);
    case 'placeSquareHub': {
      // A trough, if the square had none, and a swing gate on each side that got one.
      const built = trial.events.find((e) => e.type === 'layout-job');
      const detail = built && built.type === 'layout-job' ? built.detail : {};
      return oneSite(squareCentre(action.cell), [
        part('trough', detail.troughAdded ? T.troughMin.value : 0),
        part('gate', Number(detail.gates ?? 0) * gateMinutes('swing')),
      ]);
    }
    case 'placePortable':
      return oneSite(squareCentre(action.cell), [
        part('portable-trough', T.portableTroughMin.value),
      ]);
    case 'movePortable': {
      const pt = before.layout.water.ports.find((p) => p.id === action.port)!;
      return {
        kind: 'whole',
        sites: [squareCentre(pt.cell), squareCentre(action.cell)],
        endAt: null,
        parts: [part('portable-trough', T.portableTroughMin.value)],
        oneDay: false,
      };
    }
    case 'refillPortable':
    case 'removePortable': {
      const pt = before.layout.water.ports.find((p) => p.id === action.port)!;
      return oneSite(squareCentre(pt.cell), [part('portable-trough', T.portableTroughMin.value)]);
    }

    // Jobs in progress and bookings are handled before a job is looked up.
    case 'continueJob':
    case 'cancelJob':
    case 'cancelBooking':
      return { kind: 'free' };
  }
}
