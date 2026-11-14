import { searchPeople, searchTerm } from '@/server/community/data';
import { communityRoute } from '@/server/community/route';

export const dynamic = 'force-dynamic';

/** Find members by the start of a username (2 to 20 letters). Respects blocks, privacy and the under-16 rule. */
export const GET = communityRoute({ name: 'search', max: 30, method: 'GET' }, async (ctx) => {
  const term = searchTerm(ctx.url.searchParams.get('q'));
  if (!term) return { people: [] };
  return { people: await searchPeople(ctx.deps.sql, ctx.me.userId, term) };
});
