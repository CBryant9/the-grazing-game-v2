import { accountOf, deleteAccount } from '@/server/auth/accounts';
import { authRoute, requireUser } from '@/server/auth/route';
import { GameError } from '@/server/game/game';
import { readJson } from '@/server/game/http';
import { FARM_COOKIE } from '@/server/player';
import { clearCookieText } from '@/server/security';

export const dynamic = 'force-dynamic';

/**
 * Delete my account. The player types their username to confirm (`{ confirm }`). It removes the
 * account and everything DATABASE.md says goes with it, and can not be undone. If a step fails the
 * account is still there and the player is told, so they can try again.
 */
export const POST = authRoute(
  { name: 'delete', max: 5, windowMs: 600_000, write: true },
  async (ctx) => {
    const { deps, user } = await requireUser(ctx);
    const body = (await readJson(ctx.req, 512)) as { confirm?: unknown } | null;
    const account = await accountOf(deps, user);
    const name = account.profile?.username ?? null;
    if (!name || typeof body?.confirm !== 'string' || body.confirm.trim() !== name) {
      throw new GameError(400, 'Type your username exactly as it is shown to delete your account.');
    }
    try {
      await deleteAccount(deps, user);
    } catch (e) {
      console.error('Deleting an account failed:', e instanceof Error ? e.message : e);
      throw new GameError(
        503,
        'Your account could not be deleted just now, and nothing was deleted. Try again in a moment.',
      );
    }
    await deps.provider.signOut(ctx.jar, 'local').catch(() => undefined);
    ctx.setCookies.push(clearCookieText(ctx.req, FARM_COOKIE));
    return { ok: true };
  },
);
