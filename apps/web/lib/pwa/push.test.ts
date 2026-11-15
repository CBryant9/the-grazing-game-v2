import { describe, expect, it } from 'vitest';
import { clickPath, installPushHandlers, parsePush, type PushScope } from './push';

function scope(
  opts: { clients?: { url: string; navigated?: string[]; focused?: boolean }[] } = {},
) {
  const handlers: Record<string, (e: never) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const clients = (opts.clients ?? []).map((c) => ({
    url: c.url,
    focus: async () => {
      c.focused = true;
    },
    navigate: async (u: string) => {
      (c.navigated ??= []).push(u);
    },
  }));
  const s: PushScope = {
    registration: {
      showNotification: async (title, options) => {
        shown.push({ title, options });
      },
    },
    location: { origin: 'https://game.example.test' },
    clients: {
      matchAll: async () => clients,
      openWindow: async (u) => {
        opened.push(u);
      },
    },
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
  };
  installPushHandlers(s);
  return { handlers, shown, opened, raw: opts.clients ?? [] };
}

const pushEvent = (text: string | null) => {
  const waits: Promise<unknown>[] = [];
  return {
    e: {
      data: text === null ? null : { text: () => text },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    },
    waits,
  };
};
const clickEvent = (link: unknown) => {
  const waits: Promise<unknown>[] = [];
  let closed = false;
  return {
    e: {
      notification: { close: () => (closed = true), data: { link } },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    },
    waits,
    closed: () => closed,
  };
};

describe('push in the service worker', () => {
  it('reads only the shape we send', () => {
    expect(parsePush(JSON.stringify({ id: 'a', title: 'Hi', body: null, link: '/play' }))).toEqual({
      id: 'a',
      title: 'Hi',
      body: null,
      link: '/play',
    });
    for (const bad of [
      null,
      '',
      'nope',
      '[]',
      JSON.stringify({ title: 'x' }),
      JSON.stringify({ id: 'a', title: '' }),
      JSON.stringify({ id: 'a', title: 'x'.repeat(200) }),
    ]) {
      expect(parsePush(bad), String(bad)).toBeNull();
    }
    // A link that is not a path on this site is dropped, not followed.
    expect(
      parsePush(JSON.stringify({ id: 'a', title: 'x', link: '//evil.test' }))?.link,
    ).toBeNull();
    expect(
      parsePush(JSON.stringify({ id: 'a', title: 'x', link: 'https://evil.test' }))?.link,
    ).toBeNull();
  });

  it('shows a notification with the id as its tag, and nothing for a message it does not know', async () => {
    const s = scope();
    const ev = pushEvent(
      JSON.stringify({
        id: 'n1',
        title: 'Rain overnight at Wattle Flat: 12 mm.',
        body: null,
        link: '/play',
      }),
    );
    s.handlers.push!(ev.e as never);
    await Promise.all(ev.waits);
    expect(s.shown).toHaveLength(1);
    expect(s.shown[0]!.options.tag).toBe('n1');
    expect((s.shown[0]!.options.data as { link: string }).link).toBe('/play');
    const junk = pushEvent('not json');
    s.handlers.push!(junk.e as never);
    expect(s.shown).toHaveLength(1);
    expect(junk.waits).toHaveLength(0);
  });

  it('a tap opens the link, or the game for a link that is not on this site', async () => {
    expect(clickPath('/account/notifications')).toBe('/account/notifications');
    for (const bad of [
      '//evil.test',
      'https://evil.test/x',
      '/\\evil',
      'javascript:alert(1)',
      null,
      5,
      '/a b',
    ]) {
      expect(clickPath(bad), String(bad)).toBe('/play');
    }
    const s = scope();
    const c = clickEvent('/account/notifications');
    s.handlers.notificationclick!(c.e as never);
    await Promise.all(c.waits);
    expect(c.closed()).toBe(true);
    expect(s.opened).toEqual(['https://game.example.test/account/notifications']);
  });

  it('a tap focuses a page that is already open on this site and moves it to the right page', async () => {
    const s = scope({
      clients: [{ url: 'https://game.example.test/play' }, { url: 'https://other.test/' }],
    });
    const c = clickEvent('/account/notifications');
    s.handlers.notificationclick!(c.e as never);
    await Promise.all(c.waits);
    expect(s.opened).toEqual([]);
    expect(s.raw[0]!.focused).toBe(true);
    expect(s.raw[0]!.navigated).toEqual(['https://game.example.test/account/notifications']);
    expect(s.raw[1]!.focused).toBeUndefined();
  });
});
