import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMUNITY_SWITCHES,
  ID,
  as,
  asMany,
  becomeSql,
  freshDb,
  passed,
  rows,
  switchesSql,
  type Outcome,
} from './harness';

// The server functions and guards: sign-up and the age rules, farm limits,
// guests becoming accounts, the Daily Farm clock, groups, deleting an account.

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(switchesSql(COMMUNITY_SWITCHES, true));
}, 120_000);

afterAll(async () => {
  await db?.close();
});

const errorOf = (o: Outcome): string => (o.ok ? '' : o.error);
const first = (o: Outcome): Record<string, unknown> => (o.ok ? (o.rows[0] ?? {}) : {});

/** Run statements as a brand-new signed-in user with no profile yet. */
async function asFresh(
  statements: string[],
  prep = '',
  claims: Record<string, unknown> = {},
): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const jwt = JSON.stringify({ sub: ID.fresh, role: 'authenticated', ...claims });
  await db.exec('begin');
  try {
    await db.exec(
      `insert into auth.users (id, aud, role) values ('${ID.fresh}', 'authenticated', 'authenticated'); ${prep}`,
    );
    await db.exec(
      `set local role authenticated; select set_config('request.jwt.claims', '${jwt}', true);`,
    );
    for (const sql of statements) {
      try {
        const r = await db.query<Record<string, unknown>>(sql);
        out.push({ ok: true, rows: r.rows, affected: r.affectedRows ?? 0 });
      } catch (e) {
        out.push({ ok: false, error: (e as Error).message, code: undefined });
        break;
      }
    }
  } finally {
    await db.exec('rollback');
  }
  return out;
}

const signUpsOpen = switchesSql(['signups_open'], true);
const yearsAgo = (years: number, plusDays = 0): string =>
  `((now() at time zone 'Australia/Sydney')::date - interval '${years} years')::date + ${plusDays}`;

describe('sign-up (PRD 8.2, 8.3)', () => {
  it('makes the profile, the private row, the status row and settings', async () => {
    const o = await asFresh(
      [
        `select public.complete_sign_up('new_grazier', '1992-04-01', 'New Grazier')`,
        `select username, display_name from public.profiles where user_id = '${ID.fresh}'`,
        `select date_of_birth from public.account_private where user_id = '${ID.fresh}'`,
        `select role from public.account_status where user_id = '${ID.fresh}'`,
        `select reminder_time from public.notification_settings where user_id = '${ID.fresh}'`,
      ],
      signUpsOpen,
    );
    expect(o.every((x) => x.ok)).toBe(true);
    expect(first(o[1]!)).toEqual({ username: 'new_grazier', display_name: 'New Grazier' });
    expect(first(o[3]!)).toEqual({ role: 'player' });
    expect(first(o[4]!)).toEqual({ reminder_time: '07:00:00' });
  });

  it('refuses anyone under 14, and takes a 14-year-old', async () => {
    const day = await asFresh(
      [`select public.complete_sign_up('young_one', ${yearsAgo(14, 1)})`],
      signUpsOpen,
    );
    expect(errorOf(day[0]!)).toMatch(/too_young/);
    const ok = await asFresh(
      [`select public.complete_sign_up('young_one', ${yearsAgo(14)})`],
      signUpsOpen,
    );
    expect(ok[0]!.ok).toBe(true);
  });

  it('a 15-year-old gets an account but no community', async () => {
    const o = await asFresh(
      [
        `select public.complete_sign_up('teen_one', ${yearsAgo(15)})`,
        `select 1 from public.posts`,
        `select app.can_use_community() as ok`,
      ],
      signUpsOpen,
    );
    expect(o[0]!.ok).toBe(true);
    expect(o[1]!.ok && o[1]!.rows.length).toBe(0);
    expect(first(o[2]!)).toEqual({ ok: false });
  });

  it('is closed while the sign-ups switch is off', async () => {
    const o = await asFresh([`select public.complete_sign_up('new_grazier', '1992-04-01')`]);
    expect(errorOf(o[0]!)).toMatch(/signups_closed/);
  });

  it('refuses a date of birth in the future, a taken username, a bad word, a second go and an anonymous session', async () => {
    const future = await asFresh(
      [`select public.complete_sign_up('a_name', current_date + 30)`],
      signUpsOpen,
    );
    expect(errorOf(future[0]!)).toMatch(/bad_date_of_birth/);
    const taken = await asFresh(
      [`select public.complete_sign_up('AVA_GRAZIER', '1990-01-01')`],
      signUpsOpen,
    );
    expect(errorOf(taken[0]!)).toMatch(/duplicate key/);
    const rude = await asFresh(
      [`select public.complete_sign_up('xbadwordx', '1990-01-01')`],
      signUpsOpen,
    );
    expect(errorOf(rude[0]!)).toMatch(/word_filter/);
    const twice = await asFresh(
      [
        `select public.complete_sign_up('once_only', '1990-01-01')`,
        `select public.complete_sign_up('twice_now', '1990-01-01')`,
      ],
      signUpsOpen,
    );
    expect(errorOf(twice[1]!)).toMatch(/already_signed_up/);
    const anon = await asFresh(
      [`select public.complete_sign_up('ghost_user', '1990-01-01')`],
      signUpsOpen,
      {
        is_anonymous: true,
      },
    );
    expect(errorOf(anon[0]!)).toMatch(/anonymous/);
  });

  it('a visitor can not sign up through it, and a player can not insert a profile directly', async () => {
    expect(
      passed(
        await as(db, 'anon', `select public.complete_sign_up('x_y_z', '1990-01-01')`, signUpsOpen),
      ),
    ).toBe(false);
    const direct = await asFresh([
      `insert into public.profiles (user_id, username) values ('${ID.fresh}', 'sneaky')`,
    ]);
    expect(errorOf(direct[0]!)).toMatch(/permission denied/);
  });
});

const newFarm = (owner: string | null, guest: string | null, mode = 'fast', extra = ''): string =>
  `insert into public.farms (owner_id, guest_session_id, mode, name, district, size, size_ha, enterprise, start_type, difficulty, engine_version, timezone, sim_through)
   values (${owner ? `'${owner}'` : 'null'}, ${guest ? `'${guest}'` : 'null'}, '${mode}', 'Another', 'nsw', 'small', 300, 'grazing', 'running', 'easy', '0.12.1',
     ${mode === 'daily' ? `'Australia/Sydney', current_date - 1` : 'null, null'})${extra}`;

describe('farm limits (PRD 5.5)', () => {
  it('a free account: 2 Fast Farms and 2 Daily Farms going at once', async () => {
    const fast = await asMany(db, 'service', [newFarm(ID.a, null), newFarm(ID.a, null)]);
    expect(fast[0]!.ok).toBe(true);
    expect(errorOf(fast[1]!)).toMatch(/farm_limit/);
    const daily = await asMany(db, 'service', [
      newFarm(ID.a, null, 'daily'),
      newFarm(ID.a, null, 'daily'),
    ]);
    expect(daily[0]!.ok).toBe(true);
    expect(errorOf(daily[1]!)).toMatch(/farm_limit/);
  });

  it('an ended farm frees its slot, and can not come back over the limit', async () => {
    const o = await asMany(db, 'service', [
      newFarm(ID.a, null),
      `update public.farms set status = 'ended', ended_at = now() where id = '${ID.farmA}'`,
      newFarm(ID.a, null),
      `update public.farms set status = 'active', ended_at = null where id = '${ID.farmA}'`,
    ]);
    expect(o.slice(0, 3).every((x) => x.ok)).toBe(true);
    expect(errorOf(o[3]!)).toMatch(/farm_limit/);
  });

  it('the farm pack lifts it to 5', async () => {
    const four = Array.from({ length: 4 }, () => newFarm(ID.b, null));
    const o = await asMany(db, 'service', [...four, newFarm(ID.b, null)]);
    expect(o.slice(0, 4).every((x) => x.ok)).toBe(true);
    expect(errorOf(o[4]!)).toMatch(/farm_limit/);
  });

  it('a revoked pack (a refund) brings the free limit back', async () => {
    const refund = `update public.account_entitlements set revoked_at = now() where user_id = '${ID.b}' and entitlement = 'farm_pack';`;
    const o = await asMany(db, 'service', [newFarm(ID.b, null), newFarm(ID.b, null)], refund);
    expect(o[0]!.ok).toBe(true);
    expect(errorOf(o[1]!)).toMatch(/farm_limit/);
  });

  it('a guest: 1 Fast Farm and no Daily Farm', async () => {
    const fast = await as(db, 'service', newFarm(null, ID.guest));
    expect(errorOf(fast)).toMatch(/farm_limit/);
    const daily = await as(db, 'service', newFarm(null, ID.guest, 'daily'));
    // The limit (0) and the check that a Daily Farm needs an account both refuse it.
    expect(errorOf(daily)).toMatch(/farm_limit|farms_daily_needs_account/);
  });

  it('the player can read their limits', async () => {
    const a = await as(
      db,
      'a',
      `select mode, max_active, active from public.my_farm_limits() order by mode`,
    );
    expect(a.ok && a.rows).toEqual([
      { mode: 'daily', max_active: 2, active: 1 },
      { mode: 'fast', max_active: 2, active: 1 },
    ]);
    const b = await as(
      db,
      'b',
      `select max_active from public.my_farm_limits() where mode = 'fast'`,
    );
    expect(first(b)).toEqual({ max_active: 5 });
  });

  it('a Daily Farm needs a real time zone', async () => {
    const o = await as(
      db,
      'service',
      newFarm(ID.b, null, 'daily').replace(`'Australia/Sydney'`, `'Mars/Olympus_Mons'`),
    );
    expect(errorOf(o)).toMatch(/Unknown time zone/);
  });
});

describe('guests (PRD 8.1, 5.16)', () => {
  it('converting a guest moves their farm into the account', async () => {
    const o = await asMany(db, 'service', [
      `select public.convert_guest('${ID.guest}', '${ID.c}') as moved`,
      `select owner_id, guest_session_id from public.farms where id = '${ID.farmGuest}'`,
      `select converted_to from public.guest_sessions where id = '${ID.guest}'`,
      `select public.convert_guest('${ID.guest}', '${ID.c}')`,
    ]);
    expect(first(o[0]!)).toEqual({ moved: 1 });
    expect(first(o[1]!)).toEqual({ owner_id: ID.c, guest_session_id: null });
    expect(first(o[2]!)).toEqual({ converted_to: ID.c });
    expect(errorOf(o[3]!)).toMatch(/already moved/);
  });

  it('an account with no room is refused, and nothing moves', async () => {
    const full = newFarm(ID.a, null) + ';';
    const o = await as(
      db,
      'service',
      `select public.convert_guest('${ID.guest}', '${ID.a}')`,
      full,
    );
    expect(errorOf(o)).toMatch(/farm_limit/);
  });

  it('only the server can convert a guest', async () => {
    expect(passed(await as(db, 'a', `select public.convert_guest('${ID.guest}', '${ID.a}')`))).toBe(
      false,
    );
  });

  it('a guest not seen for 30 days goes, with their farm', async () => {
    const prep = `update public.guest_sessions set last_seen_at = now() - interval '31 days';`;
    const o = await asMany(
      db,
      'service',
      [
        `select public.prune_housekeeping()`,
        `select 1 from public.farms where id = '${ID.farmGuest}'`,
      ],
      prep,
    );
    expect(o[1]!.ok && o[1]!.rows.length).toBe(0);
  });
});

describe('the Daily Farm clock (PRD 5.2, BUILD_PLAN 3.3)', () => {
  // Ava's Daily Farm is in Sydney and has been simulated through yesterday.
  const at = (iso: string) => `'${iso}'::timestamptz`;
  const sim = (date: string) =>
    `update public.farms set sim_through = '${date}', timezone_changed_at = null, rollover_claimed_at = null where id = '${ID.dailyA}';`;

  it("owes a day once the farm's local midnight has passed, and not before", async () => {
    const prep = sim('2026-11-14');
    const before = await as(
      db,
      'service',
      `select public.daily_days_owed('${ID.dailyA}', ${at('2026-11-15T23:59:00+11:00')}) as n`,
      prep,
    );
    const after = await as(
      db,
      'service',
      `select public.daily_days_owed('${ID.dailyA}', ${at('2026-11-16T00:01:00+11:00')}) as n`,
      prep,
    );
    expect(first(before)).toEqual({ n: 0 });
    expect(first(after)).toEqual({ n: 1 });
  });

  it('a missed run just leaves more days owed, and the next run claims them', async () => {
    const o = await asMany(
      db,
      'service',
      [
        `select farm_id, days_owed from public.daily_claim_due(100, ${at('2026-11-18T03:00:00+11:00')})`,
        `select farm_id from public.daily_claim_due(100, ${at('2026-11-18T03:05:00+11:00')})`,
        `select farm_id from public.daily_claim_due(100, ${at('2026-11-18T03:20:00+11:00')})`,
      ],
      sim('2026-11-14'),
    );
    expect(o[0]!.ok && o[0]!.rows).toEqual([{ farm_id: ID.dailyA, days_owed: 3 }]);
    // Claimed by a run that is still going: skipped.
    expect(o[1]!.ok && o[1]!.rows).toEqual([]);
    // That run died (10 minutes): claimed again.
    expect(o[2]!.ok && o[2]!.rows.length).toBe(1);
  });

  it('a wound-forward clock gives no extra days: the server can not finish a day that is not over', async () => {
    const now = at('2026-11-15T10:00:00+11:00');
    const o = await asMany(
      db,
      'service',
      [
        `select public.daily_finish('${ID.dailyA}', '2026-11-14', ${now})`,
        `select public.daily_days_owed('${ID.dailyA}', ${now}) as n`,
        `select public.daily_finish('${ID.dailyA}', '2026-11-15', ${now})`,
      ],
      sim('2026-11-13'),
    );
    expect(o[0]!.ok).toBe(true);
    expect(first(o[1]!)).toEqual({ n: 0 });
    expect(errorOf(o[2]!)).toMatch(/no_extra_days/);
  });

  it('no player can reach the clock functions', async () => {
    for (const sql of [
      `select public.daily_finish('${ID.dailyA}', current_date)`,
      `select public.daily_claim_due(10)`,
      `select public.change_farm_timezone('${ID.dailyA}', 'Pacific/Auckland')`,
      `select public.daily_days_owed('${ID.dailyA}')`,
    ]) {
      expect(errorOf(await as(db, 'a', sql))).toMatch(/permission denied/);
    }
  });

  it('the time zone changes at most once every 30 days', async () => {
    const o = await asMany(
      db,
      'service',
      [
        `select public.change_farm_timezone('${ID.dailyA}', 'Australia/Perth', ${at('2026-11-15T12:00:00+11:00')})`,
        `select public.change_farm_timezone('${ID.dailyA}', 'Australia/Brisbane', ${at('2026-12-10T12:00:00+11:00')})`,
      ],
      sim('2026-11-14'),
    );
    expect(o[0]!.ok).toBe(true);
    expect(errorOf(o[1]!)).toMatch(/timezone_locked/);
    const later = await asMany(
      db,
      'service',
      [
        `select public.change_farm_timezone('${ID.dailyA}', 'Australia/Perth', ${at('2026-11-15T12:00:00+11:00')})`,
        `select public.change_farm_timezone('${ID.dailyA}', 'Australia/Brisbane', ${at('2026-12-16T12:00:00+11:00')})`,
      ],
      sim('2026-11-14'),
    );
    expect(later[1]!.ok).toBe(true);
  });

  it('moving to a zone already on tomorrow gives no extra day', async () => {
    // 11:30 pm in Sydney is already tomorrow in Auckland.
    const now = at('2026-11-15T23:30:00+11:00');
    const o = await asMany(
      db,
      'service',
      [
        `select public.daily_days_owed('${ID.dailyA}', ${now}) as n`,
        `select public.change_farm_timezone('${ID.dailyA}', 'Pacific/Auckland', ${now})`,
        `select public.daily_days_owed('${ID.dailyA}', ${now}) as n`,
        `select public.daily_finish('${ID.dailyA}', '2026-11-16', ${now})`,
      ],
      sim('2026-11-14'),
    );
    expect(first(o[0]!)).toEqual({ n: 0 });
    expect(o[1]!.ok).toBe(true);
    expect(first(o[2]!)).toEqual({ n: 0 });
    expect(errorOf(o[3]!)).toMatch(/no_extra_days/);
  });
});

describe('groups', () => {
  it('a private group needs its code; a public one does not', async () => {
    const code = (
      await rows<{ invite_code: string }>(
        db,
        `select invite_code from public.groups where id = '${ID.group}'`,
      )
    )[0]!.invite_code;
    expect(passed(await as(db, 'admin', `select public.join_group('${ID.group}')`))).toBe(false);
    expect(passed(await as(db, 'admin', `select public.join_group('${ID.group}', 'wrong')`))).toBe(
      false,
    );
    expect((await as(db, 'admin', `select public.join_group('${ID.group}', '${code}')`)).ok).toBe(
      true,
    );
    const open = `update public.groups set visibility = 'public' where id = '${ID.group}';`;
    expect((await as(db, 'admin', `select public.join_group('${ID.group}')`, open)).ok).toBe(true);
  });

  it('a full group takes no more', async () => {
    const full = `update public.groups set visibility = 'public', member_limit = 2 where id = '${ID.group}';`;
    expect(errorOf(await as(db, 'admin', `select public.join_group('${ID.group}')`, full))).toMatch(
      /group_full/,
    );
  });

  it('the owner hands over to a member', async () => {
    const o = await asMany(db, 'a', [
      `select public.hand_over_group('${ID.group}', '${ID.b}')`,
      `select owner_id from public.groups where id = '${ID.group}'`,
    ]);
    expect(o[0]!.ok).toBe(true);
    expect(first(o[1]!)).toEqual({ owner_id: ID.b });
    expect(
      passed(await as(db, 'b', `select public.hand_over_group('${ID.group}', '${ID.b}')`)),
    ).toBe(false);
  });

  it('the owner can not leave without handing over', async () => {
    const o = await as(
      db,
      'a',
      `delete from public.group_members where group_id = '${ID.group}' and user_id = '${ID.a}'`,
    );
    expect(passed(o)).toBe(false);
  });
});

describe('deleting an account (21a "Your data")', () => {
  it('the server lists the files to remove first', async () => {
    const o = await as(
      db,
      'service',
      `select bucket, path from public.account_storage_paths('${ID.a}') order by bucket, path`,
    );
    expect(o.ok && o.rows.map((r) => r.bucket)).toEqual([
      'post-photos',
      'post-photos',
      'post-photos',
      'snapshots',
      'snapshots',
    ]);
  });

  it('removes the profile, private rows, farms, saves and posts; leaderboard rows stay with no account', async () => {
    const prep = `delete from auth.users where id = '${ID.a}';`;
    const o = await asMany(
      db,
      'service',
      [
        `select ((select count(*) from public.profiles where user_id = '${ID.a}')
              + (select count(*) from public.account_private where user_id = '${ID.a}')
              + (select count(*) from public.farms where owner_id = '${ID.a}')
              + (select count(*) from public.farm_saves where farm_id in ('${ID.farmA}', '${ID.dailyA}'))
              + (select count(*) from public.posts where author_id = '${ID.a}')
              + (select count(*) from public.notifications where user_id = '${ID.a}'))::int as left_over`,
        `select count(*)::int as n from public.leaderboard_entries where user_id is null and farm_id is null`,
        `select count(*)::int as n from public.groups where id = '${ID.group}'`,
      ],
      prep,
    );
    expect(first(o[0]!)).toEqual({ left_over: 0 });
    expect(first(o[1]!)).toEqual({ n: 2 });
    // Ava owned the group, so it goes with her.
    expect(first(o[2]!)).toEqual({ n: 0 });
  });

  it('deleting an admin keeps their audit log rows, with no admin', async () => {
    const o = await as(
      db,
      'service',
      `select admin_id from public.admin_audit_log where action = 'seed'`,
      `delete from auth.users where id = '${ID.admin}';`,
    );
    expect(o.ok && o.rows).toEqual([{ admin_id: null }]);
  });
});

describe('the role switch helper', () => {
  it('sets the role and the token claims', async () => {
    await db.exec('begin');
    try {
      await db.exec(becomeSql('a'));
      const r = await db.query<{ u: string; r: string }>(
        `select auth.uid()::text as u, current_user as r`,
      );
      expect(r.rows[0]).toEqual({ u: ID.a, r: 'authenticated' });
    } finally {
      await db.exec('rollback');
    }
  });
});
