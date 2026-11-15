import 'server-only';
import { DISTRICTS, MODES, PADDOCK_LABELS, type DistrictId, type ModeId } from '@gg/shared';
import type { AuthDeps } from '../auth/accounts';
import type { SqlRunner } from '../db/sql';
import { gameServer } from '../game/game';
import { logFailure } from '../logging';
import { isUuid } from './data';
import type { Snapshot } from '@/lib/game/types';

/**
 * Look at someone's farm, read-only (PRD 9.5).
 *
 * The page gets a small plain view built from the SAME snapshot the owner's own screen gets, with
 * only what PRD 9.5 lists. It never carries the save, the version, the inbox, jobs, money beyond
 * net worth, or any id a page does not need. The browser gets words and numbers to show, never
 * rules.
 *
 * Whether a viewer may look is asked of the database (`app.can_view_farm_for`), on the server's
 * connection with the viewer named, plus that the owner is still a community member. Every "no"
 * is the same: `null`, which the page turns into the plain not found.
 */

export interface FarmViewMob {
  name: string;
  head: number;
  classes: { label: string; head: number }[];
}

export interface FarmViewPaddock {
  name: string;
  ha: number;
  label: string;
  massKgHa: number;
  mobs: FarmViewMob[];
}

export interface FarmViewData {
  name: string;
  district: string;
  mode: string;
  day: number;
  date: string;
  season: string;
  head: number;
  massKgHa: number;
  aePerHa: number | null;
  coverPct: number;
  netWorth: number;
  /** The latest year's score so far. A stand-in until the real Grazier Score is built. */
  score: { year: number; total: number };
  paddocks: FarmViewPaddock[];
  /** The owner's username, for the heading and the way back. */
  owner: string;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Build the plain view from the owner's snapshot. Exported so a test can check what it keeps. */
export function farmViewOf(
  snap: Snapshot,
  mode: ModeId,
  owner: string,
  name: string,
): FarmViewData {
  const mobsById = new Map(snap.mobs.map((m) => [m.id, m]));
  const farmHa = snap.farm.setup.farmHa;
  return {
    name,
    district: DISTRICTS[snap.farm.district as DistrictId]?.name ?? '',
    mode: MODES[mode].name,
    day: snap.day,
    date: `${snap.date.date} ${MONTHS[snap.date.month] ?? ''} ${snap.date.year}`,
    season: snap.season,
    head: snap.totals.head,
    massKgHa: Math.round(snap.totals.massKgHa),
    aePerHa: farmHa > 0 ? Math.round((snap.totals.ae / farmHa) * 10) / 10 : null,
    coverPct: Math.round(snap.totals.coverPct),
    netWorth: Math.round(snap.totals.netWorth),
    score: { year: snap.score.year, total: Math.round(snap.score.total) },
    // Paddock and mob names are made by the engine from fixed patterns ("Paddock 3", "Mob 2").
    // Players can not name them, so they need no word filter (farmviewnames.test.ts).
    paddocks: snap.paddocks.map((p) => ({
      name: p.name,
      ha: p.ha,
      label: PADDOCK_LABELS[p.label].name,
      massKgHa: Math.round(p.massKgHa),
      mobs: p.mobs.flatMap((id) => {
        const m = mobsById.get(id);
        return m
          ? [
              {
                name: m.name,
                head: m.head,
                classes: m.classes.map((c) => ({ label: c.label, head: c.head })),
              },
            ]
          : [];
      }),
    })),
    owner,
  };
}

/** May this viewer look at this farm? One answer for every refusal. */
async function mayLook(deps: AuthDeps, viewer: string, farmId: string) {
  const r = await deps.sql.query<{
    ok: boolean;
    mode: ModeId;
    owner: string | null;
    owner_member: boolean;
  }>(
    `select app.can_view_farm_for($1, f.id) as ok, f.mode, p.username as owner,
            coalesce(app.member_raw(f.owner_id), false) as owner_member
       from public.farms f
       left join public.profiles p on p.user_id = f.owner_id
      where f.id = $2`,
    [viewer, farmId],
  );
  const row = r.rows[0];
  if (!row || !row.ok || !row.owner_member || !row.owner) return null;
  return { mode: row.mode, owner: row.owner };
}

/**
 * The owner's farms this member may look at, for the "Their farm today" link. `tx` runs AS the
 * member, so the database's own `public_farms` view decides (Daily Farms only, the switch, the
 * owner's setting, blocks). It never lists the member's own farm.
 */
export async function farmsToView(tx: SqlRunner, owner: string): Promise<{ id: string }[]> {
  const r = await tx.query<{ farm_id: string }>(
    `select farm_id from public.public_farms where owner_id = $1 order by started_at desc limit 3`,
    [owner],
  );
  return r.rows.map((row) => ({ id: row.farm_id }));
}

/** The view for a farm, or null: not allowed, not there, can not be opened. All look the same. */
export async function loadFarmView(
  deps: AuthDeps,
  viewer: string,
  farmId: string,
): Promise<FarmViewData | null> {
  if (!isUuid(farmId)) return null;
  try {
    const may = await mayLook(deps, viewer, farmId);
    if (!may) return null;
    // Read without marking the owner's farm opened (m6 join).
    const snap = await gameServer().viewSnapshot(farmId.replace(/-/g, ''));
    if (!snap) return null;
    // The farm's name is free text the player chose. Read it through the word filter.
    const hit = await deps.sql.query<{ hit: boolean }>('select app.blocked_word_in($1) as hit', [
      snap.farm.name,
    ]);
    const name = hit.rows[0]?.hit ? 'A farm' : snap.farm.name;
    return farmViewOf(snap, may.mode, may.owner, name);
  } catch (e) {
    logFailure({ route: 'community-farm-view', reason: 'farm_view_failed' }, e);
    return null;
  }
}
