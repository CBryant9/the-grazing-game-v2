import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { AuthDeps } from '../auth/accounts';
import { authDeps } from '../auth/deps';
import { adminGate, readOnlyJar, type AdminSession, type GateResult } from './gate';

/**
 * The gate for admin pages. Every page under `app/admin` calls `requireAdmin()` itself, first,
 * and so does the layout: a layout does not run again when a visitor moves between pages, and a
 * page can render beside its layout, so neither is trusted to have checked for the other.
 *
 * - An admin in good standing: the admin and the database connection.
 * - Anyone else: the site's plain "not found" page (status 404), the same for a signed-out
 *   visitor, a player, an account refused as under 16 for the community, and a suspended admin.
 * - No accounts on this copy: `null`. The caller shows "Admin needs accounts to be set up".
 *
 * A page can not set cookies, so a sign-in token that has run out is not refreshed here. The
 * game page and `/api/auth/me` refresh it; an admin whose token went stale opens the game once.
 */
const gate = cache(async (): Promise<GateResult> => {
  const jar = await cookies();
  return adminGate(readOnlyJar(() => jar.getAll().map((c) => ({ name: c.name, value: c.value }))));
});

export interface AdminPage {
  admin: AdminSession;
  deps: AuthDeps;
}

export async function requireAdmin(): Promise<AdminPage | null> {
  const g = await gate();
  if (g.kind === 'off') return null;
  const deps = authDeps();
  if (g.kind !== 'ok' || !deps) notFound();
  return { admin: g.admin, deps };
}
