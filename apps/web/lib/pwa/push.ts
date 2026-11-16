// What the service worker does with a push message and a tap on one. Kept apart from sw.ts so
// the rules are plain functions a test can run. Nothing here stores anything: a notification is
// shown and gone, and nothing from a push or from the API is ever cached.

import { isSafeLink } from '../notify/kinds';

export interface ShownPush {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
}

/**
 * Read a push payload. Anything that is not the shape we send is refused, so a message that did
 * not come from our server (or a damaged one) shows nothing rather than something odd.
 */
export function parsePush(text: string | null | undefined): ShownPush | null {
  if (!text) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length > 64) return null;
  if (typeof o.title !== 'string' || o.title.length === 0 || o.title.length > 120) return null;
  const body = typeof o.body === 'string' && o.body.length <= 140 ? o.body : null;
  const link = isSafeLink(o.link) ? o.link : null;
  return { id: o.id, title: o.title, body, link };
}

/** The page a tap opens: the link when it is a path on this site, else the game. */
export function clickPath(link: unknown): string {
  return isSafeLink(link) ? link : '/play';
}

interface WindowClientLike {
  url: string;
  focus(): Promise<unknown>;
  navigate?(url: string): Promise<unknown>;
}

/** The part of the service worker scope this file uses. */
export interface PushScope {
  registration: {
    showNotification(
      title: string,
      options: { body?: string; tag: string; icon: string; badge: string; data: { link: string } },
    ): Promise<void>;
  };
  location: { origin: string };
  clients: {
    matchAll(options: { type: 'window'; includeUncontrolled: true }): Promise<WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
  addEventListener(type: 'push' | 'notificationclick', listener: (event: never) => void): void;
}

interface PushEventLike {
  data: { text(): string } | null;
  waitUntil(p: Promise<unknown>): void;
}
interface ClickEventLike {
  notification: { close(): void; data?: { link?: unknown } };
  waitUntil(p: Promise<unknown>): void;
}

export function installPushHandlers(scope: PushScope): void {
  scope.addEventListener('push', ((event: PushEventLike) => {
    let text: string | null = null;
    try {
      text = event.data ? event.data.text() : null;
    } catch {
      text = null;
    }
    const m = parsePush(text);
    if (!m) return;
    event.waitUntil(
      scope.registration.showNotification(m.title, {
        ...(m.body ? { body: m.body } : {}),
        // The id as the tag: a second delivery of the same notification replaces the first.
        tag: m.id,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { link: clickPath(m.link) },
      }),
    );
  }) as (event: never) => void);

  scope.addEventListener('notificationclick', ((event: ClickEventLike) => {
    event.notification.close();
    const url = new URL(clickPath(event.notification.data?.link), scope.location.origin).href;
    event.waitUntil(
      (async () => {
        const open = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const mine = open.find((c) => new URL(c.url).origin === scope.location.origin);
        if (mine) {
          await mine.focus();
          if (mine.navigate && new URL(mine.url).pathname !== new URL(url).pathname) {
            await mine.navigate(url);
          }
          return;
        }
        await scope.clients.openWindow(url);
      })(),
    );
  }) as (event: never) => void);
}
