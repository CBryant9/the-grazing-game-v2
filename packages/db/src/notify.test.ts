import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ID, as, freshDb, passed, rows, type Outcome } from './harness';

// Milestone 3.4: the push hosts for Chrome and Edge, the inbox's two new columns, and the send queue.

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
}, 120_000);
afterAll(async () => {
  await db?.close();
});

const errorOf = (o: Outcome): string => (o.ok ? '' : o.error);
const addDevice = (endpoint: string) =>
  as(
    db,
    'a',
    `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values ('${ID.a}', '${endpoint}', 'k', 'a')`,
  );

describe('the push hosts', () => {
  it('lists Apple, Mozilla, Chrome and Edge, each with the vendor page it was read from', async () => {
    const r = await rows<{ host: string; include_subdomains: boolean; source_url: string }>(
      db,
      'select host, include_subdomains, source_url from public.push_service_hosts order by host',
    );
    expect(r.map((x) => [x.host, x.include_subdomains])).toEqual([
      ['fcm.googleapis.com', false],
      ['notify.windows.com', true],
      ['push.apple.com', true],
      ['updates.push.services.mozilla.com', false],
    ]);
    for (const x of r) expect(x.source_url).toMatch(/^https:\/\//);
  });

  it('accepts Chrome and Edge subscriptions and still refuses look-alikes and other hosts', async () => {
    expect((await addDevice('https://fcm.googleapis.com/fcm/send/abc')).ok).toBe(true);
    expect((await addDevice('https://wns2-par02p.notify.windows.com/w/?token=abc')).ok).toBe(true);
    for (const bad of [
      'https://evil.fcm.googleapis.com/x',
      'https://fcm.googleapis.com.evil.org/x',
      'https://googleapis.com/x',
      'https://notify.windows.com.evil.org/x',
      'https://evilnotify.windows.com.org/x',
      'https://windows.com/x',
      'https://fcm.googleapis.com@evil.org/x',
    ]) {
      expect(errorOf(await addDevice(bad)), bad).toMatch(/push_host_not_allowed|endpoint_check/);
    }
  });
});

describe('the inbox columns', () => {
  it('lets the server make one notification once per account and key, and the account read it, but not change the new columns', async () => {
    const insert = `insert into public.notifications (user_id, kind, title, dedupe_key) values ('${ID.a}', 'farm_alert', 'x', 'k1')`;
    expect((await as(db, 'service', insert)).ok).toBe(true);
    const again = await as(db, 'service', insert, `${insert};`);
    expect(errorOf(again)).toMatch(/notifications_dedupe|duplicate/);
    // The same key for another account is fine.
    expect(
      (
        await as(
          db,
          'service',
          `insert into public.notifications (user_id, kind, title, dedupe_key) values ('${ID.b}', 'farm_alert', 'x', 'k1')`,
        )
      ).ok,
    ).toBe(true);
    // Players can mark read, and nothing else about a message.
    expect(
      passed(
        await as(
          db,
          'a',
          `update public.notifications set read_at = now() where user_id = '${ID.a}'`,
        ),
      ),
    ).toBe(true);
    for (const col of ['show_in_inbox = false', "dedupe_key = 'z'", "title = 'changed'"]) {
      expect(
        errorOf(
          await as(db, 'a', `update public.notifications set ${col} where user_id = '${ID.a}'`),
        ),
        col,
      ).toMatch(/permission denied/);
    }
  });

  it('holds a row for each kind, including system, in the preferences', async () => {
    for (const kind of [
      'morning_reminder',
      'later_nudge',
      'farm_alert',
      'evening_warning',
      'social',
      'challenge',
      'system',
    ]) {
      const o = await as(
        db,
        'a',
        `insert into public.notification_prefs (user_id, kind, push, email) values ('${ID.a}', '${kind}', true, false) on conflict (user_id, kind) do update set push = true`,
      );
      expect(o.ok, kind).toBe(true);
    }
    expect(
      errorOf(
        await as(
          db,
          'a',
          `insert into public.notification_prefs (user_id, kind) values ('${ID.a}', 'bogus')`,
        ),
      ),
    ).toMatch(/check/);
  });
});

describe('the send queue', () => {
  it('is the server only, one row for each notification and channel, with fixed reason codes', async () => {
    const mk = async () =>
      (
        await rows<{ id: string }>(
          db,
          `insert into public.notifications (user_id, kind, title) values ('${ID.a}', 'farm_alert', 'q') returning id`,
        )
      )[0]!.id;
    const id = await mk();
    const ins = (channel: string, extra = '') =>
      `insert into public.notification_sends (notification_id, user_id, channel ${extra ? ', reason' : ''}) values ('${id}', '${ID.a}', '${channel}' ${extra ? `, '${extra}'` : ''})`;
    expect((await as(db, 'service', ins('push'))).ok).toBe(true);
    expect(errorOf(await as(db, 'service', ins('push'), `${ins('push')};`))).toMatch(
      /unique|duplicate/,
    );
    expect(errorOf(await as(db, 'service', ins('sms')))).toMatch(/check/);
    expect(errorOf(await as(db, 'service', ins('email', 'Not A Code!')))).toMatch(/check/);
    expect(errorOf(await as(db, 'service', ins('email', 'x'.repeat(41))))).toMatch(/check/);
    for (const who of ['a', 'admin', 'anon'] as const) {
      const o = await as(db, who, 'select 1 from public.notification_sends');
      expect(o.ok ? o.rows.length : -1, who).not.toBeGreaterThan(0);
    }
    // Gone with the message, and with the account.
    await db.query(`delete from public.notifications where id = '${id}'`);
    expect(await rows(db, 'select 1 from public.notification_sends')).toHaveLength(0);
  });

  it('holds a send until it is due, even a long way off', async () => {
    const id = (
      await rows<{ id: string }>(
        db,
        `insert into public.notifications (user_id, kind, title) values ('${ID.a}', 'farm_alert', 'q') returning id`,
      )
    )[0]!.id;
    await db.query(
      `insert into public.notification_sends (notification_id, user_id, channel, state, not_before) values ('${id}', '${ID.a}', 'email', 'held', 'infinity')`,
    );
    const due = await rows(
      db,
      "select 1 from public.notification_sends where state = 'held' and not_before <= now()",
    );
    expect(due).toHaveLength(0);
  });
});
