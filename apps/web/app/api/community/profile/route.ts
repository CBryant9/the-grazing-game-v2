import { communityRoute } from '@/server/community/route';
import { updateProfile } from '@/server/community/write';

export const dynamic = 'force-dynamic';

/** Change the signed-in player's own profile, privacy settings, links, jobs and courses. Own row only: the id is the session's. */
export const POST = communityRoute(
  { name: 'profile', max: 20, bodyLimit: 24 * 1024 },
  async (ctx) => {
    await updateProfile(ctx.deps, ctx.run, ctx.me.userId, ctx.body);
    return { ok: true };
  },
);
