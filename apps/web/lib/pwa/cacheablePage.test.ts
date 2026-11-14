import { describe, expect, it } from 'vitest';
import { isCacheablePagePath } from './cacheablePage';

describe('which pages the service worker may keep', () => {
  it('keeps the home page and the game page', () => {
    expect(isCacheablePagePath('/')).toBe(true);
    expect(isCacheablePagePath('/play')).toBe(true);
  });

  it('never keeps admin, sign-in callbacks, account pages or the api', () => {
    for (const path of [
      '/admin',
      '/admin/farms',
      '/auth/callback',
      '/account',
      '/account/billing',
      '/api/farm',
      '/play/extra',
      '/playground',
    ]) {
      expect(isCacheablePagePath(path), path).toBe(false);
    }
  });
});
