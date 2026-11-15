import { describe, expect, it } from 'vitest';
import { SUPPORTED_ZONES, isSupportedZone, longDate } from './clock';

describe('the time zones Daily Farm supports', () => {
  it('are the zones of the four launch districts and the other Australian and New Zealand zones, exactly as named', () => {
    // The launch districts: Central Queensland (Brisbane), Northern Tablelands and Central West NSW (Sydney),
    // Western Victoria (Melbourne).
    for (const z of ['Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne']) {
      expect(isSupportedZone(z)).toBe(true);
    }
    for (const z of SUPPORTED_ZONES) expect(isSupportedZone(z)).toBe(true);
    expect(SUPPORTED_ZONES).toContain('Pacific/Auckland');
  });

  it('turn away an offset, a wrong case, an alias, a made-up name and anything that is not text', () => {
    for (const z of [
      '+10:00',
      'australia/sydney',
      'AUSTRALIA/SYDNEY',
      'Australia/Canberra',
      'Mars/Olympus',
      'UTC',
      'Pacific/Kiritimati',
      '',
      ' Australia/Sydney',
      null,
      undefined,
      42,
      'x'.repeat(200),
    ]) {
      expect(isSupportedZone(z)).toBe(false);
    }
  });

  it('says a date as the diary does', () => {
    expect(longDate('2026-11-14')).toBe('14 November');
    expect(longDate('2027-01-01')).toBe('1 January');
  });
});
