import { accountOf } from '@/server/auth/accounts';
import { NOT_SET_UP, authRoute, redirect } from '@/server/auth/route';
import { GameError } from '@/server/game/game';
import { safeNext } from '@/server/security';

export const dynamic = 'force-dynamic';

/**
 * Where a sign-in link or Google brings the player back. The one-use code becomes a session
 * (the cookie is set here, HttpOnly). A link that is wrong, used already, expired or opened
 * in a different browser from the one that asked all end the same way: back to the sign-in
 * page with one plain line. Where the player goes next is only ever a page on the allow-list
 * (`safeNext`), never an address from the link.
 */
export const GET = authRoute({ name: 'callback', max: 30 }, async (ctx) => {
  if (!ctx.deps) throw new GameError(503, NOT_SET_UP);
  const params = new URL(ctx.req.url).searchParams;
  const next = safeNext(params.get('next'));
  const code = params.get('code');
  if (params.get('error') || !code || code.length > 512) {
    return redirect(ctx, '/sign-in?problem=link');
  }
  let user = null;
  try {
    user = await ctx.deps.provider.exchange(ctx.jar, code);
  } catch {
    console.error('code_exchange_failed');
  }
  if (!user || user.anonymous) return redirect(ctx, '/sign-in?problem=link');
  const account = await accountOf(ctx.deps, user);
  if (!account.profile) {
    return redirect(ctx, `/sign-up/finish?next=${encodeURIComponent(next)}`);
  }
  return redirect(ctx, next);
});
