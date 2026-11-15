import 'server-only';
import { WEB_VITALS, type WebVital } from '@gg/shared/analytics';
import type { SqlClient } from '../db/sql';
import { COUNTS_CTE } from '../ads/slots';
import { addDays, localDate } from '../daily/clock';
import { p75, VITAL_TARGETS } from '../analytics/vitals';

/**
 * The admin dashboard (PRD 11.1, milestone 5.3). Every figure comes from the database through
 * this one module, in a date range of Sydney days. Each table can be downloaded as CSV
 * (`toCsv`); no table holds an email address, a date of birth, a username or any id.
 *
 * Where a figure comes from:
 * - players, sign-ups, audience: `profiles` (and `account_private` for the age band, worked out
 *   in the query; the date of birth itself is never read out)
 * - guests: `guest_sessions` not moved into an account
 * - farms started, going and ended: `farms`; players active: `farms.last_opened_at`
 * - days played: `daily_counts` (`days_played`, written when a day's diary is first kept)
 * - purchases and income: `purchases`; notification sends: `notification_sends`
 * - ad views and clicks: `ad_daily` plus today's `ad_events` (the same sum the ad reports use)
 * - moderation queue: open `reports`, photos and profile pictures waiting for a check
 * - events, website views and Web Vitals: `analytics_daily`, `web_vitals_daily`
 * - game health: `health_daily`, the rollover counts in `daily_counts`, and the queues as they
 *   stand (`notification_sends` waiting, Daily Farms owed a day)
 */

export interface DateRange {
  from: string;
  to: string;
}

export type Cell = string | number;

export interface DashTable {
  id: TableId;
  title: string;
  /** One line on where the figures come from. */
  note: string;
  columns: { key: string; label: string }[];
  rows: Record<string, Cell>[];
}

export const TABLE_IDS = [
  'summary',
  'daily',
  'farms',
  'audience',
  'snapshot',
  'events',
  'vitals',
  'routes',
  'failures',
  'rollover',
  'queues',
] as const;
export type TableId = (typeof TABLE_IDS)[number];
export const isTableId = (v: unknown): v is TableId =>
  typeof v === 'string' && (TABLE_IDS as readonly string[]).includes(v);

export const MAX_RANGE_DAYS = 366;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function realDate(v: unknown): string | null {
  if (typeof v !== 'string' || !DATE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/**
 * The range from the page's query. Default: the last 7 Sydney days, today included. Backwards
 * dates are swapped, a range longer than a year is cut to the year ending on `to`, and nothing
 * past today is asked for.
 */
export function parseRange(from: unknown, to: unknown, now = Date.now()): DateRange {
  const today = localDate(now, 'Australia/Sydney');
  let t = realDate(to) ?? today;
  let f = realDate(from) ?? addDays(t, -6);
  if (f > t) [f, t] = [t, f];
  if (t > today) t = today;
  if (f > t) f = t;
  if (addDays(f, MAX_RANGE_DAYS - 1) < t) f = addDays(t, -(MAX_RANGE_DAYS - 1));
  return { from: f, to: t };
}

// The range as times: from the start of `from` to the end of `to`, Sydney time.
const START = `($1::date::timestamp at time zone 'Australia/Sydney')`;
const END = `(($2::date + 1)::timestamp at time zone 'Australia/Sydney')`;
const IN = (col: string): string => `${col} >= ${START} and ${col} < ${END}`;

const n = (v: unknown): number => Number(v ?? 0);
const dollars = (cents: number): string => (cents / 100).toFixed(2);
const rate = (part: number, whole: number): string =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '';

async function one<T>(sql: SqlClient, text: string, params: unknown[]): Promise<T> {
  return (await sql.query<T>(text, params)).rows[0]!;
}

async function summary(sql: SqlClient, r: DateRange): Promise<DashTable> {
  const p = [r.from, r.to];
  const x = await one<Record<string, string | number>>(
    sql,
    `with today as (select (app.today_sydney()::timestamp at time zone 'Australia/Sydney') as t)
     select
       (select count(*) from public.profiles) as players,
       (select count(*) from public.profiles where ${IN('created_at')}) as signups,
       (select count(*) from public.guest_sessions where converted_at is null) as guests,
       (select count(distinct coalesce(owner_id::text, guest_session_id::text)) from public.farms, today
         where last_opened_at >= today.t) as active_day,
       (select count(distinct coalesce(owner_id::text, guest_session_id::text)) from public.farms, today
         where last_opened_at >= today.t - interval '6 days') as active_week,
       (select count(distinct coalesce(owner_id::text, guest_session_id::text)) from public.farms, today
         where last_opened_at >= today.t - interval '29 days') as active_month,
       (select count(*) from public.farms where mode = 'daily' and status = 'active') as daily_going,
       (select count(*) from public.farms where mode = 'fast' and status = 'active') as fast_going,
       (select count(*) from public.farms where ${IN('started_at')}) as started,
       (select count(*) from public.farms where ${IN('ended_at')}) as ended,
       (select coalesce(sum(count), 0) from public.daily_counts
         where metric = 'days_played' and day between $1::date and $2::date) as days_played,
       (select count(*) from public.purchases
         where status in ('paid', 'refunded') and ${IN('paid_at')}) as purchases,
       (select coalesce(sum(amount_cents), 0) from public.purchases
         where status = 'paid' and ${IN('paid_at')}) as income_cents,
       (select count(*) from public.purchases
         where status = 'refunded' and ${IN('paid_at')}) as refunded,
       (select count(*) from public.notification_sends
         where state = 'sent' and channel = 'push' and ${IN('sent_at')}) as sent_push,
       (select count(*) from public.notification_sends
         where state = 'sent' and channel = 'email' and ${IN('sent_at')}) as sent_email,
       (select count(*) from public.notification_sends
         where state = 'failed' and ${IN('updated_at')}) as send_failed,
       (select count(*) from public.reports where status = 'open') as open_reports,
       (select count(*) from public.post_photos where moderation_status = 'pending') as photos_waiting,
       (select count(*) from public.profiles where avatar_status = 'pending') as avatars_waiting,
       (select count(*) from public.farm_saves_aside) as broken_saves,
       (select coalesce(sum(count), 0) from public.analytics_daily
         where event = 'website_view' and day between $1::date and $2::date) as website_views`,
    p,
  );
  const ads = await one<{ views: string; clicks: string }>(
    sql,
    `with ${COUNTS_CTE}
     select coalesce(sum(count) filter (where kind = 'view'), 0) as views,
            coalesce(sum(count) filter (where kind = 'click'), 0) as clicks
       from counts where day between $1::date and $2::date`,
    p,
  );
  const views = n(ads.views);
  const clicks = n(ads.clicks);
  const queue = n(x.open_reports) + n(x.photos_waiting) + n(x.avatars_waiting);
  const rows: [string, string, Cell][] = [
    ['players', 'Players with an account (all time)', n(x.players)],
    ['signups', 'New sign-ups in the range', n(x.signups)],
    ['guests', 'Guests playing with no account (now)', n(x.guests)],
    ['active_day', 'Players and guests who opened a farm today', n(x.active_day)],
    ['active_week', 'Opened a farm in the last 7 days', n(x.active_week)],
    ['active_month', 'Opened a farm in the last 30 days', n(x.active_month)],
    ['daily_going', 'Daily Farms going (now)', n(x.daily_going)],
    ['fast_going', 'Fast Farms going (now)', n(x.fast_going)],
    ['farms_started', 'Farms started in the range', n(x.started)],
    ['farms_ended', 'Farms ended in the range', n(x.ended)],
    ['days_played', 'Days played in the range', n(x.days_played)],
    ['purchases', 'Purchases paid in the range', n(x.purchases)],
    ['income_aud', 'Income in the range, AUD (refunds taken out)', dollars(n(x.income_cents))],
    ['refunded', 'Purchases in the range since refunded', n(x.refunded)],
    ['sent_push', 'Push notifications sent in the range', n(x.sent_push)],
    ['sent_email', 'Notification emails sent in the range', n(x.sent_email)],
    ['send_failed', 'Notification sends that failed in the range', n(x.send_failed)],
    ['ad_views', 'Ad views in the range', views],
    ['ad_clicks', 'Ad clicks in the range', clicks],
    ['ad_click_rate', 'Ad click rate', rate(clicks, views)],
    ['website_views', 'Website page views in the range', n(x.website_views)],
    ['moderation_queue', 'Moderation queue (now)', queue],
    ['broken_saves', 'Saves that could not be opened, kept aside', n(x.broken_saves)],
  ];
  return {
    id: 'summary',
    title: 'Summary',
    note: 'Counts read from the database. "Now" figures do not depend on the range.',
    columns: [
      { key: 'figure', label: 'Figure' },
      { key: 'value', label: 'Value' },
    ],
    rows: rows.map(([key, label, value]) => ({ key, figure: label, value })),
  };
}

async function daily(sql: SqlClient, r: DateRange): Promise<DashTable> {
  const res = await sql.query<Record<string, string | number>>(
    `with ${COUNTS_CTE},
     days as (select d::date as day from generate_series($1::date, $2::date, interval '1 day') d),
     sod as (select day, (day::timestamp at time zone 'Australia/Sydney') as s,
                    ((day + 1)::timestamp at time zone 'Australia/Sydney') as e from days)
     select to_char(sod.day, 'YYYY-MM-DD') as day,
       (select count(*) from public.profiles p where p.created_at >= sod.s and p.created_at < sod.e) as signups,
       (select count(*) from public.farms f where f.started_at >= sod.s and f.started_at < sod.e) as farms_started,
       (select coalesce(sum(count), 0) from public.daily_counts c
         where c.metric = 'days_played' and c.day = sod.day) as days_played,
       (select count(*) from public.purchases u
         where u.status in ('paid', 'refunded') and u.paid_at >= sod.s and u.paid_at < sod.e) as purchases,
       (select coalesce(sum(amount_cents), 0) from public.purchases u
         where u.status = 'paid' and u.paid_at >= sod.s and u.paid_at < sod.e) as income_cents,
       (select count(*) from public.notification_sends ns
         where ns.state = 'sent' and ns.sent_at >= sod.s and ns.sent_at < sod.e) as sends,
       (select coalesce(sum(count), 0) from counts a where a.day = sod.day and a.kind = 'view') as ad_views,
       (select coalesce(sum(count), 0) from counts a where a.day = sod.day and a.kind = 'click') as ad_clicks,
       (select coalesce(sum(count), 0) from public.analytics_daily w
         where w.event = 'website_view' and w.day = sod.day) as website_views
     from sod order by sod.day`,
    [r.from, r.to],
  );
  return {
    id: 'daily',
    title: 'By day',
    note: 'Each Sydney day in the range.',
    columns: [
      { key: 'day', label: 'Day' },
      { key: 'signups', label: 'Sign-ups' },
      { key: 'farms_started', label: 'Farms started' },
      { key: 'days_played', label: 'Days played' },
      { key: 'purchases', label: 'Purchases' },
      { key: 'income_aud', label: 'Income AUD' },
      { key: 'sends', label: 'Notifications sent' },
      { key: 'ad_views', label: 'Ad views' },
      { key: 'ad_clicks', label: 'Ad clicks' },
      { key: 'website_views', label: 'Website views' },
    ],
    rows: res.rows.map((x) => ({
      day: String(x.day),
      signups: n(x.signups),
      farms_started: n(x.farms_started),
      days_played: n(x.days_played),
      purchases: n(x.purchases),
      income_aud: dollars(n(x.income_cents)),
      sends: n(x.sends),
      ad_views: n(x.ad_views),
      ad_clicks: n(x.ad_clicks),
      website_views: n(x.website_views),
    })),
  };
}

async function farms(sql: SqlClient, r: DateRange): Promise<DashTable> {
  const res = await sql.query<Record<string, string | number>>(
    `select m.mode,
       (select count(*) from public.farms f where f.mode = m.mode and f.status = 'active') as going,
       (select count(*) from public.farms f where f.mode = m.mode and ${IN('f.started_at')}) as started,
       (select count(*) from public.farms f where f.mode = m.mode and ${IN('f.ended_at')}) as ended,
       (select coalesce(sum(count), 0) from public.daily_counts c
         where c.metric = 'days_played' and c.dims = 'mode=' || m.mode
           and c.day between $1::date and $2::date) as days_played
     from (values ('daily'), ('fast')) as m(mode)`,
    [r.from, r.to],
  );
  return {
    id: 'farms',
    title: 'Farms by mode',
    note: '"Going" is now. Started, ended and days played are in the range.',
    columns: [
      { key: 'mode', label: 'Mode' },
      { key: 'going', label: 'Going' },
      { key: 'started', label: 'Started' },
      { key: 'ended', label: 'Ended' },
      { key: 'days_played', label: 'Days played' },
    ],
    rows: res.rows.map((x) => ({
      mode: x.mode === 'daily' ? 'Daily Farm' : 'Fast Farm',
      going: n(x.going),
      started: n(x.started),
      ended: n(x.ended),
      days_played: n(x.days_played),
    })),
  };
}

const AGE_BAND = `case
    when a.age < 16 then '14 to 15'
    when a.age < 18 then '16 to 17'
    when a.age < 25 then '18 to 24'
    when a.age < 35 then '25 to 34'
    when a.age < 45 then '35 to 44'
    when a.age < 55 then '45 to 54'
    when a.age < 65 then '55 to 64'
    else '65 and over' end`;

const DISTRICT_NAMES: Record<string, string> = {
  cq: 'Central Queensland',
  nsw: 'Northern Tablelands NSW',
  cw: 'Central West NSW',
  wv: 'Western Victoria',
};
const SIZE_NAMES: Record<string, string> = {
  under_100: 'Under 100 ha',
  '100_500': '100 to 500 ha',
  '500_2000': '500 to 2,000 ha',
  '2000_10000': '2,000 to 10,000 ha',
  over_10000: 'Over 10,000 ha',
};

/** Audience mix: every account, by what their profile says. The age band only, never a date. */
async function audienceRows(
  sql: SqlClient,
): Promise<{ dimension: string; group: string; players: number }[]> {
  const res = await sql.query<{ dimension: string; grp: string | null; players: string }>(
    `with a as (
       select p.farms, p.state, p.district, p.farm_size_band,
              app.age_on(x.date_of_birth, app.today_sydney()) as age
         from public.profiles p join public.account_private x on x.user_id = p.user_id)
     select 'Farms for a living' as dimension,
            case when farms then 'Yes' when not farms then 'No' else 'Not said' end as grp,
            count(*) as players from a group by 2
     union all select 'State', coalesce(state, 'Not said'), count(*) from a group by 2
     union all select 'District', coalesce(district, 'Not said'), count(*) from a group by 2
     union all select 'Farm size', coalesce(farm_size_band, 'Not said'), count(*) from a group by 2
     union all select 'Age band', ${AGE_BAND}, count(*) from a group by 2
     order by 1, 2`,
  );
  return res.rows.map((x) => {
    const g = x.grp ?? 'Not said';
    const group =
      x.dimension === 'District'
        ? (DISTRICT_NAMES[g] ?? g)
        : x.dimension === 'Farm size'
          ? (SIZE_NAMES[g] ?? g)
          : g;
    return { dimension: x.dimension, group, players: n(x.players) };
  });
}

/** Groups smaller than this are not shown in the advertiser snapshot. */
export const SNAPSHOT_MIN_GROUP = 5;

async function audience(sql: SqlClient): Promise<[DashTable, DashTable]> {
  const rows = await audienceRows(sql);
  const totals = new Map<string, number>();
  for (const x of rows) totals.set(x.dimension, (totals.get(x.dimension) ?? 0) + x.players);
  const table: DashTable = {
    id: 'audience',
    title: 'Audience mix',
    note: 'Every account, from the profile. Ages are bands worked out in the database.',
    columns: [
      { key: 'dimension', label: 'By' },
      { key: 'group', label: 'Group' },
      { key: 'players', label: 'Players' },
    ],
    rows,
  };
  const snapshot: DashTable = {
    id: 'snapshot',
    title: 'Audience snapshot for advertisers',
    note: `Shares only. A group of fewer than ${SNAPSHOT_MIN_GROUP} players is left out, so no one can be picked out.`,
    columns: [
      { key: 'dimension', label: 'By' },
      { key: 'group', label: 'Group' },
      { key: 'share', label: 'Share of players' },
    ],
    rows: rows
      .filter((x) => x.players >= SNAPSHOT_MIN_GROUP && x.group !== 'Not said')
      .map((x) => ({
        dimension: x.dimension,
        group: x.group,
        share: rate(x.players, totals.get(x.dimension) ?? 0),
      })),
  };
  return [table, snapshot];
}

async function events(sql: SqlClient, r: DateRange): Promise<DashTable> {
  const res = await sql.query<{ event: string; props: string; count: string }>(
    `select event, props, sum(count) as count from public.analytics_daily
      where day between $1::date and $2::date group by event, props order by event, props`,
    [r.from, r.to],
  );
  return {
    id: 'events',
    title: 'Analytics events',
    note: 'Counted only for people who said yes, and website views (no cookie, no id). Empty while the analytics switch is off.',
    columns: [
      { key: 'event', label: 'Event' },
      { key: 'props', label: 'Details' },
      { key: 'count', label: 'Count' },
    ],
    rows: res.rows.map((x) => ({
      event: x.event,
      props: x.props.replaceAll(';', ', '),
      count: n(x.count),
    })),
  };
}

const VITAL_UNIT: Record<WebVital, (v: number) => string> = {
  LCP: (v) => `${(v / 1000).toFixed(2)} s`,
  INP: (v) => `${v} ms`,
  CLS: (v) => (v / 1000).toFixed(3),
};

async function vitals(sql: SqlClient, r: DateRange): Promise<DashTable> {
  const res = await sql.query<{ page: string; metric: WebVital; bucket: number; count: string }>(
    `select page, metric, bucket, sum(count) as count from public.web_vitals_daily
      where day between $1::date and $2::date group by page, metric, bucket`,
    [r.from, r.to],
  );
  const groups = new Map<string, { bucket: number; count: number }[]>();
  for (const x of res.rows) {
    const key = `${x.page}|${x.metric}`;
    const list = groups.get(key) ?? [];
    list.push({ bucket: n(x.bucket), count: n(x.count) });
    groups.set(key, list);
  }
  const rows: Record<string, Cell>[] = [];
  for (const key of [...groups.keys()].sort()) {
    const [page, metric] = key.split('|') as [string, WebVital];
    if (!WEB_VITALS.includes(metric)) continue;
    const list = groups.get(key)!;
    const value = p75(list);
    if (value === null) continue;
    rows.push({
      page,
      metric,
      readings: list.reduce((s, b) => s + b.count, 0),
      p75: VITAL_UNIT[metric](value),
      target: VITAL_UNIT[metric](VITAL_TARGETS[metric]),
      within: value <= VITAL_TARGETS[metric] ? 'Yes' : 'No',
    });
  }
  return {
    id: 'vitals',
    title: 'Web Vitals (75th percentile)',
    note: 'Real players on the game and signed-in pages, with consent. The figure is the top of the bucket the 75th percentile falls in.',
    columns: [
      { key: 'page', label: 'Page' },
      { key: 'metric', label: 'Measure' },
      { key: 'readings', label: 'Readings' },
      { key: 'p75', label: '75th percentile' },
      { key: 'target', label: 'Target (PRD 14.10)' },
      { key: 'within', label: 'Within target' },
    ],
    rows,
  };
}

async function routes(sql: SqlClient, r: DateRange): Promise<DashTable> {
  const res = await sql.query<{
    route: string;
    count: string;
    total: string;
    max: number;
    failures: string;
  }>(
    `select t.route, sum(t.count) as count, sum(t.total_ms) as total, max(t.max_ms) as max,
            coalesce((select sum(f.count) from public.health_daily f
               where f.kind = 'failure' and f.route = t.route
                 and f.day between $1::date and $2::date), 0) as failures
       from public.health_daily t
      where t.kind = 'route' and t.day between $1::date and $2::date
      group by t.route order by t.route`,
    [r.from, r.to],
  );
  return {
    id: 'routes',
    title: 'Server timings by route',
    note: 'How long the server took to answer, from the server side. Kept as sums, not one row a request.',
    columns: [
      { key: 'route', label: 'Route' },
      { key: 'requests', label: 'Requests' },
      { key: 'mean_ms', label: 'Average ms' },
      { key: 'max_ms', label: 'Longest ms' },
      { key: 'failures', label: 'Failures' },
    ],
    rows: res.rows.map((x) => ({
      route: x.route,
      requests: n(x.count),
      mean_ms: n(x.count) > 0 ? Math.round(n(x.total) / n(x.count)) : 0,
      max_ms: n(x.max),
      failures: n(x.failures),
    })),
  };
}

async function failures(sql: SqlClient, r: DateRange): Promise<DashTable> {
  const res = await sql.query<{ kind: string; route: string; reason: string; count: string }>(
    `select kind, route, reason, sum(count) as count from public.health_daily
      where kind in ('failure', 'save_conflict') and day between $1::date and $2::date
      group by kind, route, reason order by sum(count) desc, route, reason`,
    [r.from, r.to],
  );
  return {
    id: 'failures',
    title: 'Failures and save conflicts',
    note: 'By route and fixed reason code. A save conflict is two saves of one farm meeting; the second is refused and reloads.',
    columns: [
      { key: 'kind', label: 'Kind' },
      { key: 'route', label: 'Route' },
      { key: 'reason', label: 'Reason code' },
      { key: 'count', label: 'Count' },
    ],
    rows: res.rows.map((x) => ({
      kind: x.kind === 'save_conflict' ? 'Save conflict' : 'Failure',
      route: x.route,
      reason: x.reason,
      count: n(x.count),
    })),
  };
}

async function rollover(sql: SqlClient, r: DateRange): Promise<DashTable> {
  const res = await sql.query<Record<string, string | number>>(
    `select to_char(d.day, 'YYYY-MM-DD') as day,
       coalesce(sum(h.count), 0) as runs,
       coalesce(sum(h.total_ms), 0) as total,
       coalesce(max(h.max_ms), 0) as max,
       coalesce(sum(h.count) filter (where h.reason = 'farm_failed'), 0) as with_failures,
       (select coalesce(sum(count), 0) from public.daily_counts c
         where c.day = d.day and c.metric = 'rollover_farms') as farms,
       (select coalesce(sum(count), 0) from public.daily_counts c
         where c.day = d.day and c.metric = 'rollover_days') as days,
       (select coalesce(sum(count), 0) from public.daily_counts c
         where c.day = d.day and c.metric = 'rollover_failed') as failed
     from (select distinct day from public.health_daily
            where kind = 'rollover' and day between $1::date and $2::date
           union select distinct day from public.daily_counts
            where metric = 'rollover_runs' and day between $1::date and $2::date) d
     left join public.health_daily h on h.day = d.day and h.kind = 'rollover'
     group by d.day order by d.day`,
    [r.from, r.to],
  );
  return {
    id: 'rollover',
    title: 'Daily Farm rollover runs',
    note: 'Each run every 15 minutes, and how long it took. Farms and days moved on come from the rollover counts.',
    columns: [
      { key: 'day', label: 'Day' },
      { key: 'runs', label: 'Runs' },
      { key: 'mean_ms', label: 'Average ms' },
      { key: 'max_ms', label: 'Longest ms' },
      { key: 'with_failures', label: 'Runs with a failed farm' },
      { key: 'farms', label: 'Farms moved on' },
      { key: 'days', label: 'Days moved on' },
      { key: 'failed', label: 'Farm failures' },
    ],
    rows: res.rows.map((x) => ({
      day: String(x.day),
      runs: n(x.runs),
      mean_ms: n(x.runs) > 0 ? Math.round(n(x.total) / n(x.runs)) : 0,
      max_ms: n(x.max),
      with_failures: n(x.with_failures),
      farms: n(x.farms),
      days: n(x.days),
      failed: n(x.failed),
    })),
  };
}

async function queues(sql: SqlClient): Promise<DashTable> {
  const x = await one<Record<string, string>>(
    sql,
    `select
       (select count(*) from public.notification_sends where state in ('pending', 'held')) as waiting,
       (select count(*) from public.notification_sends where state = 'sending') as sending,
       (select count(*) from public.farms
         where mode = 'daily' and status = 'active' and timezone is not null
           and sim_through < ((now() at time zone timezone)::date - 1)) as owed,
       (select count(*) from public.reports where status = 'open') as reports,
       (select count(*) from public.post_photos where moderation_status = 'pending')
         + (select count(*) from public.profiles where avatar_status = 'pending') as photos`,
    [],
  );
  return {
    id: 'queues',
    title: 'Queues now',
    note: 'As they stand at this moment, whatever the range.',
    columns: [
      { key: 'queue', label: 'Queue' },
      { key: 'depth', label: 'Waiting' },
    ],
    rows: [
      { key: 'notify_waiting', queue: 'Notifications waiting to send', depth: n(x.waiting) },
      { key: 'notify_sending', queue: 'Notifications being sent', depth: n(x.sending) },
      { key: 'daily_owed', queue: 'Daily Farms owed a day by the rollover', depth: n(x.owed) },
      { key: 'reports_open', queue: 'Reports waiting for a moderator', depth: n(x.reports) },
      { key: 'photos_waiting', queue: 'Photos waiting for a check', depth: n(x.photos) },
    ],
  };
}

export interface Dashboard {
  asAt: string;
  range: DateRange;
  tables: Record<TableId, DashTable>;
}

/** Every dashboard table for the range. */
export async function readDashboard(sql: SqlClient, range: DateRange): Promise<Dashboard> {
  const [audienceTable, snapshot] = await audience(sql);
  const tables: Record<TableId, DashTable> = {
    summary: await summary(sql, range),
    daily: await daily(sql, range),
    farms: await farms(sql, range),
    audience: audienceTable,
    snapshot,
    events: await events(sql, range),
    vitals: await vitals(sql, range),
    routes: await routes(sql, range),
    failures: await failures(sql, range),
    rollover: await rollover(sql, range),
    queues: await queues(sql),
  };
  return { asAt: new Date().toISOString(), range, tables };
}

/**
 * A cell as a spreadsheet must see it: text that starts with `=`, `+`, `-`, `@`, a tab or a
 * carriage return gets a `'` in front, so a spreadsheet shows it and does not run it as a
 * formula. Then quoted, with quotes doubled.
 */
export function csvCell(v: Cell): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

/** The table as CSV (CRLF lines, a header row of the column labels). */
export function toCsv(t: DashTable): string {
  const lines = [t.columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of t.rows) lines.push(t.columns.map((c) => csvCell(row[c.key] ?? '')).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
