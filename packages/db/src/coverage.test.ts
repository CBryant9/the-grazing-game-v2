import { readdirSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { AD_SLOTS, FARM_LIMITS, FEATURE_SWITCHES } from '@gg/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, freshDb, migrationFiles, rows } from './harness';
import { MATRIX, VIEWS } from './matrix';

// Checks over the whole database, so a new table, view or function can't
// slip in without its access rules and their tests.

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

/** Tables the browser roles must have no grant on at all. */
const SERVER_ONLY = [
  'farm_saves',
  'farm_actions',
  'farm_snapshot_views',
  'farm_saves_aside',
  'guest_sessions',
  'leaderboard_entries',
  'rate_limit_rules',
  'rate_limit_hits',
  'weather_daily',
  'price_daily',
  'stripe_customers',
  'stripe_events',
  'signup_refusals',
  'ban_records',
  'push_service_hosts',
  'notification_sends',
  'signup_email_checks',
  'deletion_tokens',
];

/** What a visitor with no account may read. Nothing else, and never a write. */
const ANON_READ = [
  'ad_slots',
  'challenges',
  'farm_limits',
  'feature_switches',
  'leaderboard_rows',
  'products',
  'site_settings',
];

const PLAYER_FUNCTIONS = [
  'complete_sign_up',
  'export_my_data',
  'group_invite_code',
  'hand_over_group',
  'join_group',
  'my_farm_limits',
];

/**
 * The app helpers the browser roles may run: exactly those a policy, a view
 * or a storage rule calls with their rights. Those that take another
 * person's id answer only what the caller may know (third.test.ts, N1); the
 * raw forms, the rate limiter, the farm limit and the trigger functions are
 * not here.
 */
const BROWSER_HELPERS = [
  'blocked_between',
  'board_shows_owner',
  'board_username',
  'can_find_profile',
  'can_see_group',
  'can_see_profile',
  'can_use_community',
  'can_view_farm',
  'comment_author',
  'comment_visible',
  'feature_on',
  'is_admin',
  'is_group_member',
  'is_group_owner',
  'is_member',
  'is_staff',
  'owns_farm',
  'photo_file_visible',
  'post_author',
  'post_visible',
  'ticker_visible',
  'try_uuid',
  'uid',
];

/** The exact columns of each view: a new column must be added here on purpose. */
const VIEW_COLUMNS: Record<string, string[]> = {
  leaderboard_rows: [
    'id',
    'board',
    'period',
    'period_key',
    'real_year',
    'challenge_id',
    'mode',
    'district',
    'size',
    'start_type',
    'enterprise',
    'score',
    'days',
    'continued',
    'username',
    'user_id',
    'avatar_path',
    'farm_name',
    'is_mine',
  ],
  public_farms: [
    'farm_id',
    'owner_id',
    'name',
    'mode',
    'district',
    'size',
    'current_day',
    'game_date',
    'status',
    'started_at',
  ],
  public_profiles: [
    'user_id',
    'username',
    'display_name',
    'avatar_path',
    'details_visible',
    'bio',
    'town',
    'district',
    'state',
    'farms',
    'enterprise',
    'farm_size_band',
    'farm_size_ha',
    'real_farm_name',
    'years_farming',
    'farm_role',
    'privacy_profile',
    'created_at',
  ],
};

const SERVER_FUNCTIONS = [
  'account_storage_paths',
  'can_view_farm',
  'change_farm_timezone',
  'convert_guest',
  'daily_claim_due',
  'daily_days_owed',
  'daily_finish',
  'daily_rollover_ping',
  'farm_limit',
  'prune_housekeeping',
  'rollup_ad_events',
  'take_rate_limit',
  'record_signup_email',
  'prepare_account_deletion',
  'approve_photo',
  'assign_group_owner',
  'clear_signup_refusal',
];

describe('every table', () => {
  it('has row level security on, and an entry in the access matrix', async () => {
    const tables = await rows<{ name: string; rls: boolean }>(
      db,
      `select c.relname as name, c.relrowsecurity as rls
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`,
    );
    expect(tables.length).toBeGreaterThan(40);
    expect(tables.filter((t) => !t.rls).map((t) => t.name)).toEqual([]);
    expect(tables.map((t) => t.name).sort()).toEqual(Object.keys(MATRIX).sort());
  });

  it('has created_at and updated_at', async () => {
    const missing = await rows<{ name: string }>(
      db,
      `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and (select count(*) from information_schema.columns k
                where k.table_schema = 'public' and k.table_name = c.relname
                  and k.column_name in ('created_at', 'updated_at')) < 2`,
    );
    expect(missing).toEqual([]);
  });

  it('server-only tables have no grant for the browser roles', async () => {
    for (const t of SERVER_ONLY) {
      for (const role of ['anon', 'authenticated']) {
        const [r] = await rows<Record<string, boolean>>(
          db,
          `select has_any_column_privilege('${role}', 'public.${t}', 'SELECT') as s,
                  has_any_column_privilege('${role}', 'public.${t}', 'INSERT') as i,
                  has_any_column_privilege('${role}', 'public.${t}', 'UPDATE') as u,
                  has_table_privilege('${role}', 'public.${t}', 'DELETE') as d,
                  has_table_privilege('${role}', 'public.${t}', 'TRUNCATE') as tr`,
        );
        expect({ t, role, ...r }).toEqual({
          t,
          role,
          s: false,
          i: false,
          u: false,
          d: false,
          tr: false,
        });
      }
    }
  });

  it('a visitor can read only the public tables and views, and write nothing', async () => {
    const objects = await rows<{ name: string; s: boolean; w: boolean }>(
      db,
      `select c.relname as name,
              has_any_column_privilege('anon', c.oid, 'SELECT') as s,
              has_any_column_privilege('anon', c.oid, 'INSERT')
                or has_any_column_privilege('anon', c.oid, 'UPDATE')
                or has_table_privilege('anon', c.oid, 'DELETE')
                or has_table_privilege('anon', c.oid, 'TRUNCATE') as w
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')`,
    );
    expect(objects.filter((o) => o.w).map((o) => o.name)).toEqual([]);
    expect(
      objects
        .filter((o) => o.s)
        .map((o) => o.name)
        .sort(),
    ).toEqual(ANON_READ);
  });

  it('no browser role may truncate anything', async () => {
    const bad = await rows<{ name: string }>(
      db,
      `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
            or has_table_privilege('authenticated', c.oid, 'TRIGGER')
            or has_table_privilege('authenticated', c.oid, 'REFERENCES'))`,
    );
    expect(bad).toEqual([]);
  });
});

describe('views', () => {
  it('are exactly the column-safe views, readable only as intended', async () => {
    const views = await rows<{ name: string; anon: boolean; auth: boolean }>(
      db,
      `select c.relname as name,
              has_table_privilege('anon', c.oid, 'SELECT') as anon,
              has_table_privilege('authenticated', c.oid, 'SELECT') as auth
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('v', 'm') order by 1`,
    );
    expect(views).toEqual([
      { name: 'leaderboard_rows', anon: true, auth: true },
      { name: 'public_farms', anon: false, auth: true },
      { name: 'public_profiles', anon: false, auth: true },
    ]);
    expect(views.map((v) => v.name)).toEqual([...VIEWS]);
  });

  it('use security_barrier', async () => {
    const opts = await rows<{ name: string; options: string[] | null }>(
      db,
      `select c.relname as name, c.reloptions as options from pg_class c
         join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v'`,
    );
    for (const o of opts) expect(o.options ?? []).toContain('security_barrier=true');
  });

  it('have exactly the columns listed, in order', async () => {
    for (const [view, want] of Object.entries(VIEW_COLUMNS)) {
      const cols = await rows<{ column_name: string }>(
        db,
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = '${view}' order by ordinal_position`,
      );
      expect(
        cols.map((c) => c.column_name),
        view,
      ).toEqual(want);
    }
  });

  it('never show a date of birth, an email or a role', async () => {
    const cols = await rows<{ column_name: string }>(
      db,
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name in ('public_profiles', 'leaderboard_rows', 'public_farms')`,
    );
    const names = cols.map((c) => c.column_name);
    for (const bad of [
      'date_of_birth',
      'email',
      'role',
      'banned_at',
      'suspended_until',
      'timezone',
    ]) {
      expect(names).not.toContain(bad);
    }
  });
});

describe('functions', () => {
  const callable = async (role: string): Promise<string[]> =>
    (
      await rows<{ name: string }>(
        db,
        `select distinct p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and has_function_privilege('${role}', p.oid, 'EXECUTE') order by 1`,
      )
    ).map((r) => r.name);

  it('a visitor can call none', async () => {
    expect(await callable('anon')).toEqual([]);
  });

  it('a player can call only the player functions', async () => {
    expect(await callable('authenticated')).toEqual(PLAYER_FUNCTIONS);
  });

  it('the server can call the server functions', async () => {
    const got = await callable('service_role');
    for (const f of SERVER_FUNCTIONS) expect(got).toContain(f);
  });

  it('every security definer function pins its search_path', async () => {
    const loose = await rows<{ name: string }>(
      db,
      `select n.nspname || '.' || p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app') and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(loose).toEqual([]);
  });

  it('the browser roles may run only the helpers the rules need', async () => {
    for (const role of ['anon', 'authenticated']) {
      const got = await rows<{ name: string }>(
        db,
        `select distinct p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app' and has_function_privilege('${role}', p.oid, 'EXECUTE') order by 1`,
      );
      expect(
        got.map((r) => r.name),
        role,
      ).toEqual(BROWSER_HELPERS);
    }
  });

  it('the app schema is not callable through PUBLIC', async () => {
    const [r] = await rows<{ usage: boolean }>(
      db,
      `select has_schema_privilege('public', 'app', 'USAGE') as usage`,
    );
    expect(r!.usage).toBe(false);
  });
});

describe('the reference data matches packages/shared', () => {
  it('feature switches: every key, at the shared launch defaults (PRD 11.7, except Daily Farm, which is off until Claudia turns it on; the PRD table says On)', async () => {
    const got = await rows<{ key: string; enabled: boolean }>(
      db,
      `select key, enabled from public.feature_switches order by key`,
    );
    const asObject = Object.fromEntries(got.map((r) => [r.key, r.enabled]));
    expect(asObject).toEqual({ ...FEATURE_SWITCHES });
    // One answer in every place: the seed (the reference-data migration says true, and migration
    // 20261115000400 sets it off), packages/shared, and here.
    expect(asObject.daily_farm).toBe(false);
    expect(FEATURE_SWITCHES.daily_farm).toBe(false);
  });

  it('ad slots: every slot, all off', async () => {
    const got = await rows<{ slot_id: string; enabled: boolean }>(
      db,
      `select slot_id, enabled from public.ad_slots order by slot_id`,
    );
    expect(got.map((r) => r.slot_id)).toEqual([...AD_SLOTS].sort());
    expect(got.filter((r) => r.enabled)).toEqual([]);
  });

  it('farm limits', async () => {
    const got = await rows<{ tier: string; mode: string; max_active: number }>(
      db,
      `select tier, mode, max_active from public.farm_limits`,
    );
    const asObject: Record<string, Record<string, number>> = {};
    for (const r of got) (asObject[r.tier] ??= {})[r.mode] = r.max_active;
    expect(asObject).toEqual(FARM_LIMITS);
  });

  it('every product starts inactive', async () => {
    const [r] = await rows<{ n: number }>(
      db,
      `select count(*)::int as n from public.products where active`,
    );
    expect(r!.n).toBe(0);
  });

  it('schedules the nightly jobs and the Daily Farm rollover', async () => {
    const jobs = await rows<{ jobname: string; schedule: string }>(
      db,
      `select jobname, schedule from cron.job order by 1`,
    );
    expect(jobs.map((j) => j.jobname)).toEqual([
      'gg-daily-rollover',
      'gg-housekeeping',
      'gg-rollup-ad-events',
    ]);
    expect(jobs[0]!.schedule).toBe('*/15 * * * *');
  });

  it('the rollover job does nothing, and does not fail, where pg_net or Vault is not there', async () => {
    const [r] = await rows<{ v: string | null }>(
      db,
      `select public.daily_rollover_ping()::text as v`,
    );
    expect(r!.v).toBeNull();
  });
});

describe('migration files', () => {
  it('are named by time stamp, one per stamp', () => {
    const all = readdirSync(MIGRATIONS_DIR);
    const named = migrationFiles();
    expect(all.filter((f) => !named.includes(f))).toEqual([]);
    const stamps = named.map((f) => f.slice(0, 14));
    expect(new Set(stamps).size).toBe(stamps.length);
  });
});
