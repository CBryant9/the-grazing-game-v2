import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../../lib/game/types';
import { GameServer } from './game';
import { MemoryFarmStore } from './store';

/*
 * The snapshot holds only the keys listed here, at every depth (CLAUDE.md
 * rule 14). A new field can not reach the browser without being added to
 * this list, so each one is looked at. The farm view under `view` has its
 * own list in packages/engine/src/sim/view.test.ts.
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
  over: ['text'],
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

/** Every object's path and keys, below the top. Lists count as `[]`. The view is checked on its own. */
function shape(v: unknown, path: string, out: Map<string, Set<string>>): void {
  if (Array.isArray(v)) {
    for (const x of v) shape(x, `${path}[]`, out);
  } else if (v !== null && typeof v === 'object') {
    const set = out.get(path) ?? new Set<string>();
    out.set(path, set);
    for (const [k, x] of Object.entries(v)) {
      set.add(k);
      if (path === '' && k === 'view') continue;
      shape(x, path ? `${path}.${k}` : k, out);
    }
  }
}

/** Keys found that the list does not name: "path.key". */
function unlisted(snapshot: unknown): string[] {
  const found = new Map<string, Set<string>>();
  shape(snapshot, '', found);
  const bad: string[] = [];
  for (const [path, keys] of found) {
    const allowed = SNAPSHOT_KEYS[path];
    for (const k of keys) {
      if (!allowed || !allowed.includes(k)) bad.push(path ? `${path}.${k}` : k);
    }
  }
  return bad.sort();
}

describe('the snapshot holds only the keys on its list', () => {
  it('a busy mixed farm: plans, crops, a market, mobs with breeding and an inbox', async () => {
    const game = new GameServer({ store: new MemoryFarmStore(), seed: () => 7 });
    const A = 'a'.repeat(32);
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
    let snap: Snapshot = (await game.skip(A, 'year')).snapshot;
    const mob = snap.mobs[0]!;
    await game.act(A, {
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
    snap = (await game.skip(A, 'week')).snapshot;
    expect(snap.plans.length).toBeGreaterThan(0);
    expect(snap.cropping).not.toBeNull();
    expect(snap.mobs.some((m) => m.breeding.length > 0)).toBe(true);
    expect(unlisted(snap)).toEqual([]);
  }, 120_000);

  it('a field added anywhere is caught', () => {
    const fake = {
      version: 1,
      mobs: [{ id: 1, preg: 3 }],
      market: { prices: [{ id: 'x', saleValue: 9 }] },
      secret: 1,
    };
    expect(unlisted(fake)).toEqual(['market.prices[].saleValue', 'mobs[].preg', 'secret']);
  });
});
