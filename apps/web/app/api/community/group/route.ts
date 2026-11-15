import { groupAction } from '@/server/community/groups';
import { communityRoute } from '@/server/community/route';

export const dynamic = 'force-dynamic';

/**
 * Groups (PRD 9.6): create, join by invite code or (a public group) by id, leave, and the owner's
 * tools: remove a member, hand over, change, delete, set a group challenge. Behind the Groups
 * switch. Each change runs as the player, so the database's rules decide.
 */
export const POST = communityRoute({ name: 'group', max: 30, part: 'groups' }, (ctx) =>
  groupAction(ctx.deps, ctx.run, ctx.me.userId, ctx.body),
);
