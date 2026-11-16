import 'server-only';
import { logFailure } from '../logging';
import type { SqlClient } from '../db/sql';
import { toUuid } from '../db/dbstore';
import type { BoardFarm } from '../boards/score';
import { writeBoards } from '../boards/write';
import { makeDayCard } from '../community/share';
import { dayText, daysPassed, recordActivity, startedText, yearText } from '../ticker/write';

/**
 * What the game server tells Stage 4 after a farm changes: a farm started, or days passed (an end
 * day or a skip), with any years that closed. Only a database store has these (a copy with no
 * database keeps no boards and no ticker). A failure here is logged and never stops the game:
 * the day is already saved when these run.
 */
export interface AdvanceInfo {
  fromDay: number;
  toDay: number;
  /** Years that closed in this step. */
  closed: number;
  /** The farm's figures for the boards (every finished year). */
  farm: BoardFarm;
}

export interface GameHooks {
  started(farmId: string): Promise<void>;
  advanced(farmId: string, info: AdvanceInfo): Promise<void>;
}

interface Owner {
  owner_id: string | null;
  mode: 'daily' | 'fast';
  district: string;
}

async function ownerOf(sql: SqlClient, id: string): Promise<Owner | null> {
  const r = await sql.query<Owner>(
    'select owner_id, mode, district from public.farms where id = $1',
    [id],
  );
  return r.rows[0] ?? null;
}

export function dbHooks(sql: SqlClient, now: () => Date = () => new Date()): GameHooks {
  return {
    async started(farmId) {
      try {
        const id = toUuid(farmId);
        const f = await ownerOf(sql, id);
        if (f?.owner_id) {
          await recordActivity(
            sql,
            f.owner_id,
            id,
            'farm_started',
            startedText(f.mode, f.district),
          );
        }
      } catch (e) {
        logFailure({ route: 'stage4-hooks', reason: 'started_hook_failed' }, e);
      }
    },
    async advanced(farmId, info) {
      try {
        const id = toUuid(farmId);
        const f = await ownerOf(sql, id);
        if (!f?.owner_id) return;
        if (info.closed > 0) await writeBoards(sql, id, info.farm, now());
        for (const day of daysPassed(info.fromDay, info.toDay)) {
          await recordActivity(sql, f.owner_id, id, 'farm_day', dayText(day));
        }
        // A Daily Farm's day card for each day that ended (PRD 9.3, m6 join: called from the
        // rollover's night). makeDayCard decides who gets one and makes each once.
        if (f.mode === 'daily') {
          for (let day = info.fromDay; day < info.toDay; day++) await makeDayCard(sql, id, day);
        }
        const years = info.farm.years;
        for (const y of years.slice(Math.max(0, years.length - info.closed))) {
          await recordActivity(sql, f.owner_id, id, 'year_finished', yearText(y.n));
        }
      } catch (e) {
        logFailure({ route: 'stage4-hooks', reason: 'advanced_hook_failed' }, e);
      }
    },
  };
}
