import { enterChallenge } from '@/server/community/groups';
import { CommunityError, communityRoute } from '@/server/community/route';
import { FARM_COOKIE } from '@/server/player';
import { cookieText } from '@/server/security';

export const dynamic = 'force-dynamic';

/**
 * Enter a challenge (PRD 9.6, 11.6): a farm is started for it with its settings and its fixed seed,
 * and opened as the player's current farm. The seed never leaves the server. One entry each.
 */
export const POST = communityRoute({ name: 'challenge', max: 6 }, async (ctx) => {
  if (ctx.body.action !== 'enter') throw new CommunityError(400, 'That was not sent properly.');
  const { farmId } = await enterChallenge(ctx.deps, ctx.run, ctx.me.userId, ctx.body.challengeId);
  const res = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  res.headers.append(
    'Set-Cookie',
    cookieText(ctx.req, FARM_COOKIE, farmId, 0).replace('; Max-Age=0', ''),
  );
  return res;
});
