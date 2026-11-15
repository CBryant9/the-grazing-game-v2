import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/client-error/route';
import { resetRateLimits, TRUSTED_IP_HEADER_ENV } from '../game/http';
import { setSentryTransport } from './sentry';
import {
  CLIENT_ERRORS_ALL_PER_MINUTE,
  CLIENT_ERRORS_PER_MINUTE,
  CLIENT_ERROR_BODY_LIMIT,
  pageTemplate,
} from './clientError';
import { clientErrorScript } from '../../lib/clientErrorScript';

const HOST = 'http://localhost:3000';
const DSN = 'https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.example/42';
let sent: string[];
let logged: string[];

beforeEach(() => {
  resetRateLimits();
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  process.env.SENTRY_DSN = DSN;
  sent = [];
  logged = [];
  setSentryTransport(async (_url, init) => {
    sent.push(String(init.body));
    return new Response(null);
  });
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
    logged.push(String(line));
  });
});
afterEach(() => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  delete process.env.SENTRY_DSN;
  setSentryTransport(undefined);
  vi.restoreAllMocks();
});

const report = {
  kind: 'error',
  name: 'TypeError',
  message: 'x is undefined for pat@example.com',
  stack: 'TypeError: x\n    at go (https://localhost:3000/_next/static/chunks/a.js?q=1:1:2)',
  route: '/community/u/patsmith?tab=posts',
};

function call(
  body: unknown,
  headers: Record<string, string> = {},
  ip = '10.1.1.1',
): Promise<Response> {
  return POST(
    new Request(`${HOST}/api/client-error`, {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: HOST,
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
        'x-real-ip': ip,
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const settle = () => new Promise((r) => setTimeout(r, 5));

describe('/api/client-error', () => {
  it('takes a browser error, answers empty, and forwards it scrubbed', async () => {
    const res = await call(report);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    await settle();
    expect(sent).toHaveLength(1);
    const event = JSON.parse(sent[0]!.split('\n')[2]!);
    expect(event.tags).toEqual({
      source: 'browser',
      route: '/community/u/:id',
      reason: 'window_error',
    });
    expect(event.exception.values[0].type).toBe('TypeError');
    expect(event.exception.values[0].value).toBe('x is undefined for [email]');
    expect(sent[0]).not.toMatch(/patsmith|pat@example|q=1|tab=posts|localhost/);
  });

  it('never writes the message or the stack to the server log', async () => {
    await call(report);
    expect(logged).toEqual([
      'failed route=client:/community/u/:id reason=window_error error=TypeError',
    ]);
  });

  it('sends nothing on with no DSN, and still answers empty', async () => {
    delete process.env.SENTRY_DSN;
    expect((await call(report)).status).toBe(204);
    await settle();
    expect(sent).toHaveLength(0);
  });

  it('refuses another site, a form body and a sibling domain', async () => {
    expect((await call(report, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(report, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await call(report, { 'content-type': 'text/plain' })).status).toBe(403);
    await settle();
    expect(sent).toHaveLength(0);
  });

  it('takes only the fixed shape', async () => {
    for (const bad of [
      'not json',
      [],
      {},
      { ...report, kind: 'other' },
      { ...report, extra: 'x' },
      { ...report, cookie: 'gg_session=x' },
      { ...report, message: 5 },
      { ...report, name: 'x'.repeat(61) },
      { ...report, stack: 'x'.repeat(2401) },
    ]) {
      expect((await call(bad)).status, JSON.stringify(bad).slice(0, 40)).toBe(400);
    }
    await settle();
    expect(sent).toHaveLength(0);
  });

  it('refuses a body over the limit, said or not', async () => {
    const big = { ...report, stack: 'x'.repeat(2400), message: 'y'.repeat(300) };
    const padded = JSON.stringify(big).padEnd(CLIENT_ERROR_BODY_LIMIT + 10, ' ');
    expect((await call(padded)).status).toBe(413);
    expect(
      (await call(report, { 'content-length': String(CLIENT_ERROR_BODY_LIMIT + 1) })).status,
    ).toBe(413);
  });

  it('limits each caller, and the whole server', async () => {
    for (let i = 0; i < CLIENT_ERRORS_PER_MINUTE; i++) {
      expect((await call(report)).status).toBe(204);
    }
    expect((await call(report)).status).toBe(429);
    expect((await call(report, {}, '10.1.1.2')).status).toBe(204);
    resetRateLimits();
    let refused = 0;
    for (let i = 0; i < CLIENT_ERRORS_ALL_PER_MINUTE + 5; i++) {
      if ((await call(report, {}, `10.2.${Math.floor(i / 200)}.${i % 200}`)).status === 429)
        refused++;
    }
    expect(refused).toBe(5);
  });

  it('turns a page path into a template with no ids, names or query', () => {
    expect(pageTemplate('/play')).toBe('/play');
    expect(pageTemplate('/play?farm=abc')).toBe('/play');
    expect(pageTemplate('/community/farm/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(
      '/community/farm/:id',
    );
    expect(pageTemplate('/admin/users/abc')).toBe('/admin/users/:id');
    expect(pageTemplate('/somewhere/else')).toBe('other');
    expect(pageTemplate('https://evil.example/play')).toBe('other');
    expect(pageTemplate(42)).toBe('other');
  });
});

describe('the page hook', () => {
  it('is a few hundred bytes and posts JSON to the route with sendBeacon', () => {
    expect(clientErrorScript.length).toBeLessThan(700);
    expect(clientErrorScript).toContain("sendBeacon('/api/client-error'");
    expect(clientErrorScript).toContain("type:'application/json'");
    expect(clientErrorScript).toContain('unhandledrejection');
  });

  it('sends what the route takes', async () => {
    const beacons: Blob[] = [];
    const listeners: Record<string, (e: unknown) => void> = {};
    const g = {
      navigator: { sendBeacon: (_u: string, b: Blob) => (beacons.push(b), true) },
      location: { pathname: '/play' },
      addEventListener: (k: string, f: (e: unknown) => void) => (listeners[k] = f),
      Blob,
      JSON,
      String,
    };
    new Function(...Object.keys(g), clientErrorScript)(...Object.values(g));
    const err = new TypeError('broke');
    listeners.error!({ error: err });
    listeners.unhandledrejection!({ reason: new RangeError('late') });
    for (let i = 0; i < 10; i++) listeners.error!({ message: 'again' });
    expect(beacons).toHaveLength(5);
    const first = JSON.parse(await beacons[0]!.text());
    expect((await call(first)).status).toBe(204);
    const second = JSON.parse(await beacons[1]!.text());
    expect(second.kind).toBe('rejection');
    expect(second.name).toBe('RangeError');
  });
});
