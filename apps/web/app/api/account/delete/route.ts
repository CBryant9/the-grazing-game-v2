import { logFailure } from '@/server/logging';
import { accountOf, deleteAccount } from '@/server/auth/accounts';
import { authRoute, requireUser } from '@/server/auth/route';
import { GameError } from '@/server/game/game';
import { SESSION_COOKIE, readJson } from '@/server/game/http';
import { FARM_COOKIE } from '@/server/player';
import { clearCookieText } from '@/server/security';

export const dynamic = 'force-dynamic';

/**
 * Delete my account. The player types their username to confirm (`{ confirm }`). It removes the
 * account and everything DATABASE.md says goes with it, and can not be undone. If a step fails the
 * account is still there and the player is told, so they can try again. A sign-in that never
 * finished sign-up (abandoned, or refused as under 14) has no username: it types the word
 * `delete`, and its sign-in is removed (the refusal record goes with it, as DATABASE.md says: it
 * belongs to the sign-in).
 */
export const POST = authRoute(
  { name: 'delete', max: 5, windowMs: 600_000, by: 'session', write: true },
  async (ctx) => {
    const { deps, user } = await requireUser(ctx);
    const body = (await readJson(ctx.req, 512)) as { confirm?: unknown } | null;
    const account = await accountOf(deps, user);
    const name = account.profile?.username ?? null;
    const typed = typeof body?.confirm === 'string' ? body.confirm.trim() : '';
    if (name ? typed !== name : typed.toLowerCase() !== 'delete') {
      throw new GameError(
        400,
        name
          ? 'Type your username exactly as it is shown to delete your account.'
          : 'Type the word delete to delete this sign-in.',
      );
    }
    try {
      await deleteAccount(deps, user);
    } catch (e) {
      logFailure({ route: 'account-delete', reason: 'delete_account_failed' }, e);
      throw new GameError(
        503,
        'Your account could not be deleted just now, and nothing was deleted. Try again in a moment.',
      );
    }
    await deps.provider.signOut(ctx.jar, 'local').catch(() => undefined);
    ctx.setCookies.push(clearCookieText(ctx.req, FARM_COOKIE));
    // The guest session goes too: on a shared device the next person must not get the earlier guest farm.
    ctx.setCookies.push(clearCookieText(ctx.req, SESSION_COOKIE));
    return { ok: true };
  },
);
