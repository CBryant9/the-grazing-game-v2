import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The PC game header at mid widths (m8 look fix). At about 1024 px the date block was squeezed
 * into a column a few characters wide and wrapped one word a line. These rules keep it on one
 * line with an ellipsis, keep the panel tabs on one row and cap the panel's share of the window.
 */
const css = readFileSync(join(__dirname, 'play.module.css'), 'utf8');
const hooks = readFileSync(join(__dirname, '../../lib/game/hooks.ts'), 'utf8');

/** A rule's body: the last one with this selector, or the first (`first`), the one outside any media query. */
const rule = (selector: string, first = false): string => {
  const at = first
    ? css.indexOf(`
${selector} {`)
    : css.lastIndexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};

describe('the PC game header at every PC width', () => {
  it('starts at 900 px wide, the width the header rules are made for', () => {
    expect(hooks).toContain("const PC = '(min-width: 900px) and (min-height: 501px)'");
  });

  it('gives the date block a minimum width and lets its lines end in an ellipsis', () => {
    expect(rule(".screen[data-layout='pc'] .topname")).toMatch(/min-width: 150px/);
    const lines = rule(".screen[data-layout='pc'] .sub");
    expect(css).toMatch(
      /\.screen\[data-layout='pc'\] \.topdate,\s*\.screen\[data-layout='pc'\] \.sub \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/,
    );
    expect(lines).toBeTruthy();
  });

  it('drops parts in order before it allows a second row, and only below 1024 px', () => {
    const order = [
      'max-width: 1365px',
      'max-width: 1279px',
      'max-width: 1180px',
      'max-width: 1023px',
    ];
    const at = order.map((q) => css.indexOf(`@media (${q})`));
    for (const i of at) expect(i).toBeGreaterThan(0);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const wrap = css.slice(at[3]!);
    expect(wrap).toMatch(/flex-wrap: wrap/);
  });

  it('keeps the panel tabs on one row and caps the panel at 42% of the window', () => {
    expect(rule('.ptabs', true)).toMatch(/flex-wrap: nowrap/);
    expect(rule('.ptabs', true)).toMatch(/overflow-x: auto/);
    expect(rule('.ptab', true)).toMatch(/white-space: nowrap/);
    expect(rule(".screen[data-layout='pc'] .side")).toMatch(/max-width: 42vw/);
  });
});
