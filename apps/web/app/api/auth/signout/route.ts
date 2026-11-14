import { NOT_SET_UP, authRoute } from '@/server/auth/route';
import { GameError } from '@/server/game/game';
import { readJson } from '@/server/game/http';
import { FARM_COOKIE } from '@/server/player';
import { clearCookieText } from '@/server/security';

export const dynamic = 'force-dynamic';

/**
 * Sign out: this device (`everywhere` left out or false) or every device the account is signed
 * in on. The sign-in cookies are removed, and so is the choice of open farm. The page then
 * clears this browser's offline copy of the farm.
 */
export const POST = authRoute({ name: 'signout', max: 20, write: true }, async (ctx) => {
  if (!ctx.deps) throw new GameError(503, NOT_SET_UP);
  const body = (await readJson(ctx.req, 512)) as { everywhere?: unknown } | null;
  try {
    await ctx.deps.provider.signOut(ctx.jar, body?.everywhere === true ? 'global' : 'local');
  } catch (e) {
    // Signing out of this device must always work, even if the auth server can not be reached.
    console.error('Signing out failed at the provider:', e instanceof Error ? e.message : e);
    if (body?.everywhere === true) {
      throw new GameError(503, 'Could not sign you out everywhere just now. Try again in a moment.');
    }
    await ctx.deps.provider.signOut(ctx.jar, 'local').catch(() => undefined);
  }
  ctx.setCookies.push(clearCookieText(ctx.req, FARM_COOKIE));
  return { ok: true };
});
