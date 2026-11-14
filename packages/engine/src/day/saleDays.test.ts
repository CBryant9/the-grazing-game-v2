import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { applyInstantly } from '../../test-support/instant';
import { PLENTY, openFarm } from '../../test-support/wholeFarm';
import { setUp, toSaleDay, turnedDown, work } from '../../test-support/workingDay';
import { animalLookup } from '../cattle/types';
import { netSaleValue } from '../market/prices';
import { RANDOM_SEASON_SALE_WEEKDAY, STAND_IN_BREAK } from '../market/saleCalendar';
import { netWorth } from '../money/worth';
import { farmHash, loadFarm, saveFarm } from '../save/save';
import { loadRealData } from '../server';
import { createFarm } from '../sim/create';
import { dateOn, nextSaleDay, pricesOf, saleDayOn } from '../sim/derived';
import { cloneFarm, type FarmState } from '../sim/state';
import { mobSummaries } from '../sim/summary';
import { stepDay } from '../sim/tick';
import { previewAction } from './act';
import { endDay, skipDays } from './days';
import { marketView, thingsToDo } from './look';

/*
 * Sale days and the yards (milestone 1.5b; docs/MODEL.md, section 9,
 * "Buying and selling on sale days"). Cattle are bought only on a sale day
 * and land in the stock yards at first light the next day. Stock sold on a
 * day with no sale is booked onto the next sale.
 */

vi.setConfig({ testTimeout: 600_000 });

const DISTRICTS: DistrictId[] = ['cq', 'nsw', 'cw', 'wv'];
const WEEKDAYS = { cq: 3, nsw: 4, cw: 4, wv: 1 } as const;

/** A farm on random seasons, from 1 September 2023 (a Friday), with 30 steers on the bore's paddock. */
function stocked(district: DistrictId = 'nsw'): { farm: FarmState; mob: number } {
  const base = openFarm(district);
  const farm = setUp(base, {
    type: 'buyCattle',
    cls: 'yearSteer',
    qty: 30,
    to: { cell: base.layout.water.bore },
  });
  return { farm, mob: farm.mobs[0]!.id };
}

/** Next day, n times. */
function days(farm: FarmState, n: number, env = {}): FarmState {
  let f = farm;
  for (let i = 0; i < n; i++) f = endDay(f, env).farm;
  return f;
}

/** Save, push through JSON, load. */
const reload = (f: FarmState): FarmState => loadFarm(JSON.parse(JSON.stringify(saveFarm(f))));

/** The farm with its record of what was done wiped, so two farms can be compared by what is on them. */
function bare(f: FarmState): string {
  const c = cloneFarm(f);
  c.actionLog = [];
  c.inbox = [];
  c.inboxSeq = 0;
  return farmHash(c);
}

const weekdayOfDate = (d: { year: number; month: number; date: number }): number =>
  new Date(Date.UTC(d.year, d.month, d.date)).getUTCDay();

describe('a sale calendar for every farm', () => {
  it('a farm with random seasons sells weekly on its district weekday, and has no sale from 16 December to 7 January', () => {
    for (const district of DISTRICTS) {
      expect(RANDOM_SEASON_SALE_WEEKDAY[district]).toBe(WEEKDAYS[district]);
      const farm = openFarm(district, { start: { year: 2023, month: 0 } });
      let count = 0;
      for (let day = 0; day < 800; day++) {
        const date = dateOn(farm, day);
        const sale = saleDayOn(farm, {}, day);
        const inBreak =
          (date.month === STAND_IN_BREAK.from.month && date.date >= STAND_IN_BREAK.from.date) ||
          (date.month === STAND_IN_BREAK.to.month && date.date <= STAND_IN_BREAK.to.date);
        if (inBreak) {
          expect(sale, `${district} ${day}`).toBeNull();
          continue;
        }
        if (weekdayOfDate(date) === WEEKDAYS[district]) {
          expect(sale, `${district} ${day}`).not.toBeNull();
          expect(sale!.types).toEqual(['prime']);
          expect(sale!.standIn).toBe(true);
          expect(sale!.day).toBe(day);
          count++;
        } else expect(sale, `${district} ${day}`).toBeNull();
      }
      expect(count).toBeGreaterThan(100);
    }
  });

  it('the next sale after the Christmas break is the first right weekday on or after 8 January', () => {
    for (const district of DISTRICTS) {
      const farm = openFarm(district, { start: { year: 2023, month: 11 } });
      // Day 15 is 16 December.
      expect(dateOn(farm, 15)).toEqual({ year: 2023, month: 11, date: 16 });
      const next = nextSaleDay(farm, {}, 15)!;
      let want = 8;
      while (weekdayOfDate({ year: 2024, month: 0, date: want }) !== WEEKDAYS[district]) want++;
      expect(next.date).toEqual({ year: 2024, month: 0, date: want });
      expect(next.day).toBe(31 + want - 1);
      // The last sale before the break is on or before 15 December.
      let last = 14;
      while (!saleDayOn(farm, {}, last)) last--;
      expect(dateOn(farm, last).date).toBeLessThanOrEqual(15);
    }
  });

  it('a farm that plays real years still reads the yard’s real days', () => {
    const data = loadRealData();
    const env = { data };
    const farm = createFarm(
      {
        seed: 7,
        district: 'cw',
        size: 'small',
        start: { year: 2010, month: 0 },
        startType: 'scratch',
        difficulty: 'medium',
        years: { kind: 'real', order: 'in-order' },
      },
      env,
    );
    const cal = data.district('cw').cattleSales;
    for (let day = 0; day < 120; day++) {
      const real = cal.saleOn(dateOn(farm, day));
      const sale = saleDayOn(farm, env, day);
      expect(sale === null, `day ${day}`).toBe(real === null);
      if (real && sale) expect(sale.head).toBe(real.head);
    }
    expect(nextSaleDay(farm, env, 0, 'prime')!.day).toBe(6);
  });
});

describe('buying', () => {
  it('on a day with no sale it is refused, the next sale is named, and nothing changes', () => {
    const { farm } = stocked();
    const before = farmHash(farm);
    expect(saleDayOn(farm, {})).toBeNull();
    const buy = { type: 'buyCattle', cls: 'yearSteer', qty: 10 } as const;
    const no = turnedDown(farm, buy);
    expect(no.reason).toBe('not-a-sale-day');
    expect(no.message).toBe(
      'Cattle can only be bought on a sale day. The next cattle sale is on Thursday 7 September, in 6 days.',
    );
    expect(farmHash(farm)).toBe(before);
    expect(previewAction(farm, buy)).toEqual(no);
    // The day before: "tomorrow".
    const eve = days(farm, 5);
    expect(turnedDown(eve, buy).message).toContain('Thursday 7 September, tomorrow.');
  });

  it('on a sale day the cattle are paid for, are not on any ground, and land in the yards at first light', () => {
    const { farm } = stocked();
    const sale = toSaleDay(farm);
    expect(sale.day).toBe(6);
    const preview = previewAction(sale, { type: 'buyCattle', cls: 'yearSteer', qty: 20 });
    if (!preview.ok) throw new Error(preview.message);
    const worth = netWorth(sale);
    const bought = work(sale, { type: 'buyCattle', cls: 'yearSteer', qty: 20 });
    // The card showed the price before the money was spent, and takes none of the day.
    expect(bought.job).toEqual(preview.card);
    expect(bought.job.outcome).toBe('free');
    expect(bought.job.workMin).toBe(0);
    expect(bought.job.arrival).toEqual({
      arriveDay: 7,
      date: { year: 2023, month: 8, date: 8 },
      head: 20,
    });
    expect(sale.cash - bought.farm.cash).toBeCloseTo(bought.job.cost, 6);
    expect(bought.job.cost).toBeGreaterThan(1000);
    const f = bought.farm;
    // No new mob today. They are on the books at what was paid.
    expect(f.mobs.length).toBe(sale.mobs.length);
    expect(f.arrivals.length).toBe(1);
    expect(f.arrivals[0]!.animals.length).toBe(20);
    expect(netWorth(f)).toBeCloseTo(worth, 6);
    expect(marketView(f).onTheWay).toMatchObject([{ day: 7, head: 20, cls: 'yearSteer' }]);
    expect(bought.events.map((e) => e.type)).toEqual(['cattle-on-the-way']);

    // First light next day.
    const next = endDay(f);
    const yards = next.farm.mobs.filter((m) => m.where.kind === 'yards');
    expect(yards.length).toBe(1);
    expect(yards[0]!.animals.length).toBe(20);
    expect(yards[0]!.where).toEqual({ kind: 'yards', since: 7 });
    expect(next.farm.arrivals).toEqual([]);
    expect(next.dawn.map((e) => e.type)).toEqual(['cattle-arrived']);
    expect(next.dawn[0]).toMatchObject({
      cls: 'yearSteer',
      head: 20,
      calves: 0,
      joined: false,
    });
    expect((next.dawn[0] as { cost: number }).cost).toBeCloseTo(bought.job.cost, 6);
    expect(next.summary.arrived).toEqual({ head: 20, calves: 0 });
    expect(next.farm.inbox.some((m) => m.event.type === 'cattle-arrived')).toBe(true);
    // Classes: the mob summary says so.
    const summary = mobSummaries(next.farm).find((m) => m.where.kind === 'yards')!;
    expect(summary.head).toBe(20);
    expect(Object.values(summary.classes).reduce((n, c) => n + c, 0)).toBe(20);

    // The thing to do is a fact, and the player picks the paddock.
    const todo = thingsToDo(next.farm).filter((t) => t.type === 'in-yards');
    expect(todo).toEqual([
      {
        type: 'in-yards',
        mob: yards[0]!.id,
        mobName: yards[0]!.name,
        count: 20,
        days: 0,
        // The yards have water and only their own square to graze.
        hasWater: true,
        feed: 'almost-none',
        grazingHa: next.farm.layout.scale.haPerSquare,
        does: 'moveMob',
        action: null,
      },
    ]);
    // A day later it has been there a day.
    const later = endDay(next.farm).farm;
    expect(thingsToDo(later).find((t) => t.type === 'in-yards')).toMatchObject({ days: 1 });

    // Moving it out is the ordinary moveMob. The item is gone.
    const moved = work(later, {
      type: 'moveMob',
      mob: yards[0]!.id,
      to: { cell: later.layout.water.bore },
    });
    expect(moved.farm.mobs.every((m) => m.where.kind === 'paddock')).toBe(true);
    expect(thingsToDo(moved.farm).some((t) => t.type === 'in-yards')).toBe(false);
  });

  it('two buys on one sale day arrive as one mob in the yards, and a later arrival joins it', () => {
    const { farm } = stocked();
    let f = toSaleDay(farm);
    f = work(f, { type: 'buyCattle', cls: 'yearSteer', qty: 12 }).farm;
    f = work(f, { type: 'buyCattle', cls: 'cowCalf', qty: 5 }).farm;
    expect(f.arrivals.length).toBe(2);
    const next = endDay(f);
    const yards = next.farm.mobs.filter((m) => m.where.kind === 'yards');
    expect(yards.length).toBe(1);
    // 12 steers, 5 cows and 5 calves.
    expect(yards[0]!.animals.length).toBe(22);
    expect(next.dawn.map((e) => e.type)).toEqual(['cattle-arrived', 'cattle-arrived']);
    expect(next.dawn[1]).toMatchObject({ head: 5, calves: 5, joined: true });
    expect(next.summary.arrived).toEqual({ head: 17, calves: 5 });
    // A week later, more cattle join the mob that is still there.
    let g = days(next.farm, 6);
    expect(saleDayOn(g, {})).not.toBeNull();
    g = work(g, { type: 'buyCattle', cls: 'yearSteer', qty: 8 }).farm;
    g = endDay(g).farm;
    const again = g.mobs.filter((m) => m.where.kind === 'yards');
    expect(again.length).toBe(1);
    expect(again[0]!.animals.length).toBe(30);
    expect(again[0]!.id).toBe(yards[0]!.id);
    expect(again[0]!.where).toEqual({ kind: 'yards', since: 7 });
  });

  it('on a real-year farm it is the yard’s real sale day that counts', () => {
    const data = loadRealData();
    const env = { data };
    const farm = createFarm(
      {
        seed: 7,
        district: 'cw',
        size: 'small',
        start: { year: 2010, month: 0 },
        startType: 'scratch',
        difficulty: 'easy',
        money: { ...PLENTY },
        years: { kind: 'real', order: 'in-order' },
      },
      env,
    );
    const no = turnedDown(farm, { type: 'buyCattle', cls: 'yearSteer', qty: 5 }, env);
    expect(no.message).toBe(
      'Cattle can only be bought on a sale day. The next cattle sale is on Thursday 7 January, in 6 days.',
    );
    let f = farm;
    for (let i = 0; i < 6; i++) f = endDay(f, env).farm;
    const done = work(f, { type: 'buyCattle', cls: 'yearSteer', qty: 5 }, env);
    expect(done.farm.arrivals.length).toBe(1);
    expect(endDay(done.farm, env).farm.mobs.some((m) => m.where.kind === 'yards')).toBe(true);
  });

  it('without the farm clock it still buys straight into a paddock on any day', () => {
    const base = openFarm('nsw');
    expect(saleDayOn(base, {})).toBeNull();
    const done = applyInstantly(base, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 10,
      to: { cell: base.layout.water.bore },
    });
    if (!done.ok) throw new Error(done.message);
    expect(done.farm.arrivals).toEqual([]);
    expect(done.farm.mobs.length).toBe(1);
    expect(done.farm.mobs[0]!.where.kind).toBe('paddock');
    expect(done.events.map((e) => e.type)).toEqual(['cattle-bought']);
    // Still needs a place to go.
    const no = applyInstantly(base, { type: 'buyCattle', cls: 'yearSteer', qty: 10 });
    expect(no.ok).toBe(false);
  });
});

describe('selling', () => {
  it('on a sale day the stock is sold today at today’s price', () => {
    const { farm, mob } = stocked();
    const sale = toSaleDay(farm);
    const before = animalLookup(sale.mobs);
    const sold = work(sale, { type: 'sellGroup', mob, group: 'steer', qty: 10 });
    expect(sold.farm.saleBookings).toEqual([]);
    expect(sold.job.booking).toBeUndefined();
    expect(sold.job.workMin).toBe(61);
    const after = animalLookup(sold.farm.mobs);
    const gone = [...before.values()].filter((a) => !after.has(a.id));
    expect(gone.length).toBe(10);
    const net = gone.reduce((t, a) => t + netSaleValue(a, pricesOf(sale)), 0);
    expect(sold.farm.cash - sale.cash).toBeCloseTo(net, 6);
    expect(sold.events.find((e) => e.type === 'cattle-sold')).toMatchObject({ head: 10 });
  });

  it('on another day it books them onto the next sale: nothing is paid and the stock stay and graze', () => {
    const { farm, mob } = stocked();
    const sold = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 });
    expect(sold.farm.cash).toBe(farm.cash);
    expect(sold.farm.mobs[0]!.animals.length).toBe(30);
    expect(sold.events.map((e) => e.type)).toEqual(['job-worked', 'sale-booked']);
    // The time is spent today: an hour and a minute for 10 head.
    expect(sold.job.workMin).toBe(61);
    expect(sold.job.cost).toBe(0);
    expect(sold.job.booking).toEqual({
      head: 10,
      calvesAtFoot: 0,
      saleDay: 6,
      date: { year: 2023, month: 8, date: 7 },
      daysAway: 6,
      // Nothing is paid today, and the price is the sale day's.
      nothingPaidNow: true,
      priceSetOnSaleDay: true,
    });
    const view = marketView(sold.farm);
    expect(view.isSaleDay).toBe(false);
    expect(view.nextSale).toMatchObject({ day: 6, daysAway: 6 });
    expect(view.booked.length).toBe(1);
    expect(view.booked[0]).toMatchObject({ day: 6, daysAway: 6, head: 10 });
    expect(mobSummaries(sold.farm)[0]!.booked).toBe(10);
    expect(mobSummaries(farm)[0]!.booked).toBe(0);
    // They graze as usual: the mob's weight moves and the grass is eaten.
    const day = endDay(sold.farm).farm;
    expect(day.mobs[0]!.animals.length).toBe(30);
    expect(day.year.eaten).toBeGreaterThan(sold.farm.year.eaten);
    // Asking again books the next 10, not the same ones.
    const more = work(sold.farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm;
    expect(marketView(more).booked[0]!.head).toBe(20);
    expect(more.saleBookings.length).toBe(1);
    // Booking the same animals by tag number is refused, with the sale named.
    const again = turnedDown(sold.farm, {
      type: 'sellAnimals',
      ids: [...sold.farm.saleBookings[0]!.animalIds],
    });
    expect(again.reason).toBe('nothing-to-sell');
    expect(again.message).toBe(
      'Those cattle are already booked onto the sale on Thursday 7 September, in 6 days.',
    );
  });

  it('at first light on the sale day booked stock sells at that day’s price, less the usual costs', () => {
    const { farm, mob } = stocked();
    const booked = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm;
    const eve = days(booked, 5);
    expect(eve.saleBookings.length).toBe(1);
    // What the tick leaves on the morning of the sale, before first-light work.
    const morning = cloneFarm(eve);
    stepDay(morning);
    const want = eve.saleBookings[0]!.animalIds.reduce(
      (t, id) => t + netSaleValue(animalLookup(morning.mobs).get(id)!, pricesOf(morning)),
      0,
    );
    const next = endDay(eve);
    expect(next.farm.saleBookings).toEqual([]);
    expect(next.farm.mobs[0]!.animals.length).toBe(20);
    expect(next.farm.cash - morning.cash).toBeCloseTo(want, 6);
    expect(next.dawn).toMatchObject([{ type: 'cattle-sold', booked: true, head: 10 }]);
    expect(next.summary.bookedSold.head).toBe(10);
    expect(next.summary.bookedSold.net).toBeCloseTo(want, 6);
    expect(next.summary.money.sales).toBeCloseTo(want, 6);
    expect(marketView(next.farm).booked).toEqual([]);
  });

  it('a booked animal that has died or was already sold is skipped without fuss', () => {
    const { farm, mob } = stocked();
    const booked = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm;
    const eve = days(booked, 5);
    const ids = [...eve.saleBookings[0]!.animalIds];
    // One dies before the sale.
    const hurt = cloneFarm(eve);
    hurt.mobs[0]!.animals = hurt.mobs[0]!.animals.filter((a) => a.id !== ids[0]);
    const next = endDay(hurt);
    expect(next.dawn).toMatchObject([{ type: 'cattle-sold', booked: true, head: 9 }]);
    // Every booked animal gone: nothing is sold and nothing is said.
    const none = cloneFarm(eve);
    none.mobs[0]!.animals = none.mobs[0]!.animals.filter((a) => !ids.includes(a.id));
    const quiet = endDay(none);
    expect(quiet.dawn).toEqual([]);
    expect(quiet.farm.saleBookings).toEqual([]);
    expect(quiet.summary.bookedSold).toEqual({ head: 0, calvesAtFoot: 0, net: 0 });
  });

  it('calves at foot go with their booked mothers', () => {
    const base = openFarm('nsw');
    let farm = setUp(base, {
      type: 'buyCattle',
      cls: 'cowCalf',
      qty: 6,
      to: { cell: base.layout.water.bore },
    });
    const mob = farm.mobs[0]!.id;
    farm = work(farm, { type: 'sellGroup', mob, group: 'cowE', qty: 3 }).farm;
    const b = marketView(farm).booked[0]!;
    expect(b.head).toBe(3);
    expect(days(farm, 5).mobs[0]!.animals.length).toBe(12);
    const sold = endDay(days(farm, 5)).dawn;
    expect(sold).toMatchObject([{ type: 'cattle-sold', booked: true, head: 3, calvesAtFoot: 3 }]);
  });

  it('cancelling a booking leaves everything as it was', () => {
    const { farm, mob } = stocked();
    const booked = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm;
    const cancelled = work(booked, { type: 'cancelSale' });
    expect(cancelled.job.outcome).toBe('free');
    expect(cancelled.events).toMatchObject([{ type: 'sale-cancelled', head: 10, saleDay: 6 }]);
    expect(cancelled.farm.saleBookings).toEqual([]);
    expect(marketView(cancelled.farm).booked).toEqual([]);
    expect(mobSummaries(cancelled.farm)[0]!.booked).toBe(0);
    // Run to past the sale day: the same as a farm that never booked.
    const never = days(farm, 8);
    const after = days(cancelled.farm, 8);
    expect(after.mobs[0]!.animals.length).toBe(30);
    expect(after.cash).toBe(never.cash);
    // The time spent booking was spent. Everything else is the same.
    expect(bare(after)).toBe(bare(never));
    // Part of a booking can be cancelled by tag number.
    const ids = [...booked.saleBookings[0]!.animalIds];
    const part = work(booked, { type: 'cancelSale', ids: ids.slice(0, 4) });
    expect(marketView(part.farm).booked[0]!.head).toBe(6);
    // With nothing booked it is refused, with a reason.
    const no = turnedDown(farm, { type: 'cancelSale' });
    expect(no.reason).toBe('nothing-booked');
  });

  it('cancelling counts only animals still on the farm, and refuses if none of them is', () => {
    const { farm, mob } = stocked();
    const booked = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm;
    const ids = [...booked.saleBookings[0]!.animalIds];
    // Three of the booked animals die, and one is sold at a sale before it.
    const gone = new Set(ids.slice(0, 4));
    const cut = cloneFarm(booked);
    for (const m of cut.mobs) m.animals = m.animals.filter((a) => !gone.has(a.id));
    expect(marketView(cut).booked[0]!.head).toBe(6);
    const all = work(cut, { type: 'cancelSale' });
    // The sale-cancelled event counts the six still there, not the ten booked.
    expect(all.events).toMatchObject([{ type: 'sale-cancelled', head: 6, saleDay: 6 }]);
    expect(all.farm.saleBookings).toEqual([]);
    // Naming dead tags with live ones counts only the live ones.
    const mixed = work(cut, { type: 'cancelSale', ids: ids.slice(2, 7) });
    expect(mixed.events).toMatchObject([{ type: 'sale-cancelled', head: 3 }]);
    expect(marketView(mixed.farm).booked[0]!.head).toBe(3);
    // Naming only animals that are gone is refused, with the reason, and nothing changes.
    const before = farmHash(cut);
    const no = turnedDown(cut, { type: 'cancelSale', ids: ids.slice(0, 4) });
    expect(no.reason).toBe('nothing-booked');
    expect(no.message).toContain('still booked');
    expect(farmHash(cut)).toBe(before);
    // A booking made only of animals that have gone is refused the same way.
    for (const m of cut.mobs) m.animals = m.animals.filter((a) => !ids.includes(a.id));
    expect(turnedDown(cut, { type: 'cancelSale' }).reason).toBe('nothing-booked');
  });

  it('what is booked can still be moved about, and is sold wherever it is', () => {
    const { farm, mob } = stocked();
    const booked = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm;
    const lot = work(booked, { type: 'moveMob', mob, to: 'lot' }).farm;
    expect(mobSummaries(lot)[0]!.booked).toBe(10);
    const sold = endDay(days(lot, 5));
    expect(sold.dawn).toMatchObject([{ type: 'cattle-sold', booked: true, head: 10 }]);
  });
});

describe('first light is one step, for Next day and for a skip', () => {
  it('a skip across a booked sale is the same farm as stepping a day at a time, and reports the sale', () => {
    const { farm, mob } = stocked();
    const booked = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm;
    const skip = skipDays(booked, 10);
    expect(skip.daysRun).toBe(10);
    expect(skip.stops).toEqual([]);
    const step = days(booked, 10);
    expect(farmHash(skip.farm)).toBe(farmHash(step));
    expect(skip.summary.bookedSold.head).toBe(10);
    expect(skip.summary.bookedSold.net).toBeGreaterThan(0);
    expect(skip.summary.head.after).toBe(skip.summary.head.before - 10);
    expect(skip.dawn.map((e) => e.type)).toEqual(['cattle-sold']);
    expect(skip.summary.events['cattle-sold']).toBe(1);
  });

  it('a skip across an arrival is the same farm as stepping, and reports the cattle that landed', () => {
    const { farm } = stocked();
    const bought = work(toSaleDay(farm), { type: 'buyCattle', cls: 'yearSteer', qty: 20 }).farm;
    const skip = skipDays(bought, 8);
    expect(skip.stops).toEqual([]);
    expect(farmHash(skip.farm)).toBe(farmHash(days(bought, 8)));
    expect(skip.summary.arrived).toEqual({ head: 20, calves: 0 });
    expect(skip.summary.head.after).toBe(skip.summary.head.before + 20);
    // A skip does not stop for a sale day: day 13 was one.
    expect(saleDayOn(bought, {}, 13)).not.toBeNull();
    expect(skip.daysRun).toBe(8);
  });

  it('an arrival and a booked sale in one skip are both reported', () => {
    const { farm, mob } = stocked();
    // Built directly: in play a booking is always for the next sale, so both can not be waiting at once.
    let f = work(toSaleDay(farm), { type: 'buyCattle', cls: 'yearSteer', qty: 20 }).farm;
    const ids = f.mobs
      .find((m) => m.id === mob)!
      .animals.slice(0, 7)
      .map((a) => a.id);
    f.saleBookings.push({ saleDay: 13, animalIds: Int32Array.from(ids) });
    f = cloneFarm(f);
    const skip = skipDays(f, 9);
    expect(farmHash(skip.farm)).toBe(farmHash(days(f, 9)));
    expect(skip.summary.arrived.head).toBe(20);
    expect(skip.summary.bookedSold.head).toBe(7);
    expect(skip.dawn.map((e) => e.type)).toEqual(['cattle-arrived', 'cattle-sold']);
  });

  it('the daily tick alone does not land cattle or sell stock', () => {
    const { farm, mob } = stocked();
    const booked = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm;
    const eve = days(booked, 5);
    const ticked = cloneFarm(eve);
    stepDay(ticked);
    expect(ticked.mobs[0]!.animals.length).toBe(30);
    expect(ticked.saleBookings.length).toBe(1);
  });
});

describe('saves and repeatability', () => {
  it('save, load and carry on equals running straight through, across a buy, an arrival, a booking and its sale', () => {
    const { farm, mob } = stocked();
    type Step = (f: FarmState) => FarmState;
    const steps: Step[] = [
      (f) => days(f, 1),
      (f) => work(f, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm,
      (f) => days(f, 4),
      // Day 5 is the eve of the sale. Day 6, the sale day, sells the booking, and the farm buys.
      (f) => endDay(f).farm,
      (f) => work(f, { type: 'buyCattle', cls: 'cowCalf', qty: 6 }).farm,
      (f) => endDay(f).farm,
      (f) =>
        work(f, {
          type: 'moveMob',
          mob: f.mobs.find((m) => m.where.kind === 'yards')!.id,
          to: 'lot',
        }).farm,
      (f) => work(f, { type: 'sellGroup', mob: f.mobs[0]!.id, group: 'steer', qty: 5 }).farm,
      (f) => skipDays(f, 9).farm,
    ];
    let straight = farm;
    let viaSaves = reload(farm);
    const seen: string[] = [];
    for (const step of steps) {
      straight = step(straight);
      viaSaves = reload(step(viaSaves));
      expect(farmHash(viaSaves)).toBe(farmHash(straight));
      seen.push(farmHash(straight));
      // Saved at every moment in the middle of the run as well.
      expect(farmHash(reload(straight))).toBe(farmHash(straight));
    }
    expect(new Set(seen).size).toBe(seen.length);
    // The run did buy, land, book and sell.
    const kinds = new Set(straight.inbox.map((m) => m.event.type));
    for (const k of ['cattle-on-the-way', 'cattle-arrived', 'sale-booked', 'cattle-sold']) {
      expect(kinds.has(k as never), k).toBe(true);
    }
  });

  it('the same seed and the same actions give the same farm', () => {
    const run = (): string => {
      const { farm, mob } = stocked('cq');
      let f = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 7 }).farm;
      f = work(toSaleDay(f), { type: 'buyCattle', cls: 'yearSteer', qty: 9 }).farm;
      return farmHash(skipDays(f, 20).farm);
    };
    expect(run()).toBe(run());
  });

  it('what is on the way and what is booked is saved, and an older save loads with none', () => {
    const { farm, mob } = stocked();
    const booked = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm;
    const f = work(toSaleDay(farm), { type: 'buyCattle', cls: 'yearSteer', qty: 4 }).farm;
    const saved = saveFarm(f);
    expect(saved.saveFormat).toBe(8);
    expect(Array.isArray(saved.arrivals)).toBe(true);
    // The booking is a packed whole-number array, not a list of numbers in text.
    expect(JSON.stringify(saveFarm(booked).saleBookings)).toContain('"$":"i32"');
    expect(reload(booked).saleBookings).toEqual(booked.saleBookings);
    const old = JSON.parse(JSON.stringify(saved)) as Record<string, unknown>;
    old.saveFormat = 4;
    delete old.arrivals;
    delete old.saleBookings;
    const loaded = loadFarm(old as ReturnType<typeof saveFarm>);
    expect(loaded.arrivals).toEqual([]);
    expect(loaded.saleBookings).toEqual([]);
    const sound = reload(f);
    expect(sound.arrivals[0]!.animals.length).toBe(4);
  });
});

describe('looking is free', () => {
  it('the market view and the things to do leave the farm as it was', () => {
    const { farm, mob } = stocked();
    const booked = work(farm, { type: 'sellGroup', mob, group: 'steer', qty: 10 }).farm;
    const bought = work(toSaleDay(farm), { type: 'buyCattle', cls: 'yearSteer', qty: 4 }).farm;
    const landed = endDay(bought).farm;
    for (const f of [booked, bought, landed]) {
      const before = farmHash(f);
      marketView(f);
      thingsToDo(f);
      mobSummaries(f);
      previewAction(f, { type: 'cancelSale' });
      previewAction(f, { type: 'sellGroup', mob, group: 'steer', qty: 3 });
      expect(farmHash(f)).toBe(before);
    }
  });
});
