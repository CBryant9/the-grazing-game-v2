import { describe, expect, it } from 'vitest';
import {
  BANK_NEAR_SHARE,
  FEED_FLOOR_KG_HA,
  applyAction,
  cloneFarm,
  createFarm,
  endDay,
  skipDays,
  startMoney,
  thingsToDo,
  todoKey,
  type FarmState,
  type GainForecast,
  type YearRecord,
} from '@gg/engine';
import type { SetupChoices } from '../../lib/game/types';
import { GameServer } from './game';
import { inboxMessage } from './inboxwords';
import { mobLines } from './mobwords';
import { setupOptions } from './setup';
import { buildSnapshot, feedText } from './snapshot';
import { MemoryFarmStore } from './store';
import { stopWord, todoWire } from './words';
import { changeLines } from './years';

/*
 * The playtest fixes (m8) as the player sees them: the bank's limit beside
 * cash and its facts in words, a mob card that warns only when the mob is
 * losing, a feed line that never says "0 days", the year card's change
 * lines, the setup's money, and putting a thing to do away.
 */

const BANNED = /\bshould\b|\bmust\b|overgraz|\bbad\b|\bgood\b|\bwell done\b|\bsorry\b|—|–/i;

const choices = (over: Partial<SetupChoices> = {}): SetupChoices => ({
  district: 'cq',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'Wattle Flat',
  ...over,
});

const farmOf = (over: Partial<Parameters<typeof createFarm>[0]> = {}): FarmState =>
  createFarm({
    seed: 2,
    district: 'cq',
    size: 'small',
    start: { year: 2026, month: 8 },
    startType: 'running',
    difficulty: 'medium',
    ...over,
  });

const snap = (farm: FarmState) =>
  buildSnapshot(farm, { name: 'X', setup: choices(), version: 'abc' }, {});

describe('the bank', () => {
  it("sends the bank's limits beside cash, as display numbers of their own", () => {
    const farm = farmOf();
    const s = snap(farm);
    expect(s.totals.bankLimit).toBe(farm.broke);
    expect(s.totals.lendLimit).toBe(farm.overdraft);
    expect(s.totals.bankLimit).toBeLessThan(0);
  });

  it('says the cash, the limit and the head on the farm, in the inbox, Things to do and the stop', () => {
    const farm = cloneFarm(farmOf());
    farm.cash = 5;
    const day = endDay(farm);
    const event = day.day.events.find((e) => e.type === 'bank')!;
    const words = inboxMessage(event, () => ({ year: 2026, month: 8, date: 2 }))!.text;
    expect(words).toMatch(
      /^Cash is -\$[\d,]+\. The bank takes the farm at -\$[\d,]+\. [\d,]+ head on the farm\.$/,
    );
    expect(words).not.toMatch(BANNED);
    // A fact, not a remedy: nothing about selling.
    expect(words).not.toMatch(/sold|sell/);
    const stop = day.stops.find((x) => x.type === 'bank')!;
    expect(stopWord(stop)).toBe(words);
    const item = thingsToDo(day.farm).find((t) => t.type === 'bank')!;
    expect(todoWire(item).text).toBe(words);
    // Three quarters of the way: the second fact, firmer, still facts only.
    const near = cloneFarm(day.farm);
    near.cash = near.broke * BANK_NEAR_SHARE - 10;
    const second = thingsToDo(near).find((t) => t.type === 'bank')!;
    const w2 = todoWire(second);
    expect(w2.urgent).toBe(true);
    expect(w2.text).toMatch(
      /past three quarters of the way to -\$[\d,]+, where the bank takes the farm\./,
    );
    expect(w2.text).not.toMatch(BANNED);
  });
});

describe('the mob card', () => {
  const forecast = (why: GainForecast['why']): GainForecast =>
    ({ cls: 'cow', n: 10, gain: 0.02, why }) as unknown as GainForecast;
  const base = {
    name: 'Cows',
    area: 'Paddock 2',
    where: 'paddock' as const,
    hasWater: true,
    dryDays: 0,
    fed: 0.8,
    cs: 3,
    forecasts: [
      forecast([
        { reason: 'notEnoughFeed', mass: 757 },
        { reason: 'milking', milkMJ: 60, ownMJ: 40 },
      ]),
      forecast([{ reason: 'justShort', intake: 7.26, me: 8.5 }]),
    ],
  };

  it('a herd that is growing gets no warnings: the facts are details, with no "just short" line', () => {
    const lines = mobLines({ ...base, adg: 0.03 });
    expect(lines.why).toEqual([]);
    expect(lines.details).toEqual([
      'Cows is gaining about 0.03 kg a head a day.',
      'The paddock gave the mob 80% of the feed it wanted.',
      'Feed is about 760 kg DM/ha. At this level they get about 69% of what they could eat.',
      'Cows with calves put about 60 MJ a day into milk, on top of about 40 MJ for themselves.',
      'They eat about 7.3 kg DM a head a day of feed at ME 8.5 MJ/kg.',
    ]);
    expect(lines.details.join(' ')).not.toMatch(/just short|not enough feed/);
  });

  it('a mob that is losing weight, or in low condition, gets the reasons as warnings', () => {
    const losing = mobLines({ ...base, adg: -0.2 });
    expect(losing.why[0]).toBe('Cows is losing about 0.20 kg a head a day.');
    expect(losing.why).toContain(
      'Feed is about 760 kg DM/ha. At this level they get about 69% of what they could eat.',
    );
    expect(losing.details).toEqual([]);
    const thin = mobLines({ ...base, adg: 0.1, cs: 2.2 });
    expect(thin.why[0]).toBe('Cows averages condition score 2.2.');
    expect(thin.why[1]).toBe('Cows is gaining about 0.10 kg a head a day.');
    // Holding at -0.04 is not losing.
    expect(mobLines({ ...base, adg: -0.04 }).why).toEqual([]);
  });

  it("the paddock's feed line says it is under the floor in place of 0 days", () => {
    expect(feedText(0, 750)).toBe(`Under ${FEED_FLOOR_KG_HA} kg DM/ha`);
    expect(feedText(12.4, 1500)).toBe('About 12 days');
    expect(feedText(Infinity, 750)).toBeNull();
    // On a real snapshot: every stocked paddock under the floor reads that way, never "0".
    const farm = cloneFarm(farmOf());
    farm.pasture.G.fill(350);
    farm.pasture.D.fill(400);
    const stocked = snap(farm).paddocks.filter((p) => p.head > 0);
    expect(stocked.length).toBeGreaterThan(0);
    for (const p of stocked) expect(p.feedText).toBe('Under 800 kg DM/ha');
  });
});

describe('the year card', () => {
  const year = (gain: number, births: number, n: number): YearRecord => {
    // A farm with no stock runs a whole year in one skip; the figures are then set by hand.
    const farm = farmOf({ startType: 'scratch' });
    const run = skipDays(farm, 'year').farm;
    const y = run.years[0]!;
    return {
      ...y,
      n,
      births,
      gain,
      score: { ...y.score, gainPts: gain * 0.5 },
    };
  };

  it('names a part that moved a lot, both figures, and a cause that is a fact', () => {
    const a = year(24_414, 120, 1);
    const b = year(13_348, 80, 2);
    const lines = changeLines(a, b);
    expect(lines).toContain(
      'Weight gain points: 12,207 last year, 6,674 this year. Births: 120 last year, 80 this year.',
    );
    for (const l of lines) expect(l).not.toMatch(BANNED);
  });

  it('just the figures when the cause is not in the record, and nothing when little moved', () => {
    const a = year(24_414, 100, 1);
    const b = year(13_348, 100, 2);
    const gain = changeLines(a, b).find((l) => l.startsWith('Weight gain'));
    expect(gain).toBe('Weight gain points: 12,207 last year, 6,674 this year.');
    expect(changeLines(a, year(24_000, 100, 2)).find((l) => l.startsWith('Weight gain'))).toBe(
      undefined,
    );
  });
});

describe('setup', () => {
  it("sends each difficulty's starting cash and the bank's limits for every district and size", () => {
    const o = setupOptions();
    for (const d of o.districts) {
      for (const size of d.sizes) {
        expect(size.money.map((m) => m.difficulty)).toEqual(['easy', 'medium', 'hard']);
        for (const m of size.money) {
          const herd = startMoney(d.id, size.ha, m.difficulty, true);
          const scratch = startMoney(d.id, size.ha, m.difficulty, false);
          expect(m).toEqual({
            difficulty: m.difficulty,
            cashRunning: herd.cash,
            cashScratch: scratch.cash,
            lendLimit: herd.overdraft,
            bankLimit: herd.broke,
          });
        }
        // More money and a further limit the easier it is.
        const [easy, , hard] = size.money;
        expect(easy!.cashScratch).toBeGreaterThan(hard!.cashScratch);
        expect(easy!.bankLimit).toBeLessThan(hard!.bankLimit);
      }
    }
    // Numbers only: no formatted dollar strings and no rule.
    expect(JSON.stringify(o)).not.toMatch(/\$/);
  });
});

describe('putting a thing to do away', () => {
  it('through the game server: it goes, stays gone while true, and costs no light', async () => {
    const game = new GameServer({ store: new MemoryFarmStore(), seed: () => 4 });
    let s = await game.create('a'.repeat(32), choices());
    // Skip on until something is listed.
    for (let i = 0; i < 12 && s.todo.length === 0; i++) {
      s = (await game.skip('a'.repeat(32), 'week', true)).snapshot;
    }
    const item = s.todo[0]!;
    expect(item).toBeDefined();
    const before = s.clock.usedMin;
    const r = await game.act('a'.repeat(32), { action: { type: 'dismissTodo', key: item.key } });
    expect(r.ok).toBe(true);
    expect(r.snapshot.todo.map((t) => t.key)).not.toContain(item.key);
    expect(r.snapshot.clock.usedMin).toBe(before);
    // A key that is not on the list is refused with the reason, and nothing changes.
    const no = await game.act('a'.repeat(32), {
      action: { type: 'dismissTodo', key: 'bank:2' },
    });
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.message).toBe('That is not on the list any more.');
  });

  it('the engine key and the wire key are the same', () => {
    const farm = cloneFarm(farmOf());
    farm.cash = -5;
    for (const t of thingsToDo(farm)) expect(todoWire(t).key).toBe(todoKey(t));
    const put = applyAction(farm, { type: 'dismissTodo', key: todoKey(thingsToDo(farm)[0]!) });
    expect(put.ok).toBe(true);
  });
});
