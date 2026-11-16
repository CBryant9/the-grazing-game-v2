import { describe, expect, it } from 'vitest';
import { isIosBrowser } from './install';

describe('telling an iPhone or iPad from other browsers', () => {
  it('knows an iPhone', () => {
    expect(
      isIosBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5),
    ).toBe(true);
  });
  it('knows an iPad that says it is a Mac', () => {
    expect(isIosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(
      true,
    );
  });
  it('does not take a Mac or an Android phone for one', () => {
    expect(isIosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(
      false,
    );
    expect(isIosBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 'Linux armv81', 5)).toBe(false);
  });
});
