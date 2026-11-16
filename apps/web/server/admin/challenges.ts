import 'server-only';
import type { SqlClient } from '../db/sql';
import { challengeFields } from '../community/groups';
import { CommunityError } from '../community/errors';
import { TextError } from '../community/text';
import { AdminError } from './errors';
import { activeAdmin } from './gate';
import { audit, isUuid } from './store';

/**
 * Challenges and leagues in admin (PRD 11.6): make a public Fast Farm challenge or Daily league
 * (the farm settings, an end date and a random seed the browser never sees), end one, see entries
 * and results; and give an ownerless group an owner. Every change writes its audit row in the same
 * transaction: if that fails, nothing changes.
 */

export interface AdminChallenge {
  id: string;
  kind: string;
  name: string;
  district: string | null;
  startsAt: string;
  endsAt: string | null;
  open: boolean;
  entries: number;
  groupName: string | null;
}

export async function listChallenges(sql: SqlClient): Promise<AdminChallenge[]> {
  const r = await sql.query<{
    id: string;
    kind: string;
    name: string;
    district: string | null;
    starts_at: string;
    ends_at: string | null;
    open: boolean;
    entries: number;
    group_name: string | null;
  }>(
    `select c.id, c.kind, c.name, c.district,
            to_char(c.starts_at at time zone 'Australia/Sydney', 'YYYY-MM-DD') as starts_at,
            to_char(c.ends_at at time zone 'Australia/Sydney', 'YYYY-MM-DD') as ends_at,
            (c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())) as open,
            (select count(*)::int from public.challenge_entries e where e.challenge_id = c.id) as entries,
            g.name as group_name
       from public.challenges c left join public.groups g on g.id = c.group_id
      order by c.starts_at desc limit 100`,
  );
  return r.rows.map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    district: c.district,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    open: c.open,
    entries: c.entries,
    groupName: c.group_name,
  }));
}

/** The results of one challenge: its farms by headline score, as admin sees them. */
export async function challengeResults(
  sql: SqlClient,
  id: string,
): Promise<{ username: string; farm: string | null; score: number; days: number }[]> {
  if (!isUuid(id)) return [];
  const r = await sql.query<{
    username: string | null;
    farm_name: string | null;
    score: string;
    days: number;
  }>(
    `select p.username, e.farm_name, e.score, e.days
       from public.leaderboard_entries e left join public.profiles p on p.user_id = e.user_id
      where e.challenge_id = $1 and e.board = 'grazier'
      order by e.score desc, e.days desc limit 100`,
    [id],
  );
  return r.rows.map((x) => ({
    username: x.username ?? 'Former player',
    farm: x.farm_name,
    score: Number(x.score),
    days: x.days,
  }));
}

export async function ownerlessGroups(
  sql: SqlClient,
): Promise<{ id: string; name: string; members: number }[]> {
  const r = await sql.query<{ id: string; name: string; members: number }>(
    `select g.id, g.name, (select count(*)::int from public.group_members m where m.group_id = g.id) as members
       from public.groups g where g.owner_id is null order by g.created_at limit 100`,
  );
  return r.rows;
}

export async function challengeAction(
  sql: SqlClient,
  adminId: string,
  b: Record<string, unknown>,
): Promise<{ id?: string }> {
  let fields: ReturnType<typeof challengeFields> | null = null;
  if (b.action === 'challenge') {
    try {
      fields = challengeFields(b);
    } catch (e) {
      if (e instanceof CommunityError || e instanceof TextError)
        throw new AdminError(400, e.message);
      throw e;
    }
  }
  return sql.transaction(async (tx) => {
    if (!(await activeAdmin(tx, adminId, true)))
      throw new AdminError(403, 'You can not do that now.');
    switch (b.action) {
      case 'challenge': {
        const c = fields!;
        const r = await tx.query<{ id: string }>(
          `insert into public.challenges (kind, name, description, district, settings, seed, starts_at, ends_at, created_by)
           values ($1, $2, $3, $4, $5::jsonb, $6, now(), $7::timestamptz, $8) returning id`,
          [
            c.kind,
            c.name,
            c.description,
            c.district,
            JSON.stringify(c.settings),
            c.seed,
            c.endsAt,
            adminId,
          ],
        );
        const id = r.rows[0]!.id;
        await audit(tx, adminId, 'challenge_create', 'challenge', id);
        return { id };
      }
      case 'end': {
        if (!isUuid(b.challengeId)) throw new AdminError(400, 'That was not sent properly.');
        const r = await tx.query(
          `update public.challenges set ends_at = now()
            where id = $1 and (ends_at is null or ends_at > now()) and starts_at < now()`,
          [b.challengeId],
        );
        if (r.rowCount === 0) throw new AdminError(409, 'That challenge has ended already.');
        await audit(tx, adminId, 'challenge_end', 'challenge', b.challengeId);
        return {};
      }
      case 'assign_owner': {
        if (!isUuid(b.groupId) || typeof b.username !== 'string') {
          throw new AdminError(400, 'That was not sent properly.');
        }
        const u = await tx.query<{ user_id: string }>(
          'select user_id from public.profiles where lower(username) = lower($1)',
          [b.username],
        );
        const g = await tx.query('select 1 from public.groups where id = $1 and owner_id is null', [
          b.groupId,
        ]);
        if (!u.rows[0] || g.rowCount === 0) {
          throw new AdminError(404, 'That group or person was not found.');
        }
        try {
          // The function checks the admin and the new owner again and writes its own audit row.
          await tx.query('select public.assign_group_owner($1, $2, $3)', [
            adminId,
            b.groupId,
            u.rows[0].user_id,
          ]);
        } catch (e) {
          if ((e as { code?: string }).code === '42501') {
            throw new AdminError(
              409,
              'The new owner must be a community member, 16 or over, in good standing.',
            );
          }
          throw e;
        }
        return {};
      }
      default:
        throw new AdminError(400, 'That is not something an admin can do here.');
    }
  });
}
