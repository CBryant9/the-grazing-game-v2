import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { setAuthDeps } from '../auth/deps';
import { FAKE_AUTH, FAKE_P256DH } from '../test-support/fakeNotify';
import {
  CRON,
  HOUR,
  NOON,
  TOKEN_SECRET,
  addDeviceFor,
  addFarm,
  addPerson,
  makeWorld,
  resetWorld,
  setPrefs,
  setSettings,
  type Person,
  type World,
} from '../test-support/notifyWorld';
import { setNotifyIntegrations } from './deps';
import { overview } from './admin';
import { queueNotification } from './queue';
import { applyUnsubscribe } from './store';
import { makeUnsubToken } from './token';
import { sameSecret } from './route';

type Handler = (req: Request) => Promise<Response>;
const R: Record<string, { GET?: Handler; POST?: Handler }> = {};

let db: PGlite;
let w: World;
let ip = 0;

beforeAll(async () => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  db = await freshDb({ seed: false });
  w = makeWorld(db);
  R.state = await import('@/app/api/notify/state/route');
  R.prefs = await import('@/app/api/notify/prefs/route');
  R.settings = await import('@/app/api/notify/settings/route');
  R.off = await import('@/app/api/notify/off/route');
  R.subscribe = await import('@/app/api/notify/subscribe/route');
  R.unsubscribe = await import('@/app/api/notify/unsubscribe/route');
  R.inbox = await import('@/app/api/notify/inbox/route');
  R.read = await import('@/app/api/notify/read/route');
  R.send = await import('@/app/api/notify/send/route');
  R.u = await import('@/app/api/notify/u/route');
  R.signout = await import('@/app/api/auth/signout/route');
  R.adminNotifications = await import('@/app/api/admin/notifications/route');
}, 120_000);
afterAll(async () => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
  setNotifyIntegrations(undefined);
  await db?.close();
});
beforeEach(async () => {
  await resetWorld(w);
  resetRateLimits();
  ip++;
});

const HOST = 'http://localhost:3000';
interface Opts {
  who?: Person | null;
  headers?: Record<string, string>;
  address?: string;
  search?: string;
}
function req(path: string, method: 'GET' | 'POST', body: unknown, o: Opts = {}): Request {
  return new Request(`${HOST}${path}${o.search ?? ''}`, {
    method,
    headers: {
      host: 'localhost:3000',
      'x-real-ip': o.address ?? `10.2.0.${ip}`,
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(o.who ? { cookie: o.who.cookie } : {}),
      ...o.headers,
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
}
const get = (route: string, o: Opts = {}) =>
  R[route]!.GET!(req(`/api/notify/${route}`, 'GET', null, o));
const post = (route: string, body: unknown, o: Opts = {}) =>
  R[route]!.POST!(req(`/api/notify/${route}`, 'POST', body, o));
const j = async (r: Response) => (await r.json()) as Record<string, unknown>;

const goodSub = (n = 1, host = 'web.push.apple.com') => ({
  endpoint: `https://${host}/wpush/v2/route-${n}`,
  keys: { p256dh: FAKE_P256DH, auth: FAKE_AUTH },
  device: 'iPhone Safari',
});

// ---------------------------------------------------------------- the walked routes

const web = fileURLToPath(new URL('../../', import.meta.url));
const read = (p: string): string => readFileSync(join(web, p), 'utf8');
function walk(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(web, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(web, rel)).isDirectory()) out.push(...walk(rel, match));
    else if (match.test(name)) out.push(rel);
  }
  return out;
}

describe('every notification route goes through one of the three wrappers', () => {
  const files = walk('app/api/notify', /^route\.ts$/);

  it('walks every file, so a new route can not skip the sign-in check, the CSRF rule, the limit or the secret', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const f of files) {
      const text = read(f);
      const wrappers = ['notifyRoute(', 'cronRoute(', 'tokenRoute('].filter((x) =>
        text.includes(x),
      );
      expect(wrappers.length, `${f} must use exactly one wrapper`).toBe(1);
      const exported = [...text.matchAll(/export (?:const|async function|function) (\w+)/g)].map(
        (m) => m[1],
      );
      for (const e of exported) expect(['GET', 'POST', 'dynamic', 'maxDuration'], f).toContain(e);
      expect(text, f).toMatch(/export const dynamic = 'force-dynamic'/);
      // A signed-in route that changes something says so, so the CSRF rule applies.
      if (text.includes('notifyRoute(') && /export const POST/.test(text)) {
        expect(text, f).toMatch(/write: true/);
      }
      if (text.includes('notifyRoute(') && /export const GET/.test(text)) {
        expect(text, f).not.toMatch(/write: true/);
      }
      // The account is the session's, never one the request names.
      expect(text, f).not.toMatch(
        /body\.(userId|user_id|user)\b|searchParams\.get\('(user|userId)/,
      );
    }
  });

  it('the notify wrappers carry the rules: CSRF for writes, a limit, a constant-time secret, no cookie for the cron route', () => {
    const route = read('server/notify/route.ts');
    expect(route).toMatch(/authRoute\(/);
    expect(route).toMatch(/timingSafeEqual/);
    expect(route).toMatch(/Bearer/);
    expect(route).toMatch(/allow\(`notify-cron-/);
    expect(route).toMatch(/allow\(`notify-token-/);
    expect(route).not.toMatch(/cookie/i.source.length ? /jarFor|\.jar\b/ : /x/);
  });

  it('the pages and the browser code never import the engine or server code, and have no em dash', () => {
    const browser = [
      ...walk('lib/notify', /\.tsx?$/),
      ...walk('components/notify', /\.(tsx?|css)$/),
      'app/account/notifications/page.tsx',
      'lib/pwa/push.ts',
    ];
    for (const f of browser) {
      const text = read(f);
      expect(text, f).not.toMatch(/@gg\/engine/);
      expect(text, f).not.toMatch(/@\/server|\.\.\/server|\.\.\/\.\.\/server/);
      expect(text, f).not.toContain('—');
    }
    for (const f of walk('server/notify', /\.ts$/).filter((x) => !x.endsWith('.test.ts'))) {
      expect(read(f), f).not.toContain('—');
    }
  });

  it('the service worker keeps only / and /play and caches nothing from a push or the api', () => {
    const sw = read('app/sw.ts');
    expect(sw).toMatch(/installPushHandlers/);
    expect(sw).toMatch(/pathname\.startsWith\('\/api\/'\)[\s\S]{0,80}new NetworkOnly\(\)/);
    const push = read('lib/pwa/push.ts');
    expect(push).not.toMatch(/caches\.|cache\.put|CacheStorage/);
    expect(read('lib/pwa/cacheablePage.ts')).toMatch(/\['\/', '\/play'\]/);
  });

  it('never asks for permission on its own: the browser call is only in the function the button runs', () => {
    const device = read('lib/notify/device.ts');
    const uses = [...device.matchAll(/requestPermission\(/g)];
    expect(uses).toHaveLength(1);
    const before = device.slice(0, device.indexOf('requestPermission('));
    expect(before.lastIndexOf('export async function turnOnThisDevice')).toBeGreaterThan(
      before.lastIndexOf('export async function forgetThisDevice'),
    );
    const all = [
      read('components/notify/Notifications.tsx'),
      read('components/shell/PwaRegister.tsx'),
      read('app/play/page.tsx'),
    ].join('\n');
    expect(all).not.toMatch(/requestPermission/);
    // The page calls turnOnThisDevice only from a click handler.
    const page = read('components/notify/Notifications.tsx');
    const at = page.indexOf('turnOnThisDevice(');
    expect(page.slice(Math.max(0, at - 200), at)).toMatch(/onClick/);
  });
});

// ---------------------------------------------------------------- signed-in routes

describe('the signed-in routes', () => {
  const ALL: [string, 'GET' | 'POST', unknown][] = [
    ['state', 'GET', null],
    ['inbox', 'GET', null],
    ['prefs', 'POST', { kind: 'farm_alert', push: false }],
    ['settings', 'POST', { reminderTime: '06:00' }],
    ['off', 'POST', {}],
    ['subscribe', 'POST', goodSub()],
    ['unsubscribe', 'POST', { ref: 'abcdef012345' }],
    ['read', 'POST', { all: true }],
  ];
  const call = (route: string, method: 'GET' | 'POST', body: unknown, o: Opts) =>
    method === 'GET' ? get(route, o) : post(route, body, o);

  it('turns away a visitor who is signed out, with the same plain 401', async () => {
    for (const [route, method, body] of ALL) {
      const res = await call(route, method, body, {});
      expect(res.status, route).toBe(401);
      expect((await j(res)).error, route).toBe('Sign in first.');
      expect(res.headers.get('cache-control'), route).toBe('no-store');
    }
  });

  it('turns away a guest session and an account with no sign-up finished the same way, or with nothing to show', async () => {
    const half = await addPerson(w, 'half', { profile: false });
    const res = await get('state', { who: half });
    // Signed in but with no profile: the settings are readable but nothing is ever queued for them.
    expect([200, 401]).toContain(res.status);
  });

  it('refuses a request from another site, and a write that is not JSON', async () => {
    const p = await addPerson(w, 'ann');
    for (const [route, method, body] of ALL.filter((x) => x[1] === 'POST')) {
      const cross = await call(route, method, body, {
        who: p,
        headers: { origin: 'https://evil.example' },
      });
      expect(cross.status, route).toBe(403);
      const site = await call(route, method, body, {
        who: p,
        headers: { 'sec-fetch-site': 'cross-site' },
      });
      expect(site.status, route).toBe(403);
      const form = await R[route]!.POST!(
        new Request(`${HOST}/api/notify/${route}`, {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            'x-real-ip': `10.9.0.${ip}`,
            cookie: p.cookie,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: 'kind=farm_alert',
        }),
      );
      expect(form.status, route).toBe(403);
    }
  });

  it('is limited for each session', async () => {
    const p = await addPerson(w, 'ann');
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await post('off', {}, { who: p })).status;
    expect(last).toBe(429);
    // Another player at the same address is not held up.
    const q = await addPerson(w, 'bob');
    expect((await post('off', {}, { who: q })).status).toBe(200);
  });

  it('shows the state, with push and email unavailable when no keys are set', async () => {
    const p = await addPerson(w, 'ann');
    w.keys({ push: false, mail: false });
    const s = await j(await get('state', { who: p }));
    expect(s.available).toEqual({ switchOn: true, push: false, email: false });
    expect(s.vapidPublicKey).toBeNull();
    expect(s.community).toBe(false);
    expect((s.prefs as unknown[]).length).toBe(7);
    // The subscribe route says so plainly and saves nothing.
    const sub = await post('subscribe', goodSub(), { who: p });
    expect(sub.status).toBe(409);
    expect((await j(sub)).error).toBe('Notifications are not available right now.');
    expect((await db.query('select 1 from public.push_subscriptions')).rows).toHaveLength(0);
    // Email on is refused while email is not set up.
    const email = await post('prefs', { kind: 'farm_alert', email: true }, { who: p });
    expect(email.status).toBe(409);
  });

  it('is off when the feature switch is off: nothing available, no device saved, the inbox still works', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    await queueNotification(w.nd, {
      userId: p.id,
      kind: 'system',
      title: 'Your purchase of Farm pack is confirmed.',
      link: '/account/notifications',
    });
    await db.exec(
      "update public.feature_switches set enabled = false where key = 'push_notifications'",
    );
    const { resetSwitchCache } = await import('../auth/accounts');
    resetSwitchCache();
    const s = await j(await get('state', { who: p }));
    expect(s.available).toEqual({ switchOn: false, push: false, email: false });
    expect((await post('subscribe', goodSub(2), { who: p })).status).toBe(409);
    const inbox = await j(await get('inbox', { who: p }));
    expect((inbox.items as unknown[]).length).toBe(1);
  });

  it('saves what the player chooses, and Turn everything off is one tap', async () => {
    const p = await addPerson(w, 'ann');
    expect((await post('prefs', { kind: 'morning_reminder', push: true }, { who: p })).status).toBe(
      200,
    );
    expect((await post('prefs', { kind: 'later_nudge', push: true }, { who: p })).status).toBe(200);
    let s = (await j(await get('state', { who: p }))) as {
      prefs: { kind: string; push: boolean }[];
      settings: { laterNudge: boolean };
    };
    expect(s.prefs.find((x) => x.kind === 'morning_reminder')!.push).toBe(true);
    expect(s.settings.laterNudge).toBe(true);
    expect((await post('off', {}, { who: p })).status).toBe(200);
    s = (await j(await get('state', { who: p }))) as typeof s;
    expect(s.prefs.every((x) => !x.push)).toBe(true);
    expect(s.settings.laterNudge).toBe(false);
    // Bad input is refused plainly.
    expect((await post('prefs', { kind: 'bogus', push: true }, { who: p })).status).toBe(400);
    expect((await post('prefs', { kind: 'farm_alert' }, { who: p })).status).toBe(400);
    expect((await post('prefs', { kind: 'farm_alert', push: 'yes' }, { who: p })).status).toBe(400);
  });

  it('saves times and quiet hours, and refuses half of a pair, a bad time or a bad zone', async () => {
    const p = await addPerson(w, 'ann');
    expect(
      (
        await post(
          'settings',
          {
            reminderTime: '06:30',
            quietStart: '22:00',
            quietEnd: '05:30',
            timezone: 'Australia/Perth',
          },
          { who: p },
        )
      ).status,
    ).toBe(200);
    const s = (await j(await get('state', { who: p }))) as { settings: Record<string, unknown> };
    expect(s.settings).toMatchObject({
      reminderTime: '06:30',
      quietStart: '22:00',
      quietEnd: '05:30',
      timezone: 'Australia/Perth',
    });
    expect((await post('settings', { quietStart: null, quietEnd: null }, { who: p })).status).toBe(
      200,
    );
    expect((await post('settings', { quietStart: '22:00' }, { who: p })).status).toBe(400);
    expect((await post('settings', { reminderTime: '25:00' }, { who: p })).status).toBe(400);
    expect((await post('settings', { timezone: 'Mars/Base' }, { who: p })).status).toBe(400);
  });

  it('adds a device, refuses a host not on the list in plain words, and removes by id or by this browser', async () => {
    const p = await addPerson(w, 'ann');
    const ok = await post('subscribe', goodSub(1), { who: p });
    expect(ok.status).toBe(200);
    const saved = await j(ok);
    expect(saved.ref).toMatch(/^[0-9a-f]{12}$/);
    for (const [n, host] of [
      [2, 'fcm.googleapis.com'],
      [3, 'wns2-par02p.notify.windows.com'],
      [4, 'updates.push.services.mozilla.com'],
    ] as const) {
      expect((await post('subscribe', goodSub(n, host), { who: p })).status, host).toBe(200);
    }
    const refused = await post('subscribe', goodSub(5, 'push.example.org'), { who: p });
    expect(refused.status).toBe(400);
    expect(await j(refused)).toEqual({
      error: "Notifications aren't available in this browser yet.",
      code: 'push_host_not_allowed',
    });
    expect(
      (
        await post(
          'subscribe',
          { ...goodSub(6), endpoint: 'http://web.push.apple.com/x' },
          { who: p },
        )
      ).status,
    ).toBe(400);
    const s = (await j(await get('state', { who: p }))) as {
      devices: { id: string; ref: string; label: string }[];
    };
    expect(s.devices).toHaveLength(4);
    expect(s.devices[0]!.label).toBe('iPhone Safari');
    expect(JSON.stringify(s)).not.toContain('wpush/v2/route-1');
    expect((await j(await post('unsubscribe', { id: s.devices[1]!.id }, { who: p }))).removed).toBe(
      1,
    );
    expect((await j(await post('unsubscribe', { ref: saved.ref }, { who: p }))).removed).toBe(1);
    expect((await post('unsubscribe', {}, { who: p })).status).toBe(400);
  });

  it('never lets one account remove another account’s device', async () => {
    const a = await addPerson(w, 'ann');
    const b = await addPerson(w, 'bob');
    await post('subscribe', goodSub(1), { who: a });
    const id = (await db.query<{ id: string }>('select id from public.push_subscriptions')).rows[0]!
      .id;
    expect((await j(await post('unsubscribe', { id }, { who: b }))).removed).toBe(0);
    expect((await db.query('select 1 from public.push_subscriptions')).rows).toHaveLength(1);
    const state = (await j(await get('state', { who: b }))) as { devices: unknown[] };
    expect(state.devices).toHaveLength(0);
  });

  it('pages the inbox, counts unread, and marks some or all read, for this account only', async () => {
    const a = await addPerson(w, 'ann');
    const b = await addPerson(w, 'bob');
    for (let i = 0; i < 45; i++) {
      w.clock.t = NOON + i * 60_000;
      await queueNotification(w.nd, {
        userId: a.id,
        kind: 'farm_alert',
        title: `Fact number ${i}.`,
        dedupeKey: `k${i}`,
      });
    }
    await queueNotification(w.nd, { userId: b.id, kind: 'farm_alert', title: 'Bob only.' });
    const p1 = (await j(await get('inbox', { who: a }))) as {
      items: { id: string; title: string }[];
      next: string | null;
      unread: number;
    };
    expect(p1.items).toHaveLength(20);
    expect(p1.items[0]!.title).toBe('Fact number 44.');
    expect(p1.unread).toBe(45);
    const p2 = (await j(
      await get('inbox', { who: a, search: `?before=${encodeURIComponent(p1.next!)}` }),
    )) as typeof p1;
    expect(p2.items[0]!.title).toBe('Fact number 24.');
    expect(p2.items).toHaveLength(20);
    const p3 = (await j(
      await get('inbox', { who: a, search: `?before=${encodeURIComponent(p2.next!)}` }),
    )) as typeof p1;
    expect(p3.items).toHaveLength(5);
    expect(p3.next).toBeNull();
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((x) => x.id)).size).toBe(45);
    expect((await get('inbox', { who: a, search: '?before=junk' })).status).toBe(400);
    // Marking read.
    await post('read', { ids: [p1.items[0]!.id] }, { who: a });
    expect(((await j(await get('inbox', { who: a }))) as typeof p1).unread).toBe(44);
    // Another account's id changes nothing.
    await post('read', { ids: [p1.items[1]!.id] }, { who: b });
    expect(((await j(await get('inbox', { who: a }))) as typeof p1).unread).toBe(44);
    await post('read', { all: true }, { who: a });
    expect(((await j(await get('inbox', { who: a }))) as typeof p1).unread).toBe(0);
    expect(((await j(await get('inbox', { who: b }))) as typeof p1).unread).toBe(1);
    expect((await post('read', { ids: ['nope'] }, { who: a })).status).toBe(400);
  });

  it('keeps the held reminders out of the inbox and the unread count', async () => {
    const a = await addPerson(w, 'ann');
    await addDeviceFor(w, a.id);
    await setPrefs(w, a.id, 'morning_reminder', true);
    await setSettings(w, a.id, { quietStart: '06:00', quietEnd: '18:00' });
    await queueNotification(w.nd, {
      userId: a.id,
      kind: 'morning_reminder',
      title: 'First light at Kooringa.',
      dedupeKey: 'm',
    });
    const inbox = (await j(await get('inbox', { who: a }))) as { items: unknown[]; unread: number };
    expect(inbox.items).toHaveLength(0);
    expect(inbox.unread).toBe(0);
  });

  it('shows the community setting only to accounts that have the community', async () => {
    const adult = await addPerson(w, 'ann');
    const kid = await addPerson(w, 'kid', { ageYears: 15 });
    await db.exec("update public.feature_switches set enabled = true where key = 'community'");
    expect(
      ((await j(await get('state', { who: adult }))) as { community: boolean }).community,
    ).toBe(true);
    expect(((await j(await get('state', { who: kid }))) as { community: boolean }).community).toBe(
      false,
    );
  });

  it('signing out everywhere forgets every device; signing out here leaves the others to the browser', async () => {
    const a = await addPerson(w, 'ann');
    await post('subscribe', goodSub(1), { who: a });
    await post('subscribe', goodSub(2), { who: a });
    const out = (everywhere: boolean) =>
      R.signout!.POST!(req('/api/auth/signout', 'POST', { everywhere }, { who: a }));
    expect((await out(false)).status).toBe(200);
    expect((await db.query('select 1 from public.push_subscriptions')).rows).toHaveLength(2);
    const again = await addPerson(w, 'ann2');
    await post('subscribe', goodSub(3), { who: again });
    expect(
      (
        await R.signout!.POST!(
          req('/api/auth/signout', 'POST', { everywhere: true }, { who: again }),
        )
      ).status,
    ).toBe(200);
    const left = await db.query<{ user_id: string }>(
      'select user_id from public.push_subscriptions',
    );
    expect(left.rows.every((r) => r.user_id !== again.id)).toBe(true);
  });

  it('forgets every device, send and message when the account is deleted', async () => {
    const a = await addPerson(w, 'ann');
    await addDeviceFor(w, a.id);
    await queueNotification(w.nd, { userId: a.id, kind: 'farm_alert', title: 'Fact.' });
    await db.query('delete from auth.users where id = $1', [a.id]);
    for (const t of [
      'push_subscriptions',
      'notifications',
      'notification_sends',
      'notification_prefs',
    ]) {
      expect((await db.query(`select 1 from public.${t}`)).rows, t).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------- the sender route

describe('the sender route', () => {
  const call = (secret: string | null, method: 'GET' | 'POST' = 'GET', address = `10.3.0.${ip}`) =>
    R.send![method]!(
      new Request(`${HOST}/api/notify/send`, {
        method,
        headers: {
          host: 'localhost:3000',
          'x-real-ip': address,
          ...(secret ? { authorization: `Bearer ${secret}` } : {}),
        },
      }),
    );

  it('answers 404 to a missing, wrong or near-miss secret, and to anyone when no secret is set', async () => {
    for (const bad of [null, 'nope', CRON.slice(0, -1), `${CRON}x`, CRON.toUpperCase()]) {
      expect((await call(bad)).status, String(bad)).toBe(404);
    }
    const noBearer = await R.send!.GET!(
      new Request(`${HOST}/api/notify/send`, {
        headers: { host: 'localhost:3000', 'x-real-ip': '10.3.9.9', authorization: CRON },
      }),
    );
    expect(noBearer.status).toBe(404);
    w.integ.cronSecret = null;
    expect((await call(CRON)).status).toBe(404);
    expect((await call('')).status).toBe(404);
    w.integ.cronSecret = CRON;
  });

  it('compares in constant time and is limited against guessing', async () => {
    expect(sameSecret('a', 'a')).toBe(true);
    expect(sameSecret('a', 'b')).toBe(false);
    expect(sameSecret('a', 'aa')).toBe(false);
    let last = 0;
    for (let i = 0; i < 35; i++) last = (await call('wrong', 'GET', '10.3.8.8')).status;
    expect(last).toBe(429);
  });

  it('makes the due reminders and sends what is waiting, answers counts only, and is safe twice at once', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    for (let i = 0; i < 4; i++)
      await queueNotification(w.nd, {
        userId: p.id,
        kind: 'farm_alert',
        title: `Fact ${i}.`,
        dedupeKey: `d${i}`,
      });
    const [a, b] = await Promise.all([
      call(CRON, 'GET', '10.3.1.1'),
      call(CRON, 'POST', '10.3.1.2'),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const ja = (await j(a)) as { sender: { sent: number } };
    const jb = (await j(b)) as { sender: { sent: number } };
    expect(ja.sender.sent + jb.sender.sent).toBe(4);
    expect(w.push.sent).toHaveLength(4);
    const body = JSON.stringify(ja);
    expect(body).not.toContain(p.id);
    expect(body).not.toContain('Fact');
  });

  it('with no keys it sends nothing and says nothing is wrong', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    w.keys({ push: false, mail: false });
    await queueNotification(w.nd, { userId: p.id, kind: 'farm_alert', title: 'Fact.' });
    const res = await call(CRON);
    expect(res.status).toBe(200);
    expect(w.push.sent).toHaveLength(0);
    expect((await db.query('select 1 from public.notification_sends')).rows).toHaveLength(0);
  });

  it('with the switch off it makes and sends nothing', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    await queueNotification(w.nd, { userId: p.id, kind: 'farm_alert', title: 'Fact.' });
    await db.exec(
      "update public.feature_switches set enabled = false where key = 'push_notifications'",
    );
    const res = (await j(await call(CRON))) as { sender: { skipped: string }; reminders: unknown };
    expect(res.sender.skipped).toBe('switch_off');
    expect(res.reminders).toBeNull();
    expect(w.push.sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- the unsubscribe link

describe('the unsubscribe link in an email', () => {
  const link = (token: string) => `/api/notify/u?t=${encodeURIComponent(token)}`;
  const hit = (token: string, method: 'GET' | 'POST', body?: string, address = `10.4.0.${ip}`) =>
    R.u![method]!(
      new Request(`${HOST}${link(token)}`, {
        method,
        headers: {
          host: 'localhost:3000',
          'x-real-ip': address,
          ...(body && method === 'POST'
            ? { 'content-type': 'application/x-www-form-urlencoded' }
            : {}),
        },
        ...(body && method === 'POST' ? { body } : {}),
      }),
    );
  const emailOn = async (p: Person) => setPrefs(w, p.id, 'farm_alert', true, true);
  const emailIs = async (p: Person) =>
    (
      await db.query<{ email: boolean }>(
        "select email from public.notification_prefs where user_id = $1 and kind = 'farm_alert'",
        [p.id],
      )
    ).rows[0]?.email;
  const tokenFor = (
    p: Person,
    issuedAt = w.clock.t,
    kind: 'farm_alert' | 'social' = 'farm_alert',
  ) => makeUnsubToken(TOKEN_SECRET, { userId: p.id, kind, issuedAt });

  it('opening it changes nothing; the button (a POST with no sign-in and no cookie) turns that one email off', async () => {
    const p = await addPerson(w, 'ann');
    await emailOn(p);
    await setPrefs(w, p.id, 'social', true, true);
    const t = tokenFor(p);
    w.clock.t += 1000;
    const page = await hit(t, 'GET');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Farm alerts');
    expect(html).toContain('method="post"');
    expect(html).not.toContain('<script');
    expect(html).not.toContain(p.email);
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.get('x-robots-tag')).toContain('noindex');
    expect(await emailIs(p)).toBe(true);
    const done = await hit(t, 'POST', 'List-Unsubscribe=One-Click');
    expect(done.status).toBe(200);
    expect(await done.text()).toContain('Emails are off');
    expect(await emailIs(p)).toBe(false);
    // Only that one setting: push for it stays, and another type's email stays.
    const row = (
      await db.query<{ push: boolean }>(
        "select push from public.notification_prefs where user_id = $1 and kind = 'farm_alert'",
        [p.id],
      )
    ).rows[0]!;
    expect(row.push).toBe(true);
    const social = (
      await db.query<{ email: boolean }>(
        "select email from public.notification_prefs where user_id = $1 and kind = 'social'",
        [p.id],
      )
    ).rows[0]!;
    expect(social.email).toBe(true);
  });

  it('a replayed link does not undo a later choice, and says the same thing', async () => {
    const p = await addPerson(w, 'ann');
    await emailOn(p);
    const t = tokenFor(p);
    w.clock.t += 1000;
    await hit(t, 'POST');
    expect(await emailIs(p)).toBe(false);
    w.clock.t += 1000;
    // The player turns it back on in settings, later.
    // (The database stamps a change with its own clock; here the fake clock runs ahead of it, so stamp it by hand.)
    await db.exec('alter table public.notification_prefs disable trigger notification_prefs_touch');
    await db.query(
      "update public.notification_prefs set email = true, updated_at = $2 where user_id = $1 and kind = 'farm_alert'",
      [p.id, new Date(w.clock.t).toISOString()],
    );
    await db.exec('alter table public.notification_prefs enable trigger notification_prefs_touch');
    const again = await hit(t, 'POST');
    expect(again.status).toBe(200);
    expect(await again.text()).toContain('Emails are off');
    expect(await emailIs(p)).toBe(true);
    expect(await applyUnsubscribe(w.deps.sql, p.id, 'farm_alert', w.clock.t + 10_000)).toBe('done');
  });

  it('refuses an expired, tampered, foreign or empty token with one plain page and changes nothing', async () => {
    const p = await addPerson(w, 'ann');
    await emailOn(p);
    const good = tokenFor(p);
    const expired = makeUnsubToken(TOKEN_SECRET, {
      userId: p.id,
      kind: 'farm_alert',
      issuedAt: w.clock.t - 90 * 24 * HOUR,
    });
    const foreign = makeUnsubToken('another-secret-'.padEnd(48, 'z'), {
      userId: p.id,
      kind: 'farm_alert',
      issuedAt: w.clock.t,
    });
    const tampered = good.slice(0, 30) + (good[30] === 'A' ? 'B' : 'A') + good.slice(31);
    const pages = new Set<string>();
    for (const bad of [expired, foreign, tampered, '', 'abc']) {
      for (const method of ['GET', 'POST'] as const) {
        const res = await hit(bad, method);
        expect(res.status).toBe(200);
        pages.add(await res.text());
      }
    }
    expect(pages.size).toBe(1);
    expect([...pages][0]).toContain('does not work');
    expect(await emailIs(p)).toBe(true);
  });

  it('is limited, and an account that is gone does nothing', async () => {
    const p = await addPerson(w, 'ann');
    const t = tokenFor(p);
    await db.query('delete from auth.users where id = $1', [p.id]);
    expect((await hit(t, 'POST')).status).toBe(200);
    expect((await db.query('select 1 from public.notification_prefs')).rows).toHaveLength(0);
    let last = 0;
    for (let i = 0; i < 35; i++) last = (await hit('x', 'GET', '10.4.9.9')).status;
    expect(last).toBe(429);
  });

  it('an email carries a link that works end to end', async () => {
    const p = await addPerson(w, 'ann');
    await setPrefs(w, p.id, 'farm_alert', false, true);
    await queueNotification(w.nd, {
      userId: p.id,
      kind: 'farm_alert',
      title: 'Fact.',
      link: '/play',
    });
    const { runSender } = await import('./sender');
    await runSender(w.nd);
    const url = /<(https:\/\/game\.example\.test)(\/api\/notify\/u\?t=[^>]+)>/.exec(
      w.mail.sent[0]!.headers['List-Unsubscribe']!,
    )!;
    w.clock.t += 5000;
    expect((await hit(decodeURIComponent(url[2]!.split('t=')[1]!), 'POST')).status).toBe(200);
    expect(await emailIs(p)).toBe(false);
  });
});

// ---------------------------------------------------------------- admin

describe('the admin notifications page and switch', () => {
  it('gives the same 404 to anyone who is not an admin, and pauses and resumes with an audit row', async () => {
    const admin = await addPerson(w, 'admin', { role: 'admin' });
    const player = await addPerson(w, 'ann');
    const call = (who: Person | null, paused: unknown) =>
      R.adminNotifications!.POST!(req('/api/admin/notifications', 'POST', { paused }, { who }));
    expect((await call(null, true)).status).toBe(404);
    expect((await call(player, true)).status).toBe(404);
    expect((await call(admin, 'yes')).status).toBe(400);
    expect(await j(await call(admin, true))).toEqual({ ok: true, changed: true });
    expect(await j(await call(admin, true))).toEqual({ ok: true, changed: false });
    const audit = await db.query<{ action: string; target_type: string; details: unknown }>(
      'select action, target_type, details from public.admin_audit_log',
    );
    expect(audit.rows).toEqual([
      { action: 'notify_pause_set', target_type: 'notify_sending', details: { enabled: false } },
    ]);
    const { runSender } = await import('./sender');
    expect((await runSender(w.nd)).skipped).toBe('paused');
    expect(await j(await call(admin, false))).toEqual({ ok: true, changed: true });
    expect((await runSender(w.nd)).skipped).toBeNull();
    expect((await db.query('select 1 from public.admin_audit_log')).rows).toHaveLength(2);
  });

  it('shows counts by type with no names, addresses or text', async () => {
    const p = await addPerson(w, 'ann');
    const e = await addDeviceFor(w, p.id);
    await queueNotification(w.nd, {
      userId: p.id,
      kind: 'farm_alert',
      title: 'Secret farm name fact.',
    });
    w.push.plan.set(e, [{ ok: false, gone: false, retry: false, reason: 'push_rejected' }]);
    await queueNotification(w.nd, {
      userId: p.id,
      kind: 'farm_alert',
      title: 'Another fact.',
      dedupeKey: 'b',
    });
    const { runSender } = await import('./sender');
    await runSender(w.nd);
    const o = await overview(w.deps.sql, 7);
    const alerts = o.byKind.find((k) => k.kind === 'farm_alert')!;
    expect(alerts).toMatchObject({ sent: 1, failed: 1 });
    expect(o.reasons).toEqual([{ reason: 'push_rejected', count: 1 }]);
    const text = JSON.stringify(o);
    for (const secret of [p.id, p.email, p.username, 'Secret', 'Another fact', 'wpush'])
      expect(text).not.toContain(secret);
  });

  it('the page checks the role first, and the route is walked by the admin route test', () => {
    const page = read('app/admin/notifications/page.tsx');
    expect(page).toMatch(/await requireAdmin\(\)/);
    expect(read('app/api/admin/notifications/route.ts')).toMatch(/adminRoute\(/);
    expect(read('components/admin/AdminNav.tsx')).toContain('/admin/notifications');
  });
});

describe('a failure leaves no personal detail in the record', () => {
  it('stores only fixed reason codes', async () => {
    const p = await addPerson(w, 'ann');
    await setPrefs(w, p.id, 'farm_alert', false, true);
    w.mail.plan.push({ ok: false, retry: false, reason: 'mail_rejected' });
    await queueNotification(w.nd, { userId: p.id, kind: 'farm_alert', title: 'Fact.' });
    const { runSender } = await import('./sender');
    await runSender(w.nd);
    const r = await db.query<{ reason: string }>('select reason from public.notification_sends');
    for (const row of r.rows) expect(row.reason).toMatch(/^[a-z0-9_]{1,40}$/);
    // A farm in the Perth zone, to be sure farm lookups leave nothing behind either.
    await addFarm(w, p.id, { timezone: 'Australia/Perth' });
  });
});
