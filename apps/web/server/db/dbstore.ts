import 'server-only';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { FarmListItem, PastDayWire } from '../../lib/game/types';
import { DIARY_DAYS, type StoredDiaryDay } from '../game/diary';
import {
  FarmLimitError,
  PAST_DAILY_DAYS,
  PAST_MAX_DAYS,
  SaveConflictError,
  StoreUnavailableError,
  type FarmFacts,
  type FarmStore,
  type Owner,
  type PutOptions,
  type StoredFarm,
} from '../game/store';
import type { SqlClient, SqlRunner } from './sql';

/** The game's farm id is 32 hex; the database's is a uuid. One form at the edge, converted here. */
export function toUuid(hex: string): string {
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('That is not a farm id.');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const fromUuid = (id: string): string => id.replaceAll('-', '');

/** What the database keeps of a guest's secret: its SHA-256, never the secret. */
export const sessionHash = (session: string): string =>
  createHash('sha256').update(session).digest('hex');

const dateText = (d: { year: number; month: number; date: number }): string =>
  `${String(d.year).padStart(4, '0')}-${String(d.month + 1).padStart(2, '0')}-${String(d.date).padStart(2, '0')}`;

const dateParts = (text: string): { year: number; month: number; date: number } => {
  const [y, m, d] = text.split('-').map(Number);
  return { year: y!, month: m! - 1, date: d! };
};

/** An error from the driver, with the SQLSTATE and hint the database raised. */
interface DbError {
  code?: string;
  hint?: string;
  message?: string;
}

/**
 * Turn what the driver throws into what the game understands. The database's
 * farm limit (P0001, hint farm_limit) is a plain "no room". A refusal the
 * database made on purpose (a constraint, a check) is a programming error and
 * passes through. Anything else (a lost connection, a timeout, a busy server)
 * is `StoreUnavailableError`, which the game retries.
 */
export function mapDbError(e: unknown): Error {
  if (e instanceof SaveConflictError || e instanceof FarmLimitError) return e;
  const err = e as DbError;
  if (err?.code === 'P0001' && err.hint === 'farm_limit') {
    return new FarmLimitError('The account has no room for another farm.');
  }
  // 22, 23, 42 (data, constraint, syntax) are the database saying no. Not worth retrying.
  if (typeof err?.code === 'string' && /^(22|23|42|P0)/.test(err.code)) {
    return e instanceof Error ? e : new Error(err.message ?? String(e));
  }
  return new StoreUnavailableError(err?.message ?? 'The database could not be reached.');
}

interface SaveRow {
  stored_format: number;
  name: string;
  save: unknown;
  setup: unknown;
  farm_version: string;
  done: unknown;
  inbox_read: number | null;
  missed_wages: number[];
}

const json = (v: unknown): string => JSON.stringify(v);

/**
 * Farms kept in the database (docs/DATABASE.md): `farms` (the facts),
 * `farm_saves` (the engine's save, the setup, the version), `farm_days` (the
 * diary), `farm_snapshots` and `farm_snapshot_views` (the days gone by),
 * `farm_actions` (the log of jobs). It runs as the server, never as a
 * player, and it never hands the browser anything.
 */
export class DbFarmStore implements FarmStore {
  readonly kind = 'db' as const;

  constructor(
    private readonly sql: SqlClient,
    private readonly clock: () => number = Date.now,
  ) {}

  /** The connection, for the Stage 4 hooks (boards, ticker) that run after a farm changes. */
  get client(): SqlClient {
    return this.sql;
  }

  private async guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      throw mapDbError(e);
    }
  }

  async get(farmId: string): Promise<unknown> {
    const id = toUuid(farmId);
    return this.guard(async () => {
      const r = await this.sql.query<SaveRow>(
        `select s.stored_format, f.name, s.save, s.setup, s.farm_version, s.done,
                s.inbox_read, s.missed_wages
           from public.farm_saves s join public.farms f on f.id = s.farm_id
          where s.farm_id = $1`,
        [id],
      );
      const row = r.rows[0];
      if (!row) return null;
      const days = await this.sql.query<{
        day: number;
        d: string;
        lines: string[];
        more: number;
      }>(
        `select day, to_char(game_date, 'YYYY-MM-DD') as d, lines, more
           from public.farm_days where farm_id = $1 order by day desc limit ${DIARY_DAYS}`,
        [id],
      );
      const diary: StoredDiaryDay[] = days.rows
        .map((d) => ({ day: d.day, date: dateParts(d.d), lines: d.lines, more: d.more }))
        .reverse();
      return {
        format: row.stored_format,
        name: row.name,
        setup: row.setup,
        saved: row.save,
        version: row.farm_version,
        done: row.done,
        ...(row.inbox_read !== null ? { inboxRead: row.inbox_read } : {}),
        ...(row.missed_wages.length ? { missedWages: row.missed_wages } : {}),
        diary,
      };
    });
  }

  async guestAccess(farmId: string, session: string): Promise<'ok' | 'free' | 'denied'> {
    return this.guard(async () => {
      const r = await this.sql.query<{ guest: string | null; hash: string | null; done: boolean }>(
        `select f.guest_session_id as guest, g.token_hash as hash, (g.converted_at is not null) as done
           from public.farms f left join public.guest_sessions g on g.id = f.guest_session_id
          where f.id = $1`,
        [toUuid(farmId)],
      );
      const row = r.rows[0];
      if (!row) return 'free';
      return row.guest !== null && row.hash === sessionHash(session) && !row.done ? 'ok' : 'denied';
    });
  }

  async version(farmId: string): Promise<string | null> {
    return this.guard(async () => {
      const r = await this.sql.query<{ v: string }>(
        'select farm_version as v from public.farm_saves where farm_id = $1',
        [toUuid(farmId)],
      );
      return r.rows[0]?.v ?? null;
    });
  }

  private async writeSave(
    tx: SqlRunner,
    id: string,
    farm: StoredFarm,
    expect: string,
  ): Promise<number> {
    const r = await tx.query(
      `update public.farm_saves
          set stored_format = $2, save_format = $3, engine_version = $4, save = $5::jsonb,
              setup = $6::jsonb, farm_version = $7, done = $8::jsonb, inbox_read = $9,
              missed_wages = array(select jsonb_array_elements_text($10::jsonb)::int)
        where farm_id = $1 and farm_version = $11`,
      [
        id,
        farm.format,
        farm.saved.saveFormat,
        farm.saved.engineVersion,
        json(farm.saved),
        json(farm.setup),
        farm.version,
        json(farm.done),
        farm.inboxRead ?? null,
        json(farm.missedWages ?? []),
        expect,
      ],
    );
    return r.rowCount;
  }

  private async writeDays(
    tx: SqlRunner,
    id: string,
    farm: StoredFarm,
    days: readonly number[],
  ): Promise<void> {
    if (days.length === 0) return;
    for (const day of new Set(days)) {
      const entry = farm.diary.find((d) => d.day === day);
      if (!entry) continue;
      await tx.query(
        `insert into public.farm_days (farm_id, day, game_date, lines, more)
         values ($1, $2, $3::date, array(select jsonb_array_elements_text($4::jsonb)), $5)
         on conflict (farm_id, day) do update
           set game_date = excluded.game_date, lines = excluded.lines, more = excluded.more`,
        [id, day, dateText(entry.date), json(entry.lines), entry.more],
      );
    }
    // The diary keeps the newest days only, as the file does.
    await tx.query(
      `delete from public.farm_days where farm_id = $1 and day not in
         (select day from public.farm_days where farm_id = $1 order by day desc limit ${DIARY_DAYS})`,
      [id],
    );
  }

  private async writePast(tx: SqlRunner, id: string, past: PastDayWire): Promise<void> {
    const text = json(past);
    // Kept gzipped: 45 KB of JSON is about 4 KB.
    const packed = gzipSync(text, { level: 9 });
    await tx.query(
      `insert into public.farm_snapshots (farm_id, day, game_date, storage_path, bytes)
       values ($1, $2, $3::date, $4, $5)
       on conflict (farm_id, day) do update
         set game_date = excluded.game_date, bytes = excluded.bytes`,
      [id, past.day, dateText(past.date), `db:${past.day}`, packed.length],
    );
    await tx.query(
      `insert into public.farm_snapshot_views (farm_id, day, view_gz) values ($1, $2, $3)
       on conflict (farm_id, day) do update set view_gz = excluded.view_gz`,
      [id, past.day, packed],
    );
    // Every day for 14 days, then one a week, nothing past 182 days. The views go with them.
    await tx.query(
      `delete from public.farm_snapshots
        where farm_id = $1
          and not (
            ($2 - day) >= 0
            and (($2 - day) < ${PAST_DAILY_DAYS}
                 or (($2 - day) < ${PAST_MAX_DAYS} and day % 7 = 0))
          )`,
      [id, past.day],
    );
  }

  private async writeFacts(tx: SqlRunner, id: string, facts: FarmFacts): Promise<void> {
    await tx.query(
      `update public.farms
          set current_day = $2, game_date = $3::date, engine_version = $4,
              status = case when $5::text is null then 'active' else 'ended' end,
              ended_at = case when $5::text is null then null else coalesce(ended_at, now()) end,
              end_reason = left($5::text, 200),
              last_opened_at = now()
        where id = $1`,
      [id, facts.day, dateText(facts.date), facts.engineVersion, facts.over],
    );
  }

  async create(farmId: string, owner: Owner, farm: StoredFarm, facts: FarmFacts): Promise<void> {
    const id = toUuid(farmId);
    await this.guard(() =>
      this.sql.transaction(async (tx) => {
        let ownerId: string | null = null;
        let guestId: string | null = null;
        if (owner.kind === 'user') ownerId = owner.id;
        else {
          const g = await tx.query<{ id: string }>(
            `insert into public.guest_sessions (token_hash) values ($1)
             on conflict (token_hash) do update set last_seen_at = now()
             returning id`,
            [sessionHash(owner.session)],
          );
          guestId = g.rows[0]!.id;
        }
        await tx.query(
          `insert into public.farms
             (id, owner_id, guest_session_id, mode, name, district, size, size_ha, enterprise,
              start_type, difficulty, years, engine_version, current_day, game_date)
           values ($1, $2, $3, 'fast', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::date)`,
          [
            id,
            ownerId,
            guestId,
            facts.name,
            facts.district,
            facts.size,
            facts.sizeHa,
            facts.enterprise,
            facts.startType,
            facts.difficulty,
            facts.years,
            facts.engineVersion,
            facts.day,
            dateText(facts.date),
          ],
        );
        await tx.query(
          `insert into public.farm_saves
             (farm_id, stored_format, save_format, engine_version, save, setup, farm_version, done)
           values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, '[]'::jsonb)`,
          [
            id,
            farm.format,
            farm.saved.saveFormat,
            farm.saved.engineVersion,
            json(farm.saved),
            json(farm.setup),
            farm.version,
          ],
        );
      }),
    );
  }

  async put(farmId: string, farm: StoredFarm, options: PutOptions): Promise<void> {
    // The interface requires the version; this keeps a caller that gets round the types honest.
    if (typeof options?.expect !== 'string' || options.expect === '') {
      throw new Error('A save must name the version it expects.');
    }
    const id = toUuid(farmId);
    await this.guard(() =>
      this.sql.transaction(async (tx) => {
        // The version in the WHERE is what stops two tabs both winning: the
        // second one finds the version changed and changes nothing.
        const changed = await this.writeSave(tx, id, farm, options.expect);
        if (changed === 0) throw new SaveConflictError('The farm changed under this save.');
        if (options.facts) await this.writeFacts(tx, id, options.facts);
        if (options.diaryDays) await this.writeDays(tx, id, farm, options.diaryDays);
        const a = options.action;
        if (a) {
          await tx.query(
            `insert into public.farm_actions (farm_id, seq, game_day, request_id, action, ok, reason)
             select $1, coalesce(max(seq) + 1, 0), $2, $3, $4::jsonb, $5, left($6::text, 200)
               from public.farm_actions where farm_id = $1
             on conflict do nothing`,
            [id, a.day, a.requestId ?? null, json(a.action), a.ok, a.reason ?? null],
          );
        }
        if (options.past) await this.writePast(tx, id, options.past);
      }),
    );
  }

  async delete(farmId: string): Promise<void> {
    await this.guard(async () => {
      await this.sql.query('delete from public.farms where id = $1', [toUuid(farmId)]);
    });
  }

  async setAside(farmId: string): Promise<void> {
    const id = toUuid(farmId);
    await this.guard(() =>
      this.sql.transaction(async (tx) => {
        await tx.query(
          `insert into public.farm_saves_aside
             (farm_id, owner_id, guest_session_id, stored_format, save, setup, reason)
           select f.id, f.owner_id, f.guest_session_id, s.stored_format, s.save, s.setup,
                  'The save could not be opened.'
             from public.farms f left join public.farm_saves s on s.farm_id = f.id
            where f.id = $1`,
          [id],
        );
        await tx.query('delete from public.farms where id = $1', [id]);
      }),
    );
  }

  async touch(farmId: string): Promise<void> {
    const id = toUuid(farmId);
    await this.guard(() =>
      this.sql.transaction(async (tx) => {
        await tx.query('update public.farms set last_opened_at = now() where id = $1', [id]);
        await tx.query(
          `update public.guest_sessions set last_seen_at = now()
            where id = (select guest_session_id from public.farms where id = $1)`,
          [id],
        );
      }),
    );
  }

  async count(): Promise<number> {
    return this.guard(async () => {
      const r = await this.sql.query<{ n: number }>('select count(*)::int as n from public.farms');
      return r.rows[0]!.n;
    });
  }

  /**
   * The database defines the clean-ups: a guest not seen for 30 days goes
   * with their farm, and a save kept aside goes after 30 days
   * (`prune_housekeeping`, which pg_cron also runs each night). Accounts'
   * farms are never removed for being quiet. `before` is not used.
   */
  async prune(): Promise<number> {
    return this.guard(async () => {
      const count = async (): Promise<number> =>
        (
          await this.sql.query<{ n: number }>(
            'select count(*)::int as n from public.farms where guest_session_id is not null',
          )
        ).rows[0]!.n;
      const before = await count();
      await this.sql.query('select public.prune_housekeeping($1::timestamptz)', [
        new Date(this.clock()).toISOString(),
      ]);
      return before - (await count());
    });
  }

  async list(owner: Owner): Promise<FarmListItem[]> {
    return this.guard(async () => {
      const where =
        owner.kind === 'user'
          ? 'f.owner_id = $1'
          : 'f.guest_session_id = (select id from public.guest_sessions where token_hash = $1)';
      const r = await this.sql.query<{
        id: string;
        name: string;
        district: string;
        current_day: number;
        ms: string;
      }>(
        `select f.id, f.name, f.district, f.current_day,
                (extract(epoch from f.last_opened_at) * 1000)::bigint::text as ms
           from public.farms f
          where ${where}
          order by f.last_opened_at desc, f.created_at desc`,
        [owner.kind === 'user' ? owner.id : sessionHash(owner.session)],
      );
      return r.rows.map((f) => ({
        id: fromUuid(f.id),
        name: f.name,
        districtName: f.district,
        day: f.current_day,
        lastPlayed: Number(f.ms),
        current: false,
      }));
    });
  }

  async ownerOf(farmId: string): Promise<Owner | null> {
    return this.guard(async () => {
      const r = await this.sql.query<{ owner_id: string | null; token_hash: string | null }>(
        `select f.owner_id, g.token_hash
           from public.farms f left join public.guest_sessions g on g.id = f.guest_session_id
          where f.id = $1`,
        [toUuid(farmId)],
      );
      const row = r.rows[0];
      if (!row) return null;
      // A guest's secret is not kept, only its hash. The hash stands in as `session`.
      return row.owner_id
        ? { kind: 'user', id: row.owner_id }
        : { kind: 'guest', session: row.token_hash ?? '' };
    });
  }

  async past(farmId: string, day: number): Promise<PastDayWire | null> {
    if (!Number.isInteger(day) || day < 0) return null;
    return this.guard(async () => {
      const r = await this.sql.query<{ view_gz: Uint8Array }>(
        'select view_gz from public.farm_snapshot_views where farm_id = $1 and day = $2',
        [toUuid(farmId), day],
      );
      const row = r.rows[0];
      return row ? (JSON.parse(gunzipSync(row.view_gz).toString('utf8')) as PastDayWire) : null;
    });
  }

  async pastDays(farmId: string): Promise<number[]> {
    return this.guard(async () => {
      const r = await this.sql.query<{ day: number }>(
        `select s.day from public.farm_snapshots s
           join public.farm_snapshot_views v on v.farm_id = s.farm_id and v.day = s.day
          where s.farm_id = $1 order by s.day desc`,
        [toUuid(farmId)],
      );
      return r.rows.map((x) => x.day);
    });
  }
}
