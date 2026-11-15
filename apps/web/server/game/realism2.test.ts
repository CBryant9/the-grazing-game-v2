import { describe, expect, it } from 'vitest';
import {
  areaIdOf,
  createFarm,
  endDay,
  surveyOf,
  thingsToDo,
  type FarmState,
  type ThingToDo,
} from '@gg/engine';
import type { SetupChoices } from '../../lib/game/types';
import { inboxMessage } from './inboxwords';
import { buildSnapshot } from './snapshot';
import { todoWire } from './words';

/*
 * The realism fixes after the review of the stock book pass (engine 0.22.0), as the player reads
 * them: the paddock comment on a mob's first day, stock at sale weight, the weekly calving lines
 * and a low condition item with its gain. Facts only: no advice, praise or blame.
 */

const BANNED = /\bshould\b|\bmust\b|overgraz|\bbad\b|\bgood\b|—|–/i;
const dateOf = () => ({ year: 2026, month: 8, date: 2 });

const choices = (): SetupChoices => ({
  district: 'cw',
  size: 'medium',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'X',
});

const running = (): FarmState =>
  createFarm({
    seed: 7,
    district: 'cw',
    size: 'medium',
    start: { year: 2026, month: 2 },
    startType: 'running',
    difficulty: 'medium',
  });

const snap = (farm: FarmState) =>
  buildSnapshot(farm, { name: 'X', setup: choices(), version: 'v' }, {});

describe("the paddock comment on a mob's first day in a paddock", () => {
  it('says only the standing feed until the mob has grazed there a day', () => {
    let farm = running();
    for (let i = 0; i < 5; i++) farm = endDay(farm).farm;
    const survey = surveyOf(farm);
    const m = farm.mobs.find((x) => x.where.kind === 'paddock' && x.st)!;
    const area = survey.topology.areas[areaIdOf(survey, m)]!;
    const before = snap(farm).paddocks.find((p) => p.mobs.includes(m.id))!;
    // Grazing there for days: the comment speaks for what they eat.
    expect(before.comment ?? '').toMatch(/eat|growing away|grows/i);
    // The same mob, just moved into this paddock: no stock were on it last night.
    for (const c of area.cells) farm.stockedOn![c] = farm.day - 20;
    const first = snap(farm).paddocks.find((p) => p.mobs.includes(m.id))!.comment ?? '';
    // Its last day was somewhere else: nothing about what they eat or pick.
    expect(first).not.toMatch(/eat|impact|picking|growing away|grows/i);
    // After a night there, the comment can speak for what they ate.
    const next = endDay(farm).farm;
    const after = snap(next).paddocks.find((p) => p.mobs.includes(m.id))!;
    expect(after.comment ?? '').toMatch(/eat|growing away|grows/i);
  }, 120_000);
});

describe('Things to do words', () => {
  it('stock at sale weight names the head, the class with its weights and the next sale', () => {
    const t = {
      type: 'sale-weight',
      cls: 'feed',
      saleDay: 12,
      date: { year: 2026, month: 10, date: 20 },
      daysAway: 3,
      count: 30,
      does: null,
      action: null,
    } as ThingToDo;
    const w = todoWire(t);
    expect(w.key).toBe('sale-weight:feed');
    expect(w.text).toMatch(
      /^30 yearling steers \(\d+ to \d+ kg\) are at sale weight and not booked\. The next cattle sale is on 20 Nov 2026, in 3 days\.$/,
    );
    expect(w.text).not.toMatch(BANNED);
    // No date known: the stock fact alone.
    expect(todoWire({ ...t, saleDay: null, date: null, daysAway: null } as ThingToDo).text).toMatch(
      /are at sale weight and not booked\.$/,
    );
  });

  it('a mob in low condition says its score and what it gains or loses a day', () => {
    let farm = running();
    farm = endDay(farm).farm;
    const m = farm.mobs.find((x) => x.st && x.animals.some((a) => a.kind !== 'calf'))!;
    for (const a of m.animals) if (a.kind !== 'calf') a.cond = 2.2;
    m.st = { ...m.st!, cs: 2.2, adg: 0.31 };
    const item = thingsToDo(farm).find((t) => t.type === 'low-condition' && t.mob === m.id)!;
    expect(todoWire(item).text).toContain('averages condition score 2.2');
    expect(todoWire(item).text).toContain(`${m.name} is gaining about 0.31 kg a head a day.`);
  }, 120_000);
});

describe('the inbox through a calving', () => {
  it('a weekly line with the week and the drop so far, and one when calving has finished', () => {
    const week = inboxMessage(
      { type: 'calving-week', mob: 1, mobName: 'Mob 1', born: 12, total: 30 },
      dateOf,
    )!;
    expect(week.text).toBe(
      'Mob 1: 12 calves born in the past week. 30 calves born in this drop so far.',
    );
    const done = inboxMessage(
      { type: 'calving-finished', mob: 1, mobName: 'Mob 1', total: 84 },
      dateOf,
    )!;
    expect(done.text).toBe('Calving has finished in Mob 1: 84 calves born in this drop.');
    for (const t of [week.text, done.text]) expect(t).not.toMatch(BANNED);
  });
});
