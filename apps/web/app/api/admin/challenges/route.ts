import { challengeAction } from '@/server/admin/challenges';
import { adminRoute } from '@/server/admin/route';

export const dynamic = 'force-dynamic';

/** Make or end a public challenge or league, or give an ownerless group an owner (PRD 11.6). Audited. */
export const POST = adminRoute({ name: 'challenges', max: 30, bodyLimit: 4096 }, (ctx) =>
  challengeAction(ctx.deps.sql, ctx.admin.userId, ctx.body),
);
