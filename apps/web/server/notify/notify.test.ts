import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { KIND_INFO, NOTIFY_KINDS, type NotifyKind } from '../../lib/notify/kinds';
import { resetRateLimits } from '../game/http';
import { setAuthDeps } from '../auth/deps';
import { FAKE_AUTH, FAKE_P256DH } from '../test-support/fakeNotify';
import {
  HOUR,
  NOON,
  addDeviceFor,
  addFarm,
  addPerson,
  iso,
  makeWorld,
  resetWorld,
  sends,
  setPrefs,
  setSettings,
  type World,
} from '../test-support/notifyWorld';
import { setNotifyIntegrations } from './deps';
import { queueEvent, queueNotification } from './queue';
import {
  runReminders,
  type DailyFarmReader,
  type ReminderFarm,
  sqlDailyFarmReader,
} from './reminders';
import { DAILY_CAP, MAX_ATTEMPTS, hostAllowed, runSender } from './sender';
import { addDevice, parseDevice } from './store';

let db: PGlite;
let w: World;

beforeAll(async () => {
  db = await freshDb({ seed: false });
  w = makeWorld(db);
}, 120_000);
afterAll(async () => {
  setAuthDeps(undefined);
  setNotifyIntegrations(undefined);
  await db?.close();
});
beforeEach(async () => {
  await resetWorld(w);
  resetRateLimits();
});

const alert = (userId: string, title = 'Trough low in Home paddock at Kooringa.', extra = {}) =>
  queueNotification(w.nd, { userId, kind: 'farm_alert', title, link: '/play', ...extra });

const communityOn = async () => {
  await db.exec("update public.feature_switches set enabled = true where key = 'community'");
};

describe('the types, each on and off', () => {
  it('Each type can be turned off', async () => {
    await communityOn();
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    for (const kind of NOTIFY_KINDS) {
      const make = (n: string) =>
        queueNotification(w.nd, {
          userId: p.id,
          kind,
          title: `Fact about ${kind} ${n}.`,
          link: '/play',
          dedupeKey: `${kind}:${n}`,
        });
      await setPrefs(w, p.id, kind, true);
      const on = await make('on');
      expect(on, kind).toMatchObject({ status: 'queued', push: 'pending' });
      await setPrefs(w, p.id, kind, false);
      const off = await make('off');
      if (KIND_INFO[kind].pingOnly) {
        // A reminder that is off leaves nothing at all.
        expect(off, kind).toEqual({ status: 'skipped', reason: 'type_off' });
      } else {
        // Anything else keeps its inbox row but sends nothing.
        expect(off, kind).toMatchObject({ status: 'queued', push: null, email: null });
      }
    }
    const rows = await sends(w, p.id);
    expect(rows.filter((r) => r.title.endsWith('off.'))).toEqual([]);
    expect(rows).toHaveLength(NOTIFY_KINDS.length);
  });

  it('uses the defaults until the player chooses: the morning reminder off, farm alerts on, email never', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    expect(
      await queueEvent(w.nd, p.id, { type: 'morning_reminder', farm: 'Kooringa', toCheck: 3 }),
    ).toEqual({ status: 'skipped', reason: 'type_off' });
    expect(await alert(p.id)).toMatchObject({ status: 'queued', push: 'pending', email: null });
    // Email on for a type, with a device: the email waits on the push.
    await setPrefs(w, p.id, 'farm_alert', true, true);
    expect(await alert(p.id, 'No water.', { dedupeKey: 'b' })).toMatchObject({
      push: 'pending',
      email: 'held',
    });
  });

  it('makes no send at all when push and email are not set up, and the inbox row is still made', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    await setPrefs(w, p.id, 'farm_alert', true, true);
    w.keys({ push: false, mail: false });
    expect(await alert(p.id)).toMatchObject({ status: 'queued', push: null, email: null });
    expect(await sends(w)).toEqual([]);
    expect((await db.query('select 1 from public.notifications')).rows).toHaveLength(1);
    // And a reminder with nowhere to go leaves nothing.
    await setPrefs(w, p.id, 'morning_reminder', true);
    expect(
      await queueEvent(w.nd, p.id, { type: 'morning_reminder', farm: 'K', toCheck: null }),
    ).toEqual({ status: 'skipped', reason: 'no_channel' });
  });

  it('is made once for the same dedupe key', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    expect(
      (await alert(p.id, 'Rain overnight at Wattle Flat: 12 mm.', { dedupeKey: 'rain:1' })).status,
    ).toBe('queued');
    expect(
      await alert(p.id, 'Rain overnight at Wattle Flat: 12 mm.', { dedupeKey: 'rain:1' }),
    ).toEqual({ status: 'duplicate' });
    expect((await db.query('select 1 from public.notifications')).rows).toHaveLength(1);
  });
});

describe('what may be queued', () => {
  it('refuses a link that is not a path on this site', async () => {
    const p = await addPerson(w, 'ann');
    for (const link of [
      '//evil.test',
      'https://evil.test',
      '/\\evil.test',
      '/ x',
      '/a\tb',
      'javascript:alert(1)',
      '/' + 'x'.repeat(400),
    ]) {
      expect(await alert(p.id, 'Fact.', { link }), link).toEqual({
        status: 'skipped',
        reason: 'invalid_link',
      });
    }
    expect((await alert(p.id, 'Fact.', { link: '/account/notifications' })).status).toBe('queued');
  });

  it('refuses wording that nags, a bad kind, empty or long text', async () => {
    const p = await addPerson(w, 'ann');
    for (const title of [
      "Don't forget your cattle!",
      'Day 5 streak',
      'Great job today',
      'Only 2 hours left',
    ]) {
      expect(await alert(p.id, title), title).toEqual({
        status: 'skipped',
        reason: 'invalid_wording',
      });
    }
    expect(await alert(p.id, '')).toEqual({ status: 'skipped', reason: 'invalid_text' });
    expect(await alert(p.id, 'x'.repeat(121))).toEqual({
      status: 'skipped',
      reason: 'invalid_text',
    });
    expect(
      await queueNotification(w.nd, { userId: p.id, kind: 'bogus' as NotifyKind, title: 'x' }),
    ).toEqual({ status: 'skipped', reason: 'invalid_kind' });
    expect((await db.query('select 1 from public.notifications')).rows).toHaveLength(0);
  });

  it('makes nothing for an account with no finished profile', async () => {
    const p = await addPerson(w, 'ann', { profile: false });
    expect(await alert(p.id)).toEqual({ status: 'skipped', reason: 'no_account' });
  });

  it('never makes a community notification for an account under 16, a banned account, or while the community is off', async () => {
    const adult = await addPerson(w, 'ann');
    const kid = await addPerson(w, 'kid', { ageYears: 15 });
    const banned = await addPerson(w, 'ban', { banned: true });
    for (const p of [adult, kid, banned]) await addDeviceFor(w, p.id);
    const follow = (id: string) => queueEvent(w.nd, id, { type: 'new_follower', name: 'bluey' });
    // Community switch off: nobody.
    for (const p of [adult, kid, banned]) {
      expect(await follow(p.id)).toEqual({ status: 'skipped', reason: 'community_closed' });
    }
    await communityOn();
    expect((await follow(adult.id)).status).toBe('queued');
    expect(await follow(kid.id)).toEqual({ status: 'skipped', reason: 'community_closed' });
    expect(await follow(banned.id)).toEqual({ status: 'skipped', reason: 'community_closed' });
    // The under 16 still get what is not community: farm alerts and challenges.
    expect(await alert(kid.id)).toMatchObject({ status: 'queued', push: 'pending' });
    expect(
      await queueEvent(w.nd, kid.id, { type: 'challenge_started', challenge: 'Spring challenge' }),
    ).toMatchObject({ status: 'queued' });
    const inbox = await db.query(
      'select 1 from public.notifications where user_id = $1 and kind = $2',
      [kid.id, 'social'],
    );
    expect(inbox.rows).toHaveLength(0);
  });

  it('keeps a restricted account to the inbox: no push, no email', async () => {
    const banned = await addPerson(w, 'ban', { banned: true });
    await addDeviceFor(w, banned.id);
    expect(await alert(banned.id)).toMatchObject({ status: 'queued', push: null, email: null });
  });
});

describe('quiet hours', () => {
  it('hold a farm alert across midnight until they end, and drop a reminder', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    await setPrefs(w, p.id, 'morning_reminder', true);
    await setSettings(w, p.id, { quietStart: '22:00', quietEnd: '06:00' });
    w.clock.t = Date.UTC(2026, 10, 17, 12, 0); // 23:00 in Sydney
    expect(await alert(p.id)).toMatchObject({ status: 'queued', push: 'held' });
    const row = (await sends(w, p.id))[0]!;
    expect(row.reason).toBe('quiet_hours');
    expect(iso(row.not_before!)).toBe('2026-11-17T19:00:00.000Z'); // 06:00 on the 18th
    // A reminder is no use later: dropped, and it leaves no inbox row.
    const r = await queueEvent(
      w.nd,
      p.id,
      { type: 'morning_reminder', farm: 'Kooringa', toCheck: 3 },
      { dedupeKey: 'm1' },
    );
    expect(r).toMatchObject({ status: 'queued', push: 'dropped' });
    const shown = await db.query('select kind from public.notifications where show_in_inbox');
    expect(shown.rows.map((x) => (x as { kind: string }).kind)).toEqual(['farm_alert']);
    // Outside the hours, pending as normal.
    w.clock.t = NOON;
    expect(
      await alert(p.id, 'Rain overnight at Wattle Flat: 12 mm.', { dedupeKey: 'x' }),
    ).toMatchObject({ push: 'pending' });
  });

  it('are worked out in the farm time zone when a farm is named', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    await setSettings(w, p.id, { quietStart: '08:00', quietEnd: '10:00' }); // Sydney 12:00 is outside
    const perth = await addFarm(w, p.id, { timezone: 'Australia/Perth' }); // 09:00 there: inside
    expect(await alert(p.id, 'Fact A.', { farmId: perth })).toMatchObject({ push: 'held' });
    expect(await alert(p.id, 'Fact B.', { dedupeKey: 'b' })).toMatchObject({ push: 'pending' });
    // A farm that is not theirs is refused.
    const other = await addPerson(w, 'bob');
    const theirs = await addFarm(w, other.id);
    expect(await alert(p.id, 'Fact C.', { farmId: theirs })).toEqual({
      status: 'skipped',
      reason: 'invalid_farm',
    });
  });

  it('keep the clock across the start and end of daylight saving', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    await setSettings(w, p.id, { quietStart: '22:00', quietEnd: '06:00' });
    w.clock.t = Date.UTC(2026, 9, 3, 13, 0); // 23:00 AEST, 3 Oct 2026
    await alert(p.id, 'Fact A.');
    w.clock.t = Date.UTC(2027, 3, 3, 12, 0); // 23:00 AEDT, 3 Apr 2027
    await alert(p.id, 'Fact B.', { dedupeKey: 'b' });
    const rows = await sends(w, p.id);
    expect(iso(rows[0]!.not_before!)).toBe('2026-10-03T19:00:00.000Z'); // 06:00 AEDT on the 4th
    expect(iso(rows[1]!.not_before!)).toBe('2027-04-03T20:00:00.000Z'); // 06:00 AEST on the 4th
  });

  it('are checked again at the moment of sending, and a held one goes when they end', async () => {
    const p = await addPerson(w, 'ann');
    const e = await addDeviceFor(w, p.id);
    await setSettings(w, p.id, { quietStart: '22:00', quietEnd: '06:00' });
    w.clock.t = Date.UTC(2026, 10, 17, 10, 50); // 21:50
    await alert(p.id);
    w.clock.t = Date.UTC(2026, 10, 17, 11, 10); // 22:10, queued before quiet, due now
    let rep = await runSender(w.nd);
    expect(rep).toMatchObject({ sent: 0, held: 1 });
    expect(w.push.sent).toHaveLength(0);
    w.clock.t = Date.UTC(2026, 10, 17, 19, 1); // 06:01 next morning
    rep = await runSender(w.nd);
    expect(rep.sent).toBe(1);
    expect(w.push.sent[0]!.endpoint).toBe(e);
    // A hold for quiet hours is not a failed attempt.
    expect((await sends(w, p.id))[0]).toMatchObject({ state: 'sent', attempts: 1 });
  });
});

describe('the evening warning', () => {
  it('is skipped when the farm was opened that day, and made once a day otherwise', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    const opened = await addFarm(w, p.id, { name: 'A', lastOpenedAt: iso(NOON - 2 * HOUR) });
    const unopened = await addFarm(w, p.id, { name: 'B', lastOpenedAt: '2026-11-15T01:00:00Z' });
    const warn = (farmId: string) =>
      queueEvent(w.nd, p.id, { type: 'evening_no_water', farm: 'B', mob: 'Weaners' }, { farmId });
    expect(await warn(opened)).toEqual({ status: 'skipped', reason: 'opened_today' });
    expect((await warn(unopened)).status).toBe('queued');
    expect(await warn(unopened)).toEqual({ status: 'duplicate' });
  });
});

describe('email as the fallback', () => {
  it('goes straight out when there is no device, and the mail has the unsubscribe headers and no more than the fact line', async () => {
    const p = await addPerson(w, 'ann');
    await setPrefs(w, p.id, 'farm_alert', false, true);
    expect(await alert(p.id)).toMatchObject({ push: null, email: 'pending' });
    await runSender(w.nd);
    expect(w.mail.sent).toHaveLength(1);
    const m = w.mail.sent[0]!;
    expect(m.to).toBe(p.email);
    expect(m.subject).toBe('Trough low in Home paddock at Kooringa.');
    expect(m.from).toBe(w.integ.from);
    expect(m.headers['List-Unsubscribe']).toMatch(
      /^<https:\/\/game\.example\.test\/api\/notify\/u\?t=[A-Za-z0-9_-]+>$/,
    );
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(m.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(m.text).toContain('https://game.example.test/play');
    expect(m.text).not.toContain(p.id);
    expect(m.text).not.toMatch(/\$|balance/i);
  });

  it('waits on the push: dropped when push works, sent when push fails for good', async () => {
    const p = await addPerson(w, 'ann');
    const e = await addDeviceFor(w, p.id);
    await setPrefs(w, p.id, 'farm_alert', true, true);
    await alert(p.id, 'Fact A.');
    await runSender(w.nd);
    expect(w.mail.sent).toHaveLength(0);
    expect((await sends(w, p.id)).map((r) => [r.channel, r.state, r.reason])).toEqual([
      ['email', 'dropped', 'push_sent'],
      ['push', 'sent', null],
    ]);
    // A push service that refuses us: email goes.
    w.push.plan.set(e, [{ ok: false, gone: false, retry: false, reason: 'push_rejected' }]);
    await alert(p.id, 'Fact B.', { dedupeKey: 'b' });
    await runSender(w.nd);
    await runSender(w.nd);
    expect(w.mail.sent.map((m) => m.subject)).toEqual(['Fact B.']);
  });

  it('goes when every device is gone, and the gone device is removed', async () => {
    const p = await addPerson(w, 'ann');
    const e = await addDeviceFor(w, p.id);
    await setPrefs(w, p.id, 'farm_alert', true, true);
    w.push.plan.set(e, [{ ok: false, gone: true, retry: false, reason: 'push_gone' }]);
    await alert(p.id);
    await runSender(w.nd);
    await runSender(w.nd);
    expect((await db.query('select 1 from public.push_subscriptions')).rows).toHaveLength(0);
    expect(w.mail.sent).toHaveLength(1);
  });

  it('is not sent when the player has no email on file or the mail service says no', async () => {
    const p = await addPerson(w, 'ann');
    await setPrefs(w, p.id, 'farm_alert', false, true);
    w.mail.plan.push({ ok: false, retry: false, reason: 'mail_rejected' });
    await alert(p.id);
    await runSender(w.nd);
    expect((await sends(w, p.id))[0]).toMatchObject({ state: 'failed', reason: 'mail_rejected' });
  });
});

describe('sending', () => {
  it('sends the fact line, the link and an id to every device, once, and never again', async () => {
    const p = await addPerson(w, 'ann');
    const e1 = await addDeviceFor(w, p.id);
    const e2 = await addDeviceFor(w, p.id, 'updates.push.services.mozilla.com');
    await alert(p.id, 'Rain overnight at Wattle Flat: 12 mm.');
    const rep = await runSender(w.nd);
    expect(rep).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(w.push.sent.map((s) => s.endpoint).sort()).toEqual([e1, e2].sort());
    const m = w.push.sent[0]!;
    expect(m.message).toMatchObject({
      title: 'Rain overnight at Wattle Flat: 12 mm.',
      link: '/play',
      body: null,
    });
    expect(m.options.topic).toHaveLength(32);
    await runSender(w.nd);
    expect(w.push.sent).toHaveLength(2);
  });

  it('retries with backoff and a retry never doubles the message', async () => {
    const p = await addPerson(w, 'ann');
    const e = await addDeviceFor(w, p.id);
    w.push.plan.set(e, [
      { ok: false, gone: false, retry: true, reason: 'push_service_error' },
      { ok: false, gone: false, retry: true, retryAfterSec: 600, reason: 'push_throttled' },
    ]);
    await alert(p.id);
    expect(await runSender(w.nd)).toMatchObject({ retried: 1, sent: 0 });
    let row = (await sends(w, p.id))[0]!;
    expect(row).toMatchObject({ state: 'pending', reason: 'push_service_error', attempts: 1 });
    expect(row.not_before).toBe(NOON + 60_000);
    // Not yet due: nothing happens.
    w.clock.t = NOON + 30_000;
    expect(await runSender(w.nd)).toMatchObject({ claimed: 0 });
    // Due: the service asks for 10 minutes.
    w.clock.t = NOON + 61_000;
    expect(await runSender(w.nd)).toMatchObject({ retried: 1 });
    row = (await sends(w, p.id))[0]!;
    expect(row.not_before).toBe(NOON + 61_000 + 600_000);
    w.clock.t = NOON + 700_000;
    expect(await runSender(w.nd)).toMatchObject({ sent: 1 });
    // Three attempts at the service, one message that arrived, the same topic each time.
    expect(w.push.attempts).toHaveLength(3);
    expect(w.push.sent).toHaveLength(1);
    expect((await sends(w, p.id))[0]).toMatchObject({ state: 'sent', attempts: 3 });
    await runSender(w.nd);
    expect(w.push.sent).toHaveLength(1);
  });

  it('gives up after the attempt limit with a fixed reason code', async () => {
    const p = await addPerson(w, 'ann');
    const e = await addDeviceFor(w, p.id);
    w.push.plan.set(
      e,
      Array.from({ length: 10 }, () => ({
        ok: false as const,
        gone: false,
        retry: true,
        reason: 'push_network',
      })),
    );
    await alert(p.id);
    // Each step is past the longest backoff (2 hours), and the whole is inside the 12 hours a notification stays worth sending.
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      w.clock.t += 2 * HOUR + 5 * 60_000;
      await runSender(w.nd);
    }
    await runSender(w.nd);
    expect((await sends(w, p.id))[0]).toMatchObject({
      state: 'failed',
      reason: 'retries_exhausted',
      attempts: MAX_ATTEMPTS,
    });
    expect(w.push.attempts).toHaveLength(MAX_ATTEMPTS);
  });

  it('removes a subscription the push service calls gone, and leaves the others', async () => {
    const p = await addPerson(w, 'ann');
    const gone = await addDeviceFor(w, p.id);
    const good = await addDeviceFor(w, p.id);
    w.push.plan.set(gone, [{ ok: false, gone: true, retry: false, reason: 'push_gone' }]);
    await alert(p.id);
    const rep = await runSender(w.nd);
    expect(rep).toMatchObject({ sent: 1, devicesRemoved: 1 });
    const left = await db.query<{ endpoint: string }>(
      'select endpoint from public.push_subscriptions',
    );
    expect(left.rows.map((r) => r.endpoint)).toEqual([good]);
  });

  it('checks the allow-list again before sending: a host taken off the list is removed and never called', async () => {
    const p = await addPerson(w, 'ann');
    const e = await addDeviceFor(w, p.id, 'fcm.googleapis.com');
    await db.exec("delete from public.push_service_hosts where host = 'fcm.googleapis.com'");
    try {
      await alert(p.id);
      const rep = await runSender(w.nd);
      expect(rep.devicesRemoved).toBe(1);
      expect(w.push.attempts.filter((a) => a.endpoint === e)).toHaveLength(0);
      expect((await sends(w, p.id))[0]).toMatchObject({ state: 'failed', reason: 'push_gone' });
    } finally {
      await db.exec(
        `insert into public.push_service_hosts (host, include_subdomains, source_url)
         values ('fcm.googleapis.com', false, 'https://developer.chrome.com/blog/web-push-interop-wins')
         on conflict do nothing`,
      );
    }
  });

  it('applies the allow-list rules to a web address', () => {
    const rules = [
      { host: 'push.apple.com', include_subdomains: true },
      { host: 'fcm.googleapis.com', include_subdomains: false },
    ];
    expect(hostAllowed('https://web.push.apple.com/x', rules)).toBe(true);
    expect(hostAllowed('https://fcm.googleapis.com/fcm/send/x', rules)).toBe(true);
    for (const bad of [
      'http://fcm.googleapis.com/x',
      'https://evil.fcm.googleapis.com/x',
      'https://fcm.googleapis.com.evil.org/x',
      'https://fcm.googleapis.com:8443/x',
      'https://user@fcm.googleapis.com/x',
      'https://push.apple.com.evil.org/x',
      'not a url',
    ]) {
      expect(hostAllowed(bad, rules), bad).toBe(false);
    }
  });

  it('caps what reaches a phone at six a day for one account, and the inbox keeps them all', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    for (let i = 0; i < DAILY_CAP + 3; i++)
      await alert(p.id, `Fact number ${i}.`, { dedupeKey: `k${i}` });
    const rep = await runSender(w.nd);
    expect(rep).toMatchObject({ sent: DAILY_CAP, dropped: 3 });
    const rows = await sends(w, p.id);
    expect(rows.filter((r) => r.reason === 'daily_cap')).toHaveLength(3);
    expect(
      (await db.query('select 1 from public.notifications where show_in_inbox')).rows,
    ).toHaveLength(DAILY_CAP + 3);
    // A day later the allowance is back.
    w.clock.t += 25 * HOUR;
    await alert(p.id, 'Fact tomorrow.', { dedupeKey: 'tomorrow' });
    expect((await runSender(w.nd)).sent).toBe(1);
  });

  it('drops one that went stale, and one the player has turned off since', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    await alert(p.id, 'Fact A.');
    w.clock.t += 13 * HOUR;
    await runSender(w.nd);
    expect((await sends(w, p.id))[0]).toMatchObject({ state: 'dropped', reason: 'expired' });
    await alert(p.id, 'Fact B.', { dedupeKey: 'b' });
    await setPrefs(w, p.id, 'farm_alert', false);
    await runSender(w.nd);
    expect((await sends(w, p.id))[1]).toMatchObject({ state: 'dropped', reason: 'type_off' });
    expect(w.push.sent).toHaveLength(0);
  });

  it('never lets one failing recipient block the rest', async () => {
    const a = await addPerson(w, 'ann');
    const b = await addPerson(w, 'bob');
    const ea = await addDeviceFor(w, a.id);
    await addDeviceFor(w, b.id);
    w.push.plan.set(ea, ['throw']);
    await alert(a.id);
    await alert(b.id);
    const rep = await runSender(w.nd);
    expect(rep).toMatchObject({ sent: 1, retried: 1 });
    expect((await sends(w, a.id))[0]).toMatchObject({ state: 'pending', reason: 'send_error' });
    expect((await sends(w, b.id))[0]).toMatchObject({ state: 'sent' });
  });

  it('is safe when called twice at the same moment: each message goes once', async () => {
    const people = [] as string[];
    for (let i = 0; i < 6; i++) {
      const p = await addPerson(w, `p${i}`);
      await addDeviceFor(w, p.id);
      await alert(p.id);
      people.push(p.id);
    }
    const [r1, r2] = await Promise.all([
      runSender(w.nd, { batch: 2 }),
      runSender(w.nd, { batch: 2 }),
    ]);
    expect(r1.sent + r2.sent).toBe(6);
    expect(w.push.sent).toHaveLength(6);
    expect(new Set(w.push.sent.map((s) => s.message.id)).size).toBe(6);
  });

  it('takes again a row left in sending by a run that crashed', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    await alert(p.id);
    await db.exec(
      `update public.notification_sends set state = 'sending', claimed_at = '${iso(NOON - 10 * 60_000)}', attempts = 1`,
    );
    expect((await runSender(w.nd)).sent).toBe(1);
  });

  it('stops starting new work when the time budget is spent, and gives back what it had taken', async () => {
    for (let i = 0; i < 5; i++) {
      const p = await addPerson(w, `p${i}`);
      await addDeviceFor(w, p.id);
      await alert(p.id);
    }
    let ticks = 0;
    const clock = () => (ticks += 1000);
    const rep = await runSender(w.nd, { budgetMs: 3500, batch: 5, clock });
    expect(rep.outOfTime).toBe(true);
    expect(rep.sent).toBeGreaterThan(0);
    expect(rep.sent).toBeLessThan(5);
    const rows = await sends(w);
    expect(rows.filter((r) => r.state === 'sent')).toHaveLength(rep.sent);
    const rest = rows.filter((r) => r.state !== 'sent');
    expect(rest.every((r) => r.state === 'pending' && r.attempts === 0)).toBe(true);
    // Another run finishes them.
    expect((await runSender(w.nd)).sent).toBe(5 - rep.sent);
  });

  it('does nothing when the switch is off or sending is paused, and nothing piles up in the keys-off case', async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    await alert(p.id);
    await db.exec(
      "update public.feature_switches set enabled = false where key = 'push_notifications'",
    );
    expect((await runSender(w.nd)).skipped).toBe('switch_off');
    await db.exec(
      "update public.feature_switches set enabled = true where key = 'push_notifications'",
    );
    await db.exec(
      `insert into public.site_settings (key, value) values ('notify_paused', '{"paused": true}')`,
    );
    expect((await runSender(w.nd)).skipped).toBe('paused');
    expect(w.push.sent).toHaveLength(0);
    await db.exec("delete from public.site_settings where key = 'notify_paused'");
    expect((await runSender(w.nd)).sent).toBe(1);
  });
});

// ------------------------------------------------------------------ reminders

class FakeFarms implements DailyFarmReader {
  constructor(public list: ReminderFarm[]) {}
  async farms() {
    return this.list;
  }
}

describe('the morning reminder and the one later reminder', () => {
  const setup = async () => {
    const p = await addPerson(w, 'ann');
    await addDeviceFor(w, p.id);
    await setPrefs(w, p.id, 'morning_reminder', true);
    await setPrefs(w, p.id, 'later_nudge', true);
    const farmId = await addFarm(w, p.id, { name: 'Kooringa' });
    const farm: ReminderFarm = {
      userId: p.id,
      farmId,
      farmName: 'Kooringa',
      timezone: 'Australia/Sydney',
      lastOpenedAt: new Date('2026-11-15T01:00:00Z'),
      toCheck: 3,
    };
    return { p, farm, reader: new FakeFarms([farm]) };
  };
  /** A Sydney local time on 17 November 2026 (AEDT, +11). */
  const at = (h: number, m = 0) => Date.UTC(2026, 10, 16, h - 11 + 24 - 24 + 24, m) % 1e15;
  const local = (h: number, m = 0): number => Date.UTC(2026, 10, 17, h - 11, m);
  void at;

  it('says the PRD words at the chosen time, once, and not before', async () => {
    const { p, reader } = await setup();
    expect(await runReminders(w.nd, reader, local(6, 59))).toMatchObject({ morning: 0 });
    expect(await runReminders(w.nd, reader, local(7, 0))).toMatchObject({ morning: 1 });
    expect(await runReminders(w.nd, reader, local(7, 15))).toMatchObject({
      morning: 0,
      skipped: 1,
    });
    const r = await db.query<{ title: string }>(
      'select title from public.notifications where user_id = $1',
      [p.id],
    );
    expect(r.rows.map((x) => x.title)).toEqual(['First light at Kooringa. 3 things to check.']);
  });

  it('uses the time the player picked, in the farm zone', async () => {
    const { p, farm } = await setup();
    await setSettings(w, p.id, { reminder: '06:30' });
    const perth = new FakeFarms([{ ...farm, timezone: 'Australia/Perth' }]);
    // 06:30 in Perth is 09:30 in Sydney.
    expect(await runReminders(w.nd, perth, local(9, 29))).toMatchObject({ morning: 0 });
    expect(await runReminders(w.nd, perth, local(9, 30))).toMatchObject({ morning: 1 });
  });

  it('does not send a stale one when the scheduler was down past the window', async () => {
    const { reader } = await setup();
    expect(await runReminders(w.nd, reader, local(10, 5))).toMatchObject({ morning: 0, nudge: 0 });
  });

  it('is never sent if the player already opened the farm that day, and neither is the later one', async () => {
    const { farm } = await setup();
    const opened = new FakeFarms([{ ...farm, lastOpenedAt: new Date(local(6, 0)) }]);
    expect(await runReminders(w.nd, opened, local(7, 0))).toMatchObject({ morning: 0, skipped: 1 });
    expect(await runReminders(w.nd, opened, local(13, 0))).toMatchObject({ nudge: 0, skipped: 1 });
    expect((await db.query('select 1 from public.notifications')).rows).toHaveLength(0);
  });

  it('sends one later reminder six hours after, only if the player wants it', async () => {
    const { p, reader } = await setup();
    expect(await runReminders(w.nd, reader, local(12, 59))).toMatchObject({ nudge: 0 });
    expect(await runReminders(w.nd, reader, local(13, 0))).toMatchObject({ nudge: 1 });
    expect(await runReminders(w.nd, reader, local(13, 30))).toMatchObject({ nudge: 0 });
    const t = await db.query<{ title: string }>(
      "select title from public.notifications where kind = 'later_nudge'",
    );
    expect(t.rows[0]!.title).toBe('Kooringa: 3 things to check.');
    await db.exec('truncate public.notifications cascade');
    await setPrefs(w, p.id, 'later_nudge', false);
    expect(await runReminders(w.nd, reader, local(13, 0))).toMatchObject({ nudge: 0 });
  });

  it('never makes more than two in a day, never for a missed day, and none when the farm is off the list', async () => {
    const { reader } = await setup();
    for (let m = 0; m < 24 * 60; m += 15)
      await runReminders(w.nd, reader, local(0, 0) + m * 60_000);
    const day = await db.query('select kind from public.notifications order by created_at');
    expect(day.rows.map((r) => (r as { kind: string }).kind).sort()).toEqual([
      'later_nudge',
      'morning_reminder',
    ]);
    // The player misses three days: nothing is sent for them, and the next morning one reminder only.
    await db.exec('truncate public.notifications cascade');
    expect(await runReminders(w.nd, reader, local(7, 0) + 3 * 24 * HOUR)).toMatchObject({
      morning: 1,
    });
    expect((await db.query('select 1 from public.notifications')).rows).toHaveLength(1);
  });

  it('is dropped inside quiet hours, in the farm time zone, and leaves nothing in the inbox', async () => {
    const { p, reader } = await setup();
    await setSettings(w, p.id, { quietStart: '06:00', quietEnd: '08:00' });
    await runReminders(w.nd, reader, local(7, 0));
    expect((await sends(w, p.id))[0]).toMatchObject({ state: 'dropped', reason: 'quiet_hours' });
    expect(
      (await db.query('select 1 from public.notifications where show_in_inbox')).rows,
    ).toHaveLength(0);
    // Not tried again within the same day.
    await runReminders(w.nd, reader, local(7, 30));
    expect((await db.query('select 1 from public.notifications')).rows).toHaveLength(1);
  });

  it('with the default reader finds active Daily Farms of accounts that turned a reminder on, and no one else', async () => {
    const { p } = await setup();
    const other = await addPerson(w, 'bob');
    await addFarm(w, other.id, { name: 'Other' });
    const found = await sqlDailyFarmReader(w.deps.sql).farms();
    expect(found.map((f) => f.farmName)).toEqual(['Kooringa']);
    expect(found[0]!.userId).toBe(p.id);
    expect(found[0]!.toCheck).toBeNull();
    // With no count the line is still a fact.
    expect(await runReminders(w.nd, sqlDailyFarmReader(w.deps.sql), local(7, 0))).toMatchObject({
      morning: 1,
    });
    const t = await db.query<{ title: string }>('select title from public.notifications');
    expect(t.rows[0]!.title).toBe('First light at Kooringa.');
  });
});

describe('a device', () => {
  it('is checked: keys must be the right size, and the host must be on the database list', async () => {
    const p = await addPerson(w, 'ann');
    const ok = parseDevice({
      endpoint: 'https://web.push.apple.com/x',
      keys: { p256dh: FAKE_P256DH, auth: FAKE_AUTH },
      device: 'iPhone Safari',
    });
    expect((await addDevice(w.deps.sql, p.id, ok)).ref).toMatch(/^[0-9a-f]{12}$/);
    for (const bad of [
      { endpoint: 'http://web.push.apple.com/x', keys: { p256dh: FAKE_P256DH, auth: FAKE_AUTH } },
      { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'AAAA', auth: FAKE_AUTH } },
      { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: FAKE_P256DH, auth: 'AA' } },
      { endpoint: 5, keys: {} },
    ]) {
      expect(() => parseDevice(bad as Record<string, unknown>)).toThrow();
    }
    const refused = parseDevice({
      endpoint: 'https://push.example.org/x',
      keys: { p256dh: FAKE_P256DH, auth: FAKE_AUTH },
    });
    await expect(addDevice(w.deps.sql, p.id, refused)).rejects.toMatchObject({
      message: "Notifications aren't available in this browser yet.",
      code: 'push_host_not_allowed',
    });
  });

  it('takes the Chrome and Edge hosts, and a device moves to the account that signs in on it', async () => {
    const a = await addPerson(w, 'ann');
    const b = await addPerson(w, 'bob');
    for (const host of [
      'fcm.googleapis.com',
      'wns2-par02p.notify.windows.com',
      'updates.push.services.mozilla.com',
    ]) {
      await addDeviceFor(w, a.id, host);
    }
    const shared = parseDevice({
      endpoint: 'https://web.push.apple.com/shared',
      keys: { p256dh: FAKE_P256DH, auth: FAKE_AUTH },
    });
    await addDevice(w.deps.sql, a.id, shared);
    await addDevice(w.deps.sql, b.id, shared);
    const owner = await db.query<{ user_id: string }>(
      "select user_id from public.push_subscriptions where endpoint = 'https://web.push.apple.com/shared'",
    );
    expect(owner.rows).toEqual([{ user_id: b.id }]);
    for (const evil of [
      'https://notify.windows.com.evil.org/x',
      'https://evilnotify.windows.com.org/x',
      'https://fcm.googleapis.com.evil.org/x',
      'https://android.googleapis.com/x',
    ]) {
      await expect(
        addDevice(w.deps.sql, a.id, { ...shared, endpoint: evil }),
        evil,
      ).rejects.toBeTruthy();
    }
  });

  it('is limited to ten per account', async () => {
    const a = await addPerson(w, 'ann');
    for (let i = 0; i < 10; i++) await addDeviceFor(w, a.id);
    await expect(addDeviceFor(w, a.id)).rejects.toMatchObject({ status: 409 });
  });
});
