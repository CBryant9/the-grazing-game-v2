import { describe, expect, it } from 'vitest';
import { NEXT_ALLOWED, NEXT_DEFAULT, clearCookieText, cookieText, csrfRefusal, safeNext, siteOrigin } from './security';

const HOST = 'localhost:3000';
const post = (headers: Record<string, string>, body: string | null = '{"a":1}') =>
  new Request(`http://${HOST}/api/x`, {
    method: 'POST',
    headers: { host: HOST, ...headers },
    body,
  });

describe('the one CSRF rule for every state-changing route', () => {
  it('lets the site itself through, with an Origin or without', () => {
    expect(csrfRefusal(post({ origin: `http://${HOST}`, 'content-type': 'application/json' }))).toBeNull();
    expect(csrfRefusal(post({ 'content-type': 'application/json' }))).toBeNull();
    expect(csrfRefusal(post({ 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }))).toBeNull();
    expect(csrfRefusal(post({ 'sec-fetch-site': 'none', 'content-type': 'application/json' }))).toBeNull();
  });

  it('refuses another site by Origin, even a sibling on the same host name with a different port', () => {
    expect(csrfRefusal(post({ origin: 'https://evil.example', 'content-type': 'application/json' }))).toMatch(/another site/);
    expect(csrfRefusal(post({ origin: 'http://localhost:4000', 'content-type': 'application/json' }))).toMatch(/another site/);
    expect(csrfRefusal(post({ origin: 'null', 'content-type': 'application/json' }))).toMatch(/another site/);
  });

  it('refuses cross-site and same-site (not same-origin) fetches', () => {
    for (const site of ['cross-site', 'same-site']) {
      expect(csrfRefusal(post({ 'sec-fetch-site': site, 'content-type': 'application/json' }))).toMatch(/another site/);
    }
  });

  it('refuses a body that is not JSON, so a form or a plain-text post can not get through with no Origin', () => {
    expect(csrfRefusal(post({ 'content-type': 'text/plain' }))).toMatch(/not sent properly/);
    expect(csrfRefusal(post({ 'content-type': 'application/x-www-form-urlencoded' }, 'a=1'))).toMatch(/not sent properly/);
    expect(csrfRefusal(post({}))).toMatch(/not sent properly/);
    expect(csrfRefusal(post({ 'content-type': 'application/json; charset=utf-8' }))).toBeNull();
  });

  it('lets a request with no body through (a delete, a sign-out with nothing to say)', () => {
    expect(csrfRefusal(post({}, null))).toBeNull();
  });
});

describe('where a player may be sent after signing in', () => {
  it('allows only the listed pages, as a bare path', () => {
    for (const p of NEXT_ALLOWED) expect(safeNext(p)).toBe(p);
  });

  it('turns everything else into /play: other sites, schemes, //, backslashes, queries, unlisted paths', () => {
    for (const bad of [
      'https://evil.example',
      'http://localhost:3000/play',
      '//evil.example',
      '/\\evil.example',
      '/%2F%2Fevil.example',
      'javascript:alert(1)',
      '/play?next=https://evil.example',
      '/play#x',
      '/admin',
      '/api/game/farm',
      '/play/../admin',
      ' /play',
      '/play ',
      '',
      '   ',
      null,
      undefined,
      42,
      '/'.repeat(100),
    ]) {
      expect(safeNext(bad)).toBe(NEXT_DEFAULT);
    }
  });
});

describe('cookies', () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  it('are HttpOnly, SameSite=Lax, on path /, and Secure over https', () => {
    const text = cookieText(req('https://game.example/x'), 'gg_x', 'v', 60);
    expect(text).toBe('gg_x=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure');
  });

  it('are Secure behind a proxy that says https, and not on plain http localhost in a check build', () => {
    expect(cookieText(req('http://game.example/x', { 'x-forwarded-proto': 'https' }), 'a', 'b', 1)).toMatch(/Secure/);
    expect(cookieText(req('http://localhost:3291/x'), 'a', 'b', 1)).not.toMatch(/Secure/);
  });

  it('are removed with an expired date', () => {
    const t = clearCookieText(req('https://game.example/x'), 'gg_x');
    expect(t).toMatch(/Max-Age=0/);
    expect(t).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('the site address comes from the request host, not from a header a caller could set', () => {
    const r = new Request('http://localhost:3000/x', {
      headers: { host: 'localhost:3000', 'x-forwarded-host': 'evil.example', origin: 'https://evil.example' },
    });
    expect(siteOrigin(r)).toBe('http://localhost:3000');
  });
});
