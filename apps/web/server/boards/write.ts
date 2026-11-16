import 'server-only';
import type { SqlClient, SqlRunner } from '../db/sql';
import { BOARDS, figures, realYearChange, type BoardFarm } from './score';

/**
 * Writing the boards (Stage 4, milestone 4.1; PRD 9.8, 14.5). Only the server writes a board row:
 * the browser roles have no grant on `leaderboard_entries` at all. This runs on the server's own
 * connection, called by the game server right after a year closes (`server/stage4/hooks.ts`).
 *
 * The checks before a farm counts (PRD 14.5, "only server-checked farms count"):
 * - It belongs to an account (a guest's farm is never on a board) and is marked ranked.
 * - It was not rescued after a game over (10.3): its rows stop at the game over.
 * - The action log agrees: the server ran at least one day or skip for it, every logged step is
 *   on or before the farm's day, and the log has no gaps in its numbering. v1.1 runs every farm on
 *   the server, so there is no replay to check; the log is what the tables allow.
 *
 * Each board row is one farm's figure for one period (this week, month, season, all time), keyed
 * by the period it was written in (Sydney time). A real-year row is one per real year played.
 * A farm entered in a challenge also writes its challenge rows.
 */

export type Period = 'week' | 'month' | 'season' | 'all';
export const PERIODS: readonly Period[] = ['week', 'month', 'season', 'all'];

/** The calendar parts of a moment in Sydney. */
function sydneyParts(at: Date): { y: number; m: number; d: number } {
  const p = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(at);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: n('year'), m: n('month'), d: n('day') };
}

/** The key of the period a moment falls in: '2026-W46', '2026-11', '2026-spring', 'all'. */
export function periodKey(period: Period, at: Date): string {
  const { y, m, d } = sydneyParts(at);
  switch (period) {
    case 'all':
      return 'all';
    case 'month':
      return `${y}-${String(m).padStart(2, '0')}`;
    case 'season': {
      // Southern seasons. December belongs to the summer that runs into the next year.
      const season =
        m === 12 || m <= 2 ? 'summer' : m <= 5 ? 'autumn' : m <= 8 ? 'winter' : 'spring';
      return `${m === 12 ? y + 1 : y}-${season}`;
    }
    case 'week': {
      // ISO week of the Sydney date.
      const date = new Date(Date.UTC(y, m - 1, d));
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - day);
      const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((date.getTime() - start.getTime()) / 86_400_000 + 1) / 7);
      return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
  }
}

interface FarmRow {
  owner_id: string | null;
  mode: 'daily' | 'fast';
  district: string;
  size: string;
  start_type: string;
  enterprise: string;
  name: string;
  ranked: boolean;
  continued: boolean;
  challenge_id: string | null;
}

/** Does the action log agree with the farm (PRD 14.5)? */
export async function actionLogAgrees(
  tx: SqlRunner,
  farmId: string,
  day: number,
): Promise<boolean> {
  const r = await tx.query<{
    advances: number;
    last_day: number | null;
    n: number;
    top: number | null;
  }>(
    `select count(*) filter (where ok and action->>'type' in ('day', 'skip'))::int as advances,
            max(game_day) as last_day, count(*)::int as n, max(seq) as top
       from public.farm_actions where farm_id = $1`,
    [farmId],
  );
  const row = r.rows[0];
  if (!row || row.advances === 0) return false;
  if (row.last_day !== null && row.last_day > day) return false;
  // The log is numbered from 0 with no gaps: a missing step means the log was not kept whole.
  return row.top !== null && row.n === row.top + 1;
}

export type WriteResult = 'written' | 'not_ranked' | 'no_years' | 'log_disagrees';

/** Write a farm's board rows and its score row. `farmId` is the database id (a uuid). */
export async function writeBoards(
  sql: SqlClient,
  farmId: string,
  farm: BoardFarm,
  now: Date = new Date(),
): Promise<WriteResult> {
  const fig = figures(farm);
  if (!fig) return 'no_years';
  return sql.transaction(async (tx) => {
    const f = await tx.query<FarmRow>(
      `select owner_id, mode, district, size, start_type, enterprise, name, ranked, continued, challenge_id
         from public.farms where id = $1 for update`,
      [farmId],
    );
    const row = f.rows[0];
    if (!row || !row.owner_id || !row.ranked || row.continued) return 'not_ranked';
    const agrees = await actionLogAgrees(tx, farmId, farm.day);
    await tx.query(
      `insert into public.farm_scores
         (farm_id, grazier_score, profit_per_ha, beef_per_ha, ground_cover_pct, days_survived, verified, verified_at)
       values ($1, $2, $3, $4, $5, $6, $7, case when $7 then now() end)
       on conflict (farm_id) do update set
         grazier_score = excluded.grazier_score, profit_per_ha = excluded.profit_per_ha,
         beef_per_ha = excluded.beef_per_ha, ground_cover_pct = excluded.ground_cover_pct,
         days_survived = excluded.days_survived, verified = excluded.verified,
         verified_at = excluded.verified_at`,
      [farmId, fig.grazier, fig.profit_per_ha, fig.beef_per_ha, fig.ground_cover, farm.day, agrees],
    );
    if (!agrees) return 'log_disagrees';
    const put = async (
      board: string,
      period: Period,
      key: string,
      score: number,
      realYear: number | null,
      challenge: string | null,
    ): Promise<void> => {
      await tx.query(
        `delete from public.leaderboard_entries
          where farm_id = $1 and board = $2 and period_key = $3
            and real_year is not distinct from $4 and challenge_id is not distinct from $5`,
        [farmId, board, key, realYear, challenge],
      );
      await tx.query(
        `insert into public.leaderboard_entries
           (farm_id, user_id, board, mode, district, size, start_type, enterprise, period, period_key,
            real_year, challenge_id, score, days, continued, farm_name)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false, $15)`,
        [
          farmId,
          row.owner_id,
          board,
          row.mode,
          row.district,
          row.size,
          row.start_type,
          row.enterprise,
          period,
          key,
          realYear,
          challenge,
          score,
          farm.day,
          row.name,
        ],
      );
    };
    for (const period of PERIODS) {
      const key = periodKey(period, now);
      for (const board of BOARDS) await put(board, period, key, fig[board], null, null);
    }
    for (const y of farm.years) {
      if (y.realYear !== null) {
        await put('real_year', 'all', 'all', realYearChange(y, farm.ha), y.realYear, null);
      }
    }
    if (row.challenge_id) {
      for (const board of BOARDS)
        await put(board, 'all', 'all', fig[board], null, row.challenge_id);
    }
    return 'written';
  });
}
