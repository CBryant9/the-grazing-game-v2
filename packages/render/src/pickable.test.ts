import { describe, expect, it } from 'vitest';
import { pickableDraws } from './pickable';

describe('the paddocks that can be picked', () => {
  it('draws nothing for no list', () => {
    expect(pickableDraws(null, null)).toEqual([]);
    expect(pickableDraws([], 3)).toEqual([]);
  });

  it('outlines each paddock lightly, and in red where there is no water', () => {
    expect(
      pickableDraws(
        [
          { paddock: 1, dry: false },
          { paddock: 2, dry: true },
        ],
        null,
      ),
    ).toEqual([
      { paddock: 1, kind: 'pick' },
      { paddock: 2, kind: 'dry' },
    ]);
  });

  it('leaves out the highlighted paddock and counts a repeat once', () => {
    expect(
      pickableDraws(
        [
          { paddock: 1, dry: false },
          { paddock: 1, dry: false },
          { paddock: 4, dry: true },
        ],
        4,
      ),
    ).toEqual([{ paddock: 1, kind: 'pick' }]);
  });
});
