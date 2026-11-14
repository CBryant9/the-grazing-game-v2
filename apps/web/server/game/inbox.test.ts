import { describe, expect, it } from 'vitest';
import type { FarmEvent } from '@gg/engine';
import type { SetupChoices } from '../../lib/game/types';
import { GameServer, farmIdFor } from './game';
import { inboxMessage, noteWord } from './inboxwords';
import { MemoryFarmStore } from './store';

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

const date = { year: 2024, month: 2, date: 14 };

describe('the words for the inbox', () => {
  const events: [string, FarmEvent, RegExp][] = [
    [
      'a death with its cause',
      { type: 'deaths', mob: 1, mobName: 'Mob 1', cause: 'noWater', count: 3 },
      /^Mob 1: 3 head died, from no water\.$/,
    ],
    [
      'a breakout with its reason',
      {
        type: 'breakout',
        mob: 1,
        mobName: 'Steers A',
        reason: 'hungry',
        edge: { line: 'h', index: 4 },
        area: 'Paddock 7',
      },
      /^Steers A pushed through a fence in Paddock 7, because they were hungry\.$/,
    ],
    [
      'a sale',
      {
        type: 'cattle-sold',
        booked: true,
        head: 12,
        calvesAtFoot: 0,
        avgKg: 342.4,
        net: 15_300,
        profit: 2_000,
      },
      /^12 head sold from the booking, averaging 342 kg\. \$15,300 paid into the bank after selling costs\.$/,
    ],
    [
      'a booking',
      { type: 'sale-booked', head: 8, calvesAtFoot: 0, saleDay: 10, saleDate: date, daysAway: 3 },
      /^8 head booked onto the sale on Thursday 14 March\. Nothing is paid until then\.$/,
    ],
    [
      'cattle bought',
      {
        type: 'cattle-on-the-way',
        cls: 'weanerSteer',
        qty: 40,
        total: 41_600,
        indicator: 430,
        arriveDay: 11,
        arriveDate: date,
      },
      /^Bought 40 weaner steers for \$41,600, freight included\. They arrive in the stock yards at first light on Thursday 14 March\.$/,
    ],
    [
      'an arrival',
      {
        type: 'cattle-arrived',
        cls: 'weanerSteer',
        head: 40,
        calves: 0,
        cost: 41_600,
        mob: 3,
        mobName: 'Mob 3',
        joined: false,
      },
      /^40 head arrived in the stock yards as Mob 3\.$/,
    ],
    [
      'a plan move',
      {
        type: 'plan-moved',
        mob: 1,
        mobName: 'Steers A',
        template: 1,
        templateName: 'Plan 1',
        from: 'Paddock 1',
        to: 'Paddock 2',
        cell: 5,
        leg: 0,
        stop: 1,
        step: 1,
        because: 'kg',
        massKgHa: 1510,
        movesADay: 1,
        head: 40,
        roundDone: false,
        legStarted: null,
        restarted: false,
        rounds: 0,
        moves: 1,
        losing: [],
      },
      /^Steers A moved from Paddock 1 to Paddock 2, by its grazing plan\. Feed there was down to 1,510 kg DM\/ha\.$/,
    ],
    [
      'a crop ready',
      {
        type: 'crop',
        event: {
          type: 'harvest-ready',
          fieldId: 2,
          sp: 'wheat',
          cell: 4,
          selfSown: false,
          estimate: { tha: 2.1, t: 48.3, ha: 23, value: 12_000, cost: 1_000 },
        },
      },
      /^The wheat crop is ready to harvest: about 48\.3 t of grain\.$/,
    ],
    [
      'a harvest',
      { type: 'harvested', sp: 'wheat', fieldId: 2, t: 48.3, tha: 2.1, value: 12_000, cost: 1_000 },
      /^Harvested 48\.3 t of wheat, worth \$12,000\.$/,
    ],
    [
      'a sowing',
      { type: 'sown', sp: 'oats', fieldId: 3, ha: 24, convHa: 0, cost: 3_000, skipped: 0 },
      /^Sowed oats on 24 ha for \$3,000\.$/,
    ],
  ];

  it.each(events)('says %s', (_name, event, pattern) => {
    const m = inboxMessage(event)!;
    expect(m.text).toMatch(pattern);
    expect(m.text).not.toMatch(BANNED);
  });

  it('says a joining report and a preg test with the figures', () => {
    expect(
      noteWord('Cows A', 'Paddock 2', {
        type: 'joiningProgress',
        weeks: 3,
        conceived: 38,
        inCalf: 38,
        females: 100,
      }),
    ).toBe(
      'Cows A, joining week 3: 38 got in calf in the last 3 weeks. 38 of 100 females are in calf now.',
    );
    const preg = noteWord('Heifers', null, {
      type: 'pregTest',
      inCalf: 41,
      females: 46,
      rate: 41 / 46,
      dry: 5,
      cs: 3.5,
      expected: 0.89,
      tooSoon: 0,
    })!;
    expect(preg).toBe(
      'Heifers preg test: 41 of 46 females in calf (89%). At CS 3.5 about 89% would be expected. 5 females not in calf.',
    );
    expect(preg).not.toMatch(BANNED);
  });

  it('leaves out the events the inbox does not carry', () => {
    expect(
      inboxMessage({ type: 'supplement-set', mob: 1, mobName: 'Mob 1', supp: 'lick' }),
    ).toBeNull();
  });
});

describe('the inbox on the farm', () => {
  it('starts with a message, unread, and reads to none', async () => {
    const store = new MemoryFarmStore();
    const game = new GameServer({ store, seed: () => 7 });
    const s = await game.create(A, choices());
    expect(s.inbox.length).toBeGreaterThan(0);
    expect(s.inboxUnread).toBe(s.inbox.length);
    expect(s.inbox.every((m) => m.unread)).toBe(true);
    expect(s.inbox[0]!.text).toMatch(/^The farm is set up: [\d,]+ ha\.$/);
    const newest = Math.max(...s.inbox.map((m) => m.seq));
    const read = await game.markRead(A, newest);
    expect(read.inboxUnread).toBe(0);
    expect(read.inbox.every((m) => !m.unread)).toBe(true);
    // The mark is kept with the farm, so another server reads it back.
    const two = new GameServer({ store, seed: () => 1 });
    expect((await two.snapshot(A))!.inboxUnread).toBe(0);
    // New messages are unread again, and old ones stay read.
    const week = (await two.skip(A, 'week')).snapshot;
    expect(week.inboxUnread).toBeGreaterThan(0);
    expect(week.inbox.filter((m) => m.unread).length).toBe(week.inboxUnread);
    expect(week.inbox[week.inbox.length - 1]!.unread).toBe(false);
  }, 60_000);

  it('never reads past the newest message, and never backwards', async () => {
    const game = new GameServer({ store: new MemoryFarmStore(), seed: () => 7 });
    const s = await game.create(A, choices());
    const newest = Math.max(...s.inbox.map((m) => m.seq));
    expect((await game.markRead(A, 2 ** 30)).inboxUnread).toBe(0);
    // A later message made after reading is unread, even though the number sent was huge.
    const next = (await game.skip(A, 'week')).snapshot;
    expect(next.inboxUnread).toBeGreaterThan(0);
    const back = await game.markRead(A, 0);
    expect(back.inboxUnread).toBe(next.inboxUnread);
    expect(newest).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it('lists the newest first, with a date, in plain words', async () => {
    const game = new GameServer({ store: new MemoryFarmStore(), seed: () => 7 });
    await game.create(A, choices());
    const s = (await game.skip(A, 'month')).snapshot;
    const seqs = s.inbox.map((m) => m.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => b - a));
    expect(s.inbox.length).toBeLessThanOrEqual(40);
    for (const m of s.inbox) {
      expect(m.text).toMatch(/^[A-Z$0-9]/);
      expect(m.text).not.toMatch(BANNED);
      expect(m.date.year).toBeGreaterThan(1990);
    }
  }, 60_000);

  it("does not let one session read another's inbox", async () => {
    const game = new GameServer({ store: new MemoryFarmStore(), seed: () => 7 });
    await game.create(A, choices());
    await expect(game.markRead('b'.repeat(32), 5)).rejects.toThrow(/no farm/);
    expect(farmIdFor(A)).toHaveLength(32);
  });
});
