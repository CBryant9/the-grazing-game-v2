import { describe, expect, it } from 'vitest';
import { changeText, chartGeometry, chartSummary } from './marketchart';
import type { PriceChartWire } from './types';

const box = { width: 320, height: 160, left: 34, right: 40, top: 8, bottom: 22 };

const chart: PriceChartWire = {
  from: { year: 2024, month: 1, date: 10 },
  to: { year: 2024, month: 2, date: 11 },
  classes: [
    { id: 'wean', label: 'Weaner steers', points: [400, 410, 420, 430] },
    { id: 'cow', label: 'Cows', points: [300, 300, 290, 280] },
    { id: 'bull', label: 'Bulls', points: [] },
  ],
};

describe('the price chart geometry', () => {
  it('draws only the classes shown that have prices, inside the box', () => {
    const g = chartGeometry(chart, ['wean', 'cow', 'bull'], box);
    expect(g.lines.map((l) => l.id)).toEqual(['wean', 'cow']);
    for (const l of g.lines) {
      for (const m of l.d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)) {
        expect(Number(m[1])).toBeGreaterThanOrEqual(box.left);
        expect(Number(m[1])).toBeLessThanOrEqual(box.width - box.right);
        expect(Number(m[2])).toBeGreaterThanOrEqual(box.top);
        expect(Number(m[2])).toBeLessThanOrEqual(box.height - box.bottom);
      }
    }
  });

  it('puts a higher price higher up the box and the scale round the figures', () => {
    const g = chartGeometry(chart, ['wean', 'cow'], box);
    const wean = g.lines.find((l) => l.id === 'wean')!;
    const cow = g.lines.find((l) => l.id === 'cow')!;
    expect(wean.end!.y).toBeLessThan(cow.end!.y);
    expect(g.min).toBeLessThanOrEqual(280);
    expect(g.max).toBeGreaterThanOrEqual(430);
    expect(g.min % 10).toBe(0);
    expect(g.ticks.length).toBeGreaterThanOrEqual(2);
    // Later days sit to the right.
    expect(wean.end!.x).toBe(box.width - box.right);
  });

  it('a single day is a dot, and a flat line still has a scale', () => {
    const one: PriceChartWire = {
      from: null,
      to: null,
      classes: [{ id: 'wean', label: 'Weaner steers', points: [432] }],
    };
    const g = chartGeometry(one, ['wean'], box);
    expect(g.lines[0]!.single).toBe(true);
    expect(g.lines[0]!.d).toBe('');
    expect(g.max).toBeGreaterThan(g.min);
    const flat = chartGeometry(
      { ...one, classes: [{ id: 'wean', label: 'W', points: [300, 300, 300] }] },
      ['wean'],
      box,
    );
    expect(flat.max).toBeGreaterThan(flat.min);
  });

  it('draws nothing when no class is shown', () => {
    const g = chartGeometry(chart, [], box);
    expect(g.lines).toEqual([]);
  });
});

describe('the words for the chart', () => {
  it('says the change over the days the farm has', () => {
    expect(changeText(12, 30)).toBe('+12 c/kg over 30 days');
    expect(changeText(-4, 1)).toBe('-4 c/kg over 1 day');
    expect(changeText(0, 30)).toBe('no change over 30 days');
    expect(changeText(null, 0)).toBe('');
  });

  it('gives a screen reader each class, first and last price', () => {
    const s = chartSummary(chart, ['wean', 'cow']);
    expect(s).toContain('Weaner steers went from 400 to 430 c/kg');
    expect(s).toContain('Cows went from 300 to 280 c/kg');
    expect(s).toContain('from 10 Feb 2024 to 11 Mar 2024');
    expect(chartSummary(chart, [])).toBe('No classes are shown on the chart.');
  });
});
