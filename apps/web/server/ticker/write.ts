import 'server-only';
import { DISTRICTS, MODES, type DistrictId, type ModeId } from '@gg/shared';
import type { SqlClient } from '../db/sql';

/**
 * Writing the live activity ticker (PRD 9.4). The server writes every line; the browser roles can
 * not. A line is written only for a player who agreed to share (the profile's ticker setting,
 * off by default), who is a community member (16 or over, not banned or suspended), whose profile
 * is not private, while the ticker switch is on, and no more than the `ticker_event` rate allows
 * (6 an hour by default), so one player can not flood it.
 *
 * A line is a plain fact with no name in it ("started a Fast Farm in Western Victoria"): the
 * username is put in front when it is read, so a changed username is never out of date. No
 * farm name (free text) and no figure that reveals a rule is ever in a line.
 */

export const TICKER_DAYS = [100, 365, 500, 1000, 2000] as const;

export async function recordActivity(
  sql: SqlClient,
  userId: string,
  farmId: string | null,
  kind: 'farm_started' | 'farm_day' | 'year_finished',
  text: string,
): Promise<boolean> {
  return sql.transaction(async (tx) => {
    const ok = await tx.query<{ ok: boolean }>(
      `select app.feature_on('community') and app.feature_on('activity_ticker')
              and app.member_raw(p.user_id) and p.ticker_opt_in
              and p.privacy_profile <> 'private' as ok
         from public.profiles p where p.user_id = $1`,
      [userId],
    );
    if (!ok.rows[0]?.ok) return false;
    const rate = await tx.query<{ ok: boolean }>(`select app.take_rate('ticker_event', $1) as ok`, [
      userId,
    ]);
    if (!rate.rows[0]?.ok) return false;
    await tx.query(
      `insert into public.activity_events (user_id, farm_id, kind, text, public)
       values ($1, $2, $3, $4, true)`,
      [userId, farmId, kind, text.slice(0, 200)],
    );
    return true;
  });
}

/** The words for a farm that has just started. */
export const startedText = (mode: ModeId, district: string): string =>
  `started a ${MODES[mode].name} in ${DISTRICTS[district as DistrictId]?.name ?? 'a new district'}`;

/** The milestone days passed between two days, oldest first. */
export const daysPassed = (from: number, to: number): number[] =>
  TICKER_DAYS.filter((d) => d > from && d <= to);

export const dayText = (day: number): string =>
  `reached Day ${day.toLocaleString('en-AU')} on their farm`;
export const yearText = (n: number): string => `finished year ${n} on their farm`;
