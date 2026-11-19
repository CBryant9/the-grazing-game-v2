import 'server-only';
import {
  clockText,
  clockView,
  dateOn,
  farmTotals,
  materialsOnHand,
  DSE_PER_AE,
  FEED_FLOOR_KG_HA,
  areaIdOf,
  farmView,
  lastRainMm,
  marketView,
  paddockRestDays,
  paddockSummaries,
  surveyOf,
  sheepDistrict,
  sheepMobsOf,
  stockingRead,
  thingsToDo,
  type CalendarDate,
  type FarmState,
  type PeriodSummary,
  type SkipStop,
  type ActionEnv,
  type SourceEnv,
  type TickEvent,
} from '@gg/engine';
import { DISTRICTS } from '@gg/shared';
import {
  SNAPSHOT_VERSION,
  type BubbleWire,
  type ChangeWire,
  type DateParts,
  type InboxWire,
  type MobWire,
  type PaddockWire,
  type SetupChoices,
  type SetupSummary,
  type Snapshot,
  type SummaryWire,
  type TodoWire,
} from '../../lib/game/types';
import { buildWire } from './buildwords';
import { feedWire } from './feed';
import { commentLine } from './paddockwords';
import { arableHaByPaddock, cropsWire } from './crops';
import { inboxMessage, repeatMarkNotes } from './inboxwords';
import { contractsWire, owedTodo, workforceWire } from './labourwords';
import { marketWire } from './market';
import { buildMobs } from './mobs';
import { plansWire, planForm } from './plans';
import { movedText } from './planwords';
import {
  addSheepStocking,
  sheepMarketWire,
  sheepMobWires,
  sheepReads,
  sheepTodo,
  viewWithSheep,
} from './sheepmobs';
import { sheepSummaryLines } from './sheepwords';
import { NO_WATER_WHY, UNDER_FLOOR, causeWord, stopWord, todoWire } from './words';

/**
 * Whether a farm shows sheep: in a sheep district (never Central Queensland), with the sheep
 * switch on, or on a farm that already has sheep (they stay on screen if the switch goes off).
 */
export const sheepShown = (farm: FarmState, sheepOn: boolean): boolean =>
  sheepDistrict(farm.district) && (sheepOn || sheepMobsOf(farm).length > 0);
import { growthLine, liveScore, overWire } from './years';

/** Messages the snapshot carries. The browser shows these; older ones stay on the server. */
export const INBOX_SHOWN = 40;

const round = (n: number, places = 0): number => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

export const dateParts = (d: CalendarDate): DateParts => ({
  year: d.year,
  month: d.month,
  date: d.date,
});

/** Things to do about the workforce: wages the farm owes, with a button to the Workforce panel. */
function workforceTodo(farm: FarmState): TodoWire[] {
  const text = owedTodo(farm);
  return text
    ? [
        {
          key: 'wages-owed',
          text,
          button: 'See workforce',
          urgent: false,
          mob: null,
          opens: 'workforce',
          edge: null,
        },
      ]
    : [];
}

/**
 * The feed line on the paddock sheet: the days of feed above the grazing floor, or "Under 800
 * kg DM/ha" where the paddock is under it, so a paddock is never shown as "0 days". Null with no
 * stock on it.
 */
export function feedText(feedDays: number, massKgHa: number): string | null {
  if (!Number.isFinite(feedDays)) return null;
  if (massKgHa < FEED_FLOOR_KG_HA) return UNDER_FLOOR;
  const days = Math.round(feedDays);
  return `About ${days.toLocaleString('en-AU')} ${days === 1 ? 'day' : 'days'}`;
}

const change = (c: { before: number; after: number }, places = 0): ChangeWire => ({
  before: round(c.before, places),
  after: round(c.after, places),
});

export function setupSummary(farm: FarmState, setup: SetupChoices): SetupSummary {
  const d = DISTRICTS[farm.district];
  return {
    districtName: d.name,
    town: d.town,
    state: d.state,
    size: setup.size,
    farmHa: farm.layout.scale.farmHa,
    enterprise: setup.enterprise,
    stock: setup.stock ?? 'cattle',
    arablePct: round(farm.arablePct),
    years: setup.years,
    startType: setup.startType,
    difficulty: setup.difficulty,
  };
}

/**
 * Build the snapshot: the one JSON object the screens are drawn from.
 *
 * It holds what is on screen and nothing else. It never holds the farm's
 * state, its seed, its random streams, its action log or any data table, and
 * nothing about days to come (CLAUDE.md, rule 14). The Market tab's chart is
 * the last month of prices the farm has lived, never a price still to come.
 */
export function buildSnapshot(
  farm: FarmState,
  stored: {
    name: string;
    setup: SetupChoices;
    inboxRead?: number;
    version: string;
    /** The farm days wages were missed, for the standing's fact line. */
    missedWages?: readonly number[];
  },
  env: ActionEnv,
  /** The sheep switch. Sheep show where it is on (or the farm already has sheep), never in Central Queensland. */
  sheepOn = false,
): Snapshot {
  const shown = sheepShown(farm, sheepOn);
  const sr = shown ? sheepReads(farm, env) : null;
  const view = viewWithSheep(farmView(farm, env), farm, sr);
  const totals = farmTotals(farm, env);
  const clock = clockView(farm, env);
  const market = marketView(farm, env);
  const dateOfDay = (day: number): DateParts => dateParts(dateOn(farm, day));

  const mixed = stored.setup.enterprise === 'mixed';
  const arable = arableHaByPaddock(farm, mixed);
  const haOf = new Map(view.paddocks.map((p) => [p.id, p.ha]));
  const cellOf = new Map(view.paddocks.map((p) => [p.id, p.labelCell]));
  const summaries = paddockSummaries(farm, env);
  const rest = paddockRestDays(farm);
  const comments = paddockComments(farm, summaries);
  const paddocks: PaddockWire[] = summaries.map((p) => ({
    id: p.id,
    name: p.name,
    ha: round(haOf.get(p.id) ?? 0, 1),
    area: p.area,
    label: p.label,
    water: p.water,
    mobs: p.mobs,
    massKgHa: round(p.mass, -1),
    greenKgHa: round(p.g, -1),
    deadKgHa: round(p.d, -1),
    greenPct: round(p.green * 100),
    heightCm: round(p.height),
    coverPct: round(p.cover * 100),
    me: round(p.me, 1),
    cp: round(p.cp, 1),
    head: p.head,
    ae: round(p.ae, 1),
    dse: round(p.ae * DSE_PER_AE),
    aePerHa: round(p.rate, 2),
    dsePerHa: round(p.dsePerHa, 1),
    feedDays: Number.isFinite(p.feedDays) ? round(p.feedDays) : null,
    feedText: feedText(p.feedDays, p.mass),
    growKgHaDay: round(p.ha > 0 ? p.grow / p.ha : 0),
    noWaterWhy: p.water === 'none' ? NO_WATER_WHY : null,
    carryingDsePerHa: round(p.cc * DSE_PER_AE, 1),
    cell: cellOf.get(p.id) ?? 0,
    arableHa: round(arable.get(p.id) ?? 0, 1),
    comment: comments.get(p.id) ?? null,
    restDays: rest.get(p.id) ?? null,
  }));

  const mobs: MobWire[] = buildMobs(farm, env, market);
  let sheepHead = 0;
  if (sr) {
    addSheepStocking(paddocks, new Map(summaries.map((p) => [p.id, p.areaId])), sr);
    mobs.push(...sheepMobWires(farm, sr, dateOfDay));
    sheepHead = sr.reads.reduce((t, r) => t + r.head, 0);
  }
  const stocking = stockingRead(farm);
  const marketOut = marketWire(farm, market);
  if (shown) marketOut.sheep = sheepMarketWire(farm, marketOut.buy.reason);

  const dateOf = dateOfDay;
  const read = stored.inboxRead ?? 0;
  const worded: InboxWire[] = [];
  // Marking is told once for each drop of calves (the rule Things to do follows).
  const repeats = repeatMarkNotes(farm.inbox);
  for (let i = farm.inbox.length - 1; i >= 0; i--) {
    const m = farm.inbox[i]!;
    if (repeats.has(m.seq)) continue;
    const words = inboxMessage(m.event, dateOf);
    if (!words) continue;
    worded.push({
      seq: m.seq,
      day: m.day,
      date: dateParts(dateOn(farm, m.day)),
      time: m.at === undefined ? null : clockText(m.at),
      kind: words.kind,
      text: words.text,
      unread: m.seq > read,
    });
  }
  const inbox = worded.slice(0, INBOX_SHOWN);
  const inboxUnread = worded.filter((m) => m.unread).length;

  return {
    version: SNAPSHOT_VERSION,
    farmVersion: stored.version,
    farm: {
      name: stored.name,
      district: farm.district,
      setup: setupSummary(farm, stored.setup),
    },
    day: farm.day,
    date: dateParts(clock.date),
    season: totals.season.label,
    totals: {
      // Sheep count in head and in the stocking (one DSE figure, the engine's); calves stay calves.
      head: totals.head + sheepHead,
      calves: totals.calves,
      ae: round(stocking.totalAe, 1),
      dse: round(stocking.totalDse),
      cash: round(totals.cash),
      bankLimit: round(farm.broke),
      lendLimit: round(farm.overdraft),
      netWorth: round(totals.netWorth.total),
      rainMm: rainMm(farm, env),
      massKgHa: round(totals.massKgHa, -1),
      greenKgHa: round(totals.greenKgHa, -1),
      coverPct: round(totals.coverPct),
    },
    clock: {
      firstLight: clock.firstLight,
      lastLight: clock.lastLight,
      now: round(clock.now, 1),
      dayMin: round(clock.dayMin, 1),
      usedMin: round(clock.usedMin, 1),
      leftMin: round(clock.leftMin, 1),
      canStartJobs: clock.canStartJobs,
      evening: clock.evening,
      daylightLimit: clock.daylightLimit,
    },
    view,
    todo: [
      ...thingsToDo(farm, env).map(todoWire),
      ...(sr ? sheepTodo(farm, sr) : []),
      ...workforceTodo(farm),
    ],
    market: marketOut,
    plans: plansWire(farm),
    planForm: planForm(),
    cropping: cropsWire(farm, mixed),
    mobs,
    paddocks,
    feed: feedWire(farm, env, mobs),
    build: buildWire(materialsOnHand(farm), shown),
    workforce: workforceWire(farm, stored.missedWages ?? []),
    contracts: contractsWire(farm),
    inbox,
    inboxUnread,
    score: liveScore(farm),
    over: farm.over ? overWire(farm, farm.over) : null,
    // Set by the game server for a Daily Farm, which carries the server's clock.
    daily: null,
  };
}

/** Last night's rain, mm, one place. Null on a farm with random seasons (no rain figure). */
function rainMm(farm: FarmState, env: SourceEnv): number | null {
  const mm = lastRainMm(farm, env);
  return mm === null ? null : round(mm, 1);
}

/**
 * The comment line for each stocked paddock, from the model's own figures: the feed, its green
 * share and height, what grew and what the stock ate on the last day (cattle and sheep, the
 * paddock's share), and the diet the stock chose against the paddock's average. The diet is read
 * only from stock on pasture alone or lick, so hay or pellets never read as picking.
 */
function paddockComments(
  farm: FarmState,
  summaries: ReturnType<typeof paddockSummaries>,
): Map<number, string | null> {
  const survey = surveyOf(farm);
  const out = new Map<number, string | null>();
  // The last day stock spent on each square (before the first night, the last hard grazing).
  const lastOn = farm.stockedOn ?? farm.pasture.lastG;
  for (const p of summaries) {
    const cattle = farm.mobs.filter((m) => p.mobs.includes(m.id) && m.animals.length > 0);
    const sheep = (farm.sheep?.mobs ?? []).filter(
      (m) => m.sheep.length > 0 && areaIdOf(survey, m) === p.areaId,
    );
    const stocked = cattle.length > 0 || sheep.length > 0;
    if (!stocked || p.ha <= 0) {
      out.set(p.id, null);
      continue;
    }
    const areaHa = survey.topology.areas[p.areaId]!.ha;
    const share = areaHa > 0 ? p.ha / areaHa : 0;
    let sheepEat = 0;
    for (const m of sheep) if (m.st) sheepEat += m.st.demand * m.st.f * share;
    let dietMe: number | null = null;
    for (const m of cattle) {
      if (m.st && (m.supp === 'none' || m.supp === 'lick')) {
        dietMe = m.st.me;
        break;
      }
    }
    if (dietMe === null) {
      for (const m of sheep) {
        if (m.st && (m.feed === 'none' || m.feed === 'lick')) {
          dietMe = m.st.me;
          break;
        }
      }
    }
    out.set(
      p.id,
      commentLine({
        stocked,
        massKgHa: p.mass,
        green: p.green,
        heightCm: p.height,
        growKgHa: p.grow / p.ha,
        eatKgHa: (p.eat + sheepEat) / p.ha,
        dietMe,
        paddockMe: p.me,
        // A mob's first day here: its last day was somewhere else, so what it ate waits a day.
        grazedHere: survey.topology.areas[p.areaId]!.cells.some((i) => lastOn[i] === farm.day - 1),
      }),
    );
  }
  return out;
}

/**
 * Where grazing plans moved mobs over the days that ran: one line for each
 * mob. One move says where and why. Several say how many, and the first and
 * last paddock.
 */
export function planMoveLines(ticks: readonly TickEvent[]): string[] {
  const byMob = new Map<number, Extract<TickEvent, { type: 'plan-moved' }>[]>();
  for (const e of ticks) {
    if (e.type !== 'plan-moved') continue;
    const list = byMob.get(e.mob) ?? [];
    list.push(e);
    byMob.set(e.mob, list);
  }
  const out: string[] = [];
  for (const moves of byMob.values()) {
    const first = moves[0]!;
    const last = moves[moves.length - 1]!;
    if (moves.length === 1) out.push(movedText(first));
    else {
      const from = first.from ? ` from ${first.from}` : '';
      out.push(
        `${last.mobName} moved ${moves.length} times by its grazing plan,${from} to ${last.to}.`,
      );
    }
  }
  return out;
}

/** What happened over a day or a skip, for the card the player dismisses. */
export function buildSummary(
  kind: 'day' | 'skip',
  s: PeriodSummary,
  stops: readonly SkipStop[],
  asked: number,
  ticks: readonly TickEvent[] = [],
  labour: {
    bubbles: BubbleWire[];
    pay: { contract: number; wages: number };
    stepThrough: boolean;
  } = { bubbles: [], pay: { contract: 0, wages: 0 }, stepThrough: false },
  /** True on a farm with sheep: the cattle's own figures are then named as the cattle's. */
  hasSheep = false,
): SummaryWire {
  const deathsByCause: Record<string, number> = {};
  for (const [cause, n] of Object.entries(s.deathsByCause)) {
    if (n) deathsByCause[causeWord(cause)] = n;
  }
  // The engine's period figures are the cattle's; the sheep's come from the day's events.
  const sheep = sheepSummaryLines(ticks);
  return {
    kind,
    from: dateParts(s.fromDate),
    to: dateParts(s.toDate),
    daysAsked: asked,
    daysRun: s.daysRun,
    cash: change(s.cash),
    head: change(s.head),
    calves: change(s.calves),
    liveWeightKg: change(s.liveWeightKg),
    massKgHa: change(s.massKgHa, -1),
    greenKgHa: change(s.greenKgHa, -1),
    coverPct: change(s.coverPct),
    births: s.births,
    deaths: s.deaths,
    deathsByCause,
    gainKg: round(s.gainKg),
    money: {
      sales: round(s.money.sales),
      buys: round(s.money.buys),
      feed: round(s.money.feed),
      grain: round(s.money.grain),
      running: round(s.money.running),
      interest: round(s.money.interest),
      contract: labour.pay.contract,
      wages: labour.pay.wages,
      wool: round(sheep.wool),
    },
    sheepLines: sheep.lines,
    hasSheep,
    arrived: { head: s.arrived.head, calves: s.arrived.calves },
    bookedSold: { head: s.bookedSold.head, net: round(s.bookedSold.net) },
    planMoves: planMoveLines(ticks),
    growth:
      kind === 'skip' && s.daysRun > 0 && (s.grownKg > 0 || s.eatenKg > 0)
        ? growthLine(s.grownKg, s.eatenKg, true, hasSheep ? 'The stock' : 'The cattle')
        : null,
    report: labour.bubbles,
    reportFirst: labour.stepThrough && labour.bubbles.length > 0,
    stops: stops.map(stopWord),
    canRunAnyway:
      s.daysRun === 0 &&
      stops.some((x) => (x.type === 'no-water' || x.type === 'trough-low') && x.when === 'before'),
  };
}
