import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EVENTS_PER_MINUTE,
  MESSAGE_KEPT,
  buildEvent,
  cleanFile,
  parseDsn,
  reportError,
  scrubMessage,
  setSentryTransport,
  trimStack,
} from './sentry';
import { logFailure } from '../logging';

const DSN = 'https://0123456789abcdef0123456789abcdef@o12345.ingest.sentry.example/4501234';

afterEach(() => setSentryTransport(undefined));

function capture(): { calls: { url: string; init: RequestInit }[] } {
  const box = { calls: [] as { url: string; init: RequestInit }[] };
  setSentryTransport(async (url, init) => {
    box.calls.push({ url, init });
    return new Response(null, { status: 200 });
  });
  return box;
}

const eventOf = (body: unknown): Record<string, unknown> =>
  JSON.parse(String(body).split('\n')[2]!) as Record<string, unknown>;

describe('the DSN', () => {
  it('gives the envelope endpoint and the public key', () => {
    expect(parseDsn(DSN)).toEqual({
      endpoint: 'https://o12345.ingest.sentry.example/api/4501234/envelope/',
      publicKey: '0123456789abcdef0123456789abcdef',
    });
    expect(parseDsn('https://abcdef0123@sentry.example/base/path/42')?.endpoint).toBe(
      'https://sentry.example/base/path/api/42/envelope/',
    );
  });

  it('is nothing when empty or not a DSN', () => {
    for (const bad of [
      undefined,
      '',
      '  ',
      'not a url',
      'ftp://abcdef0123@sentry.example/42',
      'https://sentry.example/42',
      'https://abcdef0123@sentry.example/notaproject',
      'https://abcdef0123:secret@sentry.example/42',
      'https://abcdef0123@sentry.example/42?x=1',
    ]) {
      expect(parseDsn(bad), String(bad)).toBeNull();
    }
  });
});

describe('sending', () => {
  it('sends nothing at all with no DSN, and does not fail', async () => {
    const box = capture();
    await reportError(
      { source: 'server', route: 'game-act', reason: 'x', errorClass: 'Error' },
      {},
    );
    logFailure({ route: 'game-act', reason: 'save_failed' }, new Error('boom'));
    await new Promise((r) => setTimeout(r, 5));
    expect(box.calls).toHaveLength(0);
  });

  it('posts one envelope to the DSN with the key in a header, not the address', async () => {
    const box = capture();
    await reportError(
      { source: 'server', route: 'game-act', reason: 'save_failed', errorClass: 'TypeError' },
      { SENTRY_DSN: DSN, GG_RELEASE: 'abc123', NODE_ENV: 'production' },
    );
    expect(box.calls).toHaveLength(1);
    const { url, init } = box.calls[0]!;
    expect(url).toBe('https://o12345.ingest.sentry.example/api/4501234/envelope/');
    expect(url).not.toContain('sentry_key');
    expect((init.headers as Record<string, string>)['x-sentry-auth']).toContain(
      'sentry_key=0123456789abcdef0123456789abcdef',
    );
    const lines = String(init.body).split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1]!).type).toBe('event');
    const event = eventOf(init.body);
    expect(event.release).toBe('abc123');
    expect(event.environment).toBe('production');
    expect(event.tags).toEqual({ source: 'server', route: 'game-act', reason: 'save_failed' });
  });

  it('a failure logged on the server goes to Sentry with its route, reason and class only', async () => {
    const box = capture();
    const old = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = DSN;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const e = new Error('could not send to pat@example.com?token=abc https://x.example/?a=1');
      logFailure({ route: 'auth-email', reason: 'send_link_failed' }, e);
      await new Promise((r) => setTimeout(r, 5));
    } finally {
      if (old === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = old;
      spy.mockRestore();
    }
    expect(box.calls).toHaveLength(1);
    const body = String(box.calls[0]!.init.body);
    expect(body).not.toMatch(/pat@example\.com|token=abc|x\.example|could not send/);
    const ex = (eventOf(body).exception as { values: { type: string; value: string }[] })
      .values[0]!;
    expect(ex.type).toBe('Error');
    expect(ex.value).toBe('send_link_failed');
  });

  it('carries no cookie, request, user name, body or query, whatever is in the report', async () => {
    const box = capture();
    await reportError(
      {
        source: 'browser',
        route: '/community/u/:id',
        reason: 'window_error',
        errorClass: 'TypeError',
        message: 'cannot read gg_session=abcdef0123456789abcdef0123456789 of pat@example.com',
        stack:
          'TypeError: x\n    at go (https://site.example/_next/static/chunks/app.js?v=secret#frag:1:2)\n    at C:\\Users\\Pat\\code\\apps\\web\\server\\game\\game.ts:10:5',
      },
      { SENTRY_DSN: DSN },
    );
    const body = String(box.calls[0]!.init.body);
    for (const bad of [
      'gg_session',
      'abcdef0123456789abcdef0123456789',
      'pat@example.com',
      'site.example',
      'v=secret',
      'frag',
      'Users',
      'Pat',
    ]) {
      expect(body, bad).not.toContain(bad);
    }
    const event = eventOf(body);
    expect(event).not.toHaveProperty('request');
    expect(event.user).toEqual({ ip_address: null });
  });

  it('sends at most a set number a minute, so a failing loop never floods', async () => {
    const box = capture();
    const now = 1_000_000;
    for (let i = 0; i < EVENTS_PER_MINUTE + 10; i++) {
      await reportError(
        { source: 'server', route: 'r', reason: 'x', errorClass: 'Error' },
        { SENTRY_DSN: DSN },
        now + i,
      );
    }
    expect(box.calls).toHaveLength(EVENTS_PER_MINUTE);
    await reportError(
      { source: 'server', route: 'r', reason: 'x', errorClass: 'Error' },
      { SENTRY_DSN: DSN },
      now + 60_001,
    );
    expect(box.calls).toHaveLength(EVENTS_PER_MINUTE + 1);
  });

  it('a transport that throws or hangs is never the caller’s problem', async () => {
    setSentryTransport(() => {
      throw new Error('network down');
    });
    await expect(
      reportError(
        { source: 'server', route: 'r', reason: 'x', errorClass: 'Error' },
        { SENTRY_DSN: DSN },
      ),
    ).resolves.toBeUndefined();
    setSentryTransport(() => Promise.reject(new Error('refused')));
    await expect(
      reportError(
        { source: 'server', route: 'r', reason: 'x', errorClass: 'Error' },
        { SENTRY_DSN: DSN },
      ),
    ).resolves.toBeUndefined();
  });
});

describe('scrubbing', () => {
  it('cuts a stack to names and places inside the app, oldest first', () => {
    const frames = trimStack(
      [
        'Error: boom',
        '    at inner (/home/pat/repo/apps/web/server/game/game.ts:12:3)',
        '    at async outer (C:\\Users\\Pat\\repo\\node_modules\\pg\\lib\\client.js:5:1)',
        '    at /var/task/secret/handler.js:1:1',
        'go@https://site.example/_next/static/chunks/page-1.js?x=1:3:4',
      ].join('\n'),
    );
    expect(frames.map((f) => f.filename)).toEqual([
      '_next/static/chunks/page-1.js',
      'handler.js',
      'node_modules/pg/lib/client.js',
      'apps/web/server/game/game.ts',
    ]);
    expect(frames[3]).toMatchObject({ function: 'inner', lineno: 12, colno: 3, in_app: true });
    expect(frames[2]!.in_app).toBe(false);
    expect(trimStack(undefined)).toEqual([]);
    expect(trimStack('x\n'.repeat(500))).toEqual([]);
  });

  it('keeps a file path free of hosts, queries and home folders', () => {
    expect(cleanFile('https://a.example/_next/static/x.js?token=1')).toBe('_next/static/x.js');
    expect(cleanFile('/Users/pat/thing.js')).toBe('thing.js');
  });

  it('takes emails, addresses, ids, tokens and long numbers out of a message, and cuts it', () => {
    const m = scrubMessage(
      'Failed for pat@example.com at https://x.example/a?b=1 id 3f2504e0-4f89-11d3-9a0c-0305e82c3301 key eyJhbGciOiJIUzI1NiJ9abc phone 0412345678',
    );
    expect(m).toBe('Failed for [email] at [url] id [id] key [token] phone [n]');
    expect(scrubMessage('x'.repeat(5000)).length).toBeLessThanOrEqual(MESSAGE_KEPT);
    expect(scrubMessage(undefined)).toBe('');
  });

  it('never puts a server error’s message in the event', () => {
    const event = buildEvent(
      {
        source: 'server',
        route: 'x',
        reason: 'r',
        errorClass: 'Error',
        message: 'secret text',
      },
      {},
    );
    expect(JSON.stringify(event)).not.toContain('secret text');
  });
});
