import { usernameFree } from '@/server/auth/accounts';
import { NOT_SET_UP, authRoute } from '@/server/auth/route';
import { GameError } from '@/server/game/game';
import { allow, readJson } from '@/server/game/http';

export const dynamic = 'force-dynamic';

/**
 * The live "is this username free?" check on the sign-up page. The answer is only `free`,
 * true or false: a name that is taken, a name the word filter refuses and a name in the
 * wrong form all say false, so the reply never says whose a name is or why. Only a signed-in
 * player may ask (so it can not be run over a list of names from outside), and each player
 * may ask a limited number of times.
 */
export const POST = authRoute(
  { name: 'username', max: 40, write: true, by: 'session' },
  async (ctx) => {
    if (!ctx.deps) throw new GameError(503, NOT_SET_UP);
    const user = await ctx.deps.provider.session(ctx.jar).catch(() => null);
    if (!user || user.anonymous) throw new GameError(401, 'Sign in first.');
    if (!allow(`auth-username-user:${user.id}`, 30, 60_000)) {
      throw new GameError(429, 'That was a lot of tries. Wait a minute and try again.');
    }
    const body = (await readJson(ctx.req, 512)) as { name?: unknown } | null;
    const name = typeof body?.name === 'string' ? body.name : '';
    return { free: await usernameFree(ctx.deps, name) };
  },
);
