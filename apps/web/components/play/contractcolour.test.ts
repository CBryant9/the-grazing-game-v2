import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NATURAL } from '@gg/render/palette';

/*
 * The contractor's fence has one colour on the map (docs/VISUALS.md). The
 * swatch beside the words ("Contract fence: 1,200 m left") must be that
 * colour, so the words and the map read as the same thing.
 */
describe("the contractor's fence colour", () => {
  const css = readFileSync(join(__dirname, 'play.module.css'), 'utf8');

  it('is the same on the map and in the swatch and the Farm tab line', () => {
    const hex = `#${NATURAL.fenceContract.toString(16).padStart(6, '0')}`;
    expect(css).toContain(`--contract-fence: ${hex};`);
    expect(css).toMatch(new RegExp(`\\.contractline \\{[^}]*border-left: 4px solid ${hex};`));
  });
});
