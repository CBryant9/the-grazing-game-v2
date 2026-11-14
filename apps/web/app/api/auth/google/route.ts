import { NOT_SET_UP, authRoute } from '@/server/auth/route';
import { GameError } from '@/server/game/game';
import { readJson } from '@/server/game/http';
import { safeNext } from '@/server/security';

export const dynamic = 'force-dynamic';

/**
 * Start Google sign-in: answer with the address to go to. It is a POST so it passes the
 * same CSRF rule as every other change, and another site can not start a sign-in for the
 * player. The way back is always this site's own callback, with a page from the allow-list.
 */
export const POST = authRoute({ name: 'google', max: 10, write: true }, async (ctx) => {
  if (!ctx.deps) throw new GameError(503, NOT_SET_UP);
  const body = (await readJson(ctx.req, 2048)) as { next?: unknown } | null;
  const redirectTo = `${ctx.origin}/auth/callback?next=${encodeURIComponent(safeNext(body?.next))}`;
  try {
    return { url: await ctx.deps.provider.googleUrl(ctx.jar, redirectTo) };
  } catch (e) {
    console.error('Starting Google sign-in failed:', e instanceof Error ? e.message : e);
    throw new GameError(503, 'Google sign-in is not working right now. Try the emailed link instead.');
  }
});
