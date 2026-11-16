import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ID, as, asMany, freshDb, type Outcome, type Who } from './harness';

// m3.5 second pass: a banned or suspended admin (or moderator) is no longer staff in the database's
// own rules, so their own token reads nothing an admin may read. Migration 20261115000500.

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
}, 120_000);
afterAll(async () => {
  await db?.close();
});

const count = (o: Outcome): number => (o.ok ? o.rows.length : -1);

/** The scene: a second admin (so the first can be restricted), one row in each admin-only place. */
const scene = (restrict: string): string => `
  update public.account_status set role = 'admin' where user_id = '${ID.mod}';
  ${restrict}
  insert into public.admin_audit_log (admin_id, action) values ('${ID.mod}', 'switch_set');
  insert into public.site_settings (key, value, is_public) values ('maintenance_wording', '{"id":"short"}', false);
  insert into public.moderation_actions (user_id, moderator_id, action) values ('${ID.a}', '${ID.mod}', 'warned');
`;

const READS = [
  'select user_id from public.account_status',
  'select id from public.admin_audit_log',
  "select key from public.site_settings where key = 'maintenance_wording'",
  'select id from public.moderation_actions',
] as const;

async function reads(who: Who, restrict: string): Promise<number[]> {
  const out = await asMany(db, who, [...READS], scene(restrict));
  return out.map(count);
}

describe('a restricted admin reads nothing an admin may read, through their own token', () => {
  it('a good admin sees everything (the control)', async () => {
    const [accounts, audit, setting, moderation] = await reads('admin', '');
    expect(accounts).toBeGreaterThan(1);
    expect(audit).toBeGreaterThan(0);
    expect(setting).toBe(1);
    expect(moderation).toBeGreaterThan(0);
  });

  it('a banned admin sees only their own status row, and nothing else', async () => {
    const r = await reads(
      'admin',
      `update public.account_status set banned_at = now() where user_id = '${ID.admin}';`,
    );
    expect(r).toEqual([1, 0, 0, 0]);
  });

  it('a suspended admin sees only their own status row, and nothing else', async () => {
    const r = await reads(
      'admin',
      `update public.account_status set suspended_until = now() + interval '2 days' where user_id = '${ID.admin}';`,
    );
    expect(r).toEqual([1, 0, 0, 0]);
  });

  it('a banned or suspended moderator is not staff either', async () => {
    const banned = await asMany(
      db,
      'mod',
      ['select id from public.moderation_actions'],
      `insert into public.moderation_actions (user_id, moderator_id, action) values ('${ID.a}', '${ID.admin}', 'warned');
       update public.account_status set banned_at = now() where user_id = '${ID.mod}';`,
    );
    expect(count(banned[0]!)).toBe(0);
    const suspended = await asMany(
      db,
      'mod',
      ['select id from public.moderation_actions'],
      `insert into public.moderation_actions (user_id, moderator_id, action) values ('${ID.a}', '${ID.admin}', 'warned');
       update public.account_status set suspended_until = now() + interval '1 day' where user_id = '${ID.mod}';`,
    );
    expect(count(suspended[0]!)).toBe(0);
  });

  it('the helper functions the other rules use agree', async () => {
    const o = await as(
      db,
      'admin',
      `select app.is_admin() as a, app.is_staff() as s`,
      scene(`update public.account_status set banned_at = now() where user_id = '${ID.admin}';`),
    );
    expect(o.ok && o.rows[0]).toEqual({ a: false, s: false });
  });
});

describe('the migration', () => {
  it('lets only the server end sessions, and ends them', async () => {
    const [r] = await db
      .query<{ a: boolean; b: boolean; s: boolean }>(
        `select has_function_privilege('anon', 'app.end_sessions(uuid)', 'EXECUTE') as a,
                has_function_privilege('authenticated', 'app.end_sessions(uuid)', 'EXECUTE') as b,
                has_function_privilege('service_role', 'app.end_sessions(uuid)', 'EXECUTE') as s`,
      )
      .then((x) => x.rows);
    expect(r).toEqual({ a: false, b: false, s: true });
    const o = await as(
      db,
      'service',
      `select app.end_sessions('${ID.a}') as n`,
      `insert into auth.sessions (user_id) values ('${ID.a}'), ('${ID.a}'), ('${ID.b}')`,
    );
    expect(o.ok && o.rows[0]).toEqual({ n: 2 });
  });
});
