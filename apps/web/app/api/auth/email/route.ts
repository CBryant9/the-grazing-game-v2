import { logFailure } from '@/server/logging';
import { normaliseEmail } from '@/server/auth/email';
import { NOT_SET_UP, authRoute } from '@/server/auth/route';
import { GameError } from '@/server/game/game';
import { allow, readJson } from '@/server/game/http';
import { safeNext } from '@/server/security';
import { createHash } from 'node:crypto';
import { SENT_WORDS } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

/** The same words whether or not the address has an account, so the reply tells no one who has one. */
const SENT = SENT_WORDS;

/**
 * Send a sign-in link. The reply is the same for every address that looks like one: the
 * work done is the same too (one call to the provider, its failure kept in the log), so
 * neither the words nor the wait say whether an account exists. Limits: a few links an
 * hour for one address, and a few a minute from one place.
 */
export const POST = authRoute({ name: 'email', max: 10, write: true }, async (ctx) => {
  if (!ctx.deps) throw new GameError(404, NOT_SET_UP);
  const body = (await readJson(ctx.req, 2048)) as { email?: unknown; next?: unknown } | null;
  const email = typeof body?.email === 'string' ? normaliseEmail(body.email) : null;
  if (!email || email.length > 254) {
    throw new GameError(400, 'That does not look like an email address. Check it and try again.');
  }
  // The limit is on a hash of the address, so the list of addresses is not kept in memory.
  const key = createHash('sha256').update(email).digest('hex').slice(0, 24);
  if (!allow(`auth-link:${key}`, 3, 3600_000)) {
    // Same answer: asking again does nothing more, and it says nothing about the address.
    return { ok: true, message: SENT };
  }
  const redirectTo = `${ctx.origin}/auth/callback?next=${encodeURIComponent(safeNext(body?.next))}`;
  try {
    // Send to the address as typed, not the normalised one: the player's own spelling gets the mail.
    await ctx.deps.provider.sendLink(ctx.jar, (body!.email as string).trim(), redirectTo);
  } catch (e) {
    // Never the provider's message: it can carry the address. Class and code only.
    logFailure({ route: 'auth-email', reason: 'send_link_failed' }, e);
  }
  return { ok: true, message: SENT };
});
