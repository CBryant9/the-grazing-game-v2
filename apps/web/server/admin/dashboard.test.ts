import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { pgliteSql } from '../test-support/pgliteSql';
import { FakeAuth } from '../test-support/fakeAuth';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { resetRateLimits } from '../game/http';
import { addDays, localDate } from '../daily/clock';
import type { SqlClient } from '../db/sql';
import {
  MAX_RANGE_DAYS,
  csvCell,
  parseRange,
  readDashboard,
  toCsv,
  type DashTable,
  type Dashboard,
} from './dashboard';

/**
 * Milestone 5.3 "done when": the dashboard numbers match the database. Rows are seeded in PGlite,
 * some inside the range and some 40 days before it, and every figure is checked against them.
 */

const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';

let db: PGlite;
let sql: SqlClient;
let auth: FakeAuth;
let deps: AuthDeps;
let d: Dashboard;
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};
const today = localDate(Date.now(), 'Australia/Sydney');

async function person(key: string, age: number, profile: Record<string, unknown>, role = 'player') {
  const { user, cookie } = await auth.signInAs(`${key}@example.test`);
  ids[key] = user.id;
  cookies[key] = cookie;
  await db.query(
    `insert into public.profiles (user_id, username, farms, state, district, farm_size_band)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      user.id,
      `u_${key}`,
      profile.farms ?? null,
      profile.state ?? null,
      profile.district ?? null,
      profile.size ?? null,
    ],
  );
  await db.query(
    `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
     values ($1, ((now() at time zone 'Australia/Sydney')::date - ($2 || ' years')::interval - interval '10 days')::date, now())`,
    [user.id, String(age)],
  );
  await db.query('insert into public.account_status (user_id, role) values ($1, $2)', [
    user.id,
    role,
  ]);
}

async function farm(o: {
  owner?: string;
  guest?: string;
  mode: 'daily' | 'fast';
  status?: 'active' | 'ended';
  started?: string;
  ended?: string;
  opened?: string;
  simThrough?: string;
}): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.farms (owner_id, guest_session_id, mode, name, district, size, size_ha,
       enterprise, start_type, difficulty, engine_version, status, started_at, ended_at,
       last_opened_at, timezone, sim_through)
     values ($1, $2, $3, 'Test', 'nsw', 'small', 100, 'grazing', 'running', 'easy', 'test',
       $4, coalesce($5::timestamptz, now()), $6::timestamptz, coalesce($7::timestamptz, now()),
       $8, $9::date)
     returning id`,
    [
      o.owner ?? null,
      o.guest ?? null,
      o.mode,
      o.status ?? 'active',
      o.started ?? null,
      o.ended ?? null,
      o.opened ?? null,
      o.mode === 'daily' ? 'Australia/Sydney' : null,
      o.mode === 'daily' ? (o.simThrough ?? today) : null,
    ],
  );
  return r.rows[0]!.id;
}

const OLD = "now() - interval '40 days'";

beforeAll(async () => {
  db = await freshDb({ seed: false });
  sql = pgliteSql(db);
  auth = new FakeAuth(db);
  deps = { provider: auth, sql, pepper: PEPPER };
  setAuthDeps(deps);
  resetSwitchCache();

  await person(
    'ann',
    30,
    { farms: true, state: 'NSW', district: 'nsw', size: '500_2000' },
    'admin',
  );
  await person('kid', 15, { farms: false, state: 'QLD', district: 'cq' });
  await person('old', 70, {});
  // Old signed up 40 days ago: a player, not a new sign-up in the range.
  await db.query(`update public.profiles set created_at = ${OLD} where user_id = $1`, [ids.old]);
  await db.query(`update public.profiles set avatar_status = 'pending' where user_id = $1`, [
    ids.old,
  ]);

  const g = await db.query<{ id: string }>(
    `insert into public.guest_sessions (token_hash) values (repeat('a', 64)), (repeat('b', 64))
     returning id`,
  );
  await db.query(
    `insert into public.guest_sessions (token_hash, converted_to, converted_at)
     values (repeat('c', 64), $1, now())`,
    [ids.ann],
  );
  ids.guest = g.rows[0]!.id;

  // Farms: Ann's Daily Farm opened today and owed 5 days; a guest's Fast Farm opened 3 days
  // ago; Kid's Fast Farm started 2 days ago and ended today, opened 10 days ago (a made-up
  // order, only for the windows); Old's Fast Farm started and ended 40 days ago.
  const annDaily = await farm({
    owner: ids.ann,
    mode: 'daily',
    simThrough: addDays(today, -5),
  });
  await farm({
    guest: ids.guest,
    mode: 'fast',
    opened: new Date(Date.now() - 3 * 86400e3).toISOString(),
  });
  await farm({
    owner: ids.kid,
    mode: 'fast',
    status: 'ended',
    started: new Date(Date.now() - 2 * 86400e3).toISOString(),
    ended: new Date().toISOString(),
    opened: new Date(Date.now() - 10 * 86400e3).toISOString(),
  });
  await farm({
    owner: ids.old,
    mode: 'fast',
    status: 'ended',
    started: new Date(Date.now() - 40 * 86400e3).toISOString(),
    ended: new Date(Date.now() - 40 * 86400e3).toISOString(),
    opened: new Date(Date.now() - 40 * 86400e3).toISOString(),
  });

  await db.exec(`
    insert into public.daily_counts (day, metric, dims, count) values
      (app.today_sydney(), 'days_played', 'mode=daily', 4),
      (app.today_sydney(), 'days_played', 'mode=fast', 3),
      (app.today_sydney() - 40, 'days_played', 'mode=fast', 10),
      (app.today_sydney(), 'rollover_runs', '', 3),
      (app.today_sydney(), 'rollover_farms', '', 7),
      (app.today_sydney(), 'rollover_days', '', 9),
      (app.today_sydney(), 'rollover_failed', '', 1);
  `);
  await db.query(
    `insert into public.purchases (user_id, product_id, amount_cents, status, paid_at, created_at) values
      ($1, 'farm_pack', 3000, 'paid', now(), now()),
      ($1, 'farm_pack_no_ads', 5000, 'refunded', now(), now()),
      ($1, 'farm_pack', 3000, 'paid', ${OLD}, ${OLD}),
      ($1, 'farm_pack', 3000, 'pending', null, now())`,
    [ids.ann],
  );
  const n = await db.query<{ id: string }>(
    `insert into public.notifications (user_id, kind, title)
     select $1, 'system', 'Note ' || i from generate_series(1, 7) i returning id`,
    [ids.ann],
  );
  const nid = n.rows.map((r) => r.id);
  const send = (i: number, channel: string, state: string, sentAt: string | null) =>
    db.query(
      `insert into public.notification_sends (notification_id, user_id, channel, state, sent_at)
       values ($1, $2, $3, $4, ${sentAt ?? 'null'})`,
      [nid[i], ids.ann, channel, state],
    );
  await send(0, 'push', 'sent', 'now()');
  await send(1, 'email', 'sent', 'now()');
  await send(2, 'push', 'failed', null);
  await send(3, 'push', 'pending', null);
  await send(4, 'push', 'held', null);
  await send(5, 'push', 'sending', null);
  await send(6, 'push', 'sent', OLD);

  await db.exec(`
    insert into public.ad_events (slot_id, kind) values
      ('pc_farm_rail', 'view'), ('pc_farm_rail', 'view'), ('pc_farm_rail', 'view'),
      ('pc_farm_rail', 'click');
    insert into public.ad_daily (day, slot_id, kind, count) values
      (app.today_sydney() - 40, 'pc_farm_rail', 'view', 50);
    insert into public.reports (target_type, target_id, reason, status) values
      ('post', gen_random_uuid(), 'spam', 'open'),
      ('post', gen_random_uuid(), 'abuse', 'open'),
      ('post', gen_random_uuid(), 'spam', 'dismissed');
    insert into public.analytics_daily (day, event, props, count) values
      (app.today_sydney(), 'website_view', 'page=home', 5),
      (app.today_sydney(), 'page_view', 'page=play', 2),
      (app.today_sydney() - 40, 'website_view', 'page=home', 9);
    insert into public.web_vitals_daily (day, page, metric, bucket, count) values
      (app.today_sydney(), 'play', 'LCP', 1000, 3),
      (app.today_sydney(), 'play', 'LCP', 3000, 1),
      (app.today_sydney(), 'play', 'INP', 300, 4),
      (app.today_sydney() - 40, 'play', 'LCP', 9000, 100);
    insert into public.health_daily (day, kind, route, reason, count, total_ms, max_ms) values
      (app.today_sydney(), 'route', 'game-day', '', 4, 400, 250),
      (app.today_sydney(), 'failure', 'game-day', 'game_route_failed', 2, 0, 0),
      (app.today_sydney(), 'save_conflict', 'farm-store', 'version_changed', 1, 0, 0),
      (app.today_sydney(), 'rollover', 'daily-rollover', '', 2, 3000, 2000),
      (app.today_sydney(), 'rollover', 'daily-rollover', 'farm_failed', 1, 500, 500),
      (app.today_sydney() - 40, 'route', 'game-day', '', 100, 100000, 9000);
  `);
  void annDaily;
  d = await readDashboard(sql, parseRange(undefined, undefined));
}, 120_000);

afterAll(async () => {
  setAuthDeps(undefined);
  await db?.close();
});

const byKey = (t: DashTable, col = 'value'): Record<string, unknown> =>
  Object.fromEntries(t.rows.map((r) => [String(r.key), r[col]]));

describe('the dashboard counts match the rows in the database', () => {
  it('reads the last 7 Sydney days by default', () => {
    expect(d.range).toEqual({ from: addDays(today, -6), to: today });
  });

  it('summary: players, sign-ups, guests, activity, farms, days, money, sends, ads, queue', () => {
    expect(byKey(d.tables.summary)).toEqual({
      players: 3,
      signups: 2,
      guests: 2,
      active_day: 1,
      active_week: 2,
      active_month: 3,
      daily_going: 1,
      fast_going: 1,
      farms_started: 3,
      farms_ended: 1,
      days_played: 7,
      purchases: 2,
      income_aud: '30.00',
      refunded: 1,
      sent_push: 1,
      sent_email: 1,
      send_failed: 1,
      ad_views: 3,
      ad_clicks: 1,
      ad_click_rate: '33.3%',
      website_views: 5,
      moderation_queue: 3,
      broken_saves: 0,
    });
  });

  it('by day: today carries the figures and the older rows are not in the range', () => {
    const rows = d.tables.daily.rows;
    expect(rows.map((r) => r.day)).toEqual(
      Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)),
    );
    expect(rows.at(-1)).toEqual({
      day: today,
      signups: 2,
      farms_started: 2,
      days_played: 7,
      purchases: 2,
      income_aud: '30.00',
      sends: 2,
      ad_views: 3,
      ad_clicks: 1,
      website_views: 5,
    });
    const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k]), 0);
    // The farm started two days ago is the third farm in the range.
    expect(sum('farms_started')).toBe(3);
    expect(sum('days_played')).toBe(7);
  });

  it('farms by mode', () => {
    expect(d.tables.farms.rows).toEqual([
      { mode: 'Daily Farm', going: 1, started: 1, ended: 0, days_played: 4 },
      { mode: 'Fast Farm', going: 1, started: 2, ended: 1, days_played: 3 },
    ]);
  });

  it('audience mix from the profiles, ages as bands only', () => {
    const get = (dim: string) =>
      Object.fromEntries(
        d.tables.audience.rows.filter((r) => r.dimension === dim).map((r) => [r.group, r.players]),
      );
    expect(get('Farms for a living')).toEqual({ Yes: 1, No: 1, 'Not said': 1 });
    expect(get('State')).toEqual({ NSW: 1, QLD: 1, 'Not said': 1 });
    expect(get('District')).toEqual({
      'Northern Tablelands NSW': 1,
      'Central Queensland': 1,
      'Not said': 1,
    });
    expect(get('Age band')).toEqual({ '25 to 34': 1, '14 to 15': 1, '65 and over': 1 });
    // Every group is under 5, so the advertiser snapshot shows none of them.
    expect(d.tables.snapshot.rows).toEqual([]);
  });

  it('events and website views in the range', () => {
    expect(d.tables.events.rows).toEqual([
      { event: 'page_view', props: 'page=play', count: 2 },
      { event: 'website_view', props: 'page=home', count: 5 },
    ]);
  });

  it('Web Vitals as the 75th percentile by page, from the buckets in the range', () => {
    expect(d.tables.vitals.rows).toEqual([
      { page: 'play', metric: 'INP', readings: 4, p75: '300 ms', target: '200 ms', within: 'No' },
      {
        page: 'play',
        metric: 'LCP',
        readings: 4,
        p75: '1.00 s',
        target: '2.00 s',
        within: 'Yes',
      },
    ]);
  });

  it('game health: timings, failures, save conflicts, rollover runs and queues', () => {
    expect(d.tables.routes.rows).toEqual([
      { route: 'game-day', requests: 4, mean_ms: 100, max_ms: 250, failures: 2 },
    ]);
    expect(d.tables.failures.rows).toEqual([
      { kind: 'Failure', route: 'game-day', reason: 'game_route_failed', count: 2 },
      { kind: 'Save conflict', route: 'farm-store', reason: 'version_changed', count: 1 },
    ]);
    expect(d.tables.rollover.rows).toEqual([
      {
        day: today,
        runs: 3,
        mean_ms: 1167,
        max_ms: 2000,
        with_failures: 1,
        farms: 7,
        days: 9,
        failed: 1,
      },
    ]);
    expect(byKey(d.tables.queues, 'depth')).toEqual({
      notify_waiting: 2,
      notify_sending: 1,
      daily_owed: 1,
      reports_open: 2,
      photos_waiting: 1,
    });
  });

  it('a range 40 days back finds the older rows and none of today’s', async () => {
    const back = addDays(today, -40);
    const old = await readDashboard(sql, parseRange(back, back));
    const s = byKey(old.tables.summary);
    expect(s.days_played).toBe(10);
    expect(s.purchases).toBe(1);
    expect(s.income_aud).toBe('30.00');
    expect(s.sent_push).toBe(1);
    expect(s.ad_views).toBe(50);
    expect(s.website_views).toBe(9);
    expect(s.signups).toBe(1);
    expect(s.farms_started).toBe(1);
    expect(old.tables.routes.rows[0]).toMatchObject({ requests: 100, max_ms: 9000 });
  });
});

describe('the date range', () => {
  const now = Date.parse('2026-11-15T02:00:00Z');
  it('defaults to 7 days, swaps a backwards range, stops at today and holds a year at most', () => {
    expect(parseRange(undefined, undefined, now)).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(parseRange('2026-11-10', '2026-11-01', now)).toEqual({
      from: '2026-11-01',
      to: '2026-11-10',
    });
    expect(parseRange('2026-11-01', '2027-01-01', now).to).toBe('2026-11-15');
    const long = parseRange('2020-01-01', '2026-11-15', now);
    expect(addDays(long.from, MAX_RANGE_DAYS - 1)).toBe(long.to);
    expect(parseRange('2026-02-30', 'nonsense', now)).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
    });
  });
});

describe('CSV', () => {
  it('puts a quote mark in front of text a spreadsheet would run, and doubles quotes', () => {
    expect(csvCell('=1+2')).toBe(`"'=1+2"`);
    expect(csvCell('+61')).toBe(`"'+61"`);
    expect(csvCell('-5')).toBe(`"'-5"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('\tx')).toBe(`"'\tx"`);
    expect(csvCell('say "hi"')).toBe(`"say ""hi"""`);
    expect(csvCell(12)).toBe('"12"');
    const t: DashTable = {
      id: 'events',
      title: 't',
      note: '',
      columns: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      rows: [{ a: '=HYPERLINK("x")', b: 3 }],
    };
    expect(toCsv(t)).toBe(`"A","B"\r\n"'=HYPERLINK(""x"")","3"\r\n`);
  });

  it('export: admins only, written to the audit log, and never an email or a date of birth', async () => {
    const { GET } = await import('@/app/api/admin/dashboard/route');
    const ask = (who: string | null, q: string) => {
      resetRateLimits();
      return GET(
        new Request(`${HOST}/api/admin/dashboard?${q}`, {
          headers: { host: 'localhost:3000', ...(who ? { cookie: cookies[who]! } : {}) },
        }),
      );
    };
    expect((await ask(null, 'table=summary')).status).toBe(404);
    expect((await ask('kid', 'table=summary')).status).toBe(404);
    // Old is a second admin for a moment, so Ann can be suspended and banned (one admin must stay).
    await db.query("update public.account_status set role = 'admin' where user_id = $1", [ids.old]);
    await db.query(
      "update public.account_status set suspended_until = now() + interval '1 day' where user_id = $1",
      [ids.ann],
    );
    expect((await ask('ann', 'table=summary')).status).toBe(404);
    await db.query(
      'update public.account_status set suspended_until = null, banned_at = now() where user_id = $1',
      [ids.ann],
    );
    expect((await ask('ann', 'table=summary')).status).toBe(404);
    await db.query('update public.account_status set banned_at = null where user_id = $1', [
      ids.ann,
    ]);
    await db.query("update public.account_status set role = 'player' where user_id = $1", [
      ids.old,
    ]);
    setAuthDeps(null);
    expect((await ask('ann', 'table=summary')).status).toBe(404);
    setAuthDeps(deps);
    expect((await ask('ann', 'table=summary')).headers.get('x-robots-tag')).toContain('noindex');
    expect((await ask('ann', 'table=nothing')).status).toBe(400);

    const dobs = (
      await db.query<{ d: string }>(`select date_of_birth::text as d from public.account_private`)
    ).rows.map((r) => r.d);
    for (const table of Object.keys(d.tables)) {
      const res = await ask('ann', `table=${table}`);
      expect(res.status, table).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      expect(res.headers.get('content-disposition')).toContain(`grazing-game-${table}-`);
      const text = await res.text();
      expect(text, table).not.toContain('@example.test');
      expect(text, table).not.toMatch(/u_ann|u_kid|u_old/);
      for (const dob of dobs) expect(text, table).not.toContain(dob);
      for (const id of Object.values(ids)) expect(text, table).not.toContain(id);
    }
    const summary = await (await ask('ann', 'table=summary')).text();
    expect(summary.split('\r\n')[0]).toBe('"Figure","Value"');
    expect(summary).toContain('"Days played in the range","7"');

    const log = await db.query<{
      action: string;
      target_type: string;
      target_id: string;
      details: { count: number };
    }>(
      `select action, target_type, target_id, details from public.admin_audit_log
        where action = 'dashboard_export' order by id`,
    );
    // One for the noindex check, one per table, one more for the summary read again.
    expect(log.rows.length).toBe(Object.keys(d.tables).length + 2);
    expect(log.rows[0]).toEqual({
      action: 'dashboard_export',
      target_type: 'dashboard_table',
      target_id: 'summary',
      details: { count: d.tables.summary.rows.length },
    });
  });
});
