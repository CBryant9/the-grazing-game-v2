import { notifyRoute } from '@/server/notify/route';
import { readInbox } from '@/server/notify/store';

export const dynamic = 'force-dynamic';

/** The account inbox, newest first, a page at a time. `?before=` carries the marker from the last page. */
export const GET = notifyRoute({ name: 'inbox', max: 60 }, async ({ ctx, user, nd }) => {
  const before = new URL(ctx.req.url).searchParams.get('before');
  return readInbox(nd.sql, user.id, before);
});
