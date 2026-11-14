/**
 * Doing a job on the farm clock (PRD 5.1 and 5.4, as Claudia simplified
 * them on 14 Nov 2026; docs/MODEL.md, section 9).
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
 *   2. Its work is looked up (spec.ts). A job's time is its work only:
 *      there is no driving and no drive home.
 *   3. A job done in one go is done if it fits in the light left today.
 *      If it does not, it is refused, with how long it takes.
 *   4. A line of fence, tape or pipe: the whole pieces that fit are built,
 *      in the order drawn, and charged. The rest is not built and not
 *      remembered. The player draws it again another day.
 *
 * Nothing carries over from one day to the next. There are no jobs in
 * progress.
 */

// The one place that may use the unclocked pieces: it puts them behind the farm clock.
// eslint-disable-next-line no-restricted-imports
import { recordAction, refusedOutright, tryAction, type ActionEnv } from '../actions/apply';
import type {
  Action,
  ActionDone,
  ActionRefusal,
  ActionRefusalReason,
  ActionResult,
  JobCard,
  JobPreview,
} from '../actions/types';
import { durationText } from '../daylight/daylight';
import { dayMinutes, timeNow } from '../sim/clock';
import type { FarmEvent } from '../sim/events';
import type { FarmState } from '../sim/state';
import { partAction, pieceMinutes, specFor, type JobSpec } from './spec';

/** Smaller than this is no time at all: it keeps rounding from starting or stopping a job. */
export const NO_TIME = 1e-6;

/** What the player is told when a job, or part of one, does not fit in today's light. */
export const NOT_TODAY = "You don't have enough time to do this today.";

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

/** Move the clock on by a job's work. */
function spendLight(farm: FarmState, minutes: number): void {
  farm.clock.used = Math.min(dayMinutes(farm), farm.clock.used + minutes);
}

/** Give a mob's arrival its time of day, so the day's grazing can be split there later. */
function stampMoves(events: readonly FarmEvent[], at: number): void {
  for (const e of events) if (e.type === 'mob-moved') e.at = at;
}

/** Finish a job: move the clock, record it with its times, and make the card. */
function finish(
  before: FarmState,
  next: FarmState,
  action: Action,
  did: readonly FarmEvent[],
  light: Light,
  workMin: number,
  card: Pick<JobCard, 'outcome' | 'totalWorkMin' | 'parts' | 'cost'> &
    Partial<Pick<JobCard, 'line' | 'notToday'>>,
): Worked {
  // Stock booked onto a sale, and cattle on their way: the card says so.
  const sale = did.find((e) => e.type === 'sale-booked');
  const buy = did.find((e) => e.type === 'cattle-on-the-way');
  const extra: Partial<Pick<JobCard, 'booking' | 'arrival' | 'plan'>> = {};
  const set = did.find((e) => e.type === 'plan-set');
  const resumed = did.find((e) => e.type === 'plan-resumed');
  if (set?.type === 'plan-set') {
    extra.plan = {
      template: set.template,
      step: set.step,
      dryAreas: set.dryAreas,
      joins: set.joins,
    };
  } else if (resumed?.type === 'plan-resumed') {
    extra.plan = {
      template: resumed.template,
      step: resumed.step,
      dryAreas: [],
      joins: resumed.joins,
    };
  }
  if (sale?.type === 'sale-booked') {
    extra.booking = {
      head: sale.head,
      calvesAtFoot: sale.calvesAtFoot,
      saleDay: sale.saleDay,
      date: sale.saleDate,
      daysAway: sale.daysAway,
      nothingPaidNow: true,
      priceSetOnSaleDay: true,
    };
  }
  if (buy?.type === 'cattle-on-the-way') {
    extra.arrival = {
      arriveDay: buy.arriveDay,
      date: buy.arriveDate,
      head: buy.qty,
    };
  }
  const start = light.now;
  const end = start + workMin;
  spendLight(next, workMin);
  stampMoves(did, end);
  const events: FarmEvent[] = [];
  if (card.outcome !== 'free') {
    const worked: Extract<FarmEvent, { type: 'job-worked' }> = {
      type: 'job-worked',
      action: action.type,
      start,
      end,
      workMin,
      finished: card.outcome === 'done',
    };
    if (card.line) {
      worked.pieces = {
        built: card.line.fits.pieces.length,
        notBuilt: card.line.doesNotFit.pieces.length,
      };
    }
    events.push(worked);
  }
  events.push(...did);
  recordAction(next, action, events, { at: { start, end } });
  const leftAfter = Math.max(0, light.dayMin - next.clock.used);
  return {
    ok: true,
    farm: next,
    events,
    card: {
      action: action.type,
      startsAt: start,
      endsAt: end,
      workMin,
      dayMin: light.dayMin,
      usedBeforeMin: light.used,
      leftAfterMin: leftAfter,
      fitsToday: card.outcome !== 'part',
      // A line cut short has taken all the light it can use: what is left
      // is less than its next piece needs.
      usesRestOfDay: card.outcome === 'part' || (card.outcome === 'done' && leftAfter <= NO_TIME),
      costToday: before.cash - next.cash,
      ...extra,
      ...card,
    },
  };
}

// ---------------------------------------------------------------------------
// A job done in one go
// ---------------------------------------------------------------------------

function doWhole(
  farm: FarmState,
  action: Action,
  trial: ActionDone,
  spec: Extract<JobSpec, { kind: 'whole' }>,
): Worked | ActionRefusal {
  const light = lightNow(farm);
  if (light.left <= NO_TIME) return noDaylight();
  const total = spec.parts.reduce((t, p) => t + p.minutes, 0);
  let workMin = total;
  if (total > light.dayMin + NO_TIME) {
    // Builder's rule, so no job is impossible: a job that needs more than a
    // whole day's light can be done at first light, before anything else
    // that day, and it uses the whole day.
    if (light.used > NO_TIME) {
      return refuse(
        'not-enough-daylight',
        `${NOT_TODAY} It takes ${durationText(total)}, which is more than a day's light. It can be done at first light, before anything else that day, and it takes the whole day.`,
      );
    }
    workMin = light.dayMin;
  } else if (total > light.left + NO_TIME) {
    return refuse(
      'not-enough-daylight',
      `${NOT_TODAY} It takes ${durationText(total)} and there is ${durationText(light.left)} of light left.`,
    );
  }
  return finish(farm, trial.farm, action, trial.events, light, workMin, {
    outcome: 'done',
    totalWorkMin: total,
    parts: spec.parts.map((p) => ({ what: p.what, minutes: p.minutes })),
    cost: farm.cash - trial.farm.cash,
  });
}

// ---------------------------------------------------------------------------
// A line of fence, tape or pipe
// ---------------------------------------------------------------------------

function doLine(
  farm: FarmState,
  action: Action,
  env: ActionEnv,
  trial: ActionDone,
  spec: Extract<JobSpec, { kind: 'line' }>,
): Worked | ActionRefusal {
  const light = lightNow(farm);
  if (light.left <= NO_TIME) return noDaylight();
  const sideM = farm.layout.scale.sideM;
  const minutes = spec.pieces.map((p) => pieceMinutes(p.work, light.dayMin));
  const total = minutes.reduce((t, m) => t + m, 0);
  // The whole pieces that fit in the light left, in the order drawn.
  let fits = 0;
  let workMin = 0;
  while (fits < minutes.length && workMin + minutes[fits]! <= light.left + NO_TIME) {
    workMin += minutes[fits]!;
    fits++;
  }
  if (fits === 0) {
    return refuse(
      'not-enough-daylight',
      `${NOT_TODAY} The first piece of the line takes ${durationText(minutes[0]!)} and there is ${durationText(light.left)} of light left.`,
    );
  }
  const refs = spec.pieces.map((p) => p.ref);
  const line = {
    fits: { pieces: refs.slice(0, fits), metres: fits * sideM },
    doesNotFit: { pieces: refs.slice(fits), metres: (refs.length - fits) * sideM },
  };
  const parts = [{ what: spec.what, minutes: total }];
  const cost = farm.cash - trial.farm.cash;
  if (fits === refs.length) {
    return finish(farm, trial.farm, action, trial.events, light, workMin, {
      outcome: 'done',
      totalWorkMin: total,
      parts,
      cost,
      line,
    });
  }
  // Build the pieces that fit, by the same rules as building them all. The
  // rest is not built and not remembered.
  const some = tryAction(farm, partAction(action, line.fits.pieces), env, { label: action.type });
  if (!some.ok) return some;
  return finish(farm, some.farm, action, some.events, light, workMin, {
    outcome: 'part',
    totalWorkMin: total,
    parts,
    cost,
    line,
    notToday: { reason: 'not-enough-daylight', message: NOT_TODAY },
  });
}

// ---------------------------------------------------------------------------
// The one path
// ---------------------------------------------------------------------------

/** Do a job on the clock. The preview and the real thing both come through here. */
function work(farm: FarmState, action: Action, env: ActionEnv): Worked | ActionRefusal {
  const no = refusedOutright(farm, action, env);
  if (no) return no;
  // Try it all at once, with no clock: the rules, the bank and the cost.
  const trial = tryAction(farm, action, env, { clocked: true });
  if (!trial.ok) return trial;
  const spec = specFor(farm, action, trial);
  switch (spec.kind) {
    case 'free':
      // It takes none of the day, so it can be done after last light too.
      return finish(farm, trial.farm, action, trial.events, lightNow(farm), 0, {
        outcome: 'free',
        totalWorkMin: 0,
        parts: [],
        cost: farm.cash - trial.farm.cash,
      });
    case 'whole':
      return doWhole(farm, action, trial, spec);
    case 'line':
      return doLine(farm, action, env, trial, spec);
  }
}

/**
 * Do an action. Returns the farm after it, what happened and the job card,
 * or a refusal with the reason. The farm passed in is never changed.
 *
 * Every job takes its time off today's light. There is no way to switch
 * the clock off from here: whatever is in `env`, the job is done on the
 * clock.
 */
export function applyAction(farm: FarmState, action: Action, env: ActionEnv = {}): ActionResult {
  const done = work(farm, action, env);
  if (!done.ok) return done;
  return { ok: true, farm: done.farm, events: done.events, job: done.card };
}

/**
 * The job card for an action: the time it will take, the cost, how much
 * of today's light it uses and leaves, whether it fits today, and for a
 * line that is too long, the part that fits and the part that does not.
 * Nothing changes: looking is free.
 */
export function previewAction(farm: FarmState, action: Action, env: ActionEnv = {}): JobPreview {
  const done = work(farm, action, env);
  if (!done.ok) return done;
  return { ok: true, card: done.card };
}
