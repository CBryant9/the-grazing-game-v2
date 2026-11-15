import type { FarmEvent } from '@gg/engine';
import { afterAll, describe, expect, it } from 'vitest';
import { GameServer } from '../game/game';
import type { NotifyDeps } from '../notify/deps';
import { runReminders } from '../notify/reminders';
import { runSender } from '../notify/sender';
import { addDevice } from '../notify/store';
import { describeEvent } from '../notify/wording';
import { newFarm } from '../player';
import { FAKE_AUTH, FAKE_P256DH, FakePush } from '../test-support/fakeNotify';
import { dailyNotifier, dailyReminderReader, nightNotices, type NightNews } from './notices';
import { runRollover } from './rollover';
import { OWNER, USER, at, choices, database, keepThrough, rig, type Rig } from './testrig';

/*
 * Daily Farm and notifications, joined (m6). The night's news goes through `queueEvent`, and the
 * morning reminder and the one later reminder read Daily Farm's own record of the farm, end to
 * end on the real migrations with a fake push service. Nothing reaches the network.
 */

afterAll(async () => {
  await (await database()).close();
});

describe('the notifications a night makes', () => {
  it('turns the engine facts of a night into one notification each, in plain words', () => {
    const events = [
      {
        type: 'water',
        paddock: 'River',
        event: { type: 'portable-low', portId: 2, cell: 9, pct: 20, daysLeft: 1 },
      },
      { type: 'water', paddock: 'Hill', event: { type: 'portable-empty', portId: 3, cell: 4 } },
      { type: 'cattle', mob: 1, mobName: 'Cows', area: 'Hill', note: { type: 'noWater', days: 1 } },
      { type: 'cattle', mob: 1, mobName: 'Cows', area: 'Hill', note: { type: 'calvingStarted' } },
      { type: 'breakout', mob: 4, mobName: 'Steers', reason: 'hungry', edge: {}, area: 'Flat' },
      { type: 'deaths', mob: 1, mobName: 'Cows', cause: 'noWater', count: 2 },
      { type: 'deaths', mob: 1, mobName: 'Cows', cause: 'noWater', count: 1 },
      { type: 'sheep-deaths', mob: 7, mobName: 'Ewes', cause: 'flystrike', count: 1 },
      // Not news: the day's ordinary facts send nothing.
      { type: 'births', mob: 1, mobName: 'Cows', count: 3 },
      { type: 'new-season', label: 'Summer', factor: 1 },
    ] as unknown as FarmEvent[];
    const titles = nightNotices('Kooringa', events).map((n) => describeEvent(n.event).title);
    expect(titles).toEqual([
      'Trough low in River at Kooringa.',
      'Trough empty in Hill at Kooringa.',
      'Cows has had no water for 1 day at Kooringa.',
      'Calving has started in Cows at Kooringa.',
      'Steers went through the tape at Kooringa.',
      '3 head died in Cows at Kooringa: no water.',
      '1 head died in Ewes at Kooringa: flystrike.',
    ]);
    expect(nightNotices('Kooringa', [])).toEqual([]);
  });
});

/** Notification dependencies on the rig's database, with a fake push service and the rig's clock. */
function notifyOn(r: Rig): { nd: NotifyDeps; push: FakePush } {
  const push = new FakePush();
  const nd: NotifyDeps = {
    sql: r.sql,
    emailOf: async () => null,
    integrations: {
      push,
      vapidPublicKey: 'BPublicKeyForTests',
      mail: null,
      from: null,
      site: 'https://game.example.test',
      tokenSecret: null,
      cronSecret: null,
      now: () => r.clock.now,
    },
    switchOn: async () => true,
  };
  return { nd, push };
}

async function wantsReminders(r: Rig): Promise<void> {
  await r.db.exec('delete from public.notifications; delete from public.push_subscriptions;');
  // A finished account: notifications are only made for an account with a profile.
  await r.db.query(
    `insert into public.profiles (user_id, username) values ($1, 'daily_one') on conflict do nothing`,
    [USER],
  );
  for (const kind of ['morning_reminder', 'later_nudge', 'farm_alert']) {
    await r.db.query(
      `insert into public.notification_prefs (user_id, kind, push, email) values ($1, $2, true, false)
       on conflict (user_id, kind) do update set push = true, email = false`,
      [USER, kind],
    );
  }
  await r.db.query(
    `insert into public.notification_settings (user_id, reminder_time, later_nudge, timezone)
     values ($1, '07:00', true, 'Australia/Sydney')
     on conflict (user_id) do update set reminder_time = '07:00', later_nudge = true,
       quiet_start = null, quiet_end = null`,
    [USER],
  );
  await addDevice(r.sql, USER, {
    endpoint: `https://web.push.apple.com/wpush/v2/daily-${Math.random().toString(16).slice(2)}`,
    p256dh: FAKE_P256DH,
    auth: FAKE_AUTH,
    label: 'Test phone',
  });
}

const titles = async (r: Rig): Promise<string[]> =>
  (
    await r.db.query<{ title: string }>(
      'select title from public.notifications where user_id = $1 order by created_at, title',
      [USER],
    )
  ).rows.map((x) => x.title);

/** A game server on the rig's store and clock whose Daily runtime tells `notify` after each night. */
function serverWith(r: Rig, notify: (n: NightNews) => Promise<void>): GameServer {
  return new GameServer({
    store: r.store,
    seed: () => 5,
    saveRetryMs: [0, 0],
    now: () => r.clock.now,
    daily: { data: r.data, enabled: async () => true, notify },
  });
}

describe('Daily Farm calls the notifications', () => {
  it('the rollover tells only the night that brings the farm to today, and its news is queued once', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    await keepThrough(r, '2026-11-16');
    await wantsReminders(r);
    const { nd, push } = notifyOn(r);
    const told: NightNews[] = [];
    const real = dailyNotifier(() => nd);
    const game = serverWith(r, async (n) => {
      told.push(n);
      await real(n);
    });
    const farm = newFarm();
    await game.create(farm.key, choices({ name: 'Kooringa' }), OWNER);
    // Two nights owed: only the second (the 14th, which brings the farm to the 15th) is told.
    r.clock.now = at('2026-11-15', '00:10:00');
    const report = await runRollover({
      game,
      store: r.store,
      data: r.data,
      feed: null,
      sql: r.sql,
      now: () => r.clock.now,
    });
    expect(report.daysAdvanced).toBe(2);
    expect(told.map((n) => [n.farmId, n.date, n.farmName])).toEqual([
      [farm.id, '2026-11-14', 'Kooringa'],
    ]);
    // The news of a night goes through queueEvent with a key for the farm, the night and the fact.
    const news: NightNews = {
      farmId: farm.id,
      farmName: 'Kooringa',
      date: '2026-11-14',
      events: [
        { type: 'water', paddock: 'River', event: { type: 'portable-empty', portId: 1, cell: 3 } },
      ] as unknown as FarmEvent[],
    };
    await real(news);
    await real(news);
    expect((await titles(r)).filter((t) => t.startsWith('Trough'))).toEqual([
      'Trough empty in River at Kooringa.',
    ]);
    // A night after 7 am Sydney is not quiet: the fake push service gets it.
    r.clock.now = at('2026-11-15', '08:00:00');
    await runSender(nd);
    expect(push.sent.map((s) => s.message.title)).toContain('Trough empty in River at Kooringa.');
  }, 180_000);

  it('the morning reminder and the one later reminder, end to end, with the things to check', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    await keepThrough(r, '2026-11-16');
    await wantsReminders(r);
    const { nd, push } = notifyOn(r);
    const game = serverWith(r, async () => undefined);
    const farm = newFarm();
    await game.create(farm.key, choices({ name: 'Kooringa' }), OWNER);
    const reader = dailyReminderReader(r.sql, (id) => game.dailyToCheck(id));
    const roll = () =>
      runRollover({
        game,
        store: r.store,
        data: r.data,
        feed: null,
        sql: r.sql,
        now: () => r.clock.now,
      });

    // Midnight: the rollover loads the farm, which moves farms.last_opened_at (with the database's
    // own clock, so this rig can not show it). That is not the player opening it: Daily Farm's
    // reader goes by the farm's own record, so the reminder still goes.
    r.clock.now = at('2026-11-14', '00:10:00');
    expect((await roll()).daysAdvanced).toBe(1);
    const count = await game.dailyToCheck(farm.id);
    expect(count).not.toBeNull();
    r.clock.now = at('2026-11-14', '07:05:00');
    expect(await runReminders(nd, reader, r.clock.now)).toMatchObject({ morning: 1, nudge: 0 });
    // Run again: once a day.
    expect(await runReminders(nd, reader, r.clock.now)).toMatchObject({ morning: 0 });
    const morning =
      count! > 0
        ? `First light at Kooringa. ${count} thing${count === 1 ? '' : 's'} to check.`
        : 'First light at Kooringa.';
    expect(await titles(r)).toEqual([morning]);
    await runSender(nd);
    expect(push.sent.map((s) => s.message.title)).toEqual([morning]);

    // Six hours later, not opened: the one later reminder.
    r.clock.now = at('2026-11-14', '13:05:00');
    expect(await runReminders(nd, reader, r.clock.now)).toMatchObject({ nudge: 1 });
    await runSender(nd);
    expect(push.sent).toHaveLength(2);

    // The next day the player opens the farm before the later reminder: none is made.
    r.clock.now = at('2026-11-15', '00:10:00');
    await roll();
    r.clock.now = at('2026-11-15', '07:05:00');
    expect(await runReminders(nd, reader, r.clock.now)).toMatchObject({ morning: 1 });
    r.clock.now = at('2026-11-15', '08:00:00');
    expect(await game.snapshot(farm.key)).not.toBeNull();
    r.clock.now = at('2026-11-15', '13:05:00');
    expect(await runReminders(nd, reader, r.clock.now)).toMatchObject({ nudge: 0, skipped: 1 });
    // Nothing else, ever: no third reminder that day.
    r.clock.now = at('2026-11-15', '19:05:00');
    expect(await runReminders(nd, reader, r.clock.now)).toMatchObject({ morning: 0, nudge: 0 });
  }, 180_000);
});
