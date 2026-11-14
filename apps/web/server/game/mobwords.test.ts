import { describe, expect, it } from 'vitest';
import type { GainForecast, GainReason } from '@gg/engine';
import { breedingLines, mobWhy, moveNotes, pticWords, reasonWord } from './mobwords';
import { doneWord } from './words';

const BANNED = /\bshould\b|\bmust\b|overgraz|\bbad\b|\bgood\b|—|–/i;

const REASONS: [GainReason, RegExp][] = [
  [
    { reason: 'notEnoughFeed', mass: 423 },
    /^There is not enough feed where they graze: about 420 kg DM\/ha\.$/,
  ],
  [{ reason: 'lowMe', me: 7.34 }, /^The feed is low in energy: ME 7\.3 MJ\/kg\.$/],
  [{ reason: 'lowProtein' }, /^The feed is under 7% CP, so they eat less\.$/],
  [
    { reason: 'milking', milkMJ: 61.4, ownMJ: 38.2 },
    /^Cows with calves put about 61 MJ a day into milk, on top of about 38 MJ for themselves\.$/,
  ],
  [{ reason: 'latePregnancy' }, /^Cows and heifers in late pregnancy need more energy\.$/],
  [
    { reason: 'justShort', intake: 7.26, me: 8.5 },
    /^They eat about 7\.3 kg DM a head a day of feed at ME 8\.5 MJ\/kg, which is just short of what they need\.$/,
  ],
];

describe('the reasons a mob is not gaining', () => {
  it.each(REASONS)('says %j in plain words', (reason, pattern) => {
    const text = reasonWord(reason);
    expect(text).toMatch(pattern);
    expect(text).not.toMatch(BANNED);
  });
});

const forecast = (why: GainReason[], cls = 'steer'): GainForecast =>
  ({ cls, n: 10, gain: -0.2, why }) as unknown as GainForecast;

const base = {
  name: 'Steers A',
  area: 'Paddock 3',
  where: 'paddock' as const,
  hasWater: true,
  dryDays: 0,
  adg: 0.5,
  fed: 1,
  forecasts: [] as GainForecast[],
};

describe('why a mob is losing weight or short', () => {
  it('says nothing when the mob is gaining and fed', () => {
    expect(mobWhy(base)).toEqual([]);
  });

  it('says it is losing, with the figure, then the engine reasons without repeating them', () => {
    const why = mobWhy({
      ...base,
      adg: -0.31,
      fed: 0.62,
      forecasts: [
        forecast([
          { reason: 'notEnoughFeed', mass: 500 },
          { reason: 'lowMe', me: 7.1 },
        ]),
        forecast([
          { reason: 'notEnoughFeed', mass: 500 },
          { reason: 'milking', milkMJ: 60, ownMJ: 40 },
        ]),
      ],
    });
    expect(why).toEqual([
      'Steers A is losing about 0.31 kg a head a day.',
      'The paddock gave the mob 62% of the feed it wanted.',
      'There is not enough feed where they graze: about 500 kg DM/ha.',
      'The feed is low in energy: ME 7.1 MJ/kg.',
      'Cows with calves put about 60 MJ a day into milk, on top of about 40 MJ for themselves.',
    ]);
    for (const w of why) expect(w).not.toMatch(BANNED);
  });

  it('says a mob that is only just not gaining is not gaining', () => {
    expect(mobWhy({ ...base, adg: 0.02 })[0]).toBe(
      'Steers A is not gaining weight (0.02 kg a head a day).',
    );
  });

  it('says there is no water, in the paddock, with the days without', () => {
    expect(mobWhy({ ...base, hasWater: false, dryDays: 2 })[0]).toBe(
      'Steers A has no water in Paddock 3. 2 days without so far.',
    );
    expect(mobWhy({ ...base, hasWater: false })[0]).toBe('Steers A has no water in Paddock 3.');
  });

  it('does not talk about water or pasture for a mob in the stock yards', () => {
    const why = mobWhy({
      ...base,
      where: 'yards',
      area: null,
      hasWater: true,
      adg: -0.1,
      fed: null,
    });
    expect(why).toEqual(['Steers A is losing about 0.10 kg a head a day.']);
  });
});

describe('other words on the mob card and the job cards', () => {
  it('states the joining dates and the head PTIC on the record, with how far along', () => {
    const d = (date: number, month = 8) => ({ year: 2026, month, date });
    expect(
      breedingLines({
        joining: { start: d(1), end: d(3, 10), days: 63, ended: false },
        ptic: pticWords({ cows: 31, heifers: 0 }, { least: 2, most: 4 }),
      }),
    ).toEqual([
      'Joining: bulls in from 1 Sep 2026 to 3 Nov 2026 (9 weeks).',
      '31 PTIC, 2 to 4 months in calf.',
    ]);
    expect(pticWords({ cows: 28, heifers: 3 }, { least: 3, most: 3 })).toBe(
      '31 PTIC (28 cows, 3 heifers), 3 months in calf.',
    );
    expect(pticWords({ cows: 1, heifers: 0 }, { least: 1, most: 1 })).toBe(
      '1 PTIC, 1 month in calf.',
    );
    expect(pticWords({ cows: 0, heifers: 0 }, null)).toBeNull();
    expect(breedingLines({ joining: null, ptic: null })).toEqual([]);
    // Nothing is said about cows that are not PTIC: no "empty", no "not in calf".
    expect(
      JSON.stringify(breedingLines({ joining: null, ptic: '2 PTIC, 2 months in calf.' })),
    ).not.toMatch(/empty|not in calf/);
  });

  it('notes a paddock with no water and a mob already there', () => {
    expect(moveNotes('Paddock 4', true, [])).toEqual([]);
    expect(moveNotes('Paddock 4', false, [])).toEqual(['Paddock 4 has no water.']);
    expect(moveNotes('Paddock 4', true, [{ name: 'Cows B', head: 60 }])).toEqual([
      'Cows B (60 head) is in Paddock 4. The two mobs will join.',
    ]);
  });

  it('says what a done move, supplement and sale did', () => {
    const date = { year: 2026, month: 10, date: 21 };
    const said = doneWord([
      { type: 'mob-moved', mob: 1, mobName: 'Steers A', head: 120 } as never,
      {
        type: 'mobs-joined',
        from: 1,
        fromName: 'Steers A',
        into: 2,
        intoName: 'Cows B',
        area: null,
      },
      { type: 'supplement-set', mob: 1, mobName: 'Steers A', supp: 'lick' },
      { type: 'supplement-set', mob: 1, mobName: 'Steers A', supp: 'none' },
      { type: 'sale-booked', head: 5, calvesAtFoot: 0, saleDay: 9, saleDate: date, daysAway: 7 },
      { type: 'sale-cancelled', head: 5, saleDay: 9, saleDate: date },
    ]);
    expect(said).toBe(
      'Steers A moved (120 head) and joined Cows B. Steers A is on lick. Steers A is off supplements. 5 head booked onto the sale on 21 Nov 2026. Nothing is paid today. 5 head taken off the sale on 21 Nov 2026.',
    );
    expect(said).not.toMatch(BANNED);
  });
});
