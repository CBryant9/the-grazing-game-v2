import 'server-only';
import { randomBytes } from 'node:crypto';
import { authDeps } from './auth/deps';
import type { AuthUser } from './auth/provider';
import { farmKey, gameServer, isSessionId } from './game/game';
import type { Owner } from './game/store';

/** The cookie naming which of an account's farms is open. A browser-session cookie: it ends when the browser closes. */
export const FARM_COOKIE = 'gg_farm';
const FARM_ID = /^[0-9a-f]{32}$/;

export interface Player {
  /** Signed in with a real (not anonymous) session, or null. */
  user: AuthUser | null;
  /** The farm key for the game server, or null when there is no farm to open. */
  key: string | null;
  /** The farm id (32 hex) when this is an account's farm. */
  farmId: string | null;
  /** More than one farm and none chosen: the picker comes first. */
  mustPick: boolean;
  /** Signed in and sign-up finished (a profile exists): the account plays account farms. Anyone else plays as a guest. */
  signedUp: boolean;
  /** How many farms the account has (0 for a guest). */
  farmCount: number;
  /** The guest session cookie value, if any. */
  guestSession: string | null;
}

/**
 * Work out who is asking and which farm is theirs. A signed-in account with
 * farms plays its own farm (the one the `gg_farm` cookie names, once checked
 * to be theirs, else the only one). An account with none (a new sign-up, a
 * guest's farm not moved yet) falls back to its guest session. Everything else
 * is a guest: today's behaviour.
 */
export async function identify(
  req: Request,
  jar: { getAll(): { name: string; value: string }[] },
  guestSession: string | null,
): Promise<Player> {
  const guest: Player = {
    user: null,
    key: guestSession,
    farmId: null,
    mustPick: false,
    signedUp: false,
    farmCount: 0,
    guestSession,
  };
  const deps = authDeps();
  if (!deps) return guest;
  const user = await deps.provider.session(jar as never).catch(() => null);
  if (!user || user.anonymous) return guest;
  const game = gameServer();
  const farms = await game.farms({ kind: 'user', id: user.id }, null);
  const chosen = jar.getAll().find((c) => c.name === FARM_COOKIE)?.value;
  const mine = chosen && FARM_ID.test(chosen) ? farms.find((f) => f.id === chosen) : undefined;
  if (mine) {
    return {
      user,
      key: farmKey(mine.id),
      farmId: mine.id,
      mustPick: false,
      signedUp: true,
      farmCount: farms.length,
      guestSession,
    };
  }
  if (farms.length === 1) {
    const only = farms[0]!;
    return {
      user,
      key: farmKey(only.id),
      farmId: only.id,
      mustPick: false,
      signedUp: true,
      farmCount: 1,
      guestSession,
    };
  }
  if (farms.length > 1) {
    return {
      user,
      key: null,
      farmId: null,
      mustPick: true,
      signedUp: true,
      farmCount: farms.length,
      guestSession,
    };
  }
  // No farms yet: a finished account starts one of its own; one that never finished (abandoned, or
  // refused as under 14) is a guest until it does.
  const profile = await deps.sql
    .query('select 1 from public.profiles where user_id = $1', [user.id])
    .catch(() => null);
  return { ...guest, user, signedUp: (profile?.rowCount ?? 0) > 0 };
}

/** A new farm id for an account's farm, and its key. */
export function newFarm(): { id: string; key: string } {
  const id = randomBytes(16).toString('hex');
  return { id, key: farmKey(id) };
}

/** The owner a new farm belongs to: the account if there is a signed-in one that finished sign-up, else the guest session. */
export function ownerFor(player: Player, signedUpUser: boolean): Owner | null {
  if (player.user && signedUpUser) return { kind: 'user', id: player.user.id };
  return player.guestSession && isSessionId(player.guestSession)
    ? { kind: 'guest', session: player.guestSession }
    : null;
}
