import { describe, expect, it } from 'vitest';
import {
  EATEN_OUT_KG,
  FEED_FLOOR_KG_HA,
  FEED_SHORT_KG_HA,
  HEAD_FEE,
  SELL_COMMISSION,
  UNGRAZEABLE_KG,
  createFarm,
  endDay,
  stockBook,
} from '@gg/engine';
import type { SetupChoices, SimpleAction, Snapshot } from '../../lib/game/types';
import { addsText, forecastLines, partOfMonth } from './feed';
import { GameServer } from './game';
import { outOfFeedWords, repeatMarkNotes } from './inboxwords';
import { gainWhy, shortReason } from './mobwords';
import {
  A_LITTLE_MORE,
  HIGH_IMPACT,
  HIGH_IMPACT_DAYS,
  commentLine,
  daysAboveFloor,
  feedLine,
  pickLine,
  type CommentInputs,
} from './paddockwords';
import { parsePlanAction } from './plans';
import { buildSnapshot } from './snapshot';
import { STOCK_BOOK_NOTES, stockBookWire } from './stockbook';
import { MemoryFarmStore } from './store';

/*
 * The stock book, the Feed panel, the paddock comment line and the display fields added with
 * them (m8, engine 0.21.0). Facts only: no advice, praise or blame, never "overgrazed".
 */

const A = 'a'.repeat(32);
const BANNED = /\bshould\b|\bmust\b|overgraz|\bbad\b|\bgood\b|\bgreat\b|\bpoor\b|—|–/i;

const choices = (over: Partial<SetupChoices> = {}): SetupChoices => ({
  district: 'cw',
  size: 'medium',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'Wattle Flat',
  ...over,
});

const server = (seed = 7): GameServer =>
  new GameServer({ store: new MemoryFarmStore(), seed: () => seed });

async function afterAWeek(): Promise<{ game: GameServer; s: Snapshot }> {
  const game = server();
  await game.create(A, choices());
  return { game, s: (await game.skip(A, 'week')).snapshot };
}

describe('the stock book on the wire', () => {
  it('comes with the record, not the snapshot: a row for every head, whole dollars, sums that add up', async () => {
    const { game, s } = await afterAWeek();
    expect('stockBook' in s).toBe(false);
    const b = (await game.record(A)).stockBook;
    const head = s.mobs
      .filter((m) => m.species === 'cattle')
      .reduce((t, m) => t + m.head + m.calves, 0);
    expect(b.rows).toHaveLength(head);
    expect(b.totals.head).toBe(head);
    for (const r of b.rows) {
      for (const n of [r.paid, r.spent, r.value, r.profit, r.kg])
        expect(Number.isInteger(n)).toBe(true);
      // Rounded parts can be a dollar out of the rounded whole.
      expect(Math.abs(r.value - r.paid - r.spent - r.profit)).toBeLessThanOrEqual(1.5);
      expect(b.classes.some((c) => c.id === r.cls)).toBe(true);
      expect(b.mobs.some((m) => m.id === r.mob)).toBe(true);
    }
    // A running farm's start herd was taken over; nothing has been bought yet.
    expect(b.rows.filter((r) => r.paid > 0).every((r) => r.origin === 'start')).toBe(true);
    expect(b.originText.start).toBe('Taken over');
    for (const n of b.notes) expect(n).not.toMatch(BANNED);
  }, 120_000);

  it('starts at $0 profit on a running farm, says what its head counts, and reads its selling costs from the engine (engine 0.22.0)', async () => {
    const game = server();
    const s0 = await game.create(A, choices());
    const b = (await game.record(A)).stockBook;
    // Day 0: every head was taken over at what it would put in the bank that day.
    expect(b.totals.profit).toBe(0);
    // The head counts calves at foot; the herd's head total does not. Each says which.
    const calves = s0.mobs.filter((m) => m.species === 'cattle').reduce((t, m) => t + m.calves, 0);
    expect(b.totals.calves).toBe(calves);
    expect(b.totals.head).toBe(s0.totals.head + calves);
    expect(b.mobs.reduce((t, m) => t + m.calves, 0)).toBe(calves);
    // The selling costs in the note are the engine's own figures.
    const value = STOCK_BOOK_NOTES.find((n) => n.startsWith('Value now'))!;
    expect(value).toContain(`${Math.round(SELL_COMMISSION * 100)}% commission`);
    expect(value).toContain(`$${HEAD_FEE} a head`);
    expect(value).toMatch(/in-calf premium/);
    expect(value).toMatch(/condition score/);
    expect(STOCK_BOOK_NOTES).toContain(
      'Bulls are bought for breeding and sell by weight, so a bull shows as a loss if sold.',
    );
    expect(STOCK_BOOK_NOTES.join(' ')).not.toMatch(/not her calf/);
  }, 120_000);

  it('matches the engine’s own stock book', () => {
    const farm = createFarm({
      seed: 4,
      district: 'cq',
      size: 'small',
      start: { year: 2023, month: 7 },
      startType: 'running',
      difficulty: 'medium',
    });
    const wire = stockBookWire(farm);
    const engine = stockBook(farm);
    expect(wire.rows.map((r) => r.id)).toEqual(engine.map((r) => r.id));
    expect(wire.rows.map((r) => r.profit)).toEqual(engine.map((r) => Math.round(r.profit)));
  });

  it('the Sell rows carry the money a head, and the line names where the cattle came from', async () => {
    const { s } = await afterAWeek();
    const groups = s.mobs.flatMap((m) => m.sellGroups);
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.money).not.toBeNull();
      expect(g.money!.head).toBe(g.head);
      expect(g.money!.paidText).toBe('Taken over at');
      // Each figure is rounded on its own, so the parts can be a dollar out of the whole.
      expect(
        Math.abs(
          g.money!.profitPerHead -
            (g.money!.valuePerHead - g.money!.paidPerHead - g.money!.spentPerHead),
        ),
      ).toBeLessThanOrEqual(1.5);
    }
    for (const c of s.market.sell.classes) expect(c.money?.head).toBe(c.head);
  }, 120_000);
});

describe('the Feed panel on the wire', () => {
  it('sends tonnes by month, the floor, what the stock eat and the facts', async () => {
    const { s } = await afterAWeek();
    const f = s.feed;
    expect(f.points.length).toBe(12);
    expect(f.points[0]!.month).toBe(s.date.month);
    for (const p of f.points) {
      expect(p.pastureT).toBeGreaterThanOrEqual(0);
      expect(Math.round(p.pastureT * 10)).toBe(p.pastureT * 10);
    }
    expect(f.floorKgHa).toBe(FEED_FLOOR_KG_HA);
    expect(f.floorT).toBeCloseTo((FEED_FLOOR_KG_HA * f.pastureHa) / 1000, 0);
    expect(f.eatTMonth).toBeGreaterThan(0);
    expect(f.note).toMatch(/Average-season forecast/);
    expect(f.note).toMatch(/not a forecast of this year’s rain/);
    expect(f.lines[0]).toMatch(/^At [\d,]+ head the stock eat about [\d.,]+ t DM a month\.$/);
    for (const l of [...f.lines, f.note, f.summary, ...f.suppNotes]) expect(l).not.toMatch(BANNED);
    // 12 different months in order, in the chart, the table and the screen-reader sentence.
    const labels = f.points.map((p) => p.label);
    expect(new Set(labels).size).toBe(12);
    for (let i = 1; i < f.points.length; i++) {
      expect(f.points[i]!.month).toBe((f.points[i - 1]!.month + 1) % 12);
    }
    expect(f.summary).toContain(`from ${labels[0]}`);
    // How it is worked out, in the panel's own words; the 800 has one name.
    expect(f.assumptions.join(' ')).toMatch(/average season from today/i);
    expect(f.assumptions.join(' ')).toMatch(/eat what they ate today, every day/);
    expect(f.assumptions.join(' ')).toMatch(/whole farm\u2019s pasture, not paddock by paddock/);
    expect(f.assumptions.join(' ')).toMatch(/Crops are shown apart and are not grazed/);
    expect(f.assumptions.join(' ')).toMatch(/feedlot are left out/);
    for (const l of [...f.lines, f.summary, ...f.assumptions])
      expect(l).not.toMatch(/ground cover/i);
  }, 120_000);

  it('lists each cattle mob with its supplement, its cost a day and what each one adds', async () => {
    const { s } = await afterAWeek();
    const cattle = s.mobs.filter((m) => m.species === 'cattle');
    expect(s.feed.supplements.map((x) => x.mob)).toEqual(cattle.map((m) => m.id));
    for (const row of s.feed.supplements) {
      const mob = cattle.find((m) => m.id === row.mob)!;
      expect(row.supp).toBe(mob.supp);
      if (mob.where !== 'paddock') continue;
      // The same prices the mob card shows.
      expect(row.options.map((o) => [o.id, o.perDay])).toEqual(
        mob.suppOptions.map((o) => [o.id, o.perDay]),
      );
      expect(row.options.find((o) => o.id === 'none')!.adds).toBe('');
      expect(row.options.find((o) => o.id === 'hay')!.adds).toMatch(/kg DM a head a day at ME/);
    }
  }, 120_000);

  it('words the floor, the stock and the crops as facts', () => {
    const date = (month: number, d: number) => ({ year: 2026, month, date: d });
    const base = {
      points: [
        { day: 0, date: date(10, 1), pastureKg: 900_000, cropKg: 0 },
        { day: 30, date: date(11, 1), pastureKg: 800_000, cropKg: 120_000 },
      ],
      pastureHa: 1000,
      cropHa: 50,
      floorKgHa: 800,
      eatKgDay: 5000,
      head: 400,
      underFloor: { day: 280, date: date(9, 4) },
    };
    const lines = forecastLines(base);
    expect(lines[0]).toBe('At 400 head the stock eat about 152 t DM a month.');
    expect(lines[1]).toBe(
      'In an average season, feed on offer falls under the grazing floor in early October.',
    );
    expect(lines[2]).toBe('Crops add the most feed in December: about 120 t DM.');
    expect(forecastLines({ ...base, underFloor: null })[1]).toMatch(
      /stays above the grazing floor/,
    );
    expect(forecastLines({ ...base, underFloor: { day: 0, date: date(10, 1) } })[1]).toBe(
      'Feed on offer is under the grazing floor now.',
    );
    expect(partOfMonth({ month: 2, date: 15 })).toBe('mid March');
    expect(partOfMonth({ month: 5, date: 28 })).toBe('late June');
  });

  it('says what each supplement adds', () => {
    expect(addsText('none', { kg: 0, me: 0, cp: 0, pastureKg: 0 })).toBe('');
    expect(addsText('hay', { kg: 2, me: 8.5, cp: 10, pastureKg: -1 })).toBe(
      '2.0 kg DM a head a day at ME 8.5 MJ/kg, CP 10%. They eat about 1.0 kg less pasture.',
    );
    expect(addsText('lick', { kg: 0, me: 0, cp: 0, pastureKg: 0.6 })).toBe(
      'Lifts pasture eaten by about 0.6 kg DM a head a day on this feed.',
    );
    expect(addsText('lick', { kg: 0, me: 0, cp: 0, pastureKg: 0 })).toBe(
      'No lift in pasture eaten on this feed.',
    );
  });
});

describe('the paddock comment line', () => {
  const at = (over: Partial<CommentInputs>): CommentInputs => ({
    stocked: true,
    massKgHa: 2000,
    green: 0.6,
    heightCm: 12,
    growKgHa: 20,
    eatKgHa: 10,
    dietMe: 9.6,
    paddockMe: 9.5,
    ...over,
  });

  it('only on a stocked paddock', () => {
    expect(commentLine(at({ stocked: false }))).toBeNull();
  });

  it('growth at or above what is eaten: the grass is growing away from them', () => {
    expect(feedLine(at({ growKgHa: 20, eatKgHa: 10 }))).toBe(
      'The grass is growing away from them.',
    );
    expect(feedLine(at({ growKgHa: 10, eatKgHa: 10 }))).toBe(
      'The grass is growing away from them.',
    );
  });

  it('a high impact needs both: over twice what grows, and the feed above the floor gone in under 30 days', () => {
    expect(HIGH_IMPACT).toBe(2);
    expect(HIGH_IMPACT_DAYS).toBe(30);
    // 1,000 kg DM/ha: 200 above the floor, going down 8 a day, gone in 25 days.
    expect(feedLine(at({ massKgHa: 1000, growKgHa: 4, eatKgHa: 12 }))).toBe(
      "They're having a high impact: they eat about 12 kg DM/ha a day and about 4 grows.",
    );
    expect(daysAboveFloor(at({ massKgHa: 1000, growKgHa: 4, eatKgHa: 12 }))).toBeCloseTo(25, 9);
  });

  it('light stocking on dormant grass with plenty standing: not a high impact, the fact (engine 0.22.0)', () => {
    // The review's case: about 1,300 kg DM/ha standing, little growing, light stocking.
    expect(feedLine(at({ massKgHa: 1300, growKgHa: 0.4, eatKgHa: 1.6 }))).toBe(
      "Not much is growing. They're eating standing feed: about 1.6 kg DM/ha a day and about 0.4 grows.",
    );
    // 2,000 kg DM/ha going down 8 a day lasts 150 days above the floor.
    expect(feedLine(at({ growKgHa: 4, eatKgHa: 12 }))).toMatch(/^Not much is growing\./);
  });

  it('eaten a little over what grows, up to 1.25 times: the figures', () => {
    expect(A_LITTLE_MORE).toBe(1.25);
    expect(feedLine(at({ growKgHa: 8, eatKgHa: 10 }))).toBe(
      'They eat a little more than grows: about 10 kg DM/ha a day against 8.',
    );
  });

  it('eaten 1.25 to 2 times what grows: more than grows, with the figures (engine 0.22.0)', () => {
    expect(feedLine(at({ growKgHa: 8, eatKgHa: 12 }))).toBe(
      'They eat more than grows: about 12 kg DM/ha a day and about 8 grows.',
    );
    expect(feedLine(at({ growKgHa: 8, eatKgHa: 16 }))).toBe(
      'They eat more than grows: about 16 kg DM/ha a day and about 8 grows.',
    );
  });

  it("a mob's first day in a paddock: only the lines about the standing feed (engine 0.22.0)", () => {
    const first = (over: Partial<CommentInputs>) => commentLine(at({ ...over, grazedHere: false }));
    // What they eat or pick waits a day: their last day was somewhere else.
    expect(first({ massKgHa: 1300, growKgHa: 1, eatKgHa: 30 })).toBeNull();
    expect(first({ dietMe: 10.5, paddockMe: 9.5 })).toBeNull();
    expect(first({ massKgHa: FEED_FLOOR_KG_HA - 50, green: 0.2, heightCm: 4 })).toBe(
      "It's getting short: under 800 kg DM/ha.",
    );
    // Tall and dry is the standing feed; picking the green near the base waits.
    expect(first({ green: 0.2, heightCm: 30, dietMe: 9.9 })).toBe(
      'The grass is tall and mostly dry.',
    );
    // After a day there, the same paddock says what they eat.
    expect(commentLine(at({ massKgHa: 1000, growKgHa: 1, eatKgHa: 30 }))).toMatch(/high impact/);
  });

  it('under the floor: getting short, in the paddock sheet’s words', () => {
    expect(feedLine(at({ massKgHa: FEED_FLOOR_KG_HA - 1 }))).toBe(
      "It's getting short: under 800 kg DM/ha.",
    );
  });

  it('nothing eaten here yet: no feed line', () => {
    expect(feedLine(at({ eatKgHa: 0 }))).toBeNull();
  });

  it('diet ME half a unit over the paddock’s: picking the best bits', () => {
    expect(pickLine(at({ dietMe: 10.0, paddockMe: 9.5 }))).toBe("They're picking the best bits.");
    expect(pickLine(at({ dietMe: 9.9, paddockMe: 9.5 }))).toBeNull();
    expect(pickLine(at({ dietMe: null }))).toBeNull();
  });

  it('tall and mostly dry: picking the green near the base only with some green and a greener diet', () => {
    expect(pickLine(at({ green: 0.2, heightCm: 30 }))).toBe(
      "The grass is tall and mostly dry. They're picking the green near the base.",
    );
    // No green at all, or a diet no better than the paddock's average: just the grass.
    expect(pickLine(at({ green: 0, heightCm: 30 }))).toBe('The grass is tall and mostly dry.');
    expect(pickLine(at({ green: 0.2, heightCm: 30, dietMe: 9.5, paddockMe: 9.5 }))).toBe(
      'The grass is tall and mostly dry.',
    );
    expect(pickLine(at({ green: 0.2, heightCm: 30, dietMe: null }))).toBe(
      'The grass is tall and mostly dry.',
    );
  });

  it('short and dry: down to what they would normally leave', () => {
    expect(pickLine(at({ massKgHa: FEED_SHORT_KG_HA - 10, green: 0.2, heightCm: 4 }))).toBe(
      "They're down to eating what they'd normally leave.",
    );
  });

  it('joins the two, as in the mockup', () => {
    expect(commentLine(at({ dietMe: 10.2, paddockMe: 9.5 }))).toBe(
      "They're picking the best bits. The grass is growing away from them.",
    );
  });

  it('every line is a fact: no advice, praise, blame or "overgrazed"', () => {
    const all = [
      commentLine(at({})),
      commentLine(at({ growKgHa: 1, eatKgHa: 30 })),
      commentLine(at({ massKgHa: 500, green: 0.1 })),
      commentLine(at({ green: 0.2, heightCm: 40 })),
    ];
    for (const l of all) expect(l).not.toMatch(BANNED);
  });

  it('a stocked paddock on the wire has a comment, and an empty one has none but may have rest days', async () => {
    const { s } = await afterAWeek();
    const stocked = s.paddocks.filter((p) => p.mobs.length > 0);
    const empty = s.paddocks.filter((p) => p.mobs.length === 0);
    expect(stocked.length).toBeGreaterThan(0);
    for (const p of stocked) {
      expect(p.restDays).toBeNull();
      expect(typeof p.comment === 'string' || p.comment === null).toBe(true);
    }
    expect(stocked.some((p) => p.comment)).toBe(true);
    for (const p of empty) {
      expect(p.comment).toBeNull();
      if (p.restDays !== null) expect(p.restDays).toBeGreaterThanOrEqual(0);
    }
  }, 120_000);
});

describe('the display fields', () => {
  it('top bar: rain (none with random seasons), district, head and net worth', async () => {
    const { s } = await afterAWeek();
    expect(s.totals.rainMm).toBeNull();
    expect(s.farm.setup.districtName).toBe('Central West NSW');
    expect(s.totals.head).toBeGreaterThan(0);
    expect(Number.isInteger(s.totals.netWorth)).toBe(true);
  }, 120_000);

  it('a real-year farm has last night’s rain in mm', async () => {
    const game = server(3);
    await game.create(A, choices({ years: 'real-in-order' }));
    const s = (await game.skip(A, 'week')).snapshot;
    expect(typeof s.totals.rainMm).toBe('number');
    expect(s.totals.rainMm!).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('prices carry last week’s c/kg once the farm has a week of prices', async () => {
    const game = server();
    const start = await game.create(A, choices());
    for (const p of start.market.prices) expect(p.lastWeekCKg).toBeNull();
    await game.skip(A, 'week');
    const s = (await game.skip(A, 'week')).snapshot;
    expect(s.market.prices.some((p) => p.lastWeekCKg !== null)).toBe(true);
  }, 120_000);

  it('each mob has its average weight and one short reason line for its gain', async () => {
    const { s } = await afterAWeek();
    for (const m of s.mobs.filter((x) => x.where === 'paddock')) {
      expect(m.weightKg).toBeGreaterThan(0);
      expect(m.gainWhy).toBeTruthy();
      expect(m.gainWhy!).not.toMatch(BANNED);
    }
  }, 120_000);

  it('the reason line: no water first, off pasture, the engine’s reason, else the feed', () => {
    const base = {
      where: 'paddock' as const,
      hasWater: true,
      dryDays: 0,
      adg: 0.6,
      me: 10.2,
      cp: 13.6,
      forecasts: [],
    };
    expect(gainWhy(base)).toBe('Feed at ME 10.2 MJ/kg, CP 14%');
    expect(gainWhy({ ...base, hasWater: false })).toBe('No water');
    expect(gainWhy({ ...base, where: 'lot' })).toBe('On the feedlot ration');
    expect(gainWhy({ ...base, where: 'yards' })).toBe('In the stock yards');
    expect(gainWhy({ ...base, adg: null })).toBeNull();
    const milking = { cls: 'cowWithCalf', why: [{ reason: 'milking', milkMJ: 40, ownMJ: 60 }] };
    expect(gainWhy({ ...base, adg: -0.2, forecasts: [milking] as never })).toBe(
      'Milking for a calf',
    );
    expect(shortReason({ reason: 'lowMe', me: 7.6 } as never)).toBe(
      'Low energy feed (ME 7.6 MJ/kg)',
    );
  });
});

describe('the inbox leftovers', () => {
  it('the whole farm eaten out is never put as days of feed left', () => {
    const t = outOfFeedWords(9);
    expect(t).not.toMatch(/days? of feed/);
    // The model's own condition, with its own figures: feed above 250 averaging under 40.
    expect(t).toContain(
      `feed above ${UNGRAZEABLE_KG} kg DM/ha averages under ${EATEN_OUT_KG} kg DM/ha`,
    );
    expect(t).not.toContain('800');
    expect(t).toContain('9 more days');
  });

  it('marking is told once for each drop: a repeat note in the same drop is held back', () => {
    const note = (seq: number, mob: number, type: string) => ({
      seq,
      event: {
        type: 'cattle',
        mob,
        mobName: 'Cows',
        area: null,
        note: { type, count: 4 },
      } as never,
    });
    const inbox = [
      note(1, 1, 'calvingStarted'),
      note(2, 1, 'toMark'),
      note(3, 1, 'toMark'),
      note(4, 2, 'toMark'),
      note(5, 1, 'calvingStarted'),
      note(6, 1, 'toMark'),
    ];
    expect([...repeatMarkNotes(inbox)]).toEqual([3]);
    // Marking the mob ends the drop's note too.
    const marked = [
      note(1, 1, 'toMark'),
      { seq: 2, event: { type: 'calves-marked', mob: 1, mobName: 'Cows', count: 4 } as never },
      note(3, 1, 'toMark'),
    ];
    expect([...repeatMarkNotes(marked)]).toEqual([]);
  });
});

describe('a plan with more than one leg', () => {
  const leg1 = { stops: [10, 20], trigger: { mode: 'days', every: 3 }, rounds: 2 };
  const leg2 = { stops: [30, 40, 50], trigger: { mode: 'kg', kg: 1500, maxDays: 7 }, rounds: 1 };
  const ask = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    type: 'setPlan',
    mob: 1,
    ...leg1,
    after: 'repeat',
    step: 0,
    moreLegs: [leg2],
    ...over,
  });

  it('is read as the engine’s legs, in order, with the step counted across every leg', () => {
    const a = parsePlanAction(ask({ step: 4 }));
    expect(a).toEqual({
      type: 'setPlan',
      mob: 1,
      plan: {
        legs: [
          { stops: [10, 20], rule: { mode: 'days', every: 3 }, rounds: 2 },
          { stops: [30, 40, 50], rule: { mode: 'kg', kg: 1500, maxDays: 7 }, rounds: 1 },
        ],
        after: 'repeat',
      },
      step: 4,
    });
  });

  it('refuses a step past the last stop, a bad leg, or more legs than the engine takes', () => {
    expect(parsePlanAction(ask({ step: 5 }))).toBeNull();
    expect(parsePlanAction(ask({ moreLegs: [{ ...leg2, stops: [] }] }))).toBeNull();
    expect(parsePlanAction(ask({ moreLegs: [{ ...leg2, trigger: { mode: 'x' } }] }))).toBeNull();
    expect(parsePlanAction(ask({ moreLegs: 'no' }))).toBeNull();
    expect(parsePlanAction(ask({ moreLegs: Array.from({ length: 8 }, () => leg2) }))).toBeNull();
  });

  it('runs on a farm: the card names each leg, and the plan comes back with two legs', async () => {
    const game = server();
    const start = await game.create(A, choices());
    const wet = start.paddocks.filter((p) => p.water !== 'none');
    expect(wet.length).toBeGreaterThanOrEqual(2);
    const mob = start.mobs.find((m) => m.where === 'paddock')!;
    const action: SimpleAction = {
      type: 'setPlan',
      mob: mob.id,
      stops: [wet[0]!.cell],
      trigger: { mode: 'days', every: 3 },
      rounds: 1,
      after: 'repeat',
      step: 0,
      moreLegs: [{ stops: [wet[1]!.cell], trigger: { mode: 'days', every: 5 }, rounds: 1 }],
    };
    const p = await game.preview(A, { action });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const lines = (p.card.summary ?? []).join(' ');
    expect(lines).toContain(`Leg 1: ${wet[0]!.name}. Move every 3 days. 1 round.`);
    expect(lines).toContain(`Leg 2: ${wet[1]!.name}. Move every 5 days. 1 round.`);
    const done = await game.act(A, { action });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const plan = done.snapshot.plans.find((x) => x.mobs.some((m) => m.mob === mob.id))!;
    expect(plan.legs).toHaveLength(2);
    expect(plan.legs[1]!.ruleText).toBe('Move every 5 days.');
    expect(plan.editable).toBe(false);
  }, 120_000);
});

describe('the snapshot stays fast with the forecast', () => {
  it('a second snapshot of the same farm reuses the forecast', () => {
    const farm = createFarm({
      seed: 9,
      district: 'nsw',
      size: 'large',
      start: { year: 2023, month: 3 },
      startType: 'running',
      difficulty: 'medium',
    });
    endDay(farm);
    const stored = {
      name: 'Test',
      version: '1',
      setup: choices({ district: 'nsw', size: 'large' }),
    };
    buildSnapshot(farm, stored, {});
    const t = performance.now();
    const again = buildSnapshot(farm, stored, {});
    expect(again.feed.points).toHaveLength(12);
    // The forecast alone takes about a tenth of a second; reused, the whole snapshot is quicker.
    expect(performance.now() - t).toBeLessThan(2000);
  });
});
