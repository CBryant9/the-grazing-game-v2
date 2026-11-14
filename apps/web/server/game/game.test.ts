import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createFarm,
  endDay,
  farmTotals,
  saveFarm,
  surveyOf,
  thingsToDo,
  type FarmState,
} from '@gg/engine';
import type { SetupChoices, Snapshot } from '../../lib/game/types';
import { GameError, GameServer, farmIdFor, parseAction } from './game';
import { buildSnapshot } from './snapshot';
import { MemoryFarmStore, type StoredFarm } from './store';
import { cleanName, parseSetup, setupOptions } from './setup';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);

const choices = (over: Partial<SetupChoices> = {}): SetupChoices => ({
  district: 'cw',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'Wattle Flat',
  ...over,
});

const server = (seed = 7): GameServer =>
  new GameServer({ store: new MemoryFarmStore(), seed: () => seed });

/** Every key at every depth, with its path. Lists count as `[]`. */
function walk(value: unknown, path = '', out: { key: string; path: string }[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, `${path}[]`, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      out.push({ key, path: path ? `${path}.${key}` : key });
      walk(v, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
}

/** Names that belong to the model and must never reach the browser. */
const DENY = [
  'seed',
  'rng',
  'rngState',
  'priceHistory',
  'actionLog',
  'dataVersion',
  'engineVersion',
  'saveFormat',
  'pasture',
  'animalIds',
  'nextMobId',
  'inboxSeq',
  'startCash',
  'overdraft',
  'broke',
  'crops',
  'layout',
  'seasons',
  'weather',
  'tables',
  'formula',
  'G',
  'D',
  // Added with the paddock sheet and the mob card: nothing that reveals a rule.
  'threshold',
  'thresholds',
  'weights',
  'dmd',
  'dist',
  'rule',
  'rules',
  'forecast',
  'forecasts',
  'predict',
  'future',
  'nextDay',
  // Added with the market, plans and crops: no price series, sale calendar or crop table.
  'priceSeries',
  'series',
  'forwardPrice',
  'saleCalendar',
  'calendar',
  'schedule',
  'mature',
  'matureDays',
  'estab',
  'yieldT',
  'curve',
  'curves',
  'table',
  'sowDays',
  'latestPrice',
  'nextSales',
];
/**
 * The map's mob list carries a number the map uses to stand each beast in
 * the same place. It comes from the mob's id alone (see FarmViewMob.seed),
 * so it is the one place the word is allowed.
 */
const ALLOWED = new Set(['view.mobs[].seed']);

function denied(snapshot: unknown): string[] {
  return walk(snapshot)
    .filter((k) => DENY.includes(k.key) && !ALLOWED.has(k.path))
    .map((k) => k.path);
}

describe('setup', () => {
  it('offers the four districts with real hectares and no dollar figures', () => {
    const o = setupOptions();
    expect(o.districts.map((d) => d.id)).toEqual(['cq', 'nsw', 'cw', 'wv']);
    for (const d of o.districts) {
      expect(d.sizes.map((s) => s.id)).toEqual(['small', 'medium', 'large']);
      expect(d.sizes[0]!.ha).toBeLessThan(d.sizes[2]!.ha);
    }
    expect(JSON.stringify(o)).not.toMatch(/\$|dollar/i);
  });

  it('checks the choices and gives plain messages', () => {
    expect(parseSetup(choices()).ok).toBe(true);
    for (const bad of [
      null,
      [],
      'x',
      {},
      { ...choices(), district: 'moon' },
      { ...choices(), name: '' },
    ]) {
      const r = parseSetup(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/^[A-Z]/);
    }
    expect(parseSetup({ ...choices(), enterprise: 'mixed' }).ok).toBe(false);
    expect(
      parseSetup({ ...choices(), enterprise: 'mixed', arablePct: 33, croppedPct: 50 }).ok,
    ).toBe(false);
    expect(
      parseSetup({ ...choices(), enterprise: 'mixed', arablePct: 20, croppedPct: 50 }).ok,
    ).toBe(true);
  });

  it('cleans the farm name', () => {
    expect(cleanName('  <b>Wattle</b>   Flat\u0000 ')).toBe('bWattleb Flat');
    expect(cleanName('x'.repeat(100))).toHaveLength(40);
  });
});

describe('the game server', () => {
  it('creates a farm and returns a snapshot', async () => {
    const game = server();
    expect(await game.snapshot(A)).toBeNull();
    const s = await game.create(A, choices());
    expect(s.farm.name).toBe('Wattle Flat');
    expect(s.farm.setup.districtName).toBe('Central West NSW');
    expect(s.day).toBe(0);
    expect(s.view.paddocks.length).toBeGreaterThan(0);
    expect(s.totals.head).toBeGreaterThan(0);
    expect(s.clock.canStartJobs).toBe(true);
    expect(await game.snapshot(A)).toEqual(s);
  });

  it('keeps one farm for a session', async () => {
    const game = server();
    await game.create(A, choices());
    await expect(game.create(A, choices())).rejects.toBeInstanceOf(GameError);
    await game.remove(A);
    expect(await game.snapshot(A)).toBeNull();
    await expect(game.create(A, choices())).resolves.toBeDefined();
  });

  it('creates a scratch farm with no cattle, and a mixed farm with cropping', async () => {
    const game = server();
    const scratch = await game.create(A, choices({ startType: 'scratch' }));
    expect(scratch.totals.head).toBe(0);
    const mixed = await game.create(
      B,
      choices({ district: 'cq', enterprise: 'mixed', arablePct: 25, croppedPct: 50 }),
    );
    expect(mixed.farm.setup.arablePct).toBe(25);
    expect(mixed.view.plantings.length).toBeGreaterThan(0);
  });

  it('creates a real-years farm from the real tables', async () => {
    const s = await server().create(A, choices({ years: 'real-in-order' }));
    expect(s.date.year).toBeGreaterThanOrEqual(1997);
    expect(s.season).toBeTruthy();
  }, 60_000);

  it('previews a job, does it, and reports the same figures', async () => {
    const game = server();
    await game.create(A, choices());
    // Seed 7 has calves to mark by about day 133 in every district.
    let snap = (await game.snapshot(A))!;
    let item = snap.todo.find((t) => t.button);
    for (let i = 0; i < 40 && !item; i++) {
      snap = (await game.skip(A, 'week')).snapshot;
      item = snap.todo.find((t) => t.button);
    }
    expect(item, 'a job with a button should come up').toBeDefined();
    const preview = await game.preview(A, { todo: item!.key });
    // Looking is free: nothing changed.
    expect((await game.snapshot(A))!.clock.usedMin).toBe(snap.clock.usedMin);
    expect(preview.ok).toBe(true);
    const done = await game.act(A, { todo: item!.key });
    expect(done.ok).toBe(true);
    if (preview.ok && done.ok) {
      expect(done.card).toEqual(preview.card);
      expect(done.snapshot.clock.usedMin).toBeCloseTo(snap.clock.usedMin + preview.card.workMin, 0);
      expect(done.message).toMatch(/marked/);
      expect(done.snapshot.todo.find((t) => t.key === item!.key)).toBeUndefined();
    }
  }, 60_000);

  it('refuses with a plain reason and changes nothing', async () => {
    const game = server();
    await game.create(A, choices());
    const before = (await game.snapshot(A))!;
    const r = await game.act(A, { action: { type: 'markCalves', mob: 9999 } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no-such-mob');
      expect(r.message).toMatch(/^[A-Z]/);
      expect(r.message).not.toMatch(/at \w+\.|\.ts|Error:/);
    }
    expect(await game.snapshot(A)).toEqual(before);
    await expect(game.act(A, { todo: 'nothing:1' })).rejects.toThrow(GameError);
    await expect(game.act(A, { action: { type: 'buyCattle' } as never })).rejects.toThrow(
      /not one the game can do/,
    );
  });

  it('refuses a job when the light is used up, with the reason', async () => {
    const game = server();
    const s = await game.create(A, choices());
    const mob = s.mobs.find((m) => m.where === 'paddock')!;
    const cells = [...new Set(s.view.paddocks.map((p) => p.labelCell))];
    let reason: string | null = null;
    for (let i = 0; i < 200 && !reason; i++) {
      const r = await game.act(A, {
        action: { type: 'moveMob', mob: mob.id, cell: cells[i % cells.length]! },
      });
      if (!r.ok && r.reason.includes('daylight')) reason = r.message;
    }
    expect(reason).toMatch(/time|light/i);
    const evening = (await game.snapshot(A))!;
    expect(evening.clock.leftMin).toBeLessThan(60);
    // Looking still works, and Next day starts a fresh day with the light back.
    const next = (await game.endDay(A)).snapshot;
    expect(next.clock.leftMin).toBe(next.clock.dayMin);
    expect(next.clock.evening).toBe(false);
  }, 60_000);

  it('ends the day and says what happened', async () => {
    const game = server();
    const first = await game.create(A, choices());
    const { snapshot, summary } = await game.endDay(A);
    expect(snapshot.day).toBe(first.day + 1);
    expect(summary.kind).toBe('day');
    expect(summary.daysRun).toBe(1);
    expect(summary.from).toEqual(first.date);
    expect(summary.to).toEqual(snapshot.date);
    expect(snapshot.clock.usedMin).toBe(0);
    expect(summary.stops).toBeInstanceOf(Array);
  });

  it('skips a week, and a month, and says why it stopped', async () => {
    const game = server();
    await game.create(A, choices());
    const week = await game.skip(A, 'week');
    expect(week.summary.kind).toBe('skip');
    expect(week.summary.daysAsked).toBe(7);
    expect(week.summary.daysRun).toBeGreaterThanOrEqual(1);
    expect(week.snapshot.day).toBe(week.summary.daysRun);
    const month = await game.skip(A, 'month');
    expect(month.summary.daysAsked).toBe(30);
    for (const s of [...week.summary.stops, ...month.summary.stops]) {
      expect(s).not.toMatch(/overgrazed/i);
    }
  }, 60_000);

  it('saves and reloads to the same snapshot', async () => {
    const store = new MemoryFarmStore();
    const one = new GameServer({ store, seed: () => 11 });
    await one.create(A, choices());
    await one.endDay(A);
    const after = (await one.skip(A, 'week')).snapshot;
    // A new server with an empty cache reads the farm back from the store.
    const two = new GameServer({ store, seed: () => 99 });
    expect(await two.snapshot(A)).toEqual(after);
    const next = await two.endDay(A);
    const same = await one.endDay(A);
    expect(next.snapshot).toEqual(same.snapshot);
  }, 60_000);

  it("does not let one session read or change another session's farm", async () => {
    const store = new MemoryFarmStore();
    const game = new GameServer({ store, seed: () => 3 });
    await game.create(A, choices({ name: 'Alpha' }));
    expect(await game.snapshot(B)).toBeNull();
    await expect(game.endDay(B)).rejects.toThrow(/no farm/);
    await expect(game.skip(B, 'week')).rejects.toThrow(/no farm/);
    await game.create(B, choices({ name: 'Beta', district: 'wv' }));
    await game.endDay(B);
    expect((await game.snapshot(A))!.farm.name).toBe('Alpha');
    expect((await game.snapshot(A))!.day).toBe(0);
    expect((await game.snapshot(B))!.farm.name).toBe('Beta');
    expect((await game.snapshot(B))!.day).toBe(1);
    expect(farmIdFor(A)).not.toBe(farmIdFor(B));
    expect(farmIdFor(A)).not.toContain('aaaa');
    expect(() => farmIdFor('../../etc/passwd')).toThrow(GameError);
  });

  it('runs quick taps one at a time', async () => {
    const game = server();
    await game.create(A, choices());
    await Promise.all([game.endDay(A), game.endDay(A), game.endDay(A)]);
    expect((await game.snapshot(A))!.day).toBe(3);
  });
});

describe('parseAction', () => {
  it('accepts the simple jobs with whole numbers and nothing else', () => {
    expect(parseAction({ type: 'markCalves', mob: 3 })).toEqual({ type: 'markCalves', mob: 3 });
    expect(parseAction({ type: 'moveMob', mob: 3, cell: 10 })).toEqual({
      type: 'moveMob',
      mob: 3,
      to: { cell: 10 },
    });
    for (const bad of [
      null,
      'markCalves',
      { type: 'markCalves' },
      { type: 'markCalves', mob: 1.5 },
      { type: 'markCalves', mob: -1 },
      { type: 'moveMob', mob: 1, cell: 5000 },
      { type: 'buyCattle', cls: 'moon', qty: 5 },
      { type: 'buyCattle', cls: 'bull', qty: 0 },
      { type: 'buyCattle', cls: 'bull', qty: 5001 },
      { type: 'sellClass', cls: 'moon', qty: 5 },
      { type: 'sellClass', cls: 'weanerSteer', qty: 5 },
      { type: 'sow', species: 'wheat', cells: [] },
      { type: 'sow', species: 'wheat', cells: [1, 1.5] },
      { type: 'sow', species: 'moon', cells: [1] },
      { type: 'sow', species: 'wheat', cells: [99999] },
      { type: 'resumePlan', mob: 1, step: -1 },
      { type: 'setPlan', mob: 1 },
    ]) {
      expect(parseAction(bad)).toBeNull();
    }
    expect(parseAction({ type: 'buyCattle', cls: 'bull', qty: 5 })).toEqual({
      type: 'buyCattle',
      cls: 'bull',
      qty: 5,
    });
    expect(parseAction({ type: 'sellClass', cls: 'bull', qty: 5 })).toEqual({
      type: 'sellClass',
      cls: 'bull',
      qty: 5,
    });
  });
});

describe('the snapshot keeps the rules hidden', () => {
  it('holds no model names, and no word the deny list names', async () => {
    const game = server();
    const s = await game.create(A, choices());
    expect(denied(s)).toEqual([]);
    const later = (await game.skip(A, 'month')).snapshot;
    expect(denied(later)).toEqual([]);
    // The one allowed use of the word is the map's placing number.
    expect(walk(s).some((k) => k.path === 'view.mobs[].seed')).toBe(true);
  }, 60_000);

  it('the walker would catch a leak', () => {
    expect(denied({ a: { rng: 1 } })).toEqual(['a.rng']);
    expect(denied({ list: [{ priceHistory: [] }] })).toEqual(['list[].priceHistory']);
    expect(denied({ seed: 5 })).toEqual(['seed']);
    expect(denied({ view: { mobs: [{ seed: 5 }] } })).toEqual([]);
  });

  it('is plain JSON: no typed arrays, no infinities', async () => {
    const s = await server().create(A, choices());
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/null,null,null,null/);
    expect(JSON.parse(text)).toEqual(s);
  });

  it('stays under 150 KB for a farm with 4,000 head', async () => {
    const PLENTY = { cash: 5e7, overdraft: -5e7, broke: -1e9 };
    let farm: FarmState = createFarm({
      seed: 5,
      district: 'cq',
      size: 'large',
      start: { year: 2024, month: 4 },
      startType: 'running',
      difficulty: 'easy',
      money: PLENTY,
    });
    const survey = surveyOf(farm);
    // Cattle bought land in the stock yards at first light the next day.
    for (const area of survey.topology.areas) {
      const done = applyAction(farm, {
        type: 'buyCattle',
        cls: 'weanerSteer',
        qty: 700,
        to: { cell: area.cells[0]! },
      });
      if (done.ok) farm = done.farm;
    }
    farm = endDay(farm).farm;
    expect(farmTotals(farm).head).toBeGreaterThan(4000);
    const stored: StoredFarm = {
      name: 'Big Run',
      setup: choices({ district: 'cq' }),
      saved: saveFarm(farm),
    };
    const store = new MemoryFarmStore();
    await store.put(farmIdFor(A), stored);
    const game = new GameServer({ store });
    const snap = (await game.snapshot(A))!;
    const bytes = Buffer.byteLength(JSON.stringify(snap));
    console.log(`snapshot for ${snap.totals.head} head: ${bytes} bytes`);
    expect(bytes).toBeLessThan(150 * 1024);
    expect(denied(snap)).toEqual([]);
    // After a few days the inbox and the summary stay small too.
    const day = await game.skip(A, 'week');
    expect(Buffer.byteLength(JSON.stringify(day))).toBeLessThan(150 * 1024);
  }, 120_000);

  it('stays small, and hides the rules, with a plan, crops, prices and a full inbox', async () => {
    const game = server();
    const first = await game.create(A, {
      ...choices({ district: 'cw', size: 'large' }),
      enterprise: 'mixed',
      arablePct: 40,
      croppedPct: 50,
    });
    const pads = first.paddocks.filter((p) => p.water !== 'none');
    const mob = first.mobs.find((m) => m.where === 'paddock')!;
    const set = await game.act(A, {
      action: {
        type: 'setPlan',
        mob: mob.id,
        stops: pads.map((p) => p.cell),
        trigger: { mode: 'kg', kg: 1500, maxDays: 14 },
        rounds: 0,
        after: 'repeat',
        step: 0,
      },
    });
    expect(set.ok).toBe(true);
    let snap = (await game.skip(A, 'year')).snapshot;
    for (let i = 0; i < 3; i++) snap = (await game.skip(A, 'month')).snapshot;
    expect(snap.plans).toHaveLength(1);
    expect(snap.cropping).not.toBeNull();
    expect(snap.market.chart.classes).toHaveLength(8);
    expect(snap.inbox).toHaveLength(40);
    expect(denied(snap)).toEqual([]);
    const bytes = Buffer.byteLength(JSON.stringify(snap));
    console.log(`mixed farm with a plan and a full inbox: ${bytes} bytes`);
    expect(bytes).toBeLessThan(150 * 1024);
    // The chart is the past only: it ends today, and holds at most a month.
    const points = snap.market.chart.classes[0]!.points;
    expect(points.length).toBeLessThanOrEqual(31);
    expect(snap.market.chart.to).toEqual(snap.date);
  }, 180_000);

  it('builds from a farm directly too', () => {
    const farm = createFarm({
      seed: 1,
      district: 'wv',
      size: 'small',
      start: { year: 2025, month: 0 },
      startType: 'running',
      difficulty: 'medium',
    });
    expect(thingsToDo(farm)).toBeInstanceOf(Array);
    const snap: Snapshot = buildSnapshot(
      farm,
      { name: 'X', setup: choices({ district: 'wv' }) },
      {},
    );
    expect(snap.farm.district).toBe('wv');
  });
});
