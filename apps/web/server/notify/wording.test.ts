import { describe, expect, it } from 'vitest';
import { KIND_INFO, NOTIFY_KINDS } from '../../lib/notify/kinds';
import { describeEvent, plain, wordingProblems, type NotifyEvent } from './wording';

/** One of every event, with ordinary and awkward values, so the scan covers every line we can make. */
const SAMPLES: NotifyEvent[] = [
  { type: 'morning_reminder', farm: 'Kooringa', toCheck: 3 },
  { type: 'morning_reminder', farm: 'Kooringa', toCheck: 1 },
  { type: 'morning_reminder', farm: 'Kooringa', toCheck: 0 },
  { type: 'morning_reminder', farm: 'Kooringa', toCheck: null },
  { type: 'later_nudge', farm: 'Kooringa', toCheck: 3 },
  { type: 'later_nudge', farm: 'Kooringa', toCheck: null },
  { type: 'trough_low', farm: 'Wattle Flat', paddock: 'Home paddock' },
  { type: 'trough_empty', farm: 'Wattle Flat', paddock: 'Creek' },
  { type: 'no_water', farm: 'Wattle Flat', mob: 'Weaners', days: 1 },
  { type: 'no_water', farm: 'Wattle Flat', mob: 'Weaners', days: 3 },
  { type: 'feed_low', farm: 'Wattle Flat', mob: 'Cows', days: 2 },
  { type: 'through_tape', farm: 'Wattle Flat', mob: 'Steers' },
  { type: 'calving_started', farm: 'Wattle Flat', mob: 'Heifers' },
  { type: 'deaths', farm: 'Wattle Flat', mob: 'Steers', count: 2, cause: 'no water' },
  { type: 'rain', farm: 'Wattle Flat', mm: 12 },
  { type: 'rain', farm: 'Wattle Flat', mm: 0.4 },
  { type: 'evening_no_water', farm: 'Wattle Flat', mob: 'Weaners' },
  { type: 'evening_feed_low', farm: 'Wattle Flat', mob: 'Cows', days: 2 },
  { type: 'new_follower', name: 'bluey_88' },
  { type: 'new_comment', name: 'bluey_88' },
  { type: 'likes', count: 1, name: 'bluey_88' },
  { type: 'likes', count: 7, name: null },
  { type: 'group_invite', name: 'bluey_88', group: 'Western Vic graziers' },
  { type: 'challenge_started', challenge: 'Spring rain challenge' },
  { type: 'challenge_finished', challenge: 'Spring rain challenge' },
  { type: 'league_started', league: 'Summer league' },
  { type: 'league_finished', league: 'Summer league' },
  { type: 'purchase_confirmed', product: 'Farm pack' },
  { type: 'purchase_refunded', product: 'Farm pack' },
  { type: 'community_opened' },
];

describe('Wording never nags', () => {
  it('no notification text has guilt, pressure, streaks, countdowns, praise, money or an exclamation mark', () => {
    for (const e of SAMPLES) {
      const d = describeEvent(e);
      for (const text of [d.title, d.body ?? '']) {
        expect(wordingProblems(text), `${e.type}: ${text}`).toEqual([]);
        expect(text, `${e.type}: ${text}`).not.toContain('!');
        expect(text, `${e.type}: ${text}`).not.toMatch(/\bstreak\b|\d+[- ]day streak/i);
        expect(text, `${e.type}`).not.toContain('—');
      }
      expect(d.title.length).toBeLessThanOrEqual(120);
    }
  });

  it('is the PRD morning line, and states a fact for the rest', () => {
    expect(describeEvent({ type: 'morning_reminder', farm: 'Kooringa', toCheck: 3 }).title).toBe(
      'First light at Kooringa. 3 things to check.',
    );
    expect(describeEvent({ type: 'rain', farm: 'Wattle Flat', mm: 12 }).title).toBe(
      'Rain overnight at Wattle Flat: 12 mm.',
    );
  });

  it('catches the kinds of line it exists to stop', () => {
    for (const bad of [
      "Don't forget your cattle!",
      'You missed yesterday',
      'Keep your 5 day streak going',
      'Great job, well done',
      'Only 2 hours left',
      'Your farm needs you',
      'Hurry, last chance',
      'You should open the farm',
      'Balance is $1,200',
      'Why did you leave? Come back',
    ]) {
      expect(wordingProblems(bad).length, bad).toBeGreaterThan(0);
    }
  });

  it('cleans what players wrote: one line, no control characters, cut to length', () => {
    expect(plain('A\nB\tC')).toBe('A B C');
    expect(plain('x'.repeat(100), 10).length).toBeLessThanOrEqual(10);
  });

  it('has every kind described, and the kinds that are community types are marked', () => {
    for (const k of NOTIFY_KINDS) expect(KIND_INFO[k].label.length).toBeGreaterThan(0);
    expect(NOTIFY_KINDS.filter((k) => KIND_INFO[k].community)).toEqual(['social']);
    for (const k of NOTIFY_KINDS) expect(KIND_INFO[k].email, k).toBe(false);
    expect(KIND_INFO.morning_reminder.push).toBe(false);
  });
});
