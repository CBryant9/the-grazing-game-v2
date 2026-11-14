import { describe, expect, it } from 'vitest';
import {
  draftAction,
  draftFromPlan,
  draftProblem,
  mapBadges,
  moveStop,
  newDraft,
  toggleStop,
  triggerOf,
} from './plans';
import type { PaddockWire, PlanFormWire, PlanWire } from './types';

const form: PlanFormWire = {
  defaultEvery: 3,
  defaultKg: 1500,
  defaultRounds: 1,
  everyMax: 60,
  kgMin: 300,
  kgMax: 5000,
  maxDaysMax: 365,
  roundsMax: 99,
  maxStops: 30,
  timesADayMax: 4,
};

const paddocks = [
  { id: 1, cell: 101 },
  { id: 2, cell: 202 },
  { id: 3, cell: 303 },
] as PaddockWire[];

describe('the plan form', () => {
  it('starts with the server defaults and nothing picked', () => {
    const d = newDraft(form, 4);
    expect(d).toMatchObject({ mobId: 4, stops: [], kind: 'days', every: 3, kg: 1500, rounds: 1 });
    expect(draftProblem(d, form)).toBe('Pick at least one paddock.');
    expect(draftProblem(newDraft(form), form)).toBe('Pick the mob first.');
  });

  it('adds paddocks in order, takes one out when tapped again, and reorders', () => {
    let s = toggleStop([], 2);
    s = toggleStop(s, 1);
    s = toggleStop(s, 3);
    expect(s).toEqual([2, 1, 3]);
    expect(toggleStop(s, 1)).toEqual([2, 3]);
    expect(moveStop(s, 0, 1)).toEqual([1, 2, 3]);
    expect(moveStop(s, 0, -1)).toEqual([2, 1, 3]);
    expect(moveStop(s, 2, 1)).toEqual([2, 1, 3]);
  });

  it('makes the job a rotation of three paddocks, every 3 days, keep going', () => {
    const d = { ...newDraft(form, 4), stops: [1, 2, 3] };
    expect(draftAction(d, paddocks, form)).toEqual({
      type: 'setPlan',
      mob: 4,
      stops: [101, 202, 303],
      trigger: { mode: 'days', every: 3 },
      rounds: 0,
      after: 'repeat',
      step: 0,
    });
  });

  it('makes a feed rule with a day limit, a number of rounds, and a start step', () => {
    const d = {
      ...newDraft(form, 4),
      stops: [3, 1],
      kind: 'kg' as const,
      kg: 1800,
      maxDays: 14,
      keepGoing: false,
      rounds: 2,
      after: 'stay' as const,
      step: 1,
      planId: 5,
    };
    expect(draftAction(d, paddocks, form)).toEqual({
      type: 'setPlan',
      mob: 4,
      stops: [303, 101],
      trigger: { mode: 'kg', kg: 1800, maxDays: 14 },
      rounds: 2,
      after: 'stay',
      step: 1,
      planId: 5,
    });
  });

  it('times a day turns into a fraction of a day, and needs two paddocks', () => {
    const d = { ...newDraft(form, 4), stops: [1], kind: 'times' as const, times: 4 };
    expect(triggerOf(d)).toEqual({ mode: 'days', every: 0.25 });
    expect(draftProblem(d, form)).toMatch(/at least two paddocks/);
    expect(draftAction(d, paddocks, form)).toBeNull();
    expect(draftProblem({ ...d, stops: [1, 2] }, form)).toBeNull();
  });

  it('says what is wrong with a figure out of range', () => {
    const base = { ...newDraft(form, 4), stops: [1, 2] };
    expect(draftProblem({ ...base, every: 0 }, form)).toMatch(/every 1 to 60 days/);
    expect(draftProblem({ ...base, kind: 'kg', kg: 100 }, form)).toMatch(/300 to 5000 kg DM\/ha/);
    expect(draftProblem({ ...base, kind: 'kg', maxDays: 1.5 }, form)).toMatch(/day limit/);
    expect(draftProblem({ ...base, keepGoing: false, rounds: 0 }, form)).toMatch(
      /Rounds are 1 to 99/,
    );
  });

  it('fills the form from a plan that is running, so it can be changed', () => {
    const plan = {
      id: 5,
      name: 'Plan 5',
      legs: [
        {
          stops: [
            { cell: 101, paddock: 1, name: 'Paddock 1', hasWater: true },
            { cell: 202, paddock: 2, name: 'Paddock 2', hasWater: true },
          ],
          trigger: { mode: 'kg', kg: 1200, maxDays: 10 },
          ruleText: '',
          rounds: 3,
          roundsText: '',
        },
      ],
      after: 'stay',
      afterText: '',
      editable: true,
      mobs: [{ mob: 4, step: 1 }],
    } as unknown as PlanWire;
    const d = draftFromPlan(form, plan, 4, paddocks);
    expect(d).toMatchObject({
      planId: 5,
      stops: [1, 2],
      kind: 'kg',
      kg: 1200,
      maxDays: 10,
      rounds: 3,
      keepGoing: false,
      after: 'stay',
      step: 1,
    });
  });

  it('numbers the paddocks on the map in the order picked', () => {
    expect(mapBadges(null, paddocks)).toEqual([]);
    const d = { ...newDraft(form, 4), stops: [3, 1] };
    expect(mapBadges(d, paddocks)).toEqual([
      { cell: 303, text: '1' },
      { cell: 101, text: '2' },
    ]);
  });
});
