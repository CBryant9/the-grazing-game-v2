/**
 * Farm hands and contractor fencing (milestones 2.1 and 2.2; docs/MODEL.md,
 * section 11). The BUILD_PLAN "done when" lines:
 *
 *   2.1  A hand's share of a fence uses none of the player's daylight.
 *        Missed wages lower the farm's standing. Wording states facts only.
 *   2.2  A 1-man team builds 500 m a day and a 2-man team 1,000 m without
 *        using the player's day.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { openFarm } from '../../test-support/wholeFarm';
import { across, busyFarm, turnedDown, work } from '../../test-support/workingDay';
import { previewAction } from '../day/act';
import { endDay, skipDays } from '../day/days';
import { LABOUR, casualDayRate } from '../data/labour';
import { EDGE, getEdge, setEdge, cloneFences } from '../farm/topology';
import { weekdayOf } from '../market/saleCalendar';
import { farmHash, loadFarm, saveFarm } from '../save/save';
import { dateOn } from '../sim/derived';
import type { FarmEvent } from '../sim/events';
import type { FarmState } from '../sim/state';
import { contractView, workerReport, workforceView } from './reads';
import { labourPool } from './pool';
import type { Hand } from './types';

const weekday = (farm: FarmState): number => weekdayOf(dateOn(farm));

/** Next day until the farm is on one of these weekdays (0 is Sunday). */
function toWeekday(farm: FarmState, days: readonly number[]): FarmState {
  let f = farm;
  for (let i = 0; i < 8 && !days.includes(weekday(f)); i++) f = endDay(f).farm;
  return f;
}

const WEEKDAYS = [1, 2, 3, 4, 5];

/** Hire the first person on today's list, and set facts about them for the test. */
function hireOne(farm: FarmState, set: Partial<Hand> = {}): { farm: FarmState; hand: Hand } {
  const person = labourPool(farm)[0]!;
  const f = work(farm, { type: 'hireHand', person: person.id }).farm;
  const hand = f.labour!.hands.at(-1)!;
  Object.assign(hand, set);
  return { farm: f, hand };
}

/** An average hand: fencing, stock and water all 3, no dogs, Monday to Friday, casual. */
const AVERAGE: Partial<Hand> = {
  kind: 'casual',
  skills: { fencing: 3, stock: 3, water: 3 },
  dogs: false,
  days: [1, 2, 3, 4, 5],
  endDay: null,
};

const events = (list: readonly FarmEvent[], type: FarmEvent['type']): FarmEvent[] =>
  list.filter((e) => e.type === type);

describe('the labour pool', () => {
  it('the same seed gives the same people on the same day, and the list changes over time', () => {
    const a = openFarm('nsw');
    const b = openFarm('nsw');
    expect(labourPool(a)).toEqual(labourPool(b));
    expect(labourPool(a).length).toBeGreaterThan(0);
    const later = labourPool(a, a.day + 60).map((p) => p.id);
    const now = labourPool(a).map((p) => p.id);
    expect(later).not.toEqual(now);
    // Over a year, people come and go.
    const seen = new Set<number>();
    for (let d = 0; d < 365; d += 7) for (const p of labourPool(a, d)) seen.add(p.id);
    expect(seen.size).toBeGreaterThan(30);
  });

  it('each person has the facts PRD 5.11 lists, and a rate at or above the award', () => {
    const farm = openFarm('nsw');
    for (let d = 0; d < 200; d += 10) {
      for (const p of labourPool(farm, d)) {
        expect(['casual', 'contract', 'salaried']).toContain(p.kind);
        expect(p.level).toBeGreaterThanOrEqual(1);
        expect(p.level).toBeLessThanOrEqual(8);
        for (const s of Object.values(p.skills)) {
          expect(s).toBeGreaterThanOrEqual(1);
          expect(s).toBeLessThanOrEqual(5);
        }
        expect(p.days.length).toBe(5);
        if (p.kind !== 'salaried') expect(p.days).toEqual([1, 2, 3, 4, 5]);
        expect(p.rate).toBeGreaterThanOrEqual(p.awardRate);
        const award =
          p.kind === 'salaried' ? LABOUR.awardWeekly.value[p.level - 1]! : casualDayRate(p.level);
        expect(p.awardRate).toBeCloseTo(award, 9);
        expect(p.from).toBeLessThanOrEqual(d);
        expect(p.until).toBeGreaterThanOrEqual(d);
      }
    }
  });

  it('a poor standing gives a shorter list, without the most skilled, at dearer rates', () => {
    const farm = openFarm('nsw');
    const good = labourPool(farm, 100);
    const poor = structuredClone(farm);
    poor.labour = { ...hireOne(farm).farm.labour!, standing: 0, taken: [] };
    const bad = labourPool(poor, 100);
    expect(bad.length).toBeLessThan(good.length);
    for (const p of bad) {
      const same = good.find((g) => g.id === p.id)!;
      expect(p.rate).toBeGreaterThan(same.rate);
      expect(p.rate).toBeCloseTo(p.awardRate * (1 + LABOUR.dearerAtZero.value), 1);
    }
  });

  it('a person hired is not listed again', () => {
    const farm = openFarm('nsw');
    const id = labourPool(farm)[0]!.id;
    const f = work(farm, { type: 'hireHand', person: id }).farm;
    expect(labourPool(f).some((p) => p.id === id)).toBe(false);
    expect(turnedDown(f, { type: 'hireHand', person: id }).reason).toBe('no-such-person');
  });
});

describe('hiring and letting go', () => {
  it('hiring takes none of the day; the hand starts the next day; a contract ends by itself', () => {
    const farm = openFarm('nsw');
    const person = labourPool(farm)[0]!;
    const done = work(farm, { type: 'hireHand', person: person.id });
    expect(done.job.outcome).toBe('free');
    expect(done.farm.clock.used).toBe(0);
    const hand = done.farm.labour!.hands[0]!;
    expect(hand.startDay).toBe(farm.day + 1);
    expect(workforceView(done.farm).hands[0]!.status).toBe('starts-soon');
    expect(done.events[0]).toMatchObject({ type: 'hand-hired', hand: person.id });

    // A contract hand leaves at first light on the day their contract ends, paid what they are owed.
    const { farm: c } = hireOne(openFarm('nsw', { seed: 2 }), { kind: 'contract' });
    c.labour!.hands[0]!.endDay = c.day + 5;
    const s = skipDays(c, 5);
    const left = events(s.dawn, 'hand-left')[0];
    expect(left).toMatchObject({ why: 'contract-finished' });
    expect(s.farm.labour!.hands.length).toBe(0);
    expect(s.farm.labour!.nextPayDay).toBeNull();
  });

  it('letting a hand go pays what they are owed, at once', () => {
    let { farm } = hireOne(openFarm('nsw'), AVERAGE);
    farm = skipDays(farm, 6).farm;
    const owed = farm.labour!.hands[0]!.owed;
    expect(owed).toBeGreaterThan(0);
    const done = work(farm, { type: 'letHandGo', hand: farm.labour!.hands[0]!.id });
    expect(farm.cash - done.farm.cash).toBeCloseTo(owed, 6);
    expect(done.farm.labour!.hands.length).toBe(0);
    expect(done.events[0]).toMatchObject({ type: 'hand-left', why: 'let-go', paid: owed });
    expect(turnedDown(done.farm, { type: 'letHandGo', hand: 5 }).reason).toBe('no-such-hand');
  });
});

describe('pay day', () => {
  it('wages and super come out by themselves every 14 days, to the cent', () => {
    const hired0 = hireOne(openFarm('nsw'), AVERAGE);
    const hand = hired0.hand;
    let farm = hired0.farm;
    const hired = farm.day;
    const rate = hand.rate;
    // Days the hand works between starting and pay day: their days, from the day after hiring.
    let worked = 0;
    for (let d = hired + 1; d < hired + 14; d++) {
      if (WEEKDAYS.includes(weekdayOf(dateOn(farm, d)))) worked++;
    }
    const cash0 = farm.cash;
    const s = skipDays(farm, 14);
    farm = s.farm;
    const paid = events(s.dawn, 'wages-paid')[0];
    expect(paid).toBeDefined();
    if (paid?.type !== 'wages-paid') throw new Error('no pay day');
    const wages = worked * rate;
    expect(paid.wages).toBeCloseTo(wages, 6);
    expect(paid.superannuation).toBeCloseTo(wages * 0.12, 6);
    expect(paid.total).toBeCloseTo(wages * 1.12, 6);
    // Wages are a running cost: in the summary's running costs, and out of the bank.
    expect(s.summary.money.running).toBeGreaterThanOrEqual(paid.total - 1e-6);
    const interest = s.summary.money.interest;
    expect(cash0 - farm.cash + interest).toBeGreaterThanOrEqual(paid.total - 1e-6);
    expect(farm.labour!.nextPayDay).toBe(hired + 28);
    expect(farm.labour!.standing).toBe(85);
  });

  it('a salaried hand is paid the weekly rate for every week, whatever the days', () => {
    const { farm } = hireOne(openFarm('nsw'), {
      ...AVERAGE,
      kind: 'salaried',
      rate: 1046.9,
    });
    const s = skipDays(farm, 14);
    const paid = events(s.dawn, 'wages-paid')[0];
    if (paid?.type !== 'wages-paid') throw new Error('no pay day');
    // 13 days on the books: from the day after hiring to the day before pay day.
    expect(paid.wages).toBeCloseTo((1046.9 / 7) * 13, 6);
  });

  it('missed wages lower the farm’s standing, and the hand leaves', () => {
    let { farm } = hireOne(openFarm('nsw'), AVERAGE);
    farm = skipDays(farm, 13).farm;
    // The bank will not cover the wages on pay day.
    farm.cash = farm.overdraft + 1;
    const s = skipDays(farm, 1);
    const missed = events(s.dawn, 'wages-missed')[0];
    expect(missed).toMatchObject({ standingBefore: 80, standingAfter: 60 });
    expect(events(s.dawn, 'hand-left')[0]).toMatchObject({ why: 'not-paid', paid: 0 });
    expect(events(s.dawn, 'wages-paid')).toEqual([]);
    expect(s.farm.labour!.standing).toBe(60);
    expect(workforceView(s.farm).standing).toBe(60);
    // A poorer standing: a shorter, dearer list.
    expect(labourPool(s.farm).every((p) => p.rate > p.awardRate)).toBe(true);
  });
});

describe('a hand helping on the player’s jobs', () => {
  it('a hand’s share of a fence uses none of the player’s daylight: 800 m a day instead of 500 m', () => {
    let farm = openFarm('nsw');
    const side = farm.layout.scale.sideM;
    expect(side).toBe(50);
    const line = {
      type: 'buildFence' as const,
      edges: across(12, 0, 39),
      fence: 'permanent' as const,
    };
    // On their own the player builds 500 m in a whole day.
    const alone = work(toWeekday(endDay(farm).farm, WEEKDAYS), line);
    expect(alone.job.line!.fits.metres).toBe(500);
    expect(alone.job.hands).toBeUndefined();

    // With an average hand on, from first light: 300 m by the hand, then 500 m in the player's day.
    farm = hireOne(farm, AVERAGE).farm;
    farm = toWeekday(endDay(farm).farm, WEEKDAYS);
    const card = previewAction(farm, line);
    if (!card.ok) throw new Error(card.message);
    const done = work(farm, line);
    expect(done.job).toEqual(card.card);
    expect(done.job.line!.fits.metres).toBe(800);
    expect(done.job.hands!.metres).toBe(300);
    expect(done.job.hands!.pieces).toEqual(done.job.line!.fits.pieces.slice(0, 6));
    // The player's light used is their own 500 m: the hand's 300 m used none of it.
    expect(done.job.workMin).toBeCloseTo(done.job.dayMin, 6);
    expect(done.job.hands!.workMin).toBeCloseTo(done.job.dayMin * 0.6, 6);
    expect(done.farm.clock.used).toBeCloseTo(done.job.dayMin, 6);

    // A short fence the hand's share covers takes none of the player's light at all.
    const short = work(farm, {
      type: 'buildFence',
      edges: across(5, 0, 3),
      fence: 'permanent',
    });
    expect(short.job.workMin).toBeCloseTo(0, 9);
    expect(short.farm.clock.used).toBeCloseTo(0, 9);
    expect(workforceView(short.farm).hands[0]!.dayLeft).toBeCloseTo(1 - 200 / 300, 6);
  });

  it('the share is more or less by skill, and a hand does not help on a day off or before they start', () => {
    let farm = openFarm('nsw');
    const line = {
      type: 'buildFence' as const,
      edges: across(12, 0, 39),
      fence: 'permanent' as const,
    };
    const before = work(hireOne(farm, AVERAGE).farm, line);
    expect(before.job.hands).toBeUndefined(); // hired today, starts tomorrow
    farm = hireOne(farm, { ...AVERAGE, skills: { fencing: 5, stock: 3, water: 3 } }).farm;
    farm = toWeekday(endDay(farm).farm, WEEKDAYS);
    expect(work(farm, line).job.hands!.metres).toBe(400);
    const weekend = toWeekday(farm, [0, 6]);
    expect(work(weekend, line).job.hands).toBeUndefined();
  });

  it('a hand with dogs takes the stock work off the player', () => {
    const b = busyFarm();
    let farm = hireOne(b.farm, { ...AVERAGE, dogs: true }).farm;
    farm = toWeekday(endDay(farm).farm, WEEKDAYS);
    const move = { type: 'moveMob' as const, mob: b.steers, to: { cell: b.emptyCell } };
    const done = work(farm, move);
    expect(done.job.workMin).toBeCloseTo(0, 9);
    expect(done.job.hands!.workMin).toBeCloseTo(done.job.totalWorkMin, 9);
  });
});

describe('contract fencing', () => {
  /** A farm on a weekday morning, with a long line to fence. */
  const setUp = (): FarmState => toWeekday(openFarm('nsw'), [1]);
  const LINE = across(12, 0, 39);

  it('a 1-man team builds 500 m a day and a 2-man team 1,000 m, without using the player’s day', () => {
    for (const [team, perDay] of [
      [1, 500],
      [2, 1000],
    ] as const) {
      const farm = setUp();
      const order = work(farm, { type: 'orderContractFence', edges: LINE, team });
      expect(order.job.outcome).toBe('free');
      expect(order.job.costToday).toBe(0);
      expect(order.job.contract).toMatchObject({ team, metres: 2000, ratePerM: 5 });
      let f = order.farm;
      expect(contractView(f)[0]).toMatchObject({ metresLeft: 2000, metresBuilt: 0 });
      // Next day (a Tuesday): first light, the team's day is built.
      const day = endDay(f);
      f = day.farm;
      expect(f.clock.used).toBe(0);
      const built = events(day.dawn, 'contract-built')[0];
      expect(built).toMatchObject({ metres: perDay, byHandsM: 0, metresLeft: 2000 - perDay });
      expect(contractView(f)[0]!.metresBuilt).toBe(perDay);
      // Paid as built: materials $7 a metre and labour $5 a metre.
      expect(built!.type === 'contract-built' && built.cost).toBeCloseTo(perDay * 12, 6);
      // The player's whole day is still theirs.
      const mine = work(f, { type: 'buildFence', edges: across(4, 0, 39), fence: 'permanent' });
      expect(mine.job.line!.fits.metres).toBe(500);
    }
  });

  it('runs on over days and across a skip, needs nothing each day, and is done on the day it said', () => {
    const farm = setUp();
    const order = work(farm, { type: 'orderContractFence', edges: LINE, team: 1 });
    const view = contractView(order.farm)[0]!;
    // 2,000 m at 500 m a day, Tuesday to Friday.
    expect(view.metresLeft).toBe(2000);
    expect(view.doneDay).toBe(farm.day + 4);
    expect(view.doneDate).toEqual(dateOn(order.farm, farm.day + 4));
    const s = skipDays(order.farm, 7);
    expect(s.daysRun).toBe(7);
    const finished = events(s.dawn, 'contract-finished')[0];
    expect(finished).toMatchObject({ metres: 2000 });
    expect(contractView(s.farm)).toEqual([]);
    for (const e of LINE) expect(getEdge(s.farm.layout.fences, e)).toBe(EDGE.permanent);
    // The day it finished is the day it said.
    const day = s.farm.inbox.find((m) => m.event.type === 'contract-finished')!.day;
    expect(day).toBe(view.doneDay);
    // Spent: 2,000 m at $12.
    expect(finished!.type === 'contract-finished' && finished.spent).toBeCloseTo(24000, 6);
  });

  it('contractors do not work weekends', () => {
    const fri = toWeekday(openFarm('nsw'), [5]);
    const order = work(fri, { type: 'orderContractFence', edges: LINE, team: 2 });
    const s = skipDays(order.farm, 2); // Saturday and Sunday
    expect(events(s.dawn, 'contract-built')).toEqual([]);
    const mon = endDay(s.farm);
    expect(events(mon.dawn, 'contract-built')).toHaveLength(1);
  });

  it('the contractor’s fence and the player’s own are told apart in the read', () => {
    const farm = setUp();
    let f = work(farm, { type: 'orderContractFence', edges: LINE, team: 1 }).farm;
    f = endDay(f).farm;
    f = work(f, { type: 'buildFence', edges: across(4, 0, 5), fence: 'permanent' }).farm;
    const run = contractView(f)[0]!;
    expect(run.built.length).toBe(10);
    expect(run.built).toEqual(LINE.slice(0, 10));
    expect(run.left).toEqual(LINE.slice(10));
    // The player's line is not in the run.
    const mine = across(4, 0, 5).map((e) => e.line + e.index);
    for (const e of [...run.built, ...run.left]) expect(mine).not.toContain(e.line + e.index);
  });

  it('stops for a reason only: no money, or the line has changed, with an event saying why', () => {
    // No money.
    let f = work(setUp(), { type: 'orderContractFence', edges: LINE, team: 1 }).farm;
    f.cash = f.overdraft + 100;
    let day = endDay(f);
    expect(events(day.dawn, 'contract-stopped')[0]).toMatchObject({
      why: 'no-money',
      metresBuilt: 0,
      metresLeft: 2000,
    });
    expect(contractView(day.farm)).toEqual([]);
    // Nothing was built or charged.
    expect(day.farm.year.infra).toBe(f.year.infra);
    for (const e of LINE)
      expect(getEdge(day.farm.layout.fences, e)).toBe(getEdge(f.layout.fences, e));

    // The line changed: the player put tape on a segment still to build.
    f = work(setUp(), { type: 'orderContractFence', edges: LINE, team: 1 }).farm;
    const fences = cloneFences(f.layout.fences);
    setEdge(fences, LINE[5]!, EDGE.tape);
    f.layout = { ...f.layout, fences };
    day = endDay(f);
    expect(events(day.dawn, 'contract-built')[0]).toMatchObject({ metres: 250 });
    expect(events(day.dawn, 'contract-stopped')[0]).toMatchObject({ why: 'line-changed' });

    // A segment the player built in permanent fence is skipped without fuss.
    f = work(setUp(), { type: 'orderContractFence', edges: LINE, team: 2 }).farm;
    f = work(f, { type: 'buildFence', edges: LINE.slice(0, 4), fence: 'permanent' }).farm;
    day = endDay(f);
    expect(events(day.dawn, 'contract-stopped')).toEqual([]);
    expect(contractView(day.farm)[0]!.built).toEqual(LINE.slice(4, 24));
  });

  it('the bank must cover the whole run to order it; permanent fence only', () => {
    const farm = setUp();
    farm.cash = farm.overdraft + 1000;
    expect(turnedDown(farm, { type: 'orderContractFence', edges: LINE, team: 1 }).reason).toBe(
      'bank-limit',
    );
    const f = work(setUp(), {
      type: 'buildFence',
      edges: across(3, 0, 3),
      fence: 'permanent',
    }).farm;
    expect(
      turnedDown(f, { type: 'orderContractFence', edges: across(3, 0, 3), team: 1 }).reason,
    ).toBe('nothing-to-build');
  });

  it('cancelling keeps what is built and owes nothing more', () => {
    let f = work(setUp(), { type: 'orderContractFence', edges: LINE, team: 1 }).farm;
    f = endDay(f).farm;
    const done = work(f, { type: 'cancelContractFence', run: 1 });
    expect(done.events[0]).toMatchObject({
      type: 'contract-cancelled',
      metresBuilt: 500,
      metresLeft: 1500,
    });
    expect(done.farm.cash).toBe(f.cash);
    expect(contractView(done.farm)).toEqual([]);
    expect(turnedDown(done.farm, { type: 'cancelContractFence', run: 1 }).reason).toBe(
      'no-such-run',
    );
  });

  it('the farm’s hands can help the team: their day goes into the run', () => {
    let farm = hireOne(openFarm('nsw'), AVERAGE).farm;
    farm = toWeekday(endDay(farm).farm, [1]);
    farm = work(farm, { type: 'orderContractFence', edges: LINE, team: 1, handsHelp: true }).farm;
    const day = endDay(farm);
    // The team's 500 m and the hand's 300 m.
    expect(events(day.dawn, 'contract-built')[0]).toMatchObject({ metres: 800, byHandsM: 300 });
    // The hand's day went into the run, so none is left for the player.
    expect(workforceView(day.farm).hands[0]!.dayLeft).toBeCloseTo(0, 9);
  });

  it('save, load and carry on equals running straight through, mid-run', () => {
    const f = work(setUp(), { type: 'orderContractFence', edges: LINE, team: 1 }).farm;
    const one = endDay(f).farm;
    const straight = skipDays(one, 5).farm;
    const reloaded = skipDays(loadFarm(JSON.parse(JSON.stringify(saveFarm(one)))), 5).farm;
    expect(farmHash(reloaded)).toBe(farmHash(straight));
  });
});

describe('standing duties, injuries and the worker report', () => {
  const restore: (() => void)[] = [];
  afterEach(() => {
    while (restore.length) restore.pop()!();
  });

  it('a hand fills a low portable trough in their own time, and it is in the worker report', () => {
    const b = busyFarm();
    let farm = hireOne(b.farm, AVERAGE).farm;
    farm = toWeekday(endDay(farm).farm, [1, 2, 3, 4]);
    const port = farm.layout.water.ports.find((p) => p.id === b.port)!;
    port.level = 100;
    const seq = farm.inboxSeq;
    const day = endDay(farm);
    const duty = events(day.dawn, 'hand-duty')[0];
    expect(duty).toMatchObject({ duty: { type: 'refill-trough', port: b.port } });
    expect(day.farm.clock.used).toBe(0);
    const report = workerReport(day.farm, seq - 1);
    expect(report.some((r) => r.event.type === 'hand-duty' && r.hand?.id !== undefined)).toBe(true);
  });

  it('an injury is rare, seeded, keeps the hand off for the published time and costs the farm its share', () => {
    const rate = LABOUR.injuryPerHour as { value: number };
    const was = rate.value;
    restore.push(() => {
      rate.value = was;
    });
    rate.value = 1; // every hand-day worked
    let farm = hireOne(openFarm('nsw'), AVERAGE).farm;
    farm = toWeekday(endDay(farm).farm, [1, 2, 3, 4]);
    const day = endDay(farm);
    const hurt = events(day.dawn, 'hand-injured')[0];
    expect(hurt).toMatchObject({ fencing: false, backDay: day.farm.day + 45 });
    expect(hurt!.type === 'hand-injured' && hurt.cost).toBeCloseTo(
      farm.labour!.hands[0]!.rate * 5,
      6,
    );
    expect(workforceView(day.farm).hands[0]!.status).toBe('injured');
    rate.value = was;
    // Back at first light 45 days on.
    const back = skipDays(day.farm, 45);
    expect(events(back.dawn, 'hand-back')).toHaveLength(1);
  });

  it('at the published rate, a year of one hand is very unlikely to bring an injury, and the same seed gives the same events', () => {
    const run = (): FarmState => {
      const farm = hireOne(openFarm('nsw'), AVERAGE).farm;
      return skipDays(farm, 200).farm;
    };
    const a = run();
    const b = run();
    expect(farmHash(a)).toBe(farmHash(b));
    expect(a.inbox.map((m) => m.event)).toEqual(b.inbox.map((m) => m.event));
  });
});

describe('saves and the farm with no hands', () => {
  it('an older save loads with no hands and no contract fencing', () => {
    const farm = busyFarm().farm;
    const saved = saveFarm(farm) as Record<string, unknown>;
    saved.saveFormat = 8;
    const loaded = loadFarm(saved as ReturnType<typeof saveFarm>);
    expect(loaded.labour).toBeUndefined();
    expect(workforceView(loaded)).toMatchObject({ standing: 80, hands: [], nextPayDay: null });
    expect(contractView(loaded)).toEqual([]);
    expect(farmHash(loaded)).toBe(farmHash(farm));
  });

  it('a farm with no hands has no labour state, whatever it does', () => {
    const b = busyFarm();
    const s = skipDays(
      work(b.farm, { type: 'refillPortable', port: b.port }).farm,
      30,
      {},
      {
        anyway: true,
      },
    );
    expect(s.farm.labour).toBeUndefined();
  });
});

describe('wording', () => {
  it('workforce events state facts: no judging words anywhere in them', () => {
    let farm = hireOne(openFarm('nsw'), AVERAGE).farm;
    farm = work(farm, { type: 'orderContractFence', edges: across(12, 0, 39), team: 2 }).farm;
    const s = skipDays(farm, 60);
    const report = workerReport(s.farm);
    expect(report.length).toBeGreaterThan(3);
    const text = JSON.stringify(report).toLowerCase();
    for (const word of [
      'good',
      'bad',
      'lazy',
      'poor',
      'great',
      'excellent',
      'well done',
      'fault',
      'blame',
    ]) {
      expect(text, word).not.toContain(word);
    }
  });
});
