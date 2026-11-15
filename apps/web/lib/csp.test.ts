import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy, config } from '../proxy';
import { INLINE_SCRIPTS, contentSecurityPolicy } from './csp';
import { themeScript } from './themeScript';
import { themeToggleScript } from './themeToggleScript';
import { clientErrorScript } from './clientErrorScript';

const directives = (policy: string): Map<string, string> =>
  new Map(
    policy.split(';').map((d) => {
      const [name, ...rest] = d.trim().split(/\s+/);
      return [name!, rest.join(' ')];
    }),
  );

const hashOf = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;

describe('the Content-Security-Policy', () => {
  it('a static website page gets the hash policy: no nonce, no inline, no eval', () => {
    const res = proxy(new NextRequest('http://localhost:3000/'));
    const policy = res.headers.get('content-security-policy')!;
    const d = directives(policy);
    expect(d.get('default-src')).toBe("'self'");
    expect(d.get('script-src')).not.toMatch(/nonce-|unsafe-inline|unsafe-eval|strict-dynamic/);
    expect(d.get('script-src')).toContain(hashOf(themeScript));
    expect(d.get('script-src')).toContain(hashOf(themeToggleScript));
    expect(d.get('object-src')).toBe("'none'");
    expect(d.get('base-uri')).toBe("'self'");
    expect(d.get('form-action')).toBe("'self'");
    expect(d.get('frame-ancestors')).toBe("'none'");
    expect(d.get('connect-src')).toBe("'self'");
    // Nothing per request is handed on to the page, so it stays static.
    expect(res.headers.get('x-middleware-request-x-nonce')).toBeNull();
    for (const path of ['/about', '/pricing', '/privacy', '/terms', '/leaderboards']) {
      const p = proxy(new NextRequest(`http://localhost:3000${path}`)).headers.get(
        'content-security-policy',
      );
      expect(p, path).toBe(policy);
    }
  });

  it('an app page gets a fresh nonce each time, handed to Next.js on the request', () => {
    const nonces = new Set<string>();
    for (const path of ['/play', '/account', '/community', '/admin', '/play']) {
      const res = proxy(new NextRequest(`http://localhost:3000${path}`));
      const policy = res.headers.get('content-security-policy')!;
      const d = directives(policy);
      const m = /'nonce-([A-Za-z0-9+/=]+)'/.exec(d.get('script-src')!);
      expect(m, path).not.toBeNull();
      nonces.add(m![1]!);
      expect(d.get('script-src')).toContain("'strict-dynamic'");
      expect(d.get('script-src')).toContain(hashOf(clientErrorScript));
      expect(d.get('script-src')).not.toMatch(/unsafe-inline|unsafe-eval/);
      // Next.js reads the nonce from the request's policy header.
      expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
      expect(res.headers.get('x-middleware-request-x-nonce')).toBe(m![1]);
    }
    expect(nonces.size).toBe(5);
  });

  it('allows the Supabase project for images only, and only a real https address', () => {
    const d = directives(
      contentSecurityPolicy({ env: { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/x' } }),
    );
    expect(d.get('img-src')).toBe("'self' data: blob: https://abc.supabase.co");
    expect(d.get('connect-src')).toBe("'self'");
    const bad = directives(
      contentSecurityPolicy({
        env: { NEXT_PUBLIC_SUPABASE_URL: "http://x.example 'unsafe-inline'" },
      }),
    );
    expect(bad.get('img-src')).toBe("'self' data: blob:");
  });

  it('adds eval only for the dev server', () => {
    expect(contentSecurityPolicy({ dev: true })).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({})).not.toContain("'unsafe-eval'");
  });

  it('covers every fixed inline script the pages write', () => {
    expect(Object.keys(INLINE_SCRIPTS).sort()).toEqual([
      'clientErrorScript',
      'themeScript',
      'themeToggleScript',
    ]);
  });

  it('leaves API routes, built files and the service worker alone', () => {
    const source = new RegExp(`^${config.matcher[0]!.source}$`);
    for (const p of ['/', '/play', '/community/u/pat', '/admin/users/1']) {
      expect(source.test(p), p).toBe(true);
    }
    for (const p of [
      '/api/game/farm',
      '/_next/static/chunks/a.js',
      '/serwist/sw.js',
      '/icon.svg',
    ]) {
      expect(source.test(p), p).toBe(false);
    }
  });
});
