import 'server-only';
import { DISTRICT_IDS } from '@gg/shared';
import type { SqlClient, SqlRunner } from '../db/sql';
import { BOARDS, type AnyBoard } from './score';
import { PERIODS, periodKey, type Period } from './write';
import type { BoardRow, BoardView } from '@/lib/boards/types';
export type { BoardRow, BoardView } from '@/lib/boards/types';

/**
 * Reading the boards (Stage 4, milestone 4.1; PRD 9.8). Every read goes through the
 * `leaderboard_rows` view AS THE VIEWER (a visitor as `anon`, a player as themselves), so the
 * database decides what a row shows: under 16 or a private profile, the username and district
 * only (no photo, no account id, no farm name); a banned or deleted account as "Former player";
 * rows across a block left out; nothing at all while the leaderboards switch is off. The friends
 * and group filters read the viewer's own follows and the group's members through their rules too.
 */

export const SIZES = ['small', 'medium', 'large'] as const;
export const STARTS = ['running', 'scratch'] as const;
export const ENTERPRISES = ['grazing', 'mixed'] as const;
export const MODES_LIST = ['daily', 'fast'] as const;
export const ROWS_SHOWN = 50;

export interface BoardQuery {
  board: AnyBoard;
  period: Period;
  mode: (typeof MODES_LIST)[number] | null;
  district: string | null;
  size: (typeof SIZES)[number] | null;
  start: (typeof STARTS)[number] | null;
  enterprise: (typeof ENTERPRISES)[number] | null;
  realYear: number | null;
  /** Only farms of people the viewer follows. */
  friends: boolean;
  /** Only farms of this group's members. */
  group: string | null;
  /** Only this challenge's farms. */
  challenge: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pick = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;

/** A board query from the address's query string. Anything not on a list is ignored. */
export function parseBoardQuery(q: Record<string, string | string[] | undefined>): BoardQuery {
  const one = (k: string): string | undefined => {
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const board = pick(one('board'), [...BOARDS, 'real_year'] as const) ?? 'grazier';
  const year = Number(one('year'));
  return {
    board,
    period: board === 'real_year' ? 'all' : (pick(one('period'), PERIODS) ?? 'all'),
    mode: pick(one('mode'), MODES_LIST),
    district: pick(one('district'), DISTRICT_IDS),
    size: pick(one('size'), SIZES),
    start: pick(one('start'), STARTS),
    enterprise: pick(one('enterprise'), ENTERPRISES),
    realYear: Number.isInteger(year) && year >= 1997 && year <= 2100 ? year : null,
    friends: one('friends') === '1',
    group: UUID.test(one('group') ?? '') ? one('group')! : null,
    challenge: UUID.test(one('challenge') ?? '') ? one('challenge')! : null,
  };
}

interface Raw {
  id: string;
  rk: string;
  username: string;
  user_id: string | null;
  avatar_path: string | null;
  district: string;
  score: string;
  days: number;
  farm_name: string | null;
  is_mine: boolean;
}

const toRow = (r: Raw): BoardRow => ({
  rank: Number(r.rk),
  username: r.username,
  userId: r.user_id,
  hasAvatar: r.avatar_path !== null,
  district: r.district,
  score: Number(r.score),
  days: r.days,
  farmName: r.farm_name,
  mine: r.is_mine,
});

/** Read one board as the viewer (`tx` runs as them, or as `anon`). */
export async function readBoard(
  tx: SqlRunner,
  q: BoardQuery,
  now: Date = new Date(),
): Promise<BoardView> {
  const years = (
    await tx.query<{ real_year: number }>(
      `select distinct real_year from public.leaderboard_rows
        where board = 'real_year' and challenge_id is null order by real_year desc limit 40`,
    )
  ).rows.map((r) => r.real_year);
  const year = q.board === 'real_year' ? (q.realYear ?? years[0] ?? null) : null;
  if (q.board === 'real_year' && year === null) return { rows: [], mine: null, years, year };
  const vals: unknown[] = [];
  const where: string[] = [];
  const add = (sql: string, v: unknown): void => {
    vals.push(v);
    where.push(sql.replace('?', `$${vals.length}`));
  };
  add('lr.board = ?', q.board);
  if (q.challenge) {
    add('lr.challenge_id = ?::uuid', q.challenge);
  } else {
    where.push('lr.challenge_id is null');
    add('lr.period = ?', q.period);
    add('lr.period_key = ?', periodKey(q.period, now));
  }
  if (year !== null) add('lr.real_year = ?', year);
  if (q.mode) add('lr.mode = ?', q.mode);
  if (q.district) add('lr.district = ?', q.district);
  if (q.size) add('lr.size = ?', q.size);
  if (q.start) add('lr.start_type = ?', q.start);
  if (q.enterprise) add('lr.enterprise = ?', q.enterprise);
  if (q.friends) {
    // The viewer's own accepted follows, through the follows rule (a visitor or an under-16 has none).
    where.push(`lr.user_id in (select f.followee_id from public.follows f
       where f.follower_id = app.uid() and f.status = 'accepted')`);
  }
  if (q.group) {
    // The group's members, through the group members rule (only a member of a private group sees them).
    add(
      'lr.user_id in (select m.user_id from public.group_members m where m.group_id = ?::uuid)',
      q.group,
    );
  }
  vals.push(ROWS_SHOWN);
  const r = await tx.query<Raw>(
    `with b as (
       select lr.id, rank() over (order by lr.score desc, lr.days desc) as rk, lr.username,
              lr.user_id, lr.avatar_path, lr.district, lr.score, lr.days, lr.farm_name, lr.is_mine
         from public.leaderboard_rows lr
        where ${where.join(' and ')}
     )
     select * from b where rk <= $${vals.length} or is_mine order by rk, id`,
    vals,
  );
  const all = r.rows.map(toRow);
  const rows = all.filter((x) => x.rank <= ROWS_SHOWN).slice(0, ROWS_SHOWN);
  const mine = all.find((x) => x.mine) ?? null;
  return { rows, mine, years, year };
}

/** Run as a visitor: the `anon` role with a visitor's claims, so the view's rules apply. */
export function asVisitor<T>(sql: SqlClient, work: (tx: SqlRunner) => Promise<T>): Promise<T> {
  return sql.transaction(async (tx) => {
    await tx.query('set local role anon');
    await tx.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    return work(tx);
  });
}
