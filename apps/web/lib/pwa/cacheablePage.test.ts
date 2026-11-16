import { readFileSync } from 'node:fs';
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

describe('sign-in and account pages are never kept (milestone 3.2)', () => {
  it('refuses every sign-in, sign-up, callback and account path and every api path', () => {
    for (const path of [
      '/sign-in',
      '/sign-in/',
      '/sign-in/check-email',
      '/sign-up',
      '/sign-up/finish',
      '/auth/callback',
      '/auth/callback/',
      '/account',
      '/account/',
      '/api/auth/me',
      '/api/auth/email',
      '/api/auth/finish',
      '/api/account/data',
      '/api/account/delete',
      '/api/game/farm',
      '/api/game/farms',
      '/api/game/past',
      '/PLAY',
      '/play/',
    ]) {
      expect(isCacheablePagePath(path), path).toBe(false);
    }
  });

  const sw = readFileSync(new URL('../../app/sw.ts', import.meta.url), 'utf8');

  it('the service worker sends everything under /api to the network only', () => {
    expect(sw).toMatch(/pathname\.startsWith\('\/api\/'\)[\s\S]{0,80}new NetworkOnly\(\)/);
  });

  it('keeps pages only by the allow-list, and falls back to no page but the game and the home page', () => {
    expect(sw).toMatch(/isCacheablePagePath\(url\.pathname\)/);
    const fallbackUrls = [...sw.matchAll(/url: '([^']+)'/g)].map((m) => m[1]);
    expect(fallbackUrls.sort()).toEqual(['/', '/play']);
  });
});
