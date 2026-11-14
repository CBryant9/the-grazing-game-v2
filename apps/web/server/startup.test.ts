import { describe, expect, it } from 'vitest';
import { CREATES_PER_ADDRESS, CREATE_WINDOW_MS } from './game/http';
import { proxyWarning } from './startup';

describe('the start-up warning about the trusted proxy header', () => {
  it('warns in production when the header is not named, and only then', () => {
    expect(proxyWarning({ NODE_ENV: 'production' })).toMatch(/GG_TRUSTED_IP_HEADER is not set/);
    expect(proxyWarning({ NODE_ENV: 'production', GG_TRUSTED_IP_HEADER: ' ' })).not.toBeNull();
    expect(proxyWarning({ NODE_ENV: 'production', GG_TRUSTED_IP_HEADER: 'x-real-ip' })).toBeNull();
    expect(proxyWarning({ NODE_ENV: 'development' })).toBeNull();
  });

  it('states the shared limit it describes', () => {
    expect(CREATES_PER_ADDRESS).toBe(5);
    expect(CREATE_WINDOW_MS).toBe(10 * 60_000);
    expect(proxyWarning({ NODE_ENV: 'production' })).toMatch(/5 farms in 10 minutes/);
  });
});
