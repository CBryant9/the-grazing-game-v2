import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SetupChoices, Snapshot } from '../../lib/game/types';
import { GameServer, farmIdFor } from './game';
import { parseSetup, setupOptions } from './setup';
import { MemoryFarmStore } from './store';

/*
 * Sheep on the screens (milestone 2.8): behind the sheep switch, off by default; never in
 * Central Queensland; and on a sheep farm, the mob card, market, moves, feeding, shearing and
 * the summary in words.
 */

const A = 'b'.repeat(32);

const choices = (over: Partial<SetupChoices> = {}): SetupChoices => ({
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'easy',
  name: 'Woolly Flat',
  ...over,
});

const server = (sheepOn: boolean, store = new MemoryFarmStore()): GameServer =>
  new GameServer({ store, seed: () => 11, sheepOn: async () => sheepOn });

/** Every string value in a reply (keys left out), with its path. */
function strings(value: unknown, path = '', out: { path: string; text: string }[] = []) {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

const SHEEP_WORDS =
  /\b(sheep|wool|netting|ewes?|lambs?|wethers?|hoggets?|shearing|crutching|micron)\b/i;

describe('the sheep switch, off (the default)', () => {
  it('offers cattle only at setup and refuses a sheep farm', () => {
    const o = setupOptions(false);
    expect(o.stocks).toEqual([]);
    expect(o.districts.every((d) => !d.sheep && d.flock.length === 0)).toBe(true);
    expect(parseSetup({ ...choices(), stock: 'sheep' }, false).ok).toBe(false);
    expect(parseSetup({ ...choices(), stock: 'cattle' }, false).ok).toBe(true);
  });

  it('a cattle farm shows nothing about sheep anywhere, and refuses sheep jobs', async () => {
    const game = server(false);
    await game.create(A, choices());
    const s = (await game.skip(A, 'week')).snapshot;
    expect(s.market.sheep).toBeNull();
    expect(s.mobs.every((m) => m.species === 'cattle' && m.sheep === null)).toBe(true);
    expect(s.build.fences.map((f) => f.id)).toEqual(['permanent', 'electric', 'tape']);
    expect(s.view.flocks).toBeUndefined();
    const found = strings({ ...s, view: null }).filter((x) => SHEEP_WORDS.test(x.text));
    expect(found).toEqual([]);
    await expect(
      game.act(A, { action: { type: 'buySheep', cls: 'merinoEwes', qty: 5 } }),
    ).rejects.toThrow(/not part of this farm/);
    await expect(
      game.preview(A, {
        action: { type: 'buildFence', edges: [{ line: 'h', index: 400 }], fence: 'netting' },
      }),
    ).rejects.toThrow(/not part of this farm/);
  }, 120_000);
});

describe('the sheep switch, on', () => {
  it('is never offered in Central Queensland', () => {
    const o = setupOptions(true);
    expect(o.stocks.map((x) => x.id)).toEqual(['cattle', 'sheep', 'mix']);
    expect(o.districts.find((d) => d.id === 'cq')!.sheep).toBe(false);
    for (const id of ['nsw', 'cw', 'wv']) {
      const d = o.districts.find((x) => x.id === id)!;
      expect(d.sheep).toBe(true);
      expect(d.flock.map((f) => f.stock)).toEqual(['sheep', 'mix']);
      expect(d.flock[0]!.text).toMatch(/Merino/);
      expect(d.flock[0]!.text).not.toMatch(/—/);
    }
    expect(parseSetup({ ...choices({ district: 'cq' }), stock: 'sheep' }, true).ok).toBe(false);
    const ok = parseSetup({ ...choices(), stock: 'mix' }, true);
    expect(ok.ok && ok.value.stock).toBe('mix');
  });

  it('a sheep farm: the mob card, feeding, the market, a move, shearing and the summary', async () => {
    const game = server(true);
    let s: Snapshot = await game.create(A, { ...choices(), stock: 'sheep' });
    expect(s.farm.setup.stock).toBe('sheep');
    const flock = s.mobs.find((m) => m.species === 'sheep')!;
    expect(flock).toBeDefined();
    expect(s.mobs.some((m) => m.species === 'cattle')).toBe(false);
    const sh = flock.sheep!;
    expect(flock.classes.some((c) => c.id === 'ewe')).toBe(true);
    expect(flock.dse).toBeGreaterThan(0);
    expect(sh.shearing).toMatch(/^Shearing on \d+ [A-Z][a-z]+\. About \$9\.81 a head\.$/);
    expect(sh.wool === null || /micron|shorn/i.test(sh.wool)).toBe(true);
    expect(sh.joining.length).toBeGreaterThan(0);
    expect(s.market.sheep!.buy.length).toBeGreaterThan(0);
    expect(s.build.fences.map((f) => f.id)).toContain('netting');
    expect(s.build.fences.find((f) => f.id === 'permanent')!.text).toMatch(
      /A cattle fence does not hold sheep\./,
    );
    expect(s.view.flocks?.length).toBe(1);
    // Stocking: the paddock the flock is in carries its DSE.
    const pad = s.paddocks.find((p) => p.mobs.includes(flock.id))!;
    expect(pad.dse).toBeGreaterThan(0);
    expect(s.totals.dse).toBeGreaterThanOrEqual(flock.dse - 1);

    // Feeding: a card with the cost a day, then the mob is on it.
    s = (await game.skip(A, 'week')).snapshot;
    const m1 = s.mobs.find((m) => m.species === 'sheep')!;
    expect(m1.sheep!.feedOptions.map((o) => o.id)).toEqual(['none', 'lick', 'grain', 'hay']);
    const card = await game.preview(A, {
      action: { type: 'setSheepFeed', mob: m1.id, feed: 'hay' },
    });
    expect(card.ok && card.card.perDay).toBeGreaterThan(0);
    const fed = await game.act(A, { action: { type: 'setSheepFeed', mob: m1.id, feed: 'hay' } });
    expect(fed.ok).toBe(true);
    expect(fed.ok && fed.message).toMatch(/on hay/);
    s = fed.snapshot;
    expect(s.mobs.find((m) => m.id === m1.id)!.sheep!.feed).toBe('hay');

    // Moving into a paddock with cattle is refused in plain words; into an empty one is done.
    const empty = s.paddocks.find((p) => p.mobs.length === 0 && p.water !== 'none');
    if (empty) {
      const mv = await game.act(A, { action: { type: 'moveMob', mob: m1.id, cell: empty.cell } });
      expect(mv.ok ? mv.message : mv.message).toMatch(/moved|holds|Paddock/);
    }

    // The shearing day moves; it reads back as a dated fact.
    const moved = await game.act(A, {
      action: {
        type: 'setShearing',
        mob: m1.id,
        month: s.date.month,
        date: Math.min(28, s.date.date + 3),
      },
    });
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.snapshot.mobs.find((m) => m.id === m1.id)!.sheep!.shearing).toMatch(
        /^Shearing on/,
      );
    }

    // Skip on to the shearing: the summary says what was shorn and what the wool made.
    const after = await game.skip(A, 'week');
    expect(after.summary.sheepLines.some((l) => /shorn/.test(l))).toBe(true);
    expect(after.summary.money.wool).toBeGreaterThan(0);
    expect(after.snapshot.inbox.some((m) => m.kind === 'sheep' && /shorn/.test(m.text))).toBe(true);
    const rec = await game.record(A);
    expect(rec.soFar.money.some((r) => r.label === 'Wool' && r.dollars > 0)).toBe(true);
    for (const x of strings(after)) expect(x.text).not.toMatch(/—|You should/);
  }, 240_000);

  it('buys and sells sheep on a sale day, with the money on the card first', async () => {
    const game = server(true);
    let s = await game.create(A, { ...choices(), stock: 'sheep' });
    for (let i = 0; i < 20 && !s.market.isSaleDay; i++) s = (await game.endDay(A)).snapshot;
    expect(s.market.isSaleDay).toBe(true);
    const buy = { action: { type: 'buySheep' as const, cls: 'merinoWethers', qty: 20 } };
    const card = await game.preview(A, buy);
    expect(card.ok && card.card.summary?.[0]).toMatch(/^Buy 20 merino wethers for \$[\d,]+/);
    const bought = await game.act(A, buy);
    expect(bought.ok).toBe(true);
    const flock = bought.snapshot.mobs.find((m) => m.species === 'sheep')!;
    const pick = flock.sheep!.sell[0]!;
    const sell = { action: { type: 'sellSheep' as const, mob: flock.id, pick: pick.id, qty: 5 } };
    const sc = await game.preview(A, sell);
    expect(sc.ok && sc.card.summary?.[1]).toMatch(/into the bank today/);
    const sold = await game.act(A, sell);
    expect(sold.ok).toBe(true);
    // The next morning the bought sheep are in the yards, with a to-do line that opens the move.
    const next = (await game.endDay(A)).snapshot;
    expect(next.todo.some((t) => t.key.startsWith('sheep-yards:') && t.opens === 'move')).toBe(
      true,
    );
  }, 240_000);

  it('a mixed farm refuses sheep into the cattle paddock, worded plainly', async () => {
    const game = server(true);
    const s = await game.create(A, { ...choices(), stock: 'mix' });
    const flock = s.mobs.find((m) => m.species === 'sheep')!;
    const cattle = s.mobs.find((m) => m.species === 'cattle')!;
    const pad = s.paddocks.find((p) => p.mobs.includes(cattle.id))!;
    const r = await game.act(A, { action: { type: 'moveMob', mob: flock.id, cell: pad.cell } });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.message).toBe(
        `${pad.area} holds cattle. Cattle and sheep run in separate paddocks.`,
      );
    const back = await game.act(A, {
      action: {
        type: 'moveMob',
        mob: cattle.id,
        cell: s.paddocks.find((p) => p.mobs.includes(flock.id))!.cell,
      },
    });
    expect(back.ok ? 'ok' : back.message).toMatch(/holds sheep\./);
  }, 120_000);
});

describe('old farms', () => {
  it('a farm stored by the web line on engine 0.13 (save format 9) opens, shows no sheep, and plays on', async () => {
    // The save inside was made by engine 0.13.0's own code (the same engine source as the web
    // line's m3.5-admin-shell). The web's wrapper (stored format 3) has no engine fields.
    const saved = JSON.parse(
      readFileSync('packages/engine/test-support/fixtures/save-format-9.json', 'utf8'),
    ) as { saveFormat: number; district: string; day: number };
    expect(saved.saveFormat).toBe(9);
    const store = new MemoryFarmStore();
    const stored = {
      format: 3,
      name: 'Old Farm',
      setup: { ...choices({ district: 'nsw' }) },
      saved,
      version: 'old1',
      done: [],
      diary: [],
    };
    store.putRaw(farmIdFor(A), JSON.stringify(stored));
    for (const on of [false, true]) {
      const game = server(on, store);
      const s = (await game.snapshot(A))!;
      expect(s.farm.setup.stock).toBe('cattle');
      expect(s.mobs.length).toBeGreaterThan(0);
      expect(s.mobs.every((m) => m.species === 'cattle')).toBe(true);
      if (!on) expect(s.market.sheep).toBeNull();
    }
    const game = server(false, store);
    const d = await game.endDay(A);
    expect(d.snapshot.day).toBe(saved.day + 1);
    // It saves on the new engine, and opens again from what was saved.
    const again = await server(false, store).snapshot(A);
    expect(again!.day).toBe(saved.day + 1);
    expect(d.summary.sheepLines).toEqual([]);
  }, 120_000);
});
