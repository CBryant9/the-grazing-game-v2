import { describe, expect, it } from 'vitest';
import type { PlanNext } from '@gg/engine';
import type { SetupChoices, SimpleAction, Snapshot } from '../../lib/game/types';
import { GameServer } from './game';
import { parsePlanAction } from './plans';
import {
  afterText,
  movedText,
  nextText,
  pausedText,
  roundText,
  roundsText,
  ruleText,
  stepText,
  waitingText,
} from './planwords';
import { MemoryFarmStore } from './store';

const A = 'a'.repeat(32);
const BANNED = /\bshould\b|\bmust\b|overgraz|\bbad\b|\bgood\b|—|–/i;

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

describe('the words for a plan', () => {
  it('says the rule in plain words', () => {
    expect(ruleText({ mode: 'days', every: 3 })).toBe('Move every 3 days.');
    expect(ruleText({ mode: 'days', every: 1 })).toBe('Move every day.');
    expect(ruleText({ mode: 'days', every: 0.5 })).toBe('Move 2 times a day.');
    expect(ruleText({ mode: 'days', every: 1 / 3 })).toBe('Move 3 times a day.');
    expect(ruleText({ mode: 'kg', kg: 1500, maxDays: 14 })).toBe(
      'Move when feed is down to 1,500 kg DM/ha, or after 14 days.',
    );
    expect(ruleText({ mode: 'kg', kg: 1500, maxDays: 0 })).toBe(
      'Move when feed is down to 1,500 kg DM/ha.',
    );
  });

  it('says the rounds, what follows, and where a mob is on its plan', () => {
    expect(roundsText(0)).toBe('Keeps going');
    expect(roundsText(1)).toBe('1 round');
    expect(roundsText(3)).toBe('3 rounds');
    expect(afterText('repeat')).toMatch(/starts again/);
    expect(afterText('stay')).toMatch(/stays where it is/);
    expect(roundText(0, 3)).toBe('Round 1 of 3');
    expect(roundText(2, 0)).toBe('Round 3, keeps going');
    expect(stepText(1, 3, 'Paddock 2')).toBe('Step 2 of 3: Paddock 2');
  });

  it('says why a plan is paused, and why it waits', () => {
    expect(pausedText('manual-move', false)).toMatch(/moved by hand/);
    expect(pausedText(null, true)).toMatch(/moved by hand/);
    expect(pausedText('asked', false)).toBe('Paused. The plan does nothing until it is resumed.');
    expect(waitingText('Paddock 4')).toBe(
      'The plan can not move the mob into Paddock 4, because that area has no water. It tries again each day.',
    );
  });

  it('says what the plan will do next', () => {
    const move = (over: Partial<Extract<PlanNext, { kind: 'move' }>>): PlanNext => ({
      kind: 'move',
      area: 'Paddock 2',
      cell: 5,
      rule: 'days',
      onDay: 10,
      kg: null,
      massKgHa: null,
      latestDay: null,
      movesADay: 1,
      ...over,
    });
    expect(nextText({ kind: 'paused' }, 10)).toBe('Nothing, while it is paused.');
    expect(nextText({ kind: 'finish' }, 10)).toMatch(/ends the plan/);
    expect(nextText({ kind: 'waiting', why: 'no-water', area: 'Paddock 3', cell: 9 }, 10)).toBe(
      'Move into Paddock 3 once it has water.',
    );
    expect(nextText(move({ onDay: 10 }), 10)).toBe('Moves into Paddock 2 when the day ends.');
    expect(nextText(move({ onDay: 12 }), 10)).toBe('Moves into Paddock 2 after 2 more days here.');
    expect(nextText(move({ onDay: 11 }), 10)).toBe('Moves into Paddock 2 after 1 more day here.');
    expect(nextText(move({ movesADay: 3 }), 10)).toBe('Moves 3 times a day, next into Paddock 2.');
    expect(
      nextText(move({ rule: 'kg', onDay: null, kg: 1500, massKgHa: 2134, latestDay: 15 }), 10),
    ).toBe(
      'Moves into Paddock 2 when feed here is down to 1,500 kg DM/ha. Feed here is 2,130 kg DM/ha now. It moves within 5 days at the latest.',
    );
  });

  it('says where a plan moved a mob, and says no praise or blame', () => {
    const base = {
      mobName: 'Steers A',
      from: 'Paddock 1',
      to: 'Paddock 2',
      massKgHa: null,
      movesADay: 1,
    };
    expect(movedText({ ...base, because: 'days' })).toBe(
      'Steers A moved from Paddock 1 to Paddock 2, by its grazing plan.',
    );
    expect(movedText({ ...base, because: 'kg', massKgHa: 1512 })).toContain(
      'Feed there was down to 1,510 kg DM/ha.',
    );
    expect(movedText({ ...base, because: 'max-days' })).toContain('day limit');
    for (const s of [
      ruleText({ mode: 'kg', kg: 1500, maxDays: 7 }),
      movedText({ ...base, because: 'kg', massKgHa: 1500 }),
      afterText('repeat'),
    ]) {
      expect(s).not.toMatch(BANNED);
    }
  });
});

describe('checking a plan request', () => {
  const ok = {
    type: 'setPlan',
    mob: 2,
    stops: [10, 20, 30],
    trigger: { mode: 'days', every: 3 },
    rounds: 0,
    after: 'repeat',
    step: 0,
  };

  it('takes a good plan, and a resume', () => {
    expect(parsePlanAction(ok)).toEqual({
      type: 'setPlan',
      mob: 2,
      plan: {
        legs: [{ stops: [10, 20, 30], rule: { mode: 'days', every: 3 }, rounds: 0 }],
        after: 'repeat',
      },
      step: 0,
    });
    expect(parsePlanAction({ type: 'resumePlan', mob: 2 })).toEqual({ type: 'resumePlan', mob: 2 });
    expect(parsePlanAction({ type: 'resumePlan', mob: 2, step: 3 })).toEqual({
      type: 'resumePlan',
      mob: 2,
      step: 3,
    });
    expect(parsePlanAction({ ...ok, planId: 4 })).toMatchObject({ plan: { id: 4 } });
  });

  it('turns away anything the form could not make', () => {
    for (const bad of [
      { ...ok, mob: 0 },
      { ...ok, mob: 1.5 },
      { ...ok, stops: [] },
      { ...ok, stops: Array.from({ length: 31 }, (_, i) => i) },
      { ...ok, stops: [10, 1.5] },
      { ...ok, stops: [10, 5000] },
      { ...ok, stops: 'x' },
      { ...ok, trigger: { mode: 'days', every: 0.1 } },
      { ...ok, trigger: { mode: 'days', every: 61 } },
      { ...ok, trigger: { mode: 'days', every: NaN } },
      { ...ok, trigger: { mode: 'kg', kg: 100, maxDays: 0 } },
      { ...ok, trigger: { mode: 'kg', kg: 1500, maxDays: -1 } },
      { ...ok, trigger: { mode: 'kg', kg: 1500, maxDays: 1.5 } },
      { ...ok, trigger: { mode: 'weekly' } },
      { ...ok, trigger: null },
      { ...ok, rounds: -1 },
      { ...ok, rounds: 100 },
      { ...ok, after: 'forever' },
      { ...ok, step: 3 },
      { ...ok, step: -1 },
      { ...ok, planId: 0 },
      { type: 'resumePlan', mob: 2, step: -1 },
      { type: 'resumePlan', mob: 'x' },
      { type: 'pausePlan', mob: 2 },
    ]) {
      expect(parsePlanAction(bad as Record<string, unknown>)).toBeNull();
    }
  });
});

/** Paddocks with water, in the order the snapshot lists them. */
const wet = (s: Snapshot) => s.paddocks.filter((p) => p.water !== 'none');

describe('a plan on a running farm', () => {
  it('makes a rotation, moves by itself, pauses and resumes', async () => {
    const game = server();
    const start = await game.create(A, choices());
    expect(start.plans).toEqual([]);
    expect(start.planForm.defaultEvery).toBe(3);
    const pads = wet(start);
    expect(pads.length).toBeGreaterThanOrEqual(2);
    // Put the farm's two mobs together, so a plan moves one mob between two empty paddocks.
    const [m1, m2] = start.mobs.filter((m) => m.where === 'paddock');
    const joined = await game.act(A, {
      action: {
        type: 'moveMob',
        mob: m2!.id,
        cell: pads.find((p) => p.mobs.includes(m1!.id))!.cell,
      },
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const first = joined.snapshot;
    const mob = first.mobs.find((m) => m.where === 'paddock')!;
    expect(first.mobs.filter((m) => m.where === 'paddock')).toHaveLength(1);
    const three = pads.slice(0, 2);
    const action: SimpleAction = {
      type: 'setPlan',
      mob: mob.id,
      stops: three.map((p) => p.cell),
      trigger: { mode: 'days', every: 1 },
      rounds: 0,
      after: 'repeat',
      step: 0,
    };

    // The card says the move it makes now, that it takes none of the day, and the rule.
    const p = await game.preview(A, { action });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const lines = [...(p.card.summary ?? []), ...p.card.notes].join(' ');
    expect(lines).toMatch(new RegExp(`${mob.name} (moves into|is already in) ${three[0]!.name}`));
    expect(lines).toContain('Setting a plan takes none of the day.');
    expect(lines).toContain('Move every day.');
    expect(lines).toContain('Keeps going');

    const done = await game.act(A, { action });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.message).toMatch(/is on the plan Plan 1/);
    const plan = done.snapshot.plans[0]!;
    expect(plan.name).toBe('Plan 1');
    expect(plan.legs[0]!.stops.map((s) => s.name)).toEqual(three.map((x) => x.name));
    expect(plan.legs[0]!.ruleText).toBe('Move every day.');
    expect(plan.editable).toBe(true);
    const onIt = plan.mobs[0]!;
    expect(onIt.mobName).toBe(mob.name);
    expect(onIt.stepText).toBe(`Step 1 of 2: ${three[0]!.name}`);
    expect(onIt.paused).toBe(false);
    expect(onIt.nextText).toMatch(/Moves into/);
    expect(onIt.area).toBe(three[0]!.name.replace(/^/, ''));

    // The day card says the plan moved the mob.
    const day = await game.endDay(A);
    expect(day.summary.planMoves.length).toBe(1);
    expect(day.summary.planMoves[0]).toBe(
      `${mob.name} moved from ${three[0]!.name} to ${three[1]!.name}, by its grazing plan.`,
    );
    const after = day.snapshot.plans[0]!.mobs[0]!;
    expect(after.area).toBe(three[1]!.name);
    expect(after.moves).toBe(1);
    expect(after.stepText).toBe(`Step 2 of 2: ${three[1]!.name}`);
    expect(day.snapshot.inbox.some((m) => m.kind === 'plan' && /moved from/.test(m.text))).toBe(
      true,
    );

    // A week with the plan running says how many times, not seven lines.
    const week = await game.skip(A, 'week');
    expect(week.summary.planMoves).toHaveLength(1);
    expect(week.summary.planMoves[0]).toMatch(
      new RegExp(`${mob.name} moved \\d+ times by its grazing plan`),
    );
    expect(week.snapshot.plans[0]!.mobs[0]!.report.join(' ')).toMatch(
      /moves? and \d+ full rounds? in \d+ days/,
    );

    // Pause it.
    const pause = await game.act(A, { action: { type: 'pausePlan', mob: mob.id } });
    expect(pause.ok).toBe(true);
    if (!pause.ok) return;
    const paused = pause.snapshot.plans[0]!.mobs[0]!;
    expect(paused.paused).toBe(true);
    expect(paused.pausedText).toBe('Paused. The plan does nothing until it is resumed.');
    const still = (await game.endDay(A)).summary.planMoves;
    expect(still).toEqual([]);

    // Resume from step 2 (the second paddock).
    const resume: SimpleAction = { type: 'resumePlan', mob: mob.id, step: 1 };
    const rp = await game.preview(A, { action: resume });
    expect(rp.ok).toBe(true);
    if (rp.ok) expect(rp.card.summary!.join(' ')).toContain(`${three[1]!.name}`);
    const rd = await game.act(A, { action: resume });
    expect(rd.ok).toBe(true);
    if (!rd.ok) return;
    expect(rd.snapshot.plans[0]!.mobs[0]!.paused).toBe(false);
    expect(rd.snapshot.plans[0]!.mobs[0]!.stepText).toBe(`Step 2 of 2: ${three[1]!.name}`);

    // Clear it: the template stays, the mob is off it.
    const clear = await game.act(A, { action: { type: 'clearPlan', mob: mob.id } });
    expect(clear.ok).toBe(true);
    if (clear.ok) {
      expect(clear.snapshot.plans[0]!.mobs).toEqual([]);
      expect(clear.message).toBe('The mob is off its plan.');
    }
  }, 120_000);

  it('warns of a stop with no water and a stop that holds another mob', async () => {
    const game = server();
    const first = await game.create(A, choices());
    const mobs = first.mobs.filter((m) => m.where === 'paddock');
    expect(mobs.length).toBeGreaterThanOrEqual(2);
    const [a, b] = mobs as [(typeof mobs)[0], (typeof mobs)[0]];
    const bPaddock = first.paddocks.find((p) => p.mobs.includes(b.id))!;
    const others = wet(first).filter((p) => p.id !== bPaddock.id);
    const p = await game.preview(A, {
      action: {
        type: 'setPlan',
        mob: a.id,
        stops: [others[0]!.cell, bPaddock.cell],
        trigger: { mode: 'days', every: 2 },
        rounds: 0,
        after: 'repeat',
        step: 0,
      },
    });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.card.notes).toContain(
      `${b.name} (${b.head} head) is in ${bPaddock.name}. The two mobs will join when the plan gets there.`,
    );
    const dry = first.paddocks.find((x) => x.water === 'none');
    if (dry) {
      const d = await game.preview(A, {
        action: {
          type: 'setPlan',
          mob: a.id,
          stops: [others[0]!.cell, dry.cell],
          trigger: { mode: 'days', every: 2 },
          rounds: 0,
          after: 'repeat',
          step: 0,
        },
      });
      if (d.ok) {
        expect(d.card.notes).toContain(
          `${dry.name} has no water. The plan waits there until it has water.`,
        );
      }
    }
  }, 60_000);

  it('refuses a plan the engine will not make, in plain words', async () => {
    const game = server();
    const first = await game.create(A, choices());
    const mob = first.mobs[0]!;
    const r = await game.preview(A, {
      action: {
        type: 'setPlan',
        mob: mob.id,
        stops: [wet(first)[0]!.cell],
        trigger: { mode: 'days', every: 0.5 },
        rounds: 0,
        after: 'repeat',
        step: 0,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/several times a day needs at least two paddocks/);
  }, 60_000);
});
