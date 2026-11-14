import { describe, expect, it } from 'vitest';
import { badgeText, kindName, newestSeq, setupFacts, unreadSeqs, unreadWord } from './more';
import type { InboxWire, SetupSummary } from './types';

const setup: SetupSummary = {
  districtName: 'Central West NSW',
  town: 'Dubbo',
  state: 'NSW',
  size: 'medium',
  farmHa: 812.4,
  enterprise: 'mixed',
  arablePct: 39.6,
  years: 'real-in-order',
  startType: 'running',
  difficulty: 'medium',
};

const msg = (seq: number, unread: boolean): InboxWire => ({
  seq,
  day: seq,
  date: { year: 2024, month: 8, date: 1 },
  time: null,
  kind: 'cattle',
  text: 'x',
  unread,
});

describe('the farm facts', () => {
  it('say the setup in words', () => {
    expect(setupFacts(setup)).toEqual([
      { label: 'District', value: 'Central West NSW, around Dubbo, NSW' },
      { label: 'Size', value: 'Medium, 812 ha' },
      { label: 'Enterprise', value: 'Cattle and crops, 40% arable' },
      { label: 'Seasons', value: 'Real years, in order' },
      { label: 'Start', value: 'A running farm' },
      { label: 'Difficulty', value: 'Medium' },
    ]);
    const g = setupFacts({
      ...setup,
      enterprise: 'grazing',
      years: 'random',
      startType: 'scratch',
    });
    expect(g[2]!.value).toBe('Cattle grazing');
    expect(g[3]!.value).toBe('Random seasons');
    expect(g[4]!.value).toBe('From scratch');
  });
});

describe('the inbox helpers', () => {
  it('names each kind of message', () => {
    expect(kindName('sale')).toBe('Market');
    expect(kindName('plan')).toBe('Plan');
  });

  it('finds the unread ones and the newest', () => {
    const list = [msg(9, true), msg(8, true), msg(7, false)];
    expect([...unreadSeqs(list)]).toEqual([9, 8]);
    expect(newestSeq(list)).toBe(9);
    expect(newestSeq([])).toBe(0);
  });

  it('words the count for the tab', () => {
    expect(unreadWord(0)).toBe('');
    expect(unreadWord(1)).toBe('1 unread message');
    expect(unreadWord(1500)).toBe('1,500 unread messages');
    expect(badgeText(7)).toBe('7');
    expect(badgeText(100)).toBe('99+');
  });
});
