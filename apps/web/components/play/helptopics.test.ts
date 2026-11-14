import { describe, expect, it } from 'vitest';
import { TOUR_FINISHED, TOUR_TEXT } from '@/lib/game/tour';
import { HELP_TERMS, HELP_TOPICS } from './helptopics';

const all = [
  ...HELP_TOPICS.flatMap((t) => [t.title, ...t.lines]),
  ...HELP_TERMS.flatMap((t) => [t.term, t.means]),
];

const tourWords = [...Object.values(TOUR_TEXT).flatMap((t) => [t.title, t.body]), TOUR_FINISHED];
const everyWord = [...all, ...tourWords];

describe('the help topics', () => {
  it('covers every topic the first-time experience asks for', () => {
    expect(HELP_TOPICS.map((t) => t.id)).toEqual([
      'day',
      'move',
      'build',
      'water',
      'market',
      'husbandry',
      'plans',
      'feed',
      'crops',
      'paddock',
    ]);
  });

  it('explains every term', () => {
    expect(HELP_TERMS.map((t) => t.term)).toEqual([
      'AE',
      'DSE',
      'CS',
      'PTIC',
      'ME',
      'CP',
      'kg DM/ha',
    ]);
  });

  it('keeps each topic to a few short lines', () => {
    for (const t of HELP_TOPICS) {
      expect(t.lines.length).toBeGreaterThanOrEqual(3);
      expect(t.lines.length).toBeLessThanOrEqual(6);
      for (const l of t.lines) expect(l.length).toBeLessThan(420);
    }
  });

  it('uses plain writing: no em dashes, and not the retired tool name', () => {
    for (const s of all) {
      expect(s).not.toContain('—');
      expect(s.toLowerCase()).not.toContain('robo');
    }
  });

  it('says there is no preg testing, and does not offer a preg test', () => {
    const husbandry = HELP_TOPICS.find((t) => t.id === 'husbandry')!.lines.join(' ');
    expect(husbandry).toContain('no preg testing');
    expect(husbandry).toContain('PTIC');
  });

  it('never judges or prescribes, in any topic or tour line, and has no dash asides', () => {
    const banned = ['should', 'overgraz', 'well done', 'good job', 'poor management', 'you must'];
    for (const s of everyWord) {
      const lower = s.toLowerCase();
      for (const w of banned) expect(lower, `"${w}" in: ${s}`).not.toContain(w);
      for (const d of [' � ', ' � ', ' - ']) expect(s, `dash aside in: ${s}`).not.toContain(d);
    }
  });

  it('does not mention a preg test as something to do', () => {
    for (const s of everyWord) expect(s.toLowerCase()).not.toContain('preg tested');
  });

  it('describes a paddock label without judging it', () => {
    const text = HELP_TOPICS.find((t) => t.id === 'paddock')!.lines.join(' ');
    for (const label of ['Green', 'Mixed', 'Dry & rank', 'Short']) expect(text).toContain(label);
    expect(text.toLowerCase()).not.toContain('overgrazed');
    expect(text.toLowerCase()).not.toContain('good');
    expect(text.toLowerCase()).not.toContain('bad');
  });
});
