import 'server-only';
import { DISTRICTS, MODES, type DistrictId, type ModeId } from '@gg/shared';
import { asUser, type AuthDeps } from '../auth/accounts';
import type { SqlRunner } from '../db/sql';
import { farmKey, gameServer } from '../game/game';
import type { Snapshot } from '@/lib/game/types';
import type { Card } from './data';
import { CommunityError } from './errors';
import { field } from './text';
import { wordsRefused } from './write';

/**
 * Share my farm posts and day cards (PRD 9.2, 9.3).
 *
 * A card is made on the server and stored as plain facts (labels and words), fixed at the moment it
 * is posted. It is not a link to the save: the post never reads the farm again, so a farm that
 * changes tomorrow does not change the post, and the post can not be used to read the save. A card
 * only ever holds what the farm screen already shows a player (the day, the date, the season, head
 * of cattle, average pasture, ground cover, net worth) or a line from the player's own diary.
 * It states what is, and never praises or criticises. No rule, formula or data table goes into it.
 *
 * Players can not insert these posts themselves (the database lets a player write only plain
 * posts). The server inserts them with the owner as author, after checking the farm is the
 * player's own, and counts the same `post` rate limit.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const num = (n: number, digits = 0): string =>
  n.toLocaleString('en-AU', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Build the card for Share my farm from a farm snapshot (the same one the farm screen shows). */
export function farmCard(snap: Snapshot, mode: ModeId): Card {
  const d = snap.date;
  const district = DISTRICTS[snap.farm.district as DistrictId]?.name ?? '';
  const t = snap.totals;
  const facts: Card['facts'] = [
    { label: 'Farm', value: [district, MODES[mode].name].filter(Boolean).join(', ') },
    { label: 'Date', value: `${d.date} ${MONTHS[d.month] ?? ''} ${d.year}` },
    { label: 'Season', value: snap.season },
    { label: 'Head', value: num(t.head) },
    { label: 'Pasture', value: `${num(t.massKgHa)} kg DM/ha` },
    { label: 'Ground cover', value: `${num(t.coverPct)}%` },
    { label: 'Net worth', value: `$${num(t.netWorth)}` },
  ];
  return { v: 1, kind: 'farm', title: `${snap.farm.name}, Day ${snap.day}`, facts };
}

export async function shareFarm(
  deps: AuthDeps,
  me: string,
  b: Record<string, unknown>,
): Promise<{ id: string }> {
  const farmId = typeof b.farmId === 'string' && /^[0-9a-f-]{36}$/.test(b.farmId) ? b.farmId : null;
  if (!farmId) throw new CommunityError(400, 'Choose a farm to share.');
  const body = field(b.body, 'note', 500, { multiline: true });
  const visibility = b.visibility === 'followers' ? 'followers' : 'public';
  // The player's own rows only: the database says whose farm it is.
  const farm = await asUser(deps.sql, me, async (tx) => {
    const r = await tx.query<{ id: string; mode: ModeId; current_day: number; privacy: string }>(
      `select f.id, f.mode, f.current_day, p.privacy_profile as privacy
         from public.farms f join public.profiles p on p.user_id = f.owner_id
        where f.id = $1 and f.owner_id = app.uid()`,
      [farmId],
    );
    return r.rows[0] ?? null;
  });
  if (!farm) throw new CommunityError(404, 'That farm was not found.');
  // A private profile's posts are seen by nobody else (PRD 9.1), so a share would reach no one.
  if (farm.privacy === 'private') {
    throw new CommunityError(
      409,
      'Your profile is private, so nobody else would see this. Change who can see your profile to share your farm.',
      'private',
    );
  }
  // The game server names a farm by its id without dashes.
  const snap = await gameServer().snapshot(farmKey(farm.id.replace(/-/g, '')));
  if (!snap)
    throw new CommunityError(409, 'That farm can not be opened right now. Try again in a moment.');
  // The farm's name goes on the card, which the database's word filter does not read. Check it here.
  await wordsRefused(deps.sql, [snap.farm.name]);
  const card = farmCard(snap, farm.mode);
  return deps.sql.transaction(async (tx) => {
    const ok = await tx.query<{ ok: boolean }>(`select app.take_rate('post', $1) as ok`, [me]);
    if (!ok.rows[0]?.ok) {
      throw new CommunityError(
        429,
        'That was a lot in a short time. Wait a little and try again.',
        'rate_limited',
      );
    }
    const r = await tx.query<{ id: string }>(
      `insert into public.posts (author_id, kind, body, farm_id, farm_day, card, visibility)
       values ($1, 'share_farm', $2, $3, $4, $5::jsonb, $6) returning id`,
      [me, body, farm.id, snap.day, JSON.stringify(card), visibility],
    );
    return { id: r.rows[0]!.id };
  });
}

/**
 * One day card for one Daily Farm day (PRD 9.3): the day's diary lines as facts, made by the server
 * at the farm's rollover (m6 join: the night calls the Stage 4 hooks, which call this). Fast Farms make none. A card
 * is made only for an owner who is a community member (16 or over, in good standing) with a profile
 * that is not private, once per farm and day, and only when the diary has something to say. Followers
 * see it in Friends' days; a public profile's day card is public.
 */
export async function makeDayCard(
  sql: SqlRunner,
  farmId: string,
  day: number,
): Promise<{ id: string } | null> {
  const f = await sql.query<{
    owner_id: string;
    privacy: 'public' | 'followers' | 'private';
  }>(
    `select f.owner_id, p.privacy_profile as privacy
       from public.farms f
       join public.profiles p on p.user_id = f.owner_id
      where f.id = $1 and f.mode = 'daily' and app.member_raw(f.owner_id)`,
    [farmId],
  );
  const farm = f.rows[0];
  if (!farm || farm.privacy === 'private') return null;
  const d = await sql.query<{
    game_date: string;
    lines: string[];
    more: number;
    rain_mm: string | null;
  }>(
    `select to_char(game_date, 'YYYY-MM-DD') as game_date, lines, more, rain_mm
       from public.farm_days where farm_id = $1 and day = $2`,
    [farmId, day],
  );
  const row = d.rows[0];
  if (!row || row.lines.length === 0) return null;
  const exists = await sql.query(
    `select 1 from public.posts where farm_id = $1 and farm_day = $2 and kind = 'day_card'`,
    [farmId, day],
  );
  if (exists.rowCount > 0) return null;
  const [y, m, dd] = row.game_date.split('-').map(Number);
  const facts: Card['facts'] = [{ label: 'Date', value: `${dd} ${MONTHS[(m ?? 1) - 1]} ${y}` }];
  for (const line of row.lines.slice(0, 8)) facts.push({ label: null, value: line.slice(0, 200) });
  if (row.more > 0) facts.push({ label: null, value: `and ${row.more} more` });
  if (row.rain_mm !== null && Number(row.rain_mm) > 0) {
    facts.push({ label: 'Rain', value: `${num(Number(row.rain_mm), 1)} mm` });
  }
  const card: Card = { v: 1, kind: 'day', title: `Day ${day}`, facts };
  const r = await sql.query<{ id: string }>(
    `insert into public.posts (author_id, kind, body, farm_id, farm_day, card, visibility)
     values ($1, 'day_card', null, $2, $3, $4::jsonb, $5) returning id`,
    [
      farm.owner_id,
      farmId,
      day,
      JSON.stringify(card),
      farm.privacy === 'public' ? 'public' : 'followers',
    ],
  );
  return { id: r.rows[0]!.id };
}
