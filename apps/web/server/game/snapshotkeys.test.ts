import { writeFileSync } from 'node:fs';
import { applyAction, createFarm, endDay, knockDownTape, saleDayOn, thingsToDo } from '@gg/engine';
import { describe, expect, it } from 'vitest';
import type { FarmState } from '@gg/engine';
import type { Snapshot } from '../../lib/game/types';
import { GameServer } from './game';
import { buildSnapshot } from './snapshot';
import { MemoryFarmStore } from './store';

/*
 * What the game routes send holds only the keys listed here, at every depth
 * (CLAUDE.md rule 14). A new field can not reach the browser without being
 * added to a list, so each one is looked at; and a listed key that no
 * fixture sends fails too, so the lists can not go stale. The farm view
 * under `view` has its own list in packages/engine/src/sim/view.test.ts.
 */

const SNAPSHOT_KEYS: Record<string, readonly string[]> = {
  '': [
    'build',
    'clock',
    'cropping',
    'date',
    'day',
    'farm',
    'farmVersion',
    'inbox',
    'inboxUnread',
    'market',
    'mobs',
    'over',
    'paddocks',
    'planForm',
    'plans',
    'score',
    'season',
    'todo',
    'totals',
    'version',
    'view',
  ],
  build: ['fences', 'noneFits', 'onHand', 'tools'],
  'build.fences[]': ['id', 'name', 'perM', 'price', 'text'],
  'build.tools[]': ['help', 'id', 'name', 'price'],
  clock: [
    'canStartJobs',
    'dayMin',
    'evening',
    'firstLight',
    'lastLight',
    'leftMin',
    'now',
    'usedMin',
  ],
  cropping: ['fields', 'options'],
  'cropping.fields[]': ['ha', 'id', 'name', 'paddocks', 'ready', 'stage'],
  'cropping.options[]': [
    'about',
    'costPerHa',
    'id',
    'kindText',
    'name',
    'open',
    'reason',
    'window',
  ],
  date: ['date', 'month', 'year'],
  farm: ['district', 'name', 'setup'],
  'farm.setup': [
    'arablePct',
    'difficulty',
    'districtName',
    'enterprise',
    'farmHa',
    'size',
    'startType',
    'state',
    'town',
    'years',
  ],
  'inbox[]': ['date', 'day', 'kind', 'seq', 'text', 'time', 'unread'],
  'inbox[].date': ['date', 'month', 'year'],
  market: [
    'booked',
    'buy',
    'chart',
    'credit',
    'isSaleDay',
    'nextSale',
    'onTheWay',
    'prices',
    'saleLine',
    'sell',
  ],
  'market.booked[]': ['date', 'daysAway', 'head'],
  'market.booked[].date': ['date', 'month', 'year'],
  'market.buy': ['classes', 'maxQty', 'reason'],
  'market.buy.classes[]': ['cKg', 'id', 'label', 'perHead', 'perText', 'weightText'],
  'market.chart': ['classes', 'from', 'to'],
  'market.chart.classes[]': ['id', 'label', 'points'],
  'market.chart.from': ['date', 'month', 'year'],
  'market.chart.to': ['date', 'month', 'year'],
  'market.nextSale': ['date', 'daysAway'],
  'market.nextSale.date': ['date', 'month', 'year'],
  'market.onTheWay[]': ['cls', 'date', 'daysAway', 'head'],
  'market.onTheWay[].date': ['date', 'month', 'year'],
  'market.prices[]': ['cKg', 'changeCKg', 'changeDays', 'id', 'label', 'perHead', 'typicalKg'],
  'market.sell': ['classes', 'note'],
  'market.sell.classes[]': ['cKg', 'head', 'id', 'label'],
  'mobs[]': [
    'adgKg',
    'ae',
    'area',
    'booked',
    'bookedDate',
    'breeding',
    'calves',
    'classes',
    'cp',
    'cs',
    'dryDays',
    'dse',
    'hasWater',
    'head',
    'id',
    'intakeKg',
    'intakePct',
    'markCount',
    'markReason',
    'me',
    'name',
    'ptic',
    'pticText',
    'sellGroups',
    'sellReason',
    'supp',
    'suppOptions',
    'suppReason',
    'weanCount',
    'weanReason',
    'weightKg',
    'where',
    'why',
  ],
  'mobs[].bookedDate': ['date', 'month', 'year'],
  'mobs[].classes[]': ['calf', 'cs', 'head', 'id', 'label', 'weightKg'],
  'mobs[].sellGroups[]': ['head', 'id', 'name'],
  'mobs[].suppOptions[]': ['id', 'label', 'perDay'],
  over: ['days', 'text', 'total', 'worth', 'years'],
  'over.years[]': ['n', 'total'],
  'paddocks[]': [
    'ae',
    'aePerHa',
    'arableHa',
    'area',
    'carryingDsePerHa',
    'cell',
    'coverPct',
    'cp',
    'deadKgHa',
    'dse',
    'dsePerHa',
    'feedDays',
    'greenKgHa',
    'greenPct',
    'growKgHaDay',
    'ha',
    'head',
    'heightCm',
    'id',
    'label',
    'massKgHa',
    'me',
    'mobs',
    'name',
    'noWaterWhy',
    'water',
  ],
  planForm: [
    'defaultEvery',
    'defaultKg',
    'defaultRounds',
    'everyMax',
    'kgMax',
    'kgMin',
    'maxDaysMax',
    'maxStops',
    'roundsMax',
    'timesADayMax',
  ],
  score: ['total', 'year'],
  'plans[]': ['after', 'afterText', 'editable', 'id', 'legs', 'mobs', 'name'],
  'plans[].legs[]': ['rounds', 'roundsText', 'ruleText', 'stops', 'trigger'],
  'plans[].legs[].stops[]': ['cell', 'hasWater', 'name', 'paddock'],
  'plans[].legs[].trigger': ['every', 'kg', 'maxDays', 'mode'],
  'plans[].mobs[]': [
    'area',
    'head',
    'mob',
    'mobName',
    'nextText',
    'paused',
    'pausedText',
    'report',
    'roundText',
    'step',
    'stepText',
    'waitingText',
  ],
  'todo[]': ['button', 'edge', 'key', 'mob', 'opens', 'text', 'urgent'],
  'todo[].edge': ['index', 'line'],
  totals: ['ae', 'calves', 'cash', 'coverPct', 'dse', 'greenKgHa', 'head', 'massKgHa', 'netWorth'],
};

/**
 * Keys of everything else the game routes send, by reply: `preview`, `act`
 * (a refusal, a stale refusal and a repeat included), `day` and `skip`. The
 * snapshot inside a reply is checked against the list above.
 */
const REPLY_KEYS: Record<string, readonly string[]> = {
  act: ['card', 'message', 'ok', 'reason', 'repeat', 'snapshot'],
  'act.card': [
    'action',
    'cost',
    'costToday',
    'fitsToday',
    'leftAfterMin',
    'line',
    'notes',
    'outcome',
    'perDay',
    'summary',
    'usesRestOfDay',
    'workMin',
  ],
  day: ['message', 'ok', 'reason', 'snapshot', 'summary', 'yearEnd', 'yearsClosed'],
  'day.summary': [
    'arrived',
    'births',
    'bookedSold',
    'calves',
    'canRunAnyway',
    'cash',
    'coverPct',
    'daysAsked',
    'daysRun',
    'deaths',
    'deathsByCause',
    'from',
    'gainKg',
    'greenKgHa',
    'head',
    'kind',
    'liveWeightKg',
    'massKgHa',
    'money',
    'planMoves',
    'stops',
    'to',
  ],
  'day.summary.arrived': ['calves', 'head'],
  'day.summary.bookedSold': ['head', 'net'],
  'day.summary.calves': ['after', 'before'],
  'day.summary.cash': ['after', 'before'],
  'day.summary.coverPct': ['after', 'before'],
  'day.summary.deathsByCause': ['*'],
  'day.summary.from': ['date', 'month', 'year'],
  'day.summary.greenKgHa': ['after', 'before'],
  'day.summary.head': ['after', 'before'],
  'day.summary.liveWeightKg': ['after', 'before'],
  'day.summary.massKgHa': ['after', 'before'],
  'day.summary.money': ['buys', 'feed', 'interest', 'running', 'sales'],
  'day.summary.to': ['date', 'month', 'year'],
  preview: ['card', 'message', 'ok', 'reason', 'version'],
  'preview.card': [
    'action',
    'cost',
    'costToday',
    'fitsToday',
    'leftAfterMin',
    'line',
    'notes',
    'outcome',
    'perDay',
    'summary',
    'usesRestOfDay',
    'workMin',
  ],
  'preview.card.line': ['doesNotFit', 'fits', 'words'],
  'preview.card.line.doesNotFit': ['cells', 'edges', 'metres'],
  'preview.card.line.fits': ['cells', 'edges', 'metres'],
  'preview.card.line.fits.edges[]': ['index', 'line'],
  skip: ['ok', 'snapshot', 'summary', 'yearEnd', 'yearsClosed'],
  'skip.yearEnd': ['facts', 'money', 'n', 'parts', 'title', 'total'],
  'skip.yearEnd.money[]': ['dollars', 'label'],
  'skip.yearEnd.parts[]': ['key', 'label', 'pts'],
  record: ['diary', 'earlier', 'soFar', 'years'],
  'record.diary[]': ['date', 'day', 'lines'],
  'record.diary[].date': ['date', 'month', 'year'],
  'record.soFar': ['facts', 'money', 'n', 'parts', 'title', 'total'],
  'record.soFar.money[]': ['dollars', 'label'],
  'record.soFar.parts[]': ['key', 'label', 'pts'],
  'record.years[]': ['facts', 'money', 'n', 'parts', 'title', 'total'],
  'record.years[].money[]': ['dollars', 'label'],
  'record.years[].parts[]': ['key', 'label', 'pts'],
  'skip.summary': [
    'arrived',
    'births',
    'bookedSold',
    'calves',
    'canRunAnyway',
    'cash',
    'coverPct',
    'daysAsked',
    'daysRun',
    'deaths',
    'deathsByCause',
    'from',
    'gainKg',
    'greenKgHa',
    'head',
    'kind',
    'liveWeightKg',
    'massKgHa',
    'money',
    'planMoves',
    'stops',
    'to',
  ],
  'skip.summary.arrived': ['calves', 'head'],
  'skip.summary.bookedSold': ['head', 'net'],
  'skip.summary.calves': ['after', 'before'],
  'skip.summary.cash': ['after', 'before'],
  'skip.summary.coverPct': ['after', 'before'],
  'skip.summary.deathsByCause': ['*'],
  'skip.summary.from': ['date', 'month', 'year'],
  'skip.summary.greenKgHa': ['after', 'before'],
  'skip.summary.head': ['after', 'before'],
  'skip.summary.liveWeightKg': ['after', 'before'],
  'skip.summary.massKgHa': ['after', 'before'],
  'skip.summary.money': ['buys', 'feed', 'interest', 'running', 'sales'],
  'skip.summary.to': ['date', 'month', 'year'],
};

/** Maps with a free key for each word (deaths by cause): the values are numbers, the keys are words. */
const FREE_MAPS = new Set(['day.summary.deathsByCause', 'skip.summary.deathsByCause']);

type Seen = Map<string, Set<string>>;

/** Every object's path and keys. Lists count as `[]`. The view and any reply's snapshot are checked on their own. */
function shape(v: unknown, path: string, out: Seen, snaps: unknown[]): void {
  if (Array.isArray(v)) {
    for (const x of v) shape(x, `${path}[]`, out, snaps);
  } else if (v !== null && typeof v === 'object') {
    const set = out.get(path) ?? new Set<string>();
    out.set(path, set);
    for (const [k, x] of Object.entries(v)) {
      set.add(k);
      if (path === '' && k === 'view') continue;
      if (k === 'snapshot' && path !== '' && !path.includes('.')) {
        if (x) snaps.push(x);
        continue;
      }
      if (FREE_MAPS.has(path ? `${path}.${k}` : k)) {
        expect(Object.values(x as object).every((n) => typeof n === 'number')).toBe(true);
        out.set(path ? `${path}.${k}` : k, new Set(['*']));
        continue;
      }
      shape(x, path ? `${path}.${k}` : k, out, snaps);
    }
  }
}

/** Keys found that a list does not name: "path.key". */
function unlisted(found: Seen, list: Record<string, readonly string[]>): string[] {
  const bad: string[] = [];
  for (const [path, keys] of found) {
    const allowed = list[path];
    for (const k of keys) {
      if (!allowed || !allowed.includes(k)) bad.push(path ? `${path}.${k}` : k);
    }
  }
  return bad.sort();
}

/** Keys a list names that no fixture showed: a stale list, or a fixture that is too thin. */
function unseen(found: Seen, list: Record<string, readonly string[]>): string[] {
  const out: string[] = [];
  for (const [path, keys] of Object.entries(list)) {
    for (const k of keys) {
      if (!found.get(path)?.has(k)) out.push(path ? `${path}.${k}` : k);
    }
  }
  return out.sort();
}

const A = 'a'.repeat(32);
const W = 40;
const rid = (() => {
  let n = 0;
  return () => `keys-${++n}-${Date.now()}`;
})();

/** A busy mixed farm on the game server: plans, crops, market, breeding, an inbox, and every reply. */
async function serverFixtures(): Promise<{
  snaps: Snapshot[];
  replies: Record<string, unknown[]>;
}> {
  const game = new GameServer({ store: new MemoryFarmStore(), seed: () => 7 });
  await game.create(A, {
    district: 'cw',
    size: 'small',
    enterprise: 'mixed',
    arablePct: 20,
    croppedPct: 50,
    years: 'real-in-order',
    startType: 'running',
    difficulty: 'medium',
    name: 'Keys',
  });
  const replies: Record<string, unknown[]> = {
    preview: [],
    act: [],
    day: [],
    skip: [],
    record: [],
  };
  const skipped = await game.skip(A, 'year');
  replies.skip!.push(skipped);
  let snap: Snapshot = skipped.snapshot;
  const mob = snap.mobs[0]!;
  const planAct = await game.act(A, {
    action: {
      type: 'setPlan',
      mob: mob.id,
      stops: snap.paddocks.slice(0, 2).map((p) => p.cell),
      trigger: { mode: 'kg', kg: 1500, maxDays: 10 },
      rounds: 0,
      after: 'repeat',
      step: 0,
    },
  });
  replies.act!.push(planAct);
  // A second plan that moves by days, on the other mob.
  const other = snap.mobs[1]!;
  replies.act!.push(
    await game.act(A, {
      action: {
        type: 'setPlan',
        mob: other.id,
        stops: snap.paddocks
          .slice(0, 2)
          .map((p) => p.cell)
          .reverse(),
        trigger: { mode: 'days', every: 3 },
        rounds: 0,
        after: 'repeat',
        step: 0,
      },
    }),
  );
  // Skips go on until a year closes, so the year end card's keys are seen.
  for (let i = 0; i < 8; i++) {
    const more = await game.skip(A, 'year');
    replies.skip!.push(more);
    if (more.yearEnd) break;
  }
  const week = await game.skip(A, 'week');
  replies.skip!.push(week);
  snap = week.snapshot;
  const day = await game.endDay(A);
  replies.day!.push(day);
  snap = day.snapshot;
  // A line of fence: a card with a line and notes.
  const edges = [5, 6, 7, 8].map((x) => ({ line: 'h' as const, index: 14 * W + x }));
  replies.preview!.push(
    await game.preview(A, { action: { type: 'buildFence', edges, fence: 'permanent' } }),
  );
  // A sale: a card with ready-made lines. Then the same request again (a stored answer).
  const sell = { action: { type: 'sellClass' as const, cls: 'cow', qty: 1 } };
  const p = await game.preview(A, sell);
  replies.preview!.push(p);
  const id = rid();
  replies.act!.push(await game.act(A, sell, { version: snap.farmVersion, requestId: id }));
  replies.act!.push(await game.act(A, sell, { version: snap.farmVersion, requestId: id }));
  // A stale card, and a refusal.
  replies.act!.push(await game.act(A, sell, { version: 'abc', requestId: rid() }));
  replies.act!.push(await game.act(A, { action: { type: 'markCalves', mob: 9999 } }));
  replies.preview!.push(await game.preview(A, { action: { type: 'markCalves', mob: 9999 } }));
  replies.day!.push(await game.endDay(A, 'abc'));
  replies.record!.push(await game.record(A));
  const last = await game.snapshot(A);
  return { snaps: [snap, last!], replies };
}

const SETUP = {
  district: 'nsw' as const,
  size: 'small' as const,
  enterprise: 'grazing' as const,
  years: 'random' as const,
  startType: 'running' as const,
  difficulty: 'easy' as const,
  name: 'Engine',
};

const engineFarm = (): FarmState =>
  createFarm({
    seed: 3,
    district: 'nsw',
    size: 'small',
    start: { year: 2026, month: 8 },
    startType: 'running',
    difficulty: 'easy',
  });

/**
 * Farms built with the engine for what the server farm does not show: a
 * booked sale and a fence down to fix on one; cattle on the way and a game
 * over on the other (bought on a sale day, so no sale can be booked that day).
 */
function engineFixtures(): Snapshot[] {
  const env = {};
  let farm = engineFarm();
  // Tape, one length knocked down: a to-do with an edge.
  const edges = [5, 6, 7, 8].map((x) => ({ line: 'h' as const, index: 12 * W + x }));
  const tape = applyAction(farm, { type: 'buildFence', edges, fence: 'tape' }, env);
  expect(tape.ok ? 'ok' : tape.message).toBe('ok');
  if (tape.ok) farm = tape.farm;
  // A sale booked on a day with no sale.
  while (saleDayOn(farm, env)) farm = endDay(farm, env).farm;
  const booked = applyAction(farm, { type: 'sellClass', cls: 'cow', qty: 2 }, env);
  expect(booked.ok ? 'ok' : booked.message).toBe('ok');
  if (booked.ok) farm = booked.farm;
  const down = knockDownTape(farm.layout, edges[1]!);
  expect(down.ok ? 'ok' : down.message).toBe('ok');
  if (down.ok) farm = { ...farm, layout: down.layout };
  expect(thingsToDo(farm).some((t) => t.type === 'fence-down')).toBe(true);
  // Cattle bought on a sale day, on their way.
  let other = engineFarm();
  while (!saleDayOn(other, env)) other = endDay(other, env).farm;
  const bought = applyAction(other, { type: 'buyCattle', cls: 'weanerSteer', qty: 5 }, env);
  expect(bought.ok ? 'ok' : bought.message).toBe('ok');
  if (bought.ok) other = bought.farm;
  // A game over (it clears the things to do, so it is on this farm, not the first).
  other = { ...other, over: { reason: 'bank', day: other.day } };
  const stored = { name: 'Engine', setup: SETUP, version: 'v1' };
  return [buildSnapshot(farm, stored, env), buildSnapshot(other, stored, env)];
}

describe('what the game routes send holds only the keys on the lists', () => {
  it('snapshots and replies over several farms: nothing unlisted, and every listed key seen', async () => {
    const { snaps, replies } = await serverFixtures();
    const [engine, onWay] = engineFixtures();
    expect(engine!.market.booked.length).toBeGreaterThan(0);
    expect(engine!.mobs.some((m) => m.bookedDate !== null)).toBe(true);
    expect(onWay!.market.onTheWay.length).toBeGreaterThan(0);
    expect(onWay!.over).not.toBeNull();
    expect(engine!.todo.some((t) => t.edge !== null)).toBe(true);
    const inner: unknown[] = [];
    const replySeen: Seen = new Map();
    for (const [kind, list] of Object.entries(replies)) {
      for (const r of list) shape(r, kind, replySeen, inner);
    }
    const snapSeen: Seen = new Map();
    for (const s of [...snaps, engine, onWay, ...inner]) shape(s, '', snapSeen, []);
    if (process.env.KEYS_DUMP) {
      const dump = (m: Seen) =>
        Object.fromEntries([...m].map(([k, v]) => [k, [...v].sort()]).sort());
      writeFileSync(
        process.env.KEYS_DUMP,
        JSON.stringify({ snap: dump(snapSeen), reply: dump(replySeen) }, null, 1),
      );
    }
    expect(unlisted(snapSeen, SNAPSHOT_KEYS)).toEqual([]);
    expect(unlisted(replySeen, REPLY_KEYS)).toEqual([]);
    expect(unseen(snapSeen, SNAPSHOT_KEYS)).toEqual([]);
    expect(unseen(replySeen, REPLY_KEYS)).toEqual([]);
  }, 180_000);

  it('a field added anywhere is caught, and a listed key never sent is caught', () => {
    const fake = {
      version: 1,
      mobs: [{ id: 1, preg: 3 }],
      market: { prices: [{ id: 'x', saleValue: 9 }] },
      secret: 1,
    };
    const seen: Seen = new Map();
    shape(fake, '', seen, []);
    expect(unlisted(seen, SNAPSHOT_KEYS)).toEqual([
      'market.prices[].saleValue',
      'mobs[].preg',
      'secret',
    ]);
    expect(unseen(seen, { '': ['version', 'gone'] })).toEqual(['gone']);
  });
});
