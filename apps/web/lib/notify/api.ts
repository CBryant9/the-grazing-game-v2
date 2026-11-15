import type { NotifyKind } from './kinds';

/** An error with a plain message the player can read. */
export class NotifyApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export interface NotifyState {
  settings: {
    reminderTime: string;
    laterNudge: boolean;
    quietStart: string | null;
    quietEnd: string | null;
    timezone: string;
  };
  prefs: { kind: NotifyKind; push: boolean; email: boolean }[];
  devices: { id: string; ref: string; label: string; addedAt: string; lastUsedAt: string | null }[];
  unread: number;
  available: { switchOn: boolean; push: boolean; email: boolean };
  vapidPublicKey: string | null;
  community: boolean;
}

export interface InboxPage {
  items: {
    id: string;
    kind: NotifyKind;
    title: string;
    body: string | null;
    link: string | null;
    read: boolean;
    at: string;
  }[];
  next: string | null;
  unread: number;
}

const UNREACHABLE = 'The game could not be reached. Check your connection and try again.';
const GENERIC = 'Something went wrong. Try again in a moment.';

async function call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NotifyApiError(UNREACHABLE);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Not JSON. Said plainly below.
  }
  if (!res.ok) {
    const o = (data ?? {}) as { error?: unknown; code?: unknown };
    throw new NotifyApiError(
      typeof o.error === 'string' ? o.error : GENERIC,
      res.status,
      typeof o.code === 'string' ? o.code : undefined,
    );
  }
  if (data === null) throw new NotifyApiError(GENERIC);
  return data as T;
}

export const notifyApi = {
  state: () => call<NotifyState>('/api/notify/state', 'GET'),
  inbox: (before: string | null) =>
    call<InboxPage>(
      `/api/notify/inbox${before ? `?before=${encodeURIComponent(before)}` : ''}`,
      'GET',
    ),
  read: (body: { ids: string[] } | { all: true }) =>
    call<{ ok: true }>('/api/notify/read', 'POST', body),
  pref: (kind: NotifyKind, change: { push?: boolean; email?: boolean }) =>
    call<{ ok: true }>('/api/notify/prefs', 'POST', { kind, ...change }),
  settings: (change: Record<string, unknown>) =>
    call<{ ok: true }>('/api/notify/settings', 'POST', change),
  off: () => call<{ ok: true }>('/api/notify/off', 'POST', {}),
  subscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string }; device: string }) =>
    call<{ ok: true; id: string; ref: string }>('/api/notify/subscribe', 'POST', sub),
  removeDevice: (by: { id: string } | { ref: string }) =>
    call<{ ok: true; removed: number }>('/api/notify/unsubscribe', 'POST', by),
};
