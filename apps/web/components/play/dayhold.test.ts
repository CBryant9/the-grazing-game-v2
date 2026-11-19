import { describe, expect, it } from 'vitest';
import type { GameState } from '@/lib/game/store';
import { holdsDay } from './DayClock';

/* What holds Fast Farm's sun at dusk: the day must not end under the player's hands. */

const base = {
  build: null,
  move: null,
  plan: null,
  sow: null,
  busy: 0,
  jobs: {},
  acts: {},
} as unknown as GameState;
const with_ = (patch: object): GameState => ({ ...base, ...patch }) as GameState;

describe('what holds the day at dusk', () => {
  it('nothing open: the day runs', () => {
    expect(holdsDay(base, {})).toBe(false);
  });

  it('a build card, a move, a plan or squares to sow hold it', () => {
    expect(holdsDay(with_({ build: { phase: 'confirm' } }), {})).toBe(true);
    expect(holdsDay(with_({ build: { phase: 'draw' } }), {})).toBe(true);
    expect(holdsDay(with_({ move: { phase: 'pick' } }), {})).toBe(true);
    expect(holdsDay(with_({ plan: { phase: 'edit' } }), {})).toBe(true);
    expect(holdsDay(with_({ sow: { picking: true } }), {})).toBe(true);
  });

  it('a result that is only being read does not', () => {
    expect(holdsDay(with_({ build: { phase: 'done' } }), {})).toBe(false);
    expect(holdsDay(with_({ move: { phase: 'done' } }), {})).toBe(false);
    expect(holdsDay(with_({ jobs: { a: { phase: 'done' } } }), {})).toBe(false);
  });

  it('a job, buy or sell card mid-confirm holds it', () => {
    expect(holdsDay(with_({ jobs: { a: { phase: 'confirm' } } }), {})).toBe(true);
    expect(holdsDay(with_({ acts: { 'market:buy': { phase: 'previewing' } } }), {})).toBe(true);
    expect(holdsDay(with_({ acts: { 'market:sell': { phase: 'applying' } } }), {})).toBe(true);
  });

  it('a confirm a panel keeps itself, and a request under way, hold it', () => {
    expect(holdsDay(base, { 'more:new-farm': true })).toBe(true);
    expect(holdsDay(with_({ busy: 1 }), {})).toBe(true);
    // The words on screen leave the requests out (the day's own request is one).
    expect(holdsDay(with_({ busy: 1 }), {}, false)).toBe(false);
  });
});
