/**
 * Doing a job on the farm clock (PRD 5.1 and 5.4; docs/MODEL.md, section 9).
 *
 * `applyAction` is the player's way to do anything. It never changes the
 * farm it is given: it returns a copy with the job done and what happened,
 * or a refusal with a plain reason and nothing changed. `previewAction`
 * returns the job card for the same action, and changes nothing. Both run
 * the one function below (`work`), so the card can never disagree with
 * what happens.
 *
 * A job goes like this:
 *
 *   1. The action is tried all at once on a copy, with no clock
 *      (`tryAction`). That checks every rule and the bank, and gives the
 *      cost. A refusal there is the refusal here.
 *   2. Its place and its work are looked up (spec.ts).
 *   3. The player drives from where they are to the job. Enough light is
 *      kept back to drive home (one switch, `workRules.driveHome`).
 *   4. As much of the work as fits in what is left of today is done. A
 *      line of fence or pipe is built piece by piece in the order it was
 *      drawn and stops where the day is used up. Any other job takes
 *      effect when its last minute is done.
 *   5. What does not fit becomes a job in progress. It carries on when
 *      the player next spends daylight on it (`continueJob`), and can be
 *      given up (`cancelJob`).
 *
 * Money is charged as things are built: each part of a line when it is
 * built, anything else when it is finished. Sowing and harvest are booked
 * with a contractor: no time from the player, done a few days on, charged
 * then.
 */

import {
  applyInstant,
  recordAction,
  refusedOutright,
  tryAction,
  workingCopy,
  type ActionEnv,
  type PartOptions,
} from '../actions/apply';
import type {
  Action,
  ActionDone,
  ActionRefusal,
  ActionRefusalReason,
  ActionResult,
  JobCard,
  JobPreview,
  JobWorkPart,
} from '../actions/types';
import { JOB_TIMES } from '../data/jobTimes';
import { durationText } from '../daylight/daylight';
import { dayMinutes, homesteadPoint, lightOn, timeNow } from '../sim/clock';
import type { FarmEvent } from '../sim/events';
import { deepCopy, type FarmState, type JobInProgress, type MapPoint } from '../sim/state';
import {
  lineWhat,
  linePieces,
  orientPieces,
  partAction,
  pieceMinutes,
  specFor,
  type JobSpec,
  type Piece,
} from './spec';
import { driveMinutes, homeReserve, nearestOnLine, pointAlong, squaresBetween } from './travel';

/** Smaller than this is no time at all: it keeps rounding from starting or stopping a job. */
export const NO_TIME = 1e-6;

/** The most days ahead a job card looks when it counts the days a job still needs. */
const MOST_DAYS_AHEAD = 5000;

const refuse = (reason: ActionRefusalReason, message: string): ActionRefusal => ({
  ok: false,
  reason,
  message,
});

/** A job done on the clock: the farm after it, what happened, and the job card. */
interface Worked {
  ok: true;
  farm: FarmState;
  events: FarmEvent[];
  card: JobCard;
}

/** The share of a job in progress that is done, 0 to under 1. */
export function jobShare(job: JobInProgress): number {
  if (job.kind === 'whole') return job.part;
  return job.pieces > 0 ? (job.piecesDone + job.part) / job.pieces : 0;
}

/** The refusals that mean a line job has nothing left to do. */
const NOTHING_LEFT: ReadonlySet<string> = new Set([
  'nothing-to-build',
  'nothing-to-remove',
  'pipe-already-there',
]);

// ---------------------------------------------------------------------------
// The light there is to work in
// ---------------------------------------------------------------------------

/** Today's light as a job sees it. */
interface Light {
  dayMin: number;
  used: number;
  left: number;
  now: number;
}

function lightNow(farm: FarmState): Light {
  const dayMin = dayMinutes(farm);
  return {
    dayMin,
    used: farm.clock.used,
    left: Math.max(0, dayMin - farm.clock.used),
    now: timeNow(farm),
  };
}

const noDaylight = (): ActionRefusal =>
  refuse('no-daylight', 'It is last light. No more jobs can start today.');

function tooFar(light: Light, travel: number, home: number): ActionRefusal {
  if (travel <= NO_TIME && home > NO_TIME) {
    return refuse(
      'not-enough-daylight',
      `There is only enough light left today to drive home. The drive home takes ${durationText(home)} and there is ${durationText(light.left)} of light left.`,
    );
  }
  const drive =
    home > NO_TIME
      ? `The drive out takes ${durationText(travel)} and the drive home ${durationText(home)}.`
      : `The drive out takes ${durationText(travel)}.`;
  return refuse(
    'not-enough-daylight',
    `There is not enough light left today to get to that job. ${drive} There is ${durationText(light.left)} of light left.`,
  );
}

// ---------------------------------------------------------------------------
// A line of fence or pipe: how far it gets in a day
// ---------------------------------------------------------------------------

/** How far a line job gets in one day. */
interface LineDay {
  travel: number;
  /** The drive home from where the work stopped. 0 when the drive home is free. */
  home: number;
  /** Minutes worked. */
  worked: number;
  /** Whole pieces finished, and the share of the next one done. */
  pieces: number;
  part: number;
  finished: boolean;
  /** Where the work stopped. */
  at: MapPoint;
  /** False when there was no light to work in once the driving was allowed for. */
  started: boolean;
}

/** The nearest point of what is left of a line to a place. */
function nearestOfLine(pieces: readonly Piece[], part0: number, from: MapPoint): MapPoint {
  let best = pieces[0]!.a;
  let bestD = Infinity;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    const a = i === 0 ? pointAlong(p.a, p.b, part0) : p.a;
    const q = nearestOnLine(from, a, p.b);
    const d = squaresBetween(q, from);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/**
 * Work a line for a day: drive to its nearest point from `from`, then
 * build pieces in order for as long as the light `left` lasts. Where the
 * drive home must fit inside daylight, the work stops at the last point
 * the player can still be home from by last light.
 */
function lineDay(
  farm: FarmState,
  pieces: readonly Piece[],
  part0: number,
  from: MapPoint,
  left: number,
  dayMin: number,
): LineDay {
  const travel = driveMinutes(farm, from, nearestOfLine(pieces, part0, from));
  const homeFrom = (p: MapPoint): number => homeReserve(farm, [p]);
  // The light there is for the work and the drive home.
  const budget = left - travel;
  const first = pieces[0]!;
  const out: LineDay = {
    travel,
    home: 0,
    worked: 0,
    pieces: 0,
    part: part0,
    finished: false,
    at: pointAlong(first.a, first.b, part0),
    started: false,
  };
  out.home = homeFrom(out.at);
  out.started = budget - out.home > NO_TIME;
  if (!out.started) return out;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    const whole = pieceMinutes(p.work, dayMin);
    const done = i === 0 ? part0 : 0;
    // The work so far, the work to a share `t` of this piece, and the drive home from there.
    const usedAt = (t: number): number =>
      out.worked + whole * (t - done) + homeFrom(pointAlong(p.a, p.b, t));
    if (usedAt(1) <= budget + NO_TIME) {
      out.worked += whole * (1 - done);
      out.pieces++;
      out.part = 0;
      out.at = p.b;
      out.home = homeFrom(p.b);
      continue;
    }
    // The day is used up before this piece is finished. If there is no
    // light to start it (a gap in the line took the player further from
    // home), the work stops where it was.
    if (usedAt(done) > budget + NO_TIME) return out;
    // Otherwise it stops part-way along: the furthest point the player can
    // still get home from. Halving finds it, the same way every time.
    let lo = done;
    let hi = 1;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (usedAt(mid) <= budget) lo = mid;
      else hi = mid;
    }
    out.worked += whole * (lo - done);
    out.part = lo;
    out.at = pointAlong(p.a, p.b, lo);
    out.home = homeFrom(out.at);
    return out;
  }
  out.finished = true;
  return out;
}

/** More days a line needs after today, if each is spent on it from first light at the homestead. */
function lineDaysMore(farm: FarmState, pieces: readonly Piece[], part0: number): number {
  let rest = pieces;
  let part = part0;
  const home = homesteadPoint(farm);
  for (let d = 1; d <= MOST_DAYS_AHEAD; d++) {
    const dayMin = lightOn(farm, farm.day + d).minutes;
    const day = lineDay(farm, rest, part, home, dayMin, dayMin);
    if (day.finished) return d;
    if (!day.started) return MOST_DAYS_AHEAD;
    rest = rest.slice(day.pieces);
    part = day.part;
  }
  return MOST_DAYS_AHEAD;
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/** A card for something that takes no time. */
function freeCard(
  farm: FarmState,
  action: Action,
  outcome: 'free' | 'booked',
  cost: number,
): JobCard {
  const light = lightNow(farm);
  return {
    action: action.type,
    outcome,
    startsAt: light.now,
    endsAt: light.now,
    travelMin: 0,
    workMin: 0,
    homeMin: 0,
    dayMin: light.dayMin,
    usedBeforeMin: light.used,
    leftAfterMin: light.left,
    fitsToday: true,
    totalWorkMin: 0,
    parts: [],
    doneShare: 1,
    moreDays: 0,
    cost,
    costToday: outcome === 'free' ? cost : 0,
  };
}

/** Move the clock on by a job's driving and work, and put the player where it left them. */
function spendLight(farm: FarmState, minutes: number, at: MapPoint | null): void {
  farm.clock.used = Math.min(dayMinutes(farm), farm.clock.used + minutes);
  if (at) farm.clock.at = { x: at.x, y: at.y };
}

/** The job in progress with an id, on a farm. */
const jobOn = (farm: FarmState, id: number): JobInProgress | undefined =>
  farm.jobs.find((j) => j.id === id);

/** Give a mob's arrival its time of day, so the day's grazing can be split there later. */
function stampMoves(events: readonly FarmEvent[], at: number): void {
  for (const e of events) if (e.type === 'mob-moved') e.at = at;
}

// ---------------------------------------------------------------------------
// A job done in one piece
// ---------------------------------------------------------------------------

function doWhole(
  farm: FarmState,
  action: Action,
  trial: ActionDone,
  spec: Extract<JobSpec, { kind: 'whole' }>,
  job: JobInProgress | null,
): Worked | ActionRefusal {
  const light = lightNow(farm);
  if (light.left <= NO_TIME) return noDaylight();
  const total = spec.parts.reduce((t, p) => t + p.minutes, 0);
  const part0 = job ? job.part : 0;
  const need = total * (1 - part0);

  // The drive: to each place in turn. Then the light kept back to get home.
  let travel = 0;
  let at = farm.clock.at;
  for (const site of spec.sites) {
    travel += driveMinutes(farm, at, site);
    at = site;
  }
  // Finished, the job leaves the player at `endAt`. Stopped part-way, it
  // leaves them at the last place visited. The light kept back for the
  // drive home is from wherever that is.
  const endAt = spec.endAt ?? at;
  const homeDone = homeReserve(farm, [endAt]);
  const homePart = homeReserve(farm, [at]);
  const finished = need <= light.left - travel - homeDone + NO_TIME;
  const home = finished ? homeDone : homePart;
  const room = light.left - travel - home;
  if (room < -NO_TIME || (need > NO_TIME && room <= NO_TIME)) return tooFar(light, travel, home);
  if (spec.oneDay && !finished) {
    return refuse(
      'not-enough-daylight',
      `A trip to the saleyards takes ${durationText(need)}. There is ${durationText(light.left)} of light left today.`,
    );
  }
  const worked = finished ? need : Math.min(need, Math.max(0, room));
  const start = light.now;
  const end = start + travel + worked;
  const cost = farm.cash - trial.farm.cash;

  let next: FarmState;
  let events: FarmEvent[];
  let jobId: number | undefined;
  let doneShare = 1;
  let moreDays = 0;
  if (finished) {
    // The work is done, so the action takes effect: the farm is the trial.
    next = trial.farm;
    if (job) next.jobs = next.jobs.filter((j) => j.id !== job.id);
    spendLight(next, travel + worked, endAt);
    stampMoves(trial.events, end);
    events = [
      {
        type: 'job-worked',
        action: action.type,
        jobId: job ? job.id : null,
        start,
        end,
        travelMin: travel,
        workMin: worked,
        finished: true,
        doneShare: 1,
      },
      ...trial.events,
    ];
  } else {
    // The time goes in. Nothing takes effect until the last minute is done.
    next = workingCopy(farm);
    let mine: JobInProgress;
    if (job) mine = jobOn(next, job.id)!;
    else {
      mine = {
        id: next.nextJobId++,
        action: deepCopy(action),
        startedDay: next.day,
        kind: 'whole',
        left: [],
        part: 0,
        lastEnd: null,
        piecesDone: 0,
        pieces: 0,
        spent: 0,
        workedMin: 0,
        travelMin: 0,
        tapeFeePaid: false,
      };
      next.jobs.push(mine);
    }
    mine.part = total > 0 ? Math.min(1 - 1e-12, part0 + worked / total) : 0;
    mine.workedMin += worked;
    mine.travelMin += travel;
    jobId = mine.id;
    doneShare = mine.part;
    spendLight(next, travel + worked, at);
    events = [
      {
        type: 'job-worked',
        action: action.type,
        jobId,
        start,
        end,
        travelMin: travel,
        workMin: worked,
        finished: false,
        doneShare,
      },
    ];
    // Later days: out from the homestead, the same round, and home again.
    let rest = need - worked;
    const homePt = homesteadPoint(farm);
    let out = 0;
    let p = homePt;
    for (const site of spec.sites) {
      out += driveMinutes(farm, p, site);
      p = site;
    }
    const back = homeReserve(farm, [spec.endAt ?? p]);
    moreDays = MOST_DAYS_AHEAD;
    for (let d = 1; d <= MOST_DAYS_AHEAD; d++) {
      const dayRoom = lightOn(farm, farm.day + d).minutes - out - back;
      if (dayRoom <= NO_TIME) break;
      rest -= dayRoom;
      if (rest <= NO_TIME) {
        moreDays = d;
        break;
      }
    }
  }
  const logged: Action = job ? { type: 'continueJob', job: job.id } : action;
  recordAction(next, logged, events, { at: { start, end }, job: jobId });
  const card: JobCard = {
    action: action.type,
    outcome: finished ? 'done' : 'part',
    startsAt: start,
    endsAt: end,
    travelMin: travel,
    workMin: worked,
    homeMin: home,
    dayMin: light.dayMin,
    usedBeforeMin: light.used,
    leftAfterMin: Math.max(0, light.dayMin - next.clock.used),
    fitsToday: finished,
    totalWorkMin: need,
    parts: spec.parts.map((p) => ({ what: p.what, minutes: p.minutes })),
    doneShare,
    moreDays,
    cost,
    costToday: finished ? cost : 0,
  };
  if (jobId !== undefined) card.jobId = jobId;
  return { ok: true, farm: next, events, card };
}

// ---------------------------------------------------------------------------
// A line of fence or pipe
// ---------------------------------------------------------------------------

/** True if a part's events show the $10 tape fee was charged. */
function tapeFeeIn(events: readonly FarmEvent[]): boolean {
  for (const e of events) {
    if (e.type !== 'layout-job') continue;
    if (Number(e.detail.tapeFromRollM ?? 0) > 0 || Number(e.detail.tapeToRollM ?? 0) > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Work a line job today. `whole` is the rest of the job tried all at once
 * (the whole job, for a new one). `pieces` are its pieces in order, turned
 * to run on from where the line had got to.
 */
function doLine(
  farm: FarmState,
  action: Action,
  env: ActionEnv,
  whole: ActionDone,
  pieces: Piece[],
  job: JobInProgress | null,
  opts: PartOptions,
): Worked | ActionRefusal {
  const light = lightNow(farm);
  if (light.left <= NO_TIME) return noDaylight();
  const part0 = job ? job.part : 0;
  const day = lineDay(farm, pieces, part0, farm.clock.at, light.left, light.dayMin);
  if (!day.started) return tooFar(light, day.travel, day.home);
  const sideM = farm.layout.scale.sideM;
  const start = light.now;
  const end = start + day.travel + day.worked;
  let totalWork = 0;
  for (let i = 0; i < pieces.length; i++) {
    totalWork += pieceMinutes(pieces[i]!.work, light.dayMin) * (i === 0 ? 1 - part0 : 1);
  }

  let next: FarmState;
  let built: FarmEvent[] = [];
  let jobId: number | undefined;
  let doneShare = 1;
  let moreDays = 0;
  if (day.finished) {
    next = whole.farm;
    built = whole.events;
    if (job) next.jobs = next.jobs.filter((j) => j.id !== job.id);
  } else {
    if (day.pieces > 0) {
      // Build the pieces that fitted, by the same rules as building them all.
      const some = tryAction(
        farm,
        partAction(
          action,
          pieces.slice(0, day.pieces).map((p) => p.ref),
        ),
        env,
        opts,
      );
      if (!some.ok) return some;
      next = some.farm;
      built = some.events;
    } else next = workingCopy(farm);
    let mine: JobInProgress;
    if (job) mine = jobOn(next, job.id)!;
    else {
      mine = {
        id: next.nextJobId++,
        action: deepCopy(action),
        startedDay: next.day,
        kind: 'line',
        left: [],
        part: 0,
        lastEnd: null,
        piecesDone: 0,
        pieces: pieces.length,
        spent: 0,
        workedMin: 0,
        travelMin: 0,
        tapeFeePaid: false,
      };
      next.jobs.push(mine);
    }
    const rest = pieces.slice(day.pieces);
    mine.left = rest.map((p) => deepCopy(p.ref));
    mine.part = day.part;
    // Where the next piece starts from, so the line carries on the same way round.
    mine.lastEnd = { x: rest[0]!.a.x, y: rest[0]!.a.y };
    // Pieces that turned out not to need doing count as done.
    mine.piecesDone = Math.max(0, mine.pieces - rest.length);
    mine.spent += farm.cash - next.cash;
    mine.workedMin += day.worked;
    mine.travelMin += day.travel;
    mine.tapeFeePaid = mine.tapeFeePaid || tapeFeeIn(built);
    jobId = mine.id;
    doneShare = jobShare(mine);
    moreDays = lineDaysMore(farm, rest, day.part);
  }
  spendLight(next, day.travel + day.worked, day.at);
  const events: FarmEvent[] = [
    {
      type: 'job-worked',
      action: action.type,
      jobId: job ? job.id : (jobId ?? null),
      start,
      end,
      travelMin: day.travel,
      workMin: day.worked,
      finished: day.finished,
      doneShare,
    },
    ...built,
  ];
  const logged: Action = job ? { type: 'continueJob', job: job.id } : action;
  recordAction(next, logged, events, { at: { start, end }, job: jobId });
  const metresLeft = (pieces.length - part0) * sideM;
  const card: JobCard = {
    action: action.type,
    outcome: day.finished ? 'done' : 'part',
    startsAt: start,
    endsAt: end,
    travelMin: day.travel,
    workMin: day.worked,
    homeMin: day.home,
    dayMin: light.dayMin,
    usedBeforeMin: light.used,
    leftAfterMin: Math.max(0, light.dayMin - next.clock.used),
    fitsToday: day.finished,
    totalWorkMin: totalWork,
    parts: [{ what: lineWhat(action), minutes: totalWork } satisfies JobWorkPart],
    doneShare,
    moreDays,
    cost: farm.cash - whole.farm.cash,
    costToday: farm.cash - next.cash,
    line: {
      metres: metresLeft,
      metresToday: (day.pieces + day.part - part0) * sideM,
      pieces: pieces.length,
      piecesToday: day.pieces,
    },
  };
  if (jobId !== undefined) card.jobId = jobId;
  return { ok: true, farm: next, events, card };
}

// ---------------------------------------------------------------------------
// Jobs in progress and bookings
// ---------------------------------------------------------------------------

/** A job in progress ends without being finished. Takes no time. */
function stopJob(
  farm: FarmState,
  job: JobInProgress,
  logged: Action,
  why: 'cancelled' | 'cannot-carry-on',
  no?: ActionRefusal,
): Worked {
  const next = workingCopy(farm);
  next.jobs = next.jobs.filter((j) => j.id !== job.id);
  const event: Extract<FarmEvent, { type: 'job-stopped' }> = {
    type: 'job-stopped',
    jobId: job.id,
    action: job.action.type,
    why,
    spent: job.spent,
  };
  if (no) {
    event.reason = no.reason;
    event.message = no.message;
  }
  const now = timeNow(farm);
  recordAction(next, logged, [event], { at: { start: now, end: now } });
  return { ok: true, farm: next, events: [event], card: freeCard(farm, logged, 'free', 0) };
}

/** Spend what is left of today on a job in progress. */
function carryOn(
  farm: FarmState,
  action: Extract<Action, { type: 'continueJob' }>,
  env: ActionEnv,
): Worked | ActionRefusal {
  const job = jobOn(farm, action.job);
  if (!job) return refuse('no-such-job', 'That job is not in progress on this farm.');
  if (lightNow(farm).left <= NO_TIME) return noDaylight();

  if (job.kind === 'whole') {
    const trial = tryAction(farm, job.action, env);
    if (!trial.ok) {
      // The bank may lend again another day, so the job waits. Anything else and it can't be done.
      if (trial.reason === 'bank-limit') return trial;
      return stopJob(farm, job, action, 'cannot-carry-on', trial);
    }
    const spec = specFor(farm, job.action, trial, farm.clock.at);
    if (spec.kind !== 'whole') return stopJob(farm, job, action, 'cannot-carry-on');
    return doWhole(farm, job.action, trial, spec, job);
  }

  const opts: PartOptions = { tapeFeePaid: job.tapeFeePaid, label: job.action.type };
  const rest = partAction(job.action, job.left);
  const whole = tryAction(farm, rest, env, opts);
  if (!whole.ok) {
    if (whole.reason === 'bank-limit') return whole;
    if (!NOTHING_LEFT.has(whole.reason))
      return stopJob(farm, job, action, 'cannot-carry-on', whole);
    // What was left has been done some other way. The job is finished.
    const next = workingCopy(farm);
    next.jobs = next.jobs.filter((j) => j.id !== job.id);
    const now = timeNow(farm);
    const events: FarmEvent[] = [
      {
        type: 'job-worked',
        action: job.action.type,
        jobId: job.id,
        start: now,
        end: now,
        travelMin: 0,
        workMin: 0,
        finished: true,
        doneShare: 1,
      },
    ];
    recordAction(next, action, events, { at: { start: now, end: now } });
    return { ok: true, farm: next, events, card: freeCard(farm, job.action, 'free', 0) };
  }
  const pieces = linePieces(farm, whole.farm, job.action, job.left);
  orientPieces(pieces, job.lastEnd, farm.clock.at);
  // A piece that no longer needs doing takes its share of work with it.
  const sameFirst =
    pieces.length > 0 &&
    job.left.length > 0 &&
    JSON.stringify(pieces[0]!.ref) === JSON.stringify(job.left[0]);
  const live: JobInProgress = sameFirst ? job : { ...job, part: 0 };
  return doLine(farm, job.action, env, whole, pieces, live, opts);
}

function cancelJob(
  farm: FarmState,
  action: Extract<Action, { type: 'cancelJob' }>,
): Worked | ActionRefusal {
  const job = jobOn(farm, action.job);
  if (!job) return refuse('no-such-job', 'That job is not in progress on this farm.');
  return stopJob(farm, job, action, 'cancelled');
}

function cancelBooking(
  farm: FarmState,
  action: Extract<Action, { type: 'cancelBooking' }>,
): Worked | ActionRefusal {
  const booking = farm.bookings.find((b) => b.id === action.booking);
  if (!booking) return refuse('no-such-booking', 'There is no booking with that number.');
  const next = workingCopy(farm);
  next.bookings = next.bookings.filter((b) => b.id !== booking.id);
  const events: FarmEvent[] = [
    { type: 'booking-cancelled', bookingId: booking.id, action: booking.action.type },
  ];
  const now = timeNow(farm);
  recordAction(next, action, events, { at: { start: now, end: now } });
  return { ok: true, farm: next, events, card: freeCard(farm, action, 'free', 0) };
}

/** Book a contractor: no time from the player, done a few days on, charged then. */
function book(farm: FarmState, action: Action, trial: ActionDone): Worked {
  const next = workingCopy(farm);
  const quote = farm.cash - trial.farm.cash;
  const booking = {
    id: next.nextBookingId++,
    action: deepCopy(action),
    bookedDay: next.day,
    dueDay: next.day + JOB_TIMES.contractorDays.value,
    quote,
  };
  next.bookings.push(booking);
  const events: FarmEvent[] = [
    {
      type: 'booking-made',
      bookingId: booking.id,
      action: action.type,
      dueDay: booking.dueDay,
      quote,
    },
  ];
  const now = timeNow(farm);
  recordAction(next, action, events, { at: { start: now, end: now } });
  const card = freeCard(farm, action, 'booked', quote);
  card.bookingId = booking.id;
  card.dueDay = booking.dueDay;
  return { ok: true, farm: next, events, card };
}

// ---------------------------------------------------------------------------
// The one path
// ---------------------------------------------------------------------------

/** Do a job on the clock. The preview and the real thing both come through here. */
function work(farm: FarmState, action: Action, env: ActionEnv): Worked | ActionRefusal {
  const no = refusedOutright(farm, action, env);
  if (no) return no;
  switch (action.type) {
    case 'continueJob':
      return carryOn(farm, action, env);
    case 'cancelJob':
      return cancelJob(farm, action);
    case 'cancelBooking':
      return cancelBooking(farm, action);
  }
  // Try it all at once, with no clock: the rules, the bank and the cost.
  const trial = tryAction(farm, action, env);
  if (!trial.ok) return trial;
  const spec = specFor(farm, action, trial, farm.clock.at);
  switch (spec.kind) {
    case 'free': {
      const now = timeNow(farm);
      recordAction(trial.farm, action, trial.events, { at: { start: now, end: now } });
      return {
        ok: true,
        farm: trial.farm,
        events: trial.events,
        card: freeCard(farm, action, 'free', farm.cash - trial.farm.cash),
      };
    }
    case 'contractor':
      return book(farm, action, trial);
    case 'whole':
      return doWhole(farm, action, trial, spec, null);
    case 'line':
      return doLine(farm, action, env, trial, spec.pieces, null, {});
  }
}

const usesJobs = (action: Action): boolean =>
  action?.type === 'continueJob' ||
  action?.type === 'cancelJob' ||
  action?.type === 'cancelBooking';

/**
 * Do an action. Returns the farm after it, what happened and the job card,
 * or a refusal with the reason. The farm passed in is never changed.
 *
 * Every job takes its time off today's light. What does not fit becomes a
 * job in progress. `env.instant` (calibration and tests only) does the
 * whole action at once with no clock.
 */
export function applyAction(farm: FarmState, action: Action, env: ActionEnv = {}): ActionResult {
  if (env.instant && !usesJobs(action)) return applyInstant(farm, action, env);
  const done = work(farm, action, env);
  if (!done.ok) return done;
  return { ok: true, farm: done.farm, events: done.events, job: done.card };
}

/**
 * The job card for an action: the time it will take (travel and work
 * apart), the cost, how much of today's light it uses and leaves, whether
 * it fits today, and if not how much is done today and how many more days
 * it needs. Nothing changes: looking is free.
 */
export function previewAction(farm: FarmState, action: Action, env: ActionEnv = {}): JobPreview {
  const done = work(farm, action, env);
  if (!done.ok) return done;
  return { ok: true, card: done.card };
}
