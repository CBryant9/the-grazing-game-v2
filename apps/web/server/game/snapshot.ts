import 'server-only';
import {
  CLASS_LABELS,
  clockView,
  farmTotals,
  DSE_PER_AE,
  farmView,
  marketView,
  paddockSummaries,
  plansView,
  thingsToDo,
  type CalendarDate,
  type FarmState,
  type PeriodSummary,
  type SkipStop,
  type SourceEnv,
} from '@gg/engine';
import { DISTRICTS } from '@gg/shared';
import {
  SNAPSHOT_VERSION,
  type ChangeWire,
  type DateParts,
  type MobWire,
  type PaddockWire,
  type SetupChoices,
  type SetupSummary,
  type Snapshot,
  type SummaryWire,
} from '../../lib/game/types';
import { buildMobs } from './mobs';
import { causeWord, gameOverWord, inboxWord, stopWord, todoWire } from './words';

/** Messages the snapshot carries. The browser shows a few; older ones stay on the server. */
export const INBOX_SHOWN = 15;

const round = (n: number, places = 0): number => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

const dateParts = (d: CalendarDate): DateParts => ({ year: d.year, month: d.month, date: d.date });

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
 * state, its seed, its random streams, its price series, its action log or
 * any data table, and nothing about days to come (CLAUDE.md, rule 14).
 */
export function buildSnapshot(
  farm: FarmState,
  stored: { name: string; setup: SetupChoices },
  env: SourceEnv,
): Snapshot {
  const view = farmView(farm, env);
  const totals = farmTotals(farm, env);
  const clock = clockView(farm);
  const market = marketView(farm, env);

  const haOf = new Map(view.paddocks.map((p) => [p.id, p.ha]));
  const cellOf = new Map(view.paddocks.map((p) => [p.id, p.labelCell]));
  const paddocks: PaddockWire[] = paddockSummaries(farm, env).map((p) => ({
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
    growKgHaDay: round(p.ha > 0 ? p.grow / p.ha : 0),
    carryingDsePerHa: round(p.cc * DSE_PER_AE, 1),
    cell: cellOf.get(p.id) ?? 0,
  }));

  const mobs: MobWire[] = buildMobs(farm, env, market);

  const inbox = [...farm.inbox]
    .reverse()
    .map((m) => ({ seq: m.seq, day: m.day, text: inboxWord(m.event) }))
    .filter((m): m is { seq: number; day: number; text: string } => m.text !== null)
    .slice(0, INBOX_SHOWN);

  return {
    version: SNAPSHOT_VERSION,
    farm: {
      name: stored.name,
      district: farm.district,
      setup: setupSummary(farm, stored.setup),
    },
    day: farm.day,
    date: dateParts(clock.date),
    season: totals.season.label,
    totals: {
      head: totals.head,
      calves: totals.calves,
      ae: round(totals.ae, 1),
      dse: round(totals.dse),
      cash: round(totals.cash),
      netWorth: round(totals.netWorth.total),
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
    },
    view,
    todo: thingsToDo(farm).map(todoWire),
    market: {
      isSaleDay: market.isSaleDay,
      nextSale: market.nextSale
        ? { date: dateParts(market.nextSale.date), daysAway: market.nextSale.daysAway }
        : null,
      booked: market.booked.map((b) => ({
        date: dateParts(b.date),
        daysAway: b.daysAway,
        head: b.head,
      })),
      onTheWay: market.onTheWay.map((a) => ({
        date: dateParts(a.date),
        daysAway: a.daysAway,
        cls: CLASS_LABELS[a.cls as keyof typeof CLASS_LABELS] ?? 'Cattle',
        head: a.head,
      })),
    },
    plans: plansView(farm) as unknown as Record<string, unknown>[],
    mobs,
    paddocks,
    inbox,
    over: farm.over ? { text: gameOverWord(farm.over.reason) } : null,
  };
}

/** What happened over a day or a skip, for the card the player dismisses. */
export function buildSummary(
  kind: 'day' | 'skip',
  s: PeriodSummary,
  stops: readonly SkipStop[],
  asked: number,
): SummaryWire {
  const deathsByCause: Record<string, number> = {};
  for (const [cause, n] of Object.entries(s.deathsByCause)) {
    if (n) deathsByCause[causeWord(cause)] = n;
  }
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
      feed: round(s.money.feed + s.money.grain),
      running: round(s.money.running),
      interest: round(s.money.interest),
    },
    arrived: { head: s.arrived.head, calves: s.arrived.calves },
    bookedSold: { head: s.bookedSold.head, net: round(s.bookedSold.net) },
    stops: stops.map(stopWord),
    canRunAnyway:
      s.daysRun === 0 &&
      stops.some((x) => (x.type === 'no-water' || x.type === 'trough-low') && x.when === 'before'),
  };
}
