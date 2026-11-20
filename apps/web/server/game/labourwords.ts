import 'server-only';
import { createHash } from 'node:crypto';
import {
  JOB_TIMES,
  LABOUR,
  contractView,
  dateOn,
  jobSeekers,
  permanentMetresPerDay,
  previewAction,
  standingOf,
  teamMetresPerDay,
  workerReport,
  workforceView,
  type EdgeRef,
  type FarmEvent,
  type FarmState,
  type HandDuty,
  type HandView,
  type JobCard,
  type JobSeeker,
  type LabourEvent,
  type SourceEnv,
  type WorkerReportItem,
} from '@gg/engine';
import type {
  BubbleWire,
  ContractWire,
  DateParts,
  HandWire,
  PersonWire,
  SkillWire,
  StandingWire,
  TeamOptionWire,
  WorkforceWire,
} from '../../lib/game/types';
import { longDate } from './marketwords';

/**
 * The words for farm hands and contractor fencing: people looking for work,
 * the hands on the farm, the worker report, the inbox, the diary and the job
 * cards. Plain Australian English, short sentences. Every line states a
 * fact about a person or the farm: their skills as numbers, their days, their
 * pay. Nothing judges a worker ("reliable", "lazy") and standing is described,
 * not judged (PRD 5.11, "Wording"; CLAUDE.md, rules 2 and 11).
 *
 * The figures come from the engine's reads and are rounded here. Nothing the
 * rules hide goes out: no injury chance, no draw behind the list, no award
 * table and no skill factor (CLAUDE.md, rule 14).
 */

/** The date of a farm day, as the screens say it. */
export type DateOf = (day: number) => DateParts;

export const dateParts = (d: { year: number; month: number; date: number }): DateParts => ({
  year: d.year,
  month: d.month,
  date: d.date,
});

/** A farm day as "Tuesday 17 November". */
export const dayText = (farm: FarmState, day: number): string =>
  longDate(dateParts(dateOn(farm, day)));

const num = (n: number): string => Math.round(n).toLocaleString('en-AU');
const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;
const signed = (n: number): string => (n < 0 ? `-${money(n)}` : money(n));
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${num(n)} ${n === 1 ? one : many}`;
const team = (n: 1 | 2): string => (n === 1 ? '1-man team' : '2-man team');
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const shortDate = (d: DateParts): string => `${d.date} ${SHORT_MONTHS[d.month]}`;
const list = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Works Monday to Friday", "Works Wednesday to Sunday". */
export function daysText(days: readonly number[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return 'Works every day';
  for (let start = 0; start < 7; start++) {
    // The first day of a run: it is a day they work, and the day before is not.
    if (!set.includes(start) || set.includes((start + 6) % 7)) continue;
    let n = 1;
    while (set.includes((start + n) % 7)) n++;
    if (n === set.length && n >= 3) {
      return `Works ${WEEKDAYS[start]} to ${WEEKDAYS[(start + n - 1) % 7]}`;
    }
  }
  return `Works ${list(set.map((d) => WEEKDAYS[d]!))}`;
}

const kindText = (kind: JobSeeker['kind'], contractDays: number | null): string =>
  kind === 'casual'
    ? 'Casual'
    : kind === 'contract'
      ? `Short contract, ${plural(contractDays ?? LABOUR.contractDays.value, 'day')}`
      : 'Salaried';

const rateText = (kind: JobSeeker['kind'], rate: number): string =>
  kind === 'salaried' ? `${money(rate)} a week` : `${money(rate)} a day worked`;

/** About what each pay day costs for this person, wages and super. */
function payText(kind: JobSeeker['kind'], weekCost: number): string {
  const perPay = (weekCost * LABOUR.payCycleDays.value) / 7;
  return kind === 'salaried'
    ? `About ${money(perPay)} each pay day, with super.`
    : `About ${money(perPay)} each pay day, with super, if they work all their days.`;
}

const skillsOf = (s: { fencing: number; stock: number; water: number }): SkillWire[] =>
  [
    ['Fencing', s.fencing],
    ['Stock work', s.stock],
    ['Water and pipe', s.water],
  ].map(([label, rating]) => ({
    label: label as string,
    rating: rating as number,
    text: `${label} ${rating} of 5`,
  }));

/**
 * The dogs line. On a Daily Farm a hand with dogs takes less of your day on stock jobs. On a
 * Fast Farm hands take no share of your jobs (CALLS B200), so the dogs are only a fact.
 */
const dogsText = (dogs: boolean, onClock: boolean): string =>
  !dogs
    ? 'No dogs.'
    : onClock
      ? 'Has a team of dogs. Stock jobs take less of your day.'
      : 'Has a team of dogs.';

type PersonFacts = Pick<
  JobSeeker,
  'id' | 'name' | 'kind' | 'skills' | 'dogs' | 'days' | 'rate' | 'weekCost'
> & { contractDays: number | null };

/**
 * A person's id as the browser sees it. The engine's own id says which week
 * the person joined the list, which the engine's read leaves out on purpose,
 * so the browser gets a keyed hash instead: the same for this farm every
 * time, and no use for working out anything. A request names a person by it
 * and the server finds them again in today's list, or among the hands.
 */
export function personRef(farm: FarmState, id: number): string {
  return createHash('sha256').update(`gg-person:${farm.seed}:${id}`).digest('hex').slice(0, 12);
}

/** The engine's id for a person the browser named, among the people looking for work and the hands. -1 when there is no one: the engine then refuses in plain words. */
export function personFor(farm: FarmState, ref: unknown): number {
  if (typeof ref !== 'string') return -1;
  const ids = [...jobSeekers(farm).map((p) => p.id), ...workforceView(farm).hands.map((h) => h.id)];
  return ids.find((id) => personRef(farm, id) === ref) ?? -1;
}

function personWire(farm: FarmState, p: PersonFacts, onClock: boolean): PersonWire {
  return {
    id: personRef(farm, p.id),
    name: p.name,
    kindText: kindText(p.kind, p.contractDays),
    rateText: rateText(p.kind, p.rate),
    payText: payText(p.kind, p.weekCost),
    daysText: daysText(p.days),
    skills: skillsOf(p.skills),
    dogs: p.dogs,
    dogsText: dogsText(p.dogs, onClock),
  };
}

// ---------------------------------------------------------------------------
// What each person did: the worker report, in their own words
// ---------------------------------------------------------------------------

type Say = { who: string; text: string; group: string; merge?: Merge };
/** What to add up when the same thing happens many times over a skip. */
type Merge =
  | { type: 'plan'; mobName: string; to: string }
  | { type: 'duty'; what: 'trough' | 'fence'; cost: number }
  | {
      type: 'built';
      metres: number;
      byHandsM: number;
      metresLeft: number;
      doneDay: number;
      cost: number;
    };

const TEAM = 'Fencing team';
const PAY = 'Pay day';

/** One thing from the worker report, in the person's own plain words. Null for what is not in the report. */
function say(item: WorkerReportItem, dateOf: DateOf): Say | null {
  const e = item.event;
  const who = item.hand?.name ?? '';
  const on = (day: number): string => longDate(dateOf(day));
  switch (e.type) {
    case 'plan-moved':
      return {
        who,
        text: `I moved ${e.mobName}${e.from ? ` from ${e.from}` : ''} to ${e.to}, as its grazing plan says.`,
        group: `plan:${item.hand?.id}:${e.mob}`,
        merge: { type: 'plan', mobName: e.mobName, to: e.to },
      };
    case 'hand-hired':
      return { who, text: `I start work on ${on(e.startDay)}.`, group: `hired:${e.hand}` };
    case 'hand-left':
      return {
        who,
        text:
          e.why === 'not-paid'
            ? `I have left. My wages were not paid on pay day. I am still owed ${money(e.stillOwed)}.`
            : e.why === 'contract-finished'
              ? `My contract has finished.${e.paid > 0 ? ` I was paid ${money(e.paid)}.` : ''}${e.stillOwed > 0 ? ` I am still owed ${money(e.stillOwed)}.` : ''}`
              : `I was let go. I was paid ${money(e.paid)}.`,
        group: `left:${e.hand}`,
      };
    case 'wages-paid':
      return {
        who: PAY,
        text: `Wages paid to ${plural(e.hands, 'hand')}: ${money(e.wages)} and ${money(e.superannuation)} super, ${money(e.total)} in all.`,
        group: `wages:${item.seq}`,
      };
    case 'wages-owed-paid':
      return {
        who: PAY,
        text: `Wages owed from before were paid: ${money(e.amount)}.`,
        group: `owed:${item.seq}`,
      };
    case 'wages-missed':
      return {
        who,
        text: `My wages were not paid on pay day. I am owed ${money(e.owed)}.`,
        group: `missed:${item.seq}`,
      };
    case 'hand-injured':
      return {
        who,
        text: `I was hurt${e.fencing ? ' while fencing' : ''} on ${on(e.day)}. I am off until ${on(e.backDay)}.`,
        group: `hurt:${item.seq}`,
      };
    case 'hand-back':
      return { who, text: 'I am back at work.', group: `back:${item.seq}` };
    case 'hand-duty':
      return dutySay(who, item.hand?.id ?? 0, e.duty);
    case 'contract-built':
      return {
        who: TEAM,
        text: builtText(e.metres, 1, e.byHandsM, e.metresLeft, on(e.doneDay), e.cost),
        group: `built:${e.run}`,
        merge: {
          type: 'built',
          metres: e.metres,
          byHandsM: e.byHandsM,
          metresLeft: e.metresLeft,
          doneDay: e.doneDay,
          cost: e.cost,
        },
      };
    case 'contract-finished':
      return {
        who: TEAM,
        text: `The fence is finished: ${num(e.metres)} m built, ${money(e.spent)} charged in all.`,
        group: `finished:${e.run}`,
      };
    case 'contract-stopped':
      return {
        who: TEAM,
        text: `${stoppedText(e.why)} ${num(e.metresBuilt)} m are built and ${num(e.metresLeft)} m are not.`,
        group: `stopped:${item.seq}`,
      };
    default:
      return null;
  }
}

function dutySay(who: string, hand: number, d: HandDuty): Say {
  if (d.type === 'refill-trough') {
    return {
      who,
      text: `I filled a portable trough that was low.${d.cost > 0 ? ` It cost ${money(d.cost)}.` : ''}`,
      group: `duty:${hand}:trough`,
      merge: { type: 'duty', what: 'trough', cost: d.cost },
    };
  }
  return {
    who,
    text: `I put a knocked-down fence back up.${d.cost > 0 ? ` It cost ${money(d.cost)}.` : ''}`,
    group: `duty:${hand}:fence`,
    merge: { type: 'duty', what: 'fence', cost: d.cost },
  };
}

function builtText(
  metres: number,
  days: number,
  byHandsM: number,
  left: number,
  done: string,
  cost: number,
): string {
  const over = days > 1 ? ` over ${plural(days, 'working day')}` : ' today';
  const hands = byHandsM > 0 ? `, ${num(byHandsM)} m of it by your hands` : '';
  const rest = left > 0 ? ` ${num(left)} m to go. Done on ${done}.` : '';
  return `Built ${num(metres)} m of fence${over}${hands}. It cost ${money(cost)}.${rest}`;
}

/** When a run starts and when it is done at the team's pace. */
const runDates = (start: string, done: string): string =>
  start === done
    ? `It starts and is done on ${start}, at the team's pace.`
    : `It starts on ${start} and is done on ${done} at the team's pace.`;

const stoppedText = (why: 'no-money' | 'line-changed'): string =>
  why === 'no-money'
    ? "The fence has stopped, because the bank would not cover a day's work."
    : 'The fence has stopped, because a piece still to build has a different fence on it now.';

/**
 * The worker report for the days that ran: what each hand and the fencing
 * team did, one bubble each, in the order it happened. The same thing many
 * times over a skip (a plan moving a mob, a trough filled, a day of fence)
 * is one bubble with the total. At most `REPORT_MAX` bubbles, the newest.
 */
export const REPORT_MAX = 24;

/** What needs the player's eye when it happens away: a hand hurt, a hand gone, wages missed, a run stopped. */
const NEEDS_EYE: ReadonlySet<string> = new Set([
  'hand-injured',
  'hand-left',
  'wages-missed',
  'contract-stopped',
]);

export function reportWire(
  farm: FarmState,
  sinceSeq: number,
  dateOf: DateOf,
): { bubbles: BubbleWire[]; attention: boolean } {
  let attention = false;
  const groups = new Map<string, { first: number; says: Say[]; seqs: number[]; date: DateParts }>();
  for (const item of workerReport(farm, sinceSeq)) {
    const s = say(item, dateOf);
    if (!s || !s.who) continue;
    if (NEEDS_EYE.has(item.event.type)) attention = true;
    const g = groups.get(s.group);
    if (g) {
      g.says.push(s);
      g.seqs.push(item.seq);
    } else {
      groups.set(s.group, { first: item.seq, says: [s], seqs: [item.seq], date: dateOf(item.day) });
    }
  }
  const out: BubbleWire[] = [];
  for (const g of groups.values()) {
    const last = g.says[g.says.length - 1]!;
    out.push({
      seq: g.first,
      who: last.who,
      text: g.says.length > 1 ? merged(g.says, dateOf) : last.text,
      date: g.date,
    });
  }
  return { bubbles: out.sort((a, b) => a.seq - b.seq).slice(-REPORT_MAX), attention };
}

/** The same thing said many times, as one line with the total. */
function merged(says: readonly Say[], dateOf: DateOf): string {
  const last = says[says.length - 1]!;
  const n = says.length;
  const m = last.merge;
  if (!m) return last.text;
  if (m.type === 'plan') {
    return `I moved ${m.mobName} ${plural(n, 'time')} as its grazing plan says, and it is in ${m.to} now.`;
  }
  if (m.type === 'duty') {
    const cost = says.reduce((t, s) => t + (s.merge?.type === 'duty' ? s.merge.cost : 0), 0);
    const what =
      m.what === 'trough' ? 'filled a portable trough' : 'put a knocked-down fence back up';
    return `I ${what} ${plural(n, 'time')}.${cost > 0 ? ` It cost ${money(cost)} in all.` : ''}`;
  }
  const sum = (key: 'metres' | 'byHandsM' | 'cost'): number =>
    says.reduce((t, s) => t + (s.merge?.type === 'built' ? s.merge[key] : 0), 0);
  return builtText(
    sum('metres'),
    n,
    sum('byHandsM'),
    m.metresLeft,
    longDate(dateOf(m.doneDay)),
    sum('cost'),
  );
}

/** What a hand did lately, newest first, for their entry in the Workforce panel. */
function recentOf(farm: FarmState, id: number, dateOf: DateOf): string[] {
  const out: string[] = [];
  for (const item of workerReport(farm, -1).reverse()) {
    if (item.hand?.id !== id) continue;
    const s = say(item, dateOf);
    if (!s) continue;
    out.push(`${shortDate(dateOf(item.day))}: ${s.text}`);
    if (out.length >= 3) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The inbox, the diary and a job's result: every workforce event, said once
// ---------------------------------------------------------------------------

/**
 * Every kind of workforce event. A new one added to the engine's
 * `LabourEvent` fails the type check here until it has a place in the list
 * and words in `labourMessage`.
 */
const LABOUR_TYPES: Record<LabourEvent['type'], true> = {
  'hand-hired': true,
  'hand-left': true,
  'wages-paid': true,
  'wages-owed-paid': true,
  'wages-missed': true,
  'hand-injured': true,
  'hand-back': true,
  'hand-duty': true,
  'contract-ordered': true,
  'contract-built': true,
  'contract-finished': true,
  'contract-stopped': true,
  'contract-cancelled': true,
};

export const isLabourEvent = (e: FarmEvent): e is LabourEvent =>
  Object.hasOwn(LABOUR_TYPES, e.type);

/** The workforce events that come at first light, with no job behind them: the diary takes these from the inbox. */
export const DAWN_LABOUR: ReadonlySet<LabourEvent['type']> = new Set<LabourEvent['type']>([
  'hand-left',
  'wages-paid',
  'wages-owed-paid',
  'wages-missed',
  'hand-injured',
  'hand-back',
  'hand-duty',
  'contract-built',
  'contract-finished',
  'contract-stopped',
]);

const kindLong = (kind: 'casual' | 'contract' | 'salaried', rate: number): string =>
  kind === 'casual'
    ? `as a casual hand at ${rateText(kind, rate)}`
    : kind === 'contract'
      ? `on a short contract at ${rateText(kind, rate)}`
      : `on a salary of ${rateText(kind, rate)}`;

/** The inbox words for a workforce event. Every one has words: the switch is exhaustive. */
export function labourMessage(e: LabourEvent, dateOf: DateOf): string {
  const on = (day: number): string => longDate(dateOf(day));
  switch (e.type) {
    case 'hand-hired':
      return `${e.name} was hired ${kindLong(e.kind, e.rate)}. They start on ${on(e.startDay)}.${e.endDay === null ? '' : ` The contract ends on ${on(e.endDay)}.`}`;
    case 'hand-left':
      if (e.why === 'let-go') {
        return `${e.name} was let go, and was paid ${money(e.paid)}: the wages and super owed.`;
      }
      if (e.why === 'contract-finished') {
        return `${e.name}'s contract has finished.${e.paid > 0 ? ` They were paid ${money(e.paid)}, the wages and super owed.` : ''}${e.stillOwed > 0 ? ` The farm still owes ${money(e.stillOwed)}.` : ''}`;
      }
      return `${e.name} has left, because their wages could not be paid. The farm still owes them ${money(e.stillOwed)}.`;
    case 'wages-paid':
      return `Pay day: ${plural(e.hands, 'hand')} paid. Wages ${money(e.wages)}, super ${money(e.superannuation)}, ${money(e.total)} in all.`;
    case 'wages-owed-paid':
      return `Wages owed from before have been paid: ${money(e.amount)}.`;
    case 'wages-missed':
      return `Pay day: ${e.name}'s wages were not paid, because the bank would not cover them. The farm owes ${money(e.owed)}, and pays it as soon as the bank can cover it. Its standing with workers is lower.`;
    case 'hand-injured':
      return `${e.name} was hurt${e.fencing ? ' while fencing' : ''} on ${on(e.day)}. They are off until ${on(e.backDay)}, on workers compensation. The farm's share of the claim is ${money(e.cost)}${e.paidNow ? ', paid.' : ', which it owes and pays as soon as the bank can cover it.'}`;
    case 'hand-back':
      return `${e.name} is back at work.`;
    case 'hand-duty':
      return e.duty.type === 'refill-trough'
        ? `${e.name} filled a portable trough that was low, for ${money(e.duty.cost)}.`
        : `${e.name} put a knocked-down fence back up, for ${money(e.duty.cost)}.`;
    case 'contract-ordered':
      return `Contract fencing ordered: a ${team(e.team)} will build ${num(e.metres)} m of permanent fence. Materials ${money(e.materials)} plus labour ${money(e.labour)}, ${money(e.cost)} in all, charged as it is built. ${runDates(on(e.startDay), on(e.doneDay))}`;
    case 'contract-built':
      return `The fencing team built ${num(e.metres)} m${e.byHandsM > 0 ? `, ${num(e.byHandsM)} m of it by your hands` : ''}. ${e.metresLeft > 0 ? `${num(e.metresLeft)} m are left, done on ${on(e.doneDay)}.` : 'None is left.'} It cost ${money(e.cost)}.`;
    case 'contract-finished':
      return `The contract fence is finished: ${num(e.metres)} m built, ${money(e.spent)} charged in all.`;
    case 'contract-stopped':
      return `${stoppedText(e.why)} ${num(e.metresBuilt)} m are built and ${num(e.metresLeft)} m are not. ${money(e.spent)} has been charged so far.`;
    case 'contract-cancelled':
      return `The contract fence was cancelled. The ${num(e.metresBuilt)} m built stays, ${num(e.metresLeft)} m was not built. ${money(e.spent)} was charged, and nothing more is owed.`;
  }
}

// ---------------------------------------------------------------------------
// The Workforce panel
// ---------------------------------------------------------------------------

/** Wages the farm could not pay on time, in the last year, as a fact. */
function standingWire(farm: FarmState, missedDays: readonly number[]): StandingWire {
  const s = standingOf(farm);
  // One pay day is one miss, however many hands it left unpaid.
  const missed = new Set(missedDays.filter((d) => d > farm.day - 365)).size;
  const levels: [number, string, string][] = [
    [
      90,
      'Top',
      'Almost everyone looking for work is on the list. Asking rates are at or just above the award.',
    ],
    [
      70,
      'High',
      'Nearly everyone looking for work is on the list. Asking rates are a little above the award.',
    ],
    [
      50,
      'Middling',
      'The list is shorter, without the most skilled people. Asking rates are above the award.',
    ],
    [
      25,
      'Low',
      'The list is short, and the most skilled people are not on it. Asking rates are well above the award.',
    ],
    [0, 'Very low', 'The list is at its shortest, and people ask the most above the award.'],
  ];
  const [, level, effect] = levels.find(([from]) => s >= from)!;
  return {
    level: level!,
    effect: effect!,
    fact:
      missed === 0
        ? 'No wages missed in the last year.'
        : missed === 1
          ? 'Wages missed once in the last year.'
          : `Wages missed ${missed} times in the last year.`,
  };
}

function handWire(
  farm: FarmState,
  h: HandView,
  nextPay: DateParts | null,
  dateOf: DateOf,
  onClock: boolean,
): HandWire {
  const status =
    h.status === 'starts-soon'
      ? `Starts ${dayText(farm, h.startDay)}`
      : h.status === 'working'
        ? 'At work today'
        : h.status === 'day-off'
          ? 'Not one of their days today'
          : `Off hurt until ${dayText(farm, h.offUntil ?? farm.day)}`;
  return {
    ...personWire(
      farm,
      {
        ...h,
        contractDays: h.kind === 'contract' ? LABOUR.contractDays.value : null,
      },
      onClock,
    ),
    statusText: status,
    endText: h.endDay === null ? null : `Contract ends on ${dayText(farm, h.endDay)}`,
    owedText:
      h.owed > 0
        ? `${money(h.owed)} owed since the last pay day${nextPay ? `, paid on ${longDate(nextPay)}` : ''}.`
        : 'Nothing owed since the last pay day.',
    recent: recentOf(farm, h.id, dateOf),
  };
}

/** The Workforce panel: everything it shows, as words and whole numbers. */
/**
 * The Workforce panel. `onClock` false is a Fast Farm, where hands take no share of the player's
 * jobs (CALLS B200): the words say what a hand does there instead.
 */
export function workforceWire(
  farm: FarmState,
  missedDays: readonly number[],
  onClock = true,
): WorkforceWire {
  const wf = workforceView(farm);
  const seekers = jobSeekers(farm);
  const dateOf: DateOf = (d) => dateParts(dateOn(farm, d));
  const nextPay = wf.nextPayDate ? dateParts(wf.nextPayDate) : null;
  const full = wf.hands.length >= wf.maxHands;
  return {
    seekers: seekers.map((p) => personWire(farm, p, onClock)),
    seekersText: full
      ? `The farm has ${plural(wf.hands.length, 'hand')}, the most it can take on at once.`
      : seekers.length === 0
        ? 'No one is looking for work in the district today.'
        : `${plural(seekers.length, 'person is', 'people are')} looking for work in the district.`,
    canHire: !full,
    hands: wf.hands.map((h) => handWire(farm, h, nextPay, dateOf, onClock)),
    noHandsText: onClock
      ? 'No hands on the farm. A hand works their own days, does the first part of your jobs from their own day and is paid on pay day.'
      : 'No hands on the farm. On a Fast Farm a hand does their own duties (refilling troughs, putting tape back up) and helps a fencing team. Your jobs are done at once, so they take no share of them. A hand is paid on pay day.',
    payText:
      wf.hands.length === 0 || !nextPay
        ? null
        : `Pay day is ${longDate(nextPay)}, then every ${plural(LABOUR.payCycleDays.value, 'day')}. Owed to your hands so far: ${money(wf.owedNow)}, with super.`,
    owedText:
      wf.wagesOwedFromBefore > 0
        ? `The farm owes ${money(wf.wagesOwedFromBefore)} in wages from before. It is paid by itself as soon as the bank can cover it all.`
        : null,
    standing: standingWire(farm, missedDays),
  };
}

/** The to-do line for wages the farm owes, or null when none are owed. */
export function owedTodo(farm: FarmState): string | null {
  const owed = workforceView(farm).wagesOwedFromBefore;
  return owed > 0
    ? `The farm owes ${money(owed)} in wages from before. It is paid by itself as soon as the bank can cover it all.`
    : null;
}

// ---------------------------------------------------------------------------
// Contract fencing under way
// ---------------------------------------------------------------------------

/** The fact line and the map's segments for each run under way. */
export function contractsWire(farm: FarmState): ContractWire[] {
  return contractView(farm).map((r) => ({
    id: r.id,
    teamText: team(r.team),
    text: `Contract fence: ${num(r.metresLeft)} m left, done on ${longDate(dateParts(r.doneDate))}`,
    detail: `${num(r.metresBuilt)} m built so far. ${money(r.spent)} charged so far.`,
    built: r.built.map((e) => ({ line: e.line, index: e.index })),
    left: r.left.map((e) => ({ line: e.line, index: e.index })),
  }));
}

// ---------------------------------------------------------------------------
// Job cards
// ---------------------------------------------------------------------------

/** The hand's share of a job, as lines on its card. Empty when no hand helped. */
export function handsNotes(farm: FarmState, card: JobCard): string[] {
  const h = card.hands;
  if (!h) return [];
  const names = workforceView(farm)
    .hands.filter((x) => h.byHand.some((b) => b.hand === x.id))
    .map((x) => x.name);
  const who = list(names.length ? names : ['Your hand']);
  const many = names.length > 1;
  const own = many ? 'their own days' : 'their own day';
  const line = card.line;
  if (h.metres !== undefined && line) {
    const fits = line.fits.metres;
    const late = line.doesNotFit.metres;
    // The share covers every piece that is built today: the hand builds it all.
    if (h.metres > 0 && h.metres >= fits) {
      return [
        late > 0
          ? `${who} ${many ? 'build' : 'builds'} all ${num(fits)} m that is built today, from ${own}. It uses none of your light.`
          : `${who} ${many ? 'build' : 'builds'} all of this line, ${num(fits)} m, from ${own}. It uses none of your light.`,
      ];
    }
    // The share covers whole pieces: say the metres.
    if (h.metres > 0) {
      return [
        `${who}: the first ${num(h.metres)} m is ${many ? "the hands'" : "the hand's"} share, done from ${own}. It uses none of your light.`,
      ];
    }
    // The share is less than one piece: say it in time. Never "0 m".
    return [
      `${who === 'Your hand' ? "The hand's" : many ? `${who}: their` : `${who}'s`} work takes about ${minText(h.workMin)} off your day for this line.`,
    ];
  }
  return [
    `${who} ${many ? 'do' : 'does'} about ${minText(h.workMin)} of this from ${own}. That uses none of your light.`,
  ];
}

/** "35 min", "2 h 10 min": to the nearest 5 minutes, never under 5. */
function minText(minutes: number): string {
  const m = Math.max(5, Math.round(minutes / 5) * 5);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${rest} min` : `${m / 60} h`;
}

/** What went out in a day or skip, from the first-light events: contract fencing charged, and wages and super paid. */
export function payFrom(events: readonly FarmEvent[]): { contract: number; wages: number } {
  let contract = 0;
  let wages = 0;
  for (const e of events) {
    if (e.type === 'contract-built') contract += e.cost;
    else if (e.type === 'wages-paid') wages += e.total;
    else if (e.type === 'hand-left') wages += e.paid;
    else if (e.type === 'wages-owed-paid') wages += e.amount;
  }
  return { contract: Math.round(contract), wages: Math.round(wages) };
}

/** The lines on the card for hiring a person. */
export function hireLines(farm: FarmState, personId: number): string[] {
  const p = jobSeekers(farm).find((s) => s.id === personId);
  if (!p) return [];
  const wf = workforceView(farm);
  const start = farm.day + 1;
  const firstPay = wf.nextPayDay ?? farm.day + LABOUR.payCycleDays.value;
  const out = [
    `Hire ${p.name} ${kindLong(p.kind, p.rate)}.`,
    `They start tomorrow, ${dayText(farm, start)}. ${daysText(p.days)}.`,
    payText(p.kind, p.weekCost),
    `Pay day is ${dayText(farm, firstPay)}, then every ${plural(LABOUR.payCycleDays.value, 'day')}.`,
  ];
  if (p.kind === 'contract') {
    out.push(
      `The contract ends on ${dayText(farm, start + (p.contractDays ?? LABOUR.contractDays.value))}.`,
    );
  }
  out.push('Nothing is paid today.');
  return out;
}

/** The lines on the card for letting a hand go, from a trial run of it. */
export function letGoLines(farm: FarmState, events: readonly FarmEvent[] | null): string[] {
  const left = events?.find((e) => e.type === 'hand-left');
  if (left?.type !== 'hand-left') return [];
  return [
    `Let ${left.name} go.`,
    `They are paid ${money(left.paid)} now: the wages and super owed up to the end of today.`,
    `That leaves ${signed(farm.cash - left.paid)} in the bank.`,
  ];
}

/** The lines on the card for ordering a team. */
export function contractLines(farm: FarmState, card: JobCard): string[] {
  const c = card.contract;
  if (!c) return [];
  const out = [
    `A ${team(c.team)} builds ${num(c.metres)} m of permanent fence.`,
    `Materials ${money(c.materials)} plus labour ${money(c.labour)}: ${money(c.cost)} in all.`,
    'Nothing is charged today. Each working day is charged for what is built that day.',
    runDates(longDate(dateParts(c.startDate)), longDate(dateParts(c.doneDate))),
    teamPaceLine(farm, c.team),
    // A Fast Farm has no daylight limit: there is no day of the player's to save.
    card.onClock
      ? 'It uses none of your day. It carries on by itself, over Next day and skips.'
      : 'It carries on by itself, day by day and over skips.',
  ];
  if ((farm.labour?.hands.length ?? 0) > 0) {
    out.push('Your hands help the team on the days they work, so it can be done sooner.');
  }
  out.push(`That leaves ${signed(farm.cash - c.cost)} in the bank once it is all built.`);
  return out;
}

/** The lines on the card for cancelling a run, from a trial run of it. */
export function cancelLines(events: readonly FarmEvent[] | null): string[] {
  const c = events?.find((e) => e.type === 'contract-cancelled');
  if (c?.type !== 'contract-cancelled') return [];
  return [
    `Stop the contract fence. The ${num(c.metresBuilt)} m already built stays.`,
    `${num(c.metresLeft)} m will not be built.`,
    `${money(c.spent)} has been charged so far and stays paid. Nothing more is owed.`,
  ];
}

/**
 * The teams a permanent fence could be built by instead, each from a trial
 * of ordering it: what it costs, when it is done and that it uses none of the
 * player's day. A team the bank can not cover says why. Empty when the line
 * has no new fence to build.
 */
export function teamOptions(farm: FarmState, env: SourceEnv, edges: EdgeRef[]): TeamOptionWire[] {
  const out: TeamOptionWire[] = [];
  for (const t of [1, 2] as const) {
    const r = previewAction(
      farm,
      { type: 'orderContractFence', edges, team: t, handsHelp: hasHands(farm) },
      env,
    );
    if (!r.ok) {
      if (r.reason === 'nothing-to-build') return [];
      out.push({ team: t, label: team(t), price: '', lines: [], reason: r.message });
      continue;
    }
    const c = r.card.contract!;
    out.push({
      team: t,
      label: team(t),
      price: money(c.cost),
      lines: [
        `Materials ${money(c.materials)} plus labour ${money(c.labour)}.`,
        `Done on ${longDate(dateParts(c.doneDate))}.`,
        teamPaceLine(farm, t),
        ...(r.card.onClock ? ['Uses none of your day.'] : []),
      ],
      reason: null,
    });
  }
  return out;
}

/**
 * How much permanent fence a team builds a working day here. A bigger place runs a bigger
 * fencing plant, so a team builds more a day on it (Claudia, 19 Nov 2026; `fenceScale`).
 */
export function teamPaceLine(farm: FarmState, t: 1 | 2): string {
  const m = teamMetresPerDay(farm, t);
  const base = LABOUR.teamMetresPerDay.value[t];
  return m > base + 0.5
    ? `Builds about ${num(Math.round(m / 10) * 10)} m a working day: a place this size runs a bigger fencing plant.`
    : `Builds about ${num(m)} m a working day.`;
}

/**
 * What one person builds in a day of permanent fence on this farm, for the fence card. A
 * bigger place runs a bigger plant, so it is more on a big place (`fenceScale`).
 */
export function ownPaceLine(farm: FarmState): string {
  const m = permanentMetresPerDay(farm.layout.scale.farmHa);
  const base = JOB_TIMES.permanentFenceMPerDay.value;
  return m > base + 0.5
    ? `On your own you build about ${num(Math.round(m / 10) * 10)} m of permanent fence a day here: a place this size runs a bigger fencing plant.`
    : `On your own you build about ${num(m)} m of permanent fence a day.`;
}

export const hasHands = (farm: FarmState): boolean => (farm.labour?.hands.length ?? 0) > 0;
