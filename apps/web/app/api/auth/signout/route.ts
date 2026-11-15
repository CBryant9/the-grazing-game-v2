import { logFailure } from '@/server/logging';
import { NOT_SET_UP, authRoute } from '@/server/auth/route';
import { GameError } from '@/server/game/game';
import { SESSION_COOKIE, readJson } from '@/server/game/http';
import { removeAllDevices } from '@/server/notify/store';
import { FARM_COOKIE } from '@/server/player';
import { clearCookieText } from '@/server/security';

export const dynamic = 'force-dynamic';

/**
 * Sign out: this device (`everywhere` left out or false) or every device the account is signed
 * in on. The sign-in cookies are removed, and so is the choice of open farm. The page then
 * clears this browser's offline copy of the farm.
 */
export const POST = authRoute(
  { name: 'signout', max: 20, write: true, by: 'session' },
  async (ctx) => {
    if (!ctx.deps) throw new GameError(404, NOT_SET_UP);
    const body = (await readJson(ctx.req, 512)) as { everywhere?: unknown } | null;
    // Signing out everywhere also forgets every device this account had for notifications.
    if (body?.everywhere === true) {
      const who = await ctx.deps.provider.session(ctx.jar).catch(() => null);
      if (who && !who.anonymous) {
        await removeAllDevices(ctx.deps.sql, who.id).catch((e) =>
          logFailure({ route: 'auth-signout', reason: 'devices_not_cleared' }, e),
        );
      }
    }
    try {
      await ctx.deps.provider.signOut(ctx.jar, body?.everywhere === true ? 'global' : 'local');
    } catch (e) {
      // Signing out of this device must always work, even if the auth server can not be reached.
      logFailure({ route: 'auth-signout', reason: 'sign_out_failed' }, e);
      if (body?.everywhere === true) {
        throw new GameError(
          503,
          'Could not sign you out everywhere just now. Try again in a moment.',
        );
      }
      await ctx.deps.provider.signOut(ctx.jar, 'local').catch(() => undefined);
    }
    // On a shared device the next person must not get the earlier guest farm either.
    ctx.setCookies.push(clearCookieText(ctx.req, FARM_COOKIE));
    ctx.setCookies.push(clearCookieText(ctx.req, SESSION_COOKIE));
    return { ok: true };
  },
);
