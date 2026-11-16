import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FarmPicker } from './FarmPicker';

// The picker reads the game store. Here the store is a plain object the test sets.
const state = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@/lib/game/store', () => ({
  useGame: (select: (s: Record<string, unknown>) => unknown) => select(state.current),
}));

const farm = (id: string, name: string, current = false) => ({
  id,
  name,
  mode: 'fast' as const,
  date: null,
  work: null,
  districtName: 'Western Victoria',
  day: 41,
  lastPlayed: Date.UTC(2026, 10, 3),
  current,
});

const html = (farms: ReturnType<typeof farm>[], farmLimit: number): string => {
  state.current = {
    farms,
    farmLimit,
    dailyLimit: 0,
    busy: 0,
    openFarm: () => undefined,
    deleteFarm: () => undefined,
    startAnother: () => undefined,
  };
  return renderToStaticMarkup(createElement(FarmPicker));
};

describe('the farm picker', () => {
  it('lists each farm with its name, district, day and when it was last played, and Open and Delete', () => {
    const out = html([farm('a'.repeat(32), 'Home Block'), farm('b'.repeat(32), 'Hill Run')], 2);
    expect(out).toContain('Home Block');
    expect(out).toContain('Hill Run');
    expect(out).toContain('Western Victoria');
    expect(out).toContain('Day 42');
    expect(out).toMatch(/Last played 3 Nov 2026/);
    expect(out.match(/>Open</g)).toHaveLength(2);
    expect(out.match(/>Delete</g)).toHaveLength(2);
  });

  it('with no room, says so and offers no new farm; with room it offers one', () => {
    const full = html([farm('a'.repeat(32), 'One'), farm('b'.repeat(32), 'Two')], 2);
    expect(full).toMatch(/most farms this account can have \(2\)/);
    expect(full).not.toContain('Start a new farm');
    expect(html([farm('a'.repeat(32), 'One')], 2)).toContain('Start a new farm');
  });
});
