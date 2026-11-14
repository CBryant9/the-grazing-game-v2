import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { CommunityPart, Gate, Member } from './gate';
import { communityGate } from './gate';
import type { AuthDeps } from '../auth/accounts';
import { readOnlyJar } from '../admin/gate';

/**
 * The gate for community pages. Every page under `app/community` calls `requireMember()` itself,
 * first, and so does the layout (a layout does not run again when a visitor moves between pages,
 * and a page can render beside its layout, so neither is trusted to have checked for the other).
 *
 * A member gets who they are and the database connection. Everyone else (a visitor, an account
 * under 16, a banned or suspended one, a copy with no database, the switch off) gets the site's
 * plain "not found" page with status 404, all the same. A page can not set cookies, so an
 * expired sign-in is not refreshed here: the game page refreshes it.
 */
const gateFor = cache(async (part: CommunityPart | 'none'): Promise<Gate> => {
  const jar = await cookies();
  return communityGate(
    readOnlyJar(() => jar.getAll().map((c) => ({ name: c.name, value: c.value }))),
    { refresh: false, part: part === 'none' ? undefined : part },
  );
});

export interface MemberPage {
  me: Member;
  deps: AuthDeps;
}

export async function requireMember(part?: CommunityPart): Promise<MemberPage> {
  const g = await gateFor(part ?? 'none');
  if (g.kind !== 'ok') notFound();
  return { me: g.me, deps: g.deps };
}
