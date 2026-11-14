import { describe, expect, it } from 'vitest';
import type { SetupChoices, Snapshot } from '../../lib/game/types';
import { GameServer } from './game';
import { MemoryFarmStore } from './store';
import {
  MLA_CREDIT,
  buyLines,
  buyReason,
  cancelLines,
  inDays,
  longDate,
  saleLine,
  sellLines,
} from './marketwords';

const A = 'a'.repeat(32);
const BANNED = /\bshould\b|\bmust\b|overgraz|\bbad\b|\bgood\b|—|–/i;

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

/** Next day until the farm is on a sale day (or the cap). */
async function toSaleDay(game: GameServer, want: boolean): Promise<Snapshot> {
  let snap = (await game.snapshot(A))!;
  for (let i = 0; i < 20 && snap.market.isSaleDay !== want; i++) {
    snap = (await game.endDay(A)).snapshot;
  }
  expect(snap.market.isSaleDay).toBe(want);
  return snap;
}

describe('the market words', () => {
  const next = { date: { year: 2024, month: 2, date: 14 }, daysAway: 3 };

  it('names the sale day and how far away it is', () => {
    expect(longDate(next.date)).toBe('Thursday 14 March');
    expect(inDays(0)).toBe('today');
    expect(inDays(1)).toBe('tomorrow');
    expect(inDays(3)).toBe('in 3 days');
    expect(saleLine(false, next)).toBe('Next cattle sale: Thursday 14 March, in 3 days.');
    expect(saleLine(true, null)).toBe('There is a cattle sale today.');
    expect(saleLine(false, null)).toBe('No cattle sale in the next few months.');
  });

  it('says why Buy is off, naming the next sale', () => {
    expect(buyReason(true, next)).toBeNull();
    expect(buyReason(false, next)).toBe(
      'Cattle can only be bought on a sale day. The next cattle sale is on Thursday 14 March, in 3 days.',
    );
    expect(buyReason(false, null)).toMatch(/no cattle sale in the next few months/);
  });

  it('writes the buy card from the engine figures', () => {
    const lines = buyLines({
      qty: 40,
      one: 'weaner steer',
      label: 'Weaner steers',
      total: 41_600,
      cashBefore: 200_000,
      units: false,
    });
    expect(lines).toEqual([
      'Buy 40 weaner steers: $41,600, freight and fees included. That is about $1,040 a head.',
      'They arrive tomorrow morning in the stock yards.',
      'That leaves $158,400 in the bank.',
    ]);
  });

  it('shows a negative bank plainly', () => {
    const lines = buyLines({
      qty: 1,
      one: 'bull',
      label: 'Bulls',
      total: 9_000,
      cashBefore: 4_000,
      units: false,
    });
    expect(lines[0]).toMatch(/^Buy 1 bull: \$9,000/);
    expect(lines[2]).toBe('That leaves -$5,000 in the bank.');
  });

  it('writes the sell card for a sale day and for a booking', () => {
    const today = sellLines({
      head: 20,
      calves: 0,
      what: 'weaner steers',
      today: true,
      net: 18_200,
      cashBefore: 50_000,
      sale: null,
    });
    expect(today).toEqual([
      'Sell 20 head of weaner steers today.',
      '$18,200 comes in after commission and selling costs.',
      'That brings the bank to $68,200.',
    ]);
    const booked = sellLines({
      head: 12,
      calves: 3,
      what: 'cows',
      today: false,
      net: 0,
      cashBefore: 50_000,
      sale: next,
    });
    expect(booked.join(' ')).toContain(
      'go down for the next sale on Thursday 14 March, in 3 days.',
    );
    expect(booked).toContain('Nothing is paid now.');
    expect(booked).toContain('The price is set on the day of the sale.');
    expect(booked.join(' ')).toContain('3 calves at foot go with their mothers.');
  });

  it('writes the cancel card', () => {
    expect(cancelLines(12, { date: next.date })[0]).toBe(
      '12 head come off the sale on Thursday 14 March.',
    );
  });

  it('uses the credit line exactly as DATA.md gives it, and no banned word elsewhere', () => {
    expect(MLA_CREDIT).toBe(
      'Reproduced courtesy of Meat & Livestock Australia Limited – www.mla.com.au',
    );
    const all = [
      saleLine(false, next),
      buyReason(false, next)!,
      ...buyLines({ qty: 2, one: 'x', label: 'Xs', total: 100, cashBefore: 500, units: false }),
      ...sellLines({
        head: 2,
        calves: 1,
        what: 'x',
        today: false,
        net: 0,
        cashBefore: 0,
        sale: next,
      }),
      ...cancelLines(2, null),
    ];
    for (const line of all) expect(line).not.toMatch(BANNED);
  });
});

describe('the Market tab in the snapshot', () => {
  it('says whether there is a sale, prices every class, and holds only the past', async () => {
    const game = server();
    const first = await game.create(A, choices());
    expect(first.market.saleLine).toMatch(/cattle sale/i);
    expect(first.market.prices.map((p) => p.id)).toEqual([
      'wean',
      'feed',
      'heavy',
      'wheif',
      'heifer',
      'cow',
      'bull',
      'calf',
    ]);
    for (const p of first.market.prices) {
      expect(p.cKg).toBeGreaterThan(50);
      // c/kg is shown whole, so $ a head can differ by under a dollar a half-cent of price.
      if (p.typicalKg !== null) {
        expect(Math.abs(p.perHead! - (p.typicalKg * p.cKg) / 100)).toBeLessThanOrEqual(
          p.typicalKg / 200 + 1,
        );
      }
    }
    // A farm on day 0 has today's prices and nothing else: no future price.
    expect(first.market.chart.classes[0]!.points).toHaveLength(1);
    expect(first.market.credit).toBeNull();
    const month = (await game.skip(A, 'month')).snapshot;
    const pts = month.market.chart.classes[0]!.points;
    expect(pts.length).toBeLessThanOrEqual(31);
    expect(pts.length).toBeGreaterThan(20);
    // The last point is today's price, and the chart ends today.
    expect(pts[pts.length - 1]).toBe(month.market.prices[0]!.cKg);
    expect(month.market.chart.to).toEqual(month.date);
    expect(month.market.prices[0]!.changeCKg).toBe(pts[pts.length - 1]! - pts[0]!);
  }, 60_000);

  it('turns Buy off on a day with no sale, and says why', async () => {
    const game = server();
    await game.create(A, choices());
    const snap = await toSaleDay(game, false);
    expect(snap.market.buy.reason).toMatch(/^Cattle can only be bought on a sale day\. The next/);
    const r = await game.preview(A, { action: { type: 'buyCattle', cls: 'weanerSteer', qty: 5 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-a-sale-day');
  }, 60_000);

  it('buys on a sale day: the card says the money, the cattle arrive next morning', async () => {
    const game = server();
    await game.create(A, choices());
    const snap = await toSaleDay(game, true);
    expect(snap.market.buy.reason).toBeNull();
    const action = { type: 'buyCattle', cls: 'weanerSteer', qty: 10 } as const;
    const preview = await game.preview(A, { action });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const card = preview.card;
    expect(card.summary).toBeDefined();
    expect(card.summary![0]).toMatch(/^Buy 10 weaner steers: \$[\d,]+, freight and fees included/);
    expect(card.summary![1]).toBe('They arrive tomorrow morning in the stock yards.');
    expect(card.summary![2]).toMatch(/^That leaves \$[\d,]+ in the bank\.$/);
    // The card does not also carry the engine's own arrival note.
    expect(card.notes.join(' ')).not.toMatch(/arrive/);
    const done = await game.act(A, { action });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.message).toMatch(/Bought 10 head/);
    expect(done.snapshot.market.onTheWay[0]!.head).toBe(10);
    expect(done.snapshot.market.onTheWay[0]!.cls).toBe('Weaner steers');
    expect(done.snapshot.totals.cash).toBeLessThan(snap.totals.cash);
    // Next morning they are in the yards, and the things to do says so.
    const next = (await game.endDay(A)).snapshot;
    expect(next.market.onTheWay).toHaveLength(0);
    const yards = next.mobs.find((m) => m.where === 'yards');
    expect(yards?.head).toBe(10);
    expect(next.todo.some((t) => t.key.startsWith('in-yards:'))).toBe(true);
    expect(next.inbox.some((m) => /arrived in the stock yards/.test(m.text))).toBe(true);
  }, 90_000);

  it('sells by class on a sale day, and books on another day with a cancel', async () => {
    const game = server();
    await game.create(A, choices());
    // Not a sale day: the stock go down for the next sale.
    const off = await toSaleDay(game, false);
    const cls = off.market.sell.classes[0]!;
    const sell = { type: 'sellClass', cls: cls.id, qty: Math.min(3, cls.head) } as const;
    const p = await game.preview(A, { action: sell });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const text = p.card.summary!.join(' ');
    expect(text).toMatch(/go down for the next sale on \w+day \d+ \w+, (tomorrow|in \d+ days)\./);
    expect(text).toContain('Nothing is paid now.');
    expect(text).toContain('The price is set on the day of the sale.');
    const done = await game.act(A, { action: sell });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const booked = done.snapshot.mobs.filter((m) => m.booked > 0);
    expect(booked.length).toBeGreaterThan(0);
    expect(done.snapshot.totals.cash).toBe(off.totals.cash);
    // The booked head are no longer free to sell.
    const after = done.snapshot.market.sell.classes.find((c) => c.id === cls.id);
    expect(after?.head ?? 0).toBe(cls.head - Math.min(3, cls.head));
    // Cancel it.
    const mob = booked[0]!;
    const cancel = { type: 'cancelSale', mob: mob.id } as const;
    const cp = await game.preview(A, { action: cancel });
    expect(cp.ok).toBe(true);
    if (cp.ok) expect(cp.card.summary![0]).toMatch(/^\d+ head come off the sale on /);
    const cd = await game.act(A, { action: cancel });
    expect(cd.ok).toBe(true);
    if (cd.ok) expect(cd.snapshot.mobs.every((m) => m.booked === 0)).toBe(true);
    // On a sale day the money comes in at once.
    const on = await toSaleDay(game, true);
    const c2 = on.market.sell.classes[0]!;
    const act2 = { type: 'sellClass', cls: c2.id, qty: 1 } as const;
    const p2 = await game.preview(A, { action: act2 });
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;
    expect(p2.card.summary![0]).toMatch(/^Sell 1 head of .+ today\.$/);
    expect(p2.card.summary!.join(' ')).toMatch(/comes in after commission and selling costs/);
    const d2 = await game.act(A, { action: act2 });
    expect(d2.ok).toBe(true);
    if (d2.ok) {
      expect(d2.snapshot.totals.cash).toBeGreaterThan(on.totals.cash);
      expect(d2.message).toMatch(/1 head sold\. \$[\d,]+ paid into the bank\./);
    }
  }, 120_000);

  it('refuses a request that is not shaped right', async () => {
    const game = server();
    await game.create(A, choices());
    for (const action of [
      { type: 'buyCattle', cls: 'moon', qty: 5 },
      { type: 'buyCattle', cls: 'weanerSteer', qty: 0 },
      { type: 'buyCattle', cls: 'weanerSteer', qty: 1e9 },
      { type: 'buyCattle', cls: 'weanerSteer', qty: 2.5 },
      { type: 'sellClass', cls: 'weanerSteer', qty: 5 },
      { type: 'sellClass', cls: 'wean', qty: -1 },
    ]) {
      await expect(game.preview(A, { action: action as never })).rejects.toThrow(
        /not one the game can do/,
      );
    }
  });

  it('shows the credit line on a real-year farm only', async () => {
    const game = server();
    const snap = await game.create(A, choices({ years: 'real-in-order' }));
    expect(snap.market.credit).toBe(MLA_CREDIT);
  }, 60_000);
});
