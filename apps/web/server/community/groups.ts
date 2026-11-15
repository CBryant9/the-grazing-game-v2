import 'server-only';
import { randomInt } from 'node:crypto';
import type { AuthDeps } from '../auth/accounts';
import type { SqlClient, SqlRunner } from '../db/sql';
import { gameServer } from '../game/game';
import { parseSetup } from '../game/setup';
import { newFarm } from '../player';
import { toUuid } from '../db/dbstore';
import { isUuid } from './data';
import { CommunityError } from './errors';
import { field } from './text';
import { resolveMember } from './write';

/**
 * Groups, group challenges and entering a challenge (Stage 4, milestone 4.4; PRD 9.6, 11.6).
 *
 * Reads and most writes run AS THE PLAYER (`tx`), so the database's rules decide: a private group
 * is seen by its members only, a public one by any member of the community; joining is through
 * `join_group` (the code and the member limit are checked there); a member may leave; only the
 * owner may change the group, remove a member or hand it over (`hand_over_group`); nobody may
 * change an ownerless group until an admin gives it an owner. What the database can not say for
 * itself is checked here: the shape of what was typed, and the owner check before the server
 * writes a group challenge (players have no grant on `challenges`).
 */

export interface GroupCard {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  members: number;
  role: 'owner' | 'member' | null;
  ownerless: boolean;
}

export interface MemberRow {
  userId: string;
  username: string;
  role: 'owner' | 'member';
}

export interface ChallengeRow {
  id: string;
  kind: 'fast_challenge' | 'daily_league';
  name: string;
  description: string | null;
  district: string | null;
  startsAt: string;
  endsAt: string | null;
  open: boolean;
  entered: boolean;
  entries: number;
}

export interface GroupDetail extends GroupCard {
  memberList: MemberRow[];
  inviteCode: string | null;
  challenges: ChallengeRow[];
}

const GROUP_SELECT = `g.id, g.name, g.description, g.visibility, (g.owner_id is null) as ownerless,
  (select count(*)::int from public.group_members c where c.group_id = g.id) as members,
  (select m.role from public.group_members m where m.group_id = g.id and m.user_id = app.uid()) as role`;

interface GroupRaw {
  id: string;
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  ownerless: boolean;
  members: number;
  role: 'owner' | 'member' | null;
}
const toCard = (g: GroupRaw): GroupCard => ({ ...g });

/** My groups, then public groups I could join. */
export async function groupLists(tx: SqlRunner): Promise<{ mine: GroupCard[]; open: GroupCard[] }> {
  const mine = await tx.query<GroupRaw>(
    `select ${GROUP_SELECT} from public.groups g
      where exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = app.uid())
      order by g.name limit 100`,
  );
  const open = await tx.query<GroupRaw>(
    `select ${GROUP_SELECT} from public.groups g
      where g.visibility = 'public'
        and not exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = app.uid())
      order by g.created_at desc limit 30`,
  );
  return { mine: mine.rows.map(toCard), open: open.rows.map(toCard) };
}

async function challengesOf(tx: SqlRunner, group: string | null): Promise<ChallengeRow[]> {
  const r = await tx.query<{
    id: string;
    kind: ChallengeRow['kind'];
    name: string;
    description: string | null;
    district: string | null;
    starts_at: string;
    ends_at: string | null;
    open: boolean;
    entered: boolean;
  }>(
    `select c.id, c.kind, c.name, c.description, c.district,
            to_char(c.starts_at at time zone 'Australia/Sydney', 'YYYY-MM-DD') as starts_at,
            to_char(c.ends_at at time zone 'Australia/Sydney', 'YYYY-MM-DD') as ends_at,
            (c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())) as open,
            exists (select 1 from public.challenge_entries e where e.challenge_id = c.id and e.user_id = app.uid()) as entered
       from public.challenges c
      where ${group ? 'c.group_id = $1' : 'c.group_id is null'}
      order by c.starts_at desc limit 30`,
    group ? [group] : [],
  );
  return r.rows.map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    description: c.description,
    district: c.district,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    open: c.open,
    entered: c.entered,
    entries: 0,
  }));
}

/** One group as this player may see it, or null (not there, private and not a member, blocked). */
export async function groupDetail(tx: SqlRunner, id: string): Promise<GroupDetail | null> {
  if (!isUuid(id)) return null;
  const g = await tx.query<GroupRaw>(
    `select ${GROUP_SELECT} from public.groups g where g.id = $1`,
    [id],
  );
  const row = g.rows[0];
  if (!row) return null;
  const members = await tx.query<{ user_id: string; username: string; role: MemberRow['role'] }>(
    `select m.user_id, coalesce(pp.username, 'Former player') as username, m.role
       from public.group_members m
       left join public.public_profiles pp on pp.user_id = m.user_id
      where m.group_id = $1
      order by (m.role = 'owner') desc, pp.username limit 200`,
    [id],
  );
  const code =
    row.role === 'owner'
      ? ((
          await tx.query<{ code: string | null }>('select public.group_invite_code($1) as code', [
            id,
          ])
        ).rows[0]?.code ?? null)
      : null;
  return {
    ...toCard(row),
    memberList: members.rows.map((m) => ({
      userId: m.user_id,
      username: m.username,
      role: m.role,
    })),
    inviteCode: code,
    challenges: row.role ? await challengesOf(tx, id) : [],
  };
}

/** The public challenges and leagues (made in admin). */
export const publicChallenges = (tx: SqlRunner): Promise<ChallengeRow[]> => challengesOf(tx, null);

// ------------------------------------------------------------------ writes

function bad(message: string): never {
  throw new CommunityError(400, message);
}

/** The id of the group this request just made (see `justMade` in write.ts for why not `returning`). */
async function madeGroup(tx: SqlRunner, me: string): Promise<string> {
  const r = await tx.query<{ id: string }>(
    `select id from public.groups where owner_id = $1 and created_at = now() order by id limit 1`,
    [me],
  );
  if (!r.rows[0])
    throw new CommunityError(500, 'Something went wrong on the server. Nothing was changed.');
  return r.rows[0].id;
}

function groupFields(b: Record<string, unknown>): {
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
} {
  const name = field(b.name, 'group name', 60, { required: true })!;
  if ([...name].length < 3) bad('A group name needs at least 3 letters.');
  const description = field(b.description, 'description', 1000, { multiline: true });
  if (b.visibility !== 'public' && b.visibility !== 'private') bad('Choose public or private.');
  return { name, description, visibility: b.visibility };
}

export type GroupAction =
  'create' | 'join' | 'leave' | 'remove' | 'handover' | 'update' | 'delete' | 'challenge';

/** One change to a group, as the player. Returns what the page needs next. */
export async function groupAction(
  deps: AuthDeps,
  run: <T>(work: (tx: SqlRunner) => Promise<T>) => Promise<T>,
  me: string,
  b: Record<string, unknown>,
): Promise<{ id?: string }> {
  const action = b.action as GroupAction;
  if (action === 'create') {
    const f = groupFields(b);
    return run(async (tx) => {
      await tx.query(
        `insert into public.groups (name, description, visibility, owner_id) values ($1, $2, $3, $4)`,
        [f.name, f.description, f.visibility, me],
      );
      return { id: await madeGroup(tx, me) };
    });
  }
  if (action === 'join') {
    // By invite code (any group), or by id (a public group).
    let id: string | null = isUuid(b.groupId) ? b.groupId : null;
    const code = typeof b.code === 'string' ? b.code.trim().toLowerCase() : null;
    if (code !== null) {
      if (!/^[0-9a-f]{12,32}$/.test(code)) bad('That invite code is not right.');
      // The code is a secret: it is looked up here and passed on, never listed.
      const r = await deps.sql.query<{ id: string }>(
        'select id from public.groups where invite_code = $1',
        [code],
      );
      id = r.rows[0]?.id ?? null;
      if (!id) throw new CommunityError(404, 'That invite code is not right.');
    }
    if (!id) bad('Choose a group, or type its invite code.');
    try {
      await run((tx) => tx.query('select public.join_group($1, $2)', [id, code]));
    } catch (e) {
      const err = e as { hint?: string; code?: string };
      if (err.hint === 'group_full') throw new CommunityError(409, 'That group is full.');
      if (err.code === 'P0002') throw new CommunityError(404, 'That group was not found.');
      if (err.code === '42501') throw new CommunityError(403, 'That invite code is not right.');
      throw e;
    }
    return { id };
  }
  const id = isUuid(b.groupId) ? b.groupId : bad('That group was not sent properly.');
  if (action === 'challenge') {
    const c = challengeFields(b);
    const seen = await run((tx) => groupDetail(tx, id));
    if (!seen) throw new CommunityError(404, 'That group was not found.');
    if (seen.ownerless) {
      throw new CommunityError(409, 'This group has no owner. An admin can give it one.');
    }
    if (seen.role !== 'owner') throw new CommunityError(403, 'Only the group owner can do that.');
    // Players have no grant on challenges: the server writes it, after the owner check above and
    // again in the statement itself, on its own connection.
    const r = await deps.sql.query<{ id: string }>(
      `insert into public.challenges (kind, name, description, district, settings, seed, starts_at, ends_at, group_id, created_by)
       select $1, $2, $3, $4, $5::jsonb, $6, now(), $7::timestamptz, g.id, $9
         from public.groups g where g.id = $8 and g.owner_id = $9 and app.member_raw($9)
       returning id`,
      [
        c.kind,
        c.name,
        c.description,
        c.district,
        JSON.stringify(c.settings),
        c.seed,
        c.endsAt,
        id,
        me,
      ],
    );
    if (!r.rows[0]) throw new CommunityError(403, 'Only the group owner can do that.');
    return { id: r.rows[0].id };
  }
  return run(async (tx) => {
    const seen = await groupDetail(tx, id);
    if (!seen) throw new CommunityError(404, 'That group was not found.');
    const owner = seen.role === 'owner';
    const ownerOnly = (): void => {
      if (seen.ownerless) {
        throw new CommunityError(409, 'This group has no owner. An admin can give it one.');
      }
      if (!owner) throw new CommunityError(403, 'Only the group owner can do that.');
    };
    switch (action) {
      case 'leave': {
        if (owner) {
          throw new CommunityError(409, 'Hand the group to another member first, or delete it.');
        }
        await tx.query('delete from public.group_members where group_id = $1 and user_id = $2', [
          id,
          me,
        ]);
        return {};
      }
      case 'remove': {
        ownerOnly();
        const who = await resolveMember(tx, b.username);
        if (who === me) bad('You can not remove yourself. Hand the group over first.');
        const r = await tx.query(
          `delete from public.group_members where group_id = $1 and user_id = $2 and role <> 'owner'`,
          [id, who],
        );
        if (r.rowCount === 0) throw new CommunityError(404, 'That person is not in the group.');
        return {};
      }
      case 'handover': {
        ownerOnly();
        const who = await resolveMember(tx, b.username);
        if (who === me) bad('You own the group already.');
        await tx.query('select public.hand_over_group($1, $2)', [id, who]);
        return {};
      }
      case 'update': {
        ownerOnly();
        const f = groupFields(b);
        await tx.query(
          'update public.groups set name = $2, description = $3, visibility = $4 where id = $1',
          [id, f.name, f.description, f.visibility],
        );
        return {};
      }
      case 'delete': {
        ownerOnly();
        await tx.query('delete from public.groups where id = $1', [id]);
        return {};
      }
      default:
        bad('That is not something you can do to a group.');
    }
  });
}

/** The fields of a challenge: a name, its kind, the farm settings everyone starts with, an end date. */
export function challengeFields(b: Record<string, unknown>): {
  kind: 'fast_challenge' | 'daily_league';
  name: string;
  description: string | null;
  district: string;
  settings: Record<string, unknown>;
  seed: number;
  endsAt: string | null;
} {
  const kind =
    b.kind === 'daily_league'
      ? 'daily_league'
      : b.kind === 'fast_challenge'
        ? 'fast_challenge'
        : bad('Choose a Fast Farm challenge or a Daily league.');
  const name = field(b.name, 'challenge name', 80, { required: true })!;
  const description = field(b.description, 'description', 1000, { multiline: true });
  const s = parseSetup({ ...(b.settings as Record<string, unknown>), name });
  if (!s.ok) bad(s.message);
  const settings: Record<string, unknown> = { ...s.value };
  delete settings.name;
  let endsAt: string | null = null;
  if (b.endsOn !== undefined && b.endsOn !== null && b.endsOn !== '') {
    if (typeof b.endsOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.endsOn)) {
      bad('Enter the end date like 2027-03-31.');
    }
    const at = new Date(`${b.endsOn}T23:59:59+10:00`);
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now())
      bad('The end date must be after today.');
    endsAt = at.toISOString();
  }
  return {
    kind,
    name,
    description,
    district: s.value.district,
    settings,
    seed: randomInt(1, 2 ** 31 - 1),
    endsAt,
  };
}

/**
 * Enter a challenge: a farm started for it, with its settings and its seed, in the player's own
 * account. One entry each. The seed never leaves the server. A Daily league opens when Daily Farms
 * do (they are not built yet), so entering one is refused with a plain reason.
 */
export async function enterChallenge(
  deps: AuthDeps,
  run: <T>(work: (tx: SqlRunner) => Promise<T>) => Promise<T>,
  me: string,
  challengeId: unknown,
): Promise<{ farmId: string }> {
  if (!isUuid(challengeId)) bad('That challenge was not sent properly.');
  // Seen through the player's own rules: public, or a group they are in.
  const c = await run(async (tx) => {
    const r = await tx.query<{
      id: string;
      kind: string;
      name: string;
      settings: Record<string, unknown>;
      open: boolean;
      group_id: string | null;
    }>(
      `select id, kind, name, settings, group_id,
              (starts_at <= now() and (ends_at is null or ends_at > now())) as open
         from public.challenges where id = $1`,
      [challengeId],
    );
    const row = r.rows[0];
    if (row?.group_id) {
      const m = await tx.query(
        'select 1 from public.group_members where group_id = $1 and user_id = $2',
        [row.group_id, me],
      );
      if (m.rowCount === 0) return null;
    }
    return row ?? null;
  });
  if (!c) throw new CommunityError(404, 'That challenge was not found.');
  if (!c.open) throw new CommunityError(409, 'That challenge is not open.');
  if (c.kind === 'daily_league') {
    throw new CommunityError(
      409,
      'Daily leagues open when Daily Farms do. This one is not open yet.',
    );
  }
  const sql: SqlClient = deps.sql;
  const seed = await sql.query<{ seed: string; entered: boolean }>(
    `select c.seed::text as seed,
            exists (select 1 from public.challenge_entries e where e.challenge_id = c.id and e.user_id = $2) as entered
       from public.challenges c where c.id = $1`,
    [c.id, me],
  );
  if (seed.rows[0]?.entered)
    throw new CommunityError(409, 'You have entered this challenge already.');
  const choices = parseSetup({ ...c.settings, name: c.name.slice(0, 60) });
  if (!choices.ok) throw new CommunityError(409, 'That challenge can not be started right now.');
  const farm = newFarm();
  await gameServer().create(
    farm.key,
    choices.value,
    { kind: 'user', id: me },
    Number(seed.rows[0]!.seed),
  );
  const uuid = toUuid(farm.id);
  await sql.transaction(async (tx) => {
    await tx.query('update public.farms set challenge_id = $2 where id = $1 and owner_id = $3', [
      uuid,
      c.id,
      me,
    ]);
    await tx.query(
      'insert into public.challenge_entries (challenge_id, farm_id, user_id) values ($1, $2, $3)',
      [c.id, uuid, me],
    );
  });
  return { farmId: farm.id };
}
