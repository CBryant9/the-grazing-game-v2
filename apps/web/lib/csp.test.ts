import { createHash } from 'node:crypto';
import { NextRequest, type NextFetchEvent } from 'next/server';
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

/** The proxy hands the page-view count to `waitUntil`; the test keeps what it was given. */
const waited: Promise<unknown>[] = [];
const event = { waitUntil: (p: Promise<unknown>) => waited.push(p) } as unknown as NextFetchEvent;

const hashOf = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;

describe('the Content-Security-Policy', () => {
  it('a static website page gets the hash policy: no nonce, no inline, no eval', () => {
    const res = proxy(new NextRequest('http://localhost:3000/'), event);
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
      const p = proxy(new NextRequest(`http://localhost:3000${path}`), event).headers.get(
        'content-security-policy',
      );
      expect(p, path).toBe(policy);
    }
  });

  it('an app page gets a fresh nonce each time, handed to Next.js on the request', () => {
    const nonces = new Set<string>();
    for (const path of ['/play', '/account', '/community', '/admin', '/play']) {
      const res = proxy(new NextRequest(`http://localhost:3000${path}`), event);
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

  it('one proxy: a public page also hands on its page-view count; an app page does not (m7 join)', async () => {
    waited.length = 0;
    proxy(new NextRequest('http://localhost:3000/pricing'), event);
    expect(waited).toHaveLength(1);
    // With no database the count is a quiet no, never a failure.
    await expect(waited[0]).resolves.toBeUndefined();
    proxy(new NextRequest('http://localhost:3000/play'), event);
    proxy(new NextRequest('http://localhost:3000/account'), event);
    expect(waited).toHaveLength(1);
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
