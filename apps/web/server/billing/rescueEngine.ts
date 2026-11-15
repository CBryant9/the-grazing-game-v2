import 'server-only';
import { fromUuid } from '../db/dbstore';
import type { SqlRunner } from '../db/sql';
import type { GameServer } from '../game/game';
import type { RescueEngine } from './rescue';

/**
 * The rescue the purchases call (m6): the engine's `rescueFarm` through the game server, which
 * saves the farm open again with its one diary line. Registered with `setRescueEngine` when the
 * game server starts (server/game/game.ts), only where there is a database.
 *
 * After the game server has saved the farm, its row is marked: `continued`, and `rescue_count`
 * set to the number of rescues the farm itself records. Setting (not adding) keeps it right when a
 * call is made again after a failure part way: the engine's own record is keyed on the purchase
 * id, so it never counts one twice. Status and `ended_at` come back to "active" with the save.
 * The leaderboard row is left as it stopped (PRD 10.3).
 */
export function gameRescueEngine(game: GameServer, sql: () => SqlRunner | null): RescueEngine {
  return {
    async preview(farm) {
      const t = await game.rescueTerms(fromUuid(farm.id));
      return {
        cashAfter: t.cashAfter,
        hardStartCash: t.hardStartCash,
        head: t.cattleSold + t.sheepSold,
        stockValue: t.stockValue,
      };
    },
    async apply({ purchaseId, farm }) {
      const r = await game.rescue(fromUuid(farm.id), purchaseId);
      const db = sql();
      if (db) {
        await db.query(
          `update public.farms set continued = true, rescue_count = greatest(rescue_count, $2)
            where id = $1`,
          [farm.id, r.rescues],
        );
      }
      return { diary: r.diary };
    },
  };
}
